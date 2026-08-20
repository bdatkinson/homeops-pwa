/**
 * lib/jwt.ts — Supabase JWT verification using Bun native Web Crypto (ES256).
 * No external deps.
 *
 * Supabase issues ES256 JWTs signed with a P-256 key pair.
 * Public keys are available at: /auth/v1/.well-known/jwks.json
 *
 * Decoded payload shape (standard + Supabase custom claims):
 * {
 *   sub:        string        // auth.users.id
 *   role:       string        // Supabase DB role ("authenticated" | "anon")
 *   email?:     string
 *   phone?:     string
 *   aud:        string        // "authenticated"
 *   iat:        number
 *   exp:        number
 *   user_role?: "broker_pm" | "consumer"   // injected by custom_access_token_hook
 * }
 */

export interface SupabaseJwtPayload {
  sub: string;
  role: string;
  aud: string;
  iat: number;
  exp: number;
  email?: string;
  phone?: string;
  user_role?: "broker_pm" | "consumer";
  app_metadata?: { role?: string };
  [key: string]: unknown;
}

export class JwtError extends Error {
  constructor(
    public code: "missing" | "malformed" | "invalid_signature" | "expired" | "invalid_audience" | "key_fetch_failed",
    message: string
  ) {
    super(message);
    this.name = "JwtError";
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL;
if (!SUPABASE_URL) throw new Error("SUPABASE_URL must be set");

// JWKS cache — keyed by kid
const keyCache = new Map<string, CryptoKey>();
let jwksFetchedAt = 0;
const JWKS_TTL_MS = 3_600_000; // 1 hour

async function getVerifyKey(kid: string): Promise<CryptoKey> {
  const now = Date.now();

  // Return from cache if fresh
  if (keyCache.has(kid) && now - jwksFetchedAt < JWKS_TTL_MS) {
    return keyCache.get(kid)!;
  }

  // Fetch JWKS
  let jwks: { keys: Array<{ kid: string; kty: string; crv: string; x: string; y: string; alg: string }> };
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`);
    if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
    jwks = await res.json() as typeof jwks;
  } catch (err) {
    throw new JwtError("key_fetch_failed", `Could not fetch JWKS: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Import all keys into cache
  jwksFetchedAt = now;
  for (const jwk of jwks.keys) {
    const key = await crypto.subtle.importKey(
      "jwk",
      jwk as JsonWebKey,
      { name: "ECDSA", namedCurve: jwk.crv },
      false,
      ["verify"]
    );
    keyCache.set(jwk.kid, key);
  }

  if (!keyCache.has(kid)) {
    throw new JwtError("invalid_signature", `No JWKS key found for kid=${kid}`);
  }
  return keyCache.get(kid)!;
}

function base64UrlDecode(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(s.length + ((4 - (s.length % 4)) % 4), "=");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function parseB64Header(headerB64: string): { alg: string; kid: string } {
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlDecode(headerB64)));
  } catch {
    throw new JwtError("malformed", "Could not parse JWT header");
  }
}

export async function verifySupabaseJwt(token: string): Promise<SupabaseJwtPayload> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new JwtError("malformed", "JWT must have 3 parts");

  const [headerB64, payloadB64, sigB64] = parts;

  const header = parseB64Header(headerB64);
  if (!header.kid) throw new JwtError("malformed", "JWT header missing kid");

  // Get verify key (JWKS cache)
  const key = await getVerifyKey(header.kid);

  // Verify signature
  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const sig = base64UrlDecode(sigB64).buffer as ArrayBuffer;

  const valid = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    sig,
    data
  );
  if (!valid) throw new JwtError("invalid_signature", "JWT signature invalid");

  // Decode payload
  let payload: SupabaseJwtPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadB64)));
  } catch {
    throw new JwtError("malformed", "JWT payload not valid JSON");
  }

  // Check expiry
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) {
    throw new JwtError("expired", "JWT expired");
  }

  // Require authenticated audience
  if (payload.aud !== "authenticated") {
    throw new JwtError("invalid_audience", `Expected aud=authenticated, got ${payload.aud}`);
  }

  return payload;
}
