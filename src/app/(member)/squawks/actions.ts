"use server";

import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { aircraft, squawk, squawkPhoto } from "@/db/schema";
import { isUuid } from "@/lib/ids";
import { requireMember } from "@/lib/session";
import {
  checkPhotos,
  PHOTO_TYPES,
  SQUAWK_CATEGORIES,
} from "@/lib/squawk-rules";
import { putObject } from "@/lib/storage";

export type ReportResult = {
  squawkId?: string;
  error?: string;
  fieldErrors?: Partial<Record<string, string[]>>;
};

const squawkSchema = z.object({
  grounds: z
    .enum(["yes", "no"], "Answer whether this grounds the airplane.")
    .transform((answer) => answer === "yes"),
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
    grounds: formData.get("grounds") ?? undefined,
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
