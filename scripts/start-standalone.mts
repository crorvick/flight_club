// Run the standalone server from `next build` the way the Docker image
// does.  `next start` doesn't support output: "standalone", and the
// standalone server expects public/ and .next/static/ copied in beside it.
import { spawn } from "node:child_process";
import { cpSync, existsSync } from "node:fs";

const dir = ".next/standalone";
if (!existsSync(`${dir}/server.js`)) {
  console.error("No standalone build found; run `pnpm build` first");
  process.exit(1);
}

// public/ may not exist yet; Git doesn't track empty directories.
if (existsSync("public")) {
  cpSync("public", `${dir}/public`, { recursive: true });
}
cpSync(".next/static", `${dir}/.next/static`, { recursive: true });

const args = existsSync(".env") ? ["--env-file=.env"] : [];
const server = spawn(process.execPath, [...args, `${dir}/server.js`], {
  stdio: "inherit",
});
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.kill(signal));
}
server.on("exit", (code) => process.exit(code ?? 1));
