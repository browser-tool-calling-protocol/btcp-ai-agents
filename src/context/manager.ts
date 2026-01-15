/**
 * Context Manager
 *
 * Main facade for context window management.
 * Integrates all components:
 * - Token tracking and budget management
 * - Tiered memory organization
 * - Compression strategies
 * - Budget allocation
 *
 * Usage:
 * ```typescript
 * const manager = createContextManager({ maxTokens: 200_000 });
 *
 * // Add messages
 * manager.addMessage(createMessage('system', 'You are a helpful assistant'));
 * manager.addMessage(createMessage('user', 'Hello'));
 * manager.addMessage(createMessage('assistant', 'Hi there!'));
 *
 * // Prepare for API request
 * const prepared = await manager.prepareForRequest();
 * // prepared.messages is ready for Claude API
 * ```
 */

import {
  MessagePriority,
  type ContextManagerConfig,
  type ContextMessage,
  type ContextWindow,
  type ContextStats,
  type TokenEstimator,
  type TokenBudget,
  type ContextCompressor,
  type ContextAllocator,
  type AddMessageOptions,
  type PrepareForRequestOptions,
  type PreparedRequest,
  type CompressionResult,
  type ContextEvent,
  type ContextEventHandler,
  type MemoryTier,
  type MessageRole,
  type CacheConfig,
  type CacheBreakpoint,
} from "./types.js";
import {
  ClaudeTokenEstimator,
  TokenBudgetTracker,
  MODEL_CONTEXT_SIZES,
} from "./tokens.js";
import {
  TieredMemory,
  DEFAULT_MEMORY_CONFIG,
  createMessage,
  MemoryTier as MemoryTierEnum,
} from "./memory.js";
import {
  DefaultContextCompressor,
  CompressionStrategy,
  getRecommendedStrategy,
} from "./compressor.js";
import { DefaultContextAllocator } from "./allocator.js";

// =============================================================================
// Default Configuration
// =============================================================================

const DEFAULT_CONFIG: ContextManagerConfig = {
  maxTokens: MODEL_CONTEXT_SIZES["claude-3.5-sonnet"],
  tieredMemory: DEFAULT_MEMORY_CONFIG,
  responseReserve: 4_000,
  toolReserve: 2_000,
  enableCaching: true,
};

// =============================================================================
// Context Manager Implementation
// =============================================================================

export class ContextManager {
  private config: ContextManagerConfig;
  private estimator: TokenEstimator;
  private budget: TokenBudgetTracker;
  private memory: TieredMemory;
  private compressor: ContextCompressor;
  private allocator: ContextAllocator;
  private eventHandlers: Set<ContextEventHandler> = new Set();
  private compressionHistory: CompressionResult[] = [];
  private messageCount = 0;

  constructor(config: Partial<ContextManagerConfig> = {}) {
    // Filter out undefined values from config to avoid overwriting defaults
    const definedConfig = Object.fromEntries(
      Object.entries(config).filter(([_, v]) => v !== undefined)
    ) as Partial<ContextManagerConfig>;
    this.config = { ...DEFAULT_CONFIG, ...definedConfig };

    // Initialize components
    this.estimator = config.estimator ?? new ClaudeTokenEstimator();
    this.budget = new TokenBudgetTracker(this.config.maxTokens);
    this.memory = new TieredMemory(
      this.config.tieredMemory,
      this.config.priorityRules,
      this.estimator
    );
    this.compressor = config.compressor ?? new DefaultContextCompressor(this.estimator);
    this.allocator = config.allocator ?? new DefaultContextAllocator(undefined, this.estimator);

    // Reserve tokens for response and tools
    this.budget.reserve(this.config.responseReserve, "response");
    this.budget.reserve(this.config.toolReserve, "tools");
  }

  // ===========================================================================
  // Message Management
  // ===========================================================================

  /**
   * Add a message to the context.
   */
  addMessage(message: ContextMessage, options: AddMessageOptions = {}): void {
    // Ensure message has ID
    if (!message.id) {
      message.id = `msg_${++this.messageCount}_${Date.now()}`;
    }

    // Compute tokens if not set
    if (message.tokens === undefined) {
      message.tokens = this.estimator.estimateMessage(message);
    }

    // Override priority if specified
    if (options.priority !== undefined) {
      message.priority = options.priority;
    }

    // Add metadata
    if (options.metadata) {
      message.metadata = { ...message.metadata, ...options.metadata };
    }

    // Add to memory
    this.memory.addMessage(message, options.tier);

    // Update budget
    this.budget.allocate(options.tier ?? "history", message.tokens);

    // Emit event
    this.emit({ type: "message_added", message });

    // Check if compression needed
    if (!options.skipCompression) {
      this.checkAndCompress();
    }
  }

  /**
   * Add a user message.
   */
  addUserMessage(content: string, metadata?: Record<string, unknown>): ContextMessage {
    const message = createMessage("user", content, { metadata });
    this.addMessage(message);
    return message;
  }

  /**
   * Add an assistant message.
   */
  addAssistantMessage(content: string, metadata?: Record<string, unknown>): ContextMessage {
    const message = createMessage("assistant", content, { metadata });
    this.addMessage(message);
    return message;
  }

  /**
   * Add a system message.
   */
  addSystemMessage(content: string): ContextMessage {
    const message = createMessage("system", content, {
      priority: 200, // MessagePriority.SYSTEM
      compressible: false,
    });
    this.addMessage(message, { tier: MemoryTierEnum.SYSTEM });
    return message;
  }

  /**
   * Add a tool result.
   */
  addToolResult(
    toolUseId: string,
    toolName: string,
    content: string,
    isError = false
  ): ContextMessage {
    const message = createMessage("tool", content, {
      priority: 75, // MessagePriority.HIGH
      metadata: { toolUseId, toolName, isError },
    });
    this.addMessage(message, { tier: MemoryTierEnum.TOOLS });
    return message;
  }

  /**
   * Get all messages.
   */
  getMessages(): ContextMessage[] {
    return this.memory.getAllMessages();
  }

  /**
   * Get messages by role.
   */
  getMessagesByRole(role: MessageRole): ContextMessage[] {
    return this.getMessages().filter((m) => m.role === role);
  }

  /**
   * Get message count.
   */
  getMessageCount(): number {
    return this.getMessages().length;
  }

  // ===========================================================================
  // Context Preparation
  // ===========================================================================

  /**
   * Prepare context for API request.
   */
  async prepareForRequest(
    options: PrepareForRequestOptions = {}
  ): Promise<PreparedRequest> {
    // Force compression if requested or if over threshold
    if (options.forceCompression || this.shouldCompress()) {
      await this.compress();
    }

    // Get all messages in order
    let messages = this.getMessages();

    // Filter system messages if requested
    if (options.includeSystem === false) {
      messages = messages.filter((m) => m.role !== "system");
    }

    // Limit message count if specified
    if (options.maxMessages && messages.length > options.maxMessages) {
      // Keep system messages + last N messages
      const systemMessages = messages.filter((m) => m.role === "system");
      const otherMessages = messages.filter((m) => m.role !== "system");
      const lastN = otherMessages.slice(-options.maxMessages);
      messages = [...systemMessages, ...lastN];
    }

    // Calculate tokens
    const totalTokens = messages.reduce((sum, m) => sum + (m.tokens ?? 0), 0);
    const reservedTokens =
      this.config.responseReserve +
      (options.additionalReserve ?? 0);
    const responseTokens = Math.max(
      0,
      this.config.maxTokens - totalTokens - reservedTokens
    );

    // Calculate cache breakpoints
    const cacheBreakpoints = this.config.enableCaching
      ? this.calculateCacheBreakpoints(messages)
      : undefined;

    return {
      messages,
      totalTokens,
      responseTokens,
      wasCompressed: this.compressionHistory.length > 0,
      cacheBreakpoints,
    };
  }

  /**
   * Convert to Claude API format.
   */
  toApiFormat(): Array<{ role: string; content: string }> {
    return this.getMessages().map((m) => ({
      role: m.role,
      content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
    }));
  }

  // ===========================================================================
  // Compression
  // ===========================================================================

  /**
   * Check if compression is needed.
   */
  shouldCompress(): boolean {
    return this.budget.utilizationRatio > this.config.tieredMemory.compressionThreshold;
  }

  /**
   * Check if eviction is needed.
   */
  shouldEvict(): boolean {
    return this.budget.utilizationRatio > this.config.tieredMemory.evictionThreshold;
  }

  /**
   * Perform compression.
   */
  async compress(): Promise<CompressionResult | null> {
    const needingCompression = this.memory.getMessagesNeedingCompression();

    if (needingCompression.length === 0) {
      return null;
    }

    // Compress each tier that needs it
    for (const { tier, messages, overflow } of needingCompression) {
      this.emit({ type: "compression_started", messages });

      const targetTokens = messages.reduce((sum, m) => sum + (m.tokens ?? 0), 0) - overflow;

      // Check if messages include tool content for TOOL_AWARE strategy
      const hasToolContent = messages.some(
        (m) => m.role === "tool" || m.metadata?.toolName
      );

      const strategy = getRecommendedStrategy(
        messages.reduce((sum, m) => sum + (m.tokens ?? 0), 0),
        targetTokens,
        this.compressor instanceof DefaultContextCompressor,
        hasToolContent
      );

      const result = await this.compressor.compress(messages, {
        strategy,
        targetTokens,
      });

      // Replace messages in memory
      this.memory.replaceMessages(
        tier,
        messages.map((m) => m.id),
        result.compressed
      );

      // Update budget
      this.budget.deallocate("history", result.originalTokens);
      this.budget.allocate("history", result.compressedTokens);

      // Track compression
      this.compressionHistory.push(result);
      this.emit({ type: "compression_completed", result });

      // Notify callback
      this.config.onCompression?.(result);
    }

    return this.compressionHistory[this.compressionHistory.length - 1] ?? null;
  }

  /**
   * Manual compact command (like /compact in Claude Code).
   */
  async compact(targetRatio = 0.5): Promise<CompressionResult | null> {
    const messages = this.memory.getMessages(MemoryTierEnum.RECENT);

    if (messages.length === 0) {
      return null;
    }

    const currentTokens = messages.reduce((sum, m) => sum + (m.tokens ?? 0), 0);
    const targetTokens = Math.ceil(currentTokens * targetRatio);

    const result = await this.compressor.compress(messages, {
      strategy: CompressionStrategy.SUMMARIZE,
      targetTokens,
    });

    // Replace recent with compressed
    this.memory.replaceMessages(
      MemoryTierEnum.RECENT,
      messages.map((m) => m.id),
      result.compressed
    );

    // Update budget
    this.budget.deallocate("history", result.originalTokens);
    this.budget.allocate("history", result.compressedTokens);

    this.compressionHistory.push(result);

    return result;
  }

  /**
   * Check and compress if needed.
   */
  private async checkAndCompress(): Promise<void> {
    // Check budget warnings
    const utilizationRatio = this.budget.utilizationRatio;

    if (utilizationRatio > 0.9) {
      this.emit({ type: "budget_critical", utilizationRatio });
    } else if (utilizationRatio > 0.7) {
      this.emit({ type: "budget_warning", utilizationRatio });
    }

    // Auto-compress if needed
    if (this.shouldCompress()) {
      await this.compress();
    }

    // Evict if still over
    if (this.shouldEvict()) {
      this.evict();
    }
  }

  /**
   * Evict low-priority messages.
   */
  private evict(): void {
    // Start with ephemeral tier
    const ephemeralMessages = this.memory.evict(
      MemoryTierEnum.EPHEMERAL,
      0 // Evict all
    );

    if (ephemeralMessages.length > 0) {
      const tokens = ephemeralMessages.reduce((sum, m) => sum + (m.tokens ?? 0), 0);
      this.budget.deallocate("history", tokens);
      this.emit({ type: "message_evicted", messages: ephemeralMessages });
      this.config.onEviction?.(ephemeralMessages);
    }

    // If still over, evict from archived
    if (this.shouldEvict()) {
      const overflow = this.budget.usedTokens - this.config.maxTokens * 0.85;
      const archivedMessages = this.memory.evict(MemoryTierEnum.ARCHIVED, overflow);

      if (archivedMessages.length > 0) {
        const tokens = archivedMessages.reduce((sum, m) => sum + (m.tokens ?? 0), 0);
        this.budget.deallocate("history", tokens);
        this.emit({ type: "message_evicted", messages: archivedMessages });
        this.config.onEviction?.(archivedMessages);
      }
    }
  }

  // ===========================================================================
  // Budget Management
  // ===========================================================================

  /**
   * Get current token budget.
   */
  getBudget(): TokenBudget {
    return this.budget;
  }

  /**
   * Get budget breakdown.
   */
  getBudgetBreakdown(): {
    total: number;
    used: number;
    remaining: number;
    utilization: number;
    byTier: Record<MemoryTier, number>;
  } {
    const stats = this.memory.getStats();
    const byTier = {} as Record<MemoryTier, number>;

    for (const [tier, tierStats] of Object.entries(stats)) {
      byTier[tier as MemoryTier] = tierStats.tokens;
    }

    return {
      total: this.budget.maxTokens,
      used: this.budget.usedTokens,
      remaining: this.budget.remainingTokens,
      utilization: this.budget.utilizationRatio,
      byTier,
    };
  }

  /**
   * Update max tokens (e.g., switching to extended context).
   */
  setMaxTokens(maxTokens: number): void {
    this.budget.setMaxTokens(maxTokens);
  }

  // ===========================================================================
  // Statistics
  // ===========================================================================

  /**
   * Get context statistics.
   */
  getStats(): ContextStats {
    const messages = this.getMessages();
    const tierStats = this.memory.getStats();

    const messagesByRole: Record<MessageRole, number> = {
      system: 0,
      user: 0,
      assistant: 0,
      tool: 0,
    };

    for (const message of messages) {
      messagesByRole[message.role]++;
    }

    const tokensByTier: Record<MemoryTier, number> = {} as Record<MemoryTier, number>;
    for (const [tier, stats] of Object.entries(tierStats)) {
      tokensByTier[tier as MemoryTier] = stats.tokens;
    }

    const timestamps = messages.map((m) => m.timestamp);

    return {
      totalMessages: messages.length,
      totalTokens: this.budget.usedTokens,
      messagesByRole,
      tokensByTier,
      compressionCount: this.compressionHistory.length,
      evictionCount: 0, // Would need to track this
      averageMessageTokens:
        messages.length > 0
          ? Math.ceil(this.budget.usedTokens / messages.length)
          : 0,
      oldestMessageAge:
        timestamps.length > 0 ? Date.now() - Math.min(...timestamps) : 0,
      newestMessageAge:
        timestamps.length > 0 ? Date.now() - Math.max(...timestamps) : 0,
    };
  }

  /**
   * Get context window state.
   */
  getWindow(): ContextWindow {
    return {
      messages: this.getMessages(),
      tiers: new Map(
        Object.values(MemoryTierEnum).map((tier) => [
          tier,
          this.memory.getMessages(tier as MemoryTier),
        ])
      ),
      budget: this.budget,
      compressions: [...this.compressionHistory],
      stats: this.getStats(),
    };
  }

  // ===========================================================================
  // Events
  // ===========================================================================

  /**
   * Subscribe to context events.
   */
  on(handler: ContextEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  /**
   * Emit an event.
   */
  private emit(event: ContextEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (error) {
        console.error("Context event handler error:", error);
      }
    }
  }

  // ===========================================================================
  // Caching
  // ===========================================================================

  /**
   * Calculate cache breakpoints for prompt caching.
   */
  private calculateCacheBreakpoints(messages: ContextMessage[]): number[] {
    const breakpoints: number[] = [];

    // Cache after system messages
    let systemEnd = 0;
    for (let i = 0; i < messages.length; i++) {
      if (messages[i].role === "system") {
        systemEnd = i + 1;
      } else {
        break;
      }
    }

    if (systemEnd > 0) {
      breakpoints.push(systemEnd);
    }

    // Cache after tool definitions (if substantial)
    const toolEnd = messages.findIndex(
      (m, i) => i > systemEnd && m.role !== "tool"
    );
    if (toolEnd > systemEnd + 3) {
      // At least 3 tool messages
      breakpoints.push(toolEnd);
    }

    return breakpoints;
  }

  // ===========================================================================
  // Lifecycle
  // ===========================================================================

  /**
   * Clear all context.
   */
  clear(): void {
    this.memory.clearAll();
    this.budget.reset();
    this.compressionHistory = [];

    // Re-reserve
    this.budget.reserve(this.config.responseReserve, "response");
    this.budget.reserve(this.config.toolReserve, "tools");
  }

  /**
   * Clone the context manager.
   */
  clone(): ContextManager {
    const cloned = new ContextManager(this.config);
    cloned.budget = this.budget.clone();
    cloned.compressionHistory = [...this.compressionHistory];

    // Copy messages
    for (const message of this.getMessages()) {
      cloned.addMessage({ ...message }, { skipCompression: true });
    }

    return cloned;
  }

  // ===========================================================================
  // Serialization Support Methods
  // ===========================================================================

  /**
   * Get internal config (for serialization).
   *
   * @example
   * ```typescript
   * // Use with serialization module:
   * import { exportSessionToJSON } from '@waiboard/ai-agents/context';
   *
   * const json = exportSessionToJSON(manager, 'session-id');
   * ```
   */
  getConfig(): ContextManagerConfig {
    return { ...this.config };
  }

  /**
   * Get compression history (for serialization).
   */
  getCompressionHistory(): CompressionResult[] {
    return [...this.compressionHistory];
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a context manager with default configuration.
 */
export function createContextManager(
  config?: Partial<ContextManagerConfig>
): ContextManager {
  return new ContextManager(config);
}

/**
 * Create a context manager for a specific model.
 */
export function createContextManagerForModel(
  model: keyof typeof MODEL_CONTEXT_SIZES,
  config?: Partial<ContextManagerConfig>
): ContextManager {
  return new ContextManager({
    ...config,
    maxTokens: MODEL_CONTEXT_SIZES[model],
  });
}

/**
 * Create a context manager with extended context.
 */
export function createExtendedContextManager(
  config?: Partial<ContextManagerConfig>
): ContextManager {
  return new ContextManager({
    ...config,
    maxTokens: 1_000_000,
    tieredMemory: {
      ...DEFAULT_MEMORY_CONFIG,
      tiers: {
        ...DEFAULT_MEMORY_CONFIG.tiers,
        recent: {
          ...DEFAULT_MEMORY_CONFIG.tiers.recent,
          maxTokens: 400_000,
        },
        archived: {
          ...DEFAULT_MEMORY_CONFIG.tiers.archived,
          maxTokens: 300_000,
        },
        resources: {
          ...DEFAULT_MEMORY_CONFIG.tiers.resources,
          maxTokens: 100_000,
        },
      },
    },
  });
}

// =============================================================================
// Re-exports
// =============================================================================

export { createMessage } from "./memory.js";
export { MemoryTier } from "./types.js";
