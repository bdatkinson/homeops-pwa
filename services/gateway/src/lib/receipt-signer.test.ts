/**
 * lib/receipt-signer.test.ts — Signed Diagnostic Receipt tests
 * Run with: bun test src/lib/receipt-signer.test.ts
 */
import { describe, expect, it } from "bun:test";
import { signReceipt, verifyReceipt } from "./receipt-signer";

const baseInput = {
  receipt_id: "test-receipt-0001",
  episode_id: "ep-123",
  appliance_id: "42",
  created_at: "2026-08-21T23:00:00.000Z",
  dkm_pack_ids: ["aosmith-water_heater-v1"],
  evidence_chain: [
    { type: "signal", value: "pilot light out", source: "user_report", timestamp: "2026-08-21T22:58:00.000Z" } as const,
  ],
  procedure_nodes_completed: ["step-001"],
  policy_decisions: [
    { step_id: "step-001", disposition: "CONSUMER_CONDITIONAL", required_checks: ["power_disconnected"], hard_exclusions: [] },
  ],
  state_history: ["opened", "observed", "dispatched"],
};

describe("diagnostic receipt signing", () => {
  it("signs a receipt and verifies it (roundtrip)", () => {
    const r = signReceipt(baseInput);
    expect(r.manifest_hash).toBeTruthy();
    expect(r.signature).toBeTruthy();
    expect(r.schema_version).toBe("2.0");
    expect(r.key_id).toMatch(/^homeops-receipt-/);
    expect(verifyReceipt(r)).toBe(true);
  });

  it("detects tampered evidence chain", () => {
    const r = signReceipt(baseInput);
    const tampered = { ...r, evidence_chain: [{ type: "signal", value: "GAS SMELL", source: "user_report", timestamp: "2026-08-21T22:58:00.000Z" }] };
    expect(verifyReceipt(tampered as any)).toBe(false);
  });

  it("detects tampered manifest hash", () => {
    const r = signReceipt(baseInput);
    const tampered = { ...r, manifest_hash: "deadbeef" };
    expect(verifyReceipt(tampered as any)).toBe(false);
  });

  it("produces a deterministic signature for identical input", () => {
    const a = signReceipt(baseInput);
    const b = signReceipt(baseInput);
    // created_at is fixed in input, so manifests are identical → same signature
    expect(a.signature).toBe(b.signature);
  });

  it("verifies with an explicit registry public key (SPKI base64)", () => {
    const fs = require("node:fs");
    const os = require("node:os");
    const path = require("node:path");
    const { createPrivateKey, createPublicKey } = require("node:crypto");
    const keyPath = path.join(os.homedir(), ".hermes", "homeops-receipt-signing.key");
    const priv = createPrivateKey({ key: fs.readFileSync(keyPath), format: "der", type: "pkcs8" });
    const pubB64 = createPublicKey(priv).export({ type: "spki", format: "der" }).toString("base64");

    const r = signReceipt(baseInput);
    expect(verifyReceipt(r, pubB64)).toBe(true);

    // Tampering still caught with the explicit key
    const tampered = { ...r, state_history: ["opened", "HACKED"] };
    expect(verifyReceipt(tampered as any, pubB64)).toBe(false);
  });

  it("rejects a receipt verified against the wrong public key", () => {
    const { generateKeyPairSync } = require("node:crypto");
    const { publicKey } = generateKeyPairSync("ed25519");
    const wrongB64 = publicKey.export({ type: "spki", format: "der" }).toString("base64");

    const r = signReceipt(baseInput);
    expect(verifyReceipt(r, wrongB64)).toBe(false);
  });
});
