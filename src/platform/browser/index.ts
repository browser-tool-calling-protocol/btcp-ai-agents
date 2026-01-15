/**
 * Browser Platform Implementation
 *
 * Platform adapter for browser extension environments.
 * Uses bundled prompts, localStorage/chrome.storage, and in-memory config.
 */

import type {
  PlatformAdapter,
  EnvironmentAdapter,
  AssetLoader,
  StorageAdapter,
  LoggerAdapter,
} from '../types.js';
import { setPlatform } from '../registry.js';
import { BUNDLED_PROMPTS } from './bundled-prompts.js';

class BrowserEnvironment implements EnvironmentAdapter {
  private config: Map<string, string>;

  constructor(initialConfig: Record<string, string> = {}) {
    this.config = new Map(Object.entries(initialConfig));
  }

  get(key: string): string | undefined {
    return this.config.get(key);
  }

  getRequired(key: string): string {
    const value = this.config.get(key);
    if (!value) throw new Error(`Required config ${key} not set`);
    return value;
  }

  has(key: string): boolean {
    return this.config.has(key);
  }

  set(key: string, value: string): void {
    this.config.set(key, value);
  }
}

class BrowserAssetLoader implements AssetLoader {
  private prompts: Map<string, string>;

  constructor(bundledPrompts: Record<string, string>) {
    this.prompts = new Map(Object.entries(bundledPrompts));
  }

  loadTextSync(path: string): string {
    // Normalize path - remove leading ./ or / and handle both forward and backslashes
    const normalizedPath = path
      .replace(/^\.?\//, '')
      .replace(/\\/g, '/');

    // Try exact match first
    if (this.prompts.has(normalizedPath)) {
      return this.prompts.get(normalizedPath)!;
    }

    // Try without extension
    const withoutExt = normalizedPath.replace(/\.md$/, '');
    if (this.prompts.has(withoutExt)) {
      return this.prompts.get(withoutExt)!;
    }

    // Try with .md extension
    const withExt = normalizedPath.endsWith('.md') ? normalizedPath : `${normalizedPath}.md`;
    if (this.prompts.has(withExt)) {
      return this.prompts.get(withExt)!;
    }

    console.warn(`[BrowserAssetLoader] Asset not found: ${path}`);
    return '';
  }

  async loadText(path: string): Promise<string> {
    return this.loadTextSync(path);
  }

  async loadJSON<T>(path: string): Promise<T> {
    const text = await this.loadText(path);
    return JSON.parse(text) as T;
  }
}

class BrowserStorage implements StorageAdapter {
  private prefix: string;

  constructor(prefix = 'btcp-ai-agents') {
    this.prefix = prefix;
  }

  private key(k: string): string {
    return `${this.prefix}:${k}`;
  }

  async save(key: string, data: unknown): Promise<void> {
    // Support both localStorage and chrome.storage
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.set({ [this.key(key)]: data });
    } else if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.key(key), JSON.stringify(data));
    }
  }

  async load<T>(key: string): Promise<T | null> {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const result = await chrome.storage.local.get(this.key(key));
      return (result[this.key(key)] as T) ?? null;
    }
    if (typeof localStorage !== 'undefined') {
      const value = localStorage.getItem(this.key(key));
      return value ? (JSON.parse(value) as T) : null;
    }
    return null;
  }

  async delete(key: string): Promise<void> {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.remove(this.key(key));
    } else if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(this.key(key));
    }
  }

  async list(): Promise<string[]> {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const result = await chrome.storage.local.get(null);
      return Object.keys(result)
        .filter((k) => k.startsWith(this.prefix + ':'))
        .map((k) => k.slice(this.prefix.length + 1));
    }
    if (typeof localStorage !== 'undefined') {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith(this.prefix + ':')) {
          keys.push(k.slice(this.prefix.length + 1));
        }
      }
      return keys;
    }
    return [];
  }

  async exists(key: string): Promise<boolean> {
    return (await this.load(key)) !== null;
  }
}

class BrowserLogger implements LoggerAdapter {
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

export interface BrowserPlatformOptions {
  config?: Record<string, string>;
  storagePrefix?: string;
  loggerPrefix?: string;
  prompts?: Record<string, string>;
}

export function initBrowserPlatform(options: BrowserPlatformOptions = {}): PlatformAdapter {
  const platform: PlatformAdapter = {
    platform: 'browser',
    env: new BrowserEnvironment(options.config),
    assets: new BrowserAssetLoader(options.prompts ?? BUNDLED_PROMPTS),
    storage: new BrowserStorage(options.storagePrefix),
    logger: new BrowserLogger(options.loggerPrefix),
  };

  setPlatform(platform);
  return platform;
}

export { BrowserEnvironment, BrowserAssetLoader, BrowserStorage, BrowserLogger };
