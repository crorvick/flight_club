"use client";

import { cn } from "cn";
import {
  House,
  Megaphone,
  Plane,
  type LucideIcon,
  UserRound,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import type { ManageMenu } from "@/lib/manage";

import { ManageDropdown } from "./manage-menu";

export type NavKey = "home" | "fleet" | "squawk" | "profile" | "manage";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  // The pages that count as this section, as path prefixes.  The longest
  // match wins, so /squawks/new is Squawk while /squawks/<id> is Fleet.
  sections: string[];
};

const ITEMS: Record<NavKey, NavItem> = {
  home: {
    href: "/",
    label: "Home",
    icon: House,
    sections: ["/check-out", "/dispatches", "/flights"],
  },
  fleet: {
    href: "/fleet",
    label: "Fleet",
    icon: Plane,
    sections: ["/fleet", "/squawks"],
  },
  squawk: {
    href: "/squawks/new",
    label: "Squawk",
    icon: Megaphone,
    sections: ["/squawks/new"],
  },
  profile: {
    href: "/qualifications",
    label: "Profile",
    icon: UserRound,
    sections: ["/qualifications"],
  },
  // Everything officers and plane captains look after, as a menu in the
  // header and a page of its own on phones.
  manage: {
    href: "/manage",
    label: "Manage",
    icon: Wrench,
    sections: ["/manage", "/aircraft", "/maintenance", "/members", "/reports"],
  },
};

function currentSection(pathname: string, keys: NavKey[]) {
  if (pathname === "/") return "home";
  let best: { key: NavKey; length: number } | undefined;
  for (const key of keys) {
    for (const prefix of ITEMS[key].sections) {
      const matches = pathname === prefix || pathname.startsWith(`${prefix}/`);
      if (matches && prefix.length > (best?.length ?? 0)) {
        best = { key, length: prefix.length };
      }
    }
  }
  return best?.key;
}

// The sections a member can reach, as links in the header on wider
// screens and as a tab bar along the bottom on phones, where a thumb can
// reach it.
export function NavLinks({
  keys,
  variant,
  manage,
}: {
  keys: NavKey[];
  variant: "header" | "tabs";
  // What the Manage menu offers, for the header's dropdown.
  manage?: ManageMenu | null;
}) {
  const current = currentSection(usePathname(), keys);
  return (
    <ul
      className={cn(
        variant === "header"
          ? "flex items-center gap-1"
          : "grid auto-cols-fr grid-flow-col",
      )}
    >
      {keys.map((key) => {
        const { href, label, icon: Icon } = ITEMS[key];
        const active = key === current;
        const className = cn(
          variant === "header"
            ? "flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            : "flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted-foreground",
          active &&
            (variant === "header"
              ? "bg-secondary text-secondary-foreground"
              : "text-primary"),
        );
        if (key === "manage" && variant === "header" && manage) {
          return (
            <li key={key}>
              <ManageDropdown
                menu={manage}
                active={active}
                className={className}
              />
            </li>
          );
        }
        return (
          <li key={key}>
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={className}
            >
              <Icon
                aria-hidden
                className={variant === "header" ? "size-4" : "size-5"}
              />
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
