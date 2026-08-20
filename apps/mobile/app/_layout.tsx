/**
 * app/_layout.tsx — Root layout with auth gate + role-based routing.
 *
 * Navigation structure:
 *   (auth)/          → sign-in, sign-up (unauthenticated)
 *   (broker)/        → broker dashboard stack (role=broker_pm)
 *   (consumer)/      → consumer appliance stack (role=consumer)
 *
 * Auth flow:
 *   - loading → splash screen stays visible
 *   - no session → redirect to (auth)/sign-in
 *   - broker_pm → redirect to (broker)/
 *   - consumer → redirect to (consumer)/
 */
import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useAuth } from "../hooks/useAuth";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const { session, role, loading } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (loading) return;
    SplashScreen.hideAsync();

    const inAuthGroup = segments[0] === "(auth)";
    const inBrokerGroup = segments[0] === "(broker)";
    const inConsumerGroup = segments[0] === "(consumer)";

    if (!session) {
      // Not authenticated → always push to sign-in
      if (!inAuthGroup) {
        router.replace("/(auth)/sign-in");
      }
    } else if (role === "broker_pm") {
      // Broker → broker stack
      if (!inBrokerGroup) {
        router.replace("/(broker)/");
      }
    } else if (role === "consumer") {
      // Consumer → consumer stack
      if (!inConsumerGroup) {
        router.replace("/(consumer)/");
      }
    } else {
      // Authenticated but role not yet resolved (hook still fetching)
      // Stay put — will re-evaluate when role resolves
    }
  }, [session, role, loading, segments]);

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(broker)" />
        <Stack.Screen name="(consumer)" />
      </Stack>
    </>
  );
}
