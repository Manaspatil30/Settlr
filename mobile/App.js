import 'react-native-gesture-handler';
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { Provider } from 'react-redux';
import { store } from './src/store';
import AppNavigator from './src/navigation';
import { StripeProvider } from '@stripe/stripe-react-native';

export default function App() {
  return (
    <Provider store={store}>
      <StripeProvider publishableKey='pk_test_51TQmYtFxe8KECdzDsHy4WeOdXfEzwE5sggUAPtkjc9nUo7CjopWRn06rKqwPnKT9Nfp5LCCTunqvYAl03f5XU77o00bRlKnK3p'>
      <StatusBar style="dark" />
      <AppNavigator />
      </StripeProvider>
    </Provider>
  );
}
