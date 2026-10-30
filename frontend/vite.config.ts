import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// En desarrollo, Vite hace de proxy hacia el backend (mismo origen que en producción con Nginx).
const backend = 'http://localhost:3000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': backend,
      '/ws': { target: backend, ws: true },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    css: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/main.tsx', 'src/test/**', 'src/**/*.test.{ts,tsx}', 'src/vite-env.d.ts'],
      reporter: ['text-summary', 'lcov', 'json-summary', 'html'],
      // Evita regresiones. El 80 % del SRS §8.2 aplica a los endpoints críticos del backend.
      thresholds: { statements: 30, lines: 30, functions: 25, branches: 30 },
    },
  },
});
