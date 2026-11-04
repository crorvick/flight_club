import "server-only";

import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { account } from "@/db/schema";

// How a member can sign in: "credential" for a password, else the
// provider ("google", "apple"), one row each.
export async function signInAccounts(memberId: string) {
  return db()
    .select({ id: account.id, providerId: account.providerId })
    .from(account)
    .where(eq(account.userId, memberId))
    .orderBy(asc(account.createdAt));
}

export async function hasPassword(memberId: string) {
  const accounts = await signInAccounts(memberId);
  return accounts.some((a) => a.providerId === "credential");
}
