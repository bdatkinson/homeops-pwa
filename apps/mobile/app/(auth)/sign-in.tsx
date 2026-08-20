/**
 * app/(auth)/sign-in.tsx — Sign in screen.
 *
 * Broker: email + password
 * Consumer: magic link OTP (passwordless) — tapped from invite SMS/email
 *
 * Role detection: handled by useAuth after session loads.
 * This screen just authenticates — the root layout handles routing.
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
} from "react-native";
import { Link } from "expo-router";
import { supabase } from "../../lib/supabase";

type Mode = "password" | "otp";

export default function SignInScreen() {
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handlePasswordSignIn() {
    if (!email || !password) {
      Alert.alert("Missing fields", "Please enter your email and password.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) Alert.alert("Sign in failed", error.message);
    // On success: useAuth detects session → root layout routes to correct stack
  }

  async function handleOtpSignIn() {
    if (!email) {
      Alert.alert("Email required", "Enter your email to receive a sign-in link.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({ email });
    setLoading(false);
    if (error) {
      Alert.alert("Error", error.message);
    } else {
      Alert.alert("Check your email", "We sent a sign-in link to " + email);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.inner}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.wordmark}>HomeOps</Text>
          <Text style={styles.tagline}>Before you call. Before you pay.</Text>
        </View>

        {/* Mode toggle */}
        <View style={styles.modeToggle}>
          <TouchableOpacity
            style={[styles.modeBtn, mode === "password" && styles.modeBtnActive]}
            onPress={() => setMode("password")}
          >
            <Text style={[styles.modeBtnText, mode === "password" && styles.modeBtnTextActive]}>
              Agent / Broker
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBtn, mode === "otp" && styles.modeBtnActive]}
            onPress={() => setMode("otp")}
          >
            <Text style={[styles.modeBtnText, mode === "otp" && styles.modeBtnTextActive]}>
              Homeowner
            </Text>
          </TouchableOpacity>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#666"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            value={email}
            onChangeText={setEmail}
          />

          {mode === "password" && (
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#666"
              secureTextEntry
              autoComplete="password"
              value={password}
              onChangeText={setPassword}
            />
          )}

          <TouchableOpacity
            style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]}
            onPress={mode === "password" ? handlePasswordSignIn : handleOtpSignIn}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>
                {mode === "password" ? "Sign In" : "Send Sign-In Link"}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Footer */}
        {mode === "password" && (
          <View style={styles.footer}>
            <Text style={styles.footerText}>New to HomeOps? </Text>
            <Link href="/(auth)/sign-up" style={styles.footerLink}>
              Create broker account
            </Link>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a1a1a",
  },
  inner: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: "center",
  },
  header: {
    marginBottom: 48,
  },
  wordmark: {
    fontSize: 32,
    fontWeight: "700",
    color: "#ffffff",
    letterSpacing: -1,
    marginBottom: 8,
  },
  tagline: {
    fontSize: 15,
    color: "#666",
    letterSpacing: 0.2,
  },
  modeToggle: {
    flexDirection: "row",
    backgroundColor: "#2a2a2a",
    borderRadius: 8,
    padding: 4,
    marginBottom: 24,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 6,
  },
  modeBtnActive: {
    backgroundColor: "#ffffff",
  },
  modeBtnText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#666",
  },
  modeBtnTextActive: {
    color: "#1a1a1a",
  },
  form: {
    gap: 12,
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
    marginTop: 4,
  },
  primaryBtnDisabled: {
    opacity: 0.5,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1a1a1a",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 32,
  },
  footerText: {
    color: "#666",
    fontSize: 14,
  },
  footerLink: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "500",
  },
});
