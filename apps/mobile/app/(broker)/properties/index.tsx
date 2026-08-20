/**
 * app/(broker)/properties/index.tsx — Property list screen (Session 10)
 *
 * Lists all broker properties. Swipe left → Delete. Tap → Edit. FAB → New.
 * Passes propertyId + propertyLabel back to walk-through via router params.
 */
import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../../../hooks/useAuth";
import {
  listProperties,
  deleteProperty,
  type Property,
} from "../../../lib/gateway";

export default function PropertiesScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const token = session?.access_token ?? "";

  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const list = await listProperties(token);
        setProperties(list);
      } catch (err) {
        if (!silent)
          Alert.alert("Error", err instanceof Error ? err.message : "Could not load properties");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token]
  );

  useEffect(() => { load(); }, [load]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    load(true);
  }, [load]);

  const handleDelete = useCallback(
    (prop: Property) => {
      Alert.alert(
        "Delete Property",
        `Remove "${prop.address_line1}, ${prop.city}"?\n\nThis cannot be undone. Properties with passports cannot be deleted.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              try {
                await deleteProperty(token, prop.id);
                setProperties((prev) => prev.filter((p) => p.id !== prop.id));
              } catch (err) {
                Alert.alert(
                  "Cannot Delete",
                  err instanceof Error ? err.message : "Delete failed"
                );
              }
            },
          },
        ]
      );
    },
    [token]
  );

  const handleEdit = useCallback(
    (prop: Property) => {
      router.push({
        pathname: "/(broker)/properties/edit",
        params: { propertyId: prop.id },
      } as any);
    },
    [router]
  );

  const handleNew = useCallback(() => {
    router.push({ pathname: "/(broker)/properties/edit", params: {} } as any);
  }, [router]);

  const handleSelect = useCallback(
    (prop: Property) => {
      // Return to walk-through with selected property
      router.replace({
        pathname: "/(broker)/walk-through",
        params: {
          selectedPropertyId: prop.id,
          selectedPropertyLabel: `${prop.address_line1}, ${prop.city}`,
        },
      } as any);
    },
    [router]
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1a1a1a" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={properties}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        contentContainerStyle={properties.length === 0 ? styles.emptyContainer : styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🏠</Text>
            <Text style={styles.emptyTitle}>No properties yet</Text>
            <Text style={styles.emptySub}>
              Add your first property to start a walk-through.
            </Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={handleNew}>
              <Text style={styles.emptyBtnText}>+ Add Property</Text>
            </TouchableOpacity>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <TouchableOpacity style={styles.cardMain} onPress={() => handleSelect(item)}>
              <Text style={styles.cardAddress}>{item.address_line1}</Text>
              {item.address_line2 ? (
                <Text style={styles.cardAddress2}>{item.address_line2}</Text>
              ) : null}
              <Text style={styles.cardCity}>
                {item.city}, {item.state} {item.zip ?? ""}
              </Text>
            </TouchableOpacity>
            <View style={styles.cardActions}>
              <TouchableOpacity
                style={styles.editBtn}
                onPress={() => handleEdit(item)}
              >
                <Text style={styles.editBtnText}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={() => handleDelete(item)}
              >
                <Text style={styles.deleteBtnText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />

      {/* FAB */}
      {properties.length > 0 && (
        <TouchableOpacity style={styles.fab} onPress={handleNew}>
          <Text style={styles.fabText}>+</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f5f0" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  list: { padding: 16, paddingBottom: 100 },
  emptyContainer: { flex: 1 },

  // Empty state
  empty: { flex: 1, justifyContent: "center", alignItems: "center", padding: 40 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: "700", color: "#1a1a1a", marginBottom: 8 },
  emptySub: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 28,
  },
  emptyBtn: {
    backgroundColor: "#1a1a1a",
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  emptyBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },

  // Card
  card: {
    backgroundColor: "#fff",
    borderRadius: 10,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    overflow: "hidden",
  },
  cardMain: { padding: 16 },
  cardAddress: { fontSize: 15, fontWeight: "700", color: "#1a1a1a" },
  cardAddress2: { fontSize: 13, color: "#555", marginTop: 1 },
  cardCity: { fontSize: 13, color: "#888", marginTop: 3 },
  cardActions: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
  },
  editBtn: {
    flex: 1,
    paddingVertical: 11,
    alignItems: "center",
    borderRightWidth: 1,
    borderRightColor: "#f0f0f0",
  },
  editBtnText: { fontSize: 13, color: "#555", fontWeight: "600" },
  deleteBtn: { flex: 1, paddingVertical: 11, alignItems: "center" },
  deleteBtnText: { fontSize: 13, color: "#ef4444", fontWeight: "600" },

  // FAB
  fab: {
    position: "absolute",
    bottom: 32,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#1a1a1a",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  fabText: { color: "#fff", fontSize: 28, lineHeight: 32 },
});
