"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/db";
import { writeAudit } from "@/db/audit";
import { member } from "@/db/schema";
import { changedFields } from "@/lib/audit-diff";
import type { FormState } from "@/lib/form-state";
import { isUuid } from "@/lib/ids";
import { checkMemberChange } from "@/lib/member-rules";
import { isRoleTag, ROLE_TAGS } from "@/lib/roles";
import { requireMember } from "@/lib/session";

const memberSchema = z.object({
  active: z.boolean(),
  roles: z.array(z.enum(ROLE_TAGS)),
});

type MemberChange = z.infer<typeof memberSchema>;

// Apply a change to a member, checked and audited.  Returns an error for
// the officer, or undefined once it's saved.
async function applyChange(
  officerId: string,
  memberId: string,
  next: MemberChange,
) {
  const rule = checkMemberChange(officerId, memberId, next);
  if (rule) return rule;

  return db().transaction(async (tx) => {
    const [current] = await tx
      .select({ active: member.active, roles: member.roles })
      .from(member)
      .where(eq(member.id, memberId))
      .for("update");
    if (!current) return "No such member.";

    // Stored in a fixed order, so the same set of roles always compares
    // (and audits) the same.
    const after = {
      active: next.active,
      roles: ROLE_TAGS.filter((r) => next.roles.includes(r)),
    };
    const before = {
      active: current.active,
      roles: current.roles.filter(isRoleTag),
    };
    const diff = changedFields(before, after);
    if (!diff.changed) return undefined;

    await tx.update(member).set(after).where(eq(member.id, memberId));
    await writeAudit(tx, {
      actorId: officerId,
      action: "member.update",
      entityType: "member",
      entityId: memberId,
      before: diff.before,
      after: diff.after,
    });
    return undefined;
  });
}

export async function updateMember(
  memberId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const officer = await requireMember("officer");
  if (!isUuid(memberId)) return { error: "No such member." };

  const parsed = memberSchema.safeParse({
    active: formData.get("active") === "on",
    roles: formData.getAll("roles"),
  });
  if (!parsed.success) return { error: "Choose from the listed roles." };

  const error = await applyChange(officer.id, memberId, parsed.data);
  if (error) return { error };
  redirect(`/members/${memberId}?saved=1`);
}

// The common case from the list: a new member, approved as a pilot.
export async function approveAsPilot(memberId: string) {
  const officer = await requireMember("officer");
  if (!isUuid(memberId)) return;
  await applyChange(officer.id, memberId, { active: true, roles: ["pilot"] });
  redirect("/members");
}
