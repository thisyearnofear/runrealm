/**
 * MobileApp - Minimal version with navigation
 * Services will be added incrementally
 */
import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import MapScreen from "./screens/MapScreen";
import { HistoryScreen } from "./screens/HistoryScreen";

const Tab = createBottomTabNavigator();

// Minimal screen components - will be enhanced later
function DashboardScreen() {
  const [achievements, setAchievements] = useState<any[]>([]);
  const [achievementService, setAchievementService] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadAchievementService = async () => {
      try {
        // Dynamic import for optional dependency
        const achievementModule = await import(
          "@runrealm/shared-core/services/achievement-service"
        );

        if (!isMounted) return;

        if (achievementModule?.AchievementService) {
          const Service = achievementModule.AchievementService;
          const service = new Service();
          await service.initialize();

          if (isMounted) {
            setAchievementService(service);
            setAchievements(service.getAchievements());
          }
        }
      } catch (error) {
        console.warn("AchievementService not available:", error);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadAchievementService();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Dashboard</Text>
      {isLoading ? (
        <Text style={styles.subtitle}>Loading...</Text>
      ) : achievementService ? (
        <>
          <Text style={styles.subtitle}>
            {achievements.length} achievements available
          </Text>
          <Text style={styles.info}>
            {achievements.filter((a) => a.unlockedAt).length} unlocked
          </Text>
        </>
      ) : (
        <Text style={styles.subtitle}>AchievementService not available</Text>
      )}
    </View>
  );
}

function ProfileScreen() {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Profile</Text>
      <Text style={styles.subtitle}>
        User profile and settings will go here
      </Text>
    </View>
  );
}

function SettingsScreen() {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Settings</Text>
      <Text style={styles.subtitle}>App settings will go here</Text>
    </View>
  );
}

export default function MobileApp() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          headerStyle: {
            backgroundColor: "#1a1a1a",
          },
          headerTintColor: "#fff",
          tabBarStyle: {
            backgroundColor: "#1a1a1a",
          },
          tabBarActiveTintColor: "#00ff88",
          tabBarInactiveTintColor: "#666",
        }}
      >
        <Tab.Screen
          name="Dashboard"
          component={DashboardScreen}
          options={{ title: "Dashboard" }}
        />
        <Tab.Screen
          name="Map"
          component={MapScreen}
          options={{ title: "Map" }}
          // Using simple MapScreen from this file, not src/screens/MapScreen.tsx
        />
        <Tab.Screen
          name="History"
          component={HistoryScreen}
          options={{ title: "History" }}
        />
        <Tab.Screen
          name="Profile"
          component={ProfileScreen}
          options={{ title: "Profile" }}
        />
        <Tab.Screen
          name="Settings"
          component={SettingsScreen}
          options={{ title: "Settings" }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#1a1a1a",
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: "#999",
    textAlign: "center",
    marginTop: 10,
  },
  info: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    marginTop: 5,
  },
});
