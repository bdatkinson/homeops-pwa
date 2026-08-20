/**
 * app/(broker)/scan-result.tsx — OCR scan result + recall badge + save appliance.
 *
 * Receives from walk-through.tsx via router.push params:
 *   imageUri, imageBase64, mimeType, propertyId, propertyLabel
 *
 * Flow:
 *   1. On mount → POST /walk-through/scan with base64 image
 *   2. Shows parsed appliance data (type, make, model, serial, year)
 *   3. Shows recall badge (none / active / resolved / unknown)
 *   4. Allows edits before confirming save
 *   5. On confirm → appliance already saved by gateway (returns saved_appliance_id)
 *   6. Navigates back to dashboard
 */
import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Image,
  TextInput,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "../../hooks/useAuth";
import { scanAppliance, type ScanResult } from "../../lib/gateway";

// ─── Recall badge ─────────────────────────────────────────────────────────────

const RECALL_CONFIG = {
  none: { label: "No Active Recalls", color: "#22c55e", bg: "#f0fdf4", icon: "✓" },
  active: { label: "ACTIVE RECALL", color: "#ef4444", bg: "#fef2f2", icon: "⚠" },
  resolved: { label: "Recall Resolved", color: "#f59e0b", bg: "#fffbeb", icon: "!" },
  unknown: { label: "Recall Status Unknown", color: "#6b7280", bg: "#f9fafb", icon: "?" },
};

function RecallBadge({ status, ids }: { status: string; ids: string[] }) {
  const cfg = RECALL_CONFIG[status as keyof typeof RECALL_CONFIG] ?? RECALL_CONFIG.unknown;
  return (
    <View style={[styles.recallBadge, { backgroundColor: cfg.bg, borderColor: cfg.color }]}>
      <Text style={[styles.recallIcon, { color: cfg.color }]}>{cfg.icon}</Text>
      <View style={styles.recallText}>
        <Text style={[styles.recallLabel, { color: cfg.color }]}>{cfg.label}</Text>
        {ids.length > 0 && (
          <Text style={styles.recallIds}>CPSC #{ids.join(", #")}</Text>
        )}
      </View>
    </View>
  );
}

// ─── Field row ────────────────────────────────────────────────────────────────

function FieldRow({
  label,
  value,
  onEdit,
  editable = true,
}: {
  label: string;
  value: string;
  onEdit: (v: string) => void;
  editable?: boolean;
}) {
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.fieldInput}
        value={value}
        onChangeText={onEdit}
        editable={editable}
        placeholderTextColor="#aaa"
        placeholder="—"
      />
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ScanResultScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const token = session?.access_token ?? "";

  const params = useLocalSearchParams<{
    imageUri: string;
    imageBase64: string;
    mimeType: string;
    propertyId: string;
    propertyLabel: string;
  }>();

  const [scanning, setScanning] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);

  // Editable fields
  const [applianceType, setApplianceType] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [serial, setSerial] = useState("");
  const [year, setYear] = useState("");

  // Trigger scan on mount
  useEffect(() => {
    if (!params.imageBase64 || !params.propertyId) {
      setError("Missing image or property data.");
      setScanning(false);
      return;
    }

    const mimeType =
      params.mimeType === "image/png" ? "image/png" : "image/jpeg";

    scanAppliance(token, params.imageBase64, params.propertyId, mimeType)
      .then((res) => {
        setResult(res);
        setApplianceType(res.appliance.appliance_type ?? "");
        setMake(res.appliance.make ?? "");
        setModel(res.appliance.model ?? "");
        setSerial(res.appliance.serial ?? "");
        setYear(res.appliance.estimated_year?.toString() ?? "");
      })
      .catch((err) => {
        setError(err?.message ?? "Scan failed. Please try again.");
      })
      .finally(() => setScanning(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConfirm = useCallback(() => {
    if (!result?.saved_appliance_id) {
      Alert.alert(
        "Not saved",
        "The appliance was not saved. Please retry from the walk-through screen."
      );
      return;
    }
    Alert.alert(
      "Appliance saved",
      `${make} ${model} added to ${params.propertyLabel}.`,
      [{ text: "Done", onPress: () => router.replace("/(broker)/") }]
    );
  }, [result, make, model, params.propertyLabel, router]);

  const handleRetry = useCallback(() => {
    router.back();
  }, [router]);

  // ── Loading state ──────────────────────────────────────────────────────────
  if (scanning) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1a1a1a" />
        <Text style={styles.scanningText}>Scanning model plate…</Text>
        <Text style={styles.scanningSubText}>
          Looking up make, model, and CPSC recall status
        </Text>
      </View>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorIcon}>⚠</Text>
        <Text style={styles.errorTitle}>Scan Failed</Text>
        <Text style={styles.errorMsg}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={handleRetry}>
          <Text style={styles.retryBtnText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!result) return null;

  const confidence = Math.round((result.appliance.ocr_confidence ?? 0) * 100);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Thumbnail */}
      {params.imageUri ? (
        <Image source={{ uri: params.imageUri }} style={styles.thumb} resizeMode="cover" />
      ) : null}

      {/* Confidence */}
      <View style={styles.confidenceRow}>
        <Text style={styles.confidenceLabel}>OCR Confidence</Text>
        <View style={[
          styles.confidencePill,
          { backgroundColor: confidence >= 80 ? "#f0fdf4" : confidence >= 60 ? "#fffbeb" : "#fef2f2" }
        ]}>
          <Text style={[
            styles.confidenceValue,
            { color: confidence >= 80 ? "#22c55e" : confidence >= 60 ? "#f59e0b" : "#ef4444" }
          ]}>
            {confidence}%
          </Text>
        </View>
      </View>

      {/* Recall badge */}
      <RecallBadge
        status={result.appliance.recall_status}
        ids={result.appliance.cpsc_recall_ids ?? []}
      />

      {/* Editable appliance fields */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Appliance Details</Text>
        <Text style={styles.cardSubtitle}>Edit any fields if OCR missed something</Text>

        <FieldRow label="Type" value={applianceType} onEdit={setApplianceType} />
        <FieldRow label="Make" value={make} onEdit={setMake} />
        <FieldRow label="Model" value={model} onEdit={setModel} />
        <FieldRow label="Serial #" value={serial} onEdit={setSerial} />
        <FieldRow label="Year" value={year} onEdit={setYear} />
      </View>

      {/* Corpus match */}
      {result.corpus_match.found && (
        <View style={styles.corpusBadge}>
          <Text style={styles.corpusBadgeText}>
            ✓ Matched in appliance registry (score: {Math.round((result.corpus_match.score ?? 0) * 100)}%)
          </Text>
        </View>
      )}

      {/* Confirm / retry */}
      <TouchableOpacity style={styles.confirmBtn} onPress={handleConfirm}>
        <Text style={styles.confirmBtnText}>
          {result.saved_appliance_id ? "Confirm & Continue" : "Done"}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.retryLinkBtn} onPress={handleRetry}>
        <Text style={styles.retryLinkText}>Re-scan a different photo</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f5f0" },
  content: { padding: 20, paddingBottom: 60 },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f5f5f0",
    padding: 32,
  },

  // Scanning
  scanningText: { fontSize: 18, fontWeight: "700", color: "#1a1a1a", marginTop: 20 },
  scanningSubText: { fontSize: 14, color: "#666", marginTop: 6, textAlign: "center" },

  // Error
  errorIcon: { fontSize: 48, marginBottom: 12 },
  errorTitle: { fontSize: 20, fontWeight: "700", color: "#1a1a1a", marginBottom: 8 },
  errorMsg: { fontSize: 14, color: "#666", textAlign: "center", lineHeight: 20, marginBottom: 24 },
  retryBtn: {
    backgroundColor: "#1a1a1a",
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  retryBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },

  // Thumbnail
  thumb: {
    width: "100%",
    height: 180,
    borderRadius: 10,
    marginBottom: 16,
    backgroundColor: "#e5e5e5",
  },

  // Confidence
  confidenceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  confidenceLabel: { fontSize: 13, color: "#555", fontWeight: "600" },
  confidencePill: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4 },
  confidenceValue: { fontSize: 13, fontWeight: "700" },

  // Recall badge
  recallBadge: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: 10,
    padding: 14,
    marginBottom: 20,
  },
  recallIcon: { fontSize: 22, marginRight: 12, fontWeight: "700" },
  recallText: { flex: 1 },
  recallLabel: { fontSize: 14, fontWeight: "700" },
  recallIds: { fontSize: 12, color: "#888", marginTop: 2 },

  // Fields card
  card: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTitle: { fontSize: 14, fontWeight: "700", color: "#1a1a1a", marginBottom: 2 },
  cardSubtitle: { fontSize: 12, color: "#888", marginBottom: 14 },
  fieldRow: { marginBottom: 10 },
  fieldLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  fieldInput: {
    borderWidth: 1,
    borderColor: "#e0e0e0",
    borderRadius: 7,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: "#1a1a1a",
    backgroundColor: "#fafafa",
  },

  // Corpus badge
  corpusBadge: {
    backgroundColor: "#f0fdf4",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 20,
  },
  corpusBadgeText: { fontSize: 13, color: "#22c55e", fontWeight: "600" },

  // Confirm
  confirmBtn: {
    backgroundColor: "#1a1a1a",
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: "center",
    marginBottom: 12,
  },
  confirmBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  retryLinkBtn: { alignItems: "center", paddingVertical: 8 },
  retryLinkText: { fontSize: 14, color: "#888" },
});
