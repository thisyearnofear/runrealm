/**
 * RouteSuggestionCard - AI-powered route suggestion component
 * ENHANCEMENT FIRST: Uses existing AIService from shared-core
 */

import { AIService } from '@runrealm/shared-core/services/ai-service';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface RouteSuggestionCardProps {
  currentLocation: { latitude: number; longitude: number } | null;
  onRouteSelected?: (route: {
    coordinates: Array<{ lat: number; lng: number }>;
    distance: number;
  }) => void;
}

export const RouteSuggestionCard: React.FC<RouteSuggestionCardProps> = ({
  currentLocation,
  onRouteSelected,
}) => {
  const [suggestedRoute, setSuggestedRoute] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const aiService = AIService.getInstance();

  useEffect(() => {
    if (currentLocation) {
      loadRouteSuggestion();
    }
  }, [currentLocation]);

  const loadRouteSuggestion = useCallback(async () => {
    if (!currentLocation) return;

    try {
      setLoading(true);
      setError(null);

      // Initialize AI service if needed
      if (!aiService.getIsInitialized()) {
        await aiService.initializeService();
      }

      const route = await aiService.suggestRoute(
        {
          lat: currentLocation.latitude,
          lng: currentLocation.longitude,
        },
        {
          distance: 5000, // 5km default
          timeConstraint: '30 minutes',
        }
      );

      setSuggestedRoute(route);
    } catch (error) {
      console.error('Failed to load route suggestion:', error);
      setError('Route suggestions unavailable');
    } finally {
      setLoading(false);
    }
  }, [currentLocation, aiService]);

  const handleUseRoute = () => {
    if (suggestedRoute && onRouteSelected) {
      onRouteSelected({
        coordinates: suggestedRoute.coordinates || [],
        distance: suggestedRoute.distance || 5000,
      });
    }
  };

  if (!currentLocation) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>📍 Suggested Route</Text>
        <TouchableOpacity onPress={loadRouteSuggestion} style={styles.refreshButton}>
          <Text style={styles.refreshButtonText}>↻</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color="#00ff88" />
          <Text style={styles.loadingText}>Finding route...</Text>
        </View>
      ) : error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : suggestedRoute ? (
        <>
          <View style={styles.routeInfo}>
            <View style={styles.routeStat}>
              <Text style={styles.routeStatLabel}>Distance</Text>
              <Text style={styles.routeStatValue}>
                {(suggestedRoute.distance / 1000).toFixed(1)} km
              </Text>
            </View>
            <View style={styles.routeStat}>
              <Text style={styles.routeStatLabel}>Difficulty</Text>
              <Text style={styles.routeStatValue}>{suggestedRoute.difficulty || 'Medium'}</Text>
            </View>
          </View>

          {suggestedRoute.description && (
            <Text style={styles.routeDescription}>{suggestedRoute.description}</Text>
          )}

          {suggestedRoute.landmarks && suggestedRoute.landmarks.length > 0 && (
            <View style={styles.landmarksSection}>
              <Text style={styles.landmarksTitle}>📍 Landmarks</Text>
              {suggestedRoute.landmarks.slice(0, 3).map((landmark: string, index: number) => (
                <Text key={index} style={styles.landmarkText}>
                  • {landmark}
                </Text>
              ))}
            </View>
          )}

          <TouchableOpacity style={styles.useRouteButton} onPress={handleUseRoute}>
            <Text style={styles.useRouteButtonText}>Use This Route</Text>
          </TouchableOpacity>
        </>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  refreshButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  refreshButtonText: {
    fontSize: 20,
    color: '#00ff88',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 20,
  },
  loadingText: {
    marginLeft: 12,
    fontSize: 14,
    color: '#ccc',
  },
  errorContainer: {
    paddingVertical: 20,
  },
  errorText: {
    fontSize: 14,
    color: '#f44336',
    textAlign: 'center',
  },
  routeInfo: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 12,
  },
  routeStat: {
    alignItems: 'center',
  },
  routeStatLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  routeStatValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#00ff88',
  },
  routeDescription: {
    fontSize: 14,
    color: '#ccc',
    lineHeight: 20,
    marginBottom: 12,
  },
  landmarksSection: {
    marginBottom: 12,
  },
  landmarksTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#00ff88',
    marginBottom: 8,
  },
  landmarkText: {
    fontSize: 13,
    color: '#ccc',
    lineHeight: 18,
    marginBottom: 4,
  },
  useRouteButton: {
    backgroundColor: '#00ff88',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  useRouteButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
});
