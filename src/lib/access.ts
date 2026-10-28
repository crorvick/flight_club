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
