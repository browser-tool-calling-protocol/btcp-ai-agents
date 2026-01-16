/**
 * Session Serialization
 *
 * Persist and restore context manager state for:
 * - Long-running conversations across restarts
 * - Distributed agents across processes/servers
 * - Crash recovery and checkpointing
 * - Conversation branching/forking
 *
 * @example
 * ```typescript
 * import {
 *   SessionSerializer,
 *   FileStorage,
 *   createContextManager,
 * } from '@waiboard/ai-agents/context';
 *
 * // Save session
 * const manager = createContextManager();
 * manager.addUserMessage('Hello');
 * manager.addAssistantMessage('Hi!');
 *
 * const serializer = new SessionSerializer(new FileStorage('./sessions'));
 * await serializer.save(manager, 'session-1');
 *
 * // Restore later
 * const restored = await serializer.restore('session-1');
 * console.log(restored.getMessages()); // Previous messages restored
 * ```
 */

import {
  MemoryTier,
  MessagePriority,
  CompressionStrategy,
  SERIALIZATION_VERSION,
  type ContextMessage,
  type SerializedSession,
  type SerializedMessage,
  type SerializedConfig,
  type SerializedBudget,
  type SerializedCompression,
  type SerializedStats,
  type SessionCheckpoint,
  type SessionStorage,
  type SerializeOptions,
  type RestoreOptions,
  type MessageRole,
  type CompressionResult,
} from "./types.js";
import { ContextManager, createContextManager } from "./manager.js";
import { createMessage } from "./memory.js";
import { ClaudeTokenEstimator } from "./tokens.js";
import { DEFAULT_MEMORY_CONFIG } from "./memory.js";

// =============================================================================
// Session Serializer
// =============================================================================

/**
 * Handles serialization and deserialization of context manager state.
 */
export class SessionSerializer {
  private storage: SessionStorage;
  private estimator: ClaudeTokenEstimator;

  constructor(storage: SessionStorage) {
    this.storage = storage;
    this.estimator = new ClaudeTokenEstimator();
  }

  // ===========================================================================
  // Save Operations
  // ===========================================================================

  /**
   * Save a context manager state to storage.
   */
  async save(
    manager: ContextManager,
    sessionId: string,
    options: SerializeOptions = {}
  ): Promise<SerializedSession> {
    const session = this.serialize(manager, sessionId, options);
    await this.storage.save(session);
    return session;
  }

  /**
   * Serialize a context manager to a session object.
   */
  serialize(
    manager: ContextManager,
    sessionId: string,
    options: SerializeOptions = {}
  ): SerializedSession {
    const now = Date.now();
    const window = manager.getWindow();
    const stats = manager.getStats();
    const budget = manager.getBudget();

    // Serialize messages by tier
    const tiers: Record<MemoryTier, SerializedMessage[]> = {
      [MemoryTier.SYSTEM]: [],
      [MemoryTier.TOOLS]: [],
      [MemoryTier.RESOURCES]: [],
      [MemoryTier.RECENT]: [],
      [MemoryTier.ARCHIVED]: [],
      [MemoryTier.EPHEMERAL]: [],
    };

    for (const [tier, messages] of window.tiers) {
      tiers[tier] = messages.map((m) => this.serializeMessage(m));
    }

    // Serialize budget state
    const budgetBreakdown = manager.getBudgetBreakdown();
    const serializedBudget: SerializedBudget = {
      maxTokens: budget.maxTokens,
      allocations: {
        system: budgetBreakdown.byTier[MemoryTier.SYSTEM] ?? 0,
        tools: budgetBreakdown.byTier[MemoryTier.TOOLS] ?? 0,
        history: (budgetBreakdown.byTier[MemoryTier.RECENT] ?? 0) + (budgetBreakdown.byTier[MemoryTier.ARCHIVED] ?? 0),
        reserved: 0, // Reservations are tracked separately
      },
      reservations: [], // Reservations are typically ephemeral
    };

    // Serialize compressions if requested
    const compressions: SerializedCompression[] = options.includeCompressionHistory
      ? window.compressions.map((c) => this.serializeCompression(c))
      : [];

    // Serialize stats - compute messagesByTier from the tiers we serialized
    const messagesByTier: Record<MemoryTier, number> = {
      [MemoryTier.SYSTEM]: tiers[MemoryTier.SYSTEM].length,
      [MemoryTier.TOOLS]: tiers[MemoryTier.TOOLS].length,
      [MemoryTier.RESOURCES]: tiers[MemoryTier.RESOURCES].length,
      [MemoryTier.RECENT]: tiers[MemoryTier.RECENT].length,
      [MemoryTier.ARCHIVED]: tiers[MemoryTier.ARCHIVED].length,
      [MemoryTier.EPHEMERAL]: tiers[MemoryTier.EPHEMERAL].length,
    };
    const serializedStats: SerializedStats = {
      totalMessages: stats.totalMessages,
      totalTokens: stats.totalTokens,
      compressionCount: stats.compressionCount,
      evictionCount: stats.evictionCount,
      messagesByRole: { ...stats.messagesByRole },
      messagesByTier,
    };

    return {
      version: SERIALIZATION_VERSION,
      sessionId,
      createdAt: now,
      updatedAt: now,
      config: this.extractConfig(manager),
      tiers,
      budget: serializedBudget,
      compressions,
      stats: options.includeStats ? serializedStats : this.emptyStats(),
      metadata: options.metadata,
    };
  }

  /**
   * Create a checkpoint for incremental saves.
   */
  createCheckpoint(
    manager: ContextManager,
    sessionId: string,
    lastCheckpointTime: number,
    metadata?: Record<string, unknown>
  ): SessionCheckpoint {
    const messages = manager.getMessages();
    const newMessages = messages
      .filter((m) => m.timestamp > lastCheckpointTime)
      .map((m) => this.serializeMessage(m));

    return {
      checkpointId: `cp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      sessionId,
      timestamp: Date.now(),
      newMessages,
      evictedIds: [], // Would need event tracking to populate
      budgetDelta: {
        allocations: {},
      },
      metadata,
    };
  }

  /**
   * Save a checkpoint.
   */
  async saveCheckpoint(
    manager: ContextManager,
    sessionId: string,
    lastCheckpointTime: number,
    metadata?: Record<string, unknown>
  ): Promise<SessionCheckpoint> {
    const checkpoint = this.createCheckpoint(
      manager,
      sessionId,
      lastCheckpointTime,
      metadata
    );

    if (this.storage.saveCheckpoint) {
      await this.storage.saveCheckpoint(checkpoint);
    }

    return checkpoint;
  }

  // ===========================================================================
  // Restore Operations
  // ===========================================================================

  /**
   * Restore a context manager from storage.
   */
  async restore(
    sessionId: string,
    options: RestoreOptions = {}
  ): Promise<ContextManager | null> {
    const session = await this.storage.load(sessionId);

    if (!session) {
      return null;
    }

    return this.deserialize(session, options);
  }

  /**
   * Deserialize a session into a context manager.
   */
  deserialize(
    session: SerializedSession,
    options: RestoreOptions = {}
  ): ContextManager {
    // Validate version
    if (session.version > SERIALIZATION_VERSION) {
      throw new Error(
        `Session version ${session.version} is newer than supported version ${SERIALIZATION_VERSION}`
      );
    }

    // Migrate if needed
    const migrated = this.migrate(session);

    // Apply config overrides
    const config = {
      ...migrated.config,
      ...options.configOverrides,
    };

    // Create manager with restored config
    const manager = createContextManager({
      maxTokens: config.maxTokens,
      responseReserve: config.responseReserve,
      toolReserve: config.toolReserve,
      enableCaching: config.enableCaching,
      tieredMemory: {
        ...DEFAULT_MEMORY_CONFIG,
        compressionThreshold: config.compressionThreshold,
        evictionThreshold: config.evictionThreshold,
      },
    });

    // Restore messages by tier (in order: system, tools, resources, archived, recent, ephemeral)
    const tierOrder: MemoryTier[] = [
      MemoryTier.SYSTEM,
      MemoryTier.TOOLS,
      MemoryTier.RESOURCES,
      MemoryTier.ARCHIVED,
      MemoryTier.RECENT,
      MemoryTier.EPHEMERAL,
    ];

    for (const tier of tierOrder) {
      const messages = migrated.tiers[tier] ?? [];

      for (const serialized of messages) {
        // Skip old messages if requested
        if (
          options.skipMessagesBefore &&
          serialized.timestamp < options.skipMessagesBefore
        ) {
          continue;
        }

        // Deserialize and add message
        const message = this.deserializeMessage(serialized, options);

        // Validate if requested
        if (options.validate && !this.validateMessage(message)) {
          console.warn(`Skipping invalid message: ${message.id}`);
          continue;
        }

        manager.addMessage(message, { tier, skipCompression: true });
      }
    }

    return manager;
  }

  /**
   * Apply checkpoints to a session.
   */
  async applyCheckpoints(
    session: SerializedSession,
    checkpoints: SessionCheckpoint[]
  ): Promise<SerializedSession> {
    // Sort checkpoints by timestamp
    const sorted = [...checkpoints].sort((a, b) => a.timestamp - b.timestamp);

    for (const checkpoint of sorted) {
      // Add new messages to recent tier
      session.tiers[MemoryTier.RECENT].push(...checkpoint.newMessages);

      // Remove evicted messages from all tiers
      for (const tier of Object.values(MemoryTier)) {
        session.tiers[tier] = session.tiers[tier].filter(
          (m) => !checkpoint.evictedIds.includes(m.id)
        );
      }

      // Apply budget deltas
      for (const [key, delta] of Object.entries(checkpoint.budgetDelta.allocations)) {
        session.budget.allocations[key] =
          (session.budget.allocations[key] ?? 0) + delta;
      }

      session.updatedAt = checkpoint.timestamp;
    }

    return session;
  }

  // ===========================================================================
  // Migration
  // ===========================================================================

  /**
   * Migrate session to current version.
   */
  private migrate(session: SerializedSession): SerializedSession {
    let current = { ...session };

    // Version 0 -> 1 migration (example)
    if (current.version === 0) {
      // Add missing fields
      current = {
        ...current,
        version: 1,
        stats: current.stats ?? this.emptyStats(),
      };
    }

    return current;
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  private serializeMessage(message: ContextMessage): SerializedMessage {
    return {
      id: message.id,
      role: message.role,
      content: message.content,
      timestamp: message.timestamp,
      tokens: message.tokens ?? 0,
      priority: message.priority ?? MessagePriority.NORMAL,
      compressible: message.compressible ?? true,
      metadata: message.metadata,
      summarizedFrom: message.summarizedFrom,
    };
  }

  private deserializeMessage(
    serialized: SerializedMessage,
    options: RestoreOptions
  ): ContextMessage {
    let tokens = serialized.tokens;

    // Recalculate tokens if requested
    if (options.recalculateTokens) {
      const content =
        typeof serialized.content === "string"
          ? serialized.content
          : JSON.stringify(serialized.content);
      tokens = this.estimator.estimateText(content);
    }

    return createMessage(serialized.role, serialized.content as string, {
      id: serialized.id,
      timestamp: serialized.timestamp,
      tokens,
      priority: serialized.priority,
      compressible: serialized.compressible,
      metadata: serialized.metadata,
      summarizedFrom: serialized.summarizedFrom,
    });
  }

  private serializeCompression(result: CompressionResult): SerializedCompression {
    return {
      timestamp: Date.now(),
      originalTokens: result.originalTokens,
      compressedTokens: result.compressedTokens,
      ratio: result.ratio,
      strategy: result.strategy,
      affectedMessageIds: result.compressed.map((m) => m.id),
    };
  }

  private extractConfig(manager: ContextManager): SerializedConfig {
    const budget = manager.getBudget();
    const stats = manager.getStats();

    return {
      maxTokens: budget.maxTokens,
      responseReserve: 4_000, // Default, not easily extracted
      toolReserve: 2_000, // Default, not easily extracted
      enableCaching: true,
      compressionThreshold: DEFAULT_MEMORY_CONFIG.compressionThreshold,
      evictionThreshold: DEFAULT_MEMORY_CONFIG.evictionThreshold,
    };
  }

  private validateMessage(message: ContextMessage): boolean {
    if (!message.id || !message.role || message.content === undefined) {
      return false;
    }

    if (!["system", "user", "assistant", "tool"].includes(message.role)) {
      return false;
    }

    return true;
  }

  private emptyStats(): SerializedStats {
    return {
      totalMessages: 0,
      totalTokens: 0,
      compressionCount: 0,
      evictionCount: 0,
      messagesByRole: { system: 0, user: 0, assistant: 0, tool: 0 },
      messagesByTier: {
        [MemoryTier.SYSTEM]: 0,
        [MemoryTier.TOOLS]: 0,
        [MemoryTier.RESOURCES]: 0,
        [MemoryTier.RECENT]: 0,
        [MemoryTier.ARCHIVED]: 0,
        [MemoryTier.EPHEMERAL]: 0,
      },
    };
  }

  // ===========================================================================
  // Storage Passthrough
  // ===========================================================================

  async delete(sessionId: string): Promise<void> {
    await this.storage.delete(sessionId);
  }

  async list(): Promise<string[]> {
    return this.storage.list();
  }

  async exists(sessionId: string): Promise<boolean> {
    return this.storage.exists(sessionId);
  }
}

// =============================================================================
// Storage Backends
// =============================================================================

/**
 * In-memory storage for testing.
 */
export class MemoryStorage implements SessionStorage {
  private sessions = new Map<string, SerializedSession>();
  private checkpoints = new Map<string, SessionCheckpoint[]>();

  async save(session: SerializedSession): Promise<void> {
    this.sessions.set(session.sessionId, structuredClone(session));
  }

  async load(sessionId: string): Promise<SerializedSession | null> {
    const session = this.sessions.get(sessionId);
    return session ? structuredClone(session) : null;
  }

  async delete(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
    this.checkpoints.delete(sessionId);
  }

  async list(): Promise<string[]> {
    return Array.from(this.sessions.keys());
  }

  async exists(sessionId: string): Promise<boolean> {
    return this.sessions.has(sessionId);
  }

  async saveCheckpoint(checkpoint: SessionCheckpoint): Promise<void> {
    const existing = this.checkpoints.get(checkpoint.sessionId) ?? [];
    existing.push(structuredClone(checkpoint));
    this.checkpoints.set(checkpoint.sessionId, existing);
  }

  async loadCheckpoints(
    sessionId: string,
    since: number
  ): Promise<SessionCheckpoint[]> {
    const checkpoints = this.checkpoints.get(sessionId) ?? [];
    return checkpoints.filter((cp) => cp.timestamp > since);
  }

  clear(): void {
    this.sessions.clear();
    this.checkpoints.clear();
  }
}

/**
 * File-based storage using JSON files.
 */
export class FileStorage implements SessionStorage {
  private basePath: string;
  private fs: typeof import("fs/promises") | null = null;
  private path: typeof import("path") | null = null;

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  private async ensureModules(): Promise<void> {
    if (!this.fs) {
      this.fs = await import("fs/promises");
      this.path = await import("path");
    }
  }

  private async ensureDir(): Promise<void> {
    await this.ensureModules();
    try {
      await this.fs!.mkdir(this.basePath, { recursive: true });
    } catch {
      // Directory may already exist
    }
  }

  private getPath(sessionId: string): string {
    return this.path!.join(this.basePath, `${sessionId}.json`);
  }

  async save(session: SerializedSession): Promise<void> {
    await this.ensureDir();
    const filePath = this.getPath(session.sessionId);
    const content = JSON.stringify(session, null, 2);
    await this.fs!.writeFile(filePath, content, "utf-8");
  }

  async load(sessionId: string): Promise<SerializedSession | null> {
    await this.ensureModules();
    const filePath = this.getPath(sessionId);
    try {
      const content = await this.fs!.readFile(filePath, "utf-8");
      return JSON.parse(content) as SerializedSession;
    } catch {
      return null;
    }
  }

  async delete(sessionId: string): Promise<void> {
    await this.ensureModules();
    const filePath = this.getPath(sessionId);
    try {
      await this.fs!.unlink(filePath);
    } catch {
      // File may not exist
    }
  }

  async list(): Promise<string[]> {
    await this.ensureDir();
    const files = await this.fs!.readdir(this.basePath);
    return files
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(".json", ""));
  }

  async exists(sessionId: string): Promise<boolean> {
    await this.ensureModules();
    const filePath = this.getPath(sessionId);
    try {
      await this.fs!.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async saveCheckpoint(checkpoint: SessionCheckpoint): Promise<void> {
    await this.ensureDir();
    const checkpointPath = this.path!.join(
      this.basePath,
      "checkpoints",
      checkpoint.sessionId
    );
    await this.fs!.mkdir(checkpointPath, { recursive: true });
    const filePath = this.path!.join(
      checkpointPath,
      `${checkpoint.checkpointId}.json`
    );
    await this.fs!.writeFile(filePath, JSON.stringify(checkpoint, null, 2), "utf-8");
  }

  async loadCheckpoints(
    sessionId: string,
    since: number
  ): Promise<SessionCheckpoint[]> {
    await this.ensureModules();
    const checkpointPath = this.path!.join(this.basePath, "checkpoints", sessionId);
    try {
      const files = await this.fs!.readdir(checkpointPath);
      const checkpoints: SessionCheckpoint[] = [];

      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        const content = await this.fs!.readFile(
          this.path!.join(checkpointPath, file),
          "utf-8"
        );
        const checkpoint = JSON.parse(content) as SessionCheckpoint;
        if (checkpoint.timestamp > since) {
          checkpoints.push(checkpoint);
        }
      }

      return checkpoints.sort((a, b) => a.timestamp - b.timestamp);
    } catch {
      return [];
    }
  }
}

/**
 * Custom storage adapter for external systems (Redis, databases, etc.).
 */
export class CustomStorage implements SessionStorage {
  private handlers: SessionStorage;

  constructor(handlers: SessionStorage) {
    this.handlers = handlers;
  }

  save(session: SerializedSession): Promise<void> {
    return this.handlers.save(session);
  }

  load(sessionId: string): Promise<SerializedSession | null> {
    return this.handlers.load(sessionId);
  }

  delete(sessionId: string): Promise<void> {
    return this.handlers.delete(sessionId);
  }

  list(): Promise<string[]> {
    return this.handlers.list();
  }

  exists(sessionId: string): Promise<boolean> {
    return this.handlers.exists(sessionId);
  }

  saveCheckpoint(checkpoint: SessionCheckpoint): Promise<void> {
    if (this.handlers.saveCheckpoint) {
      return this.handlers.saveCheckpoint(checkpoint);
    }
    return Promise.resolve();
  }

  loadCheckpoints(sessionId: string, since: number): Promise<SessionCheckpoint[]> {
    if (this.handlers.loadCheckpoints) {
      return this.handlers.loadCheckpoints(sessionId, since);
    }
    return Promise.resolve([]);
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a session serializer with memory storage.
 */
export function createMemorySerializer(): SessionSerializer {
  return new SessionSerializer(new MemoryStorage());
}

/**
 * Create a session serializer with file storage.
 */
export function createFileSerializer(basePath: string): SessionSerializer {
  return new SessionSerializer(new FileStorage(basePath));
}

/**
 * Create a session serializer with custom storage.
 */
export function createCustomSerializer(storage: SessionStorage): SessionSerializer {
  return new SessionSerializer(storage);
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Generate a unique session ID.
 */
export function generateSessionId(prefix = "session"): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${timestamp}_${random}`;
}

/**
 * Export session to JSON string.
 */
export function exportSessionToJSON(
  manager: ContextManager,
  sessionId: string,
  options?: SerializeOptions
): string {
  const serializer = new SessionSerializer(new MemoryStorage());
  const session = serializer.serialize(manager, sessionId, options);
  return JSON.stringify(session, null, 2);
}

/**
 * Import session from JSON string.
 */
export function importSessionFromJSON(
  json: string,
  options?: RestoreOptions
): ContextManager {
  const session = JSON.parse(json) as SerializedSession;
  const serializer = new SessionSerializer(new MemoryStorage());
  return serializer.deserialize(session, options);
}

/**
 * Clone a context manager (useful for branching conversations).
 */
export function cloneSession(
  manager: ContextManager,
  newSessionId?: string
): ContextManager {
  const serializer = new SessionSerializer(new MemoryStorage());
  const session = serializer.serialize(
    manager,
    newSessionId ?? generateSessionId("clone"),
    { includeCompressionHistory: true, includeStats: true }
  );
  return serializer.deserialize(session);
}

/**
 * Merge two sessions (combine conversation branches).
 */
export function mergeSessions(
  primary: ContextManager,
  secondary: ContextManager,
  options: {
    strategy?: "append" | "interleave";
    deduplicateByContent?: boolean;
  } = {}
): ContextManager {
  const { strategy = "append", deduplicateByContent = false } = options;
  const serializer = new SessionSerializer(new MemoryStorage());

  // Clone primary as base
  const merged = cloneSession(primary, generateSessionId("merged"));

  // Get secondary messages
  const secondaryMessages = secondary.getMessages();

  // Deduplicate if requested
  let messagesToAdd = secondaryMessages;
  if (deduplicateByContent) {
    const existingContent = new Set(
      merged.getMessages().map((m) =>
        typeof m.content === "string" ? m.content : JSON.stringify(m.content)
      )
    );
    messagesToAdd = secondaryMessages.filter((m) => {
      const content =
        typeof m.content === "string" ? m.content : JSON.stringify(m.content);
      return !existingContent.has(content);
    });
  }

  // Add messages
  if (strategy === "append") {
    for (const message of messagesToAdd) {
      merged.addMessage({ ...message, id: `merged_${message.id}` });
    }
  } else {
    // Interleave by timestamp
    const allMessages = [...merged.getMessages(), ...messagesToAdd];
    allMessages.sort((a, b) => a.timestamp - b.timestamp);

    // Recreate with sorted messages
    const sorted = createContextManager({
      maxTokens: merged.getBudget().maxTokens,
    });
    for (const message of allMessages) {
      sorted.addMessage({ ...message }, { skipCompression: true });
    }
    return sorted;
  }

  return merged;
}
