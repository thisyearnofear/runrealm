module.exports = {
  testEnvironment: 'node',
  // ts-jest in isolatedModules mode skips full type-checking, so
  // pre-existing errors in components/enhanced-run-controls.ts etc.
  // don't break tests that transitively import the app tree. Type
  // safety is still enforced by `tsc --noEmit` at the build level.
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { isolatedModules: true }],
    '^.+\\.m?js$': ['ts-jest', { isolatedModules: true }],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(h3-js|@turf|rbush|quickselect|concaveman|tinyqueue)/)',
  ],
  moduleNameMapper: {
    '^@runrealm/shared-blockchain/(.*)$':
      '<rootDir>/../../node_modules/@runrealm/shared-blockchain/$1',
    '^@runrealm/shared-core/(.*)$': '<rootDir>/$1',
  },
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
};
