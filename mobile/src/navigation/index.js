import React, { useEffect } from "react";
import { NavigationContainer, createNavigationContainerRef } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useDispatch, useSelector } from "react-redux";
import { Text, ActivityIndicator, View } from "react-native";
import * as Notifications from 'expo-notifications';

import { loadUser } from "../store/slices/authSlice";
import { connectSocket, disconnectSocket } from "../services/socket";
import { COLORS } from "../constants";

// Screens
import LoginScreen from "../screens/LoginScreen";
import RegisterScreen from "../screens/RegisterScreen";
import HomeScreen from "../screens/HomeScreen";
import NewSplitScreen from "../screens/NewSplitScreen";
import PendingSplitsScreen from "../screens/PendingSplitsScreen";
import DebtsScreen from "../screens/DebtsScreen";
import ProfileScreen from "../screens/ProfileScreen";

import { registerForPushNotifications } from "../services/notifications";
import { usersAPI } from "../services/api";

export const navigationRef = createNavigationContainerRef();
const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

// ─────────────────────────────────────────
// BOTTOM TAB NAVIGATOR (logged in)
// ─────────────────────────────────────────
const MainTabs = () => (
  <Tab.Navigator
    screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: COLORS.primary,
      tabBarInactiveTintColor: COLORS.grey,
      tabBarStyle: {
        borderTopColor: COLORS.border,
        paddingBottom: 5,
        height: 60,
      },
    }}
  >
    <Tab.Screen
      name="Home"
      component={HomeScreen}
      options={{
        tabBarLabel: "Home",
        tabBarIcon: ({ color }) => (
          <Text style={{ color, fontSize: 20 }}>🏠</Text>
        ),
      }}
    />
    <Tab.Screen
      name="NewSplit"
      component={NewSplitScreen}
      options={{
        tabBarLabel: "Split",
        tabBarIcon: ({ color }) => (
          <Text style={{ color, fontSize: 20 }}>➕</Text>
        ),
      }}
    />
    <Tab.Screen
      name="Pending"
      component={PendingSplitsScreen}
      options={{
        tabBarLabel: "Requests",
        tabBarIcon: ({ color }) => (
          <Text style={{ color, fontSize: 20 }}>🔔</Text>
        ),
      }}
    />
    <Tab.Screen
      name="Debts"
      component={DebtsScreen}
      options={{
        tabBarLabel: "Debts",
        tabBarIcon: ({ color }) => (
          <Text style={{ color, fontSize: 20 }}>💳</Text>
        ),
      }}
    />
    <Tab.Screen
      name="Profile"
      component={ProfileScreen}
      options={{
        tabBarLabel: "Profile",
        tabBarIcon: ({ color }) => (
          <Text style={{ color, fontSize: 20 }}>👤</Text>
        ),
      }}
    />
  </Tab.Navigator>
);

// ─────────────────────────────────────────
// ROOT NAVIGATOR
// ─────────────────────────────────────────
const AppNavigator = () => {
  const dispatch = useDispatch();
  const { user, token, loading } = useSelector((state) => state.auth);

  // On app launch — try to restore session from AsyncStorage
  useEffect(() => {
    dispatch(loadUser());
  }, []);

  // Connect/disconnect WebSocket based on login state
  useEffect(() => {
    if (token) {
      connectSocket(token);
      registerForPushNotifications().then((pushToken) => {
        if (pushToken) {
          usersAPI.savePushToken(pushToken).catch(() => {});
        }
      });
    } else {
      disconnectSocket();
    }
  }, [token]);

  useEffect(() => {
  const subscription = Notifications.addNotificationResponseReceivedListener(response => {
    const data = response.notification.request.content.data;
    if (data?.screen === 'NewSplit' && navigationRef.isReady()) {
      navigationRef.navigate('NewSplit', {
        amount:   data.amount,
        merchant: data.merchant,
      });
    }
  });
  return () => subscription.remove();
}, []);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user ? (
          <Stack.Screen name="Main" component={MainTabs} />
        ) : (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default AppNavigator;
