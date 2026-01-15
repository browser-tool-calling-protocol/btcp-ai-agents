import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import { config } from 'dotenv';

// Set PROMPT_VERSION=v1 for benchmark tests with XML reasoning tags
// Must be set before any module imports
process.env.PROMPT_VERSION = 'v1';

// Load .env file for API keys
config({ path: resolve(__dirname, '.env') });

/**
 * Base Vitest configuration shared across all test types.
 *
 * Test Categories:
 * - Unit: Fast, isolated, no external dependencies (vitest.config.unit.ts)
 * - Integration: Multiple modules, mocked externals (vitest.config.integration.ts)
 * - Live: Real API calls, requires API keys (vitest.config.live.ts)
 */
export const baseConfig = {
  resolve: {
    alias: {
      '@waiboard/canvas-driver': resolve(__dirname, '../canvas-driver/src'),
      '@waiboard/canvas-core': resolve(__dirname, '../canvas-core/src'),
      '@waiboard/db': resolve(__dirname, '../db/src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8' as const,
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.test.ts',
        '**/__tests__/**',
        '**/types.ts',
        '**/demo.ts',
      ],
    },
  },
};

export default defineConfig(baseConfig);
