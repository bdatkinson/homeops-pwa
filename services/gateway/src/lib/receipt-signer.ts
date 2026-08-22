/**
 * lib/receipt-signer.ts — Signed Diagnostic Receipt (Conversion Plan §Receipts)
 *
 * When a diagnostic episode terminates or transitions (to dispatch, to a new
 * disposition tier), the control plane emits a portable, evidence-bound trust
 * object. It carries the exact evidence chain, validated observations,
 * completed procedure nodes, kernel policy decisions, and active DKM package
 * versions — signed with Ed25519 so any downstream enterprise agent can
 * verify authenticity WITHOUT seeing raw manual content or weights.
 *
 * The receipt is the COMMERCIAL FIREBREAK: commercial fulfillment is only
 * authorized downstream of a confirmed, signed receipt (never before).
 *
 * Key lifecycle:
 *   - Local dev: key auto-generated at ~/.hermes/homeops-receipt-signing.key
 *   - Production: key injected via env HOMEOPS_RECEIPT_KEY (base64 raw 32B)
 */
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";

export interface ReceiptEvidence {
  /** Typed observation (kernel-normalized), e.g. { type: "signal", value: "gas smell" } */
  type: string;
  value: string;
  /** Source ceiling: user_report | model_lookup | sensor | technician */
  source: "user_report" | "model_lookup" | "sensor" | "technician";
  timestamp: string;
}

export interface ReceiptPolicyDecision {
  step_id: string;
  disposition: string;
  required_checks: string[];
  hard_exclusions: string[];
}

export interface DiagnosticReceipt {
  receipt_id: string;
  episode_id: string;
  appliance_id: string | null;
  created_at: string;
  dkm_pack_ids: string[];
  evidence_chain: ReceiptEvidence[];
  procedure_nodes_completed: string[];
  policy_decisions: ReceiptPolicyDecision[];
  state_history: string[];
  // integrity
  manifest_hash: string;
  signature: string;
  key_id: string;
  schema_version: "2.0";
}

function loadOrCreateKey(): { privateKey: Buffer; keyId: string } {
  // 1. Env-injected key (production)
  const envKey = process.env.HOMEOPS_RECEIPT_KEY;
  if (envKey) {
    return { privateKey: Buffer.from(envKey, "base64"), keyId: "homeops-receipt-v1" };
  }

  // 2. Local dev key file
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const keyPath = path.join(os.homedir(), ".hermes", "homeops-receipt-signing.key");
  if (fs.existsSync(keyPath)) {
    return { privateKey: fs.readFileSync(keyPath), keyId: "homeops-receipt-v1" };
  }
  // Auto-generate (dev only — safe: local machine)
  const { privateKey } = generateKeyPairSync("ed25519");
  fs.mkdirSync(path.dirname(keyPath), { recursive: true });
  fs.writeFileSync(keyPath, privateKey.export({ type: "pkcs8", format: "der" }));
  console.log(`[receipt-signer] generated dev signing key at ${keyPath}`);
  return { privateKey: Buffer.from(privateKey.export({ type: "pkcs8", format: "der" })), keyId: "homeops-receipt-v1" };
}

/**
 * Canonical JSON — recursively sorted keys, so identical logical content
 * always serializes to identical bytes. Unlike `JSON.stringify(x, sortedKeys)`,
 * an array replacer would strip ALL keys from nested objects (evidence_chain
 * items, policy_decisions) down to `{}`, making tamper detection a no-op.
 */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalJson).join(",") + "]";
  }
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalJson(obj[k])).join(",") + "}";
  }
  return JSON.stringify(value);
}

function keyIdOf(priv: Buffer): string {
  // Derive a stable public-key fingerprint for the key_id
  const key = createPrivateKey({ key: priv, format: "der", type: "pkcs8" });
  const pub = createPublicKey(key).export({ type: "spki", format: "der" });
  return "homeops-receipt-" + createHash("sha256").update(pub).digest("hex").slice(0, 12);
}

let cachedKey: { privateKey: Buffer; keyId: string } | null = null;
function getKey() {
  if (!cachedKey) cachedKey = loadOrCreateKey();
  return cachedKey;
}

/** Sign a receipt with Ed25519. Returns the completed, verifiable receipt. */
export function signReceipt(input: Omit<DiagnosticReceipt, "manifest_hash" | "signature" | "key_id" | "schema_version">): DiagnosticReceipt {
  const { privateKey, keyId } = getKey();
  const manifest = {
    receipt_id: input.receipt_id,
    episode_id: input.episode_id,
    appliance_id: input.appliance_id,
    created_at: input.created_at,
    dkm_pack_ids: input.dkm_pack_ids,
    evidence_chain: input.evidence_chain,
    procedure_nodes_completed: input.procedure_nodes_completed,
    policy_decisions: input.policy_decisions,
    state_history: input.state_history,
    schema_version: "2.0",
  };
  const manifestBytes = Buffer.from(canonicalJson(manifest), "utf8");
  const manifestHash = createHash("sha256").update(manifestBytes).digest("hex");
  const key = createPrivateKey({ key: privateKey, format: "der", type: "pkcs8" });
  const signature = sign(null, manifestBytes, key).toString("hex");

  return { ...manifest, manifest_hash: manifestHash, signature, key_id: keyId } as DiagnosticReceipt;
}

/** Verify a receipt's signature + manifest integrity. Returns true when authentic. */
export function verifyReceipt(receipt: DiagnosticReceipt): boolean {
  const { manifest_hash, signature, key_id } = receipt;
  const manifest = {
    receipt_id: receipt.receipt_id,
    episode_id: receipt.episode_id,
    appliance_id: receipt.appliance_id,
    created_at: receipt.created_at,
    dkm_pack_ids: receipt.dkm_pack_ids,
    evidence_chain: receipt.evidence_chain,
    procedure_nodes_completed: receipt.procedure_nodes_completed,
    policy_decisions: receipt.policy_decisions,
    state_history: receipt.state_history,
    schema_version: receipt.schema_version,
  };
  const manifestBytes = Buffer.from(canonicalJson(manifest), "utf8");
  if (createHash("sha256").update(manifestBytes).digest("hex") !== manifest_hash) return false;

  // Dev: recover the public key from the key file (production: pubkey registry)
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const keyPath = path.join(os.homedir(), ".hermes", "homeops-receipt-signing.key");
  if (!fs.existsSync(keyPath)) return false;
  const priv = createPrivateKey({ key: fs.readFileSync(keyPath), format: "der", type: "pkcs8" });
  const pub = createPublicKey(priv);
  return verify(null, manifestBytes, pub, Buffer.from(signature, "hex"));
}
