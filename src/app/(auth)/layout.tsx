import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-6 px-4 py-10">
      <Link
        href="/"
        className="flex items-center gap-2 self-start font-semibold tracking-tight"
      >
        <BrandMark />
        Flight Club
      </Link>
      <div className="flex flex-col gap-6 rounded-xl border bg-card p-6 shadow-sm">
        {children}
      </div>
    </main>
  );
}
