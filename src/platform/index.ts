/**
 * Platform Abstraction Module
 *
 * Provides environment-agnostic APIs for file loading, storage, and configuration.
 * Supports both browser extension and Node.js environments.
 */

// Types
export type {
  PlatformAdapter,
  EnvironmentAdapter,
  AssetLoader,
  StorageAdapter,
  LoggerAdapter,
} from './types.js';

// Registry
export {
  setPlatform,
  getPlatform,
  hasPlatform,
  getEnv,
  getAssets,
  getStorage,
  getLogger,
} from './registry.js';
