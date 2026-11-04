// Make the client secret Sign in with Apple needs:
//
//   node scripts/apple-client-secret.mts <team-id> <key-id> <services-id> <key.p8>
//
// Apple doesn't issue a fixed secret.  It's a JWT the club signs with the
// private key downloaded from the Apple developer site, and Apple accepts
// one for at most six months, so this makes one lasting 180 days and says
// when to make the next.  Set the output as APPLE_CLIENT_SECRET; see
// docs/deploy.md, "Signing in with Google and Apple".
import { createPrivateKey, sign } from "node:crypto";
import { readFileSync } from "node:fs";

const [teamId, keyId, clientId, keyFile] = process.argv.slice(2);
if (!teamId || !keyId || !clientId || !keyFile) {
  console.error(
    "Usage: node scripts/apple-client-secret.mts <team-id> <key-id> <services-id> <key.p8>",
  );
  process.exit(2);
}

const DAYS = 180;
const now = Math.floor(Date.now() / 1000);
const expires = now + DAYS * 24 * 60 * 60;

const base64url = (value: object) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");
const unsigned = `${base64url({ alg: "ES256", kid: keyId })}.${base64url({
  iss: teamId,
  iat: now,
  exp: expires,
  aud: "https://appleid.apple.com",
  sub: clientId,
})}`;
// ES256 as JWTs want it: the raw r and s, not DER.
const signature = sign("sha256", Buffer.from(unsigned), {
  key: createPrivateKey(readFileSync(keyFile)),
  dsaEncoding: "ieee-p1363",
}).toString("base64url");

console.log(`${unsigned}.${signature}`);
console.error(
  `Valid until ${new Date(expires * 1000).toISOString().slice(0, 10)}; make a new one before then.`,
);
