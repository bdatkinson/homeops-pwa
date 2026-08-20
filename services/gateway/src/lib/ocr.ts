/**
 * lib/ocr.ts — GPT-4o-mini vision OCR for appliance model plates.
 *
 * OAQ-01 decision: GPT-4o-mini replaces Google Vision API as the OCR engine.
 * Returns structured JSON directly — no separate normalization layer needed.
 *
 * Called by: POST /api/v1/walk-through/scan
 */

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export interface OcrResult {
  make: string | null;
  appliance_type: string | null;
  model: string | null;
  serial: string | null;
  year: number | null;
  raw_text: string | null;
  low_contrast_warning: boolean;
}

const EXTRACTION_PROMPT = `You are analyzing an appliance model plate / rating label image.

Extract ONLY what you can read from the label. Return a JSON object with these exact keys:
{
  "make": "brand/manufacturer name",
  "appliance_type": "type of appliance (Washing Machine, Refrigerator, Dryer, Dishwasher, Range, Microwave, Water Heater, HVAC, etc.)",
  "model": "model number exactly as printed",
  "serial": "serial number exactly as printed",
  "year": manufacturing year as integer or null,
  "raw_text": "all text visible on the label verbatim",
  "low_contrast_warning": true if the label appears faded, worn, or low contrast — false otherwise
}

Rules:
- Use null for any field you cannot read or confidently infer
- model and serial must be EXACT characters — no corrections, no guesses
- For worn/faded text include what is readable, use ? for illegible chars
- Do NOT hallucinate. If unsure, return null.

Return ONLY valid JSON. No preamble, no markdown fences.`;

export async function extractModelPlateOcr(
  imageBase64: string,
  mimeType: "image/jpeg" | "image/png" | "image/webp" = "image/jpeg"
): Promise<OcrResult> {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not set in environment");
  }

  const payload = {
    model: "gpt-4o-mini",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: EXTRACTION_PROMPT },
          {
            type: "image_url",
            image_url: {
              url: `data:${mimeType};base64,${imageBase64}`,
              detail: "high",
            },
          },
        ],
      },
    ],
    max_tokens: 512,
    temperature: 0,
    response_format: { type: "json_object" },
  };

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`OpenAI API error ${resp.status}: ${err.slice(0, 200)}`);
  }

  const data = (await resp.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  const text = data.choices[0].message.content;
  const parsed = JSON.parse(text) as OcrResult;
  return parsed;
}
