import { SiteHeader, TabBar } from "@/components/site-header";

export default function MemberLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <SiteHeader />
      {/* Bottom padding keeps the end of the page clear of the tab bar on
          phones. */}
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 pt-6 pb-28 md:max-w-2xl md:pb-10">
        {children}
      </main>
      <TabBar />
    </>
  );
}
