# Appendix A. Glossary

Terms are grouped loosely by topic; the chapter where each is explained
is in parentheses.

## The Web

**HTTP** (1). The request/response protocol browsers and servers speak.
A request has a method, path, headers and optional body; a response has
a status code, headers and optional body.

**Method** (1). The verb of a request. `GET` fetches and must not change
anything; `POST` submits changes.

**Status code** (1). Three digits summarizing a response: 2xx success,
3xx redirect, 4xx client error (401 not signed in, 403 not allowed, 404
not found), 5xx server error.

**Cookie** (1, 7). A small value the server asks the browser to store and
send back on later requests. Carries the session token.

**Stateless** (1). Each HTTP request stands alone; the server
recognizes a user only through what the request carries, like a cookie.

**Progressive enhancement** (1, 6). Building pages that work as plain
HTML and get better with JavaScript, rather than depending on it.

**XSS, cross-site scripting** (3). Injecting a script into a page other
users view. React's escaping prevents it by default.

**CSRF, cross-site request forgery** (6, 7). Tricking a signed-in user's
browser into submitting a request to another site. Prevented by
`SameSite` cookies and origin checks.

**CORS** (10). Browser rules for when a page may read responses from a
different origin.

## JavaScript and Tooling

**Node.js** (2). A JavaScript runtime for servers and command-line
programs.

**Event loop** (2). Node's model of running one thread that switches to
other work while waiting on I/O, written with `async`/`await`.

**TypeScript** (2). JavaScript with static types, checked at build time
and erased at runtime.

**Package manager, lockfile** (2). pnpm installs packages listed in
`package.json`; `pnpm-lock.yaml` records exact versions so every install
is identical.

**Environment variable** (2, 13). Configuration passed to a process by
its environment, used for anything that differs between deployments,
including secrets.

## React and Next.js

**Component** (3). A function that returns JSX describing UI.

**JSX** (3). HTML-like syntax in JavaScript that compiles to function
calls.

**Props** (3). The arguments passed to a component.

**App Router** (3). Next.js's routing system, where folders under
`src/app` are URL segments.

**Layout** (3). A component that wraps every page beneath it and
persists across navigation.

**Route group** (3). A `(folder)` that organizes routes and can have its
own layout without appearing in the URL.

**Dynamic segment** (3). A `[folder]` that matches any value, passed to
the page as `params`.

**Route handler** (3). A `route.ts` file that answers HTTP requests
directly with a `Response`.

**Server Component** (3). A component that runs only on the server and
sends only HTML. The default.

**Client Component** (9). A component marked `"use client"`, rendered on
the server and then hydrated and run in the browser.

**Hydration** (9). The browser attaching React to server-rendered HTML,
making it interactive. The first browser render must match the
server's.

**Hook** (9). A `use…` function that gives a component state or other
React features. Called unconditionally at the top level.

**Server Action** (6). An async function marked `"use server"` that
forms and Client Components can call; it runs on the server and is a
public endpoint.

**Post/Redirect/Get** (6). Redirecting after a successful `POST` so that
refreshing the result page doesn't resubmit.

**Suspense boundary** (11). A `<Suspense>` element that shows a fallback
until its children's async work completes.

**Static shell, streaming** (11). With Cache Components, the prerendered
static part of a page is sent immediately and dynamic parts stream into
it as they're ready.

**Proxy** (7). Next.js 16's name for middleware: code run before every
request. Not a substitute for authorization checks in pages and actions.

## Data

**Relational database** (4). Stores data in tables of typed columns,
queried with SQL. PostgreSQL here.

**Primary key** (4). The column(s) uniquely identifying each row.

**Foreign key** (4). A column referring to another table's key; the
database guarantees the referenced row exists.

**Constraint** (4). A rule the database enforces on every write:
`NOT NULL`, `UNIQUE`, `CHECK`, foreign keys, exclusion constraints.

**Partial index** (4). An index, possibly unique, over only the rows
matching a condition.

**Index** (4). A lookup structure making queries on particular columns
fast.

**Derived state** (4, 8). A conclusion computed from stored facts
whenever it's needed, rather than stored itself.

**ORM / query builder** (5). A library describing tables in code and
building typed queries. Drizzle here.

**Migration** (5). A numbered SQL file that moves the schema one step
forward, applied in order in every environment.

**Transaction** (5). A group of statements that commit or roll back
together.

**Row lock, `SELECT … FOR UPDATE`** (5). Locks rows for the rest of the
transaction so concurrent transactions wait rather than overwrite each
other.

**Lost update** (5). Two concurrent writers each basing a change on the
same stale value, so one silently undoes the other.

**Deadlock** (5). Two transactions each waiting for a lock the other
holds. Prevented by locking in a consistent order.

**SQL injection** (5). Input interpreted as SQL. Prevented by bound
parameters.

**Connection pool** (5). A set of open database connections shared by
all requests.

**Seed data** (5). Sample records for development and staging.

**Expand and contract** (15). Changing a schema in two releases (add
the new, then later remove the old) so running code always works.
Removing something the live release still names can take a release
of its own.

**Point-in-time recovery** (15). Restoring a database to its state at a
chosen moment, from continuous backups.

## Storage

**Object storage** (10). Durable, cheap storage of files ("objects") by
key in "buckets," accessed over HTTP. S3 and compatibles.

**S3 API** (10). Amazon's object storage interface, now a de facto
standard implemented by R2, B2, MinIO, RustFS and others.

**Presigned URL** (10). A time-limited URL granting access to one
private object without credentials.

**`localStorage`** (9). Per-browser key-value storage for small,
non-critical preferences.

## Security

**Authentication** (7). Establishing who someone is.

**Authorization** (7). Deciding what they may do.

**Password hash, salt** (7). A slow one-way function of a password plus
random data, stored instead of the password.

**Session** (7). A server-side record tying a random token, held in a
cookie, to a signed-in user.

**Mass assignment** (7). A request setting fields it shouldn't, like its
own role. Prevented by marking fields server-owned.

**Audit log** (7). A record of who changed what and when, written in the
same transaction as the change.

**OAuth, OpenID Connect** (7). Signing in through another service, such
as Google: the browser visits it and returns with a one-time code the
server trades for who the user is.

**Account linking** (7). Attaching a Google or Apple sign-in to an
existing account. Safe while signed in to both; unsafe by matching an
email address nobody has verified.

## Testing

**Unit test** (8). A fast test of one function's behavior. Vitest here.

**End-to-end test** (12). A test that drives a real browser through the
real app. Playwright here.

**Locator** (12). How a test finds an element; by role, label or text,
as users do.

**Flaky test** (12). One that sometimes fails without any code change.

**Trace** (12). Playwright's step-by-step recording of a test run.

**Fixture** (12). A value Playwright prepares for each test, like
`page`. Extending them sets things up for every test at once, such as
answering requests to third-party services.

## Shipping

**Container image** (13). A layered filesystem snapshot plus a command:
the unit of deployment.

**Container** (13). A running instance of an image.

**Multi-stage build** (13). A Dockerfile that builds in heavy stages and
copies only the results into a slim final image.

**Registry** (13). A store for images, like GHCR.

**Health check** (13). An endpoint the platform polls to decide whether
an instance is ready and working.

**CI, continuous integration** (14). Automatically checking every change
as it's integrated.

**CD, continuous delivery** (14). Keeping every passing change
deployable, with deploying a routine operation.

**Workflow, job, step** (14). GitHub Actions' units: an event triggers a
workflow of jobs, each a sequence of steps on a fresh machine.

**Staging** (14). A production-like environment where releases are
checked before production.

**Promotion** (14). Deploying an already built and staged image to
production, unchanged.

**Rollback** (14). Promoting an earlier image to undo a bad release.

**Zero-downtime deploy** (14). Starting the new version and switching
traffic only once it's healthy, so users never see an outage.

**Back to:** [Contents](README.md)
