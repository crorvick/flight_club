import { cn } from "cn";
import Link from "next/link";
import { Suspense } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { getCurrentMember } from "@/lib/session";

import { signOut } from "./(auth)/actions";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 py-8 md:max-w-2xl">
      <h1 className="text-3xl font-semibold tracking-tight">Flight Club</h1>
      <p className="text-muted-foreground">
        Log flights, report squawks and keep track of the fleet.
      </p>
      {/* Reads the session, so it streams in after the static shell. */}
      <Suspense fallback={<div className="h-11" />}>
        <MemberStatus />
      </Suspense>
    </main>
  );
}

async function MemberStatus() {
  const member = await getCurrentMember();

  if (!member) {
    return (
      <div className="flex flex-col gap-3 sm:flex-row">
        {/* Links styled as buttons: they navigate, so they stay links for
            screen readers. */}
        <Link
          href="/sign-in"
          className={cn(buttonVariants(), "h-11 text-base")}
        >
          Sign in
        </Link>
        <Link
          href="/sign-up"
          className={cn(
            buttonVariants({ variant: "outline" }),
            "h-11 text-base",
          )}
        >
          Create account
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {member.active ? (
        <p>
          Signed in as <span className="font-medium">{member.name}</span>
          {member.roles.length > 0 && <> ({member.roles.join(", ")})</>}.
        </p>
      ) : (
        <p role="status">
          Thanks, {member.name}. Your account is waiting for an officer to
          approve it.
        </p>
      )}
      <form action={signOut}>
        <Button type="submit" variant="outline" className="h-11 text-base">
          Sign out
        </Button>
      </form>
    </div>
  );
}
