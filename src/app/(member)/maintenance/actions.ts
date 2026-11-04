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
import { parseCycle } from "@/lib/airac";
import { parseHours, toHours } from "@/lib/hours";
import { isUuid } from "@/lib/ids";
import { hundredHourFrom } from "@/lib/maintenance";
import {
  defaultName,
  DIRECTIVE_SCOPES,
  FIELDS,
  HUNDRED_HOURS,
  isDirective,
  MAINTENANCE_KINDS,
  type MaintenanceKind,
  parseCompletionDetails,
  type Schedule,
  SCHEDULES,
  scheduleFor,
} from "@/lib/maintenance-kinds";
import { requireMember } from "@/lib/session";

const ITEM_FIELDS = [
  "name",
  "schedule",
  "calendarInterval",
  "calendarUnit",
  "calendarDeadline",
  "intervalHours",
  "kind",
  "lastCompletedOn",
  "lastCompletedReading",
  "dueOn",
  "dueReading",
  "itemCycle",
  "reference",
  "appliesTo",
  "notApplicable",
  "notApplicableReason",
  "grounding",
];

const isoDate = z.iso.date("Enter a date.");
const optionalDate = z
  .string()
  .trim()
  .transform((typed, ctx) => {
    if (!typed) return null;
    if (!isoDate.safeParse(typed).success) {
      ctx.addIssue({ code: "custom", message: "Enter a date." });
      return z.NEVER;
    }
    return typed;
  });

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

// What an officer or the plane's captain enters for an item.  Which
// fields count depends on its kind and schedule: a recurring item asks
// for its intervals and when it was last done, since the next due date
// and reading are counted from that; one done once, when it's due; one
// that expires, when.  An AD or SB that doesn't apply needs only why.
const itemSchema = z
  .object({
    // Only a general item needs one; another kind is named for its kind,
    // or an AD or SB for its number, when left blank.
    name: z.string().trim().max(100, "Keep it under 100 characters."),
    kind: z.enum(MAINTENANCE_KINDS, "Choose what kind of item it is."),
    // One the kind can't have falls back to its default (scheduleFor).
    schedule: z.enum(SCHEDULES).catch("recurring"),
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
    lastCompletedOn: optionalDate,
    lastCompletedReading: optionalHours("Enter a reading like 1234.5."),
    dueOn: optionalDate,
    dueReading: optionalHours("Enter a reading like 1234.5."),
    // A navigation database's AIRAC cycle, which sets when it expires.
    itemCycle: z.string().trim(),
    reference: z.string().trim().max(100, "Keep it under 100 characters."),
    appliesTo: z.enum(DIRECTIVE_SCOPES).nullable().catch(null),
    notApplicable: z.boolean(),
    notApplicableReason: z
      .string()
      .trim()
      .max(500, "Keep it under 500 characters."),
    grounding: z.enum(
      GROUNDING_LEVELS,
      "Choose what happens when it's overdue.",
    ),
  })
  .superRefine((item, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message });
    const schedule = scheduleFor(item.kind, item.schedule);
    if (item.kind === "general" && !item.name) {
      issue("name", "Name the item, e.g. Annual inspection.");
    }
    if (isDirective(item.kind)) {
      if (!item.reference) {
        issue(
          "reference",
          item.kind === "airworthiness_directive"
            ? "Enter the AD number, e.g. 2020-12-05."
            : "Enter the bulletin, e.g. Lycoming SB 480F.",
        );
      }
      if (!item.appliesTo) issue("appliesTo", "Choose what it applies to.");
      if (item.notApplicable) {
        if (!item.notApplicableReason) {
          issue(
            "notApplicableReason",
            "Say why, e.g. the serial number isn't in the affected range.",
          );
        }
        return;
      }
    }
    if (schedule === "recurring") {
      const hours = item.kind === "hundred_hour" || item.intervalHours !== null;
      if (
        item.kind !== "hundred_hour" &&
        item.calendarInterval === null &&
        item.intervalHours === null
      ) {
        issue("calendarInterval", "Give a calendar interval, hours, or both.");
      }
      if (hours && item.lastCompletedReading === null) {
        issue(
          "lastCompletedReading",
          "Enter the logbook reading when it was last done.",
        );
      }
      if (item.lastCompletedOn === null)
        issue("lastCompletedOn", "Enter a date.");
    }
    if (
      schedule === "once" &&
      item.dueOn === null &&
      item.dueReading === null
    ) {
      issue("dueOn", "Give a date, a logbook reading, or both.");
    }
    if (schedule === "expires") {
      if (item.kind === "nav_database") {
        if (!parseCycle(item.itemCycle)) {
          issue("itemCycle", "Choose the cycle installed.");
        }
      } else if (item.dueOn === null) {
        issue("dueOn", "Enter when it expires.");
      }
    }
  })
  .transform((item) => {
    const schedule = scheduleFor(item.kind, item.schedule);
    const directive = isDirective(item.kind);
    const reference = directive ? item.reference : null;
    const notApplicable =
      directive && item.notApplicable ? item.notApplicableReason : null;
    const row = {
      kind: item.kind,
      schedule,
      name: item.name || defaultName(item.kind, reference),
      reference,
      appliesTo: directive ? item.appliesTo : null,
      notApplicable,
      grounding: item.grounding,
      intervalMonths: null as number | null,
      intervalDays: null as number | null,
      dueEndOfMonth: true,
      intervalHours: null as string | null,
      dueOn: null as string | null,
      dueReading: null as string | null,
    };
    // Nothing is due on one that doesn't apply.
    if (notApplicable) return row;
    if (schedule === "once") {
      return { ...row, dueOn: item.dueOn, dueReading: item.dueReading };
    }
    if (schedule === "expires") {
      return {
        ...row,
        dueOn:
          item.kind === "nav_database"
            ? parseCycle(item.itemCycle)!.ends
            : item.dueOn,
      };
    }
    const intervalHours =
      item.kind === "hundred_hour" ? HUNDRED_HOURS : item.intervalHours;
    const calendar =
      item.kind === "hundred_hour" ? null : item.calendarInterval;
    return {
      ...row,
      intervalMonths: item.calendarUnit === "months" ? calendar : null,
      intervalDays: item.calendarUnit === "days" ? calendar : null,
      dueEndOfMonth:
        item.calendarUnit === "months" &&
        item.calendarDeadline === "end-of-month",
      intervalHours,
      // Only a recurring item counts from when it was last done; the
      // others keep what their completions set.
      lastCompletedOn: item.lastCompletedOn,
      // Without an hours interval the reading means nothing.
      lastCompletedReading:
        intervalHours === null ? null : item.lastCompletedReading,
    };
  });

function parseItem(formData: FormData) {
  const text = (name: string, fallback = "") =>
    String(formData.get(name) ?? fallback);
  return itemSchema.safeParse({
    name: text("name"),
    kind: text("kind", "general"),
    schedule: text("schedule", "recurring"),
    calendarInterval: text("calendarInterval"),
    calendarUnit: text("calendarUnit", "months"),
    calendarDeadline: text("calendarDeadline", "end-of-month"),
    intervalHours: text("intervalHours"),
    lastCompletedOn: text("lastCompletedOn"),
    lastCompletedReading: text("lastCompletedReading"),
    dueOn: text("dueOn"),
    dueReading: text("dueReading"),
    itemCycle: text("itemCycle"),
    reference: text("reference"),
    appliesTo: text("appliesTo") || null,
    notApplicable: formData.get("notApplicable") === "on",
    notApplicableReason: text("notApplicableReason"),
    grounding: text("grounding", "all"),
  });
}

// Whether it counts on the logbook meter.
const countsHours = (item: {
  intervalHours: string | null;
  dueReading: string | null;
}) => item.intervalHours !== null || item.dueReading !== null;

// Hours intervals count on the aircraft's logbook meter, so one needs
// it to have one.  Undefined when there's no such aircraft.
async function logbookMeterOf(tx: Transaction, aircraftId: string) {
  const [plane] = await tx
    .select({ logbookMeterId: aircraft.logbookMeterId })
    .from(aircraft)
    .where(eq(aircraft.id, aircraftId));
  return plane && { id: plane.logbookMeterId };
}

// On whichever field asked for hours.
const noLogbookMeter = (item: { dueReading: string | null }) => ({
  fieldErrors: {
    [item.dueReading === null ? "intervalHours" : "dueReading"]: [
      "Choose which meter is the aircraft's logbook time before adding hours.",
    ],
  },
});

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
    if (countsHours(parsed.data) && logbook.id === null) {
      return noLogbookMeter(parsed.data);
    }
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
    if (countsHours(parsed.data) && logbook.id === null) {
      return noLogbookMeter(parsed.data);
    }
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

// Record that the item was done.  A recurring item's intervals restart
// from then, unless it was an AD or SB's terminating action; one done
// once is closed; one that expires gets its new expiration date.
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
    "expiresOn",
    ...DETAIL_FIELDS,
  ]);
  const parsed = completionSchema.safeParse({
    completedOn: formData.get("completedOn") ?? "",
    reading: formData.get("reading") ?? "",
    note: formData.get("note") ?? "",
  });

  // What the item's kind records, on top of the date and reading.
  const [target] = await db()
    .select({
      kind: maintenanceItem.kind,
      schedule: maintenanceItem.schedule,
      engines: aircraft.engineCount,
    })
    .from(maintenanceItem)
    .innerJoin(aircraft, eq(aircraft.id, maintenanceItem.aircraftId))
    .where(eq(maintenanceItem.id, itemId));
  if (!target) return { error: "No such item.", values };
  const extra = parseCompletionDetails(
    target.kind,
    (name) => String(formData.get(name) ?? ""),
    { engines: target.engines, schedule: target.schedule },
  );
  // Renewing one that expires gives it a new date: a navigation
  // database's is its cycle's end, anything else's is entered.
  const expires = expiresOnFrom(
    target,
    extra,
    String(formData.get("expiresOn") ?? "").trim(),
    parsed.success ? parsed.data.completedOn : undefined,
  );
  if (!parsed.success || "fieldErrors" in extra || "error" in expires) {
    return {
      fieldErrors: {
        ...(parsed.success ? {} : z.flattenError(parsed.error).fieldErrors),
        ...("fieldErrors" in extra ? extra.fieldErrors : {}),
        ...("error" in expires ? { expiresOn: [expires.error] } : {}),
      },
      values,
    };
  }
  const completion = {
    ...parsed.data,
    details: extra.details,
    expiresOn: expires.on,
  };

  const error = await db().transaction(async (tx) => {
    const [item] = await tx
      .select()
      .from(maintenanceItem)
      .where(eq(maintenanceItem.id, itemId))
      .for("update");
    if (!item) return "No such item.";
    if (item.notApplicable) return "It doesn't apply to this aircraft.";
    if (item.closedOn) return "It's already been done for good.";
    if (countsHours(item) && completion.reading === null) return "reading";

    await tx.insert(maintenanceCompletion).values({
      itemId,
      ...completion,
      recordedById: actor.id,
    });
    const before = {
      lastCompletedOn: item.lastCompletedOn,
      lastCompletedReading: item.lastCompletedReading,
      dueOn: item.dueOn,
      closedOn: item.closedOn,
    };
    const terminated =
      completion.details !== null &&
      "terminating" in completion.details &&
      completion.details.terminating;
    const next = {
      lastCompletedOn: completion.completedOn,
      lastCompletedReading: lastReadingAfter(item, completion.reading),
      dueOn: completion.expiresOn ?? item.dueOn,
      closedOn:
        item.schedule === "once" || terminated ? completion.completedOn : null,
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
      before,
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

function expiresOnFrom(
  item: { kind: MaintenanceKind; schedule: Schedule },
  extra: ReturnType<typeof parseCompletionDetails>,
  typed: string,
  completedOn: string | undefined,
): { on: string | null } | { error: string } {
  if (item.schedule !== "expires") return { on: null };
  if (item.kind === "nav_database") {
    const details = "details" in extra ? extra.details : null;
    return {
      on:
        details?.kind === "nav_database"
          ? parseCycle(details.cycle)!.ends
          : null,
    };
  }
  if (!isoDate.safeParse(typed).success) {
    return { error: "Enter the new expiration date." };
  }
  if (completedOn && typed <= completedOn) {
    return { error: "It has to be after the date it was done." };
  }
  return { on: typed };
}

// What a recurring item's hours count from after it's done at a reading:
// that reading, except for a 100-hour inspection done late.
function lastReadingAfter(
  item: {
    kind: MaintenanceKind;
    intervalHours: string | null;
    lastCompletedReading: string | null;
  },
  reading: string | null,
) {
  if (item.intervalHours === null) return null;
  if (item.kind === "hundred_hour" && item.lastCompletedReading !== null) {
    return hundredHourFrom(
      reading!,
      item.lastCompletedReading,
      item.intervalHours,
    );
  }
  return reading;
}

// For items added by mistake, or no longer kept.  One done for good, or
// an AD that doesn't apply, is better kept for the record.
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
        schedule: item.schedule,
        dueOn: item.dueOn,
        dueReading: item.dueReading,
        closedOn: item.closedOn,
        reference: item.reference,
        notApplicable: item.notApplicable,
      },
      after: null,
    });
    return item.aircraftId;
  });
  if (!aircraftId) return { error: "No such item." };
  redirect(`/aircraft/${aircraftId}/maintenance?saved=deleted`);
}
