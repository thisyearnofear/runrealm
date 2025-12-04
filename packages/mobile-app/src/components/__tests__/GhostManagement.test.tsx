/**
 * Unit tests for GhostManagement component
 */

import {
  GhostRunnerNFT,
  GhostRunnerService,
} from '@runrealm/shared-core/services/ghost-runner-service';
import { Territory, TerritoryService } from '@runrealm/shared-core/services/territory-service';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { GhostManagement } from '../GhostManagement';

jest.mock('@runrealm/shared-core/services/ghost-runner-service');
jest.mock('@runrealm/shared-core/services/territory-service', () => ({
  TerritoryService: jest.fn().mockImplementation(() => ({
    getClaimedTerritories: jest.fn(() => []),
    getIsInitialized: jest.fn(() => true),
    initialize: jest.fn(),
  })),
}));
jest.mock('react-native/Libraries/Alert/Alert', () => ({
  alert: jest.fn(),
}));

describe('GhostManagement', () => {
  const mockGhost: GhostRunnerNFT = {
    id: 'ghost-1',
    name: 'Speed Demon',
    avatar: '👻',
    type: 'sprinter',
    level: 3,
    pace: 240, // 4 min/km
    backstory: 'A fast runner from the past',
    specialAbility: 'Burst speed',
    difficulty: 0.9,
    totalRuns: 10,
    totalDistance: 50000,
    winRate: 75,
    owner: 'user',
    deployCost: 50,
    upgradeCost: 200,
    cooldownUntil: null,
    lastDeployedTerritory: null,
    lastRunDate: null,
  };

  const mockTerritory: Territory = {
    id: 'territory-1',
    geohash: 'abc123',
    bounds: {
      north: 37.8,
      south: 37.7,
      east: -122.3,
      west: -122.4,
      center: { lat: 37.75, lng: -122.35 },
    },
    metadata: {
      name: 'Test Territory',
      description: 'A test territory',
      landmarks: [],
      difficulty: 50,
      rarity: 'common',
      estimatedReward: 100,
    },
    runData: {
      distance: 5000,
      duration: 1200,
      averageSpeed: 4.17,
      pointCount: 100,
    },
    status: 'claimed',
    defenseStatus: 'moderate',
    activityPoints: 500,
    owner: 'user',
    claimedAt: Date.now(),
  };

  const mockGhostService = {
    getIsInitialized: jest.fn(() => true),
    initialize: jest.fn(),
    getGhosts: jest.fn(() => [mockGhost]),
    getGhost: jest.fn((id: string) => (id === 'ghost-1' ? mockGhost : undefined)),
    getRealmBalance: jest.fn(() => 1000),
    deployGhost: jest.fn(),
    upgradeGhost: jest.fn(),
  } as unknown as GhostRunnerService;

  const mockTerritoryService = {
    getClaimedTerritories: jest.fn(() => [mockTerritory]),
    getIsInitialized: jest.fn(() => true),
    initialize: jest.fn(() => Promise.resolve()),
  } as unknown as TerritoryService;

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset mocks to return data
    (mockGhostService.getGhosts as jest.Mock) = jest.fn(() => [mockGhost]);
    (mockGhostService.getRealmBalance as jest.Mock) = jest.fn(() => 1000);
    (mockGhostService.getIsInitialized as jest.Mock) = jest.fn(() => true);
    (mockGhostService.initialize as jest.Mock) = jest.fn(() => Promise.resolve());

    (GhostRunnerService.getInstance as jest.Mock) = jest.fn(() => mockGhostService);
    // Mock TerritoryService to return our mock
    const TerritoryServiceModule = require('@runrealm/shared-core/services/territory-service');
    TerritoryServiceModule.TerritoryService = jest
      .fn()
      .mockImplementation(() => mockTerritoryService);
  });

  it('should not render when visible is false', () => {
    const { queryByText } = render(<GhostManagement visible={false} onClose={jest.fn()} />);

    expect(queryByText('👻 Ghost Runners')).toBeNull();
  });

  it('should render ghost list when visible', async () => {
    const { getByText } = render(<GhostManagement visible={true} onClose={jest.fn()} />);

    await waitFor(() => {
      expect(getByText('Speed Demon')).toBeTruthy();
      expect(getByText('Sprinter • Level 3')).toBeTruthy();
    });
  });

  it('should display realm balance', async () => {
    const { getByText } = render(<GhostManagement visible={true} onClose={jest.fn()} />);

    await waitFor(() => {
      expect(getByText('1000 REALM')).toBeTruthy();
    });
  });

  it('should show empty state when no ghosts', async () => {
    (mockGhostService.getGhosts as jest.Mock) = jest.fn(() => []);

    const { getByText } = render(<GhostManagement visible={true} onClose={jest.fn()} />);

    await waitFor(() => {
      expect(getByText('No ghost runners yet')).toBeTruthy();
    });
  });

  it('should show ghost details when ghost is selected', async () => {
    const { getByText } = render(<GhostManagement visible={true} onClose={jest.fn()} />);

    // Wait for ghost list to load
    await waitFor(() => {
      expect(getByText('Speed Demon')).toBeTruthy();
    });

    // Select ghost
    fireEvent.press(getByText('Speed Demon'));

    // Wait for ghost details to show
    await waitFor(() => {
      expect(getByText('A fast runner from the past')).toBeTruthy();
      expect(getByText('✨ Burst speed')).toBeTruthy();
    });
  });

  it('should deploy ghost to territory', async () => {
    (mockGhostService.deployGhost as jest.Mock) = jest.fn(() => Promise.resolve({}));

    const { getByText } = render(<GhostManagement visible={true} onClose={jest.fn()} />);

    // Wait for ghost list to load
    await waitFor(() => {
      expect(getByText('Speed Demon')).toBeTruthy();
    });

    // Select ghost
    fireEvent.press(getByText('Speed Demon'));

    // Wait for ghost details to show
    await waitFor(() => {
      expect(getByText('Test Territory')).toBeTruthy();
    });

    // Deploy to territory
    fireEvent.press(getByText('Test Territory'));

    // Wait for deployment to complete
    await waitFor(() => {
      expect(mockGhostService.deployGhost).toHaveBeenCalledWith('ghost-1', 'territory-1');
    });

    // Check for success alert
    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith('Success', 'Ghost deployed successfully!');
    });
  });

  it('should upgrade ghost', async () => {
    (mockGhostService.upgradeGhost as jest.Mock) = jest.fn(() => Promise.resolve(mockGhost));

    const { getByText } = render(<GhostManagement visible={true} onClose={jest.fn()} />);

    // Wait for ghost list to load
    await waitFor(() => {
      expect(getByText('Speed Demon')).toBeTruthy();
    });

    // Select ghost
    fireEvent.press(getByText('Speed Demon'));

    // Wait for ghost details and upgrade button
    await waitFor(() => {
      expect(getByText(/Upgrade to Level 4/)).toBeTruthy();
    });

    // Press upgrade button
    fireEvent.press(getByText(/Upgrade to Level 4/));

    // Wait for upgrade to complete
    await waitFor(() => {
      expect(mockGhostService.upgradeGhost).toHaveBeenCalledWith('ghost-1');
    });

    // Check for success alert
    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith('Success', 'Ghost upgraded successfully!');
    });
  });

  it('should show cooldown status', async () => {
    const ghostOnCooldown = {
      ...mockGhost,
      cooldownUntil: new Date(Date.now() + 3600000), // 1 hour from now
    };
    (mockGhostService.getGhosts as jest.Mock) = jest.fn(() => [ghostOnCooldown]);

    const { getByText } = render(<GhostManagement visible={true} onClose={jest.fn()} />);

    await waitFor(() => {
      expect(getByText(/⏰/)).toBeTruthy();
    });
  });

  it('should handle deployment errors', async () => {
    const error = new Error('Insufficient REALM balance');
    (mockGhostService.deployGhost as jest.Mock) = jest.fn(() => Promise.reject(error));

    const { getByText } = render(<GhostManagement visible={true} onClose={jest.fn()} />);

    // Wait for ghost list to load
    await waitFor(() => {
      expect(getByText('Speed Demon')).toBeTruthy();
    });

    // Select ghost
    fireEvent.press(getByText('Speed Demon'));

    // Wait for ghost details to show
    await waitFor(() => {
      expect(getByText('Test Territory')).toBeTruthy();
    });

    // Deploy to territory
    fireEvent.press(getByText('Test Territory'));

    // Wait for error alert
    await waitFor(
      () => {
        expect(Alert.alert).toHaveBeenCalledWith('Deployment Failed', 'Insufficient REALM balance');
      },
      { timeout: 3000 }
    );
  });
});
