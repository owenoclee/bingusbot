import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { registerPushToken } from "./ws";

// Configure how notifications appear when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) {
    console.log("push notifications require a physical device");
    return null;
  }

  if (Platform.OS !== "ios") {
    console.log("push notifications only supported on iOS");
    return null;
  }

  // Request permission
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    console.log("push notification permission denied");
    return null;
  }

  // Get the native APNs device token (NOT Expo push token)
  const token = await Notifications.getDevicePushTokenAsync();
  const deviceToken = token.data as string;

  console.log("APNs device token:", deviceToken);

  // Send to server
  registerPushToken(deviceToken);

  return deviceToken;
}
