"use server";

import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/db";
import { writeAudit } from "@/db/audit";
import { aircraft, squawk, squawkPhoto } from "@/db/schema";
import { requireMaintainer } from "@/lib/captains";
import type { FormState } from "@/lib/form-state";
import { GROUNDING_LEVELS } from "@/lib/grounding";
import { isUuid } from "@/lib/ids";
import { requireMember } from "@/lib/session";
import {
  allowedChanges,
  checkPhotos,
  PHOTO_TYPES,
  SQUAWK_CATEGORIES,
  type SquawkChange,
} from "@/lib/squawk-rules";
import { putObject } from "@/lib/storage";

export type ReportResult = {
  squawkId?: string;
  error?: string;
  fieldErrors?: Partial<Record<string, string[]>>;
};

const squawkSchema = z.object({
  grounding: z.enum(
    GROUNDING_LEVELS,
    "Answer whether this grounds the airplane.",
  ),
  description: z
    .string()
    .trim()
    .min(1, "Describe the problem.")
    .max(2000, "Keep the description under 2000 characters."),
  category: z.enum(SQUAWK_CATEGORIES).default("other"),
});

// Returns the new squawk's id rather than redirecting, so the form can
// tell a rejected submit from a dropped connection and keep the photos
// either way.
export async function reportSquawk(
  aircraftId: string,
  formData: FormData,
): Promise<ReportResult> {
  const member = await requireMember("pilot");

  const [plane] = isUuid(aircraftId)
    ? await db()
        .select({ id: aircraft.id })
        .from(aircraft)
        .where(and(eq(aircraft.id, aircraftId), eq(aircraft.active, true)))
    : [];
  if (!plane) return { error: "That aircraft isn't in the fleet." };

  const parsed = squawkSchema.safeParse({
    grounding: formData.get("grounding") ?? undefined,
    description: formData.get("description") ?? "",
    category: formData.get("category") ?? undefined,
  });
  const photos = formData
    .getAll("photos")
    .filter((p): p is File => p instanceof File && p.size > 0);
  const photoError = checkPhotos(photos);
  if (!parsed.success || photoError) {
    return {
      fieldErrors: {
        ...(parsed.success ? {} : z.flattenError(parsed.error).fieldErrors),
        ...(photoError ? { photos: [photoError] } : {}),
      },
    };
  }

  // Upload first, then record the squawk: a failed upload then leaves
  // nothing behind but an unreferenced object, never a squawk whose
  // photos are missing.
  const squawkId = randomUUID();
  const uploads = photos.map((file) => {
    const id = randomUUID();
    return {
      id,
      file,
      key: `squawks/${squawkId}/${id}.${PHOTO_TYPES[file.type]}`,
    };
  });
  try {
    await Promise.all(
      uploads.map(async (u) =>
        putObject(
          u.key,
          new Uint8Array(await u.file.arrayBuffer()),
          u.file.type,
        ),
      ),
    );
  } catch (error) {
    console.error("Squawk photo upload failed", error);
    return {
      error:
        "The photos couldn't be saved. Try again, or remove them and report it without photos.",
    };
  }

  await db().transaction(async (tx) => {
    await tx.insert(squawk).values({
      id: squawkId,
      aircraftId,
      reportedById: member.id,
      ...parsed.data,
    });
    if (uploads.length > 0) {
      await tx.insert(squawkPhoto).values(
        uploads.map((u) => ({
          id: u.id,
          squawkId,
          storageKey: u.key,
          contentType: u.file.type,
          sizeBytes: u.file.size,
        })),
      );
    }
  });

  return { squawkId };
}

const changeSchema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("resolve"),
    note: z
      .string()
      .trim()
      .min(1, "Say what was done about it.")
      .max(2000, "Keep the note under 2000 characters."),
  }),
  z.object({ intent: z.literal("defer") }),
  z.object({ intent: z.literal("reopen") }),
]);

const NEXT_STATUS = {
  resolve: "resolved",
  defer: "deferred",
  reopen: "open",
} as const satisfies Record<SquawkChange, string>;

// Resolve, defer or reopen a squawk.  Only officers and the aircraft's
// captains can, and resolving a grounding squawk is the only way to
// unground an aircraft, so every change is audited.
export async function changeSquawk(
  squawkId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireMember();
  if (!isUuid(squawkId)) return { error: "No such squawk." };
  const [target] = await db()
    .select({ aircraftId: squawk.aircraftId })
    .from(squawk)
    .where(eq(squawk.id, squawkId));
  if (!target) return { error: "No such squawk." };
  const actor = await requireMaintainer(target.aircraftId);

  const values = { note: String(formData.get("note") ?? "") };
  const parsed = changeSchema.safeParse({
    intent: formData.get("intent"),
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors, values };
  }
  const change = parsed.data;

  const error = await db().transaction(async (tx) => {
    // Locked so two people acting at once can't both apply a change
    // to the same starting state.
    const [current] = await tx
      .select()
      .from(squawk)
      .where(eq(squawk.id, squawkId))
      .for("update");
    if (!current) return "No such squawk.";
    const restricts = current.grounding !== "none";
    if (
      !allowedChanges({ status: current.status, grounds: restricts }).includes(
        change.intent,
      )
    ) {
      return "Someone else changed this squawk. Review it and try again.";
    }

    const resolution =
      change.intent === "resolve"
        ? {
            resolvedById: actor.id,
            resolvedAt: new Date(),
            resolutionNote: change.note,
          }
        : {};
    const after = { status: NEXT_STATUS[change.intent], ...resolution };
    await tx.update(squawk).set(after).where(eq(squawk.id, squawkId));
    await writeAudit(tx, {
      actorId: actor.id,
      action: `squawk.${change.intent}`,
      entityType: "squawk",
      entityId: squawkId,
      before: { status: current.status },
      after,
    });
    return undefined;
  });
  if (error) return { error, values };

  redirect(`/squawks/${squawkId}?changed=${change.intent}`);
}
