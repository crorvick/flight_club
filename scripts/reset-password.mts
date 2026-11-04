// Set a member's password, for one who can't sign in to change it in
// Settings:
//
//   node scripts/reset-password.mts <email>
//
// It asks for the new password twice, without showing it; piped in, it
// reads the first line instead.  It also signs the member out everywhere,
// in case the reason for the reset is someone else knowing the old one.
// Like approve-member.mts it needs only postgres, so it also runs inside
// the production image, from the service's shell in Render.
import { randomBytes, scryptSync } from "node:crypto";
import { createInterface } from "node:readline";

import postgres from "postgres";

const [rawEmail] = process.argv.slice(2);
if (!rawEmail) {
  console.error("Usage: node scripts/reset-password.mts <email>");
  process.exit(2);
}
// Better Auth stores emails lowercased.
const email = rawEmail.toLowerCase();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

// Typed at the terminal, with nothing echoed.
function askHidden(question: string) {
  process.stdout.write(question);
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });
  (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput =
    () => {};
  rl.on("SIGINT", () => {
    process.stdout.write("\n");
    process.exit(130);
  });
  return new Promise<string>((resolve) =>
    rl.once("line", (line) => {
      rl.close();
      process.stdout.write("\n");
      resolve(line);
    }),
  );
}

async function readPassword() {
  if (!process.stdin.isTTY) {
    let input = "";
    for await (const chunk of process.stdin) input += chunk;
    return input.split(/\r?\n/)[0];
  }
  const password = await askHidden("New password: ");
  if ((await askHidden("Again: ")) !== password) {
    console.error("The passwords don't match");
    process.exit(1);
  }
  return password;
}

// As Better Auth hashes them (@better-auth/utils/password), so it can
// check this one at sign-in: scrypt with a random salt, stored as
// "salt:key" in hex.
function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = scryptSync(password.normalize("NFKC"), salt, 64, {
    N: 16384,
    r: 16,
    p: 1,
    maxmem: 128 * 16384 * 16 * 2,
  });
  return `${salt}:${key.toString("hex")}`;
}

const password = await readPassword();
// The limits the sign-up and Settings forms enforce.
if (password.length < 8 || password.length > 128) {
  console.error("Use 8 to 128 characters");
  process.exit(1);
}

const sql = postgres(url, { max: 1, onnotice: () => {} });
try {
  const result = await sql.begin(async (tx) => {
    const [found] = await tx`
      select id, name from member where email = ${email}
    `;
    if (!found) return { error: `No member with email ${email}` };
    const updated = await tx`
      update account
      set password = ${hashPassword(password)}, updated_at = now()
      where user_id = ${found.id} and provider_id = 'credential'
      returning id
    `;
    if (updated.length === 0) {
      return { error: `${found.name} <${email}> has no password to reset` };
    }
    const sessions = await tx`
      delete from session where user_id = ${found.id} returning id
    `;
    return { name: found.name as string, signedOut: sessions.length };
  });
  if ("error" in result) {
    console.error(result.error);
    process.exitCode = 1;
  } else {
    console.log(
      `Reset the password for ${result.name} <${email}>, and signed them out of ${result.signedOut} session(s)`,
    );
  }
} finally {
  await sql.end();
}
