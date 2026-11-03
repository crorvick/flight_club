# Chapter 9. Interactive Interfaces

So far nearly everything has run on the server. That's the right
default, but some things only the browser can do: respond to a tap
without a round trip, show a live duration as a pilot types a meter
reading, know the viewer's time zone, open the print dialog. This
chapter covers Client Components, the boundary between server and
client, and the craft of building interfaces that work on a phone in
the sun, a tablet in the hangar, and a desktop in the clubhouse.

In this chapter you'll learn:

- What Client Components are, and how to choose where the boundary goes
- What hydration is, and the bugs it can cause
- How React state and hooks work
- How to build accessible, responsive, phone-first UI
- How dark mode and print styles work
- What to keep in the browser's own storage

## Client Components

A file that starts with `"use client"` defines **Client Components**.
They're rendered to HTML on the server like any other component, so the
page still arrives complete, but their code is _also_ sent to the
browser, where React takes over and makes them interactive.

```tsx
// src/components/print-button.tsx
"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

// The browser's print dialog, where "Save as PDF" is one of the
// destinations; the print styles in globals.css lay the page out for it.
export function PrintButton() {
  return (
    <Button variant="outline" onClick={() => window.print()}>
      <Printer aria-hidden />
      Save as PDF
    </Button>
  );
}
```

`onClick` needs JavaScript running in the browser, so this must be a
Client Component. The report page that uses it remains a Server
Component that queries the database; it simply renders
`<PrintButton />` in its header.

### Where to Draw the Boundary

`"use client"` marks a _boundary_: the file and everything it imports
becomes part of the browser bundle. Server Components can render Client
Components and pass them props, but not the other way around (a Client
Component can't import a Server Component, though it can receive one as
`children`).

The rule of thumb: **push the boundary as far down the tree as you
can.** Make the smallest piece that needs interactivity a Client
Component, and leave the page, the data loading, and the layout on the
server. A whole page marked `"use client"` gives up direct database
access and ships all its code to every phone.

Props passed across the boundary must be **serializable**: strings,
numbers, booleans, arrays, plain objects, `Date`s, and Server Actions.
Not arbitrary functions or class instances. Server Actions are the
exception that makes forms work: you pass `reportSquawk.bind(null,
plane.id)` from a server page into a client form, and when the form
calls it, it runs on the server.

> [!WARNING]
> Anything passed to a Client Component is visible in the page source.
> Never pass a whole database record "for convenience" if it contains
> fields the viewer shouldn't see. Select only the columns the component
> needs.

## State and Hooks

A Client Component can remember things between renders using **state**:

```tsx
const [photos, setPhotos] = useState<Photo[]>([]);
```

`useState` returns the current value and a function to change it.
Calling the setter re-renders the component with the new value. You
never modify state directly (`photos.push(...)` does nothing visible);
you give React a new value:

```tsx
setPhotos((prev) => [...prev, ...added]);
setPhotos((prev) => prev.filter((p) => p.id !== id));
```

Functions starting with `use` are **hooks**. The ones you'll meet most:

| Hook                       | Purpose                                                           |
| -------------------------- | ----------------------------------------------------------------- |
| `useState`                 | A value that, when changed, re-renders the component              |
| `useActionState`           | Form state returned by a Server Action (Chapter 6)                |
| `useTransition`            | Run an async update and know whether it's pending                 |
| `useEffect`                | Synchronize with something outside React (subscriptions, cleanup) |
| `useRef`                   | A mutable box that survives re-renders without causing them       |
| `useRouter`, `usePathname` | Navigate, and read the current path (from `next/navigation`)      |

Hooks must be called at the top level of a component, in the same order
every render: never inside an `if` or a loop. ESLint's React rules
enforce this.

Here's state and effects together, in the squawk form's photo picker.
Each photo gets an **object URL** (`blob:…`) so a thumbnail can be shown
before upload. Those hold memory until released, so the component frees
them when the user removes a photo and when they leave the page:

```tsx
// src/app/(member)/squawks/squawk-form.tsx (excerpt)
function removePhoto(id: string) {
  setPhotos((prev) => {
    const gone = prev.find((p) => p.id === id);
    if (gone) URL.revokeObjectURL(gone.url);
    return prev.filter((p) => p.id !== id);
  });
}

// Free the thumbnails' memory when leaving the page.
const photosRef = useRef(photos);
useEffect(() => {
  photosRef.current = photos;
}, [photos]);
useEffect(
  () => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.url)),
  [],
);
```

The function returned from an effect is its **cleanup**, run when the
component goes away.

> [!TIP]
> Before reaching for `useEffect`, ask whether you need it. Values that
> can be computed from props or state should simply be computed during
> render. Effects are for synchronizing with things outside React. Most
> components need none.

## Hydration

When a page with Client Components loads, the browser first shows the
server's HTML, then downloads the components' JavaScript and runs them
to attach event handlers. That step is called **hydration**. React
expects the first render in the browser to produce _exactly_ the same
output as the server did; if it doesn't, it warns about a **hydration
mismatch** and may discard the server's HTML.

The classic cause is something that differs between server and browser.
Time zones are the textbook case: the server doesn't know the viewer's
zone. Flight Club's `LocalTime` component handles it by rendering UTC on
the server and during hydration, then switching to local time
immediately after:

```tsx
// src/components/local-time.tsx
"use client";

import { useSyncExternalStore } from "react";
import { formatInstant, type InstantFormat } from "@/lib/dates";

const subscribe = () => () => {};

// An instant in the viewer's own time zone.  The server doesn't know it,
// so the server's HTML (and the first render in the browser, which must
// match it) shows UTC; the browser re-renders it locally straight after.
export function LocalTime({
  at,
  format = "datetime",
}: {
  at: Date;
  format?: InstantFormat;
}) {
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  return (
    <time dateTime={at.toISOString()}>
      {formatInstant(at, format, hydrated ? undefined : "UTC")}
    </time>
  );
}
```

`useSyncExternalStore` takes a "server snapshot" (the third argument,
`false`) used for the server render and hydration, and a "client
snapshot" (`true`) used afterwards. It's the idiomatic way to say "this
value is different in the browser."

There's a second, subtler hydration hazard: **a tap before hydration
does nothing**. The button is on screen, but its `onClick` isn't
attached yet. On a fast connection that window is tiny; on a phone at
the edge of the airfield it can be seconds. That's another reason to
prefer real forms with Server Actions, which work before hydration,
over click handlers, for anything that matters.

## Building for Phones First

Most Flight Club use is on a phone, outdoors, sometimes with gloves.
A few practices make a big difference:

**Big targets.** Interactive elements are at least 44px tall (`h-11`).
The squawk form's "Does this ground the airplane?" choices are full-width
56px cards rather than tiny radio buttons:

```tsx
// A radio styled as a big tappable card.  The input stays in the DOM (and
// the accessibility tree) but is visually hidden; the label is the target.
<label className="flex h-14 cursor-pointer items-center justify-center rounded-lg border has-checked:border-destructive has-checked:bg-destructive has-checked:text-white has-focus-visible:ring-3">
  <input type="radio" name="grounding" value="all" className="sr-only" />
  Yes, grounded
</label>
```

This keeps a real `<input type="radio">`, so keyboard navigation,
screen readers, form submission and our tests all work, while the
`label` provides the large visible target. `has-checked:` styles the
label when its input is selected. `sr-only` hides the input visually
but not from assistive technology.

**The right keyboard.** `type="email"`, `inputMode="decimal"` and
`autoComplete="current-password"` tell phones which keyboard to show
and let password managers fill in fields.

**16px text in inputs**, or iOS zooms in on focus.

**Navigation within thumb reach.** On phones the main navigation is a
tab bar fixed to the bottom of the screen; from the `md` breakpoint up
it moves into the header. Both render the same `NavLinks` component
with a different `variant`. The bottom bar pads itself clear of the
iPhone's home indicator with `pb-[env(safe-area-inset-bottom)]`.

**Wide content scrolls sideways.** A report table with eight columns
can't fit on a phone. Rather than squash it, it scrolls horizontally
inside its card (`overflow-x-auto`). Some pages, like Reports, aren't
offered on phones at all: the Manage page hides its link there
(`hidden sm:block`). They're still reachable, just not promoted where
they'd be awkward.

**Test on real devices.** Chapter 12 runs every test at iPhone, Android,
iPad and desktop sizes. Before releasing, open staging on an actual
phone.

> [!NOTE]
> **Can the server tell what device it's talking to?** Only roughly, from
> the `User-Agent` header, and that's unreliable. Prefer responsive CSS,
> which adapts to the actual screen size, over serving different content
> by device. The few things that truly differ by device (such as hover
> versus touch) have their own CSS media queries: `@media (hover: hover)`,
> `@media (pointer: coarse)`.

## Accessibility as a Habit

Accessible markup isn't extra work if you build it in from the start:

- Use real elements: `<button>`, `<a>`, `<label>`, `<fieldset>` with
  `<legend>`, `<table>` with `<th>`.
- Every input has a visible `<label>`. Icon-only buttons get an
  `aria-label` ("Remove photo 2").
- Decorative icons get `aria-hidden`.
- Status messages use `role="status"`; errors use `role="alert"`.
- Focus is visible (`focus-visible:ring-3`). Never remove an outline
  without replacing it.
- Color is never the only signal: a grounded aircraft has a red border
  _and_ the word "Grounded."

shadcn/ui's dialogs and popovers handle focus trapping and Escape for
you, which is the main reason to use them.

## Dark Mode

Many phones switch to dark mode automatically at sunset, and a dark
screen is easier on the eyes in a dark cockpit. Tailwind's `dark:`
variant applies styles in dark mode, and the theme's colors are CSS
variables redefined for dark. Flight Club follows the device by default,
and lets a member pin light or dark per device in Settings.

The choice is stored in the browser's **`localStorage`**, not the
database, because it's a per-device preference: the phone in the cockpit
and the computer at home may want different things. A custom variant in
`globals.css` makes `dark:` respond to either the device setting or an
explicit `data-theme` attribute on `<html>`:

```css
/* src/app/globals.css (excerpt) */
@custom-variant dark {
  &:where([data-theme="dark"], [data-theme="dark"] *) {
    @slot;
  }
  @media (prefers-color-scheme: dark) {
    &:where(
      :root:not([data-theme="light"]),
      :root:not([data-theme="light"]) *
    ) {
      @slot;
    }
  }
}
```

There's a catch. `localStorage` exists only in the browser, so the
server renders the page in the device's theme, and a member who pinned
"light" on a dark-mode phone would see a flash of dark before React
loads and corrects it. The fix is a tiny inline script in `<head>` that
runs before the first paint:

```ts
// src/lib/theme.ts (excerpt)
// Runs in <head> before the first paint, so a pinned theme never flashes
// the device's one first.  Anything unexpected in storage is ignored.
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("theme");
  if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;
```

```tsx
// src/app/layout.tsx (excerpt)
<html lang="en" suppressHydrationWarning>
  <head>
    <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
  </head>
```

`suppressHydrationWarning` tells React the script may have changed an
attribute on `<html>` before hydration, which is expected. Note the
`try`/`catch`: `localStorage` throws in some privacy modes, and a
preference must never break the page.

> [!NOTE]
> **What belongs in browser storage?** Per-device conveniences: a theme,
> a collapsed panel, a half-typed draft. Never anything that must be
> reliable, shared between devices, or trusted by the server. It can be
> cleared at any moment, and the user can edit it.

## Print and PDF

Officers print reports (oil consumption, everything since the last
annual for the mechanic, flights for billing) or save them as PDF. The
simplest, most robust way is the browser's own print dialog, which
offers "Save as PDF" on every platform. No PDF library is needed; just
print styles:

- `print:hidden` on the header, tab bar, buttons and filters.
- `break-inside-avoid` on table rows and report sections, so they don't
  split across pages.
- An `@media print` block that forces black on white whatever the
  on-screen theme, and sets the paper size:

```css
@media print {
  @page {
    size: letter;
    margin: 0.6in;
  }
  :root[data-theme],
  :root:not([data-theme]) {
    color-scheme: light;
    --background: #ffffff;
    --foreground: #000000;
    /* ... */
  }
}
```

Because colors are CSS variables, redefining a handful of them restyles
the whole page for paper.

## Summary

- Client Components (`"use client"`) are rendered on the server _and_
  hydrated in the browser. Keep the boundary low in the tree, and pass
  only serializable, non-sensitive props.
- State changes re-render; hooks are called unconditionally at the top
  level. Most components need no effects.
- The first browser render must match the server's. Use
  `useSyncExternalStore` for values that differ, like local time.
- Design for phones first: large targets, correct keyboards, navigation
  within reach, wide content that scrolls.
- Accessibility comes from using the right elements and labels.
- Keep per-device preferences in `localStorage`, guarded with
  `try`/`catch`, and apply them before first paint.
- Print styles turn any page into a clean PDF.

## Exercises

1. Find every file starting with `"use client"` (`grep -rl '"use client"'
src`). For three of them, say what browser-only capability each needs.
2. Use your browser's device emulation to view the check-out page at
   iPhone size. Then turn on "slow 3G" throttling and reload. Can you
   tap a button before the page hydrates? What happens?
3. Open a report and use Print Preview. Toggle your system's dark mode
   and preview again. Is the output the same?

**Next:** [Chapter 10. Files and Object Storage](10-files-and-object-storage.md)
