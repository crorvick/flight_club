import { eq } from "drizzle-orm";

import { db } from "@/db";
import { squawkPhoto } from "@/db/schema";
import { decideAccess } from "@/lib/access";
import { isUuid } from "@/lib/ids";
import { getCurrentMember } from "@/lib/session";
import { getObject } from "@/lib/storage";

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
