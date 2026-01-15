"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var config_1 = require("vitest/config");
var path_1 = require("path");
exports.default = (0, config_1.defineConfig)({
    resolve: {
        alias: {
            '@waiboard/canvas-driver': (0, path_1.resolve)(__dirname, '../canvas-driver/src'),
            '@waiboard/canvas-v2': (0, path_1.resolve)(__dirname, '../canvas-v2/src'),
            '@waiboard/db': (0, path_1.resolve)(__dirname, '../db/src'),
        },
    },
    test: {
        globals: true,
        environment: 'node',
        setupFiles: ['./src/agents/__tests__/setup.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            exclude: [
                'node_modules/',
                'dist/',
                '**/*.test.ts',
                '**/__tests__/**',
                '**/types.ts',
                '**/example.ts',
                '**/creative-examples.ts',
                '**/streaming-examples.ts',
            ],
        },
        testTimeout: 10000, // 10s for AI agent tests
    },
});
