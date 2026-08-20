/**
 * hooks/useAuth.ts — Supabase session management for HomeOps.
 *
 * Provides:
 *   - session: current Supabase session (null if unauthenticated)
 *   - user: auth.user object
 *   - role: "broker_pm" | "consumer" | null (from JWT claim user_role)
 *   - loading: true while initial session check is in progress
 *   - signOut(): clears session and redirects to auth
 *
 * Role resolution order:
 *   1. JWT claim user_role (set by custom_access_token_hook — fast, no DB call)
 *   2. Falls back to null while session loads
 */
import { useEffect, useState, useCallback } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { Base64 } from "js-base64";

export type UserRole = "broker_pm" | "consumer" | null;

export interface AuthState {
  session: Session | null;
  user: User | null;
  role: UserRole;
  loading: boolean;
  signOut: () => Promise<void>;
}

export function useAuth(): AuthState {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load persisted session on mount
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    // Subscribe to auth state changes
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setLoading(false);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  // Extract user_role from JWT claims (injected by custom_access_token_hook)
  const role: UserRole = extractRole(session);

  return {
    session,
    user: session?.user ?? null,
    role,
    loading,
    signOut,
  };
}

function extractRole(session: Session | null): UserRole {
  if (!session?.access_token) return null;
  try {
    // Decode JWT payload (middle segment) — no verification needed client-side
    const payload = session.access_token.split(".")[1];
    const decoded = JSON.parse(Base64.decode(payload));
    if (decoded.user_role === "broker_pm") return "broker_pm";
    if (decoded.user_role === "consumer") return "consumer";
  } catch {
    // Malformed token — treat as unauthenticated
  }
  return null;
}
