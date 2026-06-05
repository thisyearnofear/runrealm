// Mock AsyncStorage globally. Provides both a `default` export (for
// `import AsyncStorage from '...'`) and named exports (for `import * as AS`)
// so tests can use either style. The official async-storage-mock is
// intentionally NOT used because it exports a flat object with no `default`
// property, which breaks the `import AsyncStorage from '...'` interop.
jest.mock('@react-native-async-storage/async-storage', () => {
  const mock = {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn(),
    getAllKeys: jest.fn(async () => []),
    multiGet: jest.fn(async () => []),
    multiSet: jest.fn(async () => undefined),
    multiRemove: jest.fn(async () => undefined),
  };
  return { __esModule: true, default: mock, ...mock };
});

// Mock @turf/turf to avoid ESM transformation issues
jest.mock('@turf/turf', () => ({
  __esModule: true,
  default: {},
  convex: jest.fn(),
  distance: jest.fn(() => 1000),
  point: jest.fn((coords) => ({ type: 'Point', coordinates: coords })),
  lineString: jest.fn((coords) => ({ type: 'LineString', coordinates: coords })),
}));

// Mock expo-location (ESM build crashes jest without transform). The mobile
// tracking service tests only exercise the state machine and history APIs;
// they don't need real GPS.
jest.mock('expo-location', () => ({
  Accuracy: {
    BestForNavigation: 6,
    High: 5,
    Balanced: 4,
  },
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestBackgroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getCurrentPositionAsync: jest.fn(async () => ({
    coords: { latitude: 0, longitude: 0, accuracy: 5 },
    timestamp: Date.now(),
  })),
  watchPositionAsync: jest.fn(async () => ({ remove: jest.fn() })),
  startLocationUpdatesAsync: jest.fn(async () => undefined),
  stopLocationUpdatesAsync: jest.fn(async () => undefined),
  hasStartedLocationUpdatesAsync: jest.fn(async () => false),
}));

// Mock expo-task-manager — same reason as expo-location.
jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn(),
  isTaskRegisteredAsync: jest.fn(async () => false),
}));

// Mock expo-keep-awake — wake-lock side effects are not under test.
jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: jest.fn(async () => undefined),
  deactivateKeepAwake: jest.fn(),
}));

// Suppress console errors in tests (optional)
global.console = {
  ...console,
  error: jest.fn(),
  warn: jest.fn(),
};
