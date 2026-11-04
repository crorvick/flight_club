import "server-only";

import { createHash } from "node:crypto";

// A member's picture from Gravatar, looked up by the SHA-256 of their
// email, trimmed and lowercased.  `size` is in CSS pixels; twice that is
// asked for, for sharp screens.  With d=404 an address without one fails
// to load, and <Avatar> keeps the initials, rather than showing
// Gravatar's own stand-in.
export function gravatarUrl(email: string, size: number) {
  const hash = createHash("sha256")
    .update(email.trim().toLowerCase())
    .digest("hex");
  return `https://gravatar.com/avatar/${hash}?s=${size * 2}&d=404&r=g`;
}
