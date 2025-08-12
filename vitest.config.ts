import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      include: ['app/**/*.ts'],
      exclude: ['app/**/*.d.ts', 'app/index.ts'],
      reporter: ['text', 'lcov', 'html'],
    },
    setupFiles: ['tests/setup.ts'],
    testTimeout: 10000,
    typecheck: {
      tsconfig: 'tsconfig.json'
    }
  },
  resolve: {
    alias: {
      '@': new URL('./app', import.meta.url).pathname,
    },
  },
});