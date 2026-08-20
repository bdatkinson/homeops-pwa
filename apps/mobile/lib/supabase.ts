/**
 * lib/supabase.ts — Supabase client for HomeOps mobile app.
 *
 * Uses AsyncStorage for session persistence across app restarts.
 * Anon key loaded from app.json extra (never hardcoded in source).
 */
import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
// @ts-ignore
import Constants from "expo-constants";
import type { Database } from "@homeops/supabase";


const supabaseUrl: string = Constants.expoConfig?.extra?.supabaseUrl ?? "";
const supabaseAnonKey: string = Constants.expoConfig?.extra?.supabaseAnonKey ?? "";

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Supabase config missing from app.json extra");
}

const isServer = Platform.OS === "web" && typeof window === "undefined";

const customStorage = {
  getItem: async (key: string) => {
    if (isServer) return null;
    return AsyncStorage.getItem(key);
  },
  setItem: async (key: string, value: string) => {
    if (isServer) return;
    return AsyncStorage.setItem(key, value);
  },
  removeItem: async (key: string) => {
    if (isServer) return;
    return AsyncStorage.removeItem(key);
  },
};

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: customStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export const GATEWAY_URL: string =
  Constants.expoConfig?.extra?.gatewayUrl ?? "https://homeops-gateway.fly.dev";

/**
 * Authenticated fetch against the Fly.io gateway.
 * Automatically injects the current session JWT.
 */
export async function gatewayFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  return fetch(`${GATEWAY_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
}
