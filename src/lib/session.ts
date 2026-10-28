import "server-only";

import { headers } from "next/headers";
import { forbidden, redirect } from "next/navigation";
import { cache } from "react";

import { decideAccess, type Requirement } from "@/lib/access";
import { auth } from "@/lib/auth";
import { isRoleTag, type RoleTag } from "@/lib/roles";

export type Member = {
  id: string;
  name: string;
  email: string;
  roles: RoleTag[];
  active: boolean;
};

// Read once per request, however many components and checks ask.  Not
// cached across requests: a member's roles or active flag can change at
// any time, and every check must see the current values.
export const getCurrentMember = cache(async (): Promise<Member | null> => {
  // Read the headers before touching auth(): during prerendering, headers()
  // is what defers this to request time, and auth() needs runtime config.
  const requestHeaders = await headers();
  const session = await auth().api.getSession({ headers: requestHeaders });
  if (!session) return null;
  const { id, name, email, roles, active } = session.user;
  // Better Auth types both as optional; the columns are NOT NULL.
  return {
    id,
    name,
    email,
    roles: (roles ?? []).filter(isRoleTag),
    active: active ?? false,
  };
});

// Guard for pages and server actions.  Every permission check must happen
// on the server through this (or getCurrentMember plus decideAccess);
// hiding a button is never enough.  Redirects or renders a 403 instead of
// returning when the member doesn't qualify.
export async function requireMember(
  requirement: Requirement = "active",
): Promise<Member> {
  const member = await getCurrentMember();
  switch (decideAccess(member, requirement)) {
    case "allow":
      return member!;
    case "sign-in":
      redirect("/sign-in");
    case "pending":
      // The home page explains that an officer needs to approve them.
      redirect("/");
    case "forbidden":
      forbidden();
  }
}
