import "server-only";

import { asc, inArray } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/db";
import { aircraft } from "@/db/schema";
import { hasRole } from "@/lib/access";
import { maintainedAircraft } from "@/lib/captains";
import type { Member } from "@/lib/session";

export type ManageLink = {
  href: string;
  label: string;
  description: string;
  icon: "aircraft" | "members" | "reports";
  // Left off phones, for pages too wide for them.
  notOnPhones?: boolean;
};

export type ManageMenu = {
  links: ManageLink[];
  // A captain's own aircraft, to reach their maintenance and flights.
  // Officers manage every aircraft from the Aircraft page instead.
  aircraft: { id: string; tailNumber: string }[];
};

// What a member can manage, for the Manage tab's menu and page: officers
// the aircraft and members, captains their own aircraft, and both of
// them reports.  Null when there's nothing, and so no tab.  The pages
// check permissions themselves; this only decides what to offer.
export const manageMenu = cache(
  async (member: Member): Promise<ManageMenu | null> => {
    if (!member.active) return null;
    const maintained = await maintainedAircraft(member);
    const officer = hasRole(member, "officer");
    if (!officer && maintained.length === 0) return null;

    const links: ManageLink[] = [];
    if (officer) {
      links.push(
        {
          href: "/aircraft",
          label: "Aircraft",
          description: "Add aircraft and change their meters and settings.",
          icon: "aircraft",
        },
        {
          href: "/members",
          label: "Members",
          description: "Approve members, and set roles and qualifications.",
          icon: "members",
        },
      );
    }
    links.push({
      href: "/reports",
      label: "Reports",
      description: "Oil, the mechanic's report and flights, as PDFs.",
      icon: "reports",
      notOnPhones: true,
    });

    const own =
      maintained === "all" || maintained.length === 0
        ? []
        : await db()
            .select({ id: aircraft.id, tailNumber: aircraft.tailNumber })
            .from(aircraft)
            .where(inArray(aircraft.id, maintained))
            .orderBy(asc(aircraft.tailNumber));
    return { links, aircraft: own };
  },
);
