/**
 * Test setup for live/benchmark tests
 *
 * This file runs before any test modules are imported,
 * ensuring PROMPT_VERSION is set to 'v1' for benchmark tests
 * that expect XML reasoning tags.
 */

// Set prompt version before any modules are loaded
process.env.PROMPT_VERSION = 'v1';
