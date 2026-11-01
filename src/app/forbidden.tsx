import Link from "next/link";

// Rendered inside the route's own layout, which provides the <main>.
export default function Forbidden() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Not allowed</h1>
      <p className="text-muted-foreground">
        Your account doesn&apos;t have permission to do that. If you think it
        should, ask an officer.
      </p>
      <Link href="/" className="font-medium underline">
        Back to the home page
      </Link>
    </div>
  );
}
