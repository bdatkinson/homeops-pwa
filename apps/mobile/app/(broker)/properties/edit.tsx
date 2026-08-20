/**
 * app/(broker)/properties/edit.tsx — Add / Edit property (Session 10)
 *
 * Used for both create (no propertyId param) and update (propertyId param).
 * On save → pops back to property list.
 */
import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../../hooks/useAuth";
import {
  createProperty,
  updateProperty,
  listProperties,
  type Property,
} from "../../../lib/gateway";

export default function EditPropertyScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const token = session?.access_token ?? "";

  const params = useLocalSearchParams<{ propertyId?: string }>();
  const isEdit = !!params.propertyId;

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  const [address1, setAddress1] = useState("");
  const [address2, setAddress2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState<string | null>(null);

  // Load existing data when editing
  useEffect(() => {
    if (!isEdit) return;
    listProperties(token)
      .then((list) => {
        const prop = list.find((p) => p.id === params.propertyId);
        if (prop) {
          setAddress1(prop.address_line1 ?? "");
          setAddress2(prop.address_line2 ?? "");
          setCity(prop.city ?? "");
          setState(prop.state ?? "");
          setZip(prop.zip as string | null); // Force type assertion
        }
      })
      .catch(() => Alert.alert("Error", "Could not load property details"))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = useCallback(async () => {
    if (!address1.trim() || !city.trim() || !state.trim()) {
      Alert.alert("Missing fields", "Street address, city, and state are required.");
      return;
    }

    setSaving(true);
    try {
      const payload: Omit<Property, "id"> = {
        address_line1: address1.trim(),
        address_line2: address2.trim() || null,
        city: city.trim(),
        state: state.trim().toUpperCase().slice(0, 2),
        zip: zip ?? null, // Ensure null is passed if empty
      };

      if (isEdit && params.propertyId) {
        await updateProperty(token, params.propertyId, payload);
      } else {
        await createProperty(token, payload);
      }

      router.back();
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Could not save property");
    } finally {
      setSaving(false);
    }
  }, [address1, address2, city, state, zip, isEdit, params.propertyId, token, router]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1a1a1a" />
      </View>
    );
  }

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
        <Text style={styles.sectionLabel}>Street Address</Text>
        <TextInput
          style={styles.input}
          value={address1}
          onChangeText={setAddress1}
          placeholder="123 Main St"
          placeholderTextColor="#aaa"
          autoCapitalize="words"
          returnKeyType="next"
        />

        <Text style={styles.sectionLabel}>Suite / Unit (optional)</Text>
        <TextInput
          style={styles.input}
          value={address2}
          onChangeText={setAddress2}
          placeholder="Apt 4B"
          placeholderTextColor="#aaa"
          autoCapitalize="words"
          returnKeyType="next"
        />

        <Text style={styles.sectionLabel}>City</Text>
        <TextInput
          style={styles.input}
          value={city}
          onChangeText={setCity}
          placeholder="Louisville"
          placeholderTextColor="#aaa"
          autoCapitalize="words"
          returnKeyType="next"
        />

        <View style={styles.row}>
          <View style={styles.flex2}>
            <Text style={styles.sectionLabel}>State</Text>
            <TextInput
              style={styles.input}
              value={state}
              onChangeText={setState}
              placeholder="KY"
              placeholderTextColor="#aaa"
              autoCapitalize="characters"
              maxLength={2}
              returnKeyType="next"
            />
          </View>
          <View style={[styles.flex2, styles.ml12]}>
            <Text style={styles.sectionLabel}>ZIP</Text>
            <TextInput
              style={styles.input}
              value={zip ?? ""}
              onChangeText={setZip}
              placeholder="40202"
              placeholderTextColor="#aaa"
              keyboardType="numeric"
              maxLength={5}
              returnKeyType="done"
            />
          </View>
        </View>

        <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveBtnText}>
              {isEdit ? "Save Changes" : "Add Property"}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()}>
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flex2: { flex: 2 },
  ml12: { marginLeft: 12 },
  container: { flex: 1, backgroundColor: "#f5f5f0" },
  content: { padding: 20, paddingBottom: 60 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },

  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    color: "#888",
    textTransform: "uppercase",
    marginBottom: 6,
    marginTop: 16,
  },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e0e0e0",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#1a1a1a",
  },
  row: { flexDirection: "row", alignItems: "flex-start" },

  saveBtn: {
    backgroundColor: "#1a1a1a",
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 32,
  },
  saveBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },

  cancelBtn: { alignItems: "center", paddingVertical: 14 },
  cancelBtnText: { color: "#888", fontSize: 14 },
});
