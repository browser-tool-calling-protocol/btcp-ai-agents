import { defineConfig, mergeConfig } from 'vitest/config';
import { baseConfig } from './vitest.config.base';

/**
 * Integration Tests Configuration
 *
 * Tests multiple modules working together with mocked external APIs.
 * These tests may take longer but don't require real API keys.
 *
 * Run with: pnpm test:integration
 */
export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      include: [
        // Context management (multiple modules)
        'src/context/context.test.ts',
        'src/context/context-extended.test.ts',

        // HTTP layer (handlers with mocked consumption)
        'src/http/streaming.test.ts',
        'src/http/handler.test.ts',

        // Engine (delegation logic - mocked)
        'src/engine/delegation.test.ts',

        // Planning subsystem
        'src/planning/__tests__/orchestration.test.ts',
        'src/planning/__tests__/isolated-delegation.test.ts',
        'src/planning/__tests__/infographic-strategy.test.ts',
        'src/planning/__tests__/decision-engine.test.ts',
        'src/planning/__tests__/structured-plan.test.ts',

        // System integration (full stack with mocks)
        'src/__tests__/integration/integration.test.ts',
        'src/__tests__/integration/mcp-integration.test.ts',

        // Benchmarking metrics (no real API calls)
        'src/benchmarks/__tests__/efficiency-metrics.test.ts',
      ],
      exclude: ['node_modules/', 'dist/'],
      testTimeout: 15000, // Integration tests may take longer
    },
  }),
);
