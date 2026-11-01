import Link from "next/link";

export default function FlightsLayout({ children }: LayoutProps<"/flights">) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-6 md:max-w-2xl">
      <nav>
        <Link
          href="/"
          className="inline-flex h-11 items-center text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          ← Flight Club
        </Link>
      </nav>
      {children}
    </main>
  );
}
