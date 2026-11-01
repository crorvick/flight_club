"use server";

import { and, eq } from "drizzle-orm";
import { forbidden, redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/db";
import { writeAudit } from "@/db/audit";
import { aircraft, aircraftCheckout, pilotQualification } from "@/db/schema";
import { hasRole } from "@/lib/access";
import { changedFields } from "@/lib/audit-diff";
import { type FormState, formValues } from "@/lib/form-state";
import { isUuid } from "@/lib/ids";
import { MEDICAL_CLASSES } from "@/lib/qualifications";
import { requireMember } from "@/lib/session";

const optionalDate = (message: string) =>
  z
    .string()
    .trim()
    .transform((typed) => typed || null)
    .pipe(z.iso.date(message).nullable());

const qualificationsSchema = z.object({
  medicalClass: z
    .string()
    .transform((typed) => typed || null)
    .pipe(z.enum(MEDICAL_CLASSES).nullable()),
  medicalExpiresOn: optionalDate("Enter the date the medical expires."),
  flightReviewOn: optionalDate("Enter the date of the flight review."),
});

// Where to go back to: a pilot's own page, or the member's page for an
// officer editing someone else.
const backTo = (memberId: string, selfId: string) =>
  memberId === selfId ? "/qualifications" : `/members/${memberId}`;

// Pilots keep their own medical and flight review up to date; officers
// can correct anyone's.
export async function updateQualifications(
  memberId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireMember();
  if (!isUuid(memberId)) return { error: "No such member." };
  if (memberId !== actor.id && !hasRole(actor, "officer")) forbidden();

  const values = formValues(formData, [
    "medicalClass",
    "medicalExpiresOn",
    "flightReviewOn",
  ]);
  const parsed = qualificationsSchema.safeParse(values);
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors, values };
  }
  const next = parsed.data;
  if (next.medicalClass !== null && next.medicalExpiresOn === null) {
    return {
      fieldErrors: {
        medicalExpiresOn: ["Enter the date the medical expires."],
      },
      values,
    };
  }

  await db().transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(pilotQualification)
      .where(eq(pilotQualification.memberId, memberId))
      .for("update");
    const before = current ?? {
      medicalClass: null,
      medicalExpiresOn: null,
      flightReviewOn: null,
    };
    const diff = changedFields(before, next);
    if (!diff.changed) return;
    await tx
      .insert(pilotQualification)
      .values({ memberId, ...next })
      .onConflictDoUpdate({ target: pilotQualification.memberId, set: next });
    await writeAudit(tx, {
      actorId: actor.id,
      action: "qualification.update",
      entityType: "member",
      entityId: memberId,
      before: diff.before,
      after: diff.after,
    });
  });
  redirect(`${backTo(memberId, actor.id)}?saved=qualifications`);
}

const checkoutSchema = z.object({
  aircraftId: z.uuid("Choose an aircraft."),
  checkedOutOn: z.iso.date("Enter the date of the checkout."),
});

export async function addCheckout(
  memberId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const officer = await requireMember("officer");
  if (!isUuid(memberId)) return { error: "No such member." };
  const values = formValues(formData, ["aircraftId", "checkedOutOn"]);
  const parsed = checkoutSchema.safeParse(values);
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors, values };
  }
  const { aircraftId, checkedOutOn } = parsed.data;

  const ok = await db().transaction(async (tx) => {
    const [plane] = await tx
      .select({ id: aircraft.id })
      .from(aircraft)
      .where(eq(aircraft.id, aircraftId));
    if (!plane) return false;
    // Recording a checkout again updates its date, e.g. after a refresher.
    await tx
      .insert(aircraftCheckout)
      .values({ memberId, aircraftId, checkedOutOn, recordedById: officer.id })
      .onConflictDoUpdate({
        target: [aircraftCheckout.memberId, aircraftCheckout.aircraftId],
        set: { checkedOutOn, recordedById: officer.id },
      });
    await writeAudit(tx, {
      actorId: officer.id,
      action: "checkout.record",
      entityType: "member",
      entityId: memberId,
      before: null,
      after: { aircraftId, checkedOutOn },
    });
    return true;
  });
  if (!ok) {
    return { fieldErrors: { aircraftId: ["Choose an aircraft."] }, values };
  }
  redirect(`/members/${memberId}?saved=checkout`);
}

export async function removeCheckout(
  memberId: string,
  aircraftId: string,
): Promise<FormState> {
  const officer = await requireMember("officer");
  if (!isUuid(memberId) || !isUuid(aircraftId)) {
    return { error: "No such checkout." };
  }
  await db().transaction(async (tx) => {
    const [removed] = await tx
      .delete(aircraftCheckout)
      .where(
        and(
          eq(aircraftCheckout.memberId, memberId),
          eq(aircraftCheckout.aircraftId, aircraftId),
        ),
      )
      .returning();
    if (!removed) return;
    await writeAudit(tx, {
      actorId: officer.id,
      action: "checkout.remove",
      entityType: "member",
      entityId: memberId,
      before: { aircraftId, checkedOutOn: removed.checkedOutOn },
      after: null,
    });
  });
  redirect(`/members/${memberId}?saved=checkout`);
}
