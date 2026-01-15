import { defineConfig, mergeConfig } from 'vitest/config';
import { baseConfig } from './vitest.config.base';

/**
 * Live/E2E Tests Configuration
 *
 * Tests that make real API calls to LLM providers.
 * Requires environment variables: GOOGLE_API_KEY, OPENAI_API_KEY, etc.
 *
 * Run with: pnpm test:live
 *
 * Environment variables:
 * - GOOGLE_API_KEY: Required for Gemini tests
 * - OPENAI_API_KEY: Required for OpenAI tests
 * - RUN_FULL_BENCHMARK: Set to 'true' for comprehensive benchmark tests
 * - BENCHMARK_MODEL: Override model (default: gemini-2.5-pro)
 * - BENCHMARK_PROVIDER: Override provider (default: google)
 */
export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      include: [
        // Hello smoke test - simplest live test
        'src/__tests__/live/hello.test.ts',

        // Tool calling test - verifies LLM makes correct tool calls
        'src/__tests__/live/tool-calling.test.ts',

        // Complex tool calling test - multi-step workflows
        'src/__tests__/live/complex-tool-calling.test.ts',

        // Real API reasoning tests
        'src/__tests__/integration/reasoning-benchmark.test.ts',
        'src/__tests__/integration/reasoning-scenarios.test.ts',

        // Engine tests that require real API (AI SDK, streaming)
        'src/engine/ai-sdk-client.test.ts',
        'src/engine/loop.test.ts',
      ],
      exclude: ['node_modules/', 'dist/'],
      testTimeout: 180000, // Live tests need extended timeout (3 min)
      // Retry flaky network tests
      retry: 1,
      // Run live tests sequentially to avoid rate limits
      pool: 'forks',
      poolOptions: {
        forks: {
          singleFork: true,
        },
      },
      // Setup file to configure environment before module loading
      setupFiles: ['./test/setup-live.ts'],
    },
  }),
);
