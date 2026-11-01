"use client";

import Link from "next/link";
import { useRef, useState } from "react";

import { markReleaseNotesSeen } from "@/app/(member)/whats-new/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Opens by itself; however it's closed, the notes count as seen.
export function WhatsNewDialog({
  latest,
  children,
}: {
  // The newest release notes, all of which count as seen once closed.
  latest: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const gotIt = useRef<HTMLButtonElement>(null);
  const close = () => {
    setOpen(false);
    void markReleaseNotesSeen(latest);
  };
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : close())}>
      <DialogContent
        initialFocus={gotIt}
        className="max-h-[85dvh] overflow-y-auto sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle>What&apos;s new</DialogTitle>
          <DialogDescription>Since you were last here.</DialogDescription>
        </DialogHeader>
        {children}
        <DialogFooter>
          <Link
            href="/whats-new"
            onClick={close}
            className="self-center text-sm font-medium text-primary hover:underline sm:mr-auto"
          >
            All updates
          </Link>
          <Button ref={gotIt} className="h-11 px-6 text-base" onClick={close}>
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
