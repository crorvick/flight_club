// Activate a member and, optionally, set their role tags:
//
//   node scripts/approve-member.mts <email> [role...]
//
// With roles, they replace the member's current tags; without, the tags are
// left alone.  This is how the first officer is created (sign up, then
// run this with `officer pilot`), and how members are approved until
// officers have a page for it.  Like migrate.mts it needs only postgres,
// so it also runs inside the production image, e.g. from
// `doctl apps console <app-id> web`.
import postgres from "postgres";

const [rawEmail, ...roles] = process.argv.slice(2);
if (!rawEmail) {
  console.error("Usage: node scripts/approve-member.mts <email> [role...]");
  process.exit(2);
}
// Better Auth stores emails lowercased.
const email = rawEmail.toLowerCase();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const sql = postgres(url, { max: 1, onnotice: () => {} });
try {
  const rows = await sql`
    update member
    set active = true,
        roles = ${roles.length > 0 ? sql`${roles}::text[]` : sql`roles`},
        updated_at = now()
    where email = ${email}
    returning name, roles
  `;
  if (rows.length === 0) {
    console.error(`No member with email ${email}; they need to sign up first`);
    process.exitCode = 1;
  } else {
    const [{ name, roles: tags }] = rows;
    console.log(
      `Approved ${name} <${email}> with roles: ${tags.join(", ") || "none"}`,
    );
  }
} catch (error) {
  // The member_roles_known check constraint rejects unknown tags.
  if (error instanceof postgres.PostgresError && error.code === "23514") {
    console.error(`Unknown role in: ${roles.join(", ")}`);
    process.exitCode = 1;
  } else {
    throw error;
  }
} finally {
  await sql.end();
}
