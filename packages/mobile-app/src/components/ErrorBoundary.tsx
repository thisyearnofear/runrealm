import React from "react";
import { View, Text, StatusBar, StyleSheet } from "react-native";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ComponentType<ErrorFallbackProps>;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

interface ErrorFallbackProps {
  error: Error | null;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    backgroundColor: "#fff",
  },
  errorText: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 10,
    color: "#ff0000",
    textAlign: "center",
  },
  errorDetail: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    marginBottom: 10,
  },
  stackTrace: {
    fontSize: 10,
    color: "#999",
    textAlign: "left",
    marginTop: 20,
    fontFamily: "monospace",
  },
});

function DefaultErrorFallback({ error }: ErrorFallbackProps) {
  return (
    <View style={styles.container}>
      <StatusBar />
      <Text style={styles.errorText}>Something went wrong</Text>
      <Text style={styles.errorDetail}>
        {error?.message || "Unknown error occurred"}
      </Text>
      {__DEV__ && error?.stack && (
        <Text style={styles.stackTrace}>{error.stack}</Text>
      )}
    </View>
  );
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error("ErrorBoundary caught an error:", error, errorInfo);

    // In production, you might want to log to an error reporting service
    if (!__DEV__) {
      // Example: Sentry.captureException(error, { extra: errorInfo });
    }
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      const FallbackComponent = this.props.fallback || DefaultErrorFallback;
      return <FallbackComponent error={this.state.error} />;
    }

    return this.props.children;
  }
}
