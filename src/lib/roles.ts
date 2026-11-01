// Role tags a member can hold, in addition to being active.  Shared by the
// schema (which rejects anything else) and the permission checks.  Their
// order here is the order they're always listed in.
export const ROLE_TAGS = ["pilot", "officer"] as const;

export type RoleTag = (typeof ROLE_TAGS)[number];

// A member's tags as stored, in the order above, without any unknown
// ones.  The database keeps whatever order they were given in, which
// differs between members.
export function knownRoles(tags: readonly string[]): RoleTag[] {
  return ROLE_TAGS.filter((role) => tags.includes(role));
}
