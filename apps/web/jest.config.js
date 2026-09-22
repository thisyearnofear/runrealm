/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.json',
        isolatedModules: true,
      },
    ],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // Workspace packages ship ESM dist output that Jest cannot parse;
    // map to TypeScript sources so ts-jest transforms them instead.
    '^@runrealm/shared-core/(.*)$': '<rootDir>/../../packages/shared-core/$1',
    '^@runrealm/shared-blockchain/(.*)$': '<rootDir>/../../packages/shared-blockchain/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
};
