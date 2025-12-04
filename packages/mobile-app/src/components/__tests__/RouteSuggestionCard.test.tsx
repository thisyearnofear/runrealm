/**
 * Unit tests for RouteSuggestionCard component
 */

import { AIService } from '@runrealm/shared-core/services/ai-service';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { RouteSuggestionCard } from '../RouteSuggestionCard';

jest.mock('@runrealm/shared-core/services/ai-service');

describe('RouteSuggestionCard', () => {
  const mockLocation = {
    latitude: 37.7749,
    longitude: -122.4194,
  };

  const mockRoute = {
    distance: 5000, // 5km
    difficulty: 'Medium',
    description: 'A scenic route through the park',
    landmarks: ['Central Park', 'Museum', 'Fountain'],
    coordinates: [
      { lat: 37.7749, lng: -122.4194 },
      { lat: 37.775, lng: -122.4195 },
    ],
  };

  const mockAIService = {
    getIsInitialized: jest.fn(() => true),
    initializeService: jest.fn(),
    suggestRoute: jest.fn(),
  } as unknown as AIService;

  beforeEach(() => {
    jest.clearAllMocks();
    (AIService.getInstance as jest.Mock) = jest.fn(() => mockAIService);
  });

  it('should not render when location is null', () => {
    const { queryByText } = render(<RouteSuggestionCard currentLocation={null} />);

    expect(queryByText('📍 Suggested Route')).toBeNull();
  });

  it('should render loading state initially', () => {
    (mockAIService.suggestRoute as jest.Mock) = jest.fn(() => new Promise(() => {})); // Never resolves

    const { getByText } = render(<RouteSuggestionCard currentLocation={mockLocation} />);

    expect(getByText('Finding route...')).toBeTruthy();
  });

  it('should display route information when loaded', async () => {
    (mockAIService.suggestRoute as jest.Mock) = jest.fn(() => Promise.resolve(mockRoute));

    const { getByText } = render(<RouteSuggestionCard currentLocation={mockLocation} />);

    await waitFor(() => {
      expect(getByText('5.0 km')).toBeTruthy();
      expect(getByText('Medium')).toBeTruthy();
      expect(getByText('A scenic route through the park')).toBeTruthy();
      expect(getByText('📍 Landmarks')).toBeTruthy();
      expect(getByText('• Central Park')).toBeTruthy();
    });
  });

  it('should call onRouteSelected when use route button is pressed', async () => {
    (mockAIService.suggestRoute as jest.Mock) = jest.fn(() => Promise.resolve(mockRoute));

    const onRouteSelected = jest.fn();
    const { getByText } = render(
      <RouteSuggestionCard currentLocation={mockLocation} onRouteSelected={onRouteSelected} />
    );

    await waitFor(() => {
      fireEvent.press(getByText('Use This Route'));
      expect(onRouteSelected).toHaveBeenCalledWith({
        coordinates: mockRoute.coordinates,
        distance: mockRoute.distance,
      });
    });
  });

  it('should handle errors gracefully', async () => {
    (mockAIService.suggestRoute as jest.Mock) = jest.fn(() =>
      Promise.reject(new Error('Route service unavailable'))
    );

    const { getByText } = render(<RouteSuggestionCard currentLocation={mockLocation} />);

    await waitFor(() => {
      expect(getByText('Route suggestions unavailable')).toBeTruthy();
    });
  });

  it('should refresh route when refresh button is pressed', async () => {
    (mockAIService.suggestRoute as jest.Mock) = jest.fn(() => Promise.resolve(mockRoute));

    const { getByText } = render(<RouteSuggestionCard currentLocation={mockLocation} />);

    await waitFor(() => {
      expect(getByText('5.0 km')).toBeTruthy();
    });

    fireEvent.press(getByText('↻'));

    await waitFor(() => {
      expect(mockAIService.suggestRoute).toHaveBeenCalledTimes(2);
    });
  });

  it('should initialize AI service if not initialized', async () => {
    (mockAIService.getIsInitialized as jest.Mock) = jest.fn(() => false);
    (mockAIService.initializeService as jest.Mock) = jest.fn(() => Promise.resolve());
    (mockAIService.suggestRoute as jest.Mock) = jest.fn(() => Promise.resolve(mockRoute));

    render(<RouteSuggestionCard currentLocation={mockLocation} />);

    await waitFor(() => {
      expect(mockAIService.initializeService).toHaveBeenCalled();
    });
  });
});
