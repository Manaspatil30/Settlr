import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, RefreshControl, Modal, Platform
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchPendingSplits,
  acceptSplit,
  payLaterSplit,
  declineSplit
} from '../store/slices/splitsSlice';
import { COLORS } from '../constants';
import { useStripe } from '@stripe/stripe-react-native';
import { splitsAPI } from '../services/api';

const addDays = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(21, 0, 0, 0);
  return d;
};

const PAY_LATER_PRESETS = [
  { label: '1 day',  date: () => addDays(1) },
  { label: '3 days', date: () => addDays(3) },
  { label: '5 days', date: () => addDays(5) },
];

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const PendingSplitsScreen = ({ route }) => {
  const dispatch = useDispatch();
  const { pending, loading } = useSelector((state) => state.splits);
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  const [refreshing,      setRefreshing]      = useState(false);
  const [actioningSplit,  setActioningSplit]   = useState(null);
  const [payLaterModal,   setPayLaterModal]    = useState(false);
  const [declineModal,    setDeclineModal]     = useState(false);
  const [declineReason,   setDeclineReason]    = useState('');
  const [selectedSplitId, setSelectedSplitId] = useState(null);
  const [showCustomDate,  setShowCustomDate]   = useState(false);
  const [customDate,      setCustomDate]       = useState(() => addDays(7));

  useEffect(() => {
    dispatch(fetchPendingSplits());
  }, []);

  // Auto-trigger Pay Now or Pay Later when opened from notification button
  useEffect(() => {
    const { autoOpenSplit, intent } = route?.params || {};
    if (!autoOpenSplit || pending.length === 0) return;

    const splitId = String(autoOpenSplit);
    const match = pending.find((s) => String(s.id) === splitId);
    if (!match) return;

    if (intent === 'pay_now') {
      handleAccept(match.id);
    } else if (intent === 'pay_later') {
      openPayLater(match.id);
    }
  }, [pending, route?.params]);

  const onRefresh = async () => {
    setRefreshing(true);
    await dispatch(fetchPendingSplits());
    setRefreshing(false);
  };

  // ─── Accept ───
const handleAccept = async (splitId) => {
  setActioningSplit(splitId);
  try{
    //Step 1 - ask backend to create the payment
    const res = await splitsAPI.createPaymentIntent(splitId);
    const {clientSecret} = res.data;

    //Step 2 - prepare the payment sheet
    const {errro: initError } = await initPaymentSheet({
      paymentIntentClientSecret: clientSecret,
      merchantDisplayName: 'Settlr'
    });
    if (initError) {
      Alert.alert('Error', initError.message);
      setActioningSplit(null);
      return;
    }

    //Step 3 - show the card entry screen
    const {error : payError} = await presentPaymentSheet();
    if (payError) {
      Alert.alert('Payment cancelled', payError.message);
      setActioningSplit(null);
      return;
    }

    //Step4 - payment succeeded, tell backend to mark as settled
    await dispatch(acceptSplit(splitId));
    Alert.alert('✅ Paid!', 'Your share has been transferred.')

  } catch (err) {
    Alert.alert('Error', err.response?.data?.error || 'Payment failed');
  } finally {
    setActioningSplit(null);
  }
}

  // ─── Pay Later ───
  const openPayLater = (splitId) => {
    setSelectedSplitId(splitId);
    setShowCustomDate(false);
    setCustomDate(addDays(7));
    setPayLaterModal(true);
  };

  const handlePayLater = async (date) => {
    const due_date = date.toISOString();
    setPayLaterModal(false);
    setShowCustomDate(false);
    setActioningSplit(selectedSplitId);
    await dispatch(payLaterSplit({ splitId: selectedSplitId, due_date }));
    setActioningSplit(null);
    Alert.alert('⏳ Noted', `You've committed to pay by ${date.toDateString()}`);
  };

  const adjustCustomDate = (field, delta) => {
    setCustomDate(prev => {
      const d = new Date(prev);
      if (field === 'day')   d.setDate(d.getDate() + delta);
      if (field === 'month') d.setMonth(d.getMonth() + delta);
      if (field === 'year')  d.setFullYear(d.getFullYear() + delta);
      // Don't allow past dates
      if (d <= new Date()) return prev;
      return d;
    });
  };

  // ─── Decline ───
  const openDecline = (splitId) => {
    setSelectedSplitId(splitId);
    setDeclineReason('');
    setDeclineModal(true);
  };

  const handleDecline = async (reason) => {
    if (!reason.trim()) {
      return Alert.alert('Reason required', 'Please provide a reason for declining.');
    }
    setDeclineModal(false);
    setActioningSplit(selectedSplitId);
    await dispatch(declineSplit({ splitId: selectedSplitId, reason }));
    setActioningSplit(null);
  };

  if (loading && pending.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Split Requests</Text>
        <Text style={styles.subtitle}>
          {pending.length > 0 ? `${pending.length} pending` : 'All caught up!'}
        </Text>
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {pending.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🎉</Text>
            <Text style={styles.emptyTitle}>No pending requests</Text>
            <Text style={styles.emptyText}>You're all settled up</Text>
          </View>
        ) : (
          pending.map((split) => (
            <View key={split.id} style={styles.card}>
              {/* Card header */}
              <View style={styles.cardHeader}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {(split.payer_name || 'U')[0].toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.payerName}>{split.payer_name} paid</Text>
                  <Text style={styles.merchant}>{split.merchant_name || 'Payment'}</Text>
                </View>
                <Text style={styles.amount}>£{parseFloat(split.amount).toFixed(2)}</Text>
              </View>

              <Text style={styles.shareLabel}>Your share</Text>

              {/* Action buttons */}
              {actioningSplit === split.id ? (
                <ActivityIndicator color={COLORS.primary} style={{ marginTop: 12 }} />
              ) : (
                <View style={styles.actions}>
                  {/* Pay Now */}
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.acceptBtn]}
                    onPress={() => handleAccept(split.id)}
                  >
                    <Text style={styles.acceptBtnText}>Pay Now</Text>
                  </TouchableOpacity>

                  {/* Pay Later */}
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.laterBtn]}
                    onPress={() => openPayLater(split.id)}
                  >
                    <Text style={styles.laterBtnText}>Pay Later</Text>
                  </TouchableOpacity>

                  {/* Decline */}
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.declineBtn]}
                    onPress={() => openDecline(split.id)}
                  >
                    <Text style={styles.declineBtnText}>✕</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))
        )}
      </ScrollView>

      {/* ─── Pay Later Modal ─── */}
      <Modal visible={payLaterModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>When will you pay?</Text>

            {/* Quick presets */}
            {!showCustomDate && (
              <>
                {PAY_LATER_PRESETS.map((opt) => (
                  <TouchableOpacity
                    key={opt.label}
                    style={styles.modalOption}
                    onPress={() => handlePayLater(opt.date())}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.modalOptionText}>{opt.label}</Text>
                      <Text style={styles.modalOptionDate}>{opt.date().toDateString()}</Text>
                    </View>
                    <Text style={styles.modalOptionArrow}>›</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  style={styles.modalOption}
                  onPress={() => setShowCustomDate(true)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalOptionText}>Custom date</Text>
                    <Text style={styles.modalOptionDate}>Pick a specific day</Text>
                  </View>
                  <Text style={styles.modalOptionArrow}>›</Text>
                </TouchableOpacity>
              </>
            )}

            {/* Custom date picker */}
            {showCustomDate && (
              <>
                <TouchableOpacity onPress={() => setShowCustomDate(false)} style={styles.backBtn}>
                  <Text style={styles.backBtnText}>‹ Back</Text>
                </TouchableOpacity>
                <Text style={styles.customDateLabel}>Select date</Text>
                <View style={styles.datePickerRow}>
                  {/* Day */}
                  <View style={styles.dateColumn}>
                    <TouchableOpacity onPress={() => adjustCustomDate('day', 1)} style={styles.dateArrow}>
                      <Text style={styles.dateArrowText}>▲</Text>
                    </TouchableOpacity>
                    <Text style={styles.dateValue}>{customDate.getDate()}</Text>
                    <TouchableOpacity onPress={() => adjustCustomDate('day', -1)} style={styles.dateArrow}>
                      <Text style={styles.dateArrowText}>▼</Text>
                    </TouchableOpacity>
                    <Text style={styles.dateUnitLabel}>Day</Text>
                  </View>

                  {/* Month */}
                  <View style={styles.dateColumn}>
                    <TouchableOpacity onPress={() => adjustCustomDate('month', 1)} style={styles.dateArrow}>
                      <Text style={styles.dateArrowText}>▲</Text>
                    </TouchableOpacity>
                    <Text style={styles.dateValue}>{MONTHS[customDate.getMonth()]}</Text>
                    <TouchableOpacity onPress={() => adjustCustomDate('month', -1)} style={styles.dateArrow}>
                      <Text style={styles.dateArrowText}>▼</Text>
                    </TouchableOpacity>
                    <Text style={styles.dateUnitLabel}>Month</Text>
                  </View>

                  {/* Year */}
                  <View style={styles.dateColumn}>
                    <TouchableOpacity onPress={() => adjustCustomDate('year', 1)} style={styles.dateArrow}>
                      <Text style={styles.dateArrowText}>▲</Text>
                    </TouchableOpacity>
                    <Text style={styles.dateValue}>{customDate.getFullYear()}</Text>
                    <TouchableOpacity onPress={() => adjustCustomDate('year', -1)} style={styles.dateArrow}>
                      <Text style={styles.dateArrowText}>▼</Text>
                    </TouchableOpacity>
                    <Text style={styles.dateUnitLabel}>Year</Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.confirmDateBtn}
                  onPress={() => handlePayLater(customDate)}
                >
                  <Text style={styles.confirmDateText}>Confirm — {customDate.toDateString()}</Text>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity
              style={styles.modalCancel}
              onPress={() => { setPayLaterModal(false); setShowCustomDate(false); }}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ─── Decline Modal ─── */}
      <Modal visible={declineModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Why are you declining?</Text>
            {["I didn't order that", "Wrong amount", "Already paid", "Other"].map((reason) => (
              <TouchableOpacity
                key={reason}
                style={[styles.modalOption, declineReason === reason && styles.modalOptionSelected]}
                onPress={() => setDeclineReason(reason)}
              >
                <Text style={[styles.modalOptionText, declineReason === reason && { color: COLORS.primary }]}>
                  {reason}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.declineConfirmBtn, !declineReason && { opacity: 0.5 }]}
              onPress={() => handleDecline(declineReason)}
              disabled={!declineReason}
            >
              <Text style={styles.declineConfirmText}>Decline</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalCancel}
              onPress={() => setDeclineModal(false)}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  title:      { fontSize: 28, fontWeight: '800', color: COLORS.dark },
  subtitle:   { fontSize: 14, color: COLORS.grey, marginTop: 2 },
  empty: {
    alignItems: 'center', marginTop: 100, paddingHorizontal: 40,
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
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: COLORS.primary,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText:  { color: COLORS.white, fontWeight: '700', fontSize: 18 },
  payerName:   { fontSize: 15, fontWeight: '700', color: COLORS.dark },
  merchant:    { fontSize: 13, color: COLORS.grey },
  amount: {
    fontSize: 22, fontWeight: '800', color: COLORS.primary,
  },
  shareLabel:  { fontSize: 13, color: COLORS.grey, marginBottom: 12 },
  actions:     { flexDirection: 'row', gap: 8 },
  actionBtn: {
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptBtn:       { flex: 1, backgroundColor: COLORS.primary },
  acceptBtnText:   { color: COLORS.white, fontWeight: '700', fontSize: 15 },
  laterBtn:        { flex: 1, backgroundColor: COLORS.warning + '20', borderWidth: 1, borderColor: COLORS.warning },
  laterBtnText:    { color: COLORS.warning, fontWeight: '700', fontSize: 15 },
  declineBtn:      { width: 44, backgroundColor: COLORS.danger + '15', borderWidth: 1, borderColor: COLORS.danger },
  declineBtnText:  { color: COLORS.danger, fontWeight: '700', fontSize: 16 },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  modalTitle:  { fontSize: 20, fontWeight: '800', color: COLORS.dark, marginBottom: 16 },
  modalOption: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  modalOptionSelected: { backgroundColor: COLORS.lightGrey, borderRadius: 8 },
  modalOptionText: { fontSize: 16, fontWeight: '600', color: COLORS.dark },
  modalOptionDate: { fontSize: 12, color: COLORS.grey, marginTop: 2 },
  modalOptionArrow: { fontSize: 22, color: COLORS.grey },

  backBtn:      { marginBottom: 12 },
  backBtnText:  { fontSize: 15, color: COLORS.primary, fontWeight: '600' },
  customDateLabel: { fontSize: 14, color: COLORS.grey, marginBottom: 16, textAlign: 'center' },
  datePickerRow: { flexDirection: 'row', justifyContent: 'center', gap: 24, marginBottom: 24 },
  dateColumn:   { alignItems: 'center' },
  dateArrow:    { padding: 8 },
  dateArrowText: { fontSize: 18, color: COLORS.primary, fontWeight: '700' },
  dateValue:    { fontSize: 22, fontWeight: '800', color: COLORS.dark, minWidth: 50, textAlign: 'center' },
  dateUnitLabel: { fontSize: 11, color: COLORS.grey, marginTop: 4, textTransform: 'uppercase' },
  confirmDateBtn: {
    backgroundColor: COLORS.primary, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', marginBottom: 8,
  },
  confirmDateText: { color: COLORS.white, fontWeight: '700', fontSize: 15 },
  declineConfirmBtn: {
    backgroundColor: COLORS.danger, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', marginTop: 16,
  },
  declineConfirmText: { color: COLORS.white, fontWeight: '700', fontSize: 16 },
  modalCancel: { alignItems: 'center', marginTop: 12, padding: 8 },
  modalCancelText: { color: COLORS.grey, fontSize: 15 },
});

export default PendingSplitsScreen;
