/**
 * Vite Build Configuration
 *
 * Configures dual-target builds for browser and Node.js environments.
 */

import { defineConfig } from 'vite';
import { resolve } from 'path';
import dts from 'vite-plugin-dts';

export default defineConfig(({ mode }) => {
  const isBrowser = mode === 'browser';
  const isNode = mode === 'node';

  return {
    build: {
      lib: {
        entry: {
          index: resolve(__dirname, 'src/index.ts'),
          browser: resolve(__dirname, 'src/browser.ts'),
          node: resolve(__dirname, 'src/node.ts'),
          // Sub-modules
          'core/index': resolve(__dirname, 'src/core/index.ts'),
          'tools/index': resolve(__dirname, 'src/tools/index.ts'),
          'skills/index': resolve(__dirname, 'src/skills/index.ts'),
          'agents/index': resolve(__dirname, 'src/agents/index.ts'),
          'platform/index': resolve(__dirname, 'src/platform/index.ts'),
          'adapters/index': resolve(__dirname, 'src/adapters/index.ts'),
          // Skill bundles
          'skills/bundles/canvas': resolve(__dirname, 'src/skills/bundles/canvas.ts'),
        },
        formats: ['es', 'cjs'],
        fileName: (format, entryName) => {
          const ext = format === 'es' ? 'mjs' : 'cjs';
          return `${entryName}.${ext}`;
        },
      },
      rollupOptions: {
        external: [
          // Node.js built-ins
          'node:fs',
          'node:fs/promises',
          'node:path',
          'node:url',
          'node:crypto',
          'node:buffer',
          'fs',
          'path',
          'url',
          'crypto',
          // External dependencies
          'openai',
          '@google/genai',
          'sharp',
          'express',
          'cors',
          'zod',
          'nanoid',
          // Monorepo packages
          /^@utcp\//,
          /^@repo\//,
        ],
        output: {
          preserveModules: true,
          preserveModulesRoot: 'src',
          exports: 'named',
        },
      },
      target: 'esnext',
      minify: false,
      sourcemap: true,
      outDir: 'dist',
      emptyDirBeforeWrite: true,
    },
    plugins: [
      dts({
        include: ['src/**/*.ts'],
        exclude: ['src/**/*.test.ts', 'src/__tests__/**'],
        outDir: 'dist/types',
        rollupTypes: false,
      }),
    ],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
      },
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
    },
  };
});
