import "server-only";

import type { db } from "@/db";
import { auditLog } from "@/db/schema";

export type Transaction = Parameters<
  Parameters<ReturnType<typeof db>["transaction"]>[0]
>[0];

type AuditEntry = {
  actorId: string;
  // What happened, as "<entity>.<verb>", e.g. "squawk.resolve".
  action: string;
  entityType: string;
  entityId: string;
  // Only the fields that changed, so the log reads as a diff.
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
};

// Written in the same transaction as the change it records, so the log
// can never claim a change that was rolled back, or miss one that wasn't.
export async function writeAudit(tx: Transaction, entry: AuditEntry) {
  await tx.insert(auditLog).values(entry);
}
