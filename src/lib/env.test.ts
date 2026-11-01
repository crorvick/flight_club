import { describe, expect, it } from "vitest";

import { parseServerEnv, parseStorageEnv } from "./env";

describe("parseStorageEnv", () => {
  const storage = {
    S3_BUCKET: "photos",
    S3_ACCESS_KEY_ID: "key",
    S3_SECRET_ACCESS_KEY: "secret",
  };

  it("defaults to R2-style settings", () => {
    expect(parseStorageEnv(storage)).toEqual({
      ...storage,
      S3_REGION: "auto",
      S3_FORCE_PATH_STYLE: false,
    });
  });

  it("reads path-style addressing for local emulators", () => {
    const env = parseStorageEnv({
      ...storage,
      S3_ENDPOINT: "http://localhost:9000",
      S3_FORCE_PATH_STYLE: "true",
    });
    expect(env.S3_FORCE_PATH_STYLE).toBe(true);
    expect(env.S3_ENDPOINT).toBe("http://localhost:9000");
  });

  it("rejects a missing bucket", () => {
    expect(() => parseStorageEnv({ ...storage, S3_BUCKET: undefined })).toThrow(
      /S3_BUCKET/,
    );
  });
});

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

  it("falls back to Render's external URL for the auth URL", () => {
    const env = parseServerEnv({
      ...valid,
      BETTER_AUTH_URL: undefined,
      RENDER_EXTERNAL_URL: "https://flight-club.onrender.com",
    });
    expect(env.BETTER_AUTH_URL).toBe("https://flight-club.onrender.com");
  });

  it("prefers an explicit auth URL over Render's", () => {
    const env = parseServerEnv({
      ...valid,
      RENDER_EXTERNAL_URL: "https://flight-club.onrender.com",
    });
    expect(env.BETTER_AUTH_URL).toBe("http://localhost:3000");
  });

  it("rejects a non-http auth URL", () => {
    expect(() =>
      parseServerEnv({ ...valid, BETTER_AUTH_URL: "ftp://example.com" }),
    ).toThrow(/BETTER_AUTH_URL/);
  });
});
