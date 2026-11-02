// Shim for InteractionManager removed in RN 0.88 — still used by react-navigation/stack
import ReactNative from 'react-native';
if (!ReactNative.InteractionManager) {
  ReactNative.InteractionManager = {
    runAfterInteractions: (cb) => { setTimeout(cb, 0); return { cancel: () => {} }; },
    createInteractionHandle: () => 0,
    clearInteractionHandle: () => {},
    setDeadline: () => {},
    addListener: () => ({ remove: () => {} }),
    Events: { interactionStart: 'interactionStart', interactionComplete: 'interactionComplete' },
  };
}

import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
