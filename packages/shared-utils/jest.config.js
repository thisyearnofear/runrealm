module.exports = {
  testEnvironment: 'node',
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
    '^@runrealm/shared-core/(.*)$': '<rootDir>/../shared-core/$1',
  },
  testMatch: ['**/*.spec.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
};
