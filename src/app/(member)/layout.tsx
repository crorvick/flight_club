import { SiteHeader, TabBar } from "@/components/site-header";

export default function MemberLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <SiteHeader />
      {/* A readable centre column for forms and records; a page marks a
          child "wide" to use the header's full width for lists and the
          dashboard.  Bottom padding keeps the end of the page clear of
          the tab bar on phones. */}
      <main className="mx-auto grid w-full max-w-5xl flex-1 grid-cols-[1fr_min(42rem,100%)_1fr] content-start gap-y-6 px-4 pt-6 pb-28 *:col-start-2 md:pb-10 [&>.wide]:col-span-full [&>.wide]:col-start-1">
        {children}
      </main>
      <TabBar />
    </>
  );
}
