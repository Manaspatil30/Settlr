import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform
} from 'react-native';
import { usersAPI, transactionsAPI, friendsAPI } from '../services/api';
import { COLORS } from '../constants';

const NewSplitScreen = ({ navigation, route }) => {
  const [merchantName,   setMerchantName]   = useState('');
  const [totalAmount,    setTotalAmount]     = useState('');
  const [searchQuery,    setSearchQuery]     = useState('');
  const [searchResults,  setSearchResults]   = useState([]);
  const [selectedUsers,  setSelectedUsers]   = useState([]);
  const [friends,        setFriends]         = useState([]);
  const [recents,        setRecents]         = useState([]);
  const [loading,        setLoading]         = useState(false);
  const [searching,      setSearching]       = useState(false);
  const [loadingFriends, setLoadingFriends]  = useState(true);

  useEffect(() => {
    if (route.params?.amount)   setTotalAmount(String(route.params.amount));
    if (route.params?.merchant) setMerchantName(route.params.merchant);
  }, [route.params]);

  useEffect(() => {
    loadFriendsAndRecents();
  }, []);

  const loadFriendsAndRecents = async () => {
    try {
      const [friendsRes, recentsRes] = await Promise.all([
        friendsAPI.getAll(),
        friendsAPI.getRecents(),
      ]);
      setFriends(friendsRes.data.friends);
      setRecents(recentsRes.data.recents);
    } catch (err) {
      // Non-fatal — search still works
    } finally {
      setLoadingFriends(false);
    }
  };

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

  const handleAddFriend = async (user) => {
    try {
      await friendsAPI.add(user.id);
      setFriends(prev => [...prev, user]);
      Alert.alert('✅ Added', `${user.name} added to your friends.`);
    } catch (err) {
      Alert.alert('Error', 'Could not add friend');
    }
  };

  const splitAmount = selectedUsers.length > 0
    ? (parseFloat(totalAmount) / (selectedUsers.length + 1)).toFixed(2)
    : '0.00';

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

  // Users already selected (exclude from friends/recents lists)
  const isSelected = (id) => !!selectedUsers.find(u => u.id === id);
  const isFriend   = (id) => !!friends.find(f => f.id === id);

  // Recents not already in friends list
  const uniqueRecents = recents.filter(r => !isFriend(r.id));

  const UserRow = ({ user, onAdd, showAddFriend }) => (
    <View style={styles.userRow}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{user.name[0].toUpperCase()}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.userName}>{user.name}</Text>
        <Text style={styles.userEmail}>{user.email}</Text>
      </View>
      <View style={styles.rowActions}>
        {showAddFriend && (
          <TouchableOpacity style={styles.friendBtn} onPress={() => handleAddFriend(user)}>
            <Text style={styles.friendBtnText}>+ Friend</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.addBtn, isSelected(user.id) && styles.addBtnSelected]}
          onPress={() => onAdd(user)}
          disabled={isSelected(user.id)}
        >
          <Text style={styles.addBtnText}>{isSelected(user.id) ? '✓' : '+'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

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
          <Text style={styles.amountLabel}>Total Amount</Text>
          <TextInput
            style={styles.amountInput}
            placeholder="£0.00"
            placeholderTextColor="rgba(255,255,255,0.6)"
            value={totalAmount}
            onChangeText={setTotalAmount}
            keyboardType="decimal-pad"
          />
          <TextInput
            style={styles.merchantInput}
            placeholder="Where? (e.g. Bella Italia)"
            placeholderTextColor="rgba(255,255,255,0.6)"
            value={merchantName}
            onChangeText={setMerchantName}
          />
        </View>

        {/* Selected users */}
        {selectedUsers.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Splitting with</Text>
            {selectedUsers.map(user => (
              <View key={user.id} style={styles.selectedRow}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{user.name[0].toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.userName}>{user.name}</Text>
                  <Text style={styles.splitAmountText}>owes £{totalAmount ? splitAmount : '—'}</Text>
                </View>
                <TouchableOpacity onPress={() => removeUser(user.id)}>
                  <Text style={styles.removeIcon}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Friends list */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Friends</Text>
          {loadingFriends ? (
            <ActivityIndicator color={COLORS.primary} style={{ marginVertical: 12 }} />
          ) : friends.length === 0 ? (
            <Text style={styles.emptyText}>No friends yet — search below to add people.</Text>
          ) : (
            friends.map(user => (
              <UserRow key={user.id} user={user} onAdd={addUser} showAddFriend={false} />
            ))
          )}
        </View>

        {/* Recents */}
        {uniqueRecents.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Recent</Text>
            {uniqueRecents.map(user => (
              <UserRow key={user.id} user={user} onAdd={addUser} showAddFriend={true} />
            ))}
          </View>
        )}

        {/* Search */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Find someone new</Text>
          <View style={styles.searchRow}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="Search by email or phone"
              placeholderTextColor={COLORS.grey}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              onSubmitEditing={handleSearch}
            />
            <TouchableOpacity style={styles.searchBtn} onPress={handleSearch}>
              {searching
                ? <ActivityIndicator color={COLORS.white} size="small" />
                : <Text style={styles.searchBtnText}>Find</Text>
              }
            </TouchableOpacity>
          </View>
          {searchResults.map(user => (
            <UserRow key={user.id} user={user} onAdd={addUser} showAddFriend={!isFriend(user.id)} />
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
          style={[styles.createBtn, (loading || selectedUsers.length === 0) && { opacity: 0.5 }]}
          onPress={handleCreateSplit}
          disabled={loading || selectedUsers.length === 0}
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
  container:    { padding: 20, paddingBottom: 60 },
  header:       { marginTop: 50, marginBottom: 24 },
  title:        { fontSize: 28, fontWeight: '800', color: COLORS.dark },
  subtitle:     { fontSize: 15, color: COLORS.grey, marginTop: 4 },

  amountCard: {
    backgroundColor: COLORS.primary,
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
  },
  amountLabel:  { fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: '600', marginBottom: 8 },
  amountInput: {
    fontSize: 40, fontWeight: '800', color: COLORS.white, marginBottom: 12,
  },
  merchantInput: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: COLORS.white,
    fontSize: 15,
  },

  section:      { marginBottom: 20 },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: COLORS.grey, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  emptyText:    { fontSize: 14, color: COLORS.grey, fontStyle: 'italic' },

  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 12,
  },
  avatar: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: COLORS.primary,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText:   { color: COLORS.white, fontWeight: '700', fontSize: 16 },
  userName:     { fontSize: 15, fontWeight: '600', color: COLORS.dark },
  userEmail:    { fontSize: 12, color: COLORS.grey },
  rowActions:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  friendBtn: {
    backgroundColor: COLORS.primary + '15',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: COLORS.primary + '40',
  },
  friendBtnText: { fontSize: 12, color: COLORS.primary, fontWeight: '600' },
  addBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: COLORS.primary,
    justifyContent: 'center', alignItems: 'center',
  },
  addBtnSelected: { backgroundColor: COLORS.success },
  addBtnText:   { color: COLORS.white, fontSize: 18, fontWeight: '700' },

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
  removeIcon:   { fontSize: 16, color: COLORS.danger, padding: 4 },

  searchRow:    { flexDirection: 'row', gap: 10, marginBottom: 8 },
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

  summary: {
    backgroundColor: COLORS.lightGrey,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    gap: 8,
  },
  summaryRow:   { flexDirection: 'row', justifyContent: 'space-between' },
  summaryLabel: { fontSize: 14, color: COLORS.grey },
  summaryValue: { fontSize: 14, fontWeight: '700', color: COLORS.dark },

  createBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
  },
  createBtnText: { color: COLORS.white, fontSize: 17, fontWeight: '800' },
});

export default NewSplitScreen;
