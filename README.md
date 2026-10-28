# Flight Club

A web app for a small flight club: flight logging, squawks and
maintenance, and pilot qualifications. See `docs/spec.md` for what it
does and why, and `docs/deploy.md` for how it gets to staging and
production.

## Stack

Next.js (App Router) and TypeScript, Postgres through Drizzle ORM, Zod
for validation, Tailwind CSS and shadcn/ui, Vitest and Playwright for
tests. It ships as a Docker image to DigitalOcean App Platform.

## Local development

Requires Node 24 or later (see `.nvmrc`), pnpm (`corepack enable`), and
Docker.

```sh
pnpm install
cp .env.example .env
pnpm db:up          # Postgres 18 in Docker Compose
pnpm db:migrate
pnpm db:seed        # sample members, aircraft, flights and squawks
pnpm dev            # http://localhost:3000
```

To get past "waiting for approval", sign up in the app and then approve
yourself: `pnpm member:approve you@example.com officer pilot`.

## Common tasks

| Command               | What it does                                   |
| --------------------- | ---------------------------------------------- |
| `pnpm typecheck`      | Generate route types and run `tsc`             |
| `pnpm lint`           | ESLint                                         |
| `pnpm format`         | Prettier (`format:check` to only check)        |
| `pnpm test`           | Vitest unit tests (`test:watch` while working) |
| `pnpm test:e2e`       | Playwright at phone, tablet and desktop sizes  |
| `pnpm build`          | Production build                               |
| `pnpm start`          | Run the production build as the image does     |
| `pnpm db:generate`    | Write a migration from changes to the schema   |
| `pnpm db:migrate`     | Apply pending migrations                       |
| `pnpm db:seed`        | Fill an empty database with sample data        |
| `pnpm db:studio`      | Browse the database in Drizzle Studio          |
| `pnpm member:approve` | Activate a member and set their roles          |

Database changes: edit `src/db/schema.ts`, run `pnpm db:generate`,
review the SQL it writes to `drizzle/`, then `pnpm db:migrate`. Commit
the schema change and the migration together.

`pnpm test:e2e` uses the dev server locally. With `CI=1` it runs
against the production build instead, so run `pnpm build` first.
