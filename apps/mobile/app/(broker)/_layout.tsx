/**
 * app/(broker)/_layout.tsx — Broker navigation shell.
 */
import { TouchableOpacity, Text, StyleSheet } from "react-native";
import { Stack } from "expo-router";
import { useAuth } from "../../hooks/useAuth";

export default function BrokerLayout() {
  const { signOut } = useAuth();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "#1a1a1a" },
        headerTintColor: "#ffffff",
        headerTitleStyle: { fontWeight: "700" },
        contentStyle: { backgroundColor: "#f5f5f0" },
        headerRight: () => (
          <TouchableOpacity onPress={signOut} style={styles.signOutBtn}>
            <Text style={styles.signOutText}>Sign out</Text>
          </TouchableOpacity>
        ),
      }}
    >
      <Stack.Screen name="index" options={{ title: "HomeOps" }} />
      <Stack.Screen name="walk-through" options={{ title: "Walk-Through" }} />
      <Stack.Screen name="scan-result" options={{ title: "Scan Result" }} />
      <Stack.Screen name="properties/index" options={{ title: "My Properties" }} />
      <Stack.Screen name="properties/edit" options={{ title: "Edit Property" }} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  signOutBtn: { marginRight: 4, paddingHorizontal: 8, paddingVertical: 4 },
  signOutText: { color: "#aaa", fontSize: 13 },
});
