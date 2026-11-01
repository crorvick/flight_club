import type { RoleTag } from "./roles";

type MemberState = { active: boolean; roles: readonly RoleTag[] };

// A new account starts inactive with no roles.  A deactivated member keeps
// their roles (the access check ignores them while inactive), so
// reactivating them restores what they had.
export function isPending(member: MemberState) {
  return !member.active && member.roles.length === 0;
}

// An officer can't take away their own officer role or deactivate
// themselves.  Since only officers can change members, that's also what
// guarantees the club always has at least one active officer.
export function checkMemberChange(
  actorId: string,
  targetId: string,
  next: MemberState,
) {
  if (actorId !== targetId) return undefined;
  if (!next.active) {
    return "You can't deactivate yourself. Ask another officer.";
  }
  if (!next.roles.includes("officer")) {
    return "You can't remove your own officer role. Ask another officer.";
  }
  return undefined;
}
