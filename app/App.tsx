import React, { useEffect } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { connect, disconnect } from "./lib/ws";
import { registerForPushNotifications } from "./lib/notifications";
import { MessageList } from "./components/MessageList";
import { InputBar } from "./components/InputBar";
import { Header } from "./components/Header";

export default function App() {
  useEffect(() => {
    connect();
    registerForPushNotifications();
    return () => disconnect();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <SafeAreaView style={styles.container} edges={["top"]}>
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Header />
          <MessageList />
          <InputBar />
        </KeyboardAvoidingView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },
});
