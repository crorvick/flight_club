import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { serverEnv } from "@/lib/env";

import * as schema from "./schema";

function connect() {
  const client = postgres(serverEnv().DATABASE_URL);
  return drizzle(client, { schema });
}

// Reuse one connection pool across hot reloads in development; otherwise
// every edit would open a new pool and eventually exhaust connections.
const globalForDb = globalThis as unknown as {
  db?: ReturnType<typeof connect>;
};

export function db() {
  globalForDb.db ??= connect();
  return globalForDb.db;
}
