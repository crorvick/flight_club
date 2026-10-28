import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained server in .next/standalone for the Docker image.
  output: "standalone",
  cacheComponents: true,
  experimental: {
    // Enables forbidden() and forbidden.tsx for signed-in members who lack
    // a role.
    authInterrupts: true,
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
