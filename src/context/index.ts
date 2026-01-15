/**
 * Context Management Module
 *
 * State-of-the-art context window management for Claude agents.
 *
 * Features:
 * - Token counting and budget tracking
 * - Tiered memory with priority-based retention
 * - Multiple compression strategies (minify, extract, summarize)
 * - Intelligent budget allocation across tiers
 * - Automatic compression and eviction
 * - Prompt caching optimization
 *
 * @example
 * ```typescript
 * import {
 *   createContextManager,
 *   createMessage,
 *   MemoryTier,
 * } from '@waiboard/ai-agents/context';
 *
 * const manager = createContextManager({ maxTokens: 200_000 });
 *
 * // Add system prompt
 * manager.addSystemMessage('You are a helpful assistant.');
 *
 * // Add conversation
 * manager.addUserMessage('Hello!');
 * manager.addAssistantMessage('Hi there! How can I help?');
 *
 * // Prepare for API request
 * const prepared = await manager.prepareForRequest();
 * console.log(`Using ${prepared.totalTokens} tokens`);
 * console.log(`${prepared.responseTokens} tokens available for response`);
 * ```
 */

// =============================================================================
// Types
// =============================================================================

export type {
  // Token Management
  TokenEstimator,
  TokenBudget,
  TokenReservation,
  TokenBreakdown,

  // Messages
  ContextMessage,
  MessageContent,
  ContentBlock,
  TextBlock,
  ImageBlock,
  ImageContent,
  ToolUseBlock,
  ToolResultBlock,
  ToolResult,
  MessageMetadata,
  MessageRole,

  // Priority
  PriorityRules,

  // Memory
  TierConfig,
  TieredMemoryConfig,

  // Compression
  CompressionOptions,
  CompressionResult,
  ContextCompressor,

  // Allocation
  AllocationRequest,
  AllocationResult,
  ContextAllocator,

  // Context Window
  ContextWindow,
  ContextStats,

  // Manager
  ContextManagerConfig,
  AddMessageOptions,
  PrepareForRequestOptions,
  PreparedRequest,
  ContextItem,

  // Caching
  CacheConfig,
  CacheBreakpoint,
  CacheStats,

  // Events
  ContextEvent,
  ContextEventHandler,
} from "./types.js";

// Enums (exported as values)
export { MemoryTier, MessagePriority, CompressionStrategy } from "./types.js";

// =============================================================================
// Token Management
// =============================================================================

export {
  ClaudeTokenEstimator,
  TokenBudgetTracker,
  createTokenEstimator,
  createTokenBudget,
  estimateTokens,
  estimateMessageTokens,
  MODEL_CONTEXT_SIZES,
  getRecommendedReserve,
} from "./tokens.js";

// =============================================================================
// Memory Management
// =============================================================================

export {
  TieredMemory,
  DEFAULT_TIER_CONFIG,
  DEFAULT_MEMORY_CONFIG,
  DEFAULT_PRIORITY_RULES,
  createTieredMemory,
  createMessage,
} from "./memory.js";

// =============================================================================
// Compression
// =============================================================================

export {
  DefaultContextCompressor,
  createCompressor,
  createSimpleCompressor,
  createClaudeCompressor,
  quickCompress,
  getRecommendedStrategy,
  type SummarizerFn,
} from "./compressor.js";

// =============================================================================
// Tool-Specific Compressors
// =============================================================================

export {
  // Main API
  compressToolResult,
  compressToolResults,
  getCompressionRecommendation,
  // Registry
  registerToolCompressor,
  getToolCompressor,
  hasToolCompressor,
  // Generic fallback
  genericCompressor,
  // Types
  type ToolCompressor,
  type ToolCompressorOptions,
  type ToolCompressorResult,
} from "./tool-compressors.js";

// =============================================================================
// Allocation
// =============================================================================

export {
  DefaultContextAllocator,
  CodingAllocator,
  ChatAllocator,
  AnalysisAllocator,
  createAllocator,
  createTaskAllocator,
} from "./allocator.js";

// =============================================================================
// Context Manager
// =============================================================================

export {
  ContextManager,
  createContextManager,
  createContextManagerForModel,
  createExtendedContextManager,
} from "./manager.js";

// =============================================================================
// Session Serialization
// =============================================================================

export {
  // Serializer
  SessionSerializer,
  // Storage backends
  MemoryStorage,
  FileStorage,
  CustomStorage,
  // Factory functions
  createMemorySerializer,
  createFileSerializer,
  createCustomSerializer,
  // Utilities
  generateSessionId,
  exportSessionToJSON,
  importSessionFromJSON,
  cloneSession,
  mergeSessions,
} from "./serialization.js";

export type {
  // Session types
  SerializedSession,
  SerializedMessage,
  SerializedConfig,
  SerializedBudget,
  SerializedCompression,
  SerializedStats,
  SessionCheckpoint,
  SessionStorage,
  SerializeOptions,
  RestoreOptions,
} from "./types.js";

export { SERIALIZATION_VERSION } from "./types.js";

// =============================================================================
// Integrated Context (Context + Alias Resolution)
// =============================================================================

export {
  IntegratedContextManager,
  createIntegratedContext,
  preparePromptWithAliases,
  type IntegratedContextConfig,
  type AddWithAliasesOptions,
  type PreparedContext,
  type InjectorOptions,
} from "./integration.js";

// =============================================================================
// Tool Result Lifecycle (Gap 3)
// =============================================================================

export {
  ToolResultLifecycle,
  createToolResultLifecycle,
  getStageLabel,
  needsCompression,
  type ToolResultStage,
  type ToolResultWithAge,
  type AgeingReport,
  type ToolLifecycleConfig,
} from "./tool-lifecycle.js";

// =============================================================================
// Echo Poisoning Prevention (Gap 4)
// =============================================================================

export {
  EchoPoisoningPrevention,
  createEchoPoisoningPrevention,
  validateElementIds,
  type CorrectionType,
  type Correction,
  type ValidationIssue,
  type ValidationResult,
  type LoopDetection,
  type EchoPoisoningConfig,
} from "./echo-prevention.js";

// =============================================================================
// Staleness Detection (Gap 6)
// =============================================================================

export {
  detectStaleness,
  detectCanvasChanges,
  isElementIdValid,
  filterValidElementIds,
  formatAge,
  getStalenessColor,
  createStalenessContextMessage,
  createCanvasStateMetadata,
  mergeCanvasStateMetadata,
  type StalenessLevel,
  type Contradiction,
  type StalenessReport,
  type CanvasChangeReport,
  type StalenessConfig,
} from "./staleness.js";
