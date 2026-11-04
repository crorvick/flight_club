"use client";

import { BookUser, IdCard, LogOut, Megaphone, Settings } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { signOut } from "@/app/(auth)/actions";
import { Avatar } from "@/components/avatar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const ROLE_LABELS: Record<string, string> = {
  officer: "Officer",
  pilot: "Pilot",
};

export function AccountMenu({
  name,
  email,
  avatar,
  roles,
  active,
  pilot,
}: {
  name: string;
  email: string;
  // Their Gravatar, if they have one.
  avatar: string;
  roles: string[];
  // Approved, so they can see the other members.
  active: boolean;
  pilot: boolean;
}) {
  // Controlled, so following a link closes it: the layout, and with it
  // the menu, stays mounted across the navigation.
  const [open, setOpen] = useState(false);
  const item =
    "flex h-10 w-full items-center gap-2 rounded-md px-2 text-sm font-medium hover:bg-muted";
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label="Account"
        className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Avatar name={name} src={avatar} />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 gap-1 p-1.5">
        <div className="px-2 py-1.5">
          <p className="font-medium">{name}</p>
          <p className="truncate text-muted-foreground">{email}</p>
          {roles.length > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              {roles.map((r) => ROLE_LABELS[r] ?? r).join(" · ")}
            </p>
          )}
        </div>
        <div className="border-t" />
        {pilot && (
          <Link
            href="/qualifications"
            className={item}
            onClick={() => setOpen(false)}
          >
            <IdCard aria-hidden className="size-4 text-muted-foreground" />
            My qualifications
          </Link>
        )}
        {active && (
          <Link
            href="/directory"
            className={item}
            onClick={() => setOpen(false)}
          >
            <BookUser aria-hidden className="size-4 text-muted-foreground" />
            Member directory
          </Link>
        )}
        <Link href="/settings" className={item} onClick={() => setOpen(false)}>
          <Settings aria-hidden className="size-4 text-muted-foreground" />
          Settings
        </Link>
        <Link href="/whats-new" className={item} onClick={() => setOpen(false)}>
          <Megaphone aria-hidden className="size-4 text-muted-foreground" />
          What&apos;s new
        </Link>
        <form action={signOut}>
          <button type="submit" className={item}>
            <LogOut aria-hidden className="size-4 text-muted-foreground" />
            Sign out
          </button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
