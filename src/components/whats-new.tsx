import { eq } from "drizzle-orm";

import { db } from "@/db";
import { member } from "@/db/schema";
import { captainOf } from "@/lib/captains";
import {
  type Audience,
  LATEST_RELEASE_NOTE,
  unseenNotes,
} from "@/lib/release-notes";
import { getCurrentMember, type Member } from "@/lib/session";

import { ReleaseNotesList } from "./release-notes-list";
import { WhatsNewDialog } from "./whats-new-dialog";

// Who a member is, for picking out the bullets meant for them.
export async function audiencesOf(me: Member): Promise<Audience[]> {
  const audiences: Audience[] = [...me.roles];
  if ((await captainOf(me.id)).length > 0) audiences.push("captain");
  return audiences;
}

// The release notes a member hasn't seen, in a popup over whatever page
// they open first after a release.
export async function WhatsNew() {
  const me = await getCurrentMember();
  if (!me?.active) return null;
  const [row] = await db()
    .select({ lastSeen: member.lastSeenReleaseNote })
    .from(member)
    .where(eq(member.id, me.id));
  if (!row) return null;
  const notes = unseenNotes(row.lastSeen, await audiencesOf(me));
  if (notes.length === 0) return null;
  return (
    // Everything up to the latest is seen once this closes, including
    // releases with nothing meant for this member.
    <WhatsNewDialog latest={LATEST_RELEASE_NOTE}>
      <ReleaseNotesList notes={notes} />
    </WhatsNewDialog>
  );
}
