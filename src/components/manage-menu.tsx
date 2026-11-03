"use client";

import { cn } from "cn";
import { BookOpen, ChevronDown, Wrench } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { ManageMenu } from "@/lib/manage";

import { MANAGE_ICONS } from "./manage-icons";

// The Manage tab in the header: a menu of what the member can manage,
// rather than a page to go through first.  Phones get the tab bar, whose
// Manage tab opens the same list as a page.
export function ManageDropdown({
  menu,
  active,
  className,
}: {
  menu: ManageMenu;
  // The current page is one of these.
  active: boolean;
  className: string;
}) {
  // Controlled, so following a link closes it: the layout, and with it
  // the menu, stays mounted across the navigation.
  const [open, setOpen] = useState(false);
  const item =
    "flex h-10 w-full items-center gap-2 rounded-md px-2 text-sm font-medium hover:bg-muted";
  const close = () => setOpen(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          className,
          "outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        )}
      >
        <Wrench aria-hidden className="size-4" />
        Manage
        <ChevronDown aria-hidden className="size-3.5" />
        {active && <span className="sr-only">(current section)</span>}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 gap-1 p-1.5">
        {menu.links.map((link) => {
          const Icon = MANAGE_ICONS[link.icon];
          return (
            <Link
              key={link.href}
              href={link.href}
              className={item}
              onClick={close}
            >
              <Icon aria-hidden className="size-4 text-muted-foreground" />
              {link.label}
            </Link>
          );
        })}
        {menu.aircraft.length > 0 && (
          <>
            <div className="my-1 border-t" />
            <p className="px-2 pt-1 text-xs font-medium text-muted-foreground">
              Your aircraft
            </p>
            {menu.aircraft.map((plane) => (
              <div
                key={plane.id}
                className="flex items-center justify-between gap-2 pl-2"
              >
                <span className="text-sm font-medium">{plane.tailNumber}</span>
                <span className="flex">
                  <Link
                    href={`/aircraft/${plane.id}/maintenance`}
                    aria-label={`${plane.tailNumber} maintenance`}
                    className="flex h-10 items-center gap-1.5 rounded-md px-2 text-sm hover:bg-muted"
                    onClick={close}
                  >
                    <Wrench aria-hidden className="size-4" />
                    Maintenance
                  </Link>
                  <Link
                    href={`/aircraft/${plane.id}/flights`}
                    aria-label={`${plane.tailNumber} flights`}
                    className="flex h-10 items-center gap-1.5 rounded-md px-2 text-sm hover:bg-muted"
                    onClick={close}
                  >
                    <BookOpen aria-hidden className="size-4" />
                    Flights
                  </Link>
                </span>
              </div>
            ))}
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
