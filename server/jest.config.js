/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests/api', '<rootDir>/tests/lib'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json' }],
  },
  globalSetup: '<rootDir>/tests/helpers/globalSetup.ts',
  globalTeardown: '<rootDir>/tests/helpers/globalTeardown.ts',
  setupFilesAfterEnv: ['<rootDir>/tests/helpers/setup.ts'],
  collectCoverageFrom: ['src/**/*.ts', '!src/server.ts'],
  coverageDirectory: 'coverage',
  testTimeout: 30000,
  // All suites share one database; run them sequentially.
  maxWorkers: 1,
};
