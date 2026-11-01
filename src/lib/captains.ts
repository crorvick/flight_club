import "server-only";

import { eq } from "drizzle-orm";
import { forbidden } from "next/navigation";
import { cache } from "react";

import { db } from "@/db";
import { aircraftCaptain } from "@/db/schema";
import { canMaintain, hasRole } from "@/lib/access";
import { type Member, requireMember } from "@/lib/session";

// The aircraft a member is plane captain of.  Read once per request, like
// the session, and never cached across requests: an officer can take a
// captaincy away at any time.
export const captainOf = cache(async (memberId: string) => {
  const rows = await db()
    .select({ aircraftId: aircraftCaptain.aircraftId })
    .from(aircraftCaptain)
    .where(eq(aircraftCaptain.memberId, memberId));
  return rows.map((r) => r.aircraftId);
});

export async function canMaintainAircraft(member: Member, aircraftId: string) {
  return canMaintain(member, await captainOf(member.id), aircraftId);
}

// Which aircraft's maintenance and squawks a member manages: all of them
// for an officer, a captain's own, or none.
export async function maintainedAircraft(
  member: Member,
): Promise<"all" | string[]> {
  if (hasRole(member, "officer")) return "all";
  return member.active ? captainOf(member.id) : [];
}

// Guard for the pages and actions that manage an aircraft's maintenance
// and squawks: an officer, or a captain of that aircraft.  Redirects or
// renders a 403 otherwise, like requireMember.
export async function requireMaintainer(aircraftId: string): Promise<Member> {
  const member = await requireMember();
  if (!(await canMaintainAircraft(member, aircraftId))) forbidden();
  return member;
}
