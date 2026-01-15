/**
 * Platform Registry
 *
 * Global registry for the current platform adapter.
 * Call initBrowserPlatform() or initNodePlatform() before using the registry.
 */

import type { PlatformAdapter, EnvironmentAdapter, AssetLoader, StorageAdapter, LoggerAdapter } from './types.js';

let currentPlatform: PlatformAdapter | null = null;

export function setPlatform(platform: PlatformAdapter): void {
  currentPlatform = platform;
}

export function getPlatform(): PlatformAdapter {
  if (!currentPlatform) {
    throw new Error('Platform not initialized. Call initBrowserPlatform() or initNodePlatform() first.');
  }
  return currentPlatform;
}

export function hasPlatform(): boolean {
  return currentPlatform !== null;
}

export function getEnv(): EnvironmentAdapter {
  return getPlatform().env;
}

export function getAssets(): AssetLoader {
  return getPlatform().assets;
}

export function getStorage(): StorageAdapter {
  return getPlatform().storage;
}

export function getLogger(): LoggerAdapter {
  return getPlatform().logger;
}
