/**
 * React shell smoke tests.
 *
 * Deliberately narrow — the goal is to confirm the components mount,
 * render their text, and respond to callbacks. The actual map
 * lifecycle and service wiring is exercised by the e2e/manual flow;
 * unit-testing it here would mean re-mocking MapLibre, which is what
 * we just removed.
 */
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { BottomSheet } from '../../components/BottomSheet';
import { GameHUD } from '../../components/GameHUD';
import type { InspectorTerritory } from '../../components/Inspector';
import { Inspector } from '../../components/Inspector';

describe('React shell', () => {
  describe('GameHUD', () => {
    it('formats distance in km and time as m:ss', () => {
      render(
        <GameHUD
          stats={{
            distanceMeters: 4523,
            durationMs: 1687000,
            paceSecondsPerKm: 6 * 60 + 14,
            currentSpeedMps: 2.7,
            isRecording: true,
          }}
        />
      );
      expect(screen.getByText('4.52 km')).toBeInTheDocument();
      expect(screen.getByText('28:07')).toBeInTheDocument();
      expect(screen.getByText('6:14/km')).toBeInTheDocument();
    });

    it('shows territory count and token balance pills when provided', () => {
      render(
        <GameHUD
          stats={{
            distanceMeters: 0,
            durationMs: 0,
            paceSecondsPerKm: 0,
            currentSpeedMps: 0,
            isRecording: false,
          }}
          territoryCount={3}
          tokenBalance="42.0"
        />
      );
      expect(screen.getByText('3')).toBeInTheDocument();
      expect(screen.getByText('42.0')).toBeInTheDocument();
    });
  });

  describe('BottomSheet', () => {
    it('cycles state on handle click', () => {
      const onStateChange = jest.fn();
      render(
        <BottomSheet initial="collapsed" header={<span>Hdr</span>} onStateChange={onStateChange}>
          body
        </BottomSheet>
      );
      const handle = screen.getByRole('button', { name: /resize/i });
      fireEvent.click(handle);
      fireEvent.click(handle);
      const calls = onStateChange.mock.calls.map((c) => c[0]);
      expect(calls).toContain('half');
    });
  });

  describe('Inspector', () => {
    it('renders empty state when nothing is selected', () => {
      render(<Inspector selected={null} />);
      expect(screen.getByText(/Tap a territory/i)).toBeInTheDocument();
    });

    it('renders territory details and fires onClaim', () => {
      const territory: InspectorTerritory = {
        id: 't1',
        name: 'Block Party',
        rarity: 'rare',
        difficulty: 47,
        estimatedReward: 12,
        isClaimable: true,
        h3Index: '892a100d67bffff',
      };
      const onClaim = jest.fn();
      render(<Inspector selected={territory} onClaim={onClaim} />);
      expect(screen.getByText('Block Party')).toBeInTheDocument();
      expect(screen.getByText('892a100d67bffff')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /claim territory/i }));
      expect(onClaim).toHaveBeenCalledWith('t1');
    });
  });
});
