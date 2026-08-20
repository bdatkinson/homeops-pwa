/**
 * middleware/auth.ts — Supabase JWT auth middleware for Hono.
 *
 * requireAuth: verifies the Bearer token. Injects payload into context.
 * requireRole: checks user_role claim (broker_pm | consumer).
 *
 * Fallback strategy:
 *   1. Check JWT claim user_role  (set by custom_access_token_hook when registered)
 *   2. If claim absent, query profiles table directly (works before hook is registered)
 */

import type { Context, MiddlewareHandler, Next } from "hono";
import { verifySupabaseJwt, JwtError, type SupabaseJwtPayload } from "../lib/jwt.js";
import { supabase } from "../lib/supabase.js";

// Extend Hono context variables
declare module "hono" {
  interface ContextVariableMap {
    jwtPayload: SupabaseJwtPayload;
    userRole: "broker_pm" | "consumer";
    userId: string;
  }
}

export const requireAuth: MiddlewareHandler = async (c: Context, next: Next) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json(
      { error: "unauthorized", message: "Missing or malformed Authorization header" },
      401
    );
  }

  const token = authHeader.slice(7);
  let payload: SupabaseJwtPayload;

  try {
    payload = await verifySupabaseJwt(token);
  } catch (err) {
    if (err instanceof JwtError) {
      const status = err.code === "expired" ? 401 : 403;
      return c.json({ error: err.code, message: err.message }, status);
    }
    return c.json({ error: "auth_error", message: "Token verification failed" }, 403);
  }

  // Resolve user_role — prefer JWT claim (fast path), fall back to DB lookup
  let userRole: "broker_pm" | "consumer" = "consumer";

  if (payload.user_role === "broker_pm" || payload.user_role === "consumer") {
    // Fast path: custom_access_token_hook injected the role
    userRole = payload.user_role;
  } else {
    // Slow path: query profiles (hook not yet registered via Dashboard)
    const { data, error } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", payload.sub)
      .single();

    if (!error && data?.role === "broker_pm") {
      userRole = "broker_pm";
    }
    // else: defaults to "consumer" — safe fail-open for reads
  }

  c.set("jwtPayload", payload);
  c.set("userRole", userRole);
  c.set("userId", payload.sub);

  await next();
};

/**
 * requireRole("broker_pm") — must be used AFTER requireAuth.
 * Returns 403 if the authenticated user doesn't have the required role.
 */
export function requireRole(
  role: "broker_pm" | "consumer"
): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    const userRole = c.get("userRole");
    if (userRole !== role) {
      return c.json(
        {
          error: "forbidden",
          message: `This endpoint requires role: ${role}`,
          your_role: userRole ?? "unknown",
        },
        403
      );
    }
    await next();
  };
}
