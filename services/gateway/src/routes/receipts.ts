/**
 * routes/receipts.ts — Signed Diagnostic Receipt endpoints
 *
 * POST /api/v1/receipts
 *   Body: { episodeId, applianceId?, dkmPackIds, evidenceChain,
 *           procedureNodesCompleted, policyDecisions, stateHistory }
 *   Returns the signed, immutable Diagnostic Receipt.
 *
 * GET /api/v1/receipts/:id/verify
 *   Verifies signature + manifest integrity of a previously issued receipt.
 *
 * The receipt is the commercial firebreak: no fulfillment is authorized
 * without a confirmed signed receipt. This route issues the trust object;
 * the commerce gate consumes it downstream.
 */
import { Hono } from "hono";
import { signReceipt, verifyReceipt } from "../lib/receipt-signer.js";
import { randomUUID } from "node:crypto";

export const receiptsRouter = new Hono();

receiptsRouter.post("/", async (c) => {
  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_body", message: "Expected JSON body" }, 400);
  }

  const episodeId = (body.episodeId ?? "").toString().trim();
  if (!episodeId) {
    return c.json({ error: "missing_field", message: "episodeId is required" }, 400);
  }

  const toStrArr = (v: unknown): string[] =>
    Array.isArray(v) ? v.map((x) => x.toString()) : [];

  const receipt = signReceipt({
    receipt_id: randomUUID(),
    episode_id: episodeId,
    appliance_id: body.applianceId ? body.applianceId.toString() : null,
    created_at: new Date().toISOString(),
    dkm_pack_ids: toStrArr(body.dkmPackIds),
    evidence_chain: Array.isArray(body.evidenceChain) ? body.evidenceChain as any : [],
    procedure_nodes_completed: toStrArr(body.procedureNodesCompleted),
    policy_decisions: Array.isArray(body.policyDecisions) ? body.policyDecisions as any : [],
    state_history: toStrArr(body.stateHistory),
  });

  return c.json({ receipt, verified: verifyReceipt(receipt) });
});

receiptsRouter.get("/:id/verify", async (c) => {
  // For stateless verification the client sends the receipt body; the :id
  // is echoed so the endpoint stays addressable.
  const receiptId = c.req.param("id");
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_body", message: "Send the receipt JSON to verify" }, 400);
  }
  if (body.receipt_id !== receiptId) {
    return c.json({ error: "mismatch", message: "receipt_id does not match :id" }, 400);
  }
  return c.json({ receipt_id: receiptId, verified: verifyReceipt(body) });
});
