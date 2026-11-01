"use client";

import { cn } from "cn";
import {
  FileText,
  House,
  Megaphone,
  Plane,
  type LucideIcon,
  UserRound,
  Users,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavKey =
  "home" | "fleet" | "squawk" | "profile" | "aircraft" | "members" | "reports";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  // The pages that count as this section, as path prefixes.  The longest
  // match wins, so /squawks/new is Squawk while /squawks/<id> is Fleet.
  sections: string[];
  // Left out of the tab bar on phones, for pages too wide for them.  A
  // tablet narrow enough to get the tab bar still gets it.
  notOnPhones?: boolean;
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
  aircraft: {
    href: "/aircraft",
    label: "Aircraft",
    icon: Wrench,
    sections: ["/aircraft", "/maintenance"],
  },
  members: {
    href: "/members",
    label: "Members",
    icon: Users,
    sections: ["/members"],
  },
  reports: {
    href: "/reports",
    label: "Reports",
    icon: FileText,
    sections: ["/reports"],
    notOnPhones: true,
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
}: {
  keys: NavKey[];
  variant: "header" | "tabs";
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
        const { href, label, icon: Icon, notOnPhones } = ITEMS[key];
        const active = key === current;
        return (
          <li
            key={key}
            className={cn(
              notOnPhones && variant === "tabs" && "hidden sm:block",
            )}
          >
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                variant === "header"
                  ? "flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  : "flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted-foreground",
                active &&
                  (variant === "header"
                    ? "bg-secondary text-secondary-foreground"
                    : "text-primary"),
              )}
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
