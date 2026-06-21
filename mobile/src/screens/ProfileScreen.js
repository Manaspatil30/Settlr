import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Linking,
} from "react-native";
import { useDispatch, useSelector } from "react-redux";
import { logoutUser } from "../store/slices/authSlice";
import { stripeAPI } from "../services/api";
import { COLORS } from "../constants";

const ProfileScreen = () => {
  const dispatch = useDispatch();
  const { user } = useSelector((state) => state.auth);

  const [stripeStatus, setStripeStatus] = useState(null);
  const [loadingStripe, setLoadingStripe] = useState(true);
  const [connecting, setConnecting] = useState(false);

  // Load Stripe status on mount
  useEffect(() => {
    loadStripeStatus();
  }, []);

  const loadStripeStatus = async () => {
    try {
      const res = await stripeAPI.getStatus();
      setStripeStatus(res.data);
    } catch (err) {
      setStripeStatus(null);
    } finally {
      setLoadingStripe(false);
    }
  };

  const handleConnectStripe = async () => {
    setConnecting(true);
    try {
      // Step 1 — Create Connect account if they don't have one
      if (!stripeStatus?.connected) {
        await stripeAPI.connect();
      }

      // Step 2 — Get onboarding URL and open it in browser
      const res = await stripeAPI.getOnboarding();
      await Linking.openURL(res.data.url);

      Alert.alert(
        "Complete Setup in Browser",
        "Finish adding your bank details in the browser. When done, come back here and pull down to refresh your status.",
        [{ text: "Got it" }],
      );

      // Step 3 — Refresh status after they return
      await loadStripeStatus();
    } catch (err) {
      Alert.alert(
        "Error",
        err.response?.data?.error || "Could not connect Stripe account",
      );
    } finally {
      setConnecting(false);
    }
  };

  const handleLogout = () => {
    Alert.alert("Log out", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log out",
        style: "destructive",
        onPress: () => dispatch(logoutUser()),
      },
    ]);
  };

  // Decide which Stripe state we're in
  const stripeReady = stripeStatus?.connected && stripeStatus?.payoutsEnabled;
  const stripePartial =
    stripeStatus?.connected && !stripeStatus?.payoutsEnabled;
  const stripeNone = !stripeStatus?.connected;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* ── Avatar + Name ── */}
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(user?.name || "U")[0].toUpperCase()}
          </Text>
        </View>
        <Text style={styles.name}>{user?.name}</Text>
        <Text style={styles.email}>{user?.email}</Text>
      </View>

      {/* ── Stripe Connect Card ── */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Receive Payments</Text>

        {loadingStripe ? (
          <ActivityIndicator color={COLORS.primary} style={{ marginTop: 12 }} />
        ) : stripeReady ? (
          <View style={styles.stripeReady}>
            <Text style={styles.stripeReadyIcon}>✅</Text>
            <Text style={styles.stripeReadyText}>
              Ready to receive payments
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.stripeDesc}>
              {stripePartial
                ? "Complete your bank setup to start receiving payments from splits."
                : "Connect your bank account so you can receive money when people pay their split."}
            </Text>
            <TouchableOpacity
              style={[styles.stripeBtn, connecting && { opacity: 0.7 }]}
              onPress={handleConnectStripe}
              disabled={connecting}
            >
              {connecting ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <Text style={styles.stripeBtnText}>
                  {stripePartial ? "Complete Setup" : "Connect Bank Account"}
                </Text>
              )}
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* ── Account Details ── */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Account Details</Text>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Name</Text>
          <Text style={styles.detailValue}>{user?.name}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Email</Text>
          <Text style={styles.detailValue}>{user?.email}</Text>
        </View>
      </View>

      {/* ── Log Out ── */}
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.lightGrey },
  content: { paddingBottom: 40 },
  header: {
    backgroundColor: COLORS.white,
    alignItems: "center",
    paddingTop: 70,
    paddingBottom: 30,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    marginBottom: 16,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.primary,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  avatarText: { color: COLORS.white, fontSize: 32, fontWeight: "800" },
  name: { fontSize: 22, fontWeight: "800", color: COLORS.dark },
  email: { fontSize: 14, color: COLORS.grey, marginTop: 4 },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.dark,
    marginBottom: 12,
  },
  stripeReady: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  stripeReadyIcon: { fontSize: 20 },
  stripeReadyText: { fontSize: 15, color: COLORS.success, fontWeight: "600" },
  stripeDesc: {
    fontSize: 14,
    color: COLORS.grey,
    lineHeight: 20,
    marginBottom: 14,
  },
  stripeBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  stripeBtnText: { color: COLORS.white, fontWeight: "700", fontSize: 15 },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  detailLabel: { fontSize: 14, color: COLORS.grey },
  detailValue: { fontSize: 14, fontWeight: "600", color: COLORS.dark },
  logoutBtn: {
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: COLORS.white,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.danger,
  },
  logoutText: { color: COLORS.danger, fontWeight: "700", fontSize: 16 },
});

export default ProfileScreen;
