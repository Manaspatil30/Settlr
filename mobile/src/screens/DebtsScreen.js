import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Alert, ActivityIndicator
} from 'react-native';
import { debtsAPI } from '../services/api';
import { useStripe } from '@stripe/stripe-react-native'
import { COLORS } from '../constants';

const DebtsScreen = () => {
  const [debts,      setDebts]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [settling,   setSettling]   = useState(null);

  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  const loadDebts = async () => {
    try {
      const res = await debtsAPI.getAll();
      setDebts(res.data.debts);
    } catch (err) {
      console.log('Failed to load debts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadDebts(); }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDebts();
    setRefreshing(false);
  };

  const handleSettle = (debtId, amount, creditorName) => {
    Alert.alert(
      "Settle Debt",
      `Pay £${parseFloat(amount).toFixed(2)} to ${creditorName}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Pay Now",
          onPress: async () => {
            setSettling(debtId);
            try {
              const res = await debtsAPI.createPaymentIntent(debtId);
              const { clientSecret } = res.data;

              const { error: initError } = await initPaymentSheet({
                paymentIntentClientSecret: clientSecret,
                merchantDisplayName: "Settlr",
              });
              if (initError) {
                Alert.alert("Error", initError.message);
                return;
              }

              const { error: payError } = await presentPaymentSheet();
              if (payError) {
                Alert.alert("Payment cancelled", payError.message);
                return;
              }

              await debtsAPI.settle(debtId);
              setDebts((prev) => prev.filter((d) => d.id !== debtId));
              Alert.alert(
                "✅ Paid!",
                `£${parseFloat(amount).toFixed(2)} sent to ${creditorName}`,
              );
            } catch (err) {
              Alert.alert(
                "Error",
                err.response?.data?.error || "Payment failed",
              );
            } finally {
              setSettling(null);
            }
          },
        },
      ],
    );
  };

  const debtTypeConfig = {
    no_response: { label: 'Reminder sent',   color: COLORS.danger,  icon: '🔔' },
    pay_later:   { label: 'You committed',   color: COLORS.warning, icon: '⏳' },
    declined:    { label: 'Disputed',        color: COLORS.grey,    icon: '❌' },
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Your Debts</Text>
        <Text style={styles.subtitle}>
          {debts.length > 0 ? `${debts.length} outstanding` : 'Nothing owed'}
        </Text>
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {debts.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🎉</Text>
            <Text style={styles.emptyTitle}>You're all clear!</Text>
            <Text style={styles.emptyText}>No outstanding debts</Text>
          </View>
        ) : (
          debts.map((debt) => {
            const config = debtTypeConfig[debt.type] || { label: debt.type, color: COLORS.grey, icon: '💳' };
            const isOverdue = debt.due_date && new Date(debt.due_date) < new Date();

            return (
              <View key={debt.id} style={[styles.card, isOverdue && styles.cardOverdue]}>
                <View style={styles.cardHeader}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                      {(debt.creditor_name || 'U')[0].toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.creditorName}>
                      You owe {debt.creditor_name}
                    </Text>
                    {debt.due_date && (
                      <Text style={[styles.dueDate, isOverdue && { color: COLORS.danger }]}>
                        {isOverdue ? '⚠️ Overdue — ' : 'Due '}
                        {new Date(debt.due_date).toDateString()}
                      </Text>
                    )}
                  </View>
                  <Text style={styles.debtAmount}>
                    £{parseFloat(debt.amount).toFixed(2)}
                  </Text>
                </View>

                <View style={styles.cardFooter}>
                  <View style={[styles.typeBadge, { backgroundColor: config.color + '20' }]}>
                    <Text style={{ fontSize: 12 }}>{config.icon} </Text>
                    <Text style={[styles.typeBadgeText, { color: config.color }]}>
                      {config.label}
                    </Text>
                  </View>

                  {settling === debt.id ? (
                    <ActivityIndicator color={COLORS.primary} size="small" />
                  ) : (
                    <TouchableOpacity
                      style={styles.settleBtn}
                      onPress={() => handleSettle(debt.id, debt.amount, debt.creditor_name)}
                    >
                      <Text style={styles.settleBtnText}>Mark as Settled</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: COLORS.lightGrey },
  center:      { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    backgroundColor: COLORS.white,
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title:       { fontSize: 28, fontWeight: '800', color: COLORS.dark },
  subtitle:    { fontSize: 14, color: COLORS.grey, marginTop: 2 },
  empty: {
    alignItems: 'center', marginTop: 100, paddingHorizontal: 40,
  },
  emptyIcon:   { fontSize: 48, marginBottom: 16 },
  emptyTitle:  { fontSize: 18, fontWeight: '700', color: COLORS.dark, marginBottom: 8 },
  emptyText:   { fontSize: 14, color: COLORS.grey, textAlign: 'center' },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 16,
    margin: 12,
    marginBottom: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardOverdue: {
    borderWidth: 1,
    borderColor: COLORS.danger + '40',
  },
  cardHeader:  { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: COLORS.primary,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText:   { color: COLORS.white, fontWeight: '700', fontSize: 18 },
  creditorName: { fontSize: 15, fontWeight: '700', color: COLORS.dark },
  dueDate:      { fontSize: 12, color: COLORS.grey, marginTop: 2 },
  debtAmount:   { fontSize: 22, fontWeight: '800', color: COLORS.danger },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  typeBadgeText: { fontSize: 12, fontWeight: '600' },
  settleBtn: {
    backgroundColor: COLORS.success + '15',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: COLORS.success,
  },
  settleBtnText: { color: COLORS.success, fontWeight: '700', fontSize: 13 },
});

export default DebtsScreen;
