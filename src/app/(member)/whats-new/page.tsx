import type { Metadata } from "next";
import { Suspense } from "react";

import { ListSkeleton } from "@/components/page-skeleton";
import { ReleaseNotesList } from "@/components/release-notes-list";
import { audiencesOf } from "@/components/whats-new";
import { notesFor, RELEASE_NOTES } from "@/lib/release-notes";
import { requireMember } from "@/lib/session";

export const metadata: Metadata = { title: "What's new · Flight Club" };

export default function WhatsNewPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">What&apos;s new</h1>
      <Suspense fallback={<ListSkeleton rows={3} />}>
        <AllNotes />
      </Suspense>
    </>
  );
}

// Every release's notes, for going back to after the popup.
async function AllNotes() {
  const me = await requireMember();
  const notes = notesFor(RELEASE_NOTES, await audiencesOf(me));
  return (
    <div className="rounded-xl border bg-card p-4 sm:p-5">
      <ReleaseNotesList notes={notes} />
    </div>
  );
}
