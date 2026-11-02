# Chapter 7. Who Are You, and What May You Do?

Two different questions hide behind the word "security" in a web app.
**Authentication** asks _who are you?_ and is answered by signing in.
**Authorization** asks _what may you do?_ and must be answered on every
single request. This chapter builds both, and an audit trail that
records who did what.

In this chapter you'll learn:

- How passwords should be stored, and why you shouldn't write that code
- How sessions and cookies keep a user signed in
- How to set up Better Auth in a Next.js app
- How to model roles, and enforce them in one place
- Why hiding a button is never a permission check
- How to keep an audit log that can't lie

## Passwords and Sessions

**Never store passwords.** Store a _hash_: the output of a deliberately
slow, one-way function (scrypt, bcrypt or Argon2) applied to the password
plus a random **salt**. To check a sign-in, hash what was typed with
the same salt and compare. If the database leaks, attackers get hashes
that are expensive to reverse, and the salts mean identical passwords
produce different hashes.

After a successful sign-in, the server creates a **session**: a row in
a `session` table holding a long random token, the member it belongs to,
and an expiry. The token goes to the browser in a cookie:

```http
Set-Cookie: better-auth.session_token=…; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=15552000
```

Each flag matters:

| Flag           | Effect                                                                                  |
| -------------- | --------------------------------------------------------------------------------------- |
| `HttpOnly`     | JavaScript in the page can't read it, so a script injected by an XSS bug can't steal it |
| `Secure`       | Only sent over HTTPS, never in plain text                                               |
| `SameSite=Lax` | Not sent on most requests initiated by other sites, a strong defense against CSRF       |
| `Max-Age`      | How long the browser keeps it                                                           |

On every request, the server looks up the token in the `session`
table. Signing out deletes the row, which ends the session immediately
on every device that had it.

> [!NOTE]
> **Alternatives: JWTs.** Some systems put the user's identity in a
> signed token (a JSON Web Token) that the server verifies without a
> database lookup. That saves a query, but a JWT can't be revoked before
> it expires: deactivating a member wouldn't take effect until their
> token ran out. Database sessions are simpler and safer for an app this
> size.

Hashing, timing-safe comparison, token generation, cookie handling,
expiry and renewal are all easy to get subtly wrong, and mistakes are
catastrophic. Use a well-maintained library.

## Setting Up Better Auth

**Better Auth** is a TypeScript authentication library that stores
users and sessions in your own database, through your own ORM. Its
configuration lives in `src/lib/auth.ts`:

```ts
// src/lib/auth.ts (excerpt)
import "server-only";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";

const DAY = 60 * 60 * 24;

function createAuth() {
  const env = serverEnv();
  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    database: drizzleAdapter(db(), { provider: "pg", schema }),
    emailAndPassword: { enabled: true },
    // Members sign in on the ramp, often with gloves on and bad signal, so
    // sessions last long and renew themselves on use: anyone who opens the
    // app at least every six months stays signed in.
    session: { expiresIn: 180 * DAY, updateAge: DAY },
    user: {
      modelName: "member",
      additionalFields: {
        // Server-owned (`input: false`): sign-up can't set them, only an
        // officer can.  New members wait, inactive and untagged, until one
        // approves them.
        roles: {
          type: "string[]",
          input: false,
          required: false,
          defaultValue: [],
        },
        active: {
          type: "boolean",
          input: false,
          required: false,
          defaultValue: false,
        },
      },
    },
    advanced: { database: { generateId: "uuid" } },
    // Lets server actions set the session cookie; must be the last plugin.
    plugins: [nextCookies()],
  });
}
```

Points worth noting:

- **`secret`** signs cookies so they can't be forged. It comes from the
  environment and differs per environment. Changing it signs everyone
  out.
- **`baseURL`** is the app's public origin. Better Auth rejects requests
  claiming to come from anywhere else.
- **Session length is a product decision.** Six months, renewed daily on
  use, suits members on a phone at the airfield. A banking app would
  choose minutes. Know why you picked your number.
- **`input: false`** is a defense against **mass assignment**: if a
  sign-up request includes `"roles": ["officer"]`, it's ignored. Any
  field a user mustn't set for themselves should be marked this way.

Better Auth's tables (`member`, `session`, `account`, `verification`)
are defined in our Drizzle schema like any others and created by our
migrations, so they're ours to extend. We renamed its "user" to
`member`, and added `roles` and `active`.

Better Auth also exposes HTTP endpoints (for sign-out from the browser,
session refresh, and so on), mounted with a catch-all route handler:

```ts
// src/app/api/auth/[...all]/route.ts
import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

export function GET(request: Request) {
  return toNextJsHandler(auth()).GET(request);
}
export function POST(request: Request) {
  return toNextJsHandler(auth()).POST(request);
}
```

The `[...all]` folder name is a **catch-all segment**: it matches
`/api/auth/anything/at/all`.

Our own sign-in and sign-up actions call Better Auth's server API, so
they get Zod validation and friendly messages like every other form:

```ts
// src/app/(auth)/actions.ts (excerpt)
try {
  await auth().api.signInEmail({ body: parsed.data, headers: await headers() });
} catch (error) {
  if (error instanceof APIError && error.statusCode === 401) {
    return { error: "Incorrect email or password.", values };
  }
  throw error;
}
redirect("/");
```

The message deliberately doesn't say _which_ was wrong. "No account with
that email" would let anyone discover who's a member.

## Who Is Signed In?

Every page and action needs to know the current member. One function
answers that:

```ts
// src/lib/session.ts (excerpt)
import "server-only";
import { headers } from "next/headers";
import { cache } from "react";

// Read once per request, however many components and checks ask.  Not
// cached across requests: a member's roles or active flag can change at
// any time, and every check must see the current values.
export const getCurrentMember = cache(async (): Promise<Member | null> => {
  const requestHeaders = await headers();
  const session = await auth().api.getSession({ headers: requestHeaders });
  if (!session) return null;
  const { id, name, email, roles, active } = session.user;
  return {
    id,
    name,
    email,
    roles: knownRoles(roles ?? []),
    active: active ?? false,
  };
});
```

React's `cache()` memoizes a function _for the duration of one request_.
A page might call `getCurrentMember()` from the header, the page body,
and three components; it's looked up once. The next request starts
fresh, which is exactly right: if an officer deactivates someone, their
very next request must see it.

## Roles and One Place to Decide

A member holds **role tags**: `pilot`, `officer`, or both. New members
have none and are inactive until an officer approves them. The rules:

- Not signed in: send them to sign in.
- Signed in but inactive: show "waiting for approval," and nothing else.
- Active, but lacking the required role: forbidden.
- Otherwise: allowed.

That logic lives in exactly one function, which has no database or
framework in it, so it can be tested exhaustively (Chapter 8):

```ts
// src/lib/access.ts
export type Requirement = "active" | RoleTag;
export type AccessDecision = "allow" | "sign-in" | "pending" | "forbidden";

// The single place that decides who may do what.  An inactive member has
// no permissions at all, whatever tags they hold: deactivating someone
// must be enough to lock them out, without also having to strip their
// roles.
export function decideAccess(
  member: MemberAccess | null,
  requirement: Requirement,
): AccessDecision {
  if (!member) return "sign-in";
  if (!member.active) return "pending";
  if (requirement === "active") return "allow";
  return member.roles.includes(requirement) ? "allow" : "forbidden";
}
```

Pages and actions don't call it directly. They call a guard that turns
the decision into the right response:

```ts
// src/lib/session.ts (excerpt)
export async function requireMember(
  requirement: Requirement = "active",
): Promise<Member> {
  const member = await getCurrentMember();
  switch (decideAccess(member, requirement)) {
    case "allow":
      return member!;
    case "sign-in":
      redirect("/sign-in");
    case "pending":
      redirect("/"); // the home page explains they're awaiting approval
    case "forbidden":
      forbidden();
  }
}
```

`forbidden()` stops rendering and shows `src/app/forbidden.tsx`
("Not allowed") instead, with a 403 status if the response hasn't
started streaming yet (Chapter 11). It's enabled by
`experimental.authInterrupts` in `next.config.ts`. Now every
protected page or action starts with one line:

```ts
export async function reportSquawk(aircraftId: string, formData: FormData) {
  const member = await requireMember("pilot");
  // ...
```

### Rules That Depend on Data

Some permissions depend on more than a role. A **plane captain** is a
member assigned to look after particular aircraft, and may manage
_those_ aircraft's squawks and maintenance as an officer would, but no
others. That needs the `aircraft_captain` table, so it's a pure rule
plus a guard that loads the data:

```ts
// src/lib/access.ts
export function canMaintain(
  member: MemberAccess | null,
  captainOf: readonly string[],
  aircraftId: string,
) {
  if (decideAccess(member, "active") !== "allow") return false;
  return hasRole(member, "officer") || captainOf.includes(aircraftId);
}
```

```ts
// src/lib/captains.ts
export async function requireMaintainer(aircraftId: string): Promise<Member> {
  const member = await requireMember();
  if (!(await canMaintainAircraft(member, aircraftId))) forbidden();
  return member;
}
```

Note the order in the squawk-resolving action: first find which
aircraft the squawk belongs to, _then_ check the member may maintain
that aircraft. Never trust a client-supplied aircraft ID for a
permission check when the record itself says which aircraft it's on.

## Hiding Is Not Enforcing

The site header shows officers an "Aircraft" tab and pilots a "Report
squawk" tab:

```ts
// src/components/site-header.tsx (excerpt)
// The pages check permissions themselves; this only decides what to offer.
async function navKeys(member: Member | null): Promise<NavKey[]> {
  if (!member?.active) return [];
  const keys: NavKey[] = ["home", "fleet"];
  if (hasRole(member, "pilot")) keys.push("squawk");
  if (hasRole(member, "officer")) keys.push("aircraft", "members");
  // ...
  return keys;
}
```

That's good UX: don't offer people things they can't do. But it is
_not_ security. Someone can type `/members` into the address bar, or
call an action directly. Every page and every action has its own
`requireMember(...)` or `requireMaintainer(...)`, and the test suite
(Chapter 12) checks that a pilot visiting an officer page is shown
"Not allowed."

> [!WARNING]
> Next.js has a `proxy.ts` file (formerly "middleware") that runs before
> every request, and it's tempting to put all your auth checks there.
> Next's own documentation warns against relying on it for
> authorization. It sees the request but not what each page or action
> will do, and it's easy for a new route or action to slip past its
> matching rules. Check permissions next to the data, in the page or
> action itself. Proxy is at most an optimization.

## Bootstrapping the First Officer

New accounts start inactive, and only officers can approve members.
So who approves the first officer? A small script, run from a shell
with database access:

```sh
pnpm member:approve you@example.com officer pilot
# or, in production, from the host's shell:
node scripts/approve-member.mts you@example.com officer pilot
```

Keeping this out of the web UI entirely means there's no "make me an
admin" endpoint to attack.

## Defense in Depth for Roles

Roles are stored as a text array on `member`. Two more layers make sure
an unknown role can't creep in:

```ts
// The database refuses unknown role tags.
check("member_roles_known", sql`${table.roles} <@ ARRAY['pilot', 'officer']::text[]`),
```

and `knownRoles()` filters anything unexpected when reading, and puts
roles in a fixed order for display. If the code and the data ever
disagree, the safe outcome is _fewer_ permissions.

## Changing Passwords and Names

Some actions belong to the member themselves. Changing a password
requires the _current_ password, so someone who picks up an unlocked
phone can't lock the owner out:

```ts
await auth().api.changePassword({
  body: { currentPassword, newPassword, revokeOtherSessions: true },
  headers: await headers(),
});
```

`revokeOtherSessions` signs out every other device, which is what a
member who suspects their password was compromised wants.

## The Audit Log

When an officer resolves a squawk (ungrounding an aircraft) or corrects
a locked flight (changing what a member is billed), the club needs to
know who did it, when, and what changed. Every such change writes an
`audit_log` row:

```ts
// src/db/audit.ts
// Written in the same transaction as the change it records, so the log
// can never claim a change that was rolled back, or miss one that wasn't.
export async function writeAudit(tx: Transaction, entry: AuditEntry) {
  await tx.insert(auditLog).values(entry);
}
```

```ts
await db().transaction(async (tx) => {
  await tx.update(squawk).set(after).where(eq(squawk.id, squawkId));
  await writeAudit(tx, {
    actorId: actor.id,
    action: "squawk.resolve",
    entityType: "squawk",
    entityId: squawkId,
    before: { status: current.status },
    after,
  });
});
```

Two principles:

- **Same transaction.** If the audit write were separate, a crash
  between the two could leave a change with no record, or a record of a
  change that never happened.
- **Only what changed.** `before` and `after` hold just the changed
  fields, so the log reads as a diff.

## Things We Haven't Built

A production authentication system for a larger audience would add:

- **Rate limiting** on sign-in, to slow password guessing (Better Auth
  has built-in rate limiting you can configure).
- **Email verification and password reset**, which need an email
  provider.
- **Multi-factor authentication** or **passkeys**.
- **Single sign-on** with Google or Microsoft accounts (OAuth).

Better Auth supports all of these through configuration and plugins.
A small club, whose officers approve every member by hand, can start
without them.

## Summary

- Store password hashes, never passwords, and let a maintained library
  do it.
- A session is a database row; its random token travels in an
  `HttpOnly`, `Secure`, `SameSite` cookie.
- Mark server-owned user fields `input: false` to prevent mass
  assignment.
- Decide access in one pure function, and enforce it with guards at the
  top of every page and action. Load data-dependent permissions from
  the record, not from the request.
- Hiding UI is a courtesy, never a check.
- Write audit entries in the same transaction as the change.

## Exercises

1. Sign up a new account and try visiting `/members`. What do you see,
   and which line of code decided it? Now approve yourself as a pilot
   (not officer) and try again.
2. Open your browser's developer tools, find the session cookie under
   Application → Cookies, and note its flags. Try reading it with
   `document.cookie` in the console. What happens?
3. After resolving a squawk as an officer, find its entry in
   `audit_log` with `psql`.

**Next:** [Chapter 8. Rules Without Frameworks](08-rules-without-frameworks.md)
