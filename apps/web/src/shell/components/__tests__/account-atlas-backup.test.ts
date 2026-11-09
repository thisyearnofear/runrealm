import { EventBus } from '@runrealm/shared-core/core/event-bus';
import { AccountService } from '@runrealm/shared-core/services/account-service';
import { NavigationService } from '@runrealm/shared-core/services/navigation-service';
import { NeighbourhoodService } from '@runrealm/shared-core/services/neighbourhood-service';
import { PreferenceService } from '@runrealm/shared-core/services/preference-service';
import type { RunSession } from '@runrealm/shared-core/services/run-tracking-service';
import { ATLAS_STORAGE_KEY } from '@runrealm/shared-core/types/neighbourhood';
import { H3_RESOLUTION } from '@runrealm/shared-core/utils/h3-territory';
import type { KeyValueStore } from '@runrealm/shared-core/utils/key-value-store';
import { cellToLatLng, gridDisk, latLngToCell } from 'h3-js';
import AccountScreen from '../account-screen';

jest.mock('@runrealm/shared-core/services/account-service', () => ({
  AccountService: { getInstance: jest.fn() },
  DEFAULT_GAME_SCOPES: ['claim', 'boost', 'deployGhost'],
}));
jest.mock('@runrealm/shared-core/services/preference-service', () => ({
  PreferenceService: jest.fn(),
}));

const HOME = { lat: 32.7765, lng: -79.9311 };
const HOME_CELL = latLngToCell(HOME.lat, HOME.lng, H3_RESOLUTION);
const RING = gridDisk(HOME_CELL, 2);

function memoryStore(seed?: Record<string, string>) {
  const data: Record<string, string> = { ...(seed ?? {}) };
  return {
    data,
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
    removeItem: (k: string) => {
      delete data[k];
    },
  };
}

function makeRun(id: string): RunSession {
  const pts = RING.slice(0, 3).map((id) => {
    const [lat, lng] = cellToLatLng(id);
    return { lat, lng, timestamp: 0, accuracy: 10 };
  });
  return {
    id,
    startTime: 0,
    endTime: 300_000,
    points: pts,
    segments: [],
    laps: [],
    totalDistance: 800,
    totalDuration: 300_000,
    averageSpeed: 2,
    maxSpeed: 3,
    status: 'completed',
    territoryEligible: false,
    neighbourhoodGoal: 'explore',
  } as RunSession;
}

async function populatedService(store: KeyValueStore) {
  const svc = new NeighbourhoodService({ getCurrentRun: () => null }, store);
  await svc.initialize();
  svc.processRun(makeRun('r1'));
  svc.processRun(makeRun('r2'));
  return svc;
}

function pickFile(input: HTMLInputElement, name: string, text: string) {
  const file = new File([text], name, { type: 'application/json' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('AccountScreen atlas backup', () => {
  beforeEach(() => {
    EventBus.getInstance().clear();
    document.body.replaceChildren();
    (PreferenceService as jest.Mock).mockImplementation(() => ({
      getPublicTerritoryIds: () => [],
    }));
    (AccountService.getInstance as jest.Mock).mockReturnValue({
      getAccount: () => ({ id: 'a-1', tier: 'guest', createdAt: 0 }),
      getActiveSessionKeys: () => [],
    });
    const nav = NavigationService.getInstance();
    nav.registerRoutes([{ id: 'map', path: '/', title: 'Map' }]);
    nav.navigateTo('map');
  });

  it('previews a chosen backup, requires acknowledgement, then restores', async () => {
    const src = await populatedService(memoryStore());
    const backupText = src.exportAtlasBackup();
    const svc = new NeighbourhoodService({ getCurrentRun: () => null }, memoryStore());
    await svc.initialize();
    const screen = new AccountScreen(svc);
    screen.initialize(document.body);
    screen.show();
    const input = document.querySelector('.atlas-backup-file') as HTMLInputElement;
    pickFile(input, 'atlas.json', backupText);
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    const preview = document.querySelector('.atlas-backup-preview');
    expect(preview?.textContent).toContain('3 collected blocks');
    const confirm = document.querySelector(
      '[data-account-action="atlas-confirm"]'
    ) as HTMLButtonElement;
    confirm.click();
    expect(svc.getState().collectedCount).toBe(0);
    const ack = document.querySelector('.atlas-backup-ack') as HTMLInputElement;
    ack.checked = true;
    ack.dispatchEvent(new Event('change', { bubbles: true }));
    (document.querySelector('[data-account-action="atlas-confirm"]') as HTMLButtonElement).click();
    expect(svc.getState().collectedCount).toBe(3);
    expect(document.querySelector('.account-card')?.textContent).toContain('Atlas restored');
  });

  it('cancel leaves store and memory untouched', async () => {
    const src = await populatedService(memoryStore());
    const backupText = src.exportAtlasBackup();
    const svc = new NeighbourhoodService({ getCurrentRun: () => null }, memoryStore());
    await svc.initialize();
    const screen = new AccountScreen(svc);
    screen.initialize(document.body);
    screen.show();
    pickFile(
      document.querySelector('.atlas-backup-file') as HTMLInputElement,
      'a.json',
      backupText
    );
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    (document.querySelector('[data-account-action="atlas-cancel"]') as HTMLButtonElement).click();
    expect(svc.getState().collectedCount).toBe(0);
  });

  it('shows a typed error for an invalid file and writes nothing', async () => {
    const svc = new NeighbourhoodService({ getCurrentRun: () => null }, memoryStore());
    await svc.initialize();
    const screen = new AccountScreen(svc);
    screen.initialize(document.body);
    screen.show();
    pickFile(document.querySelector('.atlas-backup-file') as HTMLInputElement, 'bad.json', '{oops');
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(document.querySelector('.atlas-backup-preview')).toBeNull();
    const alert = document.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('not a valid');
    expect(document.activeElement).toBe(alert);
    expect(svc.getState().collectedCount).toBe(0);
  });

  it('does not render the card without a service dep', () => {
    const screen = new AccountScreen();
    screen.initialize(document.body);
    screen.show();
    expect(document.querySelector('.atlas-backup-card')).toBeNull();
  });

  it('hide clears a pending acknowledged preview and confirm does nothing on reopen', async () => {
    const src = await populatedService(memoryStore());
    const svc = new NeighbourhoodService({ getCurrentRun: () => null }, memoryStore());
    await svc.initialize();
    const screen = new AccountScreen(svc);
    screen.initialize(document.body);
    screen.show();
    pickFile(
      document.querySelector('.atlas-backup-file') as HTMLInputElement,
      'a.json',
      src.exportAtlasBackup()
    );
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    const ack = document.querySelector('.atlas-backup-ack') as HTMLInputElement;
    ack.checked = true;
    ack.dispatchEvent(new Event('change', { bubbles: true }));
    screen.hide();
    screen.show();
    expect(document.querySelector('.atlas-backup-preview')).toBeNull();
    expect(document.querySelector('[data-account-action="atlas-confirm"]')).toBeNull();
    svc.cancelAtlasRestore();
    expect(svc.getState().collectedCount).toBe(0);
  });

  it('ignores a delayed FileReader result after a newer file was chosen', async () => {
    const src = await populatedService(memoryStore());
    const valid = src.exportAtlasBackup();
    const svc = new NeighbourhoodService({ getCurrentRun: () => null }, memoryStore());
    await svc.initialize();
    const readers: Array<{ fire: (text: string) => void }> = [];
    const RealReader = global.FileReader;
    class StubReader {
      result: string | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      readAsText() {
        readers.push({
          fire: (text: string) => {
            this.result = text;
            this.onload?.();
          },
        });
      }
    }
    (global as unknown as { FileReader: unknown }).FileReader = StubReader;
    try {
      const screen = new AccountScreen(svc);
      screen.initialize(document.body);
      screen.show();
      pickFile(document.querySelector('.atlas-backup-file') as HTMLInputElement, 'old.json', valid);
      pickFile(document.querySelector('.atlas-backup-file') as HTMLInputElement, 'new.json', valid);
      expect(readers).toHaveLength(2);
      readers[0].fire(valid);
      await Promise.resolve();
      await Promise.resolve();
      expect(document.querySelector('.atlas-backup-preview')).toBeNull();
      readers[1].fire(valid);
      await Promise.resolve();
      await Promise.resolve();
      expect(document.querySelector('.atlas-backup-preview')).not.toBeNull();
    } finally {
      (global as unknown as { FileReader: unknown }).FileReader = RealReader;
    }
  });

  it('an oversized file never starts the reader', () => {
    const svc = new NeighbourhoodService({ getCurrentRun: () => null }, memoryStore());
    return svc.initialize().then(async () => {
      let read = false;
      const RealReader = global.FileReader;
      class SpyReader extends RealReader {
        readAsText() {
          read = true;
        }
      }
      (global as unknown as { FileReader: unknown }).FileReader = SpyReader;
      try {
        const screen = new AccountScreen(svc);
        screen.initialize(document.body);
        screen.show();
        const big = new File([new ArrayBuffer(2 * 1024 * 1024 + 1)], 'big.json');
        const input = document.querySelector('.atlas-backup-file') as HTMLInputElement;
        Object.defineProperty(input, 'files', { value: [big], configurable: true });
        input.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise((r) => setTimeout(r, 0));
        expect(read).toBe(false);
        expect(document.querySelector('[role="alert"]')?.textContent).toContain('too large');
      } finally {
        (global as unknown as { FileReader: unknown }).FileReader = RealReader;
      }
    });
  });

  it('a failed confirm shows an alert and a second click cannot double-write', async () => {
    const src = await populatedService(memoryStore());
    const store = memoryStore();
    const svc = new NeighbourhoodService({ getCurrentRun: () => null }, store);
    await svc.initialize();
    const screen = new AccountScreen(svc);
    screen.initialize(document.body);
    screen.show();
    pickFile(
      document.querySelector('.atlas-backup-file') as HTMLInputElement,
      'a.json',
      src.exportAtlasBackup()
    );
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    store.setItem(ATLAS_STORAGE_KEY, '{"tampered":1}');
    const ack = document.querySelector('.atlas-backup-ack') as HTMLInputElement;
    ack.checked = true;
    ack.dispatchEvent(new Event('change', { bubbles: true }));
    (document.querySelector('[data-account-action="atlas-confirm"]') as HTMLButtonElement).click();
    expect(document.activeElement).toBe(document.querySelector('[role="alert"]'));
    expect(document.querySelector('[role="alert"]')?.textContent).toBeTruthy();
    expect(document.querySelector('.atlas-backup-card')?.textContent).not.toContain(
      'Atlas restored'
    );
    expect(svc.getState().collectedCount).toBe(0);
  });

  it('export downloads canonical JSON free of unrelated stored secrets', async () => {
    jest.useFakeTimers();
    const created: Blob[] = [];
    const revoked: string[] = [];
    const realCreate = URL.createObjectURL;
    const realRevoke = URL.revokeObjectURL;
    URL.createObjectURL = ((b: Blob) => {
      created.push(b);
      return 'blob:mock';
    }) as never;
    URL.revokeObjectURL = ((u: string) => {
      revoked.push(u);
    }) as never;
    const clickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    try {
      const storage = memoryStore({ runrealm_wallet_private_key: 'SYNTHETIC_SECRET' });
      const svc = new NeighbourhoodService({ getCurrentRun: () => null }, storage);
      await svc.initialize();
      svc.processRun(makeRun('mine'));
      const screen = new AccountScreen(svc);
      screen.initialize(document.body);
      screen.show();
      (document.querySelector('[data-account-action="atlas-export"]') as HTMLButtonElement).click();
      expect(created).toHaveLength(1);
      const text = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('read'));
        reader.readAsText(created[0]);
      });
      const parsed = JSON.parse(text);
      expect(parsed.format).toBe('runrealm-atlas-backup');
      expect(parsed.version).toBe(2);
      expect(text).not.toContain('runrealm_wallet_private_key');
      expect(text).not.toContain('SYNTHETIC_SECRET');
      expect(storage.data.runrealm_wallet_private_key).toBe('SYNTHETIC_SECRET');
      expect(Object.keys(parsed.atlas).sort()).toEqual(['pages', 'version', 'viewAnchor']);
      expect(parsed.atlas.pages).toHaveLength(1);
      jest.runAllTimers();
      expect(revoked).toEqual(['blob:mock']);
    } finally {
      clickSpy.mockRestore();
      URL.createObjectURL = realCreate;
      URL.revokeObjectURL = realRevoke;
      jest.useRealTimers();
    }
  });

  it('ignores a delayed FileReader result after hide and reopen', async () => {
    const src = await populatedService(memoryStore());
    const valid = src.exportAtlasBackup();
    const svc = new NeighbourhoodService({ getCurrentRun: () => null }, memoryStore());
    await svc.initialize();
    const readers: Array<{ fire: (text: string) => void }> = [];
    const RealReader = global.FileReader;
    class StubReader {
      result: string | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      readAsText() {
        readers.push({
          fire: (text: string) => {
            this.result = text;
            this.onload?.();
          },
        });
      }
    }
    (global as unknown as { FileReader: unknown }).FileReader = StubReader;
    try {
      const screen = new AccountScreen(svc);
      screen.initialize(document.body);
      screen.show();
      pickFile(document.querySelector('.atlas-backup-file') as HTMLInputElement, 'a.json', valid);
      expect(readers).toHaveLength(1);
      screen.hide();
      screen.show();
      readers[0].fire(valid);
      await Promise.resolve();
      await Promise.resolve();
      expect(document.querySelector('.atlas-backup-preview')).toBeNull();
      expect(document.querySelector('[data-account-action="atlas-confirm"]')).toBeNull();
      expect(svc.getState().collectedCount).toBe(0);
    } finally {
      (global as unknown as { FileReader: unknown }).FileReader = RealReader;
    }
  });

  it('a successful restore writes once; a repeated confirm cannot write again', async () => {
    const src = await populatedService(memoryStore());
    const inner = memoryStore();
    const writes: string[] = [];
    const store = {
      getItem: (k: string) => inner.getItem(k),
      setItem: (k: string, v: string) => {
        writes.push(k);
        inner.setItem(k, v);
      },
      removeItem: (k: string) => inner.removeItem(k),
      data: inner.data,
    };
    const svc = new NeighbourhoodService({ getCurrentRun: () => null }, store);
    await svc.initialize();
    const screen = new AccountScreen(svc);
    screen.initialize(document.body);
    screen.show();
    pickFile(
      document.querySelector('.atlas-backup-file') as HTMLInputElement,
      'a.json',
      src.exportAtlasBackup()
    );
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    const ack = document.querySelector('.atlas-backup-ack') as HTMLInputElement;
    ack.checked = true;
    ack.dispatchEvent(new Event('change', { bubbles: true }));
    (document.querySelector('[data-account-action="atlas-confirm"]') as HTMLButtonElement).click();
    expect(svc.getState().collectedCount).toBe(3);
    expect(writes).toHaveLength(1);
    const repeated = document.createElement('button');
    repeated.dataset.accountAction = 'atlas-confirm';
    document.querySelector('#account-screen')?.appendChild(repeated);
    repeated.click();
    expect(writes).toHaveLength(1);
    expect(() => svc.confirmAtlasRestore()).toThrow('no-preview');
    expect(writes).toHaveLength(1);
  });
});
