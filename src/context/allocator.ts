/**
 * Context Allocator
 *
 * Intelligently distributes token budget across memory tiers:
 * - Priority-based allocation (critical content gets more)
 * - Dynamic rebalancing as context grows
 * - Overflow handling with graceful degradation
 */

import {
  MemoryTier,
  type ContextAllocator,
  type AllocationRequest,
  type AllocationResult,
  type ContextMessage,
  type TokenBudget,
  type TokenReservation,
  type TierConfig,
  type TokenEstimator,
} from "./types.js";
import { DEFAULT_TIER_CONFIG } from "./memory.js";
import { ClaudeTokenEstimator } from "./tokens.js";

// =============================================================================
// Allocation Strategy
// =============================================================================

/**
 * Default allocation percentages when no content exists.
 * These are starting points that get adjusted based on actual content.
 */
const DEFAULT_ALLOCATIONS: Record<MemoryTier, number> = {
  system: 0.08, // 8% for system prompts
  tools: 0.06, // 6% for tool definitions
  resources: 0.10, // 10% for resource context
  recent: 0.45, // 45% for recent conversation
  archived: 0.25, // 25% for archived/summarized
  ephemeral: 0.06, // 6% for ephemeral content
};

/**
 * Priority weights for allocation decisions.
 * Higher weight = more aggressive in keeping content.
 */
const TIER_PRIORITY_WEIGHTS: Record<MemoryTier, number> = {
  system: 100, // Never reduce
  tools: 80, // Rarely reduce
  resources: 60, // Reduce if needed
  recent: 70, // Important to keep
  archived: 40, // Can be compressed
  ephemeral: 10, // First to go
};

// =============================================================================
// Allocator Implementation
// =============================================================================

/**
 * Default context allocator with priority-based distribution.
 */
export class DefaultContextAllocator implements ContextAllocator {
  private tierConfig: Record<MemoryTier, TierConfig>;
  private estimator: TokenEstimator;

  constructor(
    tierConfig?: Partial<Record<MemoryTier, TierConfig>>,
    estimator?: TokenEstimator
  ) {
    this.tierConfig = { ...DEFAULT_TIER_CONFIG, ...tierConfig };
    this.estimator = estimator ?? new ClaudeTokenEstimator();
  }

  /**
   * Allocate budget across tiers.
   */
  allocate(request: AllocationRequest): AllocationResult {
    const { totalBudget, currentContent, incoming, reservations } = request;

    // Calculate available budget after reservations
    const reservedTokens = reservations.reduce((sum, r) => sum + r.tokens, 0);
    const availableBudget = totalBudget - reservedTokens;

    if (availableBudget <= 0) {
      return {
        allocations: this.zeroAllocations(),
        retained: new Map(),
        toCompress: [],
        toEvict: [],
        success: false,
        overflow: Math.abs(availableBudget),
      };
    }

    // Calculate current usage per tier
    const currentUsage = this.calculateUsage(currentContent);
    const incomingTokens = this.calculateIncomingTokens(incoming);
    const totalNeeded = this.sumUsage(currentUsage) + incomingTokens;

    // Check if everything fits
    if (totalNeeded <= availableBudget) {
      return this.fitAllContent(
        availableBudget,
        currentContent,
        incoming,
        currentUsage
      );
    }

    // Need to make room - prioritize what to keep
    return this.prioritizedAllocation(
      availableBudget,
      currentContent,
      incoming,
      currentUsage,
      totalNeeded
    );
  }

  /**
   * Rebalance after content changes.
   */
  rebalance(
    content: Map<MemoryTier, ContextMessage[]>,
    budget: TokenBudget
  ): AllocationResult {
    return this.allocate({
      totalBudget: budget.maxTokens,
      currentContent: content,
      reservations: [],
    });
  }

  /**
   * Get optimal allocation for a budget.
   */
  getOptimalAllocation(budget: number): Record<MemoryTier, number> {
    const allocations: Record<MemoryTier, number> = {} as Record<MemoryTier, number>;

    for (const tier of Object.values(MemoryTier)) {
      const percentage = DEFAULT_ALLOCATIONS[tier as MemoryTier];
      const maxFromConfig = this.tierConfig[tier as MemoryTier].maxTokens;
      allocations[tier as MemoryTier] = Math.min(
        Math.floor(budget * percentage),
        maxFromConfig
      );
    }

    return allocations;
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Calculate current token usage per tier.
   */
  private calculateUsage(
    content: Map<MemoryTier, ContextMessage[]>
  ): Map<MemoryTier, number> {
    const usage = new Map<MemoryTier, number>();

    for (const [tier, messages] of content.entries()) {
      const tokens = messages.reduce((sum, m) => {
        return sum + (m.tokens ?? this.estimator.estimateMessage(m));
      }, 0);
      usage.set(tier, tokens);
    }

    return usage;
  }

  /**
   * Calculate tokens for incoming content.
   */
  private calculateIncomingTokens(incoming?: ContextMessage[]): number {
    if (!incoming) return 0;
    return incoming.reduce((sum, m) => {
      return sum + (m.tokens ?? this.estimator.estimateMessage(m));
    }, 0);
  }

  /**
   * Sum all usage values.
   */
  private sumUsage(usage: Map<MemoryTier, number>): number {
    let total = 0;
    for (const tokens of usage.values()) {
      total += tokens;
    }
    return total;
  }

  /**
   * When all content fits, just allocate as-is.
   */
  private fitAllContent(
    budget: number,
    content: Map<MemoryTier, ContextMessage[]>,
    incoming: ContextMessage[] | undefined,
    usage: Map<MemoryTier, number>
  ): AllocationResult {
    const allocations = this.getOptimalAllocation(budget);
    const retained = new Map(content);

    // Add incoming to appropriate tier (usually recent)
    if (incoming?.length) {
      const recent = retained.get(MemoryTier.RECENT) ?? [];
      retained.set(MemoryTier.RECENT, [...recent, ...incoming]);
    }

    return {
      allocations,
      retained,
      toCompress: [],
      toEvict: [],
      success: true,
    };
  }

  /**
   * Prioritized allocation when content doesn't fit.
   */
  private prioritizedAllocation(
    budget: number,
    content: Map<MemoryTier, ContextMessage[]>,
    incoming: ContextMessage[] | undefined,
    usage: Map<MemoryTier, number>,
    totalNeeded: number
  ): AllocationResult {
    const overflow = totalNeeded - budget;
    const retained = new Map<MemoryTier, ContextMessage[]>();
    const toCompress: ContextMessage[] = [];
    const toEvict: ContextMessage[] = [];
    const allocations: Record<MemoryTier, number> = {} as Record<MemoryTier, number>;

    // First pass: determine minimum allocations per tier
    let minAllocated = 0;
    for (const tier of Object.values(MemoryTier)) {
      const config = this.tierConfig[tier as MemoryTier];
      allocations[tier as MemoryTier] = config.minTokens;
      minAllocated += config.minTokens;
    }

    // Remaining budget after minimums
    let remainingBudget = budget - minAllocated;

    // Sort tiers by priority weight
    const sortedTiers = Object.values(MemoryTier).sort(
      (a, b) =>
        TIER_PRIORITY_WEIGHTS[b as MemoryTier] -
        TIER_PRIORITY_WEIGHTS[a as MemoryTier]
    );

    // Allocate remaining budget by priority
    for (const tier of sortedTiers) {
      const tierKey = tier as MemoryTier;
      const config = this.tierConfig[tierKey];
      const currentTokens = usage.get(tierKey) ?? 0;

      // How much more can this tier get?
      const wantedExtra = Math.min(
        currentTokens - allocations[tierKey], // Current usage minus minimum
        config.maxTokens - allocations[tierKey] // Max minus minimum
      );

      if (wantedExtra > 0 && remainingBudget > 0) {
        const extra = Math.min(wantedExtra, remainingBudget);
        allocations[tierKey] += extra;
        remainingBudget -= extra;
      }
    }

    // Now apply allocations - decide what to keep, compress, evict
    for (const tier of sortedTiers) {
      const tierKey = tier as MemoryTier;
      const messages = content.get(tierKey) ?? [];
      const allocated = allocations[tierKey];
      const config = this.tierConfig[tierKey];

      const result = this.allocateTierContent(
        messages,
        allocated,
        config.compressible
      );

      retained.set(tierKey, result.kept);
      toCompress.push(...result.toCompress);
      toEvict.push(...result.toEvict);
    }

    // Handle incoming messages
    if (incoming?.length) {
      const recentAllocation = allocations[MemoryTier.RECENT];
      const currentRecent = retained.get(MemoryTier.RECENT) ?? [];
      const currentRecentTokens = currentRecent.reduce(
        (sum, m) => sum + (m.tokens ?? 0),
        0
      );
      const incomingTokens = this.calculateIncomingTokens(incoming);

      if (currentRecentTokens + incomingTokens <= recentAllocation) {
        retained.set(MemoryTier.RECENT, [...currentRecent, ...incoming]);
      } else {
        // Need to make room for incoming
        const neededSpace = currentRecentTokens + incomingTokens - recentAllocation;
        const evictResult = this.evictOldest(currentRecent, neededSpace);
        retained.set(MemoryTier.RECENT, [...evictResult.kept, ...incoming]);
        toEvict.push(...evictResult.evicted);
      }
    }

    const actualOverflow = this.calculateOverflow(retained, allocations);

    return {
      allocations,
      retained,
      toCompress,
      toEvict,
      success: actualOverflow <= 0,
      overflow: actualOverflow > 0 ? actualOverflow : undefined,
    };
  }

  /**
   * Allocate content within a tier's budget.
   */
  private allocateTierContent(
    messages: ContextMessage[],
    allocated: number,
    compressible: boolean
  ): {
    kept: ContextMessage[];
    toCompress: ContextMessage[];
    toEvict: ContextMessage[];
  } {
    // Sort by priority (highest first), then by recency (newest first)
    const sorted = [...messages].sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      return b.timestamp - a.timestamp;
    });

    const kept: ContextMessage[] = [];
    const toCompress: ContextMessage[] = [];
    const toEvict: ContextMessage[] = [];
    let usedTokens = 0;

    for (const message of sorted) {
      const msgTokens = message.tokens ?? this.estimator.estimateMessage(message);

      if (usedTokens + msgTokens <= allocated) {
        kept.push(message);
        usedTokens += msgTokens;
      } else if (compressible && message.compressible) {
        toCompress.push(message);
      } else {
        toEvict.push(message);
      }
    }

    // Re-sort kept by timestamp
    kept.sort((a, b) => a.timestamp - b.timestamp);

    return { kept, toCompress, toEvict };
  }

  /**
   * Evict oldest messages to free space.
   */
  private evictOldest(
    messages: ContextMessage[],
    tokensToFree: number
  ): { kept: ContextMessage[]; evicted: ContextMessage[] } {
    // Sort by timestamp ascending (oldest first)
    const sorted = [...messages].sort((a, b) => a.timestamp - b.timestamp);

    const evicted: ContextMessage[] = [];
    let freedTokens = 0;

    for (const message of sorted) {
      if (freedTokens >= tokensToFree) {
        break;
      }
      evicted.push(message);
      freedTokens += message.tokens ?? 0;
    }

    const evictedIds = new Set(evicted.map((m) => m.id));
    const kept = messages.filter((m) => !evictedIds.has(m.id));

    return { kept, evicted };
  }

  /**
   * Calculate actual overflow after allocation.
   */
  private calculateOverflow(
    retained: Map<MemoryTier, ContextMessage[]>,
    allocations: Record<MemoryTier, number>
  ): number {
    let overflow = 0;

    for (const [tier, messages] of retained.entries()) {
      const tokens = messages.reduce((sum, m) => sum + (m.tokens ?? 0), 0);
      const allocated = allocations[tier];
      if (tokens > allocated) {
        overflow += tokens - allocated;
      }
    }

    return overflow;
  }

  /**
   * Create zero allocations.
   */
  private zeroAllocations(): Record<MemoryTier, number> {
    const allocations = {} as Record<MemoryTier, number>;
    for (const tier of Object.values(MemoryTier)) {
      allocations[tier as MemoryTier] = 0;
    }
    return allocations;
  }
}

// =============================================================================
// Specialized Allocators
// =============================================================================

/**
 * Allocator optimized for coding tasks.
 * Prioritizes tool results and recent context.
 */
export class CodingAllocator extends DefaultContextAllocator {
  constructor(estimator?: TokenEstimator) {
    super(
      {
        system: { ...DEFAULT_TIER_CONFIG.system, maxTokens: 8_000 },
        tools: { ...DEFAULT_TIER_CONFIG.tools, maxTokens: 15_000 },
        resources: { ...DEFAULT_TIER_CONFIG.resources, maxTokens: 20_000 },
        recent: { ...DEFAULT_TIER_CONFIG.recent, maxTokens: 80_000 },
        archived: { ...DEFAULT_TIER_CONFIG.archived, maxTokens: 20_000 },
        ephemeral: { ...DEFAULT_TIER_CONFIG.ephemeral, maxTokens: 2_000 },
      },
      estimator
    );
  }
}

/**
 * Allocator optimized for chat/conversation.
 * Prioritizes conversation history.
 */
export class ChatAllocator extends DefaultContextAllocator {
  constructor(estimator?: TokenEstimator) {
    super(
      {
        system: { ...DEFAULT_TIER_CONFIG.system, maxTokens: 5_000 },
        tools: { ...DEFAULT_TIER_CONFIG.tools, maxTokens: 3_000 },
        resources: { ...DEFAULT_TIER_CONFIG.resources, maxTokens: 10_000 },
        recent: { ...DEFAULT_TIER_CONFIG.recent, maxTokens: 100_000 },
        archived: { ...DEFAULT_TIER_CONFIG.archived, maxTokens: 50_000 },
        ephemeral: { ...DEFAULT_TIER_CONFIG.ephemeral, maxTokens: 2_000 },
      },
      estimator
    );
  }
}

/**
 * Allocator optimized for analysis tasks.
 * Prioritizes resources and system context.
 */
export class AnalysisAllocator extends DefaultContextAllocator {
  constructor(estimator?: TokenEstimator) {
    super(
      {
        system: { ...DEFAULT_TIER_CONFIG.system, maxTokens: 15_000 },
        tools: { ...DEFAULT_TIER_CONFIG.tools, maxTokens: 5_000 },
        resources: { ...DEFAULT_TIER_CONFIG.resources, maxTokens: 60_000 },
        recent: { ...DEFAULT_TIER_CONFIG.recent, maxTokens: 40_000 },
        archived: { ...DEFAULT_TIER_CONFIG.archived, maxTokens: 20_000 },
        ephemeral: { ...DEFAULT_TIER_CONFIG.ephemeral, maxTokens: 2_000 },
      },
      estimator
    );
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create default allocator.
 */
export function createAllocator(
  tierConfig?: Partial<Record<MemoryTier, TierConfig>>,
  estimator?: TokenEstimator
): ContextAllocator {
  return new DefaultContextAllocator(tierConfig, estimator);
}

/**
 * Create allocator for specific task type.
 */
export function createTaskAllocator(
  taskType: "coding" | "chat" | "analysis",
  estimator?: TokenEstimator
): ContextAllocator {
  switch (taskType) {
    case "coding":
      return new CodingAllocator(estimator);
    case "chat":
      return new ChatAllocator(estimator);
    case "analysis":
      return new AnalysisAllocator(estimator);
    default:
      return new DefaultContextAllocator(undefined, estimator);
  }
}

// Re-export MemoryTier for convenience
export { MemoryTier } from "./types.js";
