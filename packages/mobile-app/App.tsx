import "./polyfills";
import React from "react";
import { StatusBar } from "expo-status-bar";
import MobileApp from "./src/MobileApp";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export default function App() {
  return (
    <ErrorBoundary>
      <MobileApp />
      <StatusBar style="auto" />
    </ErrorBoundary>
  );
}
