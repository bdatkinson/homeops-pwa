import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import { walkThroughRouter } from "./routes/walk-through.js";
import { passportsRouter } from "./routes/passports.js";
import { invitesRouter } from "./routes/invites.js";
import { propertiesRouter } from "./routes/properties.js";
import { consumerRouter } from "./routes/consumer.js";
import { appliancesRouter } from "./routes/appliances.js";
import { publicRouter } from "./routes/public.js";
import { safetyRouter } from "./routes/safety.js";
import { receiptsRouter } from "./routes/receipts.js";
import { requireAuth, requireRole } from "./middleware/auth.js";

const app = new Hono();

const allowedOrigins = [
  "https://homeops.app",
  "https://www.homeops.app",
  "http://localhost:3000",
  "http://localhost:8081",
];
const vercelPreviewRegex = /^https:\/\/homeops-.*\.vercel\.app$/;

// Middleware
app.use("*", logger());
app.use(
  "*",
  cors({
    origin: (origin, c) => {
      if (allowedOrigins.includes(origin)) {
        return origin;
      }
      if (vercelPreviewRegex.test(origin)) {
        return origin;
      }
      return c.req.url; // Or return undefined for strict blocking
    },
    credentials: true,
  })
);

// Health check — no auth required
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    service: "homeops-gateway",
    version: "0.0.1",
    timestamp: new Date().toISOString(),
  });
});

// API v1 routes (stubs — implemented per session)
app.get("/api/v1", (c) => {
  return c.json({ message: "HomeOps Gateway v1 — Phase 0 build in progress" });
});

app.route("/api/v1/walk-through", walkThroughRouter);
app.route("/api/v1/properties", propertiesRouter);
app.route("/api/v1/appliances", appliancesRouter);
app.route("/api/v1/passports", passportsRouter);
app.route("/api/v1/passports", invitesRouter);
app.route("/api/v1/consumer", consumerRouter);
app.route("/api/v1/safety", safetyRouter);
app.route("/api/v1/receipts", receiptsRouter);
app.route("/api/v1", publicRouter);
app.get("/api/v1/me", requireAuth, async (c) => {
  const userId = c.get("userId");
  const userRole = c.get("userRole");
  const { data, error } = await (await import("./lib/supabase.js")).supabase
    .from("profiles")
    .select("id, role, full_name, phone, subscription_status, created_at")
    .eq("id", userId)
    .single();
  if (error) return c.json({ error: "profile_not_found", message: error.message }, 404);
  return c.json({ ...data, resolved_role: userRole });
});

// --- Diagnostic sessions (persist to DB) ---
app.post("/api/v1/diagnostic/session", requireAuth, async (c) => {
  const userId = c.get("userId");
  let body: {
    passport_id?: string;
    appliance_id?: string;
    symptom?: string;
    result?: {
      summary?: string;
      severity?: string;
      steps?: unknown[];
      escalate_message?: string;
      disclaimer?: string;
    };
  };
  try { body = await c.req.json(); } catch {
    return c.json({ error: "invalid_body", message: "Expected JSON body" }, 400);
  }
  if (!body.symptom?.trim()) {
    return c.json({ error: "missing_symptom", message: "symptom is required" }, 422);
  }
  const { data: session, error } = await (await import("./lib/supabase.js")).supabase
    .from("diagnostic_sessions")
    .insert({
      user_id: userId,
      passport_id: body.passport_id ?? null,
      appliance_id: body.appliance_id ?? null,
      symptom: body.symptom.trim(),
      summary: body.result?.summary ?? null,
      severity: body.result?.severity ?? null,
      steps: body.result?.steps ?? [],
      escalate_message: body.result?.escalate_message ?? null,
      disclaimer: body.result?.disclaimer ?? null,
    })
    .select()
    .single();
  if (error || !session) {
    return c.json({ error: "db_error", message: error?.message ?? "Insert failed" }, 500);
  }
  return c.json({ session }, 201);
});

app.get("/api/v1/diagnostic/session/:id", requireAuth, async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const { data: session, error } = await (await import("./lib/supabase.js")).supabase
    .from("diagnostic_sessions")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .single();
  if (error || !session) {
    return c.json({ error: "not_found", message: "Session not found" }, 404);
  }
  return c.json({ session });
});

app.get("/api/v1/diagnostic/history", requireAuth, async (c) => {
  const userId = c.get("userId");
  const { data: sessions, error } = await (await import("./lib/supabase.js")).supabase
    .from("diagnostic_sessions")
    .select("id, symptom, severity, summary, appliance_id, passport_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) return c.json({ error: "db_error", message: error.message }, 500);
  return c.json({ sessions: sessions ?? [] });
});

const port = parseInt(process.env.PORT ?? "8080");
console.log(`🚀 HomeOps Gateway running on port ${port}`);

export default {
  port,
  fetch: app.fetch,
};
