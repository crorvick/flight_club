import { describe, expect, it } from "vitest";

import { parseServerEnv } from "./env";

const valid = {
  DATABASE_URL: "postgres://user:pass@localhost:5432/db",
  BETTER_AUTH_SECRET: "x".repeat(32),
  BETTER_AUTH_URL: "http://localhost:3000",
};

describe("parseServerEnv", () => {
  it("accepts a complete environment and defaults GIT_SHA", () => {
    expect(parseServerEnv(valid).GIT_SHA).toBe("dev");
  });

  it("accepts the postgresql:// scheme", () => {
    expect(() =>
      parseServerEnv({ ...valid, DATABASE_URL: "postgresql://localhost/db" }),
    ).not.toThrow();
  });

  it("rejects a missing DATABASE_URL", () => {
    expect(() => parseServerEnv({ ...valid, DATABASE_URL: undefined })).toThrow(
      /DATABASE_URL/,
    );
  });

  it("rejects a non-postgres URL", () => {
    expect(() =>
      parseServerEnv({ ...valid, DATABASE_URL: "mysql://localhost/db" }),
    ).toThrow(/DATABASE_URL/);
  });

  it("rejects a short auth secret", () => {
    expect(() =>
      parseServerEnv({ ...valid, BETTER_AUTH_SECRET: "too-short" }),
    ).toThrow(/BETTER_AUTH_SECRET/);
  });

  it("rejects a non-http auth URL", () => {
    expect(() =>
      parseServerEnv({ ...valid, BETTER_AUTH_URL: "ftp://example.com" }),
    ).toThrow(/BETTER_AUTH_URL/);
  });
});
