/**
 * @waiboard/ai-agents SDK
 *
 * Claude Agent SDK-compatible API for canvas manipulation.
 * This module provides a modern, type-safe interface aligned with
 * the official Claude Agent SDK patterns.
 *
 * @see https://platform.claude.com/docs/en/agent-sdk/typescript
 *
 * ## Quick Start
 *
 * ### Query API (V1 Pattern)
 * ```typescript
 * import { query } from '@waiboard/ai-agents/sdk';
 *
 * const messages = query('Create a flowchart', { canvasId: 'my-canvas' });
 *
 * for await (const message of messages) {
 *   if (message.type === 'result') {
 *     console.log('Done:', message.summary);
 *   }
 * }
 * ```
 *
 * ### Session API (V2 Pattern)
 * ```typescript
 * import { createSession } from '@waiboard/ai-agents/sdk';
 *
 * const session = await createSession({ canvasId: 'my-canvas' });
 *
 * await session.send('Create a flowchart');
 * for await (const msg of session.stream()) {
 *   console.log(msg);
 * }
 *
 * await session.send('Add colors');
 * for await (const msg of session.stream()) {
 *   console.log(msg);
 * }
 *
 * await session.close();
 * ```
 *
 * ### Type-Safe Tools
 * ```typescript
 * import { tool } from '@waiboard/ai-agents/sdk';
 * import { z } from 'zod';
 *
 * const myTool = tool({
 *   name: 'my_tool',
 *   description: 'Does something',
 *   inputSchema: z.object({ param: z.string() }),
 *   handler: async (input) => ({ result: input.param }),
 * });
 * ```
 *
 * @module @waiboard/ai-agents/sdk
 */

// ============================================================================
// QUERY API (V1 Pattern)
// ============================================================================

export {
  query,
  prompt,
  runQuery,
  streamQuery,
  handleQueryStream,
  handleCanvasAgentStream, // Backward compatibility alias
  type Query,
  type QueryOptions,
  type SSEResponse,
} from "./query.js";

// ============================================================================
// SESSION API (V2 Pattern)
// ============================================================================

export {
  createSession,
  resumeSession,
  createInMemoryStorage,
  type Session,
  type SessionOptions,
  type SessionMessage,
  type SessionStorage,
} from "./session.js";

// ============================================================================
// MESSAGE TYPES
// ============================================================================

export {
  // Message types
  type SDKMessage,
  type SDKMessageType,
  type SDKMessageUnion,
  type SDKAssistantMessage,
  type SDKUserMessage,
  type SDKResultMessage,
  type SDKSystemMessage,
  type SDKPartialMessage,
  type SDKPermissionDenialMessage,

  // Content blocks
  type ContentBlock,
  type TextBlock,
  type ToolUseBlock,
  type ToolResultBlock,
  type ThinkingBlock,
  type PartialEventType,

  // Type guards
  isAssistantMessage,
  isUserMessage,
  isResultMessage,
  isSystemMessage,
  isPartialMessage,
  isPermissionDenial,

  // Content extraction
  extractText,
  extractToolUse,
  extractThinking,

  // Adapters
  agentEventToSDKMessage,
  sdkMessageToAgentEvent,
} from "./messages.js";

// ============================================================================
// CONFIGURATION
// ============================================================================

export {
  // Options
  type SDKOptions,
  type CanvasAgentOptions,
  type LegacyAgentConfig,

  // Model configuration
  type ModelId,
  type ModelTier,
  MODEL_TIERS,

  // Sandbox
  type SandboxConfig,
  type NetworkConfig,

  // MCP
  type McpServerConfig,

  // Output format
  type OutputFormat,
  type OutputFormatSchema,
  type OutputFormatZod,

  // Settings
  type SettingSource,

  // Defaults and utilities
  DEFAULT_SDK_OPTIONS,
  DEFAULT_CANVAS_OPTIONS,
  mergeWithDefaults,
  migrateFromLegacyOptions,
} from "./options.js";

// ============================================================================
// HOOK SYSTEM
// ============================================================================

export {
  // Hook types
  type HookEventType,
  type HookType,
  type LegacyHookType,

  // Hook inputs
  type HookInput,
  type HookInputBase,
  type ToolHookInput,
  type SessionHookInput,
  type SubagentHookInput,
  type PermissionRequestInput,
  type UserPromptInput,
  type NotificationInput,
  type CompactInput,
  type StopInput,

  // Hook outputs
  type HookOutput,
  type PermissionOutput,

  // Hook handlers
  type HookHandler,
  type SyncHookHandler,
  type AsyncHookHandler,

  // Hook configuration
  type HookConfig,
  type HookMatcher,

  // Utilities
  normalizeHookType,
  matchesHook,
  sortHooksByPriority,

  // Presets
  createLoggingHook,
  createTimingHook,
  createBlocklistHook,
  createRateLimitHook,
} from "./hooks.js";

// ============================================================================
// TOOL MANAGEMENT
// ============================================================================

export {
  // Tool names (generic)
  CORE_AGENT_TOOLS,
  EXTENDED_AGENT_TOOLS,
  ALL_AGENT_TOOLS,
  type GenericToolName,
  type SDKToolName,

  // Tool options
  type ToolsOption,
  type ToolPreset,
  TOOL_PRESETS,
  resolveTools,

  // Permissions
  type ToolPermissionRequest,
  type ToolPermissionResult,
  type CanUseToolHandler,
  createAutoApproveHandler,
  createBlocklistHandler,
  createAllowlistHandler,
  createConfirmationHandler,
  combineHandlers,

  // Tool definition
  type ToolDefinition,
  type ToolContext,
  type ToolResult,

  // Categories
  TOOL_CATEGORIES,
  getToolsByCategory,
  isToolInCategory,
  getToolCategory,

  // Validation
  validateToolInput,
  isValidTool,

  // Documentation
  TOOL_DOCS,
  getToolDocs,
} from "./tools.js";

// ============================================================================
// TOOL FACTORY
// ============================================================================

export {
  tool,
  type Tool,
  type ToolConfig,
  type McpToolDefinition,
  type JsonSchemaToolDefinition,

  // Zod conversion
  zodToJsonSchema,

  // Registry
  ToolRegistry,
  createToolRegistry,
} from "./tool.js";

// ============================================================================
// AGENT DEFINITIONS
// ============================================================================

export {
  // Types
  type AgentDefinition,
  type AgentsOption,

  // Default agents (generic)
  GENERIC_AGENTS,

  // Prompts
  PLANNING_PROMPT,
  EXPLORING_PROMPT,
  EXECUTOR_PROMPT,
  ANALYZER_PROMPT,

  // Utilities
  getAgentDefinition,
  listAgentTypes,
  isValidAgentType,
  getAgentTools,
  getAgentPrompt,
  detectAgentType,
  getAgentConfidence,
  mergeAgents,
  exportAgentsForSettings,
} from "./agents.js";

// ============================================================================
// DELEGATION API
// ============================================================================

export {
  // SDK-aligned functions
  delegate,
  delegateAll,
  detectAgent,

  // Core delegation functions
  delegateToSubAgent,
  delegateParallel,
  executeSubagentWithMainLoop,
  detectSubAgent,
  detectAgentForTask,
  getSubAgentDefinition,
  listSubAgents,
  listCoreAgents,
  analyzeTaskForDelegation,

  // Types
  type CoreAgentType,
  type SubAgentType,
  type SubAgentDefinition,
  type SubAgentTask,
  type SubAgentResult,
  type SubAgentMetrics,
  type DelegationPlan,
  type DelegateOptions,
  type DelegateResult,

  // Constants
  CORE_AGENT_DEFINITIONS,
  SUBAGENT_DEFINITIONS,
  AgentTypes,
} from "./delegation.js";

// ============================================================================
// CONSTANTS
// ============================================================================

export {
  // Core constants
  MODEL_IDS,
  MODEL_IDS_BY_PROVIDER,
  MODEL_DEFAULTS,
  LOOP_DEFAULTS,
  ERROR_LIMITS,

  // SDK-aligned constants
  MODELS,
  DEFAULTS,
  LIMITS,
  SUBAGENT_CONFIG,
  TOKEN_BUDGETS,
} from "./constants.js";

// ============================================================================
// UTILITIES
// ============================================================================

export {
  // JSON extraction
  extractJson,
  extractAllJson,

  // Code block extraction
  extractCodeBlock,
  extractAllCodeBlocks,

  // Structured parsing
  parseStructured,
  type ParsedResponse,

  // Element ID utilities
  extractElementIds,
  isElementId,

  // XML tag extraction
  extractTag,
  extractAllTags,
  COMMON_TAGS,
} from "./utils.js";

// ============================================================================
// EXECUTION ENGINE (Native Implementation)
// ============================================================================

export {
  // Primary SDK-aligned API
  execute,
  runExecution,
  getExecutionResult,
  type ExecuteOptions,

  // Re-exports for advanced use
  runAgenticLoop,
  initializeResources,
  runCanvasAgent,
  getCanvasAgentResult,
  type LoopOptions,
  type MCPExecutor,
  type AgentResources,
  type AgentEvent,
  type AgentConfig,
  type AgentState,
  type CancellationToken,
} from "./execution.js";

// ============================================================================
// PROVIDERS (Native Implementation)
// ============================================================================

export {
  // Provider factory
  createProvider,
  isProviderAvailable,
  getAvailableProviders,
  getDefaultProvider,
  getProviderInfo,
  type ProviderInfo,

  // Provider implementations
  GoogleProvider,
  OpenAIProvider,

  // Provider types
  type LLMProvider,
  type GenerateOptions,
  type GenerateResult,
  type StreamChunk,
  type ContinueWithToolResultOptions,
  type ProviderConfig,
  type ProviderName,
  type ProviderFactory,
  type ToolCall,
  type TokenUsage,
  type ConversationMessage,

  // Schema conversion utilities
  zodToGeminiDeclaration,
  toolsToGeminiDeclarations,
  toolSetToGeminiDeclarations,
  toolsToOpenAIFormat,
  toolSetToOpenAIFormat,
} from "./providers/index.js";

// ============================================================================
// AI CLIENT (Native Implementation)
// ============================================================================

export {
  // Client factory
  createAISDKClient,
  getModelId,
  getModelForProvider,

  // Types
  type AIClientConfig,
  type ReasoningResult,

  // Message helpers
  createToolResultMessage,
  buildMessages,
} from "./client.js";

// ============================================================================
// CONSUMPTION PATTERNS (Native Implementation)
// ============================================================================

export {
  // Streaming consumption
  streamCanvasAgent,
  // Batch consumption
  runCanvasAgent as runCanvasAgentBatch,
  getCanvasAgentResult as getCanvasAgentResultBatch,
  // Session-based
  CanvasAgentSession,
  createCanvasAgentSession,
  // HTTP handler
  handleCanvasAgentStream as handleCanvasAgentStreamConsumption,
} from "./consumption.js";

// ============================================================================
// RESPONSE EXTRACTOR (Native Implementation)
// ============================================================================

export {
  extractUserResponse,
  isReasoningOnly,
  extractReasoning,
  parseLLMOutput,
  type ParsedLLMOutput,
} from "./response-extractor.js";

// ============================================================================
// LOOP ALIASES (Native Implementation)
// Note: runAgenticLoop, LoopOptions, MCPExecutor are already exported from execution.js
// ============================================================================

export { runAgenticLoop as agenticLoop } from "./loop.js";

// ============================================================================
// LOG REPORTER
// ============================================================================

export {
  // Types
  type LogLevel,
  type LogEntryType,
  type LogEntry,
  type LogReporter,

  // Console reporter
  ConsoleLogReporter,
  type ConsoleLogReporterOptions,

  // File reporter
  FileLogReporter,
  type FileLogReporterOptions,

  // Multi-destination reporter
  MultiLogReporter,

  // Null reporter (no-op)
  NullLogReporter,

  // Factory
  createLogReporter,
} from "./log-reporter.js";

// ============================================================================
// ORCHESTRATION (Re-export from planning for backward compatibility)
// ============================================================================

export { orchestrate } from "../planning/orchestration.js";
