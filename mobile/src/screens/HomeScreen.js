import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, RefreshControl, Alert
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { transactionsAPI } from '../services/api';
import { COLORS, SPLIT_STATUS } from '../constants';

const statusConfig = {
  [SPLIT_STATUS.SETTLED]:     { label: 'Settled',     color: COLORS.success },
  [SPLIT_STATUS.ACCEPTED]:    { label: 'Accepted',    color: COLORS.success },
  [SPLIT_STATUS.PAY_LATER]:   { label: 'Pay Later',   color: COLORS.warning },
  [SPLIT_STATUS.PENDING]:     { label: 'Pending',     color: COLORS.grey    },
  [SPLIT_STATUS.NO_RESPONSE]: { label: 'No Response', color: COLORS.danger  },
  [SPLIT_STATUS.DECLINED]:    { label: 'Declined',    color: COLORS.danger  },
};

const HomeScreen = () => {
  const dispatch = useDispatch();
  const { user }  = useSelector((state) => state.auth);
  const [transactions, setTransactions] = useState([]);
  const [refreshing,   setRefreshing]   = useState(false);

  const loadTransactions = async () => {
    try {
      const res = await transactionsAPI.getAll();
      setTransactions(res.data.transactions);
    } catch (err) {
      console.log('Failed to load transactions');
    }
  };

  useEffect(() => { loadTransactions(); }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadTransactions();
    setRefreshing(false);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hi, {user?.name?.split(' ')[0]} 👋</Text>
          <Text style={styles.subGreeting}>Your payment history</Text>
        </View>
        
      </View>

      {/* Transaction list */}
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {transactions.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>💸</Text>
            <Text style={styles.emptyTitle}>No transactions yet</Text>
            <Text style={styles.emptyText}>Tap Split to create your first bill split</Text>
          </View>
        ) : (
          transactions.map((tx) => (
            <View key={tx.id} style={styles.card}>
              {/* Transaction header */}
              <View style={styles.cardHeader}>
                <Text style={styles.merchant}>{tx.merchant_name || 'Payment'}</Text>
                <Text style={styles.amount}>£{parseFloat(tx.total_amount).toFixed(2)}</Text>
              </View>
              <Text style={styles.date}>
                {new Date(tx.created_at).toLocaleDateString('en-GB', {
                  day: 'numeric', month: 'short', year: 'numeric'
                })}
              </Text>

              {/* Split status per person */}
              {tx.splits?.filter(s => s.payee_id).map((split) => {
                const config = statusConfig[split.status] || { label: split.status, color: COLORS.grey };
                return (
                  <View key={split.id} style={styles.splitRow}>
                    <Text style={styles.payeeName}>{split.payee_name}</Text>
                    <View style={styles.splitRight}>
                      <Text style={styles.splitAmount}>£{parseFloat(split.amount).toFixed(2)}</Text>
                      <View style={[styles.badge, { backgroundColor: config.color + '20' }]}>
                        <Text style={[styles.badgeText, { color: config.color }]}>{config.label}</Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: COLORS.lightGrey },
  header: {
    backgroundColor: COLORS.white,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  greeting:    { fontSize: 24, fontWeight: '800', color: COLORS.dark },
  subGreeting: { fontSize: 14, color: COLORS.grey, marginTop: 2 },
  logoutBtn:   { padding: 8 },
  logoutText:  { color: COLORS.danger, fontSize: 14, fontWeight: '600' },
  empty: {
    alignItems: 'center',
    marginTop: 100,
    paddingHorizontal: 40,
  },
  emptyIcon:  { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.dark, marginBottom: 8 },
  emptyText:  { fontSize: 14, color: COLORS.grey, textAlign: 'center' },
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
  cardHeader:  { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  merchant:    { fontSize: 16, fontWeight: '700', color: COLORS.dark },
  amount:      { fontSize: 16, fontWeight: '800', color: COLORS.primary },
  date:        { fontSize: 12, color: COLORS.grey, marginBottom: 12 },
  splitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  payeeName:   { fontSize: 14, color: COLORS.dark },
  splitRight:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  splitAmount: { fontSize: 14, fontWeight: '600', color: COLORS.dark },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  badgeText: { fontSize: 11, fontWeight: '600' },
});

export default HomeScreen;
