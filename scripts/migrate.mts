// Apply pending migrations from drizzle/.  Runs as a pre-deploy job inside
// the production image, so it uses plain Node (which strips the TypeScript
// types itself) and only drizzle-orm and postgres; neither drizzle-kit nor
// a build step is available there.
import { existsSync } from "node:fs";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const migrationsFolder = "./drizzle";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

if (!existsSync(`${migrationsFolder}/meta/_journal.json`)) {
  console.log("No migrations to apply");
  process.exit(0);
}

const client = postgres(url, { max: 1, onnotice: () => {} });
try {
  await migrate(drizzle(client), { migrationsFolder });
  console.log("Migrations applied");
} finally {
  await client.end();
}
