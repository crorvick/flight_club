import { sql } from "drizzle-orm";
import { connection } from "next/server";

import { db } from "@/db";
import { serverEnv } from "@/lib/env";

// Used by the deploy workflow to wait for a specific commit to go live,
// and by Render as the service health check.
export async function GET() {
  // Render at request time: the SHA and database status are runtime facts.
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
