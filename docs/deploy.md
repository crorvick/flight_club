# Deployment

Every commit merged to `master` is built into one Docker image, tagged with
its SHA, and pushed to the DigitalOcean Container Registry (DOCR).  That
image is deployed to staging automatically and promoted to production by
hand.  Production never runs anything that wasn't built and tested by CI
and run on staging first.

```
pull request ────► checks (typecheck, lint, format, unit, E2E) + image build
merge to master ─► checks ─► build & push …/flight-club:<sha> ─► staging
promote.yml ─────► deploy the same <sha> ──────────────────────► production
```

Each environment is a DigitalOcean App Platform app with a web service, a
pre-deploy `migrate` job, and its own database.

The workflows live in `.github/workflows/`:

- `checks.yml`: shared by the other two so pull requests and `master` run
  the same checks, against a throwaway Postgres service container.
- `pr.yml`: checks, plus a Docker build (not pushed) to catch Dockerfile
  breakage before merge.
- `deploy.yml`: on push to `master`, checks, then build and push the image
  and deploy it to staging.
- `promote.yml`: run by hand with a commit SHA; deploys that commit's
  existing image to production.

Deploys go through `.github/actions/do-deploy`, which fetches the app's
live spec, sets the image tag on the web service and the migrate job to
the SHA, applies it, and waits until `/api/health` reports the new SHA.
App Platform runs the migrate job (`node scripts/migrate.mts`) before
switching traffic, so a failed migration aborts the deploy with the old
version still running.  Likewise, if the new version fails its health
check, the old one keeps serving.

The specs in `.do/` are only used to create the apps.  Deploys change
nothing but the image tags, so settings made later in the dashboard,
secrets in particular, aren't overwritten.  If you change a spec in
`.do/`, apply the same change to the app by hand (dashboard, or
`doctl apps update`).

## One-time setup

You'll need [`doctl`](https://docs.digitalocean.com/reference/doctl/)
authenticated with a **full-access** personal token, separate from the
scoped token GitHub Actions uses (step 2).  The CI token can update apps
but not create them or databases, so using it here fails with a 403.
Give the full-access token a short expiry, and remove it once both apps
exist:

```sh
doctl auth init --context admin      # paste the full-access token
doctl auth switch --context admin
# ... steps 5–7 ...
doctl auth remove --context admin
```

1. **Create a container registry.**  In the DigitalOcean control panel,
   Container Registry → Create.  Note its name; the image will be
   `registry.digitalocean.com/<registry>/flight-club`.

2. **Create an API token.**  API → Tokens → Generate New Token, with
   custom scopes: `registry` (read, update) and `app` (read, update).
   This is what GitHub Actions uses; don't use it for `doctl` here.

3. **Configure the GitHub repository.**  In Settings → Secrets and
   variables → Actions:

   - Repository secret `DIGITALOCEAN_ACCESS_TOKEN`: the token from step 2.
   - Repository variable `DO_REGISTRY`: the registry name from step 1.

   In Settings → Environments, create `staging` and `production`.  Their
   variables are filled in at step 7.  On `production`, add yourself (and
   any other officers trusted to release) as required reviewers, and
   restrict deployment branches to `master`.  Promotion then pauses for
   approval.

4. **Publish the first image.**  Merge to `master` (or re-run the "Deploy
   to staging" workflow).  The image job pushes `flight-club:<sha>`; the
   staging job will fail because the app doesn't exist yet.  That's
   expected.

5. **Create the production database cluster.**  Databases → Create,
   PostgreSQL, named `flight-club-production-db`, in the same region as
   the app (`nyc` in the specs).  Add a database `flightclub` and a user
   `flightclub`.  Staging uses an App Platform dev database instead,
   which the app creates for itself.

6. **Create the apps** from the specs, using the SHA from step 4:

   ```sh
   sed 's/REPLACE_WITH_SHA/<sha>/' .do/staging.yaml | doctl apps create --spec - --wait
   sed 's/REPLACE_WITH_SHA/<sha>/' .do/production.yaml | doctl apps create --spec - --wait
   ```

   When creating the production app, App Platform adds it to the
   cluster's trusted sources.

7. **Point the GitHub Environments at the apps.**  `doctl apps list`
   shows each app's ID and default URL.  For both `staging` and
   `production`, set:

   - Variable `DO_APP_ID`: the app's ID.
   - Variable `APP_URL`: its public URL with no trailing slash, e.g.
     `https://flight-club-staging-abc12.ondigitalocean.app`.

8. **Re-run the "Deploy to staging" workflow** and confirm it goes green.

## Promoting to production

Check the commit on staging first, on a real phone as well as a desktop.
Then:

```sh
gh workflow run promote.yml -f sha=<commit>
```

or run "Promote to production" from the Actions tab.  The SHA must be on
`master` and must already have an image (i.e. it was deployed to staging).

## Rolling back

Promote an earlier SHA.  The image still exists, so nothing is rebuilt.
Migrations aren't reversed, which is why they should be backward
compatible: add columns and tables in one release, and remove old ones only
in a later release once nothing reads them.

## Registry cleanup

Every merge adds an image, and registry storage is limited by plan.  Delete
old tags now and then and run garbage collection:

```sh
doctl registry repository list-tags flight-club
doctl registry repository delete-tag flight-club <sha> ...
doctl registry garbage-collection start --include-untagged-manifests
```

Keep the SHAs currently on staging and production, and a few earlier
ones to roll back to.

## Backups

The production cluster has daily backups and point-in-time recovery,
included with managed databases.  Restore a backup into a new cluster once
to confirm the procedure works, before there's real member data to lose.
The staging dev database has no backups; it holds only seed data.
