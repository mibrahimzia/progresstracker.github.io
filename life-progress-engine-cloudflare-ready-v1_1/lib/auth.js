const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex) {
  if (typeof hex !== "string" || !/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) {
    throw new Error("invalid hex salt");
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

function base64url(bytes) {
  let str = btoa(String.fromCharCode(...bytes));
  return str.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const bin = atob(str);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

function parseStoredHash(stored) {
  if (typeof stored !== "string") return null;
  const parts = stored.trim().split(":");
  if (parts.length !== 3) return null;
  const iterations = Number(parts[0]);
  const saltHex = parts[1];
  const hashHex = parts[2];
  if (!Number.isInteger(iterations) || iterations < 10000 || iterations > 1000000) return null;
  if (!/^[0-9a-f]{32}$/i.test(saltHex)) return null;
  if (!/^[0-9a-f]{64}$/i.test(hashHex)) return null;
  return { iterations, saltHex, hashHex };
}

export function isPasswordHashConfigured(stored) {
  return Boolean(parseStoredHash(stored));
}

async function pbkdf2Hash(password, saltHex, iterations) {
  const salt = hexToBytes(saltHex);
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    keyMaterial,
    256
  );
  return bytesToHex(new Uint8Array(bits));
}

export async function hashPassword(password, iterations = 150000) {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const saltHex = bytesToHex(saltBytes);
  const hashHex = await pbkdf2Hash(password, saltHex, iterations);
  return `${iterations}:${saltHex}:${hashHex}`;
}

export async function verifyPassword(password, stored) {
  const parsed = parseStoredHash(stored);
  if (!parsed) return false;
  try {
    const computed = await pbkdf2Hash(password, parsed.saltHex, parsed.iterations);
    return timingSafeEqual(computed, parsed.hashHex);
  } catch {
    return false;
  }
}

async function hmacKey(secret) {
  if (typeof secret !== "string" || secret.length < 32) throw new Error("SESSION_SECRET is not configured");
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

export async function createSessionToken(secret, payload, ttlMs = 1000 * 60 * 60 * 24 * 30) {
  const body = { ...payload, exp: Date.now() + ttlMs };
  const payloadB64 = base64url(encoder.encode(JSON.stringify(body)));
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payloadB64));
  return `${payloadB64}.${base64url(new Uint8Array(sig))}`;
}

export async function verifySessionToken(secret, token) {
  if (!token || !token.includes(".")) return null;
  try {
    const [payloadB64, sigB64] = token.split(".");
    const key = await hmacKey(secret);
    const expectedSig = await crypto.subtle.sign("HMAC", key, encoder.encode(payloadB64));
    const expectedB64 = base64url(new Uint8Array(expectedSig));
    if (!timingSafeEqual(sigB64, expectedB64)) return null;
    const payload = JSON.parse(decoder.decode(base64urlDecode(payloadB64)));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function readCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  const match = header.match(new RegExp(`(?:^|; )${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function sessionCookieHeader(token, { maxAgeSeconds = 60 * 60 * 24 * 30, clear = false } = {}) {
  const value = clear ? "" : token;
  const maxAge = clear ? 0 : maxAgeSeconds;
  return `lpe_session=${encodeURIComponent(value)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
}

export async function requireSession(request, env) {
  const token = readCookie(request, "lpe_session");
  return verifySessionToken(env.SESSION_SECRET, token);
}
