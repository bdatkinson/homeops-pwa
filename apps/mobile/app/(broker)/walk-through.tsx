/**
 * app/(broker)/walk-through.tsx — Walk-through scan screen.
 *
 * Flow:
 *   1. Broker picks a property (or creates one inline)
 *   2. Takes a photo of the appliance model plate (camera or gallery)
 *   3. Navigates to scan-result with the image + propertyId
 *
 * Session 9: camera + gallery picker, property selector stub.
 *            Full property CRUD in Session 10.
 */
import { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import { useAuth } from "../../hooks/useAuth";

export default function WalkThroughScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const token = session?.access_token ?? ""; // Not directly used here, but required for context

  const params = useLocalSearchParams<{
    selectedPropertyId?: string;
    selectedPropertyLabel?: string;
  }>();

  const [propertyId, setPropertyId] = useState<string | null>(
    params.selectedPropertyId ?? null
  );
  const [propertyLabel, setPropertyLabel] = useState<string | null>(
    params.selectedPropertyLabel ?? null
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (params.selectedPropertyId) {
      setPropertyId(params.selectedPropertyId);
      setPropertyLabel(params.selectedPropertyLabel ?? null);
    }
  }, [params.selectedPropertyId, params.selectedPropertyLabel]);

  const pickAndScan = useCallback(
    async (source: "camera" | "gallery") => {
      if (!propertyId) {
        Alert.alert("Select a property first", "Add or select a property before scanning.");
        return;
      }

      let result: ImagePicker.ImagePickerResult;

      if (source === "camera") {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== "granted") {
          Alert.alert("Permission required", "Camera access is needed to scan appliances.");
          return;
        }
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.85,
          base64: false,
          allowsEditing: false,
        });
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") {
          Alert.alert("Permission required", "Photo library access is needed.");
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.85,
          base64: false,
          allowsEditing: true,
          aspect: [4, 3],
        });
      }

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      setLoading(true);

      try {
        const base64 = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });

        const mimeType = asset.mimeType === "image/png" ? "image/png" : "image/jpeg";

        router.push({
          pathname: "/(broker)/scan-result",
          params: {
            imageUri: asset.uri,
            imageBase64: base64,
            mimeType,
            propertyId,
            propertyLabel: propertyLabel ?? "",
          },
        } as any);
      } catch (err) {
        Alert.alert("Error", "Could not read the image. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [propertyId, propertyLabel, router]
  );

  const handleSelectProperty = useCallback(() => {
    router.navigate("/(broker)/properties");
  }, [router]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Property selector */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Property</Text>
        {propertyId ? (
          <View style={styles.propertyPill}>
            <Text style={styles.propertyPillText}>{propertyLabel}</Text>
            <TouchableOpacity onPress={() => { setPropertyId(null); setPropertyLabel(null); }}>
              <Text style={styles.clearBtn}>✕</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.selectPropertyBtn} onPress={handleSelectProperty}>
            <Text style={styles.selectPropertyBtnText}>+ Select Property</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Scan actions */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Scan Appliance</Text>
        <Text style={styles.hint}>
          Point your camera at the model plate — usually on the side, back, or inside door of the appliance.
        </Text>

        <TouchableOpacity
          style={[styles.scanBtn, !propertyId && styles.scanBtnDisabled]}
          onPress={() => pickAndScan("camera")}
          disabled={!propertyId || loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Text style={styles.scanBtnIcon}>📷</Text>
              <Text style={styles.scanBtnText}>Take Photo</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.scanBtnSecondary, !propertyId && styles.scanBtnDisabled]}
          onPress={() => pickAndScan("gallery")}
          disabled={!propertyId || loading}
        >
          <Text style={styles.scanBtnSecondaryIcon}>🖼</Text>
          <Text style={styles.scanBtnSecondaryText}>Choose from Library</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.tip}>
        💡 Tip: Good lighting + steady shot = better OCR accuracy. Avoid glare.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f5f0" },
  content: { padding: 20, paddingBottom: 60 },
  section: { marginBottom: 28 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    color: "#888",
    textTransform: "uppercase",
    marginBottom: 10,
  },
  hint: { fontSize: 14, color: "#555", lineHeight: 20, marginBottom: 16 },

  // Property
  propertyPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1a1a1a",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    justifyContent: "space-between",
  },
  propertyPillText: { color: "#fff", fontSize: 14, fontWeight: "600", flex: 1 },
  clearBtn: { color: "#888", fontSize: 16, paddingLeft: 12 },
  selectPropertyBtn: {
    borderWidth: 1.5,
    borderColor: "#1a1a1a",
    borderStyle: "dashed",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
  },
  selectPropertyBtnText: { color: "#1a1a1a", fontWeight: "600", fontSize: 14 },

  // Scan buttons
  scanBtn: {
    backgroundColor: "#1a1a1a",
    borderRadius: 10,
    paddingVertical: 18,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  scanBtnDisabled: { opacity: 0.35 },
  scanBtnIcon: { fontSize: 22, marginRight: 10 },
  scanBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  scanBtnSecondary: {
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#1a1a1a",
    paddingVertical: 16,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  scanBtnSecondaryIcon: { fontSize: 20, marginRight: 10 },
  scanBtnSecondaryText: { color: "#1a1a1a", fontSize: 15, fontWeight: "600" },

  tip: {
    fontSize: 13,
    color: "#888",
    lineHeight: 19,
    textAlign: "center",
    paddingHorizontal: 10,
    marginTop: 20,
  },
});
