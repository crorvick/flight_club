# Chapter 14. Continuous Delivery

We have an app, tests, and an image. The last step is getting changes
from a developer's laptop to members' phones, safely and repeatably,
without anyone typing commands on a production server. This chapter
builds Flight Club's delivery pipeline: every change is checked
automatically, every merge goes to a staging environment, and a person
decides when the _same_ build goes to production.

In this chapter you'll learn:

- What continuous integration and continuous delivery mean in practice
- How GitHub Actions workflows are structured
- How to build an image once and promote it unchanged
- How a hosting platform like Render deploys an image, runs
  migrations, and switches traffic safely
- How to roll back, and why it's easy here
- A few pitfalls that catch everyone once

## The Pipeline at a Glance

```mermaid
flowchart LR
    PR["Pull request"] --> C1["Checks:<br/>typecheck, lint, format,<br/>unit, E2E"]
    PR --> D1["Docker build<br/>(not pushed)"]
    M["Merge to master"] --> C2["Checks"] --> I["Build image once<br/>ghcr.io/…:&lt;sha&gt;"] --> S["Deploy to staging"]
    P["Promote (by hand)<br/>sha=&lt;commit&gt;"] --> Prod["Deploy the same image<br/>to production"]
    I -.->|same image| Prod
```

Three properties make it trustworthy:

1. **Nothing reaches `master` without passing the checks**, and nothing
   is deployed that didn't pass them.
2. **One image per commit**, built once. Staging and production run
   byte-identical images.
3. **Production changes only when a person decides**, after checking
   staging, on a real phone as well as a desktop.

**Continuous integration** (CI) is the first property: integrating every
change into the main branch frequently, with automated checks.
**Continuous delivery** (CD) is the rest: every change that passes is
deployable, and deploying is a routine, push-button operation.

## GitHub Actions in Brief

**GitHub Actions** runs **workflows**, defined in YAML files under
`.github/workflows/`. A workflow is triggered by **events** (a push, a
pull request, a manual button) and consists of **jobs**, each running on
a fresh virtual machine and made of **steps**. Steps run shell commands
or reusable **actions** published by others (like `actions/checkout`).

Flight Club has four workflow files:

| File          | Trigger              | Does                                                              |
| ------------- | -------------------- | ----------------------------------------------------------------- |
| `checks.yml`  | Called by the others | Typecheck, lint, format, unit tests, migrations, seed, build, E2E |
| `pr.yml`      | Pull request         | Checks, plus a Docker build that isn't pushed                     |
| `deploy.yml`  | Push to `master`     | Checks, build and push the image, deploy to staging               |
| `promote.yml` | Manual               | Deploy an existing commit's image to production                   |

### The Checks

```yaml
# .github/workflows/checks.yml (excerpt)
name: Checks
on:
  workflow_call:

permissions:
  contents: read

jobs:
  check:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:18-alpine
        env:
          {
            POSTGRES_USER: flightclub,
            POSTGRES_PASSWORD: flightclub,
            POSTGRES_DB: flightclub,
          }
        ports: ["5432:5432"]
        options: --health-cmd "pg_isready -U flightclub" --health-interval 2s
      storage:
        image: rustfs/rustfs:1.0.1
        # ...
    env:
      DATABASE_URL: postgres://flightclub:flightclub@localhost:5432/flightclub
      # Only ever signs sessions for throwaway test accounts.
      BETTER_AUTH_SECRET: ci-only-secret-for-throwaway-test-sessions
      # ...
    steps:
      - uses: actions/checkout@v5
      - uses: pnpm/action-setup@v6
      - uses: actions/setup-node@v5
        with: { node-version-file: .nvmrc, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm format:check
      - run: pnpm test
      - run: pnpm db:migrate
      - run: pnpm db:seed # keeps the seed script working
      - run: pnpm storage:init
      - run: pnpm build
      - run: pnpm exec playwright install --with-deps chromium webkit
      - run: pnpm test:e2e
      - uses: actions/upload-artifact@v7
        if: failure()
        with: { name: playwright-report, path: playwright-report/ }
```

Things to notice:

- **Service containers** give the job its own throwaway PostgreSQL and
  storage server, just like Docker Compose does locally.
- **Every migration runs from scratch** on an empty database, which
  catches migrations that only worked because your local database had
  history (recall the enum problem from Chapter 5).
- The steps run **cheapest first**. A formatting error fails in seconds,
  not after ten minutes of browser tests.
- **`permissions: contents: read`** gives the workflow's token the least
  access it needs. Jobs that push images ask for more, explicitly.
- On failure, the Playwright report (with traces) is uploaded so you can
  see what went wrong.

Because `checks.yml` is a reusable workflow (`on: workflow_call`), pull
requests and `master` run _exactly_ the same checks.

## Build Once

When a change lands on `master`, `deploy.yml` builds the image and tags
it with the full commit SHA:

```yaml
# .github/workflows/deploy.yml (excerpt)
on:
  push:
    branches: [master]

concurrency:
  group: deploy-staging
  cancel-in-progress: false

jobs:
  checks:
    uses: ./.github/workflows/checks.yml

  image:
    needs: checks
    permissions: { contents: read, packages: write }
    steps:
      - id: name
        # GHCR image names must be lowercase.
        run: echo "image=ghcr.io/${GITHUB_REPOSITORY,,}" >> "$GITHUB_OUTPUT"
      - uses: docker/setup-buildx-action@v4
      - uses: docker/login-action@v4
        with:
          {
            registry: ghcr.io,
            username: "${{ github.actor }}",
            password: "${{ secrets.GITHUB_TOKEN }}",
          }
      - uses: docker/build-push-action@v7
        with:
          push: true
          tags: ${{ steps.name.outputs.image }}:${{ github.sha }}
          build-args: GIT_SHA=${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  staging:
    needs: image
    environment: { name: staging, url: "${{ vars.APP_URL }}" }
    steps:
      - uses: actions/checkout@v5
      - uses: ./.github/actions/render-deploy
        with:
          image: ${{ needs.image.outputs.image }}
          sha: ${{ github.sha }}
          environment: staging
          deploy-hook-url: ${{ secrets.RENDER_DEPLOY_HOOK_URL }}
          app-url: ${{ vars.APP_URL }}
          registry-token: ${{ secrets.GITHUB_TOKEN }}
```

- `needs:` chains the jobs: no image without passing checks, no deploy
  without an image.
- `concurrency` ensures two staging deploys never run at once; a second
  waits for the first rather than racing it.
- `cache-from`/`cache-to: type=gha` store Docker's layer cache in
  GitHub's cache, so the `deps` layer from Chapter 13 is reused across
  runs.
- The `staging` job runs in a GitHub **Environment** named `staging`,
  which holds that environment's secrets (`RENDER_DEPLOY_HOOK_URL`) and
  variables (`APP_URL`). Production has its own.

## Deploying an Image

The hosting platform, **Render**, is configured with a **Blueprint**,
`render.yaml`, that declares each environment's web service and database
as code:

```yaml
# render.yaml (excerpt)
services:
  - type: web
    name: flight-club-production
    runtime: image
    image:
      url: ghcr.io/crorvick/flight_club:production
      creds:
        fromRegistryCreds:
          name: ghcr
    plan: starter
    preDeployCommand: node scripts/migrate.mts
    healthCheckPath: /api/health
    envVars:
      - key: DATABASE_URL
        fromDatabase:
          name: flight-club-production-db
          property: connectionString
      - key: BETTER_AUTH_SECRET
        generateValue: true
      - key: S3_BUCKET
        sync: false # entered by hand in the dashboard

databases:
  - name: flight-club-production-db
    plan: basic-256mb
    postgresMajorVersion: "18"
    # Reachable only from Render services in the same region.
    ipAllowList: []
```

Each deploy on Render goes through these stages:

```mermaid
sequenceDiagram
    participant GH as GitHub Actions
    participant R as Render
    participant Old as Old container
    participant New as New container
    participant DB as Database
    GH->>R: Deploy hook: imgURL=…:<sha>
    R->>R: Pull image
    R->>DB: Pre-deploy: node scripts/migrate.mts
    Note over R,DB: Migration fails → deploy stops, Old keeps serving
    R->>New: Start container
    R->>New: GET /api/health (until healthy)
    Note over R,New: Never healthy → deploy fails, Old keeps serving
    R->>Old: Switch traffic to New, then stop Old
```

At every failure point, the old version keeps serving. That's
**zero-downtime deployment** with a built-in safety net.

Note what's in the Blueprint and what isn't. The database link and the
generated auth secret are declared; the bucket credentials are marked
`sync: false` and entered by hand, so they never appear in the
repository. Secrets live in the platform and in GitHub Environments,
never in Git.

### The Deploy Action

Both staging and production deploy through one composite action, so
they can't drift apart:

```yaml
# .github/actions/render-deploy/action.yml (excerpt)
runs:
  using: composite
  steps:
    - name: Tag image for ${{ inputs.environment }}
      shell: bash
      # Fails if no image was built for this commit.  The moving tag is what
      # the Render service points at, so a manual redeploy from the Render
      # dashboard also gets this image.
      run: docker buildx imagetools create --tag "$IMAGE:$ENVIRONMENT" "$IMAGE:$SHA"

    - name: Trigger Render deploy
      shell: bash
      run: |
        curl --fail-with-body --silent --show-error \
          --get --data-urlencode "imgURL=$IMAGE:$SHA" "$HOOK_URL"

    - name: Wait for ${{ inputs.sha }} to be live
      shell: bash
      run: |
        for i in $(seq 1 60); do
          live=$(curl --silent --max-time 10 "$APP_URL/api/health" | jq -r '.sha // empty' || true)
          if [ "$live" = "$SHA" ]; then echo "Live: $SHA"; exit 0; fi
          echo "Waiting (live: ${live:-unreachable})..."
          sleep 10
        done
        echo "::error::$SHA was not live after 10 minutes"
        exit 1
```

Three steps:

1. **Retag.** Point the environment's moving tag (`:staging` or
   `:production`) at the commit's image. This copies no image data, just
   a pointer in the registry. It fails if the commit was never built,
   which protects against promoting something that never passed CI.
2. **Trigger.** Call the service's secret deploy hook, naming the exact
   image to deploy.
3. **Verify.** Poll `/api/health` until it reports the expected commit
   SHA. The workflow goes green only when the new version is actually
   serving, not merely when Render accepted the request.

## Promotion to Production

Production deploys run only when a person asks:

```yaml
# .github/workflows/promote.yml (excerpt)
name: Promote to production
on:
  workflow_dispatch:
    inputs:
      sha:
        description: Commit to promote (full or short SHA; must be on master)
        required: true

concurrency:
  group: deploy-production
  cancel-in-progress: false

jobs:
  production:
    # Add required reviewers to this environment in GitHub to gate promotion.
    environment: { name: production, url: "${{ vars.APP_URL }}" }
    steps:
      - uses: actions/checkout@v5
        with: { fetch-depth: 0 }
      - id: resolve
        name: Resolve and verify commit
        env:
          INPUT_SHA: ${{ inputs.sha }}
        run: |
          sha=$(git rev-parse --verify "${INPUT_SHA}^{commit}")
          if ! git merge-base --is-ancestor "$sha" origin/master; then
            echo "::error::$sha is not on master"
            exit 1
          fi
          echo "sha=$sha" >> "$GITHUB_OUTPUT"
      - uses: ./.github/actions/render-deploy
        with:
          sha: ${{ steps.resolve.outputs.sha }}
          environment: production
          # ...
```

Run it from the Actions tab ("Promote to production" → **Run
workflow**), or from a terminal:

```sh
gh workflow run promote.yml -f sha=ad84020
```

The workflow expands a short SHA to the full one and refuses any commit
that isn't on `master`. Adding **required reviewers** to the GitHub
`production` Environment makes the run pause until an authorized person
approves it.

> [!WARNING]
> **"Re-run all jobs" re-runs with the original inputs.** If yesterday you
> promoted commit `0a57717` and today you open that run and click
> "Re-run," you'll promote `0a57717` again, not the commit you meant. To
> promote a new commit, start a **new** run with the new SHA. (This
> exact mistake happened while this app was being built: two re-runs
> faithfully redeployed the old image.) Naming each run after its input
> with `run-name: Promote ${{ inputs.sha }} to production` makes it
> obvious at a glance in the run list.

> [!NOTE]
> Notice `env: INPUT_SHA: ${{ inputs.sha }}` followed by `"${INPUT_SHA}"`
> in the script, rather than writing `${{ inputs.sha }}` directly inside
> `run:`. GitHub substitutes `${{ … }}` into the script text _before_ the
> shell runs it, so a malicious input could inject shell commands.
> Passing inputs through environment variables keeps them as data.

## Rolling Back

If a release goes wrong, roll back by **promoting an earlier commit**.
Its image still exists in the registry, so nothing is rebuilt; the
deploy takes a minute or two.

There's one catch: migrations aren't reversed. If release N added a
column and release N–1 is promoted back, the column is still there.
That's fine _if_ release N–1 doesn't mind an extra column, which is the
subject of the next chapter's "expand and contract" discipline.

## Pitfalls Worth Knowing

- **Secrets in logs.** GitHub masks known secrets in logs, but not
  values derived from them. Don't `echo` anything sensitive.
- **Unpinned actions and images.** `uses: some/action@main` runs
  whatever that branch holds today. Pin to a version (or, for stricter
  supply-chain safety, a commit SHA).
- **The moving tag is for humans.** Render's dashboard "Manual Deploy"
  pulls `:production`, which is why the action retags before deploying:
  a manual redeploy then gets the right image instead of an old one.
- **Free database tiers expire** and don't get backups. Production data
  belongs on a paid plan.

## Summary

- CI runs every check on every change; CD makes every passing change a
  push-button deploy.
- Workflows are YAML: events trigger jobs, jobs run steps. Reusable
  workflows keep pull requests and `master` identical.
- Build one image per commit, tagged with its SHA, and promote it
  unchanged. Retagging is a pointer change, not a rebuild.
- The platform runs migrations before switching traffic and waits for
  a health check; any failure leaves the old version serving.
- Promotion is a manual workflow with an input. Start a new run for a
  new commit; re-runs replay old inputs.
- Roll back by promoting an earlier SHA. Keep migrations backward
  compatible so you can.

## Exercises

1. Open the Actions tab for this repository and find the most recent
   "Deploy to staging" run. How long did each job take? Which step in
   `checks` was slowest?
2. `curl` the staging and production `/api/health` endpoints. Which
   commits are they running? Find those commits with `git log`.
3. Add `run-name: Promote ${{ inputs.sha }} to production` to
   `promote.yml` (below `name:`). How will that change the run list?

**Next:** [Chapter 15. Living With It](15-living-with-it.md)
