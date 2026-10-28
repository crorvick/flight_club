// Role tags a member can hold, in addition to being active.  Shared by the
// schema (which rejects anything else) and the permission checks.
export const ROLE_TAGS = ["pilot", "officer"] as const;

export type RoleTag = (typeof ROLE_TAGS)[number];

export function isRoleTag(value: string): value is RoleTag {
  return (ROLE_TAGS as readonly string[]).includes(value);
}
