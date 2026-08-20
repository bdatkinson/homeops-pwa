/**
 * app/(auth)/sign-up.tsx — Broker registration screen.
 *
 * Creates a broker_pm account. Passes role in user_metadata so the
 * handle_new_user trigger creates the profile with the correct role.
 */
import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../../lib/supabase";

export default function SignUpScreen() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [brokerage, setBrokerage] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSignUp() {
    if (!fullName || !email || !password) {
      Alert.alert("Missing fields", "Name, email and password are required.");
      return;
    }
    if (password.length < 8) {
      Alert.alert("Weak password", "Password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    console.log("[SIGNUP] Attempting signup for email:", email);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          role: "broker_pm",
          full_name: fullName,
          brokerage_name: brokerage || null,
        },
      },
    });
    setLoading(false);
    console.log("[SIGNUP] Supabase signup response error:", error);

    if (error) {
      Alert.alert("Sign up failed", error.message);
      console.error("[SIGNUP] Error details:", error);
    } else {
      Alert.alert(
        "Check your email",
        "We sent a confirmation link to " + email + ". Click it to activate your account.",
        [{ text: "OK", onPress: () => router.replace("/(auth)/sign-in") }]
      );
      console.log("[SIGNUP] Success, email sent to:", email);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.wordmark}>HomeOps</Text>
          <Text style={styles.subtitle}>Create your broker account</Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Full Name</Text>
            <TextInput
              style={styles.input}
              placeholder="Jane Smith"
              placeholderTextColor="#555"
              autoComplete="name"
              value={fullName}
              onChangeText={setFullName}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Brokerage (optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="Premier Realty Group"
              placeholderTextColor="#555"
              value={brokerage}
              onChangeText={setBrokerage}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="jane@example.com"
              placeholderTextColor="#555"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              value={email}
              onChangeText={setEmail}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              placeholder="Min. 8 characters"
              placeholderTextColor="#555"
              secureTextEntry
              autoComplete="new-password"
              value={password}
              onChangeText={setPassword}
            />
          </View>

          <TouchableOpacity
            style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]}
            onPress={handleSignUp}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#1a1a1a" />
            ) : (
              <Text style={styles.primaryBtnText}>Create Account</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>← Back to sign in</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a1a1a",
  },
  inner: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 72,
    paddingBottom: 48,
  },
  header: {
    marginBottom: 40,
  },
  wordmark: {
    fontSize: 28,
    fontWeight: "700",
    color: "#ffffff",
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 15,
    color: "#666",
  },
  form: {
    gap: 16,
  },
  fieldGroup: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: "500",
    color: "#999",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: "#2a2a2a",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: "#ffffff",
    borderWidth: 1,
    borderColor: "#333",
  },
  primaryBtn: {
    backgroundColor: "#ffffff",
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
  },
  primaryBtnDisabled: {
    opacity: 0.5,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1a1a1a",
  },
  backBtn: {
    marginTop: 32,
    alignItems: "center",
  },
  backBtnText: {
    fontSize: 14,
    color: "#666",
  },
});
