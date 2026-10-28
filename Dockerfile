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
# The runtime stage copies these, but neither need exist in a checkout
# yet: there may be no migrations or static files, and Git doesn't track
# empty directories.
RUN mkdir -p drizzle public
# The migrate script runs outside the Next.js server, so the standalone
# output's traced node_modules can't be relied on to have everything it
# imports.  Give it its own copy of the two packages it needs (neither has
# dependencies of its own); -L resolves pnpm's symlinks.
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
# Migrations run separately, before the new version takes traffic:
#   node scripts/migrate.mts
# Members are approved, and staging seeded, from a console on a running
# instance:
#   node scripts/approve-member.mts <email> [role...]
#   node scripts/seed.mts
CMD ["node", "server.js"]
