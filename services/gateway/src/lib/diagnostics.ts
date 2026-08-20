/**
 * lib/diagnostics.ts — Appliance diagnostic inference (Session 12)
 *
 * Uses claude-3-haiku-20240307 for low-latency, low-cost troubleshooting.
 * Returns structured steps the consumer can act on immediately.
 * Does NOT recommend third-party service companies — refers back to the
 * broker's contact info for escalation.
 */

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface DiagnosticStep {
  step: number;
  title: string;
  detail: string;
  safe_to_do_yourself: boolean;
}

export interface DiagnosticResult {
  summary: string;
  severity: "low" | "medium" | "high" | "call_professional";
  steps: DiagnosticStep[];
  escalate_message: string | null;
  disclaimer: string;
}

const SYSTEM_PROMPT = `You are a home appliance diagnostic assistant embedded inside a home passport app.

Your role:
- Help homeowners safely identify the likely cause of an appliance issue
- Provide clear, numbered troubleshooting steps they can attempt themselves
- Know when to escalate and say so clearly without recommending specific repair companies
- Always prioritize safety

Rules:
- Never recommend specific third-party repair companies or service providers
- For gas appliances and electrical panel issues: immediately flag as call_professional severity
- Keep language plain, calm, and non-technical
- Maximum 5 steps — concise beats exhaustive
- Return ONLY valid JSON matching the schema below

Response schema (return ONLY this JSON, no markdown, no preamble):
{
  "summary": "one sentence describing the likely cause",
  "severity": "low" | "medium" | "high" | "call_professional",
  "steps": [
    {
      "step": 1,
      "title": "short action title",
      "detail": "clear explanation of what to do and what to look for",
      "safe_to_do_yourself": true | false
    }
  ],
  "escalate_message": "message to show if they need professional help, or null if low/medium and self-serviceable",
  "disclaimer": "Always unplug or shut off power before inspecting internal parts. When in doubt, contact a licensed technician."
}`;

export async function diagnoseAppliance(
  appliance: {
    brand: string | null;
    appliance_type: string | null;
    model_number: string | null;
    install_date: string | null;
  },
  symptom: string
): Promise<DiagnosticResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY not set");
  }

  const applianceDesc = [
    appliance.brand ?? "Unknown brand",
    appliance.appliance_type ?? "appliance",
    appliance.model_number ? `(model ${appliance.model_number})` : "",
    appliance.install_date
      ? `installed ${new Date(appliance.install_date).getFullYear()}`
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  const userMessage = `Appliance: ${applianceDesc}\n\nHomeowner's description: ${symptom.trim()}`;

  const message = await client.messages.create({
    model: "claude-3-haiku-20240307",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  const text =
    message.content[0].type === "text" ? message.content[0].text : "";

  let result: DiagnosticResult;
  try {
    result = JSON.parse(text) as DiagnosticResult;
  } catch {
    throw new Error(`Malformed AI response: ${text.slice(0, 200)}`);
  }

  return result;
}
