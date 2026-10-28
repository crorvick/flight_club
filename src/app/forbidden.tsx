import Link from "next/link";

export default function Forbidden() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Not allowed</h1>
      <p className="text-muted-foreground">
        Your account doesn&apos;t have permission to do that. If you think it
        should, ask an officer.
      </p>
      <Link href="/" className="font-medium underline">
        Back to the home page
      </Link>
    </main>
  );
}
