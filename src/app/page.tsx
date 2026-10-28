export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 py-8 md:max-w-2xl">
      <h1 className="text-3xl font-semibold tracking-tight">Flight Club</h1>
      <p className="text-muted-foreground">
        Log flights, report squawks and keep track of the fleet.
      </p>
    </main>
  );
}
