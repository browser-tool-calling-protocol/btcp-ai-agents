/**
 * @btcp/ai-agents
 *
 * Generic, browser-compatible AI agent system with pluggable skills and action adapters.
 *
 * ## SDK-Compatible API
 *
 * @example
 * ```typescript
 * // Query API (V1 Pattern)
 * import { query } from '@btcp/ai-agents';
 *
 * const messages = query('Analyze this data', { sessionId: 'my-session' });
 * for await (const message of messages) {
 *   console.log(message);
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Session API (V2 Pattern)
 * import { createSession } from '@btcp/ai-agents';
 *
 * const session = await createSession({ provider: 'google' });
 * await session.send('Create a plan');
 * for await (const msg of session.stream()) {
 *   console.log(msg);
 * }
 * await session.close();
 * ```
 *
 * Implements the 7 Claude Code patterns for optimal agent performance:
 * 1. Minimal Tools, Maximum Composability
 * 2. Streaming-First Architecture
 * 3. Explicit Reasoning Structure (XML tags)
 * 4. Stateless Systems, Observable State
 * 5. Pre/Post Hooks for Observability
 * 6. Skills as Compressed Context
 * 7. Sub-Agent Delegation
 */

// =============================================================================
// CORE API (Claude Agent SDK Compatible)
// =============================================================================

// Re-export the core module for convenience
import * as coreModule from "./agent-sdk/core/index.js";
export { coreModule as core };
export { coreModule as sdk };

// Primary SDK exports for top-level access
export {
  // Query API (V1 Pattern)
  query,
  prompt,
  runQuery,
  streamQuery,
  type Query,
  type QueryOptions,

  // Session API (V2 Pattern)
  createSession,
  resumeSession,
  type Session,
  type SessionOptions,

  // Message types
  type SDKMessage,
  type SDKResultMessage,
  type SDKAssistantMessage,
  type SDKPartialMessage,

  // Tool factory
  tool,
  type Tool,
  createToolRegistry,

  // Configuration
  mergeWithDefaults,
  migrateFromLegacyOptions,

  // Constants
  MODELS,
  DEFAULTS,
  LIMITS,

  // Utilities
  extractJson,
  parseStructured,
  extractTag,

  // Execution Engine (Native Implementation)
  execute,
  runExecution,
  getExecutionResult,
  type ExecuteOptions,

  // Providers (Native Implementation)
  createProvider,
  isProviderAvailable,
  getAvailableProviders,
  getDefaultProvider,
  GoogleProvider,
  OpenAIProvider,
  type LLMProvider,
  type GenerateOptions,
  type GenerateResult,
  type StreamChunk,
  type ProviderConfig,
  type ProviderName,

  // AI Client (Native Implementation)
  createAISDKClient,
  getModelId,
  getModelForProvider,
  type AIClientConfig,
  type ReasoningResult,

  // Constants (engine-level)
  MODEL_IDS,
  MODEL_DEFAULTS,
  createToolResultMessage,
  buildMessages,
} from "./agent-sdk/core/index.js";

// =============================================================================
// GENERIC AGENTS
// =============================================================================

export {
  // Types
  type AgentEvent,
  type AgentEventType,
  type AgentConfig,
  type AgentMode,
  type AgentState,
  type CancellationToken,
  createCancellationToken,

  // Context builder
  buildContext,
  type ContextOptions,
  type BuiltContext,

  // System prompts
  getSystemPrompt,
  getGenericSystemPrompt,
  withContext,
  PROMPTS,

  // Generic agent definitions
  GENERIC_AGENT,
  PLANNER_AGENT,
  EXECUTOR_AGENT,
  ANALYZER_AGENT,
  EXPLORER_AGENT,
  GENERIC_AGENTS,
  getGenericAgent,
  detectGenericAgent,
  getGenericSpecialistTypes,
  getGenericAgentTools,
  type GenericAgentType,
  type GenericAgentDefinition,
  type GenericAgentCapabilities,
  type ModelTier,

  // Mode detection
  detectAgentMode,
  getModeConfidence,
  detectAllModes,
  MODE_DESCRIPTIONS,
} from "./agent-sdk/agents/index.js";

// =============================================================================
// GENERIC TOOLS
// =============================================================================

export * from "./agent-sdk/tools/index.js";

// =============================================================================
// SKILLS (Pluggable Registry)
// =============================================================================

export {
  createSkillRegistry,
  getSkillRegistry,
  setSkillRegistry,
  type SkillPlugin,
  type SkillRegistry,
  type SkillInjectionConfig,
  type SkillInjectionResult,
} from "./agent-sdk/skills/index.js";

// =============================================================================
// ACTION ADAPTERS
// =============================================================================

export {
  createActionAdapterRegistry,
  getAdapterRegistry,
  setAdapterRegistry,
  type ActionAdapter,
  type ActionAdapterRegistry,
} from "./adapters/index.js";

// =============================================================================
// PLATFORM ABSTRACTION
// =============================================================================

export {
  setPlatform,
  getPlatform,
  hasPlatform,
  getEnv,
  getAssets,
  getStorage,
  getLogger,
} from "./platform/registry.js";

export type {
  PlatformAdapter,
  EnvironmentAdapter,
  AssetLoader,
  StorageAdapter,
  LoggerAdapter,
} from "./platform/types.js";

// =============================================================================
// TYPES
// =============================================================================

export type {
  AgentType,
  ModelProvider,
  ModelPreference,
  AgentDefinition,
  AgentCapabilities,
  ResolvedAliasContext,
  ContextStrategy,
  Checkpoint,
  OperationRecord,
  ErrorRecord,
  HookType,
  HookContext,
  HookResult,
  HookHandler,
  SkillDefinition,
  SubAgentRequest,
  CommandDefinition,
  ChatMessage,
  ChatHandlerConfig,
  AgentTool,
} from "./agent-sdk/types/index.js";

// Re-export with aliases to avoid conflicts
export type { AgentResources as CoreAgentResources } from "./agent-sdk/types/index.js";
export type { TaskStatus as CoreTaskStatus } from "./agent-sdk/types/index.js";
export type { ToolDefinition as SimpleToolDefinition } from "./agent-sdk/types/index.js";

// Export schemas and constants from types
export { chatMessageSchema, chatRequestSchema } from "./agent-sdk/types/index.js";

// =============================================================================
// UTILITIES
// =============================================================================

export * from "./utils/streaming.js";

// =============================================================================
// BTCP (Browser Tool Calling Protocol)
// =============================================================================

export {
  // Client
  BTCPAgentClient,
  createBTCPClient,
  createLocalBTCPClient,

  // Browser tool factory
  createBrowserTool,
  createBrowserToolSet,
  formatBrowserToolsForPrompt,
  type BrowserToolOptions,

  // Types
  type BTCPClientConfig,
  type BTCPToolDefinition,
  type BTCPToolResult,
  type BTCPConnectionState,
  type BrowserToolInput,
  type BrowserToolResult,
  type BTCPSession,
  type ToolHandler,

  // Utilities
  generateRequestId,
  generateSessionId,
  BTCPError,
  BTCPErrorCodes,
} from "./browser-agent/btcp/index.js";

// =============================================================================
// AGENT SESSION API (Primary Entry Point)
// =============================================================================

export {
  // Session API (Primary)
  AgentSession,
  createAgentSession,
  createCancellationToken,
  runTask,
  streamTask,
  type AgentSessionConfig,
  type TaskResult,
  type SessionState,
  type SessionStats,
} from "./agent-sdk/session.js";

// =============================================================================
// AGENTIC LOOP (Low-level, deprecated)
// =============================================================================

/**
 * @deprecated Use `createAgentSession` and `session.run()` instead.
 */
export {
  runAgenticLoop,
  type LoopContext,
  type LoopState,
  type LoopOptions,
  type ActionAdapter,
} from "./agent-sdk/core/loop/index.js";

// =============================================================================
// ADAPTERS (Extended)
// =============================================================================

export {
  // BTCP Adapter (Primary)
  BTCPAdapter,
  createBTCPAdapter,
  createBTCPAdapterFromClient,
  type BTCPAdapterConfig,
  // MCP Adapter (Legacy)
  MCPAdapter,
  createMCPAdapter,
  createMCPAdapterFromClient,
  type MCPAdapterConfig,
  // Types
  type ActionResult,
  type ActionError,
  type ActionMetadata,
  type ActionDefinition,
  type AdapterConnectionState,
  type StateSnapshot,
  type AwarenessContext,
  type ExecuteOptions,
  type StateOptions,
  type AwarenessOptions,
  NoOpAdapter,
  resetAdapterRegistry,
} from "./adapters/index.js";

// =============================================================================
// NAMESPACE EXPORTS (Module organization)
// =============================================================================

// Agent SDK - core domain-agnostic framework
export * as agentSdk from "./agent-sdk.js";

// Browser Agent - browser-specific integration
export * as browserAgent from "./browser-agent.js";

// BTCP module - browser tool calling protocol
export * as btcp from "./browser-agent/btcp/index.js";

// Context management system - token budgeting, tiered memory, compression
export * as context from "./agent-sdk/context/index.js";

// Hooks system - observability, metrics, lifecycle hooks
export * as hooks from "./agent-sdk/hooks/index.js";

// Aliases system - @alias syntax for referencing data
export * as aliases from "./aliases/index.js";

// Resources system - unified data access for agents
export * as resources from "./agent-sdk/resources/index.js";

// Commands system - slash command support
export * as commands from "./commands/index.js";
