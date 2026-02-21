import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useChatStore } from "../lib/store";

export function Header() {
  const connected = useChatStore((s) => s.connected);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Bingus</Text>
      <View style={[styles.dot, connected ? styles.dotOnline : styles.dotOffline]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    backgroundColor: "#1C1C1E",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#38383A",
  },
  title: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "600",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 8,
  },
  dotOnline: {
    backgroundColor: "#30D158",
  },
  dotOffline: {
    backgroundColor: "#FF453A",
  },
});
