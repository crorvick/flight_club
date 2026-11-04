# Chapter 6. Forms and Server Actions

Almost everything a user _does_ in a web app is submitting a form:
signing in, checking out an aircraft, reporting a squawk, resolving it,
changing a password. This chapter follows a form submission from the
browser to the database and back, and builds the pattern every form in
Flight Club uses.

In this chapter you'll learn:

- How an HTML form becomes an HTTP request
- What Server Actions are, and how Next.js wires them to forms
- How to validate untrusted input with Zod
- How to report errors without losing what the user typed
- Why you redirect after a successful submit
- How to use plain `GET` forms for filters and choices

## What a Form Sends

Recall the plain HTML form from Chapter 1:

```html
<form method="post" action="/squawks">
  <textarea name="description"></textarea>
  <input type="radio" name="grounding" value="all" /> Grounded
  <input type="radio" name="grounding" value="none" /> Still flyable
  <button type="submit">Report squawk</button>
</form>
```

Submitting it sends a `POST` whose body is the fields encoded as
name/value pairs:

```text
description=Left+brake+soft&grounding=none
```

On the server, that arrives as a **`FormData`** object, a standard web
API with `get(name)` and `getAll(name)`. Note what it _doesn't_ give you:
types. Every value is a string (or a `File`, for uploads), every field
might be missing, and every value might have been typed, or forged, by
anyone. The server must treat it all as untrusted.

## Server Actions

In older frameworks you'd write a route that accepts `POST /squawks`,
parse the body, and so on. Next.js offers something more direct: a
**Server Action** is an async function, marked with the `"use server"`
directive, that you can pass straight to a form:

```ts
// src/app/(member)/settings/actions.ts (simplified)
"use server";

export async function updateName(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const me = await signedIn();
  const name = String(formData.get("name") ?? "").trim();
  // ... validate, write ...
  redirect("/settings?saved=name");
}
```

```tsx
<form action={updateName}>
  <input name="name" />
  <button>Save name</button>
</form>
```

Behind the scenes, Next.js gives the action a hidden ID, renders the
form so that it `POST`s to the current page with that ID, and on the
server routes the request to your function. You never write the
endpoint. Because it's still a real HTML form, it works before the
page's JavaScript has loaded (progressive enhancement, from Chapter 1);
once JavaScript is running, Next.js submits it in the background and
updates the page without a full reload.

A file marked `"use server"` at the top may only export async
functions, and _every one of them is a public HTTP endpoint_. Anyone can
call it with any arguments. That has a crucial consequence:

> [!IMPORTANT]
> Every Server Action must check who's calling it and validate every
> argument, exactly as if it were a public API, because it is one. The
> fact that your page only shows the form to officers is irrelevant to
> someone with `curl`. Chapter 7 builds the permission checks; this
> chapter builds the validation.

That includes functions you never meant as actions. While adding Google
sign-in (Chapter 7), a helper that answered "does this member have a
password?" was first written in the settings actions file, next to the
actions that used it:

```ts
// In a "use server" file, this is an endpoint, not a helper:
export async function hasPassword(memberId: string) { ... }
```

Exported from there, it would have told anyone who called it, with any
member's ID, whether that member could sign in with a password.
Helpers that actions share belong in an ordinary module, marked
`import "server-only"` so it can't end up in the browser either
(`src/lib/sign-in-accounts.ts`). The rule of thumb: a `"use server"`
file holds only the actions themselves.

Next.js also protects actions against **cross-site request forgery**
(CSRF), where a malicious site tricks a signed-in user's browser into
submitting a form to yours: actions only accept `POST` requests whose
`Origin` header matches your site.

### Binding Arguments

Sometimes an action needs context that isn't a form field, such as
which aircraft a squawk is for. `bind` creates a version of the
function with leading arguments filled in:

```tsx
<SquawkForm
  action={reportSquawk.bind(null, plane.id)}
  tailNumber={plane.tailNumber}
/>
```

```ts
export async function reportSquawk(aircraftId: string, formData: FormData) {
  // aircraftId came from the page, but the request could still have been
  // forged, so it's checked like anything else:
  const [plane] = isUuid(aircraftId)
    ? await db()
        .select({ id: aircraft.id })
        .from(aircraft)
        .where(and(eq(aircraft.id, aircraftId), eq(aircraft.active, true)))
    : [];
  if (!plane) return { error: "That aircraft isn't in the fleet." };
  // ...
}
```

Bound arguments are sent to the browser and back (Next.js encrypts
them), but treat them as untrusted all the same.

## Validating with Zod

Hand-written validation (`if (!name) …; if (name.length > 100) …`)
gets long and inconsistent fast. **Zod** lets you declare what valid
input looks like, then parse untrusted data against that declaration.
A successful parse gives you correctly typed data; a failed one gives
you a message for each problem.

```ts
// src/app/(member)/squawks/actions.ts (excerpt)
import { z } from "zod";

const squawkSchema = z.object({
  grounding: z.enum(
    GROUNDING_LEVELS,
    "Answer whether this grounds the airplane.",
  ),
  description: z
    .string()
    .trim()
    .min(1, "Describe the problem.")
    .max(2000, "Keep the description under 2000 characters."),
  category: z.enum(SQUAWK_CATEGORIES).default("other"),
});

const parsed = squawkSchema.safeParse({
  grounding: formData.get("grounding") ?? undefined,
  description: formData.get("description") ?? "",
  category: formData.get("category") ?? undefined,
});
if (!parsed.success) {
  return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
}
parsed.data; // { grounding: "none" | "ifr" | "all"; description: string; category: ... }
```

A few things to notice:

- Messages are written for the person filling in the form, in plain
  words: "Describe the problem," not "description: String must contain
  at least 1 character(s)."
- `.trim()` transforms as well as checks: `parsed.data.description` has
  its whitespace removed.
- `z.enum(GROUNDING_LEVELS)` reuses the same constant as the database
  enum and the TypeScript type. One list, three enforcements.
- `z.flattenError(…).fieldErrors` gives a map from field name to
  messages, ready to show next to each field.

Zod also shines for structured choices. Resolving, deferring and
reopening a squawk are different "intents" with different required
fields; a discriminated union expresses that exactly:

```ts
const changeSchema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("resolve"),
    note: z.string().trim().min(1, "Say what was done about it."),
  }),
  z.object({ intent: z.literal("defer") }),
  z.object({ intent: z.literal("reopen") }),
]);
```

> [!TIP]
> Validation in Zod checks the _shape_ of input. Rules that depend on
> the current state of the world ("this squawk is grounding, so it can't
> be deferred," "the meter reading must be at least the last one") belong
> in plain domain functions (Chapter 8) and in the database (Chapter 4),
> checked inside the transaction where the state is locked.

## Reporting Errors Without Losing Work

When a submit fails validation, the user should see what's wrong, next
to the field that's wrong, _with everything they typed still there_.
A pilot standing on the ramp who has carefully typed four meter
readings and loses them all to one typo will not be pleased.

Flight Club's actions return a small, uniform shape:

```ts
// src/lib/form-state.ts
// What a form shows after a failed submit.  `values` echoes back what was
// typed (never a password) so a member on a bad connection doesn't have
// to type it all again.
export type FormState = {
  error?: string;
  fieldErrors?: Partial<Record<string, string[]>>;
  values?: Record<string, string>;
};

export function formValues(formData: FormData, keys: string[]) {
  return Object.fromEntries(
    keys.map((k) => [k, String(formData.get(k) ?? "")]),
  );
}
```

and the form component feeds that state back into its fields. React's
`useActionState` hook manages it: it takes the action and an initial
state, and returns the current state, a wrapped action to give the
form, and whether a submit is in progress.

```tsx
// src/app/(auth)/sign-in/sign-in-form.tsx
"use client";

import { useActionState } from "react";
import { signIn } from "../actions";

export function SignInForm() {
  const [state, action, pending] = useActionState(signIn, {} as FormState);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormError message={state.error} />
      <Field
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        defaultValue={state.values?.email}
        errors={state.fieldErrors?.email}
        required
      />
      <Field
        name="password"
        label="Password"
        type="password"
        autoComplete="current-password"
        errors={state.fieldErrors?.password}
        required
      />
      <Button type="submit" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
```

That `"use client"` at the top makes this a Client Component, which
Chapter 9 explains. For now: hooks like `useActionState` need to run in
the browser, so any component that uses one must be a Client Component.
The action itself still runs on the server.

When the action is wrapped by `useActionState`, it receives the
previous state as its first argument, which is why Flight Club's actions
have the signature `(prev: FormState, formData: FormData)`.

### Accessible Error Messages

The shared `Field` component connects each error to its input so
assistive technology announces it:

```tsx
// src/components/field.tsx (excerpt)
<Label htmlFor={inputId}>{label}</Label>
<Input
  id={inputId}
  name={name}
  className="h-11 text-base"
  aria-invalid={errors ? true : undefined}
  aria-describedby={errors ? errorId : undefined}
  {...props}
/>
{errors && <p id={errorId} className="text-sm text-destructive">{errors[0]}</p>}
```

The `h-11 text-base` is deliberate too: 44 pixels is the minimum
comfortable tap target, and iOS zooms the page in when you focus a field
whose text is smaller than 16px.

Form-level errors (`FormError`) use `role="alert"` so they're announced
the moment they appear.

### When React Resets the Form

There's a wrinkle in "everything they typed still there." After an
action passed to `<form action>` finishes, React **resets the form**,
as a browser would after a plain submit. For fields given a
`defaultValue`, that's harmless: the component re-renders with the
returned `values` as their new defaults, and the reset restores those.

A _controlled_ field is another story. The maintenance completion form
keeps a VOR check's method in state, because the fields below it
depend on it:

```tsx
const [method, setMethod] = useState<VorMethod>("vot");
// ...
<select name="vorMethod" value={method} onChange={(e) => setMethod(...)}>
```

Log an airborne check with a 7° error, which is outside its ±6° limit,
and the server rightly refuses it. Then the reset puts the `<select>`
back to its first option, VOT, while `method` in state, and with it
every field and hint on the page, still says airborne. Correct the
error, save again, and the form sends `vorMethod=vot`: the check is
logged as the wrong kind, against the wrong limit. Nothing on the screen
hints at it.

The fix is to submit the form yourself, which React doesn't follow with
a reset:

```tsx
// src/app/(member)/maintenance/maintenance-forms.tsx (excerpt)
// Submitted by hand rather than through <form action>: React resets a
// form after its action runs, which puts a controlled select (the kind, a
// VOR check's method) back to its first option while the page still shows
// the one chosen, so the next save would send the wrong one.
function submitWithoutReset(formAction: (formData: FormData) => void) {
  return (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  };
}

<form onSubmit={submitWithoutReset(formAction)}>
```

The cost is that the form no longer submits before the page's
JavaScript has loaded; for forms whose fields depend on client state,
that was never really possible anyway. The squawk form does the same,
for a different reason: a reset would throw away the photos attached to
it (Chapter 10).

> [!TIP]
> When a test for a refused-then-corrected save passes, check that it
> changed something _between_ the two saves that a reset would undo.
> The test that caught this one picks "airborne", fails once, and then
> checks the select still says airborne.

## Redirect After Success

When an action succeeds, it calls `redirect()`:

```ts
redirect(`/squawks/${squawkId}?changed=${change.intent}`);
```

This is the **Post/Redirect/Get** pattern. If the action instead
rendered the result page directly, the browser's current page would be
the _result of a POST_. Refreshing it would resubmit the form (the
browser's "Confirm Form Resubmission" dialog), possibly resolving a
squawk or logging a flight twice. Redirecting turns the result into an
ordinary `GET` that's safe to refresh, bookmark, and share.

The query parameter (`?changed=resolve`, `?saved=name`) tells the
destination page to show a confirmation ("Squawk resolved."). The page
reads it from `searchParams` and shows a toast.

> [!NOTE]
> `redirect()` works by throwing a special error that Next.js catches.
> Two consequences: code after it never runs, and you must not call it
> inside a `try` block that catches everything, or you'll swallow the
> redirect. In Flight Club's actions, the `redirect` always comes last,
> after the transaction has committed.

## When Not to Redirect

The squawk form is an exception worth studying. It uploads photos, often
over a weak cellular connection. If the connection drops mid-submit, a
normal form would show the browser's error page and the photos would be
gone. So `reportSquawk` returns `{ squawkId }` instead of redirecting, and
the form (a Client Component) submits it manually, catches network
failures, and navigates itself on success:

```tsx
// src/app/(member)/squawks/squawk-form.tsx (excerpt)
function submit(event: React.FormEvent<HTMLFormElement>) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  for (const photo of photos) formData.append("photos", photo.file);
  startTransition(async () => {
    try {
      const outcome = await action(formData);
      if (outcome.squawkId)
        router.push(`/squawks/${outcome.squawkId}?reported=1`);
      else setResult(outcome);
    } catch {
      setResult({
        error:
          "Couldn't reach the server. Check your connection and try again; nothing you entered was lost.",
      });
    }
  });
}
```

Use the plain pattern by default; reach for this one when losing the
user's input would be costly.

## GET Forms for Choices

Not every form changes something. Choosing which aircraft a report is
for, or which dates a flight report covers, is really choosing a URL.
For those, use a `GET` form. Its fields become the query string:

```tsx
// src/components/report.tsx (excerpt)
import Form from "next/form";

// A plain GET form, so the choice is in the URL and the report can be
// bookmarked or shared.
<Form action="/reports/oil" className="flex items-end gap-2">
  <label>
    Aircraft
    <select name="aircraft" defaultValue={selected}>
      {planes.map((p) => (
        <option key={p.id} value={p.id}>
          {p.tailNumber}
        </option>
      ))}
    </select>
  </label>
  <Button type="submit" variant="outline">
    Show
  </Button>
</Form>;
```

Submitting it navigates to `/reports/oil?aircraft=…`. Next's `Form`
component behaves like a plain `<form method="get">` but performs the
navigation client-side when it can, as `Link` does. The page reads the
choice from `searchParams` and, as always, checks that the member is
allowed to see that aircraft.

## The Pattern, in Full

Every Flight Club action follows the same steps, in this order:

1. **Authenticate and authorize**: who is this, and may they do this?
   (Chapter 7)
2. **Check identifiers**: do the IDs refer to real records this person
   can act on?
3. **Validate input** with Zod; on failure, return field errors and the
   typed values.
4. **In a transaction**: lock what you'll base decisions on, re-check
   the rules against the current state, write, and write an audit entry
   if needed.
5. **Redirect** to a page that shows the result.

You'll find this shape in `squawks/actions.ts`, `dispatches/actions.ts`,
`flights/actions.ts`, and the rest. Once you've read one, you can read
them all.

## Summary

- An HTML form sends its fields as `FormData`: untyped, possibly
  missing, possibly forged.
- Server Actions are async functions marked `"use server"` that forms
  can call directly. Each is a public endpoint and must check
  permissions and validate input.
- Zod declares valid input and parses untrusted data into typed data,
  with human-readable messages.
- Return errors with the user's typed values so nothing is lost;
  `useActionState` feeds them back into the form. React resets the form
  after an action, so a form with controlled fields submits itself.
- A `"use server"` file holds only actions: anything else it exports is
  an endpoint too.
- Redirect after a successful `POST` so refresh is safe. Use `GET`
  forms for choices that belong in the URL.

## Exercises

1. Sign in with a blank password. Find the code path that produced the
   message you see, from the form to the action and back.
2. Using your browser's developer tools, edit the squawk form's HTML to
   change a `grounding` radio's value to `"sometimes"`, then submit it.
   What does the server say? Which line rejected it?
3. Add a maximum length to the sign-up name in `src/app/(auth)/actions.ts`
   and confirm the message appears next to the field.

**Next:** [Chapter 7. Who Are You, and What May You Do?](07-authentication-and-authorization.md)
