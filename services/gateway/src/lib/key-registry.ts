/**
 * lib/key-registry.ts — Public key resolution for Signed Diagnostic Receipts
 *
 * Production verification path: lookup the receipt's key_id in the
 * `receipt_keys` Supabase table (public keys are public — any downstream
 * verifier can fetch them). Dev fallback: derive the pubkey from the local
 * dev signing key file so unit tests and local runs keep working without
 * a seeded registry.
 */

import { createPublicKey, createPrivateKey } from "node:crypto";
import { supabase } from "./supabase.js";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

/** Path of the local dev signing key (pkcs8 DER). */
export function devKeyPath(): string {
  return path.join(os.homedir(), ".hermes", "homeops-receipt-signing.key");
}

/** Derive the SPKI base64 public key from a pkcs8 DER private key. */
export function spkiBase64OfPrivateKeyDer(privDer: Buffer): string {
  const key = createPrivateKey({ key: privDer, format: "der", type: "pkcs8" });
  return createPublicKey(key).export({ type: "spki", format: "der" }).toString("base64");
}

/** Public key from the local dev key file, or null when absent. */
export function devPublicKeySpki(): string | null {
  try {
    if (!fs.existsSync(devKeyPath())) return null;
    return spkiBase64OfPrivateKeyDer(fs.readFileSync(devKeyPath()));
  } catch {
    return null;
  }
}

/**
 * Resolve the active public key for a key_id.
 * Registry first (production); falls back to the local dev key file so
 * pre-registry receipts and local runs still verify.
 */
export async function resolvePublicKey(keyId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("receipt_keys")
    .select("public_key_spki")
    .eq("key_id", keyId)
    .eq("active", true)
    .maybeSingle();

  if (!error && data?.public_key_spki) {
    return data.public_key_spki;
  }

  return devPublicKeySpki();
}
