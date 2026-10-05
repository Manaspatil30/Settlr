import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, RefreshControl
} from 'react-native';
import { useSelector } from 'react-redux';
import { disputesAPI } from '../services/api';
import { COLORS } from '../constants';

const DisputesScreen = ({ navigation }) => {
  const { user }  = useSelector((state) => state.auth);
  const [disputes,   setDisputes]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [resolving,  setResolving]  = useState(null);

  useEffect(() => { loadDisputes(); }, []);

  const loadDisputes = async () => {
    try {
      const res = await disputesAPI.getAll();
      setDisputes(res.data.disputes);
    } catch (err) {
      Alert.alert('Error', 'Could not load disputes');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDisputes();
    setRefreshing(false);
  };

  const handleResolve = async (dispute) => {
    Alert.alert(
      'Mark as resolved?',
      `This means you and ${dispute.raised_by_name} have sorted it out.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Resolve',
          onPress: async () => {
            setResolving(dispute.id);
            try {
              await disputesAPI.resolve(dispute.id);
              setDisputes(prev =>
                prev.map(d => d.id === dispute.id ? { ...d, status: 'resolved', resolved_at: new Date().toISOString() } : d)
              );
            } catch (err) {
              Alert.alert('Error', 'Could not resolve dispute');
            } finally {
              setResolving(null);
            }
          }
        }
      ]
    );
  };

  const open     = disputes.filter(d => d.status === 'open');
  const resolved = disputes.filter(d => d.status !== 'open');

  const DisputeCard = ({ dispute }) => {
    const iAmPayer   = dispute.payer_name === user?.name;
    const isResolved = dispute.status !== 'open';

    return (
      <View style={[styles.card, isResolved && styles.cardResolved]}>
        {/* Header */}
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.merchant}>{dispute.merchant_name || 'Payment'}</Text>
            <Text style={styles.meta}>
              {iAmPayer
                ? `${dispute.payee_name} declined your split`
                : `You declined ${dispute.payer_name}'s split`}
            </Text>
          </View>
          <View>
            <Text style={styles.amount}>£{parseFloat(dispute.amount).toFixed(2)}</Text>
            <View style={[styles.badge, isResolved ? styles.badgeResolved : styles.badgeOpen]}>
              <Text style={[styles.badgeText, isResolved ? styles.badgeTextResolved : styles.badgeTextOpen]}>
                {isResolved ? 'Resolved' : 'Open'}
              </Text>
            </View>
          </View>
        </View>

        {/* Reason */}
        <View style={styles.reasonBox}>
          <Text style={styles.reasonLabel}>Reason</Text>
          <Text style={styles.reasonText}>"{dispute.reason}"</Text>
        </View>

        {/* Date */}
        <Text style={styles.date}>
          {new Date(dispute.created_at).toLocaleDateString('en-GB', {
            day: 'numeric', month: 'short', year: 'numeric'
          })}
        </Text>

        {/* Resolve button — only payer can resolve, only when open */}
        {iAmPayer && !isResolved && (
          <TouchableOpacity
            style={[styles.resolveBtn, resolving === dispute.id && { opacity: 0.6 }]}
            onPress={() => handleResolve(dispute)}
            disabled={resolving === dispute.id}
          >
            {resolving === dispute.id
              ? <ActivityIndicator color={COLORS.white} size="small" />
              : <Text style={styles.resolveBtnText}>✓ Mark as Resolved</Text>
            }
          </TouchableOpacity>
        )}

        {isResolved && (
          <Text style={styles.resolvedAt}>
            Resolved {new Date(dispute.resolved_at).toLocaleDateString('en-GB', {
              day: 'numeric', month: 'short', year: 'numeric'
            })}
          </Text>
        )}
      </View>
    );
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
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Disputes</Text>
        <Text style={styles.subtitle}>
          {open.length > 0 ? `${open.length} open` : 'All resolved'}
        </Text>
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        {disputes.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🤝</Text>
            <Text style={styles.emptyTitle}>No disputes</Text>
            <Text style={styles.emptyText}>When someone declines a split, it shows up here so you can sort it out.</Text>
          </View>
        ) : (
          <>
            {open.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>Open</Text>
                {open.map(d => <DisputeCard key={d.id} dispute={d} />)}
              </>
            )}
            {resolved.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>Resolved</Text>
                {resolved.map(d => <DisputeCard key={d.id} dispute={d} />)}
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: COLORS.lightGrey },
  center:     { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    backgroundColor: COLORS.white,
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn:    { marginBottom: 8 },
  backText:   { fontSize: 16, color: COLORS.primary, fontWeight: '600' },
  title:      { fontSize: 28, fontWeight: '800', color: COLORS.dark },
  subtitle:   { fontSize: 14, color: COLORS.grey, marginTop: 2 },

  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: COLORS.grey,
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginHorizontal: 16, marginTop: 16, marginBottom: 6,
  },

  card: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardResolved: { opacity: 0.7 },

  cardHeader:  { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  merchant:    { fontSize: 16, fontWeight: '700', color: COLORS.dark },
  meta:        { fontSize: 13, color: COLORS.grey, marginTop: 2 },
  amount:      { fontSize: 16, fontWeight: '800', color: COLORS.primary, textAlign: 'right' },

  badge:         { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3, marginTop: 4, alignSelf: 'flex-end' },
  badgeOpen:     { backgroundColor: COLORS.danger + '20' },
  badgeResolved: { backgroundColor: COLORS.success + '20' },
  badgeText:     { fontSize: 11, fontWeight: '700' },
  badgeTextOpen: { color: COLORS.danger },
  badgeTextResolved: { color: COLORS.success },

  reasonBox: {
    backgroundColor: COLORS.lightGrey,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  reasonLabel: { fontSize: 11, fontWeight: '700', color: COLORS.grey, textTransform: 'uppercase', marginBottom: 4 },
  reasonText:  { fontSize: 14, color: COLORS.dark, fontStyle: 'italic', lineHeight: 20 },

  date:        { fontSize: 12, color: COLORS.grey, marginBottom: 12 },
  resolvedAt:  { fontSize: 12, color: COLORS.success, fontWeight: '600' },

  resolveBtn: {
    backgroundColor: COLORS.success,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  resolveBtnText: { color: COLORS.white, fontWeight: '700', fontSize: 15 },

  empty:      { alignItems: 'center', marginTop: 80, paddingHorizontal: 40 },
  emptyIcon:  { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.dark, marginBottom: 8 },
  emptyText:  { fontSize: 14, color: COLORS.grey, textAlign: 'center', lineHeight: 20 },
});

export default DisputesScreen;
