/**
 * Unit tests for useConfidentialShield
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { useConfidentialShield } from '../../components/useConfidentialShield';

const createOptions = (overrides = {}) => ({
  eventBus: { on: jest.fn(), off: jest.fn(), emit: jest.fn() } as unknown as Parameters<
    typeof useConfidentialShield
  >[0]['eventBus'],
  isSupportedChain: jest.fn(() => false),
  switchNetwork: jest.fn(),
  getDefenseMetadata: jest.fn(() => Promise.resolve(null)),
  myDefenseCipher: jest.fn(() => Promise.resolve(null)),
  publicDecryptOutcome: jest.fn(() => Promise.resolve(null)),
  boostEncrypted: jest.fn(() => Promise.resolve(null)),
  contestEncrypted: jest.fn(() => Promise.resolve(null)),
  ...overrides,
});

describe('useConfidentialShield', () => {
  it('starts unsupported when the chain is not supported', () => {
    const { result } = renderHook(() => useConfidentialShield(createOptions()));
    expect(result.current.status).toBe('unsupported');
  });

  it('switchToSepolia calls switchNetwork with Sepolia chain id', async () => {
    const options = createOptions();
    const { result } = renderHook(() => useConfidentialShield(options));

    await act(async () => {
      await result.current.switchToSepolia();
    });

    expect(options.switchNetwork).toHaveBeenCalledWith(11155111);
  });

  it('reports an error when switchNetwork fails', async () => {
    const options = createOptions({
      switchNetwork: jest.fn(() => Promise.reject(new Error('User rejected'))),
    });
    const { result } = renderHook(() => useConfidentialShield(options));

    await act(async () => {
      await result.current.switchToSepolia();
    });

    expect(result.current.error).toContain('User rejected');
  });
});
