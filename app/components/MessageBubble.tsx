import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Markdown from "@ronradtke/react-native-markdown-display";
import type { ChatMessage } from "../lib/store";

interface Props {
  message: ChatMessage;
}

const markdownBase = {
  body: { color: "#FFFFFF", fontSize: 16, lineHeight: 22 },
  paragraph: { marginTop: 0, marginBottom: 4 },
  strong: { fontWeight: "700" as const },
  em: { fontStyle: "italic" as const },
  code_inline: {
    backgroundColor: "rgba(255,255,255,0.1)",
    color: "#FF9F0A",
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    fontSize: 14,
    fontFamily: "Menlo",
  },
  fence: {
    backgroundColor: "rgba(255,255,255,0.1)",
    color: "#FFFFFF",
    padding: 10,
    borderRadius: 8,
    fontSize: 14,
    fontFamily: "Menlo",
  },
  code_block: {
    backgroundColor: "rgba(255,255,255,0.1)",
    color: "#FFFFFF",
    padding: 10,
    borderRadius: 8,
    fontSize: 14,
    fontFamily: "Menlo",
  },
  link: { color: "#0A84FF" },
  list_item: { marginVertical: 2 },
  bullet_list_icon: { color: "#FFFFFF" },
  ordered_list_icon: { color: "#FFFFFF" },
  heading1: { color: "#FFFFFF", fontSize: 22, fontWeight: "700" as const },
  heading2: { color: "#FFFFFF", fontSize: 20, fontWeight: "700" as const },
  heading3: { color: "#FFFFFF", fontSize: 18, fontWeight: "600" as const },
  blockquote: {
    borderLeftColor: "#636366",
    borderLeftWidth: 3,
    paddingLeft: 10,
    backgroundColor: "transparent",
  },
  hr: { backgroundColor: "#636366" },
};

export function MessageBubble({ message }: Props) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  if (isSystem) {
    return (
      <View style={styles.rowSystem}>
        <Text style={styles.systemText}>{message.content}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.row, isUser && styles.rowUser]}>
      <Markdown style={markdownBase}>
        {message.content || " "}
      </Markdown>
      {message.streaming && <Text style={styles.cursor}>|</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  rowUser: {
    backgroundColor: "rgba(0, 122, 255, 0.25)",
  },
  rowSystem: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignItems: "center",
  },
  systemText: {
    color: "#8E8E93",
    fontSize: 13,
    fontStyle: "italic",
    textAlign: "center",
  },
  cursor: {
    color: "#FFFFFF",
    opacity: 0.5,
    fontSize: 16,
  },
});
