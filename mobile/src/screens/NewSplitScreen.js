import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform
} from 'react-native';
import { usersAPI, transactionsAPI } from '../services/api';
import { COLORS } from '../constants';

const NewSplitScreen = ({ navigation }) => {
  const [merchantName, setMerchantName]   = useState('');
  const [totalAmount,  setTotalAmount]    = useState('');
  const [searchQuery,  setSearchQuery]    = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [loading,       setLoading]       = useState(false);
  const [searching,     setSearching]     = useState(false);

  // ─────────────────────────────────────────
  // Search for users by email or phone
  // ─────────────────────────────────────────
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await usersAPI.search(searchQuery.trim());
      setSearchResults(res.data.users);
    } catch (err) {
      Alert.alert('Error', 'Could not search users');
    } finally {
      setSearching(false);
    }
  };

  const addUser = (user) => {
    if (selectedUsers.find(u => u.id === user.id)) return;
    setSelectedUsers([...selectedUsers, user]);
    setSearchResults([]);
    setSearchQuery('');
  };

  const removeUser = (userId) => {
    setSelectedUsers(selectedUsers.filter(u => u.id !== userId));
  };

  // ─────────────────────────────────────────
  // Calculate equal split amount
  // ─────────────────────────────────────────
  const splitAmount = selectedUsers.length > 0
    ? (parseFloat(totalAmount) / (selectedUsers.length + 1)).toFixed(2) // +1 for payer
    : '0.00';

  // ─────────────────────────────────────────
  // Create transaction
  // ─────────────────────────────────────────
  const handleCreateSplit = async () => {
    if (!totalAmount || isNaN(parseFloat(totalAmount))) {
      return Alert.alert('Error', 'Enter a valid total amount');
    }
    if (selectedUsers.length === 0) {
      return Alert.alert('Error', 'Add at least one person to split with');
    }

    setLoading(true);
    try {
      const splits = selectedUsers.map(u => ({
        payee_id: u.id,
        amount:   parseFloat(splitAmount),
      }));

      await transactionsAPI.create({
        total_amount:  parseFloat(totalAmount),
        currency:      'GBP',
        merchant_name: merchantName || 'Payment',
        splits,
      });

      Alert.alert(
        '✅ Split Created!',
        `Split requests sent to ${selectedUsers.map(u => u.name).join(', ')}`,
        [{ text: 'Done', onPress: () => {
          setMerchantName('');
          setTotalAmount('');
          setSelectedUsers([]);
          navigation.navigate('Home');
        }}]
      );
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Failed to create split');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: COLORS.white }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>New Split</Text>
          <Text style={styles.subtitle}>Split a bill with your group</Text>
        </View>

        {/* Amount */}
        <View style={styles.amountCard}>
          <Text style={styles.label}>Total Amount</Text>
          <TextInput
            style={styles.amountInput}
            placeholder="£0.00"
            placeholderTextColor={COLORS.grey}
            value={totalAmount}
            onChangeText={setTotalAmount}
            keyboardType="decimal-pad"
          />
          <TextInput
            style={styles.merchantInput}
            placeholder="Where? (e.g. Bella Italia)"
            placeholderTextColor={COLORS.grey}
            value={merchantName}
            onChangeText={setMerchantName}
          />
        </View>

        {/* Add people */}
        <View style={styles.section}>
          <Text style={styles.label}>Split With</Text>
          <View style={styles.searchRow}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="Search by email or phone"
              placeholderTextColor={COLORS.grey}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
            />
            <TouchableOpacity style={styles.searchBtn} onPress={handleSearch}>
              {searching
                ? <ActivityIndicator color={COLORS.white} size="small" />
                : <Text style={styles.searchBtnText}>Find</Text>
              }
            </TouchableOpacity>
          </View>

          {/* Search results */}
          {searchResults.map(user => (
            <TouchableOpacity key={user.id} style={styles.resultRow} onPress={() => addUser(user)}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{user.name[0].toUpperCase()}</Text>
              </View>
              <View>
                <Text style={styles.resultName}>{user.name}</Text>
                <Text style={styles.resultEmail}>{user.email}</Text>
              </View>
              <Text style={styles.addIcon}>+</Text>
            </TouchableOpacity>
          ))}

          {/* Selected users */}
          {selectedUsers.map(user => (
            <View key={user.id} style={styles.selectedRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{user.name[0].toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.resultName}>{user.name}</Text>
                <Text style={styles.splitAmountText}>
                  owes £{totalAmount ? splitAmount : '—'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => removeUser(user.id)}>
                <Text style={styles.removeIcon}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>

        {/* Summary */}
        {selectedUsers.length > 0 && totalAmount ? (
          <View style={styles.summary}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Total</Text>
              <Text style={styles.summaryValue}>£{parseFloat(totalAmount).toFixed(2)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Per person</Text>
              <Text style={styles.summaryValue}>£{splitAmount}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>People splitting</Text>
              <Text style={styles.summaryValue}>{selectedUsers.length + 1} (including you)</Text>
            </View>
          </View>
        ) : null}

        {/* Create button */}
        <TouchableOpacity
          style={[styles.createBtn, loading && { opacity: 0.7 }]}
          onPress={handleCreateSplit}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color={COLORS.white} />
            : <Text style={styles.createBtnText}>Send Split Requests 💸</Text>
          }
        </TouchableOpacity>

      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container:     { padding: 20, paddingBottom: 40 },
  header:        { marginTop: 50, marginBottom: 24 },
  title:         { fontSize: 28, fontWeight: '800', color: COLORS.dark },
  subtitle:      { fontSize: 15, color: COLORS.grey, marginTop: 4 },
  amountCard: {
    backgroundColor: COLORS.primary,
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
  },
  label:         { fontSize: 13, color: COLORS.grey, fontWeight: '600', marginBottom: 8 },
  amountInput: {
    fontSize: 40,
    fontWeight: '800',
    color: COLORS.white,
    marginBottom: 12,
  },
  merchantInput: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: COLORS.white,
    fontSize: 15,
  },
  section:       { marginBottom: 20 },
  searchRow:     { flexDirection: 'row', gap: 10, marginBottom: 8 },
  input: {
    backgroundColor: COLORS.lightGrey,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: COLORS.dark,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  searchBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingHorizontal: 18,
    justifyContent: 'center',
  },
  searchBtnText: { color: COLORS.white, fontWeight: '700', fontSize: 15 },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: COLORS.lightGrey,
    borderRadius: 12,
    marginBottom: 8,
    gap: 12,
  },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.primary,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText:    { color: COLORS.white, fontWeight: '700', fontSize: 16 },
  resultName:    { fontSize: 15, fontWeight: '600', color: COLORS.dark },
  resultEmail:   { fontSize: 12, color: COLORS.grey },
  addIcon:       { fontSize: 22, color: COLORS.primary, fontWeight: '700', marginLeft: 'auto' },
  selectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#EEF2FF',
    borderRadius: 12,
    marginBottom: 8,
    gap: 12,
    borderWidth: 1,
    borderColor: COLORS.primary + '30',
  },
  splitAmountText: { fontSize: 13, color: COLORS.primary, fontWeight: '600' },
  removeIcon:    { fontSize: 16, color: COLORS.danger, padding: 4 },
  summary: {
    backgroundColor: COLORS.lightGrey,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    gap: 8,
  },
  summaryRow:    { flexDirection: 'row', justifyContent: 'space-between' },
  summaryLabel:  { fontSize: 14, color: COLORS.grey },
  summaryValue:  { fontSize: 14, fontWeight: '700', color: COLORS.dark },
  createBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
  },
  createBtnText: { color: COLORS.white, fontSize: 17, fontWeight: '800' },
});

export default NewSplitScreen;
