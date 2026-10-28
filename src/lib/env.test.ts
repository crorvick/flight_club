import { describe, expect, it } from "vitest";

import { parseServerEnv } from "./env";

describe("parseServerEnv", () => {
  it("accepts a postgres URL and defaults GIT_SHA", () => {
    const env = parseServerEnv({
      DATABASE_URL: "postgres://user:pass@localhost:5432/db",
    });
    expect(env.GIT_SHA).toBe("dev");
  });

  it("accepts the postgresql:// scheme", () => {
    expect(() =>
      parseServerEnv({ DATABASE_URL: "postgresql://localhost/db" }),
    ).not.toThrow();
  });

  it("rejects a missing DATABASE_URL", () => {
    expect(() => parseServerEnv({})).toThrow(/DATABASE_URL/);
  });

  it("rejects a non-postgres URL", () => {
    expect(() =>
      parseServerEnv({ DATABASE_URL: "mysql://localhost/db" }),
    ).toThrow(/DATABASE_URL/);
  });
});
