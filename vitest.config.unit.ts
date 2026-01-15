import { defineConfig, mergeConfig } from 'vitest/config';
import { baseConfig } from './vitest.config.base';

/**
 * Unit Tests Configuration
 *
 * Fast, isolated tests with no external dependencies.
 * These tests should complete in < 5 seconds total.
 *
 * Run with: pnpm test:unit
 */
export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      include: [
        // Co-located unit tests (direct source companions)
        'src/hooks/manager.test.ts',
        'src/tools/canvas-verify.test.ts',
        'src/tools/canvas-execute.test.ts',
        'src/tools/semantic-search.test.ts',
        'src/tools/definitions.test.ts',
        'src/templates/templates.test.ts',
        'src/commands/executor.test.ts',
        'src/resources/context.test.ts',
        'src/resources/registry.test.ts',
        'src/aliases/resolver.test.ts',
        'src/agents/types.test.ts',
        'src/agents/budget.test.ts',
        'src/agents/definitions.test.ts',
        'src/agents/state.test.ts',
        'src/agents/mode-detection.test.ts',
        'src/skills/index.test.ts',
        'src/context/serialization.test.ts',
        'src/http/validation.test.ts',
        'src/http/handler.test.ts',
      ],
      exclude: ['node_modules/', 'dist/'],
      testTimeout: 5000, // Unit tests should be fast
    },
  }),
);
