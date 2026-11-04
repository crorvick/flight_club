# Chapter 13. Containers and Configuration

"It works on my machine" is the oldest joke in software, and it stops
being funny the day production behaves differently from your laptop.
This chapter packages Flight Club into a **container image**: a single,
self-contained artifact holding the app and everything it needs to run,
that behaves the same on your laptop, in CI, on staging and in
production. Along the way it tackles configuration properly, so the
_same_ image can run anywhere, told only by its environment where it is.

In this chapter you'll learn:

- What containers and images are, and why they've become the standard
  way to ship software
- How to write a multi-stage Dockerfile for a Next.js app
- Why the image must contain no environment-specific configuration
- How to validate configuration at startup
- How health checks tell the platform the app is ready

## Images and Containers

An **image** is a read-only snapshot of a filesystem (an operating
system's essentials, a Node.js runtime, your built app) plus a default
command to run. A **container** is a running instance of an image,
isolated from other processes on the machine, with its own filesystem,
network and process space. An image is to a container roughly what a
program is to a process.

Images are built in **layers**. Each instruction in a `Dockerfile`
produces a layer, and layers are cached and reused: if an instruction
and everything before it are unchanged, Docker skips rebuilding it.
Ordering instructions from least to most frequently changing makes
builds fast.

Images are stored in **registries**. Flight Club's go to the GitHub
Container Registry (GHCR) as `ghcr.io/crorvick/flight_club:<commit-sha>`.

## The Standalone Build

A Next.js project's `node_modules` holds hundreds of megabytes of
packages, most of them only needed to build. Next.js can trace exactly
which files the server needs at runtime and copy just those into
`.next/standalone`, with a minimal `server.js` to start it:

```ts
// next.config.ts
const nextConfig: NextConfig = {
  // Emit a self-contained server in .next/standalone for the Docker image.
  output: "standalone",
  // ...
};
```

To run that build locally exactly as the image does:

```sh
pnpm build
pnpm start   # node scripts/start-standalone.mts
```

## A Multi-Stage Dockerfile

A **multi-stage build** uses several temporary images: heavy ones to
install and build, and a slim final one that receives only the results.
Here's Flight Club's, in full, since every line has a reason:

```dockerfile
# syntax=docker/dockerfile:1

# One image per commit, promoted unchanged from staging to production, so
# nothing environment-specific is baked in except the commit SHA.

FROM node:24-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir /pnpm/store

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build
RUN mkdir -p drizzle public
# The migrate script runs outside the Next.js server, so the standalone
# output's traced node_modules can't be relied on to have everything it
# imports.  Give it its own copy of the two packages it needs.
RUN mkdir -p /migrate/node_modules \
 && cp -rL node_modules/drizzle-orm node_modules/postgres /migrate/node_modules/

FROM node:24-slim AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
WORKDIR /app

COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/drizzle ./drizzle
COPY --from=build --chown=node:node \
     /app/scripts/migrate.mts /app/scripts/approve-member.mts /app/scripts/seed.mts \
     ./scripts/
COPY --from=build --chown=node:node /migrate/node_modules ./scripts/node_modules

# Last, so a new SHA doesn't invalidate the layers above.
ARG GIT_SHA=dev
ENV GIT_SHA=$GIT_SHA

USER node
EXPOSE 3000
CMD ["node", "server.js"]
```

Walking through it:

- **`deps`** copies _only_ the package manifests and lockfile, then
  installs. Because source code isn't copied yet, this expensive layer
  is reused on every build until dependencies change.
  `--frozen-lockfile` fails rather than silently updating the lockfile.
  The cache mount keeps pnpm's download store between builds.
- **`build`** copies the source and runs `next build`.
- **`runtime`** starts again from a clean, slim Node image and copies in
  just the standalone server, static assets, migrations and the
  operational scripts. The build tools, the full `node_modules`, and the
  source code are left behind. The result is a fraction of the size and
  has far less in it to go wrong or be exploited.
- **The scripts get their own two packages.** `migrate.mts` runs before
  the server starts, outside its traced bundle, so it's given exactly
  the packages it imports.
- **`HOSTNAME=0.0.0.0`** makes the server listen on all interfaces.
  Inside a container, `localhost` means "this container only," so a
  server bound to it can't be reached from outside.
- **`GIT_SHA` comes last.** It changes on every commit; putting it at
  the end means only this tiny layer is rebuilt. It's the _one_ piece of
  build-specific information in the image, reported by `/api/health` so
  the deploy pipeline can confirm which commit is live.
- **`USER node`** runs the app as an unprivileged user. If an attacker
  ever finds a way to run code in the container, they don't get root.

A `.dockerignore` file keeps `node_modules`, `.next`, `.env` and test
output out of the build context. In particular, **never copy `.env` into
an image**: anyone who can pull the image could read your secrets.

Try it:

```sh
docker build -t flight-club --build-arg GIT_SHA=$(git rev-parse HEAD) .
docker run --rm -p 3000:3000 --env-file .env \
  -e DATABASE_URL=postgres://flightclub:flightclub@host.docker.internal:5432/flightclub \
  flight-club
```

(`host.docker.internal` is how a container reaches your machine's
`localhost`, where the Compose database is listening.)

## Build Once, Configure at Runtime

Here's the principle the rest of the delivery pipeline depends on:

> [!IMPORTANT]
> **The image must not know which environment it's in.** The exact image
> tested on staging is the one promoted to production. Everything that
> differs between environments (database, secrets, URLs, bucket) comes
> from environment variables when the container starts.

If staging and production had separately built images, "it worked on
staging" would prove nothing about production. With one image, the
only differences are configuration, which is small, explicit and easy
to review.

This has a practical consequence for the code: **`next build` must not
need runtime configuration.** The build imports every module, so any
module that connected to the database or read a required secret _at
import time_ would fail the build, or worse, bake a value in. That's why
`db()`, `auth()` and the S3 client are all created lazily, on first use,
and why the environment is read through functions rather than at the
top of a module.

> [!WARNING]
> In Next.js, any environment variable whose name starts with
> `NEXT_PUBLIC_` is inlined into the browser JavaScript **at build time**.
> That breaks "build once" (the value is frozen into the image) and
> exposes it to every visitor. Flight Club uses none. Keep secrets
> without that prefix, and read them only on the server.

The same trap has a subtler form. The sign-in page shows "Continue with
Google" only where Google's credentials are set (Chapter 7). The page
is otherwise static, so Next.js prerenders it at build time
(Chapter 11), and a component that merely read the environment would
be prerendered with it too: built where no credentials exist, every
environment would show no buttons forever. The component has to say
that it depends on the request:

```tsx
// src/app/(auth)/social-sign-in.tsx (excerpt)
export async function SocialSignIn({ error }: { error?: string }) {
  // Which providers are set up is runtime configuration: the same image
  // runs in every environment, so this can't be decided at build time.
  await connection();
  const providers = enabledProviders(serverEnv());
  if (providers.length === 0) return null;
  // ...
}
```

`connection()` from `next/server` marks everything after it as
request-time, so the buttons stream into the prerendered shell inside
their `<Suspense>` boundary, decided by the running container's
environment.

## Validating Configuration

A missing or malformed environment variable should stop the app at
startup with a clear message, not cause a confusing failure on the
first request that needs it. Flight Club validates its environment with
the same tool it uses for forms, Zod:

```ts
// src/lib/env.ts (excerpt)
const serverEnvSchema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  // Signs session cookies.  Generate with `openssl rand -base64 32`.
  BETTER_AUTH_SECRET: z.string().min(32),
  // The app's public origin; requests from any other origin are rejected.
  BETTER_AUTH_URL: z.url({ protocol: /^https?$/ }),
  // Set at image build time; reported by /api/health.
  GIT_SHA: z.string().default("dev"),
});

export function parseServerEnv(source: Record<string, string | undefined>) {
  const result = serverEnvSchema.safeParse({
    ...source,
    // Render sets RENDER_EXTERNAL_URL on web services, so BETTER_AUTH_URL
    // is only needed elsewhere or to serve from a custom domain.
    BETTER_AUTH_URL: source.BETTER_AUTH_URL ?? source.RENDER_EXTERNAL_URL,
  });
  if (!result.success) {
    throw new Error(
      `Invalid server environment:\n${z.prettifyError(result.error)}`,
    );
  }
  return result.data;
}

let cached: ServerEnv | undefined;

// Parsed on first use rather than at import so `next build` works without
// a database configured; the same image is promoted across environments
// and only gets its real values at runtime.
export function serverEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}
```

Notice:

- **Types come for free.** `serverEnv().DATABASE_URL` is a `string`,
  guaranteed present and valid. Nothing else in the code touches
  `process.env` directly.
- **Rules catch real mistakes.** A secret shorter than 32 characters is
  rejected. A database URL with the wrong scheme is rejected.
- **The parser takes its source as a parameter**, so it can be unit
  tested (`src/lib/env.test.ts`) with any combination of variables,
  following Chapter 8's advice.
- **Optional features are validated separately.** The photo bucket
  settings have their own schema and are checked only when a photo is
  uploaded or viewed (Chapter 10), so the app can run before a bucket is
  set up. Google and Apple sign-in are optional in a different way:
  each turns on only when both its ID and secret are present, so an
  environment can have one, both or neither.

## Health Checks

A hosting platform needs to know when a new container is ready for
traffic, and whether a running one has stopped working. That's what a
**health check** endpoint is for:

```ts
// src/app/api/health/route.ts
// Used by the deploy workflow to wait for a specific commit to go live,
// and by Render as the service health check.
export async function GET() {
  // Run at request time: the SHA and database status are runtime facts.
  await connection();
  const { GIT_SHA: sha } = serverEnv();

  try {
    await db().execute(sql`select 1`);
    return Response.json({ status: "ok", sha, database: "ok" });
  } catch (error) {
    console.error("Health check: database unreachable", error);
    return Response.json(
      { status: "error", sha, database: "unreachable" },
      { status: 503 },
    );
  }
}
```

It does three jobs:

1. **Is the app up?** Any response at all says the server started.
2. **Is it configured?** `serverEnv()` throws if the environment is
   invalid, which fails the check.
3. **Can it reach its database?** `select 1` is the cheapest possible
   query.

During a deploy, the platform starts the new container and sends
traffic to it only once the health check passes. If it never does,
because of a bad configuration or an unreachable database, the old
version keeps serving. A broken release never reaches users.

## Logs

Inside a container, write logs to standard output and standard error
(`console.log`, `console.error`). The platform collects them; don't
write log files, which would vanish with the container. Log enough
context to debug a problem without logging secrets or members' personal
data.

## Summary

- An image is a layered filesystem snapshot plus a command; a container
  is a running instance. Order Dockerfile steps from least to most
  frequently changing.
- Multi-stage builds install and build in heavy stages, then copy only
  the results into a slim runtime image that runs as a non-root user.
- One image runs in every environment. All configuration comes from
  environment variables at runtime; the build must not need any.
- Validate the environment with a schema, in one place, and fail
  clearly.
- A health check that exercises configuration and the database lets the
  platform refuse a broken release.

## Exercises

1. Build the image locally and run `docker image ls flight-club`. How
   large is it? Now comment out the `runtime` stage's `FROM` (so the
   build stage is final) and compare.
2. Run the container with `BETTER_AUTH_SECRET=short`. What does
   `/api/health` return? What appears in the container's logs?
3. Run `docker run --rm flight-club whoami`. Who is the app running as?

**Next:** [Chapter 14. Continuous Delivery](14-continuous-delivery.md)
