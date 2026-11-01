"use server";

import { and, count, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/db";
import { writeAudit } from "@/db/audit";
import {
  aircraft,
  flightMeterReading,
  maintenanceItem,
  meter,
} from "@/db/schema";
import { changedFields } from "@/lib/audit-diff";
import { type FormState, formValues } from "@/lib/form-state";
import { parseHours, toHours } from "@/lib/hours";
import { isUuid } from "@/lib/ids";
import { METER_KINDS, METER_LABELS, type MeterKind } from "@/lib/meters";
import { requireMember } from "@/lib/session";

import { readingField } from "./fields";

// Thrown inside a transaction to roll it back with a message.
class Rejected extends Error {
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
  }
}

function rejection(error: unknown, values: Record<string, string>) {
  if (error instanceof Rejected) {
    return error.field
      ? { fieldErrors: { [error.field]: [error.message] }, values }
      : { error: error.message, values };
  }
  throw error;
}

// Postgres reports a duplicate tail number as a unique violation, wrapped
// by Drizzle.
function isUniqueViolation(error: unknown) {
  const cause = (error as { cause?: { code?: string } })?.cause;
  return cause?.code === "23505";
}

const tailNumber = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9-]{2,10}$/, "Enter a tail number like N172FC.");
const makeModel = z
  .string()
  .trim()
  .min(1, "Enter the make and model.")
  .max(100, "Keep it under 100 characters.");
const meterLabel = z
  .string()
  .trim()
  .min(1, "Give the meter a label.")
  .max(30, "Keep it under 30 characters.");

function reading(typed: string) {
  const hundredths = parseHours(typed);
  return hundredths === null ? null : toHours(hundredths);
}

export async function createAircraft(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const officer = await requireMember("officer");
  const values = formValues(formData, [
    "tailNumber",
    "makeModel",
    "billing",
    ...METER_KINDS.map(readingField),
  ]);

  const fieldErrors: Record<string, string[]> = {};
  const details = z
    .object({ tailNumber, makeModel })
    .safeParse({ tailNumber: values.tailNumber, makeModel: values.makeModel });
  if (!details.success) {
    Object.assign(fieldErrors, z.flattenError(details.error).fieldErrors);
  }

  // A meter is included by giving it a starting reading.
  const meters: { kind: MeterKind; reading: string }[] = [];
  for (const kind of METER_KINDS) {
    const typed = values[readingField(kind)].trim();
    if (!typed) continue;
    const value = reading(typed);
    if (value === null) {
      fieldErrors[readingField(kind)] = ["Enter a reading like 1234.5."];
    } else {
      meters.push({ kind, reading: value });
    }
  }
  // Only worth checking once the readings themselves are right.
  if (!METER_KINDS.some((kind) => fieldErrors[readingField(kind)])) {
    if (meters.length === 0) {
      fieldErrors.billing = ["Give at least one meter a starting reading."];
    } else if (!meters.some((m) => m.kind === values.billing)) {
      fieldErrors.billing = [
        "Choose which of its meters flights are billed by.",
      ];
    }
  }
  if (!details.success || Object.keys(fieldErrors).length > 0) {
    return { fieldErrors, values };
  }

  let id: string;
  try {
    id = await db().transaction(async (tx) => {
      const [created] = await tx
        .insert(aircraft)
        .values(details.data)
        .returning({ id: aircraft.id });
      const rows = await tx
        .insert(meter)
        .values(
          meters.map((m) => ({
            aircraftId: created.id,
            kind: m.kind,
            label: METER_LABELS[m.kind],
            currentReading: m.reading,
          })),
        )
        .returning({ id: meter.id, kind: meter.kind });
      const billingMeterId = rows.find((r) => r.kind === values.billing)!.id;
      await tx
        .update(aircraft)
        .set({ billingMeterId })
        .where(eq(aircraft.id, created.id));
      await writeAudit(tx, {
        actorId: officer.id,
        action: "aircraft.create",
        entityType: "aircraft",
        entityId: created.id,
        before: null,
        after: {
          ...details.data,
          meters: Object.fromEntries(meters.map((m) => [m.kind, m.reading])),
          billing: values.billing,
        },
      });
      return created.id;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return {
        fieldErrors: {
          tailNumber: ["That tail number is already in the fleet."],
        },
        values,
      };
    }
    throw error;
  }
  redirect(`/aircraft/${id}?saved=created`);
}

export async function updateAircraft(
  aircraftId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const officer = await requireMember("officer");
  if (!isUuid(aircraftId)) return { error: "No such aircraft." };
  const values = formValues(formData, ["tailNumber", "makeModel", "billing"]);

  const parsed = z
    .object({ tailNumber, makeModel, billingMeterId: z.uuid() })
    .safeParse({
      tailNumber: values.tailNumber,
      makeModel: values.makeModel,
      billingMeterId: values.billing,
    });
  if (!parsed.success) {
    const { billingMeterId, ...rest } = z.flattenError(
      parsed.error,
    ).fieldErrors;
    return {
      fieldErrors: {
        ...rest,
        ...(billingMeterId && { billing: ["Choose a billing meter."] }),
      },
      values,
    };
  }
  const next = { ...parsed.data, active: formData.get("active") === "on" };

  try {
    await db().transaction(async (tx) => {
      const [current] = await tx
        .select({
          tailNumber: aircraft.tailNumber,
          makeModel: aircraft.makeModel,
          billingMeterId: aircraft.billingMeterId,
          active: aircraft.active,
        })
        .from(aircraft)
        .where(eq(aircraft.id, aircraftId))
        .for("update");
      if (!current) throw new Rejected("No such aircraft.");

      // Past flights keep the billing meter they were logged with; this
      // only changes how future flights are billed.
      const [billing] = await tx
        .select({ id: meter.id })
        .from(meter)
        .where(
          and(
            eq(meter.id, next.billingMeterId),
            eq(meter.aircraftId, aircraftId),
          ),
        );
      if (!billing) throw new Rejected("Choose one of its meters.", "billing");

      const diff = changedFields(current, next);
      if (!diff.changed) return;
      await tx.update(aircraft).set(next).where(eq(aircraft.id, aircraftId));
      await writeAudit(tx, {
        actorId: officer.id,
        action: "aircraft.update",
        entityType: "aircraft",
        entityId: aircraftId,
        before: diff.before,
        after: diff.after,
      });
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return {
        fieldErrors: {
          tailNumber: ["That tail number is already in the fleet."],
        },
        values,
      };
    }
    return rejection(error, values);
  }
  redirect(`/aircraft/${aircraftId}?saved=details`);
}

// Rename a meter or correct its reading.  A correction moves where the
// next flight's out reading starts, so it needs a reason, and it locks
// the meter like checking out and in do: a pilot part-way through either
// on this aircraft is told it changed rather than billed from the old
// reading.
export async function updateMeter(
  meterId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const officer = await requireMember("officer");
  if (!isUuid(meterId)) return { error: "No such meter." };
  const values = formValues(formData, ["label", "reading", "reason"]);

  const label = meterLabel.safeParse(values.label);
  const value = reading(values.reading);
  const fieldErrors: Record<string, string[]> = {};
  if (!label.success) fieldErrors.label = [label.error.issues[0].message];
  if (value === null) fieldErrors.reading = ["Enter a reading like 1234.5."];
  if (!label.success || value === null) return { fieldErrors, values };

  let aircraftId: string;
  try {
    aircraftId = await db().transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(meter)
        .where(eq(meter.id, meterId))
        .for("update");
      if (!current) throw new Rejected("No such meter.");

      // Both readings are numeric(9, 2) strings, so they compare as-is.
      const diff = changedFields(
        { label: current.label, currentReading: current.currentReading },
        { label: label.data, currentReading: value },
      );
      const reason = values.reason.trim();
      if ("currentReading" in diff.after && !reason) {
        throw new Rejected("Say why the reading is changing.", "reason");
      }
      if (!diff.changed) return current.aircraftId;

      await tx
        .update(meter)
        .set({ label: label.data, currentReading: value })
        .where(eq(meter.id, meterId));
      await writeAudit(tx, {
        actorId: officer.id,
        action: "meter.update",
        entityType: "meter",
        entityId: meterId,
        before: diff.before,
        after: {
          ...diff.after,
          ...("currentReading" in diff.after && { reason }),
        },
      });
      return current.aircraftId;
    });
  } catch (error) {
    return rejection(error, values);
  }
  redirect(`/aircraft/${aircraftId}?saved=meter`);
}

export async function addMeter(
  aircraftId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const officer = await requireMember("officer");
  if (!isUuid(aircraftId)) return { error: "No such aircraft." };
  const values = formValues(formData, ["kind", "reading"]);

  const kind = z.enum(METER_KINDS).safeParse(values.kind);
  const value = reading(values.reading);
  if (!kind.success || value === null) {
    return {
      fieldErrors: {
        ...(!kind.success && { kind: ["Choose a kind of meter."] }),
        ...(value === null && { reading: ["Enter a reading like 1234.5."] }),
      },
      values,
    };
  }

  try {
    await db().transaction(async (tx) => {
      const [created] = await tx
        .insert(meter)
        .values({
          aircraftId,
          kind: kind.data,
          label: METER_LABELS[kind.data],
          currentReading: value,
        })
        .returning({ id: meter.id });
      await writeAudit(tx, {
        actorId: officer.id,
        action: "meter.create",
        entityType: "meter",
        entityId: created.id,
        before: null,
        after: { aircraftId, kind: kind.data, currentReading: value },
      });
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return {
        fieldErrors: { kind: ["It already has that meter."] },
        values,
      };
    }
    throw error;
  }
  redirect(`/aircraft/${aircraftId}?saved=meter`);
}

// Only a meter no flight has recorded can go: removing one with readings
// would leave holes in past flights.
export async function removeMeter(meterId: string): Promise<FormState> {
  const officer = await requireMember("officer");
  if (!isUuid(meterId)) return { error: "No such meter." };

  let aircraftId: string;
  try {
    aircraftId = await db().transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(meter)
        .where(eq(meter.id, meterId))
        .for("update");
      if (!current) throw new Rejected("No such meter.");
      const [plane] = await tx
        .select({ billingMeterId: aircraft.billingMeterId })
        .from(aircraft)
        .where(eq(aircraft.id, current.aircraftId));
      if (plane.billingMeterId === meterId) {
        throw new Rejected(
          "Flights are billed by this meter. Choose another billing meter first.",
        );
      }
      const [{ used }] = await tx
        .select({ used: count() })
        .from(flightMeterReading)
        .where(eq(flightMeterReading.meterId, meterId));
      const [{ tracked }] = await tx
        .select({ tracked: count() })
        .from(maintenanceItem)
        .where(eq(maintenanceItem.meterId, meterId));
      if (tracked > 0) {
        throw new Rejected(
          "Maintenance is counted on this meter. Move those items to another meter first.",
        );
      }
      if (used > 0) {
        throw new Rejected(
          "Flights have recorded this meter, so it can't be removed.",
        );
      }

      await tx.delete(meter).where(eq(meter.id, meterId));
      await writeAudit(tx, {
        actorId: officer.id,
        action: "meter.delete",
        entityType: "meter",
        entityId: meterId,
        before: {
          aircraftId: current.aircraftId,
          kind: current.kind,
          label: current.label,
          currentReading: current.currentReading,
        },
        after: null,
      });
      return current.aircraftId;
    });
  } catch (error) {
    return rejection(error, {});
  }
  redirect(`/aircraft/${aircraftId}?saved=meter`);
}
