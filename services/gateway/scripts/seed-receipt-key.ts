/**
 * scripts/seed-receipt-key.ts — Seed the receipt_keys pubkey registry.
 *
 * Upserts the CURRENT signing key's public key under its key_id so the
 * registry matches whatever key the gateway signs with:
 *   - production: key from env HOMEOPS_RECEIPT_KEY (base64 raw 32B)  → key_id "homeops-receipt-v1"
 *   - dev: key file ~/.hermes/homeops-receipt-signing.key             → key_id "homeops-receipt-v1"
 *
 * Run from the gateway dir with env loaded:
 *   cd services/gateway && set -a && source .env && set +a
 *   bun run scripts/seed-receipt-key.ts
 */
import { createPrivateKey, createPublicKey, createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (source gateway .env)");
  process.exit(1);
}

/** Derive a pkcs8 DER private key buffer from env key or the dev key file. */
function loadPrivateKeyDer(): { der: Buffer; source: string } {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");

  const envKey = process.env.HOMEOPS_RECEIPT_KEY;
  if (envKey) {
    return { der: Buffer.from(envKey, "base64"), source: "env HOMEOPS_RECEIPT_KEY" };
  }
  const keyPath = path.join(os.homedir(), ".hermes", "homeops-receipt-signing.key");
  if (fs.existsSync(keyPath)) {
    return { der: fs.readFileSync(keyPath), source: keyPath };
  }
  throw new Error("No signing key found (set HOMEOPS_RECEIPT_KEY or create the dev key first)");
}

const { der, source } = loadPrivateKeyDer();
const priv = createPrivateKey({ key: der, format: "der", type: "pkcs8" });
const pubSpki = createPublicKey(priv).export({ type: "spki", format: "der" });
const pubSpkiB64 = pubSpki.toString("base64");

// key_id matches receipt-signer.ts (homeops-receipt-v1 for both env and dev key)
const keyId = "homeops-receipt-v1";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error } = await supabase
  .from("receipt_keys")
  .upsert(
    {
      key_id: keyId,
      public_key_spki: pubSpkiB64,
      name: `HomeOps Receipt Signing Key (${source})`,
      active: true,
    },
    { onConflict: "key_id" }
  )
  .select("key_id, public_key_spki, active, created_at")
  .single();

if (error) {
  console.error("Seed failed:", error.message);
  process.exit(1);
}
console.log("✅ receipt_keys seeded");
console.log(JSON.stringify(data, null, 2));
console.log(`(key source: ${source})`);
