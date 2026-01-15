/**
 * Context Management Types
 *
 * State-of-the-art context window management for maximum agent efficiency.
 *
 * Architecture Overview:
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │                         ContextManager (Facade)                          │
 * ├──────────────────────────────────────────────────────────────────────────┤
 * │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
 * │  │ TokenBudget │  │ TieredMem   │  │ Compressor  │  │ Allocator       │  │
 * │  │ - counting  │  │ - system    │  │ - semantic  │  │ - priority-based│  │
 * │  │ - tracking  │  │ - tool      │  │ - lossless  │  │ - dynamic       │  │
 * │  │ - limits    │  │ - history   │  │ - lossy     │  │ - overflow      │  │
 * │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────┘  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Key Strategies:
 * 1. Tiered Memory - Different retention for system/tool/conversation
 * 2. Semantic Compression - AI-powered summarization of older turns
 * 3. Priority Allocation - Critical content preserved, optional trimmed
 * 4. Prompt Caching - Static prefixes cached for efficiency
 * 5. Sliding Window - Recent turns full detail, older summarized
 */

// =============================================================================
// Token Counting
// =============================================================================

/**
 * Token estimation for different content types.
 * Uses heuristics calibrated for Claude's tokenizer.
 */
export interface TokenEstimator {
  /** Estimate tokens for text content */
  estimateText(text: string): number;

  /** Estimate tokens for a message */
  estimateMessage(message: ContextMessage): number;

  /** Estimate tokens for tool result */
  estimateToolResult(result: ToolResult): number;

  /** Estimate tokens for image (base64 or URL) */
  estimateImage(image: ImageContent): number;

  /** Batch estimation for efficiency */
  estimateBatch(items: ContextItem[]): number;
}

/**
 * Token budget tracking and enforcement.
 */
export interface TokenBudget {
  /** Maximum tokens available */
  readonly maxTokens: number;

  /** Currently used tokens */
  readonly usedTokens: number;

  /** Remaining tokens */
  readonly remainingTokens: number;

  /** Usage percentage (0-1) */
  readonly utilizationRatio: number;

  /** Check if content fits */
  canFit(tokens: number): boolean;

  /** Reserve tokens for future use */
  reserve(tokens: number, label: string): TokenReservation;

  /** Release a reservation */
  release(reservation: TokenReservation): void;

  /** Get breakdown by category */
  getBreakdown(): TokenBreakdown;
}

export interface TokenReservation {
  id: string;
  label: string;
  tokens: number;
  createdAt: number;
}

export interface TokenBreakdown {
  system: number;
  tools: number;
  history: number;
  resources: number;
  reserved: number;
  available: number;
}

// =============================================================================
// Message Types
// =============================================================================

export type MessageRole = "system" | "user" | "assistant" | "tool";

export interface ContextMessage {
  id: string;
  role: MessageRole;
  content: MessageContent;
  timestamp: number;

  /** Token count (computed lazily) */
  tokens?: number;

  /** Priority for retention (higher = more important) */
  priority: MessagePriority;

  /** Whether this message can be summarized */
  compressible: boolean;

  /** Original message if this is a summary */
  summarizedFrom?: string[];

  /** Metadata for the message */
  metadata?: MessageMetadata;
}

export type MessageContent = string | ContentBlock[];

export type ContentBlock =
  | TextBlock
  | ImageBlock
  | ToolUseBlock
  | ToolResultBlock;

export interface TextBlock {
  type: "text";
  text: string;
}

export interface ImageBlock {
  type: "image";
  source: ImageContent;
}

export interface ImageContent {
  type: "base64" | "url";
  mediaType?: string;
  data: string;
}

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
}

export interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string | ContentBlock[];
  is_error?: boolean;
}

export interface ToolResult {
  toolUseId: string;
  name: string;
  content: string;
  isError?: boolean;
  tokens?: number;
}

export interface MessageMetadata {
  /** Source of the message (user input, tool, agent) */
  source?: string;

  /** Tags for categorization */
  tags?: string[];

  /** Whether this contains critical information */
  critical?: boolean;

  /** Custom data */
  [key: string]: unknown;
}

// =============================================================================
// Priority System
// =============================================================================

/**
 * Message priority levels for retention decisions.
 * Higher values = higher priority = retained longer.
 */
export enum MessagePriority {
  /** Can be dropped immediately (debug logs, verbose output) */
  EPHEMERAL = 0,

  /** Low priority, summarize aggressively */
  LOW = 25,

  /** Normal conversation, standard summarization */
  NORMAL = 50,

  /** Important context, preserve longer */
  HIGH = 75,

  /** Critical information, never summarize */
  CRITICAL = 100,

  /** System prompts, never remove */
  SYSTEM = 200,
}

/**
 * Priority assignment rules.
 */
export interface PriorityRules {
  /** Default priority for each role */
  roleDefaults: Record<MessageRole, MessagePriority>;

  /** Priority boost for messages containing keywords */
  keywordBoosts: Array<{ pattern: RegExp; boost: number }>;

  /** Priority for tool results by tool name */
  toolPriorities: Record<string, MessagePriority>;

  /** Recency boost (newer messages get higher priority) */
  recencyWeight: number;
}

// =============================================================================
// Tiered Memory
// =============================================================================

/**
 * Memory tiers with different retention policies.
 */
export enum MemoryTier {
  /** System prompts, instructions - never evicted */
  SYSTEM = "system",

  /** Tool definitions - rarely evicted */
  TOOLS = "tools",

  /** Resource context (from aliases) - managed separately */
  RESOURCES = "resources",

  /** Recent conversation - full detail */
  RECENT = "recent",

  /** Older conversation - summarized */
  ARCHIVED = "archived",

  /** Ephemeral - dropped when needed */
  EPHEMERAL = "ephemeral",
}

export interface TierConfig {
  /** Maximum tokens for this tier */
  maxTokens: number;

  /** Minimum tokens to always preserve */
  minTokens: number;

  /** Whether content can be compressed */
  compressible: boolean;

  /** Compression ratio target (e.g., 0.3 = 30% of original) */
  compressionTarget?: number;

  /** Priority threshold - messages below this get moved to lower tier */
  priorityThreshold?: MessagePriority;
}

export interface TieredMemoryConfig {
  tiers: Record<MemoryTier, TierConfig>;

  /** Number of recent turns to keep in full detail */
  recentTurnsCount: number;

  /** When to trigger compression (0-1 utilization ratio) */
  compressionThreshold: number;

  /** When to trigger aggressive eviction */
  evictionThreshold: number;
}

// =============================================================================
// Compression
// =============================================================================

/**
 * Compression strategies for reducing context size.
 */
export enum CompressionStrategy {
  /** No compression */
  NONE = "none",

  /** Simple truncation (lossy) */
  TRUNCATE = "truncate",

  /** Remove redundant whitespace, formatting */
  MINIFY = "minify",

  /** Extract key information (semi-lossy) */
  EXTRACT = "extract",

  /** AI-powered summarization (lossy but semantic) */
  SUMMARIZE = "summarize",

  /** Hierarchical summarization for long histories */
  HIERARCHICAL = "hierarchical",

  /**
   * Tool-aware compression (hybrid approach)
   *
   * Uses domain-specific compressors for tool outputs:
   * - Read: preserves structure, imports, exports, signatures
   * - Grep: preserves counts, file distribution, samples
   * - Bash: prioritizes errors, preserves exit code
   * - Canvas: preserves IDs, types, bounds
   *
   * Falls back to EXTRACT for non-tool content.
   * This beats pure strategy-based compression by understanding semantics.
   */
  TOOL_AWARE = "tool_aware",
}

export interface CompressionOptions {
  strategy: CompressionStrategy;

  /** Target token count after compression */
  targetTokens?: number;

  /** Target compression ratio (0-1) */
  targetRatio?: number;

  /** Preserve these patterns even in lossy compression */
  preservePatterns?: RegExp[];

  /** Custom summarization prompt */
  summaryPrompt?: string;
}

export interface CompressionResult {
  original: ContextMessage[];
  compressed: ContextMessage[];
  originalTokens: number;
  compressedTokens: number;
  ratio: number;
  strategy: CompressionStrategy;
  lossiness: "none" | "minimal" | "moderate" | "high";
}

/**
 * Compressor interface for pluggable compression strategies.
 */
export interface ContextCompressor {
  /** Compress messages using specified strategy */
  compress(
    messages: ContextMessage[],
    options: CompressionOptions
  ): Promise<CompressionResult>;

  /** Estimate compression result without actually compressing */
  estimate(
    messages: ContextMessage[],
    options: CompressionOptions
  ): Promise<{ estimatedTokens: number; estimatedRatio: number }>;

  /** Check if compression is recommended */
  shouldCompress(messages: ContextMessage[], budget: TokenBudget): boolean;
}

// =============================================================================
// Allocation
// =============================================================================

/**
 * Budget allocation across tiers.
 */
export interface AllocationRequest {
  /** Total available tokens */
  totalBudget: number;

  /** Current content by tier */
  currentContent: Map<MemoryTier, ContextMessage[]>;

  /** Incoming content to add */
  incoming?: ContextMessage[];

  /** Reserved tokens (for response, tools, etc.) */
  reservations: TokenReservation[];
}

export interface AllocationResult {
  /** Tokens allocated per tier */
  allocations: Record<MemoryTier, number>;

  /** Messages to keep (per tier) */
  retained: Map<MemoryTier, ContextMessage[]>;

  /** Messages to compress */
  toCompress: ContextMessage[];

  /** Messages to evict */
  toEvict: ContextMessage[];

  /** Whether allocation succeeded */
  success: boolean;

  /** Overflow amount if allocation failed */
  overflow?: number;
}

export interface ContextAllocator {
  /** Allocate budget across tiers */
  allocate(request: AllocationRequest): AllocationResult;

  /** Rebalance after content changes */
  rebalance(
    content: Map<MemoryTier, ContextMessage[]>,
    budget: TokenBudget
  ): AllocationResult;

  /** Get optimal allocation for a budget */
  getOptimalAllocation(budget: number): Record<MemoryTier, number>;
}

// =============================================================================
// Context Window
// =============================================================================

/**
 * Complete context window state.
 */
export interface ContextWindow {
  /** All messages in the window */
  messages: ContextMessage[];

  /** Messages organized by tier */
  tiers: Map<MemoryTier, ContextMessage[]>;

  /** Current token budget */
  budget: TokenBudget;

  /** Compression history */
  compressions: CompressionResult[];

  /** Statistics */
  stats: ContextStats;
}

export interface ContextStats {
  totalMessages: number;
  totalTokens: number;
  messagesByRole: Record<MessageRole, number>;
  tokensByTier: Record<MemoryTier, number>;
  compressionCount: number;
  evictionCount: number;
  averageMessageTokens: number;
  oldestMessageAge: number;
  newestMessageAge: number;
}

// =============================================================================
// Context Manager
// =============================================================================

/**
 * Main context management interface.
 */
export interface ContextManagerConfig {
  /** Maximum context window size */
  maxTokens: number;

  /** Token estimator implementation */
  estimator?: TokenEstimator;

  /** Tiered memory configuration */
  tieredMemory: TieredMemoryConfig;

  /** Compressor implementation */
  compressor?: ContextCompressor;

  /** Allocator implementation */
  allocator?: ContextAllocator;

  /** Priority rules */
  priorityRules?: PriorityRules;

  /** Reserve tokens for response generation */
  responseReserve: number;

  /** Reserve tokens for tool calls */
  toolReserve: number;

  /** Enable prompt caching optimization */
  enableCaching: boolean;

  /** Callback when compression occurs */
  onCompression?: (result: CompressionResult) => void;

  /** Callback when eviction occurs */
  onEviction?: (messages: ContextMessage[]) => void;
}

export interface AddMessageOptions {
  /** Override default priority */
  priority?: MessagePriority;

  /** Force into specific tier */
  tier?: MemoryTier;

  /** Metadata to attach */
  metadata?: MessageMetadata;

  /** Skip compression check */
  skipCompression?: boolean;
}

export interface PrepareForRequestOptions {
  /** Additional tokens to reserve */
  additionalReserve?: number;

  /** Force compression before request */
  forceCompression?: boolean;

  /** Include system messages */
  includeSystem?: boolean;

  /** Maximum messages to include */
  maxMessages?: number;
}

export interface PreparedRequest {
  /** Messages ready for API request */
  messages: ContextMessage[];

  /** Total tokens in request */
  totalTokens: number;

  /** Tokens available for response */
  responseTokens: number;

  /** Whether compression was applied */
  wasCompressed: boolean;

  /** Cache breakpoints for prompt caching */
  cacheBreakpoints?: number[];
}

/**
 * Context item for batch operations.
 */
export type ContextItem =
  | { type: "message"; message: ContextMessage }
  | { type: "tool_result"; result: ToolResult }
  | { type: "text"; text: string };

// =============================================================================
// Prompt Caching
// =============================================================================

/**
 * Prompt caching configuration for efficiency.
 */
export interface CacheConfig {
  /** Enable prompt caching */
  enabled: boolean;

  /** Minimum tokens for caching to be worthwhile */
  minTokensForCache: number;

  /** Cache breakpoint positions */
  breakpoints: CacheBreakpoint[];
}

export interface CacheBreakpoint {
  /** Position in message array */
  position: number;

  /** Cache control type */
  type: "ephemeral";
}

export interface CacheStats {
  /** Tokens served from cache */
  cachedTokens: number;

  /** Tokens not cached */
  uncachedTokens: number;

  /** Cache hit ratio */
  hitRatio: number;

  /** Estimated cost savings */
  costSavings: number;
}

// =============================================================================
// Events
// =============================================================================

export type ContextEvent =
  | { type: "message_added"; message: ContextMessage }
  | { type: "message_evicted"; messages: ContextMessage[] }
  | { type: "compression_started"; messages: ContextMessage[] }
  | { type: "compression_completed"; result: CompressionResult }
  | { type: "tier_overflow"; tier: MemoryTier; overflow: number }
  | { type: "budget_warning"; utilizationRatio: number }
  | { type: "budget_critical"; utilizationRatio: number };

export type ContextEventHandler = (event: ContextEvent) => void;

// =============================================================================
// Session Serialization
// =============================================================================

/**
 * Serialization format version for migrations.
 */
export const SERIALIZATION_VERSION = 1;

/**
 * Serialized session state for persistence.
 */
export interface SerializedSession {
  /** Format version for migrations */
  version: number;

  /** Session identifier */
  sessionId: string;

  /** Creation timestamp */
  createdAt: number;

  /** Last update timestamp */
  updatedAt: number;

  /** Serialized configuration */
  config: SerializedConfig;

  /** Messages organized by tier */
  tiers: Record<MemoryTier, SerializedMessage[]>;

  /** Budget state */
  budget: SerializedBudget;

  /** Compression history */
  compressions: SerializedCompression[];

  /** Statistics snapshot */
  stats: SerializedStats;

  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Minimal configuration for restoration.
 */
export interface SerializedConfig {
  maxTokens: number;
  responseReserve: number;
  toolReserve: number;
  enableCaching: boolean;
  compressionThreshold: number;
  evictionThreshold: number;
}

/**
 * Serialized message (stripped of functions/circular refs).
 */
export interface SerializedMessage {
  id: string;
  role: MessageRole;
  content: string | ContentBlock[];
  timestamp: number;
  tokens: number;
  priority: MessagePriority;
  compressible: boolean;
  metadata?: MessageMetadata;
  summarizedFrom?: string[];
}

/**
 * Serialized budget state.
 */
export interface SerializedBudget {
  maxTokens: number;
  allocations: Record<string, number>;
  reservations: Array<{
    id: string;
    label: string;
    tokens: number;
    createdAt: number;
  }>;
}

/**
 * Serialized compression record.
 */
export interface SerializedCompression {
  timestamp: number;
  originalTokens: number;
  compressedTokens: number;
  ratio: number;
  strategy: CompressionStrategy;
  affectedMessageIds: string[];
}

/**
 * Serialized statistics.
 */
export interface SerializedStats {
  totalMessages: number;
  totalTokens: number;
  compressionCount: number;
  evictionCount: number;
  messagesByRole: Record<MessageRole, number>;
  messagesByTier: Record<MemoryTier, number>;
}

/**
 * Session checkpoint for incremental saves.
 */
export interface SessionCheckpoint {
  /** Checkpoint identifier */
  checkpointId: string;

  /** Parent session ID */
  sessionId: string;

  /** Checkpoint timestamp */
  timestamp: number;

  /** Messages added since last checkpoint */
  newMessages: SerializedMessage[];

  /** Message IDs evicted since last checkpoint */
  evictedIds: string[];

  /** Budget delta */
  budgetDelta: {
    allocations: Record<string, number>;
  };

  /** Checkpoint metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Storage backend interface.
 */
export interface SessionStorage {
  /** Save a full session */
  save(session: SerializedSession): Promise<void>;

  /** Load a session by ID */
  load(sessionId: string): Promise<SerializedSession | null>;

  /** Delete a session */
  delete(sessionId: string): Promise<void>;

  /** List all session IDs */
  list(): Promise<string[]>;

  /** Check if a session exists */
  exists(sessionId: string): Promise<boolean>;

  /** Save a checkpoint (optional optimization) */
  saveCheckpoint?(checkpoint: SessionCheckpoint): Promise<void>;

  /** Load checkpoints since a timestamp */
  loadCheckpoints?(sessionId: string, since: number): Promise<SessionCheckpoint[]>;
}

/**
 * Serialization options.
 */
export interface SerializeOptions {
  /** Include compression history */
  includeCompressionHistory?: boolean;

  /** Include detailed statistics */
  includeStats?: boolean;

  /** Custom metadata to attach */
  metadata?: Record<string, unknown>;

  /** Compress the serialized output */
  compress?: boolean;
}

/**
 * Restore options.
 */
export interface RestoreOptions {
  /** Validate message integrity */
  validate?: boolean;

  /** Recalculate token counts */
  recalculateTokens?: boolean;

  /** Override config values */
  configOverrides?: Partial<SerializedConfig>;

  /** Skip messages older than this timestamp */
  skipMessagesBefore?: number;
}
