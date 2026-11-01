"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/db";
import { type Transaction, writeAudit } from "@/db/audit";
import { aircraft, maintenanceCompletion, maintenanceItem } from "@/db/schema";
import { changedFields } from "@/lib/audit-diff";
import { requireMaintainer } from "@/lib/captains";
import { type FormState, formValues } from "@/lib/form-state";
import { GROUNDING_LEVELS } from "@/lib/grounding";
import { parseHours, toHours } from "@/lib/hours";
import { isUuid } from "@/lib/ids";
import {
  FIELDS,
  KIND_LABELS,
  MAINTENANCE_KINDS,
  parseCompletionDetails,
} from "@/lib/maintenance-kinds";
import { requireMember } from "@/lib/session";

const ITEM_FIELDS = [
  "name",
  "calendarInterval",
  "calendarUnit",
  "calendarDeadline",
  "intervalHours",
  "kind",
  "lastCompletedOn",
  "lastCompletedReading",
  "grounding",
];

const isoDate = z.iso.date("Enter a date.");

// Every field a kind of item's completion form can send, to echo back
// after a rejected save.
const DETAIL_FIELDS = Object.values(FIELDS).flatMap((field) =>
  typeof field === "string" ? [field] : [field(0), field(1)],
);
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

// What an officer or the plane's captain enters for an item.  The last
// completion is asked for up front because the next due date and reading
// are counted from it.
const itemSchema = z
  .object({
    // Only a general item needs one; another kind is named for its kind
    // when left blank.
    name: z.string().trim().max(100, "Keep it under 100 characters."),
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
    kind: z.enum(MAINTENANCE_KINDS, "Choose what kind of item it is."),
    calendarUnit: z.enum(["months", "days"]),
    calendarDeadline: z.enum(["end-of-month", "exact"]),
    intervalHours: optionalHours("Enter hours like 100 or 50.5."),
    lastCompletedOn: isoDate,
    lastCompletedReading: optionalHours("Enter a reading like 1234.5."),
    grounding: z.enum(
      GROUNDING_LEVELS,
      "Choose what happens when it's overdue.",
    ),
  })
  .superRefine((item, ctx) => {
    if (item.kind === "general" && !item.name) {
      ctx.addIssue({
        code: "custom",
        path: ["name"],
        message: "Name the item, e.g. Annual inspection.",
      });
    }
    if (item.calendarInterval === null && item.intervalHours === null) {
      ctx.addIssue({
        code: "custom",
        path: ["calendarInterval"],
        message: "Give a calendar interval, hours, or both.",
      });
    }
    if (item.intervalHours !== null && item.lastCompletedReading === null) {
      ctx.addIssue({
        code: "custom",
        path: ["lastCompletedReading"],
        message: "Enter the logbook reading when it was last done.",
      });
    }
  })
  .transform(
    ({ calendarInterval, calendarUnit, calendarDeadline, ...item }) => ({
      ...item,
      name: item.name || KIND_LABELS[item.kind],
      intervalMonths: calendarUnit === "months" ? calendarInterval : null,
      intervalDays: calendarUnit === "days" ? calendarInterval : null,
      dueEndOfMonth:
        calendarUnit === "months" && calendarDeadline === "end-of-month",
      // Without an hours interval the reading means nothing.
      ...(item.intervalHours === null && { lastCompletedReading: null }),
    }),
  );

function parseItem(formData: FormData) {
  return itemSchema.safeParse({
    name: formData.get("name") ?? "",
    calendarInterval: formData.get("calendarInterval") ?? "",
    kind: formData.get("kind") ?? "general",
    calendarUnit: formData.get("calendarUnit") ?? "months",
    calendarDeadline: formData.get("calendarDeadline") ?? "end-of-month",
    intervalHours: formData.get("intervalHours") ?? "",
    lastCompletedOn: formData.get("lastCompletedOn") ?? "",
    lastCompletedReading: formData.get("lastCompletedReading") ?? "",
    grounding: formData.get("grounding") ?? "all",
  });
}

// Hours intervals count on the aircraft's logbook meter, so one needs
// it to have one.  Undefined when there's no such aircraft.
async function logbookMeterOf(tx: Transaction, aircraftId: string) {
  const [plane] = await tx
    .select({ logbookMeterId: aircraft.logbookMeterId })
    .from(aircraft)
    .where(eq(aircraft.id, aircraftId));
  return plane && { id: plane.logbookMeterId };
}

const NO_LOGBOOK_METER = {
  fieldErrors: {
    intervalHours: [
      "Choose which meter is the aircraft's logbook time before adding hours.",
    ],
  },
};

// For an existing item: an officer or a captain of its aircraft.
// Undefined when there's no such item.
async function requireItemMaintainer(itemId: string) {
  await requireMember();
  if (!isUuid(itemId)) return undefined;
  const [item] = await db()
    .select({ aircraftId: maintenanceItem.aircraftId })
    .from(maintenanceItem)
    .where(eq(maintenanceItem.id, itemId));
  return item && requireMaintainer(item.aircraftId);
}

export async function createItem(
  aircraftId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!isUuid(aircraftId)) return { error: "No such aircraft." };
  const actor = await requireMaintainer(aircraftId);
  const values = formValues(formData, ITEM_FIELDS);
  const parsed = parseItem(formData);
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors, values };
  }

  const result = await db().transaction(async (tx) => {
    const logbook = await logbookMeterOf(tx, aircraftId);
    if (!logbook) return { error: "No such aircraft." };
    const hours = parsed.data.intervalHours !== null;
    if (hours && logbook.id === null) return NO_LOGBOOK_METER;
    const [created] = await tx
      .insert(maintenanceItem)
      .values({ aircraftId, ...parsed.data })
      .returning({ id: maintenanceItem.id });
    await writeAudit(tx, {
      actorId: actor.id,
      action: "maintenance.create",
      entityType: "maintenance_item",
      entityId: created.id,
      before: null,
      after: { aircraftId, ...parsed.data },
    });
    return { id: created.id };
  });
  if (!("id" in result)) return { ...result, values };
  redirect(`/maintenance/${result.id}?saved=created`);
}

export async function updateItem(
  itemId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireItemMaintainer(itemId);
  if (!actor) return { error: "No such item." };
  const values = formValues(formData, ITEM_FIELDS);
  const parsed = parseItem(formData);
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors, values };
  }

  const error = await db().transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(maintenanceItem)
      .where(eq(maintenanceItem.id, itemId))
      .for("update");
    if (!current) return { error: "No such item." };
    const logbook = (await logbookMeterOf(tx, current.aircraftId))!;
    const hours = parsed.data.intervalHours !== null;
    if (hours && logbook.id === null) return NO_LOGBOOK_METER;
    const next = parsed.data;
    const diff = changedFields(current, next);
    if (!diff.changed) return undefined;
    await tx
      .update(maintenanceItem)
      .set(next)
      .where(eq(maintenanceItem.id, itemId));
    await writeAudit(tx, {
      actorId: actor.id,
      action: "maintenance.update",
      entityType: "maintenance_item",
      entityId: itemId,
      before: diff.before,
      after: diff.after,
    });
    return undefined;
  });
  if (error) return { ...error, values };
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
  const actor = await requireItemMaintainer(itemId);
  if (!actor) return { error: "No such item." };
  const values = formValues(formData, [
    "completedOn",
    "reading",
    "note",
    ...DETAIL_FIELDS,
  ]);
  const parsed = completionSchema.safeParse({
    completedOn: formData.get("completedOn") ?? "",
    reading: formData.get("reading") ?? "",
    note: formData.get("note") ?? "",
  });

  // What the item's kind records, on top of the date and reading.
  const [target] = await db()
    .select({ kind: maintenanceItem.kind, engines: aircraft.engineCount })
    .from(maintenanceItem)
    .innerJoin(aircraft, eq(aircraft.id, maintenanceItem.aircraftId))
    .where(eq(maintenanceItem.id, itemId));
  if (!target) return { error: "No such item.", values };
  const extra = parseCompletionDetails(
    target.kind,
    (name) => String(formData.get(name) ?? ""),
    { engines: target.engines },
  );
  if (!parsed.success || "fieldErrors" in extra) {
    return {
      fieldErrors: {
        ...(parsed.success ? {} : z.flattenError(parsed.error).fieldErrors),
        ...("fieldErrors" in extra ? extra.fieldErrors : {}),
      },
      values,
    };
  }
  const completion = { ...parsed.data, details: extra.details };

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
      recordedById: actor.id,
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
      actorId: actor.id,
      action: "maintenance.complete",
      entityType: "maintenance_item",
      entityId: itemId,
      before: {
        lastCompletedOn: item.lastCompletedOn,
        lastCompletedReading: item.lastCompletedReading,
      },
      after: {
        ...next,
        note: completion.note,
        ...(completion.details && { details: completion.details }),
      },
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
  const actor = await requireItemMaintainer(itemId);
  if (!actor) return { error: "No such item." };

  const aircraftId = await db().transaction(async (tx) => {
    const [item] = await tx
      .select()
      .from(maintenanceItem)
      .where(eq(maintenanceItem.id, itemId))
      .for("update");
    if (!item) return undefined;
    await tx.delete(maintenanceItem).where(eq(maintenanceItem.id, itemId));
    await writeAudit(tx, {
      actorId: actor.id,
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
