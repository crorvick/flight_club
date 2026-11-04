import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { signInError } from "@/lib/sign-in-methods";

import { SocialSignIn } from "../social-sign-in";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in · Flight Club" };

export default function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      <Suspense fallback={null}>
        <Social searchParams={searchParams} />
      </Suspense>
      <SignInForm />
      <p className="text-sm text-muted-foreground">
        New to the club?{" "}
        <Link href="/sign-up" className="font-medium text-foreground underline">
          Create an account
        </Link>
      </p>
    </>
  );
}

// A failed Google or Apple sign-in comes back here with ?error=<code>.
async function Social({
  searchParams,
}: Pick<PageProps<"/sign-in">, "searchParams">) {
  const { error } = await searchParams;
  return <SocialSignIn error={signInError(error)} />;
}
