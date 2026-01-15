/**
 * Platform Abstraction Layer Types
 *
 * Provides interfaces for environment-specific APIs (file loading, storage, config)
 * to enable browser extension and Node.js dual-target support.
 */

export interface PlatformAdapter {
  readonly platform: 'node' | 'browser';

  /** Environment/config access */
  env: EnvironmentAdapter;

  /** Prompt/asset loading */
  assets: AssetLoader;

  /** Session persistence */
  storage: StorageAdapter;

  /** Logging */
  logger: LoggerAdapter;
}

export interface EnvironmentAdapter {
  get(key: string): string | undefined;
  getRequired(key: string): string;
  has(key: string): boolean;
}

export interface AssetLoader {
  loadText(path: string): Promise<string>;
  loadTextSync(path: string): string;
  loadJSON<T>(path: string): Promise<T>;
}

export interface StorageAdapter {
  save(key: string, data: unknown): Promise<void>;
  load<T>(key: string): Promise<T | null>;
  delete(key: string): Promise<void>;
  list(): Promise<string[]>;
  exists(key: string): Promise<boolean>;
}

export interface LoggerAdapter {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}
