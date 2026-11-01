"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/db";
import { type Transaction, writeAudit } from "@/db/audit";
import {
  aircraft,
  maintenanceCompletion,
  maintenanceItem,
  meter,
} from "@/db/schema";
import { changedFields } from "@/lib/audit-diff";
import { type FormState, formValues } from "@/lib/form-state";
import { parseHours, toHours } from "@/lib/hours";
import { GROUNDING_LEVELS } from "@/lib/grounding";
import { isUuid } from "@/lib/ids";
import { requireMember } from "@/lib/session";

const ITEM_FIELDS = [
  "name",
  "calendarInterval",
  "calendarUnit",
  "calendarDeadline",
  "intervalHours",
  "meterId",
  "lastCompletedOn",
  "lastCompletedReading",
  "grounding",
];

const isoDate = z.iso.date("Enter a date.");
const optionalHours = (message: string) =>
  z
    .string()
    .trim()
    .transform((typed, ctx) => {
      if (!typed) return null;
      const hundredths = parseHours(typed);
      if (hundredths === null) {
        ctx.addIssue({ code: "custom", message });
        return z.NEVER;
      }
      return toHours(hundredths);
    });

// What an officer enters for an item.  The last completion is asked for
// up front because the next due date and reading are counted from it.
const itemSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Name the item, e.g. Annual inspection.")
      .max(100, "Keep it under 100 characters."),
    // Every N months or days.  Months either run to the end of the month
    // (annuals) or to the day; days are always to the day (VOR checks).
    calendarInterval: z
      .string()
      .trim()
      .transform((typed, ctx) => {
        if (!typed) return null;
        const count = Number(typed);
        if (!Number.isInteger(count) || count < 1 || count > 3650) {
          ctx.addIssue({ code: "custom", message: "Enter a whole number." });
          return z.NEVER;
        }
        return count;
      }),
    calendarUnit: z.enum(["months", "days"]),
    calendarDeadline: z.enum(["end-of-month", "exact"]),
    intervalHours: optionalHours("Enter hours like 100 or 50.5."),
    meterId: z.string().transform((id) => (id ? id : null)),
    lastCompletedOn: isoDate,
    lastCompletedReading: optionalHours("Enter a reading like 1234.5."),
    grounding: z.enum(
      GROUNDING_LEVELS,
      "Choose what happens when it's overdue.",
    ),
  })
  .superRefine((item, ctx) => {
    if (item.calendarInterval === null && item.intervalHours === null) {
      ctx.addIssue({
        code: "custom",
        path: ["calendarInterval"],
        message: "Give a calendar interval, hours, or both.",
      });
    }
    if (item.intervalHours !== null) {
      if (item.meterId === null || !isUuid(item.meterId)) {
        ctx.addIssue({
          code: "custom",
          path: ["meterId"],
          message: "Choose the meter the hours are counted on.",
        });
      }
      if (item.lastCompletedReading === null) {
        ctx.addIssue({
          code: "custom",
          path: ["lastCompletedReading"],
          message: "Enter that meter's reading when it was last done.",
        });
      }
    }
  })
  .transform(
    ({ calendarInterval, calendarUnit, calendarDeadline, ...item }) => ({
      ...item,
      // For the previous release, during a deploy (lib/grounding.ts).
      groundsWhenOverdue: item.grounding !== "none",
      intervalMonths: calendarUnit === "months" ? calendarInterval : null,
      intervalDays: calendarUnit === "days" ? calendarInterval : null,
      dueEndOfMonth:
        calendarUnit === "months" && calendarDeadline === "end-of-month",
      // Without an hours interval the meter and reading mean nothing.
      ...(item.intervalHours === null && {
        meterId: null,
        lastCompletedReading: null,
      }),
    }),
  );

function parseItem(formData: FormData) {
  return itemSchema.safeParse({
    name: formData.get("name") ?? "",
    calendarInterval: formData.get("calendarInterval") ?? "",
    calendarUnit: formData.get("calendarUnit") ?? "months",
    calendarDeadline: formData.get("calendarDeadline") ?? "end-of-month",
    intervalHours: formData.get("intervalHours") ?? "",
    meterId: formData.get("meterId") ?? "",
    lastCompletedOn: formData.get("lastCompletedOn") ?? "",
    lastCompletedReading: formData.get("lastCompletedReading") ?? "",
    grounding: formData.get("grounding") ?? "all",
  });
}

// The database also enforces this (maintenance_item_meter_fk), but a
// message beats a constraint error.
async function meterBelongs(
  tx: Transaction,
  meterId: string | null,
  aircraftId: string,
) {
  if (meterId === null) return true;
  const [row] = await tx
    .select({ id: meter.id })
    .from(meter)
    .where(and(eq(meter.id, meterId), eq(meter.aircraftId, aircraftId)));
  return row !== undefined;
}

const WRONG_METER = {
  fieldErrors: { meterId: ["Choose one of this aircraft's meters."] },
};

export async function createItem(
  aircraftId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const officer = await requireMember("officer");
  if (!isUuid(aircraftId)) return { error: "No such aircraft." };
  const values = formValues(formData, ITEM_FIELDS);
  const parsed = parseItem(formData);
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors, values };
  }

  const id = await db().transaction(async (tx) => {
    const [plane] = await tx
      .select({ id: aircraft.id })
      .from(aircraft)
      .where(eq(aircraft.id, aircraftId));
    if (!plane || !(await meterBelongs(tx, parsed.data.meterId, aircraftId))) {
      return undefined;
    }
    const [created] = await tx
      .insert(maintenanceItem)
      .values({ aircraftId, ...parsed.data })
      .returning({ id: maintenanceItem.id });
    await writeAudit(tx, {
      actorId: officer.id,
      action: "maintenance.create",
      entityType: "maintenance_item",
      entityId: created.id,
      before: null,
      after: { aircraftId, ...parsed.data },
    });
    return created.id;
  });
  if (!id) return { ...WRONG_METER, values };
  redirect(`/maintenance/${id}?saved=created`);
}

export async function updateItem(
  itemId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const officer = await requireMember("officer");
  if (!isUuid(itemId)) return { error: "No such item." };
  const values = formValues(formData, ITEM_FIELDS);
  const parsed = parseItem(formData);
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors, values };
  }

  const ok = await db().transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(maintenanceItem)
      .where(eq(maintenanceItem.id, itemId))
      .for("update");
    if (!current) return false;
    if (!(await meterBelongs(tx, parsed.data.meterId, current.aircraftId))) {
      return false;
    }
    const diff = changedFields(current, parsed.data);
    if (!diff.changed) return true;
    await tx
      .update(maintenanceItem)
      .set(parsed.data)
      .where(eq(maintenanceItem.id, itemId));
    await writeAudit(tx, {
      actorId: officer.id,
      action: "maintenance.update",
      entityType: "maintenance_item",
      entityId: itemId,
      before: diff.before,
      after: diff.after,
    });
    return true;
  });
  if (!ok) return { ...WRONG_METER, values };
  redirect(`/maintenance/${itemId}?saved=updated`);
}

const completionSchema = z.object({
  completedOn: isoDate.refine(
    // Allows tomorrow's date, as for flights: the server runs on UTC.
    (d) =>
      d <=
      new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    "The date can't be in the future.",
  ),
  reading: optionalHours("Enter a reading like 1234.5."),
  note: z
    .string()
    .trim()
    .max(2000, "Keep the note under 2000 characters.")
    .transform((note) => note || null),
});

// Record that the item was done, which restarts its intervals from then.
export async function completeItem(
  itemId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const officer = await requireMember("officer");
  if (!isUuid(itemId)) return { error: "No such item." };
  const values = formValues(formData, ["completedOn", "reading", "note"]);
  const parsed = completionSchema.safeParse({
    completedOn: formData.get("completedOn") ?? "",
    reading: formData.get("reading") ?? "",
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors, values };
  }
  const completion = parsed.data;

  const error = await db().transaction(async (tx) => {
    const [item] = await tx
      .select()
      .from(maintenanceItem)
      .where(eq(maintenanceItem.id, itemId))
      .for("update");
    if (!item) return "No such item.";
    if (item.intervalHours !== null && completion.reading === null) {
      return "reading";
    }

    await tx.insert(maintenanceCompletion).values({
      itemId,
      ...completion,
      recordedById: officer.id,
    });
    const next = {
      lastCompletedOn: completion.completedOn,
      lastCompletedReading:
        item.intervalHours === null ? null : completion.reading,
    };
    await tx
      .update(maintenanceItem)
      .set(next)
      .where(eq(maintenanceItem.id, itemId));
    await writeAudit(tx, {
      actorId: officer.id,
      action: "maintenance.complete",
      entityType: "maintenance_item",
      entityId: itemId,
      before: {
        lastCompletedOn: item.lastCompletedOn,
        lastCompletedReading: item.lastCompletedReading,
      },
      after: { ...next, note: completion.note },
    });
    return undefined;
  });
  if (error === "reading") {
    return {
      fieldErrors: { reading: ["Enter the meter reading it was done at."] },
      values,
    };
  }
  if (error) return { error, values };
  redirect(`/maintenance/${itemId}?saved=completed`);
}

// For items that no longer apply, e.g. a one-time AD complied with.
export async function deleteItem(itemId: string): Promise<FormState> {
  const officer = await requireMember("officer");
  if (!isUuid(itemId)) return { error: "No such item." };

  const aircraftId = await db().transaction(async (tx) => {
    const [item] = await tx
      .select()
      .from(maintenanceItem)
      .where(eq(maintenanceItem.id, itemId))
      .for("update");
    if (!item) return undefined;
    await tx.delete(maintenanceItem).where(eq(maintenanceItem.id, itemId));
    await writeAudit(tx, {
      actorId: officer.id,
      action: "maintenance.delete",
      entityType: "maintenance_item",
      entityId: itemId,
      before: {
        aircraftId: item.aircraftId,
        name: item.name,
        intervalMonths: item.intervalMonths,
        intervalDays: item.intervalDays,
        dueEndOfMonth: item.dueEndOfMonth,
        intervalHours: item.intervalHours,
        lastCompletedOn: item.lastCompletedOn,
        lastCompletedReading: item.lastCompletedReading,
      },
      after: null,
    });
    return item.aircraftId;
  });
  if (!aircraftId) return { error: "No such item." };
  redirect(`/aircraft/${aircraftId}/maintenance?saved=deleted`);
}
