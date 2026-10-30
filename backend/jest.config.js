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
    '!src/seed-production.ts',
    '!src/seed/**',
    '!src/**/*.spec.ts',
    '!src/**/*.module.ts',
    '!src/**/*.dto.ts',
    '!src/**/dto/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text-summary', 'lcov', 'json-summary', 'html'],
  // Criterio de aceptación del SRS §8.2: cobertura mínima del 80 % en los endpoints críticos.
  // Si baja de estos umbrales, `npm run test:cov` falla y con él el pipeline de CI.
  coverageThreshold: {
    global: { statements: 80, branches: 70, functions: 80, lines: 80 },
    './src/auth/': { statements: 85, lines: 85, functions: 80 },
    './src/audit/': { statements: 85, lines: 85, functions: 80 },
    './src/crypto/': { statements: 90, lines: 90, functions: 90 },
    './src/billing/': { statements: 80, lines: 80, functions: 75 },
    './src/clinical/': { statements: 80, lines: 80, functions: 75 },
    './src/patients/': { statements: 85, lines: 85, functions: 80 },
    './src/agenda/': { statements: 80, lines: 80, functions: 75 },
  },
};
