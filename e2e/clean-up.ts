import postgres from "postgres";

// Remove the members the tests signed up, so a local database doesn't
// collect thousands of them over many runs (pages listing members slow
// to a crawl).  Their emails come from uniqueId() in helpers.ts; seeded
// members' don't match.  Anyone still referenced by a flight, squawk or dispatch is
// left alone rather than failing the run; the tests delete their own
// aircraft, and with them those rows, as they go.
export default async function cleanUp() {
  try {
    process.loadEnvFile(".env");
  } catch {
    // No .env: rely on the environment.
  }
  const sql = postgres(process.env.DATABASE_URL!, {
    max: 1,
    onnotice: () => {},
  });
  try {
    await sql`
      delete from member m
      where m.email ~ '^(iphone|android|ipad|desktop)-[0-9]+-[a-z0-9]+@example\\.com$'
        and not exists (select 1 from flight f where f.pilot_id = m.id)
        and not exists (
          select 1 from squawk s
          where s.reported_by_id = m.id or s.resolved_by_id = m.id
        )
        and not exists (
          select 1 from dispatch d
          where m.id in (d.pilot_id, d.closed_by_id, d.gap_reviewed_by_id)
        )
    `;
  } finally {
    await sql.end();
  }
}
