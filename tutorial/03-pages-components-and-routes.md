# Chapter 3. Pages, Components and Routes

Time to put something on the screen. In this chapter we'll learn React,
the library that describes user interfaces as components, and the
Next.js App Router, which turns a folder structure into a website. By
the end we'll have the skeleton of Flight Club: a shared header, a
fleet page listing aircraft, and a page for each aircraft.

In this chapter you'll learn:

- How React components and JSX describe a user interface
- How Next.js maps folders to URLs
- What layouts, route groups and dynamic segments are
- What a Server Component is, and why it's the default
- How to style with Tailwind CSS, and where shadcn/ui fits in

## Components and JSX

A **React component** is a function that returns a description of some
UI. That description is written in **JSX**, an HTML-like syntax that
compiles to ordinary function calls:

```tsx
function AircraftCard({
  tailNumber,
  makeModel,
}: {
  tailNumber: string;
  makeModel: string;
}) {
  return (
    <section className="rounded-xl border p-4">
      <h2 className="text-lg font-semibold">{tailNumber}</h2>
      <p className="text-muted-foreground">{makeModel}</p>
    </section>
  );
}
```

A few things to notice:

- The function receives one argument, conventionally called **props**,
  and here destructured into `tailNumber` and `makeModel`.
- Curly braces embed any JavaScript expression in the markup:
  `{tailNumber}`.
- `className` replaces HTML's `class` (because `class` is a reserved
  word in JavaScript).
- Component names start with a capital letter; lowercase names like
  `section` are HTML elements.

Components compose. A list of aircraft is a component that renders
other components:

```tsx
function Fleet({
  planes,
}: {
  planes: { id: string; tailNumber: string; makeModel: string }[];
}) {
  return (
    <ul className="grid gap-4 md:grid-cols-2">
      {planes.map((plane) => (
        <li key={plane.id}>
          <AircraftCard
            tailNumber={plane.tailNumber}
            makeModel={plane.makeModel}
          />
        </li>
      ))}
    </ul>
  );
}
```

`planes.map(...)` turns an array of data into an array of elements.
Each needs a stable, unique `key` so React can tell items apart when the
list changes; use a database id, never the array index.

Conditional rendering is ordinary JavaScript:

```tsx
{
  plane.checkedOutTo && <p>Out with {plane.checkedOutTo}</p>;
}
{
  plane.status === "grounded" ? <Badge>Grounded</Badge> : null;
}
```

> [!NOTE]
> React automatically escapes anything you put in braces. If a member
> names a squawk `<script>alert(1)</script>`, React renders it as visible
> text, not as a script. That protects you from the most common web
> vulnerability, cross-site scripting (XSS), by default. The escape hatch
> is called `dangerouslySetInnerHTML` precisely so you'll think twice.
> Flight Club uses it exactly once, for a fixed script that we wrote
> ourselves (Chapter 9).

## Routing: Folders Are URLs

The Next.js **App Router** maps the folder structure under `src/app` to
URLs. A folder becomes a URL segment, and a `page.tsx` file inside it
makes that URL a page:

```text
src/app/
  page.tsx                   →  /
  fleet/page.tsx             →  /fleet
  aircraft/page.tsx          →  /aircraft
  aircraft/new/page.tsx      →  /aircraft/new
  aircraft/[id]/page.tsx     →  /aircraft/3f2c…  (any id)
```

A page is just a component, exported as the file's default:

```tsx
// src/app/fleet/page.tsx
export default function FleetPage() {
  return <h1 className="text-2xl font-semibold">Fleet</h1>;
}
```

### Dynamic Segments

A folder name in square brackets is a **dynamic segment**: it matches
any value, and the page receives it in `params`. In Next.js 16, `params`
is a Promise, because it may not be known until request time:

```tsx
// src/app/aircraft/[id]/page.tsx
export default async function AircraftPage({
  params,
}: PageProps<"/aircraft/[id]">) {
  const { id } = await params;
  return <h1>Aircraft {id}</h1>;
}
```

`PageProps<"/aircraft/[id]">` is a type that Next.js generates from your
folder structure (`next typegen`, which our `pnpm typecheck` script
runs). It knows this route has an `id` parameter, so a typo like
`params.idd` is a compile error.

Query strings (`/reports/oil?aircraft=…`) arrive the same way, in
`searchParams`.

### Layouts

A `layout.tsx` wraps every page beneath it. The root layout provides
the `<html>` and `<body>` tags:

```tsx
// src/app/layout.tsx (simplified)
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Flight Club",
  description: "Flight log, squawks and maintenance for the club fleet",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
```

`children` is whatever page (or nested layout) is being shown. Layouts
persist across navigation: moving from `/fleet` to `/aircraft` re-renders
only the page, not the header around it.

### Route Groups

Sign-in pages shouldn't have the app's navigation header; everything
else should. A folder name in parentheses is a **route group**: it
organizes files and can have its own layout, but doesn't appear in the
URL:

```text
src/app/
  layout.tsx               <html>, <body>, fonts
  (auth)/
    layout.tsx             A centered card
    sign-in/page.tsx       →  /sign-in
    sign-up/page.tsx       →  /sign-up
  (member)/
    layout.tsx             Header, main column, tab bar
    page.tsx               →  /
    fleet/page.tsx         →  /fleet
    squawks/new/page.tsx   →  /squawks/new
    ...
```

Here's the real member layout, which every signed-in page shares:

```tsx
// src/app/(member)/layout.tsx (simplified)
import { SiteHeader, TabBar } from "@/components/site-header";

export default function MemberLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-28 md:pb-10">
        {children}
      </main>
      <TabBar />
    </>
  );
}
```

The `<>…</>` is a **fragment**: a way to return several elements without
wrapping them in an extra `<div>`.

### Other Special Files

The App Router gives meaning to a few other file names:

| File            | Purpose                                         |
| --------------- | ----------------------------------------------- |
| `loading.tsx`   | Shown while a page in this folder is loading    |
| `error.tsx`     | Shown if rendering throws                       |
| `not-found.tsx` | Shown when code calls `notFound()`              |
| `forbidden.tsx` | Shown when code calls `forbidden()` (Chapter 7) |
| `route.ts`      | An HTTP endpoint instead of a page (below)      |

Everything else in a route folder (helper components, form code,
actions) is private to it, and is a good place to put code that only
that route uses. Flight Club keeps a route's forms and actions beside
its pages, and moves code into `src/components` or `src/lib` only once
more than one route needs it.

### Route Handlers

Not every URL is a page. A `route.ts` file exports functions named
after HTTP methods and returns a standard `Response`. This is the
health check you met in Chapter 1:

```ts
// src/app/api/health/route.ts (simplified)
export async function GET() {
  return Response.json({ status: "ok", sha: process.env.GIT_SHA ?? "dev" });
}
```

We'll write two more: one for Better Auth's endpoints (Chapter 7) and
one that serves squawk photos (Chapter 10).

## Linking Between Pages

Use Next's `<Link>` instead of a plain `<a>`:

```tsx
import Link from "next/link";

<Link href={`/squawks/${squawk.id}`}>{squawk.description}</Link>;
```

It renders a normal `<a>` tag, so it works without JavaScript, but once
the page's JavaScript has loaded it intercepts the click, fetches only
what changed, and swaps it in without a full page reload. It also
**prefetches** links as they scroll into view, so navigation feels
instant.

## Server Components

Here's the idea that most distinguishes modern React from what you may
have read about it. By default, every component in the App Router is a
**Server Component**: it runs only on the server, and only its HTML
output is sent to the browser. Its code never reaches the browser at
all.

That means a Server Component can be `async` and fetch its own data
directly:

```tsx
// src/app/(member)/fleet/page.tsx (an early version)
import { db } from "@/db";
import { aircraft } from "@/db/schema";

export default async function FleetPage() {
  const planes = await db().select().from(aircraft);
  return (
    <ul>
      {planes.map((p) => (
        <li key={p.id}>{p.tailNumber}</li>
      ))}
    </ul>
  );
}
```

No API endpoint, no loading spinner logic, no JSON serialization. The
query runs on the server, the HTML is sent, done. We'll build `db()` in
Chapter 5.

The trade-off is that a Server Component can't be _interactive_. It
can't respond to clicks or keep state, because by the time the user
sees it, it has finished running. For that we need **Client
Components**, which are covered in Chapter 9. For now, notice how far
you can get without them: Flight Club's fleet page, aircraft pages,
reports and most of the home page are entirely Server Components.

> [!IMPORTANT]
> Server Components are where data access and permission checks live.
> Because their code never ships to the browser, they can safely use
> database connections and secrets. To make sure server-only code can
> never be accidentally imported into the browser, files like
> `src/db/index.ts` and `src/lib/session.ts` start with
> `import "server-only";`, which turns such a mistake into a build error.

## Styling with Tailwind CSS

**Tailwind** is a CSS framework of small, single-purpose classes that
you combine directly in markup:

```tsx
<section className="rounded-xl border bg-card p-4 md:p-6">
```

- `rounded-xl` rounds the corners.
- `border` adds a 1px border in the theme's border color.
- `bg-card` sets the background to the theme's card color.
- `p-4` adds padding; `md:p-6` adds more on screens at least 768px wide.

That last one shows Tailwind's **responsive prefixes**: `sm:`, `md:`,
`lg:` apply a class only at and above a width. The design is
**mobile-first**: unprefixed classes are for phones, and prefixes add
changes for larger screens. Because most Flight Club use is on phones,
that's the right default. Similar prefixes exist for states and media:
`hover:`, `focus-visible:`, `dark:`, and `print:`.

Tailwind can feel noisy at first. The benefits become clear on a real
project: styles live next to the markup they affect, there's no
naming of CSS classes, deleting a component deletes its styles, and the
build ships only the classes you actually use.

> [!TIP]
> The project uses `prettier-plugin-tailwindcss`, which sorts class
> names into a consistent order on save. It makes long class lists much
> easier to scan.

### Components with shadcn/ui

Buttons, dialogs, menus and popovers are surprisingly hard to build
well: keyboard handling, focus management, screen reader announcements,
closing on Escape or an outside click. **shadcn/ui** provides accessible
versions of these, built on a headless component library (Base UI) and
styled with Tailwind.

Unusually, shadcn/ui isn't a dependency you import. Its CLI copies each
component's source into your project, under `src/components/ui/`, and
from then on it's your code to adjust:

```sh
pnpm dlx shadcn@latest add button dialog popover
```

```tsx
import { Button } from "@/components/ui/button";

<Button variant="outline">Show</Button>;
```

## The Shape So Far

With these pieces, the skeleton of the app is:

```text
src/
  app/
    layout.tsx               Root: <html>, fonts, global CSS
    (auth)/                  Sign in, sign up
    (member)/
      layout.tsx             Header and tab bar
      page.tsx               Home
      fleet/page.tsx         Every aircraft's status
      aircraft/[id]/page.tsx One aircraft
    api/health/route.ts      Health check
  components/                Shared UI: header, nav, form fields
    ui/                      shadcn/ui components
  lib/                       Logic shared between routes
```

It renders, but everything is hard-coded. In the next part of the book
we give it somewhere to keep its data.

## Summary

- React components are functions that return JSX. They take props and
  compose into larger components.
- The App Router maps folders under `src/app` to URLs. `page.tsx` is a
  page, `layout.tsx` wraps pages, `[id]` is a dynamic segment, `(group)`
  organizes without affecting the URL, and `route.ts` is a raw HTTP
  endpoint.
- Components are Server Components by default: they run on the server,
  can fetch data directly, and send only HTML.
- Tailwind styles with utility classes, mobile-first. shadcn/ui
  provides accessible building blocks copied into your project.

## Exercises

1. Add a page at `/about` that shows the club's name and a link back to
   the home page. Which folder did you create?
2. In the finished project, find every `layout.tsx` under `src/app`.
   Draw the tree of layouts that wraps `/squawks/new`.
3. Resize your browser across 768px while looking at the Fleet page.
   Find the class responsible for switching from one column to two.

**Next:** [Chapter 4. Thinking in Tables](04-thinking-in-tables.md)
