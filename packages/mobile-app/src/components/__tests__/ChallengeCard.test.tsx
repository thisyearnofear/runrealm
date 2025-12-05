/**
 * Unit tests for ChallengeCard component
 */

import { Challenge, ProgressionService } from '@runrealm/shared-core/services/progression-service';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';
import { ChallengeCard } from '../ChallengeCard';

jest.mock('@runrealm/shared-core/services/progression-service');
jest.mock('react-native/Libraries/Alert/Alert', () => ({
  alert: jest.fn(),
}));

describe('ChallengeCard', () => {
  const mockChallenge: Challenge = {
    id: 'test-challenge-1',
    type: 'daily',
    title: 'Daily Distance',
    description: 'Run 3km today',
    icon: '🏃',
    goal: {
      type: 'distance',
      target: 3000,
      current: 1500,
      unit: 'm',
    },
    reward: {
      type: 'xp',
      amount: 100,
    },
    expiresAt: Date.now() + 86400000, // 24 hours from now
    completed: false,
    claimed: false,
  };

  const mockProgressionService = {
    claimChallengeReward: jest.fn(),
  } as unknown as ProgressionService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render challenge information', () => {
    const { getByText } = render(
      <ChallengeCard challenge={mockChallenge} progressionService={mockProgressionService} />
    );

    expect(getByText('Daily Distance')).toBeTruthy();
    expect(getByText('Run 3km today')).toBeTruthy();
    expect(getByText('100 XP')).toBeTruthy();
  });

  it('should display progress correctly', () => {
    const { getByText } = render(
      <ChallengeCard challenge={mockChallenge} progressionService={mockProgressionService} />
    );

    // The component formats meters as "m" not "km" when unit is 'm'
    expect(getByText(/1500 m \/ 3000 m/)).toBeTruthy();
    expect(getByText('50%')).toBeTruthy();
  });

  it('should show claim button when challenge is completed', () => {
    const completedChallenge = { ...mockChallenge, completed: true };
    const { getByText } = render(
      <ChallengeCard challenge={completedChallenge} progressionService={mockProgressionService} />
    );

    expect(getByText('Claim Reward')).toBeTruthy();
  });

  it('should not show claim button when challenge is claimed', () => {
    const claimedChallenge = { ...mockChallenge, completed: true, claimed: true };
    const { queryByText, getByText } = render(
      <ChallengeCard challenge={claimedChallenge} progressionService={mockProgressionService} />
    );

    expect(queryByText('Claim Reward')).toBeNull();
    expect(getByText('✓ Claimed')).toBeTruthy();
  });

  it('should call claimChallengeReward when claim button is pressed', async () => {
    const completedChallenge = { ...mockChallenge, completed: true };
    (mockProgressionService.claimChallengeReward as jest.Mock).mockResolvedValue(undefined);

    const { getByText } = render(
      <ChallengeCard
        challenge={completedChallenge}
        progressionService={mockProgressionService}
        onClaimed={jest.fn()}
      />
    );

    const claimButton = getByText('Claim Reward');
    fireEvent.press(claimButton);

    await waitFor(() => {
      expect(mockProgressionService.claimChallengeReward).toHaveBeenCalledWith('test-challenge-1');
    });
  });

  it('should show success alert after successful claim', async () => {
    const completedChallenge = { ...mockChallenge, completed: true };
    (mockProgressionService.claimChallengeReward as jest.Mock).mockResolvedValue(undefined);

    const { getByText } = render(
      <ChallengeCard challenge={completedChallenge} progressionService={mockProgressionService} />
    );

    fireEvent.press(getByText('Claim Reward'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith('Success', 'Reward claimed: 100 XP');
    });
  });

  it('should show error alert on claim failure', async () => {
    const completedChallenge = { ...mockChallenge, completed: true };
    const error = new Error('Insufficient balance');
    (mockProgressionService.claimChallengeReward as jest.Mock).mockRejectedValue(error);

    const { getByText } = render(
      <ChallengeCard challenge={completedChallenge} progressionService={mockProgressionService} />
    );

    fireEvent.press(getByText('Claim Reward'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith('Error', 'Insufficient balance');
    });
  });

  it('should display time remaining correctly', () => {
    const { getByText } = render(
      <ChallengeCard challenge={mockChallenge} progressionService={mockProgressionService} />
    );

    // Should show hours remaining (allow for slight timing differences)
    expect(getByText(/23h|24h/)).toBeTruthy();
  });

  it('should format distance values correctly', () => {
    const { getByText } = render(
      <ChallengeCard challenge={mockChallenge} progressionService={mockProgressionService} />
    );

    // When unit is 'm', values are formatted as meters, not kilometers
    expect(getByText(/1500 m/)).toBeTruthy();
    expect(getByText(/3000 m/)).toBeTruthy();
  });
});
