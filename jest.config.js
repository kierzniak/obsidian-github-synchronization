module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  clearMocks: true,
  moduleNameMapper: { '^obsidian$': '<rootDir>/tests/helpers/obsidian.ts' },
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: { module: 'CommonJS' } }] },
};
