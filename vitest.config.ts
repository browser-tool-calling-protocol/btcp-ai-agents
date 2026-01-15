import { defineConfig, mergeConfig } from 'vitest/config';
import { baseConfig } from './vitest.config.base';

/**
 * Default Vitest Configuration
 *
 * Runs ALL tests (unit + integration + live).
 * For faster feedback, use specific configs:
 * - pnpm test:unit        - Fast unit tests only
 * - pnpm test:integration - Integration tests with mocked APIs
 * - pnpm test:live        - Live API tests (requires API keys)
 */
export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      include: ['src/**/*.test.ts'],
      exclude: ['node_modules/', 'dist/'],
      testTimeout: 10000,
    },
  }),
);
