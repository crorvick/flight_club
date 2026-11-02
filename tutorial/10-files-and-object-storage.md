# Chapter 10. Files and Object Storage

A photo of a cracked fairing or a leaking strut tells the mechanic more
than a paragraph. But photos are a different kind of data from flight
records: large, opaque, written once, and read rarely. This chapter
explains why they don't belong in the database or on the server's disk,
introduces object storage and the S3 API, and builds Flight Club's photo
pipeline from the phone's camera to a private download.

In this chapter you'll learn:

- Why files go in object storage, not the database or local disk
- How S3-compatible storage works: buckets, keys and objects
- How to run an S3-compatible server locally
- How to process images in the browser before uploading
- How to upload safely, so a failure never leaves a broken record
- How to serve private files only to signed-in users

## Why Not the Disk? Why Not the Database?

The obvious place to put an uploaded file is a folder on the server.
In a modern deployment, that's a trap:

- **The disk is ephemeral.** Container hosts like Render give each
  deploy a fresh filesystem. Every photo uploaded since the last deploy
  would vanish. (Persistent disks are available, at extra cost, but
  they tie the service to one machine.)
- **It doesn't scale out.** With two instances of the app behind a load
  balancer, a photo uploaded to one isn't on the other.
- **It isn't backed up** with the database, so restoring one leaves the
  other out of step.

The database can hold binary data (`bytea` in PostgreSQL), and for a
few small files that's fine. But photos would quickly dominate its
size, making backups, restores and replication slow and expensive, for
data that's never queried.

**Object storage** is built for exactly this: cheap, extremely durable,
effectively unlimited storage of files, accessed over HTTP.

## Buckets, Keys and Objects

Amazon S3 defined the model that nearly every provider now copies:

- A **bucket** is a named container, like `flight-club-photos-production`.
- An **object** is a file: some bytes plus metadata such as its content
  type.
- A **key** is the object's name within the bucket, like
  `squawks/3f2c…/a91b….jpg`. Slashes are just characters, but tools
  display them as folders.

You `PUT` an object to a key, `GET` it back, `DELETE` it. There's no
editing in place, no partial updates, and no queries beyond listing keys
by prefix. That simplicity is what makes it cheap and durable.

The **S3 API** has become a standard. Cloudflare R2, Backblaze B2,
Google Cloud Storage (in interoperability mode), DigitalOcean Spaces,
and self-hosted servers like MinIO, Garage and RustFS all speak it.
Write against the S3 API and you can switch providers by changing
configuration.

Flight Club uses **Cloudflare R2** in production: a free tier of 10 GB,
low storage prices after that, and, unusually, no charge for
downloads ("egress"), which on AWS can be the largest part of the bill.

> [!IMPORTANT]
> Keep buckets **private**. A public bucket serves any object to anyone
> who knows or guesses its URL. Squawk photos might show a member's face,
> a tail number in an embarrassing state, or the inside of a hangar.
> Flight Club's buckets have public access off, and photos are only ever
> served through the app (below).

## Storage in Development

Locally and in CI we run **RustFS**, an S3-compatible server, alongside
PostgreSQL in Docker Compose:

```yaml
# docker-compose.yml (excerpt)
storage:
  image: rustfs/rustfs:1.0.1
  environment:
    RUSTFS_ACCESS_KEY: flightclub
    RUSTFS_SECRET_KEY: flightclub-secret
  ports:
    - "9000:9000" # the S3 API
    - "9001:9001" # a web console
  volumes:
    - storagedata:/data
```

The app is configured for it through environment variables:

```sh
S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_BUCKET=flight-club-photos
S3_ACCESS_KEY_ID=flightclub
S3_SECRET_ACCESS_KEY=flightclub-secret
S3_FORCE_PATH_STYLE=true
```

`S3_FORCE_PATH_STYLE` deserves a word. Real S3 addresses buckets as
subdomains (`https://my-bucket.s3.amazonaws.com/key`). A local server on
`localhost` can't do that, so it uses paths
(`http://localhost:9000/my-bucket/key`) instead.

A script creates the bucket if it's missing:

```sh
pnpm storage:init
```

## A Thin Storage Module

The app talks to storage through the official AWS SDK, wrapped in a
small module so the rest of the code never sees it:

```ts
// src/lib/storage.ts
import "server-only";

import {
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { storageEnv } from "@/lib/env";

let client: S3Client | undefined;

function s3() {
  if (!client) {
    const env = storageEnv();
    client = new S3Client({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      },
    });
  }
  return client;
}

export async function putObject(
  key: string,
  body: Uint8Array,
  contentType: string,
) {
  await s3().send(
    new PutObjectCommand({
      Bucket: storageEnv().S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

// The object's bytes as a web stream, or null if it doesn't exist.
export async function getObject(key: string) {
  try {
    const result = await s3().send(
      new GetObjectCommand({ Bucket: storageEnv().S3_BUCKET, Key: key }),
    );
    return result.Body?.transformToWebStream() ?? null;
  } catch (error) {
    if (error instanceof NoSuchKey) return null;
    throw error;
  }
}
```

Two design points:

- Like the database pool, the client is created lazily, on first use.
- Storage settings are validated separately from the core settings
  (Chapter 13), and are **optional at startup**. If no bucket is
  configured yet, the app still runs and squawks can still be reported;
  only attaching photos fails. A missing optional feature shouldn't take
  down the whole app.

The database records which photos belong to which squawk:

```ts
// src/db/schema.ts (excerpt)
// Photos live in the S3-compatible bucket; this records which belong to
// which squawk, under what key.
export const squawkPhoto = pgTable("squawk_photo", {
  id: id(),
  squawkId: uuid("squawk_id")
    .notNull()
    .references(() => squawk.id, { onDelete: "cascade" }),
  storageKey: text("storage_key").notNull().unique(),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  createdAt: createdAt(),
});
```

## Shrink Before You Send

A modern phone photo is 3 to 6 MB. Uploading four of them over a weak
signal at the edge of the airfield takes ages, and a squawk photo
doesn't need 48 megapixels. So the browser shrinks each photo before
uploading, using the Canvas API:

```ts
// src/app/(member)/squawks/shrink-photo.ts (excerpt)
// Phone cameras produce 3–6 MB photos; for a squawk, 1600px is plenty.
// Shrinking before upload makes the submit quick on a weak signal at the
// field, and re-encoding drops the location the camera embeds.
const MAX_EDGE = 1600;
const QUALITY = 0.8;

export async function shrinkPhoto(file: File): Promise<File> {
  try {
    // Applies the camera's rotation, so portrait shots stay upright.
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#fff"; // JPEG has no transparency
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", QUALITY),
    );
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^.]*$/, "") + ".jpg", {
      type: "image/jpeg",
    });
  } catch {
    // The browser can't decode it.  Send the original; the server
    // explains if it isn't a type or size it accepts.
    return file;
  }
}
```

The result is a few hundred kilobytes. As a bonus, re-encoding strips
the **EXIF metadata** that cameras embed, including the GPS location
where the photo was taken, which is a privacy improvement nobody had to
ask for.

> [!IMPORTANT]
> Client-side processing is an optimization, never a guarantee. The
> server still checks every upload's type, size and count (`checkPhotos`
> in `src/lib/squawk-rules.ts`), because a request can come from anything.
> The server's body size limit is also raised, deliberately and to a
> bounded value, in `next.config.ts`: `serverActions.bodySizeLimit:
"10mb"`.

## Uploading Without Leaving a Mess

A squawk with photos is now _two_ writes to _two_ systems: objects in
the bucket and rows in the database. There's no transaction spanning
both. What order should they happen in?

Consider each failure:

- **Database first, then upload.** If the upload fails, the squawk
  exists with photo rows pointing at objects that don't exist. Members
  see broken images.
- **Upload first, then database.** If the database write fails, there
  are objects in the bucket that nothing refers to. Nobody sees anything
  wrong; they just take up a little space.

The second failure is harmless, so that's the order:

```ts
// src/app/(member)/squawks/actions.ts (excerpt)
// Upload first, then record the squawk: a failed upload then leaves
// nothing behind but an unreferenced object, never a squawk whose
// photos are missing.
const squawkId = randomUUID();
const uploads = photos.map((file) => {
  const id = randomUUID();
  return {
    id,
    file,
    key: `squawks/${squawkId}/${id}.${PHOTO_TYPES[file.type]}`,
  };
});
try {
  await Promise.all(
    uploads.map(async (u) =>
      putObject(u.key, new Uint8Array(await u.file.arrayBuffer()), u.file.type),
    ),
  );
} catch (error) {
  console.error("Squawk photo upload failed", error);
  return {
    error:
      "The photos couldn't be saved. Try again, or remove them and report it without photos.",
  };
}

await db().transaction(async (tx) => {
  await tx.insert(squawk).values({
    id: squawkId,
    aircraftId,
    reportedById: member.id,
    ...parsed.data,
  });
  if (uploads.length > 0) {
    await tx.insert(squawkPhoto).values(
      uploads.map((u) => ({
        id: u.id,
        squawkId,
        storageKey: u.key,
        contentType: u.file.type,
        sizeBytes: u.file.size,
      })),
    );
  }
});
```

This is where generating UUIDs in the app (Chapter 4) pays off: the
squawk's ID is known before the squawk exists, so the photos' keys can
include it.

Notice also that the **keys are generated by the server**, never taken
from the uploaded file's name. A filename like `../../etc/passwd` or
`<script>.jpg` can't cause trouble if it's never used.

The general lesson: when an operation spans systems that can't share a
transaction, order the steps so that any partial failure leaves a
harmless state. If orphans accumulate, a periodic cleanup job can
delete objects that no row references.

## Serving Private Files

A private bucket can't be linked to directly. There are two common ways
to let authorized users see its objects:

1. **Presigned URLs.** The server generates a time-limited URL, signed
   with its credentials, that lets the browser fetch one object directly
   from the bucket. It's efficient for large files, but the URL works
   for anyone who has it until it expires, and the bucket needs CORS
   configuration.
2. **Proxy through the app.** The browser asks the app; the app checks
   the session and streams the object from the bucket.

For small photos, the second is simpler and keeps every access check in
one place. It's a route handler:

```ts
// src/app/(member)/squawks/photos/[id]/route.ts
// Squawk photos stay private: the bucket isn't public, and the bytes are
// passed through here only to active members.  Photos are small after
// the browser shrinks them, so this costs little, and it needs no CORS or
// public URL on the bucket.
export async function GET(
  _request: Request,
  { params }: RouteContext<"/squawks/photos/[id]">,
) {
  const access = decideAccess(await getCurrentMember(), "active");
  if (access === "sign-in") return new Response(null, { status: 401 });
  if (access !== "allow") return new Response(null, { status: 403 });

  const { id } = await params;
  if (!isUuid(id)) return new Response(null, { status: 404 });
  const [photo] = await db()
    .select()
    .from(squawkPhoto)
    .where(eq(squawkPhoto.id, id));
  const body = photo && (await getObject(photo.storageKey));
  if (!body) return new Response(null, { status: 404 });

  return new Response(body, {
    headers: {
      "Content-Type": photo.contentType,
      "Content-Length": String(photo.sizeBytes),
      // A photo never changes once uploaded.  Private: it's only for
      // members, so shared caches mustn't keep it.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
```

Points to notice:

- It returns proper status codes rather than redirecting, because it's
  fetched by `<img>` tags, not navigated to.
- The response **streams**: bytes flow from the bucket through the app
  to the browser without the whole file being held in memory.
- `Content-Type` comes from the database record, not from guessing.
- `Cache-Control: private, max-age=31536000, immutable` lets the
  member's browser keep the photo for a year without asking again,
  because photos never change, while `private` forbids shared caches
  (like a CDN) from storing it and serving it to someone else.

## Backups for Files

Database backups don't include the bucket (Chapter 15). R2 and S3 store
objects redundantly across devices and facilities, so losing a file to
hardware failure is vanishingly unlikely. Deleting one by mistake is a
different matter: unless you enable **object versioning** (on S3) or
copy the bucket elsewhere periodically, a deleted object is gone. Decide
which risks matter for your data, and write the decision down.

## Summary

- Files go in object storage: durable, cheap, and shared by every app
  instance. Not the server's ephemeral disk, and not usually the
  database.
- S3's model (buckets, keys, objects) is a de facto standard; code
  against it and providers become interchangeable.
- Keep buckets private. Serve files through the app, or with short-lived
  presigned URLs.
- Shrink images in the browser to save bandwidth and strip location
  metadata, but validate everything again on the server.
- Across systems with no shared transaction, order writes so a failure
  leaves only harmless debris. Generate storage keys on the server.

## Exercises

1. Report a squawk with a photo locally, then open the RustFS console at
   `http://localhost:9001` and find the object. Compare its size with
   the original photo.
2. Copy a photo's URL from a squawk page, sign out, and open it. What
   status code do you get? Which line returned it?
3. Sketch a cleanup script that deletes objects under `squawks/` that
   have no `squawk_photo` row. What would make it safe to run while
   members are uploading? (Hint: object age.)

**Next:** [Chapter 11. Rendering, Streaming and Caching](11-rendering-streaming-and-caching.md)
