import { z } from "zod";

const serverEnvSchema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  // Signs session cookies.  Generate with `openssl rand -base64 32`.
  BETTER_AUTH_SECRET: z.string().min(32),
  // The app's public origin; requests from any other origin are rejected.
  BETTER_AUTH_URL: z.url({ protocol: /^https?$/ }),
  // Set at image build time; reported by /api/health so deploys can
  // confirm which commit is live.
  GIT_SHA: z.string().default("dev"),
  // Signing in with Google or Apple, each offered only when both its
  // values are set (docs/deploy.md, "Signing in with Google and Apple").
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  // The Services ID, and the client secret: a JWT signed with the key
  // from Apple, which Apple lets last at most six months
  // (scripts/apple-client-secret.mts makes a new one).
  APPLE_CLIENT_ID: z.string().min(1).optional(),
  APPLE_CLIENT_SECRET: z.string().min(1).optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function parseServerEnv(source: Record<string, string | undefined>) {
  const result = serverEnvSchema.safeParse({
    ...source,
    // Render sets RENDER_EXTERNAL_URL on web services, so BETTER_AUTH_URL
    // is only needed elsewhere or to serve from a custom domain.
    BETTER_AUTH_URL: source.BETTER_AUTH_URL ?? source.RENDER_EXTERNAL_URL,
  });
  if (!result.success) {
    throw new Error(
      `Invalid server environment:\n${z.prettifyError(result.error)}`,
    );
  }
  return result.data;
}

// Squawk photo storage: any S3-compatible bucket (R2, S3, B2, ...).  Kept
// apart from the rest so the app runs, and squawks can be reported
// without photos, before a bucket is set up.
const storageEnvSchema = z.object({
  // Omit for AWS itself; other providers give an endpoint URL.
  S3_ENDPOINT: z.url({ protocol: /^https?$/ }).optional(),
  // R2 wants "auto"; AWS wants the bucket's region.
  S3_REGION: z.string().min(1).default("auto"),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  // Local emulators serve buckets at endpoint/bucket rather than as a
  // subdomain.
  S3_FORCE_PATH_STYLE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

export type StorageEnv = z.infer<typeof storageEnvSchema>;

export function parseStorageEnv(source: Record<string, string | undefined>) {
  const result = storageEnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(
      `Invalid photo storage environment:\n${z.prettifyError(result.error)}`,
    );
  }
  return result.data;
}

let cached: ServerEnv | undefined;
let cachedStorage: StorageEnv | undefined;

export function storageEnv(): StorageEnv {
  cachedStorage ??= parseStorageEnv(process.env);
  return cachedStorage;
}

// Parsed on first use rather than at import so `next build` works without
// a database configured; the same image is promoted across environments
// and only gets its real values at runtime.
export function serverEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}
