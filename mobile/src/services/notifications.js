import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';

// Controls how notifications appear when the app is open
// (sound, alert banner, badge count on app icon)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge:  true,
  }),
});

export const registerForPushNotifications = async () => {
  // Push tokens don't work on simulators — only real devices
  if (!Device.isDevice) {
    console.log('ℹ️  Push notifications only work on real devices');
    return null;
  }

  // Check current permission status
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  // If not granted yet, ask the user
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  // User denied permission
  if (finalStatus !== 'granted') {
    console.log('⚠️  Notification permission denied');
    return null;
  }

  // Get the Expo push token for this device
  const tokenData = await Notifications.getExpoPushTokenAsync({
    projectId: '33ef8477-85e8-4715-97f5-a096b70cbb68', // ← you will fill this in next
  });

  console.log('📲 Expo push token:', tokenData.data);
  return tokenData.data; // looks like ExponentPushToken[xxx...]
};