/** @type {import('ts-jest').JestConfigWithTsJest} */
// Los tipos se verifican aparte con `tsc --noEmit` (npm run typecheck); aquí se prioriza la velocidad.
const transform = {
  '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.jest.json', diagnostics: false }],
};

module.exports = {
  projects: [
    {
      displayName: 'unit',
      rootDir: '.',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/src/**/*.spec.ts'],
      setupFiles: ['<rootDir>/test/setup-env.ts'],
      transform,
    },
    {
      displayName: 'e2e',
      rootDir: '.',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/test/**/*.e2e-spec.ts'],
      globalSetup: '<rootDir>/test/global-setup.ts',
      setupFiles: ['<rootDir>/test/setup-env.ts'],
      transform,
    },
  ],
  testTimeout: 30000,
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/main.ts',
    '!src/seed.ts',
    '!src/**/*.spec.ts',
    '!src/**/*.module.ts',
    '!src/**/*.dto.ts',
    '!src/**/dto/**',
  ],
  coverageDirectory: 'coverage',
  // Criterio de aceptación del SRS §8.2: cobertura mínima del 80 %
  coverageThreshold: {
    global: { statements: 80, branches: 70, functions: 80, lines: 80 },
  },
};
