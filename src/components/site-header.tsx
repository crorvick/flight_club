import Link from "next/link";
import { Suspense } from "react";

import { hasRole } from "@/lib/access";
import { getCurrentMember, type Member } from "@/lib/session";

import { AccountMenu } from "./account-menu";
import { BrandMark } from "./brand-mark";
import { type NavKey, NavLinks } from "./nav-links";

// What a member can reach from anywhere: everyone sees the fleet, pilots
// fly and report squawks, officers manage the aircraft and members.  The
// pages check permissions themselves; this only decides what to offer.
function navKeys(member: Member | null): NavKey[] {
  if (!member?.active) return [];
  const pilot = hasRole(member, "pilot");
  const officer = hasRole(member, "officer");
  const keys: NavKey[] = ["home", "fleet"];
  if (pilot) keys.push("squawk");
  if (officer) keys.push("aircraft", "members");
  // Five tabs is as many as a phone fits; officers reach their profile
  // from the account menu instead.
  else if (pilot) keys.push("profile");
  return keys;
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-6 px-4">
        <Link
          href="/"
          className="flex items-center gap-2 font-semibold tracking-tight"
        >
          <BrandMark />
          Flight Club
        </Link>
        {/* Reads the session, so it streams in after the static shell. */}
        <Suspense fallback={null}>
          <HeaderNav />
        </Suspense>
      </div>
    </header>
  );
}

async function HeaderNav() {
  const member = await getCurrentMember();
  return (
    <>
      <nav aria-label="Main" className="hidden md:block">
        <NavLinks keys={navKeys(member)} variant="header" />
      </nav>
      {/* Signed out, the page itself offers to sign in. */}
      {member && (
        <div className="ml-auto">
          <AccountMenu
            name={member.name}
            email={member.email}
            roles={member.roles}
            pilot={hasRole(member, "pilot")}
          />
        </div>
      )}
    </>
  );
}

// Fixed to the bottom of a phone screen, clear of the home indicator.
export function TabBar() {
  return (
    <Suspense fallback={null}>
      <Tabs />
    </Suspense>
  );
}

async function Tabs() {
  const keys = navKeys(await getCurrentMember());
  if (keys.length === 0) return null;
  return (
    <nav
      aria-label="Tabs"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <NavLinks keys={keys} variant="tabs" />
    </nav>
  );
}
