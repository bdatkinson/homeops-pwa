/**
 * lib/gateway.ts — Typed fetch wrapper for the HomeOps gateway API.
 *
 * All requests go to GATEWAY_URL (env-configurable, defaults to production).
 * Auth token is passed as Bearer — callers provide it from useAuth().session.
 */

const GATEWAY_URL =
  process.env.EXPO_PUBLIC_GATEWAY_URL ?? "https://homeops-gateway.fly.dev";

export class GatewayError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = "GatewayError";
  }
}

async function request<T>(
  path: string,
  token: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${GATEWAY_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new GatewayError(
      res.status,
      body?.error ?? "unknown_error",
      body?.message ?? `HTTP ${res.status}`
    );
  }

  return body as T;
}

// ─── Walk-Through Scan ───────────────────────────────────────────────────────

export interface ScanResult {
  appliance: {
    appliance_type: string;
    make: string;
    model: string;
    serial: string | null;
    estimated_year: number | null;
    recall_status: "none" | "active" | "resolved" | "unknown";
    cpsc_recall_ids: string[];
    ocr_confidence: number;
    ocr_raw_text: string;
  };
  corpus_match: {
    found: boolean;
    document_id: string | null;
    score: number | null;
  };
  saved_appliance_id: string | null;
}

export async function scanAppliance(
  token: string,
  imageBase64: string,
  propertyId: string,
  mimeType: "image/jpeg" | "image/png" = "image/jpeg"
): Promise<ScanResult> {
  return request<ScanResult>("/api/v1/walk-through/scan", token, {
    method: "POST",
    body: JSON.stringify({ image: imageBase64, property_id: propertyId, mime_type: mimeType }),
  });
}

// ─── Properties ──────────────────────────────────────────────────────────────

export interface Property {
  id: string;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
  zip: string;
}

export async function listProperties(token: string): Promise<Property[]> {
  const res = await request<{ properties: Property[] }>(
    "/api/v1/properties",
    token
  );
  return res.properties ?? [];
}

export async function createProperty(
  token: string,
  data: Omit<Property, "id">
): Promise<Property> {
  const res = await request<{ property: Property }>(
    "/api/v1/properties",
    token,
    { method: "POST", body: JSON.stringify(data) }
  );
  return res.property;
}

export async function updateProperty(
  token: string,
  id: string,
  data: Partial<Omit<Property, "id">>
): Promise<Property> {
  const res = await request<{ property: Property }>(
    `/api/v1/properties/${id}`,
    token,
    { method: "PATCH", body: JSON.stringify(data) }
  );
  return res.property;
}

export async function deleteProperty(token: string, id: string): Promise<void> {
  await request<{ deleted: boolean }>(`/api/v1/properties/${id}`, token, {
    method: "DELETE",
  });
}

// ─── Consumer ─────────────────────────────────────────────────────────────────

export interface PassportSummary {
  id: string;
  status: string;
  brand_agent_name: string | null;
  brand_brokerage: string | null;
  created_at: string;
  properties: {
    id: string;
    address_line1: string;
    address_line2: string | null;
    city: string;
    state: string;
    zip: string | null;
  } | null;
  passport_appliances: { count: number }[];
}

export interface Appliance {
  id: string;
  brand: string | null;
  model_number: string | null;
  serial_number: string | null;
  category: string | null;
  install_date: string | null;
  recall_status: "none" | "active" | "unknown";
  recall_url: string | null;
  notes: string | null;
}

export interface PassportDetail {
  id: string;
  status: string;
  brand_agent_name: string | null;
  brand_brokerage: string | null;
  brand_photo_url: string | null;
  brand_contact_email: string | null;
  brand_contact_phone: string | null;
  created_at: string;
  properties: {
    id: string;
    address_line1: string;
    address_line2: string | null;
    city: string;
    state: string;
    zip: string | null;
  } | null;
  appliances: Appliance[];
}

export async function getMyPassports(token: string): Promise<PassportSummary[]> {
  const res = await request<{ passports: PassportSummary[] }>(
    "/api/v1/consumer/passports",
    token
  );
  return res.passports;
}

export async function getPassport(token: string, id: string): Promise<PassportDetail> {
  const res = await request<{ passport: PassportDetail }>(
    `/api/v1/consumer/passports/${id}`,
    token
  );
  return res.passport;
}

// ─── Me ──────────────────────────────────────────────────────────────────────

export interface Profile {
  id: string;
  full_name: string | null;
  brokerage_name: string | null;
  user_role: string;
}

export async function getMe(token: string): Promise<Profile> {
  const res = await request<{ profile: Profile }>("/api/v1/me", token);
  return res.profile;
}
