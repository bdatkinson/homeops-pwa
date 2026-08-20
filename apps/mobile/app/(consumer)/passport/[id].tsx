/**
 * app/(consumer)/passport/[id].tsx — Full passport detail (Session 13)
 *
 * Shows:
 *   - Property address header
 *   - Broker branding block (agent name, brokerage, contact)
 *   - Appliance list with recall badge per item
 *   - Diagnose FAB for quick access to diagnostic flow
 */
import { useCallback, useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  Linking,
  RefreshControl,
  Modal,
  FlatList,
} from "react-native";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useAuth } from "../../../hooks/useAuth";
import {
  getPassport,
  type PassportDetail,
  type Appliance,
} from "../../../lib/gateway";

export default function PassportDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const router = useRouter();
  const { session } = useAuth();
  const token = session?.access_token ?? "";

  const [passport, setPassport] = useState<PassportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showDiagnoseModal, setShowDiagnoseModal] = useState(false);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const data = await getPassport(token, id);
        setPassport(data);
        navigation.setOptions({
          title: data.properties?.address_line1 ?? "Passport",
        });
      } catch (err) {
        Alert.alert("Error", err instanceof Error ? err.message : "Could not load passport");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token, id, navigation]
  );

  useEffect(() => { load(); }, [load]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    load(true);
  }, [load]);

  const openDiagnose = useCallback(
    (appliance: Appliance) => {
      if (!passport) return;
      setShowDiagnoseModal(false);
      router.push({
        pathname: "/(consumer)/diagnose",
        params: {
          passportId: passport.id,
          applianceId: appliance.id,
          applianceName: `${appliance.brand ?? ""} ${appliance.model_number ?? ""}`.trim(),
          brokerEmail: passport.brand_contact_email ?? undefined,
          brokerPhone: passport.brand_contact_phone ?? undefined,
        },
      } as any);
    },
    [passport, router]
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1a1a1a" />
      </View>
    );
  }

  if (!passport) return null;

  const prop = passport.properties;

  return (
    <View style={styles.fullScreen}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        {/* ── Property header ── */}
        <View style={styles.propertyHeader}>
          <Text style={styles.propertyAddress}>{prop?.address_line1}</Text>
          {prop?.address_line2 ? (
            <Text style={styles.propertyAddress2}>{prop.address_line2}</Text>
          ) : null}
          <Text style={styles.propertyCity}>
            {prop ? `${prop.city}, ${prop.state} ${prop.zip ?? ""}` : ""}
          </Text>
        </View>

        {/* ── Broker branding ── */}
        {(passport.brand_agent_name || passport.brand_brokerage) && (
          <View style={styles.brandingCard}>
            <Text style={styles.brandingLabel}>Prepared by</Text>
            {passport.brand_agent_name ? (
              <Text style={styles.brandingAgent}>{passport.brand_agent_name}</Text>
            ) : null}
            {passport.brand_brokerage ? (
              <Text style={styles.brandingBrokerage}>{passport.brand_brokerage}</Text>
            ) : null}
            <View style={styles.brandingContacts}>
              {passport.brand_contact_email ? (
                <TouchableOpacity
                  onPress={() => Linking.openURL(`mailto:${passport.brand_contact_email}`)}
                >
                  <Text style={styles.brandingLink}>✉  {passport.brand_contact_email}</Text>
                </TouchableOpacity>
              ) : null}
              {passport.brand_contact_phone ? (
                <TouchableOpacity
                  onPress={() => Linking.openURL(`tel:${passport.brand_contact_phone}`)}
                >
                  <Text style={styles.brandingLink}>📞  {passport.brand_contact_phone}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        )}

        {/* ── Appliance list ── */}
        <Text style={styles.sectionLabel}>
          Appliances ({passport.appliances.length})
        </Text>

        {passport.appliances.length === 0 ? (
          <View style={styles.emptyAppliances}>
            <Text style={styles.emptyAppliancesText}>No appliances recorded yet.</Text>
          </View>
        ) : (
          passport.appliances.map((item) => (
            <ApplianceCard key={item.id} appliance={item} />
          ))
        )}
      </ScrollView>

      {/* Diagnose FAB */}
      {passport.appliances.length > 0 && (
        <TouchableOpacity style={styles.fab} onPress={() => setShowDiagnoseModal(true)}>
          <Text style={styles.fabText}>?</Text>
        </TouchableOpacity>
      )}

      {/* Diagnose Appliance Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showDiagnoseModal}
        onRequestClose={() => setShowDiagnoseModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>What appliance is having an issue?</Text>
            <FlatList
              data={passport.appliances}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modalApplianceRow}
                  onPress={() => openDiagnose(item)}
                >
                  <Text style={styles.modalApplianceText}>
                    {item.brand ?? "Unknown"} {item.model_number ?? "Appliance"}
                  </Text>
                  <Text style={styles.modalApplianceChevron}>›</Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setShowDiagnoseModal(false)}
            >
              <Text style={styles.modalCloseBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

interface ApplianceCardProps {
  appliance: Appliance;
}

function ApplianceCard({ appliance }: ApplianceCardProps) {
  const hasRecall = appliance.recall_status === "active";
  const unknownRecall = appliance.recall_status === "unknown";

  return (
    <View style={[styles.applianceCard, hasRecall && styles.applianceCardRecall]}>
      {/* Recall badge */}
      {hasRecall && (
        <View style={styles.recallBanner}>
          <Text style={styles.recallBannerText}>⚠️  ACTIVE RECALL</Text>
          {appliance.recall_url ? (
            <TouchableOpacity onPress={() => Linking.openURL(appliance.recall_url!)}>
              <Text style={styles.recallLink}>View details ›</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}

      <View style={styles.applianceBody}>
        {/* Category pill */}
        {appliance.category ? (
          <View style={styles.categoryPill}>
            <Text style={styles.categoryPillText}>{appliance.category}</Text>
          </View>
        ) : null}

        <Text style={styles.applianceBrand}>
          {appliance.brand ?? "Unknown brand"}
        </Text>
        <Text style={styles.applianceModel}>
          Model: {appliance.model_number ?? "—"}
        </Text>
        <Text style={styles.applianceSerial}>
          Serial: {appliance.serial_number ?? "—"}
        </Text>
        {appliance.install_date ? (
          <Text style={styles.applianceMeta}>
            Installed:{" "}
            {new Date(appliance.install_date).toLocaleDateString("en-US", {
              year: "numeric",
              month: "short",
            })}
          </Text>
        ) : null}
        {appliance.notes ? (
          <Text style={styles.applianceNotes}>{appliance.notes}</Text>
        ) : null}

        {/* Recall status indicator (no active recall) */}
        {!hasRecall && (
          <View style={styles.recallOkRow}>
            <Text style={unknownRecall ? styles.recallUnknown : styles.recallOk}>
              {unknownRecall ? "⚪  Recall status unknown" : "✅  No active recall"}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fullScreen: { flex: 1 },
  container: { flex: 1, backgroundColor: "#f5f5f0" },
  content: { padding: 16, paddingBottom: 60 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },

  // Property header
  propertyHeader: {
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  },
  propertyAddress: { fontSize: 18, fontWeight: "800", color: "#fff", letterSpacing: -0.3 },
  propertyAddress2: { fontSize: 14, color: "#aaa", marginTop: 2 },
  propertyCity: { fontSize: 14, color: "#888", marginTop: 4 },

  // Branding
  brandingCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: "#1a1a1a",
  },
  brandingLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    color: "#aaa",
    textTransform: "uppercase",
    marginBottom: 6,
  },
  brandingAgent: { fontSize: 16, fontWeight: "700", color: "#1a1a1a" },
  brandingBrokerage: { fontSize: 13, color: "#666", marginTop: 2 },
  brandingContacts: { marginTop: 10, gap: 4 },
  brandingLink: { fontSize: 13, color: "#555", textDecorationLine: "underline" },

  // Section
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    color: "#888",
    textTransform: "uppercase",
    marginBottom: 10,
    marginTop: 4,
  },

  // Empty appliances
  emptyAppliances: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 24,
    alignItems: "center",
  },
  emptyAppliancesText: { fontSize: 14, color: "#aaa" },

  // Appliance card (non-tappable in this view)
  applianceCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    marginBottom: 12,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  applianceCardRecall: {
    borderWidth: 1.5,
    borderColor: "#ef4444",
  },

  // Recall banner
  recallBanner: {
    backgroundColor: "#ef4444",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  recallBannerText: { color: "#fff", fontWeight: "800", fontSize: 12, letterSpacing: 0.5 },
  recallLink: { color: "#fde8e8", fontSize: 12, textDecorationLine: "underline" },

  // Appliance body
  applianceBody: { padding: 14 },
  categoryPill: {
    alignSelf: "flex-start",
    backgroundColor: "#f0f0f0",
    borderRadius: 100,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginBottom: 8,
  },
  categoryPillText: { fontSize: 11, color: "#666", fontWeight: "600" },
  applianceBrand: { fontSize: 16, fontWeight: "700", color: "#1a1a1a" },
  applianceModel: { fontSize: 13, color: "#555", marginTop: 4 },
  applianceSerial: { fontSize: 13, color: "#555", marginTop: 2 },
  applianceMeta: { fontSize: 12, color: "#999", marginTop: 6 },
  applianceNotes: {
    fontSize: 13,
    color: "#666",
    fontStyle: "italic",
    marginTop: 8,
    lineHeight: 18,
  },

  // Recall status
  recallOkRow: { marginTop: 10 },
  recallOk: { fontSize: 12, color: "#22c55e", fontWeight: "600" },
  recallUnknown: { fontSize: 12, color: "#94a3b8", fontWeight: "600" },

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

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#fff",
    padding: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "70%",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1a1a1a",
    marginBottom: 16,
  },
  modalApplianceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  modalApplianceText: { fontSize: 15, color: "#1a1a1a" },
  modalApplianceChevron: { fontSize: 18, color: "#ccc" },
  modalCloseBtn: {
    marginTop: 20,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 10,
    backgroundColor: "#f0f0f0",
  },
  modalCloseBtnText: { fontSize: 16, fontWeight: "600", color: "#555" },
});
