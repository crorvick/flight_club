"use server";

import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { member } from "@/db/schema";
import { LATEST_RELEASE_NOTE } from "@/lib/release-notes";
import { getCurrentMember } from "@/lib/session";

// Record that the member has seen the release notes up to `upTo`, the
// newest they were shown.  Never moves backwards, so a stale page can't
// show them notes again.
export async function markReleaseNotesSeen(upTo: number) {
  const me = await getCurrentMember();
  if (!me) return;
  const seen = Math.min(Math.max(0, Math.trunc(upTo)), LATEST_RELEASE_NOTE);
  await db()
    .update(member)
    .set({
      lastSeenReleaseNote: sql`greatest(${member.lastSeenReleaseNote}, ${seen})`,
    })
    .where(eq(member.id, me.id));
}
