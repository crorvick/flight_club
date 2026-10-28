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
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function parseServerEnv(source: Record<string, string | undefined>) {
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(
      `Invalid server environment:\n${z.prettifyError(result.error)}`,
    );
  }
  return result.data;
}

let cached: ServerEnv | undefined;

// Parsed on first use rather than at import so `next build` works without
// a database configured; the same image is promoted across environments
// and only gets its real values at runtime.
export function serverEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}
