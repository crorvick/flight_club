import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/auth";

// Better Auth's HTTP endpoints (sign-in, sign-out, session, ...).  The
// handler is built per request because auth() is only available at
// runtime, not while `next build` loads this module.
export function GET(request: Request) {
  return toNextJsHandler(auth()).GET(request);
}

export function POST(request: Request) {
  return toNextJsHandler(auth()).POST(request);
}
