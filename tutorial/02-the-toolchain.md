# Chapter 2. The Toolchain

Before writing any application code, we need a place to run it, a
language to write it in, and tools that catch mistakes before users do.
JavaScript's tooling has a reputation for being bewildering, mostly
because there are so many interchangeable options. This chapter picks
one of each, explains what it does, and moves on.

In this chapter you'll learn:

- What Node.js is, and why JavaScript runs on servers at all
- Enough TypeScript to read the rest of the book
- How packages, `package.json` and lockfiles work
- How to create the project skeleton
- How linting, formatting and type checking keep a codebase healthy
- How configuration gets into the app through environment variables

## Node.js: JavaScript Outside the Browser

JavaScript was created to run inside browsers. **Node.js** takes the
same JavaScript engine that powers Chrome (V8) and wraps it in a program
you can run from the command line, with access to files, the network,
and the operating system. That means one language for both halves of a
web app, so code (like the validation rules in Chapter 8) can be shared
between them.

Node is **single-threaded with an event loop**. Rather than dedicating a
thread to each request, it starts an operation (a database query, say),
moves on to other work, and resumes when the result arrives. In code,
that "resume later" is written with `async` and `await`:

```ts
const rows = await db().select().from(aircraft);
// Execution resumes here when the database replies; meanwhile Node has
// been serving other requests.
```

This model is excellent for web servers, which spend most of their time
waiting on databases and networks. It's poor at long CPU-bound
computations, which would block every other request. A flying club app
has none of those.

Install Node 24 or later. A version manager such as `nvm`, `fnm` or
`mise` lets you switch versions per project; the repository's `.nvmrc`
file says which one this project uses:

```text
24
```

## TypeScript in Fifteen Minutes

**TypeScript** is JavaScript with type annotations. The annotations are
checked by the TypeScript compiler and then erased: what runs is plain
JavaScript. If you know a statically typed language, the ideas will be
familiar; if you know Python's type hints, they're similar in spirit
but far more widely used.

```ts
// A variable that never changes is `const`; one that does is `let`.
// Never use `var`.
const tailNumber: string = "N12345";
let hours = 1.5; // type inferred as number

// An object type.
type Member = {
  id: string;
  name: string;
  roles: string[];
  active: boolean;
};

// A function with typed parameters and return value.
function greeting(member: Member): string {
  return `Welcome, ${member.name}`; // template literal, like an f-string
}

// A union of literal types: a value that must be one of these strings.
type AircraftStatus = "airworthy" | "vfr-only" | "grounded";

// `null` and `undefined` are distinct, and TypeScript makes you handle them.
function find(id: string): Member | null {
  /* ... */
}
const m = find("42");
m.name; // error: 'm' is possibly 'null'
m?.name; // fine: undefined if m is null
```

A few idioms appear constantly in this codebase:

```ts
// `as const` makes an array's elements literal types, so we can derive a
// union type from a list of values and never repeat ourselves.
export const GROUNDING_LEVELS = ["none", "ifr", "all"] as const;
export type Grounding = (typeof GROUNDING_LEVELS)[number]; // "none" | "ifr" | "all"

// Destructuring pulls fields out of objects and arrays.
const { id, name } = member;
const [first, ...rest] = list;

// Arrow functions are the usual way to write small functions.
const active = members.filter((m) => m.active);

// `??` supplies a default only for null/undefined (unlike `||`, which
// also replaces 0 and "").
const label = meter.label ?? "Hobbs";
```

The project runs TypeScript in **strict mode** (`"strict": true` in
`tsconfig.json`), which turns on the checks that catch real bugs, most
importantly the null checks shown above. Never turn it off.

> [!TIP]
> Modern Node can run `.ts` and `.mts` files directly by stripping the
> type annotations, without a compile step. That's how this project's
> scripts in `scripts/` run, both locally and in production:
> `node scripts/migrate.mts`. The application itself is still compiled
> by Next.js, which needs to bundle it for the browser anyway.

### Modules

Each file is a **module**. It shares things with `export` and uses other
modules' things with `import`:

```ts
// src/lib/hours.ts
export function parseHours(input: string): number | null {
  /* ... */
}

// elsewhere
import { parseHours } from "@/lib/hours";
```

The `@/` prefix is a path alias, configured in `tsconfig.json`, that
means "from `src/`". It saves you from writing `../../../lib/hours`.

## Packages and pnpm

Third-party code comes from the **npm registry** as packages. A
project's `package.json` lists what it depends on, and defines named
scripts:

```json
{
  "name": "flight-club",
  "private": true,
  "packageManager": "pnpm@12.15.0",
  "engines": { "node": ">=24" },
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "test": "vitest run",
    "db:up": "docker compose up -d --wait",
    "db:migrate": "node --env-file-if-exists=.env scripts/migrate.mts"
  },
  "dependencies": {
    "next": "16.4.3",
    "react": "19.3.0",
    "drizzle-orm": "^0.45.4",
    "zod": "^4.6.7"
  },
  "devDependencies": {
    "typescript": "^5",
    "vitest": "^5.0.5"
  }
}
```

`dependencies` are needed at runtime; `devDependencies` only while
developing and building. A version like `^0.45.4` means "0.45.4 or any
later compatible version," which is why the **lockfile**
(`pnpm-lock.yaml`) exists: it records the _exact_ version of every
package, including dependencies of dependencies, that was installed.
Commit it. It's what makes an install on a CI server or in a Docker
build identical to yours.

We use **pnpm** as the package manager. It's faster and stricter than
the default `npm`, and it stores each package once on disk no matter how
many projects use it. Node ships with **Corepack**, which installs the
exact pnpm version named in `packageManager`:

```sh
corepack enable
pnpm install          # install everything in package.json
pnpm add zod          # add a runtime dependency
pnpm add -D vitest    # add a development dependency
pnpm dev              # run the "dev" script
```

> [!WARNING]
> Every dependency is code you're trusting to run on your server. Before
> adding one, ask whether a few lines of your own would do. pnpm also
> refuses to run packages' install scripts unless you allow them
> (`allowBuilds` in `pnpm-workspace.yaml`), which closes one common route
> for malicious packages.

## Creating the Project

Next.js provides a generator that sets up a working project:

```sh
pnpm create next-app@latest flight_club --typescript --tailwind --eslint --app --src-dir
cd flight_club
pnpm dev
```

Open `http://localhost:3000` and you'll see a starter page. The
important files it created:

```text
flight_club/
  package.json        Dependencies and scripts
  tsconfig.json       TypeScript settings
  next.config.ts      Next.js settings
  eslint.config.mjs   Lint rules
  src/app/
    layout.tsx        The HTML wrapper around every page
    page.tsx          The page at "/"
    globals.css       Global styles (and Tailwind)
  public/             Static files served as-is
```

The dev server **hot reloads**: save a file and the browser updates
within a second, usually keeping the page's state. Leave it running
while you work.

## Tools That Catch Mistakes

Three tools keep the code healthy, and each catches a different class of
problem:

| Tool                   | Catches                                                                                       | Command          |
| ---------------------- | --------------------------------------------------------------------------------------------- | ---------------- |
| **TypeScript** (`tsc`) | Type errors: wrong arguments, unhandled nulls, typos in property names                        | `pnpm typecheck` |
| **ESLint**             | Likely bugs and bad patterns the type checker allows: unused variables, misuse of React hooks | `pnpm lint`      |
| **Prettier**           | Nothing; it just formats code consistently so nobody argues about it                          | `pnpm format`    |

Configure your editor to run Prettier on save and show TypeScript and
ESLint errors inline. VS Code does both with the official extensions.
In Chapter 14 the same three commands run on every change before it can
be deployed.

The project's `eslint.config.mjs` starts from Next.js's recommended
rules and switches off the stylistic ones that would fight Prettier:

```js
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Turn off stylistic rules that would fight Prettier; keep this last.
  prettier,
  globalIgnores([".next/**", "playwright-report/**", "test-results/**"]),
]);
```

## Configuration and Secrets

The app needs to know things that differ between your laptop, the
staging server and production: the database address, a secret key for
signing session cookies, credentials for the photo bucket. These must
never be written into the code. Code is shared and committed to Git;
secrets aren't.

The convention, from the "Twelve-Factor App" methodology, is to pass
configuration in **environment variables**. Locally, we keep them in a
file called `.env`, which is listed in `.gitignore` so it's never
committed. A committed `.env.example` documents every variable with
safe local values:

```sh
# .env.example
DATABASE_URL=postgres://flightclub:flightclub@localhost:5432/flightclub
# Any 32+ character string locally; generate real ones with
# `openssl rand -base64 32`.
BETTER_AUTH_SECRET=local-development-secret-not-for-real-use
BETTER_AUTH_URL=http://localhost:3000
S3_ENDPOINT=http://localhost:9000
S3_BUCKET=flight-club-photos
# ...
```

A new developer runs `cp .env.example .env` and has a working
configuration. Next.js loads `.env` automatically; our plain Node scripts
load it with `node --env-file-if-exists=.env`.

> [!IMPORTANT]
> Don't read `process.env` scattered throughout the code. Read it in one
> place, validate it, and fail loudly if something's missing. We'll
> build exactly that in Chapter 13, so a misconfigured server refuses to
> start rather than failing mysteriously on the first request.

## Docker, Briefly

We'll need PostgreSQL and an S3-compatible storage server to develop
against. Rather than installing them on your machine, we run them in
**Docker containers**: lightweight, isolated environments started from
published images. Install Docker Desktop (or OrbStack, Colima or Podman
on a Mac). Chapter 4 sets up the database container, and Chapter 13
explains containers properly when we package the app itself.

## Summary

- Node.js runs JavaScript on the server, using an event loop and
  `async`/`await` to serve many requests while waiting on I/O.
- TypeScript adds static types to JavaScript; strict mode is
  non-negotiable.
- `package.json` declares dependencies and scripts; the lockfile pins
  exact versions and must be committed.
- TypeScript, ESLint and Prettier each catch different problems; run
  them in your editor and in CI.
- Configuration comes from environment variables. Secrets never go in
  Git; `.env.example` documents what's needed.

## Exercises

1. Create a file `hello.mts` containing a typed function and a call to
   it, and run it with `node hello.mts`. Now introduce a type error.
   Does `node` complain? Does `pnpm exec tsc --noEmit hello.mts`?
   What does that tell you about when types are checked?
2. Look at `pnpm-lock.yaml` and find the entry for `zod`. What exact
   version is installed, compared with the range in `package.json`?
3. Run `pnpm lint` and `pnpm typecheck` in the finished project. Then
   add an unused variable to any file and run them again.

**Next:** [Chapter 3. Pages, Components and Routes](03-pages-components-and-routes.md)
