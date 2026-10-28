import type { Metadata } from "next";
import Link from "next/link";

import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in · Flight Club" };

export default function SignInPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
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
