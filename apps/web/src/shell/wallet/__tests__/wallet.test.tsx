/**
 * Wallet flow tests.
 *
 * Covers:
 *  - useWallet reflects initial state from the snapshot source
 *  - useWallet updates on wallet:stateChanged
 *  - ConnectButton renders the connect CTA when disconnected
 *  - ConnectButton renders the connected pill when status is 'connected'
 *  - WalletSheet renders the provider list and forwards selection
 *  - WalletSheet dismisses on Esc and on backdrop click
 *  - WalletSheet focuses the first provider on open
 *  - WalletRoot mounts via portal and reacts to wallet:connect events
 */

import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect, useMemo } from 'react';
import { ConnectButton } from '../ConnectButton';
import { type UseWalletResult, useWallet } from '../useWallet';
import { WalletRoot } from '../WalletRoot';
import { WalletSheet } from '../WalletSheet';

class StubEventBus {
  private handlers = new Map<string, Set<(data: unknown) => void>>();
  on(event: string, cb: (data: unknown) => void) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(cb);
  }
  off(event: string, cb: (data: unknown) => void) {
    this.handlers.get(event)?.delete(cb);
  }
  emit(event: string, data: unknown) {
    this.handlers.get(event)?.forEach((cb) => {
      cb(data);
    });
  }
}

function makeWallet(overrides: Partial<UseWalletResult> = {}): UseWalletResult {
  return {
    status: 'disconnected',
    providers: [
      { id: 'metamask', name: 'MetaMask', installed: true, popular: true },
      { id: 'walletconnect', name: 'WalletConnect', installed: true, popular: true },
      {
        id: 'coinbase',
        name: 'Coinbase',
        installed: false,
        popular: false,
        downloadUrl: 'https://example.com',
      },
    ],
    refresh: jest.fn(),
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('useWallet', () => {
  it('returns the initial snapshot', () => {
    let result!: UseWalletResult;
    function Probe({ wallet }: { wallet: UseWalletResult }) {
      result = useWallet({
        eventBus: new StubEventBus() as never,
        listProviders: () => wallet.providers,
        connect: wallet.connect,
        disconnect: wallet.disconnect,
      });
      return null;
    }
    render(<Probe wallet={makeWallet()} />);
    expect(result.status).toBe('disconnected');
    expect(result.providers).toHaveLength(3);
  });

  it('updates status on wallet:stateChanged', async () => {
    const bus = new StubEventBus();
    const seen: string[] = [];
    function Probe() {
      const wallet = useWallet({
        eventBus: bus as never,
        listProviders: () => [{ id: 'metamask', name: 'MetaMask', installed: true, popular: true }],
        connect: jest.fn().mockResolvedValue(undefined),
        disconnect: jest.fn().mockResolvedValue(undefined),
      });
      useEffect(() => {
        seen.push(wallet.status);
      }, [wallet.status]);
      return null;
    }
    render(<Probe />);
    await act(async () => {
      bus.emit('wallet:stateChanged', { status: 'connecting' });
    });
    await act(async () => {
      bus.emit('wallet:stateChanged', {
        status: 'connected',
        wallet: { address: '0xABCD1234EF567890abcd1234ef567890aBcD1234', chainId: 1 },
      });
    });
    expect(seen).toContain('connecting');
    expect(seen).toContain('connected');
  });
});

describe('ConnectButton', () => {
  it('renders the connect CTA when disconnected', () => {
    render(<ConnectButton wallet={makeWallet()} />);
    expect(screen.getByRole('button', { name: /connect/i })).toBeInTheDocument();
  });

  it('renders the connected pill with shortened address when connected', () => {
    const wallet = makeWallet({
      status: 'connected',
      address: '0xABCD1234EF567890abcd1234ef567890aBcD1234',
    });
    render(<ConnectButton wallet={wallet} />);
    expect(screen.getByText('0xABCD…1234')).toBeInTheDocument();
  });

  it('opens the wallet sheet on click', () => {
    render(<ConnectButton wallet={makeWallet()} />);
    fireEvent.click(screen.getByRole('button', { name: /connect/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('forwards provider selection to wallet.connect', async () => {
    const wallet = makeWallet();
    render(<ConnectButton wallet={wallet} />);
    fireEvent.click(screen.getByRole('button', { name: /connect/i }));
    fireEvent.click(screen.getByText('MetaMask'));
    await waitFor(() => {
      expect(wallet.connect).toHaveBeenCalledWith('metamask');
    });
  });
});

describe('WalletSheet', () => {
  it('renders nothing when closed', () => {
    render(<WalletSheet open={false} providers={[]} onSelect={jest.fn()} onClose={jest.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders provider list when open', () => {
    render(
      <WalletSheet
        open
        providers={[
          { id: 'metamask', name: 'MetaMask', installed: true, popular: true },
          { id: 'coinbase', name: 'Coinbase', installed: false, popular: false },
        ]}
        onSelect={jest.fn()}
        onClose={jest.fn()}
      />
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('MetaMask')).toBeInTheDocument();
    expect(screen.getByText('Coinbase')).toBeInTheDocument();
  });

  it('disables not-installed providers and offers an install link', () => {
    render(
      <WalletSheet
        open
        providers={[
          {
            id: 'coinbase',
            name: 'Coinbase',
            installed: false,
            popular: false,
            downloadUrl: 'https://example.com/dl',
          },
        ]}
        onSelect={jest.fn()}
        onClose={jest.fn()}
      />
    );
    const btn = screen.getByText('Coinbase').closest('button');
    expect(btn).toBeDisabled();
    expect(screen.getByText('Install ↗')).toHaveAttribute('href', 'https://example.com/dl');
  });

  it('calls onClose on Esc', () => {
    const onClose = jest.fn();
    render(
      <WalletSheet
        open
        providers={[{ id: 'a', name: 'A', installed: true, popular: false }]}
        onSelect={jest.fn()}
        onClose={onClose}
      />
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose on backdrop click', () => {
    const onClose = jest.fn();
    render(
      <WalletSheet
        open
        providers={[{ id: 'a', name: 'A', installed: true, popular: false }]}
        onSelect={jest.fn()}
        onClose={onClose}
      />
    );
    const backdrop = document.querySelector('.rr-sheet-backdrop')!;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });
});

describe('WalletRoot', () => {
  it('opens the sheet when wallet:connect fires without a provider', () => {
    const bus = new StubEventBus();
    render(<WalletRoot wallet={makeWallet()} eventBus={bus as never} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    act(() => {
      bus.emit('wallet:connect', {});
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('forwards wallet:connect with a provider to the wallet.connect call', async () => {
    const bus = new StubEventBus();
    const wallet = makeWallet();
    render(<WalletRoot wallet={wallet} eventBus={bus as never} />);
    await act(async () => {
      bus.emit('wallet:connect', { provider: 'walletconnect' });
    });
    expect(wallet.connect).toHaveBeenCalledWith('walletconnect');
  });
});
