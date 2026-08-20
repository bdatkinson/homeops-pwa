/**
 * app/(consumer)/index.tsx — Consumer home (Session 13)
 *
 * Smart routing:
 *   0 passports → empty state (invite pending)
 *   1 passport  → show inline: property header + recent appliances + diagnose CTA
 *   N passports → passport list (existing behaviour)
 *
 * "Recent appliances" section fetches the single passport's full detail
 * and shows up to 3 appliances with recall status inline.
 */
import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  ScrollView,
  Linking,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../../hooks/useAuth";
import {
  getMyPassports,
  getPassport,
  type PassportSummary,
  type PassportDetail,
  type Appliance,
} from "../../lib/gateway";

export default function ConsumerHome() {
  const router = useRouter();
  const { session, user, signOut } = useAuth();
  const token = session?.access_token ?? "";

  const [passports, setPassports] = useState<PassportSummary[]>([]);
  const [detail, setDetail] = useState<PassportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const list = await getMyPassports(token);
        setPassports(list);

        // If exactly one passport, eagerly fetch its detail for the inline widget
        if (list.length === 1) {
          const d = await getPassport(token, list[0].id);
          setDetail(d);
        } else {
          setDetail(null);
        }
      } catch (err) {
        if (!silent)
          Alert.alert("Error", err instanceof Error ? err.message : "Could not load passports");
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

  const openPassport = useCallback(
    (id: string) => {
      router.push({ pathname: "/(consumer)/passport/[id]", params: { id } } as any);
    },
    [router]
  );

  const openDiagnose = useCallback(
    (appliance: Appliance, passportId: string, brokerEmail?: string, brokerPhone?: string) => {
      router.push({
        pathname: "/(consumer)/diagnose",
        params: {
          passportId,
          applianceId: appliance.id,
          applianceName: `${appliance.brand ?? ""} ${appliance.model_number ?? ""}`.trim(),
          brokerEmail,
          brokerPhone,
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

  // ─── 0 passports ───────────────────────────────────────────────────────────
  if (passports.length === 0) {
    return (
      <View style={styles.emptyRoot}>
        <Text style={styles.emptyIcon}>📬</Text>
        <Text style={styles.emptyTitle}>Waiting for your invite</Text>
        <Text style={styles.emptySub}>
          Your agent will send you a link when your home's appliance passport is ready.
        </Text>
        <TouchableOpacity style={styles.signOutBtn} onPress={signOut}>
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ─── 1 passport → inline detail ────────────────────────────────────────────
  if (passports.length === 1 && detail) {
    const prop = detail.properties;
    const recentAppliances = detail.appliances.slice(0, 3);

    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        {/* Property header */}
        <View style={styles.propertyHeader}>
          <Text style={styles.propertyLabel}>Your Home</Text>
          <Text style={styles.propertyAddress}>{prop?.address_line1}</Text>
          <Text style={styles.propertyCity}>
            {prop ? `${prop.city}, ${prop.state}` : ""}
          </Text>
          <TouchableOpacity
            style={styles.viewPassportBtn}
            onPress={() => openPassport(detail.id)}
          >
            <Text style={styles.viewPassportBtnText}>View full passport ›</Text>
          </TouchableOpacity>
        </View>

        {/* Broker branding strip */}
        {(detail.brand_agent_name || detail.brand_brokerage) && (
          <View style={styles.brandStrip}>
            <Text style={styles.brandStripText}>
              Prepared by{" "}
              <Text style={styles.brandStripName}>
                {detail.brand_agent_name ?? detail.brand_brokerage}
              </Text>
            </Text>
            {detail.brand_contact_email && (
              <TouchableOpacity
                onPress={() => Linking.openURL(`mailto:${detail.brand_contact_email}`)}
              >
                <Text style={styles.brandStripContact}>Contact agent ›</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Recent appliances */}
        <Text style={styles.sectionLabel}>
          Appliances{detail.appliances.length > 3 ? ` (${detail.appliances.length} total)` : ""}
        </Text>

        {recentAppliances.length === 0 ? (
          <View style={styles.noAppliances}>
            <Text style={styles.noAppliancesText}>No appliances recorded yet.</Text>
          </View>
        ) : (
          recentAppliances.map((a) => (
            <TouchableOpacity
              key={a.id}
              style={styles.applianceRow}
              onPress={() =>
                openDiagnose(
                  a,
                  detail.id,
                  detail.brand_contact_email ?? undefined,
                  detail.brand_contact_phone ?? undefined
                )
              }
            >
              <View style={styles.applianceRowLeft}>
                {a.recall_status === "active" && (
                  <Text style={styles.recallDot}>⚠️</Text>
                )}
                <View>
                  <Text style={styles.applianceBrand}>
                    {a.brand ?? "Unknown"}{a.model_number ? ` · ${a.model_number}` : ""}
                  </Text>
                  <Text style={styles.applianceCategory}>{a.category ?? "Appliance"}</Text>
                </View>
              </View>
              <Text style={styles.diagnoseHint}>Diagnose ›</Text>
            </TouchableOpacity>
          ))
        )}

        {detail.appliances.length > 3 && (
          <TouchableOpacity
            style={styles.viewAllBtn}
            onPress={() => openPassport(detail.id)}
          >
            <Text style={styles.viewAllBtnText}>
              View all {detail.appliances.length} appliances ›
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    );
  }

  // ─── N passports → list ────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <FlatList
        data={passports}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <Text style={styles.listHeaderTitle}>Your Passports</Text>
            <Text style={styles.listHeaderSub}>{user?.email}</Text>
          </View>
        }
        renderItem={({ item }) => {
          const prop = item.properties;
          const count = item.passport_appliances?.[0]?.count ?? 0;
          return (
            <TouchableOpacity
              style={styles.passportCard}
              onPress={() => openPassport(item.id)}
              activeOpacity={0.75}
            >
              <Text style={styles.cardAddress}>{prop?.address_line1 ?? "Unknown address"}</Text>
              <Text style={styles.cardCity}>
                {prop ? `${prop.city}, ${prop.state} ${prop.zip ?? ""}` : ""}
              </Text>
              <View style={styles.cardFooter}>
                <View style={styles.countBadge}>
                  <Text style={styles.countBadgeText}>
                    {count} appliance{count !== 1 ? "s" : ""}
                  </Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f5f0" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  content: { padding: 16, paddingBottom: 80 },
  list: { padding: 16, paddingBottom: 60 },

  // Empty state (0 passports)
  emptyRoot: {
    flex: 1,
    backgroundColor: "#f5f5f0",
    justifyContent: "center",
    alignItems: "center",
    padding: 48,
  },
  emptyIcon: { fontSize: 52, marginBottom: 20 },
  emptyTitle: { fontSize: 20, fontWeight: "800", color: "#1a1a1a", marginBottom: 10 },
  emptySub: { fontSize: 14, color: "#888", textAlign: "center", lineHeight: 21, marginBottom: 32 },
  signOutBtn: { paddingVertical: 10, paddingHorizontal: 24 },
  signOutText: { fontSize: 14, color: "#aaa" },

  // Single passport inline view
  propertyHeader: {
    backgroundColor: "#1a1a1a",
    borderRadius: 14,
    padding: 20,
    marginBottom: 12,
  },
  propertyLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
    color: "#888",
    textTransform: "uppercase",
    marginBottom: 6,
  },
  propertyAddress: { fontSize: 20, fontWeight: "800", color: "#fff", letterSpacing: -0.4 },
  propertyCity: { fontSize: 14, color: "#888", marginTop: 4 },
  viewPassportBtn: { marginTop: 14 },
  viewPassportBtnText: { fontSize: 13, color: "#999", fontWeight: "600" },

  brandStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 20,
  },
  brandStripText: { fontSize: 12, color: "#888" },
  brandStripName: { fontWeight: "700", color: "#555" },
  brandStripContact: { fontSize: 12, color: "#1a1a1a", fontWeight: "700" },

  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    color: "#888",
    textTransform: "uppercase",
    marginBottom: 10,
  },

  noAppliances: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 20,
    alignItems: "center",
  },
  noAppliancesText: { fontSize: 14, color: "#aaa" },

  applianceRow: {
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
  applianceRowLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  recallDot: { fontSize: 18 },
  applianceBrand: { fontSize: 14, fontWeight: "700", color: "#1a1a1a" },
  applianceCategory: { fontSize: 12, color: "#888", marginTop: 2 },
  diagnoseHint: { fontSize: 13, color: "#aaa", fontWeight: "600" },

  viewAllBtn: { alignItems: "center", paddingVertical: 14 },
  viewAllBtnText: { fontSize: 13, color: "#555", fontWeight: "600" },

  // N-passport list
  listHeader: { paddingBottom: 16 },
  listHeaderTitle: { fontSize: 24, fontWeight: "800", color: "#1a1a1a", letterSpacing: -0.5 },
  listHeaderSub: { fontSize: 13, color: "#999", marginTop: 3 },

  passportCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  cardAddress: { fontSize: 16, fontWeight: "700", color: "#1a1a1a" },
  cardCity: { fontSize: 13, color: "#888", marginTop: 3 },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
  },
  countBadge: {
    backgroundColor: "#f0f0f0",
    borderRadius: 100,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  countBadgeText: { fontSize: 12, color: "#555", fontWeight: "600" },
  chevron: { fontSize: 20, color: "#ccc" },
});
