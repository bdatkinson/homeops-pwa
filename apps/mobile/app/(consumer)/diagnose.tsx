/**
 * app/(consumer)/diagnose.tsx — Appliance diagnostic screen (Session 12)
 *
 * Flow:
 *   1. Consumer describes symptom in a text area
 *   2. Submits → POST /api/v1/consumer/passports/:pid/appliances/:aid/diagnose
 *   3. Shows severity badge + numbered steps
 *   4. Escalate CTA → opens broker contact (email/phone)
 */
import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Linking,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useAuth } from "../../hooks/useAuth";

const GATEWAY =
  (process.env as any).EXPO_PUBLIC_GATEWAY_URL ?? "https://homeops-gateway.fly.dev";

interface DiagnosticStep {
  step: number;
  title: string;
  detail: string;
  safe_to_do_yourself: boolean;
}

interface DiagnosticResult {
  summary: string;
  severity: "low" | "medium" | "high" | "call_professional";
  steps: DiagnosticStep[];
  escalate_message: string | null;
  disclaimer: string;
}

const SEVERITY_CONFIG = {
  low: { label: "Low severity", color: "#22c55e", bg: "#f0fdf4" },
  medium: { label: "Moderate", color: "#f59e0b", bg: "#fffbeb" },
  high: { label: "High severity", color: "#ef4444", bg: "#fef2f2" },
  call_professional: { label: "Call a professional", color: "#7c3aed", bg: "#f5f3ff" },
};

export default function DiagnoseScreen() {
  const { session } = useAuth();
  const token = session?.access_token ?? "";

  const params = useLocalSearchParams<{
    passportId: string;
    applianceId: string;
    applianceName: string;
    brokerEmail?: string;
    brokerPhone?: string;
  }>();

  const [symptom, setSymptom] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DiagnosticResult | null>(null);

  const handleDiagnose = useCallback(async () => {
    if (symptom.trim().length < 10) {
      Alert.alert(
        "More detail needed",
        "Please describe what you're experiencing in a few words."
      );
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch(
        `${GATEWAY}/api/v1/consumer/passports/${params.passportId}/appliances/${params.applianceId}/diagnose`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ symptom: symptom.trim() }),
        }
      );

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body?.message ?? `Request failed (${res.status})`);
      }

      const data = await res.json();
      setResult(data.diagnostic);

      // Persist diagnostic session (fire-and-forget)
      fetch(`${GATEWAY}/api/v1/diagnostic/session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          passport_id: params.passportId,
          appliance_id: params.applianceId,
          symptom: symptom.trim(),
          result: data.diagnostic,
        }),
      }).catch((err) => console.warn("Failed to persist diagnostic session:", err));

    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Diagnosis failed");
    } finally {
      setLoading(false);
    }
  }, [symptom, token, params.passportId, params.applianceId]);

  const severityConfig = result
    ? SEVERITY_CONFIG[result.severity] ?? SEVERITY_CONFIG.medium
    : null;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* Appliance name */}
        <Text style={styles.applianceName}>{params.applianceName}</Text>
        <Text style={styles.applianceSub}>Describe what's happening</Text>

        {/* Symptom input */}
        <TextInput
          style={styles.symptomInput}
          value={symptom}
          onChangeText={setSymptom}
          placeholder="e.g. Making a loud grinding noise during the spin cycle..."
          placeholderTextColor="#aaa"
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          editable={!loading}
        />

        <TouchableOpacity
          style={[styles.diagnoseBtn, loading && styles.diagnoseBtnDisabled]}
          onPress={handleDiagnose}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.diagnoseBtnText}>
              {result ? "Re-diagnose" : "Diagnose"}
            </Text>
          )}
        </TouchableOpacity>

        {/* Results */}
        {result && severityConfig && (
          <View style={styles.resultContainer}>
            {/* Severity badge */}
            <View style={[styles.severityBadge, { backgroundColor: severityConfig.bg }]}>
              <Text style={[styles.severityText, { color: severityConfig.color }]}>
                {severityConfig.label}
              </Text>
            </View>

            {/* Summary */}
            <Text style={styles.summaryText}>{result.summary}</Text>

            {/* Steps */}
            {result.steps.map((step) => (
              <View key={step.step} style={styles.stepCard}>
                <View style={styles.stepHeader}>
                  <View style={styles.stepNum}>
                    <Text style={styles.stepNumText}>{step.step}</Text>
                  </View>
                  <Text style={styles.stepTitle}>{step.title}</Text>
                  {!step.safe_to_do_yourself && (
                    <View style={styles.expertPill}>
                      <Text style={styles.expertPillText}>⚠ Expert</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.stepDetail}>{step.detail}</Text>
              </View>
            ))}

            {/* Escalate */}
            {result.escalate_message && (
              <View style={styles.escalateCard}>
                <Text style={styles.escalateMessage}>{result.escalate_message}</Text>
                <View style={styles.escalateActions}>
                  {params.brokerEmail ? (
                    <TouchableOpacity
                      style={styles.escalateBtn}
                      onPress={() => Linking.openURL(`mailto:${params.brokerEmail}`)}
                    >
                      <Text style={styles.escalateBtnText}>✉  Email agent</Text>
                    </TouchableOpacity>
                  ) : null}
                  {params.brokerPhone ? (
                    <TouchableOpacity
                      style={styles.escalateBtn}
                      onPress={() => Linking.openURL(`tel:${params.brokerPhone}`)}
                    >
                      <Text style={styles.escalateBtnText}>📞  Call agent</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            )}

            {/* Disclaimer */}
            <Text style={styles.disclaimer}>{result.disclaimer}</Text>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: "#f5f5f0" },
  content: { padding: 20, paddingBottom: 60 },

  applianceName: {
    fontSize: 20,
    fontWeight: "800",
    color: "#1a1a1a",
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  applianceSub: { fontSize: 14, color: "#888", marginBottom: 20 },

  symptomInput: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e0e0e0",
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    color: "#1a1a1a",
    minHeight: 100,
    marginBottom: 16,
  },

  diagnoseBtn: {
    backgroundColor: "#1a1a1a",
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: "center",
    marginBottom: 28,
  },
  diagnoseBtnDisabled: { opacity: 0.5 },
  diagnoseBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },

  // Results
  resultContainer: { gap: 12 },

  severityBadge: {
    alignSelf: "flex-start",
    borderRadius: 100,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  severityText: { fontWeight: "700", fontSize: 13 },

  summaryText: {
    fontSize: 15,
    color: "#333",
    lineHeight: 22,
    marginBottom: 4,
  },

  stepCard: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  stepHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 8,
  },
  stepNum: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#1a1a1a",
    justifyContent: "center",
    alignItems: "center",
  },
  stepNumText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  stepTitle: { flex: 1, fontSize: 14, fontWeight: "700", color: "#1a1a1a" },
  expertPill: {
    backgroundColor: "#fef3c7",
    borderRadius: 100,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  expertPillText: { fontSize: 10, color: "#92400e", fontWeight: "700" },
  stepDetail: { fontSize: 14, color: "#555", lineHeight: 20 },

  escalateCard: {
    backgroundColor: "#f5f3ff",
    borderRadius: 10,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: "#7c3aed",
  },
  escalateMessage: { fontSize: 14, color: "#4c1d95", lineHeight: 20, marginBottom: 12 },
  escalateActions: { flexDirection: "row", gap: 10 },
  escalateBtn: {
    backgroundColor: "#7c3aed",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  escalateBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },

  disclaimer: {
    fontSize: 11,
    color: "#aaa",
    lineHeight: 16,
    textAlign: "center",
    marginTop: 8,
  },
});
