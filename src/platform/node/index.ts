/**
 * Node.js Platform Implementation
 *
 * Platform adapter for Node.js server environments.
 * Uses file system for assets and storage, process.env for configuration.
 */

import { readFileSync } from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type {
  PlatformAdapter,
  EnvironmentAdapter,
  AssetLoader,
  StorageAdapter,
  LoggerAdapter,
} from '../types.js';
import { setPlatform } from '../registry.js';

class NodeEnvironment implements EnvironmentAdapter {
  private overrides: Map<string, string>;

  constructor(overrides: Record<string, string> = {}) {
    this.overrides = new Map(Object.entries(overrides));
  }

  get(key: string): string | undefined {
    return this.overrides.get(key) ?? process.env[key];
  }

  getRequired(key: string): string {
    const value = this.get(key);
    if (!value) throw new Error(`Required env var ${key} not set`);
    return value;
  }

  has(key: string): boolean {
    return this.overrides.has(key) || (key in process.env && !!process.env[key]);
  }

  set(key: string, value: string): void {
    this.overrides.set(key, value);
  }
}

class NodeAssetLoader implements AssetLoader {
  private basePath: string;
  private cache = new Map<string, string>();

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  loadTextSync(path: string): string {
    const fullPath = join(this.basePath, path);
    if (this.cache.has(fullPath)) {
      return this.cache.get(fullPath)!;
    }
    try {
      const content = readFileSync(fullPath, 'utf-8');
      this.cache.set(fullPath, content);
      return content;
    } catch (err) {
      console.warn(`[NodeAssetLoader] Failed to load: ${fullPath}`);
      return '';
    }
  }

  async loadText(path: string): Promise<string> {
    const fullPath = join(this.basePath, path);
    if (this.cache.has(fullPath)) {
      return this.cache.get(fullPath)!;
    }
    try {
      const content = await fsPromises.readFile(fullPath, 'utf-8');
      this.cache.set(fullPath, content);
      return content;
    } catch (err) {
      console.warn(`[NodeAssetLoader] Failed to load: ${fullPath}`);
      return '';
    }
  }

  async loadJSON<T>(path: string): Promise<T> {
    const text = await this.loadText(path);
    return JSON.parse(text) as T;
  }

  clearCache(): void {
    this.cache.clear();
  }
}

class NodeFileStorage implements StorageAdapter {
  private basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  private getFilePath(key: string): string {
    // Sanitize key to be filesystem-safe
    const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');
    return join(this.basePath, `${safeKey}.json`);
  }

  async save(key: string, data: unknown): Promise<void> {
    const filePath = this.getFilePath(key);
    await fsPromises.mkdir(dirname(filePath), { recursive: true });
    await fsPromises.writeFile(filePath, JSON.stringify(data, null, 2));
  }

  async load<T>(key: string): Promise<T | null> {
    const filePath = this.getFilePath(key);
    try {
      const content = await fsPromises.readFile(filePath, 'utf-8');
      return JSON.parse(content) as T;
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    const filePath = this.getFilePath(key);
    try {
      await fsPromises.unlink(filePath);
    } catch {
      // Ignore if file doesn't exist
    }
  }

  async list(): Promise<string[]> {
    try {
      await fsPromises.mkdir(this.basePath, { recursive: true });
      const files = await fsPromises.readdir(this.basePath);
      return files
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.replace('.json', ''));
    } catch {
      return [];
    }
  }

  async exists(key: string): Promise<boolean> {
    const filePath = this.getFilePath(key);
    try {
      await fsPromises.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

class NodeLogger implements LoggerAdapter {
  private prefix: string;

  constructor(prefix = '[btcp-ai-agents]') {
    this.prefix = prefix;
  }

  debug(...args: unknown[]): void {
    console.debug(this.prefix, ...args);
  }

  info(...args: unknown[]): void {
    console.info(this.prefix, ...args);
  }

  warn(...args: unknown[]): void {
    console.warn(this.prefix, ...args);
  }

  error(...args: unknown[]): void {
    console.error(this.prefix, ...args);
  }
}

export interface NodePlatformOptions {
  assetsPath: string;
  storagePath: string;
  envOverrides?: Record<string, string>;
  loggerPrefix?: string;
}

export function initNodePlatform(options: NodePlatformOptions): PlatformAdapter {
  const platform: PlatformAdapter = {
    platform: 'node',
    env: new NodeEnvironment(options.envOverrides),
    assets: new NodeAssetLoader(options.assetsPath),
    storage: new NodeFileStorage(options.storagePath),
    logger: new NodeLogger(options.loggerPrefix),
  };

  setPlatform(platform);
  return platform;
}

export { NodeEnvironment, NodeAssetLoader, NodeFileStorage, NodeLogger };
