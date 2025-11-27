/**
 * Minimal test app - just to verify rendering works
 */
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";

console.log("App.test.tsx: Test app loaded");

export default function TestApp() {
  console.log("App.test.tsx: Rendering test app");
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Test App Works!</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#1a1a1a",
  },
  text: {
    fontSize: 24,
    color: "#fff",
    fontWeight: "bold",
  },
});
