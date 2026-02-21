import React, { useRef, useEffect } from "react";
import { FlatList, StyleSheet } from "react-native";
import { useChatStore, type ChatMessage } from "../lib/store";
import { MessageBubble } from "./MessageBubble";

export function MessageList() {
  const messages = useChatStore((s) => s.messages);
  const flatListRef = useRef<FlatList<ChatMessage>>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 50);
    }
  }, [messages.length, messages[messages.length - 1]?.content]);

  return (
    <FlatList
      ref={flatListRef}
      data={messages}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <MessageBubble message={item} />}
      style={styles.list}
      contentContainerStyle={styles.content}
      onContentSizeChange={() => {
        flatListRef.current?.scrollToEnd({ animated: false });
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
    backgroundColor: "#000000",
  },
  content: {
    paddingTop: 12,
    paddingBottom: 8,
  },
});
