// Run: node scripts/hash-password.mjs "your passphrase"
// Prints the value to store as the AUTH_PASSWORD_HASH secret.
import { webcrypto as crypto } from "node:crypto";

const password = process.argv[2];
if (!password) {
  console.error('Usage: node scripts/hash-password.mjs "your passphrase"');
  process.exit(1);
}

const encoder = new TextEncoder();

function bytesToHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hashPassword(pw, iterations = 150000) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltHex = bytesToHex(salt);
  const keyMaterial = await crypto.subtle.importKey("raw", encoder.encode(pw), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, keyMaterial, 256);
  const hashHex = bytesToHex(new Uint8Array(bits));
  return `${iterations}:${saltHex}:${hashHex}`;
}

const result = await hashPassword(password);
console.log("\nAUTH_PASSWORD_HASH value:\n");
console.log(result);
console.log("\nSet it with:\n");
console.log(`  npx wrangler pages secret put AUTH_PASSWORD_HASH\n  (paste the value above when prompted)\n`);
