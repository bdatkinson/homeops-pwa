/**
 * app/(broker)/index.tsx — Broker dashboard (Session 13)
 * Shows recent properties + walk-through CTA.
 */
import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../../hooks/useAuth";
import { listProperties, type Property } from "../../lib/gateway";

export default function BrokerDashboard() {
  const router = useRouter();
  const { user } = useAuth();
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
      } catch {
        // Non-fatal on dashboard — user can still start walk-through
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

  return (
    <View style={styles.container}>
      <FlatList
        data={properties.slice(0, 5)}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View>
            {/* Hero CTA */}
            <TouchableOpacity
              style={styles.hero}
              onPress={() => router.navigate("/(broker)/walk-through")}
            >
              <Text style={styles.heroLabel}>Start Walk-Through</Text>
              <Text style={styles.heroSub}>
                Scan an appliance model plate to document a property
              </Text>
              <View style={styles.heroBtn}>
                <Text style={styles.heroBtnText}>+ New Walk-Through</Text>
              </View>
            </TouchableOpacity>

            {/* Properties shortcut */}
            <View style={styles.sectionRow}>
              <Text style={styles.sectionLabel}>Recent Properties</Text>
              <TouchableOpacity onPress={() => router.navigate("/(broker)/properties")}>
                <Text style={styles.sectionAction}>View all ›</Text>
              </TouchableOpacity>
            </View>

            {loading && (
              <ActivityIndicator
                size="small"
                color="#aaa"
                style={{ marginVertical: 20 }}
              />
            )}
          </View>
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyProperties}>
              <Text style={styles.emptyPropertiesText}>
                No properties yet. Start a walk-through to add one.
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.propertyRow}
            onPress={() => router.navigate("/(broker)/walk-through")}
          >
            <View style={styles.propertyRowLeft}>
              <Text style={styles.propertyAddress}>{item.address_line1}</Text>
              <Text style={styles.propertyCity}>
                {item.city}, {item.state}
              </Text>
            </View>
            <Text style={styles.rowChevron}>›</Text>
          </TouchableOpacity>
        )}
        ListFooterComponent={
          <View style={styles.footer}>
            <Text style={styles.footerEmail}>{user?.email}</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f5f0" },
  content: { padding: 16, paddingBottom: 60 },

  // Hero
  hero: {
    backgroundColor: "#1a1a1a",
    borderRadius: 14,
    padding: 24,
    marginBottom: 28,
  },
  heroLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    color: "#888",
    textTransform: "uppercase",
    marginBottom: 8,
  },
  heroSub: { fontSize: 15, color: "#aaa", lineHeight: 22, marginBottom: 20 },
  heroBtn: {
    backgroundColor: "#fff",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  heroBtnText: { fontSize: 15, fontWeight: "800", color: "#1a1a1a" },

  // Section
  sectionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    color: "#888",
    textTransform: "uppercase",
  },
  sectionAction: { fontSize: 13, color: "#555", fontWeight: "600" },

  // Property rows
  propertyRow: {
    backgroundColor: "#fff",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  propertyRowLeft: { flex: 1 },
  propertyAddress: { fontSize: 14, fontWeight: "700", color: "#1a1a1a" },
  propertyCity: { fontSize: 12, color: "#888", marginTop: 2 },
  rowChevron: { fontSize: 18, color: "#ccc" },

  emptyProperties: { paddingVertical: 20, alignItems: "center" },
  emptyPropertiesText: { fontSize: 13, color: "#aaa", textAlign: "center" },

  footer: { marginTop: 32, alignItems: "center" },
  footerEmail: { fontSize: 12, color: "#ccc" },
});
