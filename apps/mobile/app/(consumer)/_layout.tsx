/**
 * app/(consumer)/_layout.tsx — Consumer navigation shell.
 * Session 8: stub. Full appliance list in Sessions 12–13.
 */
import { Stack } from "expo-router";
import { TouchableOpacity, Text, StyleSheet } from "react-native";
import { useAuth } from "../../hooks/useAuth";

export default function ConsumerLayout() {
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
      <Stack.Screen name="index" options={{ title: "My Home" }} />
      <Stack.Screen name="passport/[id]" options={{ title: "Passport" }} />
      <Stack.Screen name="diagnose" options={{ presentation: "modal", title: "Diagnose Appliance" }} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  signOutBtn: { paddingHorizontal: 8 },
  signOutText: { color: "#999", fontSize: 14 },
});
