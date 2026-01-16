/**
 * Tiered Memory System
 *
 * Organizes context into tiers with different retention policies:
 * - SYSTEM: Never evicted (instructions, prompts)
 * - TOOLS: Rarely evicted (tool definitions)
 * - RESOURCES: Managed separately (alias-resolved context)
 * - RECENT: Full detail (last N turns)
 * - ARCHIVED: Summarized (older conversation)
 * - EPHEMERAL: Dropped first (debug, verbose output)
 */

import {
  MessagePriority,
  MemoryTier,
  type ContextMessage,
  type TierConfig,
  type TieredMemoryConfig,
  type PriorityRules,
  type MessageRole,
  type TokenEstimator,
} from "./types.js";
import { ClaudeTokenEstimator } from "./tokens.js";

// =============================================================================
// Default Configuration
// =============================================================================

export const DEFAULT_TIER_CONFIG: Record<MemoryTier, TierConfig> = {
  system: {
    maxTokens: 10_000,
    minTokens: 1_000,
    compressible: false,
  },
  tools: {
    maxTokens: 8_000,
    minTokens: 2_000,
    compressible: false,
  },
  resources: {
    maxTokens: 15_000,
    minTokens: 1_000,
    compressible: true,
    compressionTarget: 0.5,
  },
  recent: {
    maxTokens: 50_000,
    minTokens: 10_000,
    compressible: false,
    priorityThreshold: MessagePriority.NORMAL,
  },
  archived: {
    maxTokens: 30_000,
    minTokens: 5_000,
    compressible: true,
    compressionTarget: 0.3,
    priorityThreshold: MessagePriority.LOW,
  },
  ephemeral: {
    maxTokens: 5_000,
    minTokens: 0,
    compressible: true,
    compressionTarget: 0.1,
    priorityThreshold: MessagePriority.EPHEMERAL,
  },
};

export const DEFAULT_MEMORY_CONFIG: TieredMemoryConfig = {
  tiers: DEFAULT_TIER_CONFIG,
  recentTurnsCount: 10,
  compressionThreshold: 0.7,
  evictionThreshold: 0.9,
};

export const DEFAULT_PRIORITY_RULES: PriorityRules = {
  roleDefaults: {
    system: MessagePriority.SYSTEM,
    user: MessagePriority.NORMAL,
    assistant: MessagePriority.NORMAL,
    tool: MessagePriority.HIGH,
  },
  keywordBoosts: [
    { pattern: /error|exception|failed/i, boost: 25 },
    { pattern: /important|critical|must/i, boost: 20 },
    { pattern: /remember|note|key/i, boost: 15 },
    { pattern: /decision|choice|selected/i, boost: 10 },
  ],
  toolPriorities: {
    Read: MessagePriority.HIGH,
    Write: MessagePriority.CRITICAL,
    Edit: MessagePriority.CRITICAL,
    Bash: MessagePriority.HIGH,
    Grep: MessagePriority.NORMAL,
    Glob: MessagePriority.LOW,
  },
  recencyWeight: 0.1, // Boost per position from end
};

// =============================================================================
// Tiered Memory Implementation
// =============================================================================

export class TieredMemory {
  private tiers: Map<MemoryTier, ContextMessage[]> = new Map();
  private config: TieredMemoryConfig;
  private priorityRules: PriorityRules;
  private estimator: TokenEstimator;
  private tokenCounts: Map<MemoryTier, number> = new Map();

  constructor(
    config: Partial<TieredMemoryConfig> = {},
    priorityRules: Partial<PriorityRules> = {},
    estimator?: TokenEstimator
  ) {
    this.config = { ...DEFAULT_MEMORY_CONFIG, ...config };
    this.priorityRules = { ...DEFAULT_PRIORITY_RULES, ...priorityRules };
    this.estimator = estimator ?? new ClaudeTokenEstimator();

    // Initialize tiers
    for (const tier of Object.values(MemoryTier)) {
      this.tiers.set(tier as MemoryTier, []);
      this.tokenCounts.set(tier as MemoryTier, 0);
    }
  }

  /**
   * Add a message to the appropriate tier.
   */
  addMessage(message: ContextMessage, forceTier?: MemoryTier): void {
    // Ensure message has tokens computed
    if (message.tokens === undefined) {
      message.tokens = this.estimator.estimateMessage(message);
    }

    // Determine tier
    const tier = forceTier ?? this.determineTier(message);

    // Add to tier
    const tierMessages = this.tiers.get(tier) ?? [];
    tierMessages.push(message);
    this.tiers.set(tier, tierMessages);

    // Update token count
    const currentTokens = this.tokenCounts.get(tier) ?? 0;
    this.tokenCounts.set(tier, currentTokens + (message.tokens ?? 0));
  }

  /**
   * Get all messages from a tier.
   */
  getMessages(tier: MemoryTier): ContextMessage[] {
    return [...(this.tiers.get(tier) ?? [])];
  }

  /**
   * Get all messages across all tiers, ordered correctly.
   */
  getAllMessages(): ContextMessage[] {
    const allMessages: ContextMessage[] = [];

    // System first
    allMessages.push(...this.getMessages(MemoryTier.SYSTEM));

    // Tools
    allMessages.push(...this.getMessages(MemoryTier.TOOLS));

    // Resources
    allMessages.push(...this.getMessages(MemoryTier.RESOURCES));

    // Archived (summarized history)
    allMessages.push(...this.getMessages(MemoryTier.ARCHIVED));

    // Recent (full detail)
    allMessages.push(...this.getMessages(MemoryTier.RECENT));

    // Ephemeral
    allMessages.push(...this.getMessages(MemoryTier.EPHEMERAL));

    // Sort by timestamp
    return allMessages.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Get token count for a tier.
   */
  getTierTokens(tier: MemoryTier): number {
    return this.tokenCounts.get(tier) ?? 0;
  }

  /**
   * Get total tokens across all tiers.
   */
  getTotalTokens(): number {
    let total = 0;
    for (const count of this.tokenCounts.values()) {
      total += count;
    }
    return total;
  }

  /**
   * Check if a tier is over its limit.
   */
  isTierOverLimit(tier: MemoryTier): boolean {
    const config = this.config.tiers[tier];
    return this.getTierTokens(tier) > config.maxTokens;
  }

  /**
   * Get overflow amount for a tier.
   */
  getTierOverflow(tier: MemoryTier): number {
    const config = this.config.tiers[tier];
    return Math.max(0, this.getTierTokens(tier) - config.maxTokens);
  }

  /**
   * Determine the appropriate tier for a message.
   */
  private determineTier(message: ContextMessage): MemoryTier {
    // System messages always go to system tier
    if (message.role === "system") {
      return MemoryTier.SYSTEM;
    }

    // Critical priority goes to system tier
    if (message.priority >= MessagePriority.CRITICAL) {
      return MemoryTier.SYSTEM;
    }

    // Tool messages
    if (message.role === "tool") {
      return MemoryTier.TOOLS;
    }

    // Check if ephemeral
    if (message.priority <= MessagePriority.EPHEMERAL) {
      return MemoryTier.EPHEMERAL;
    }

    // Check if within recent window
    const recentMessages = this.tiers.get(MemoryTier.RECENT) ?? [];
    const recentTurns = this.countTurns(recentMessages);

    if (recentTurns < this.config.recentTurnsCount) {
      return MemoryTier.RECENT;
    }

    // Otherwise, goes to archived
    return MemoryTier.ARCHIVED;
  }

  /**
   * Count conversation turns (user-assistant pairs).
   */
  private countTurns(messages: ContextMessage[]): number {
    let turns = 0;
    for (const message of messages) {
      if (message.role === "user") {
        turns++;
      }
    }
    return turns;
  }

  /**
   * Calculate priority for a message.
   */
  calculatePriority(
    message: ContextMessage,
    position: number,
    total: number
  ): MessagePriority {
    // Start with role default
    let priority = this.priorityRules.roleDefaults[message.role];

    // Apply keyword boosts
    const content =
      typeof message.content === "string"
        ? message.content
        : JSON.stringify(message.content);

    for (const { pattern, boost } of this.priorityRules.keywordBoosts) {
      if (pattern.test(content)) {
        priority += boost;
      }
    }

    // Apply recency boost
    const recencyBoost =
      (total - position) * this.priorityRules.recencyWeight * 10;
    priority += recencyBoost;

    // Check metadata flags
    if (message.metadata?.critical) {
      priority = Math.max(priority, MessagePriority.CRITICAL);
    }

    // Clamp to valid range
    return Math.min(MessagePriority.SYSTEM, Math.max(0, priority));
  }

  /**
   * Promote messages from archived to recent.
   */
  promoteToRecent(messageIds: string[]): void {
    const archived = this.tiers.get(MemoryTier.ARCHIVED) ?? [];
    const recent = this.tiers.get(MemoryTier.RECENT) ?? [];

    const toPromote: ContextMessage[] = [];
    const remaining: ContextMessage[] = [];

    for (const message of archived) {
      if (messageIds.includes(message.id)) {
        toPromote.push(message);
      } else {
        remaining.push(message);
      }
    }

    this.tiers.set(MemoryTier.ARCHIVED, remaining);
    this.tiers.set(MemoryTier.RECENT, [...recent, ...toPromote]);

    // Update token counts
    const promotedTokens = toPromote.reduce((sum, m) => sum + (m.tokens ?? 0), 0);
    this.tokenCounts.set(
      MemoryTier.ARCHIVED,
      (this.tokenCounts.get(MemoryTier.ARCHIVED) ?? 0) - promotedTokens
    );
    this.tokenCounts.set(
      MemoryTier.RECENT,
      (this.tokenCounts.get(MemoryTier.RECENT) ?? 0) + promotedTokens
    );
  }

  /**
   * Demote messages from recent to archived.
   */
  demoteToArchived(count: number): ContextMessage[] {
    const recent = this.tiers.get(MemoryTier.RECENT) ?? [];

    if (recent.length <= count) {
      return [];
    }

    // Take oldest messages
    const toDemote = recent.slice(0, count);
    const remaining = recent.slice(count);

    this.tiers.set(MemoryTier.RECENT, remaining);

    const archived = this.tiers.get(MemoryTier.ARCHIVED) ?? [];
    this.tiers.set(MemoryTier.ARCHIVED, [...archived, ...toDemote]);

    // Update token counts
    const demotedTokens = toDemote.reduce((sum, m) => sum + (m.tokens ?? 0), 0);
    this.tokenCounts.set(
      MemoryTier.RECENT,
      (this.tokenCounts.get(MemoryTier.RECENT) ?? 0) - demotedTokens
    );
    this.tokenCounts.set(
      MemoryTier.ARCHIVED,
      (this.tokenCounts.get(MemoryTier.ARCHIVED) ?? 0) + demotedTokens
    );

    return toDemote;
  }

  /**
   * Evict messages from a tier.
   */
  evict(tier: MemoryTier, targetTokens: number): ContextMessage[] {
    const messages = this.tiers.get(tier) ?? [];
    const config = this.config.tiers[tier];

    // Ensure we keep minimum tokens
    const minToKeep = config.minTokens;
    const currentTokens = this.getTierTokens(tier);
    const toRemove = currentTokens - Math.max(targetTokens, minToKeep);

    if (toRemove <= 0) {
      return [];
    }

    // Sort by priority (lowest first) then by age (oldest first)
    const sorted = [...messages].sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      return a.timestamp - b.timestamp;
    });

    const evicted: ContextMessage[] = [];
    let removedTokens = 0;

    for (const message of sorted) {
      if (removedTokens >= toRemove) {
        break;
      }

      // Don't evict non-compressible messages from non-compressible tiers
      if (!config.compressible && !message.compressible) {
        continue;
      }

      evicted.push(message);
      removedTokens += message.tokens ?? 0;
    }

    // Remove evicted messages
    const evictedIds = new Set(evicted.map((m) => m.id));
    this.tiers.set(
      tier,
      messages.filter((m) => !evictedIds.has(m.id))
    );

    // Update token count
    this.tokenCounts.set(tier, currentTokens - removedTokens);

    return evicted;
  }

  /**
   * Replace messages in a tier (for compression).
   */
  replaceMessages(
    tier: MemoryTier,
    oldIds: string[],
    newMessages: ContextMessage[]
  ): void {
    const messages = this.tiers.get(tier) ?? [];
    const oldIdSet = new Set(oldIds);

    // Calculate token change
    const oldTokens = messages
      .filter((m) => oldIdSet.has(m.id))
      .reduce((sum, m) => sum + (m.tokens ?? 0), 0);
    const newTokens = newMessages.reduce((sum, m) => sum + (m.tokens ?? 0), 0);

    // Replace messages
    const filtered = messages.filter((m) => !oldIdSet.has(m.id));
    this.tiers.set(tier, [...filtered, ...newMessages]);

    // Update token count
    const currentTokens = this.tokenCounts.get(tier) ?? 0;
    this.tokenCounts.set(tier, currentTokens - oldTokens + newTokens);
  }

  /**
   * Clear a tier.
   */
  clearTier(tier: MemoryTier): ContextMessage[] {
    const messages = this.tiers.get(tier) ?? [];
    this.tiers.set(tier, []);
    this.tokenCounts.set(tier, 0);
    return messages;
  }

  /**
   * Clear all tiers.
   */
  clearAll(): void {
    for (const tier of Object.values(MemoryTier)) {
      this.clearTier(tier as MemoryTier);
    }
  }

  /**
   * Get tier statistics.
   */
  getStats(): Record<
    MemoryTier,
    { messages: number; tokens: number; limit: number; utilization: number }
  > {
    const stats = {} as Record<
      MemoryTier,
      { messages: number; tokens: number; limit: number; utilization: number }
    >;

    for (const tier of Object.values(MemoryTier)) {
      const messages = this.tiers.get(tier as MemoryTier) ?? [];
      const tokens = this.getTierTokens(tier as MemoryTier);
      const limit = this.config.tiers[tier as MemoryTier].maxTokens;

      stats[tier as MemoryTier] = {
        messages: messages.length,
        tokens,
        limit,
        utilization: tokens / limit,
      };
    }

    return stats;
  }

  /**
   * Get messages that need compression.
   */
  getMessagesNeedingCompression(): {
    tier: MemoryTier;
    messages: ContextMessage[];
    overflow: number;
  }[] {
    const results: {
      tier: MemoryTier;
      messages: ContextMessage[];
      overflow: number;
    }[] = [];

    for (const tier of Object.values(MemoryTier)) {
      const config = this.config.tiers[tier as MemoryTier];

      if (!config.compressible) {
        continue;
      }

      const overflow = this.getTierOverflow(tier as MemoryTier);

      if (overflow > 0) {
        const messages = this.getMessages(tier as MemoryTier).filter(
          (m) => m.compressible
        );

        if (messages.length > 0) {
          results.push({
            tier: tier as MemoryTier,
            messages,
            overflow,
          });
        }
      }
    }

    return results;
  }

  /**
   * Clone the memory state.
   */
  clone(): TieredMemory {
    const clone = new TieredMemory(
      this.config,
      this.priorityRules,
      this.estimator
    );

    for (const [tier, messages] of this.tiers.entries()) {
      clone.tiers.set(
        tier,
        messages.map((m) => ({ ...m }))
      );
      clone.tokenCounts.set(tier, this.tokenCounts.get(tier) ?? 0);
    }

    return clone;
  }
}

// =============================================================================
// Memory Tier Enum (re-export for convenience)
// =============================================================================

export { MemoryTier } from "./types.js";

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a tiered memory instance with default configuration.
 */
export function createTieredMemory(
  config?: Partial<TieredMemoryConfig>,
  priorityRules?: Partial<PriorityRules>
): TieredMemory {
  return new TieredMemory(config, priorityRules);
}

/**
 * Create a message with proper defaults.
 */
export function createMessage(
  role: MessageRole,
  content: string,
  options: Partial<ContextMessage> = {}
): ContextMessage {
  return {
    id: options.id ?? `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    timestamp: options.timestamp ?? Date.now(),
    priority: options.priority ?? DEFAULT_PRIORITY_RULES.roleDefaults[role],
    compressible: options.compressible ?? role !== "system",
    metadata: options.metadata,
    summarizedFrom: options.summarizedFrom,
  };
}
