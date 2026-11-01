import type { RoleTag } from "./roles";

export type MemberAccess = {
  active: boolean;
  roles: readonly RoleTag[];
};

export type Requirement = "active" | RoleTag;

export type AccessDecision = "allow" | "sign-in" | "pending" | "forbidden";

// The single place that decides who may do what.  An inactive member has
// no permissions at all, whatever tags they hold: deactivating someone
// must be enough to lock them out, without also having to strip their
// roles.
export function decideAccess(
  member: MemberAccess | null,
  requirement: Requirement,
): AccessDecision {
  if (!member) return "sign-in";
  if (!member.active) return "pending";
  if (requirement === "active") return "allow";
  return member.roles.includes(requirement) ? "allow" : "forbidden";
}

export function hasRole(member: MemberAccess | null, role: RoleTag) {
  return decideAccess(member, role) === "allow";
}

// Officers manage every aircraft's maintenance and squawks; a plane
// captain manages those of the aircraft they look after, and no others.
// Like everything else, only while their membership is active.
export function canMaintain(
  member: MemberAccess | null,
  captainOf: readonly string[],
  aircraftId: string,
) {
  if (decideAccess(member, "active") !== "allow") return false;
  return hasRole(member, "officer") || captainOf.includes(aircraftId);
}
