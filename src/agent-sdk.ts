/**
 * @btcp/agent-sdk - Core Agent Framework
 *
 * Domain-agnostic agentic framework inspired by Claude Code patterns.
 * This is the core SDK that can be used with any domain adapter.
 *
 * ## Quick Start
 *
 * ```typescript
 * import { createAgentSession, createBTCPAdapter } from '@btcp/ai-agents';
 *
 * // Create session with adapter
 * const session = await createAgentSession({
 *   adapter: createBTCPAdapter({ serverUrl: 'http://localhost:8765' }),
 *   model: 'balanced',
 * });
 *
 * // Run tasks (streaming)
 * for await (const event of session.run("Click the login button")) {
 *   console.log(event.type, event);
 * }
 *
 * // Or execute and get result
 * const result = await session.execute("Fill in the form");
 * console.log(result.success, result.summary);
 *
 * // Cleanup
 * await session.close();
 * ```
 *
 * ## Architecture
 *
 * The agent SDK provides:
 * - Session-based API (primary interface)
 * - TOAD Loop (Think → Act → Observe → Decide)
 * - LLM Providers (Google Gemini, OpenAI)
 * - Context Management (6-tier memory, compression)
 * - Hooks System (pre/post execution hooks)
 * - Resource Registry (@alias resolution)
 * - Skills System (knowledge injection)
 * - Planning & Delegation
 *
 * ## Extension Points
 *
 * 1. **ActionAdapter**: Implement to connect to any domain backend
 * 2. **Skills**: Register domain-specific knowledge
 * 3. **Hooks**: Add pre/post execution logic
 * 4. **Resource Providers**: Add custom @alias providers
 *
 * @module agent-sdk
 */

// =============================================================================
// SESSION API (Primary Interface)
// =============================================================================

export {
  // Session class and factory
  AgentSession,
  createAgentSession,
  createCancellationToken,
  // Convenience functions
  runTask,
  streamTask,
  // Types
  type AgentSessionConfig,
  type TaskResult,
  type SessionState,
  type SessionStats,
} from './agent-sdk/session.js';

// =============================================================================
// CORE LOOP (Low-level, use Session API instead)
// =============================================================================

/**
 * @deprecated Use `createAgentSession` and `session.run()` instead.
 *
 * The session-based API provides:
 * - Automatic connection management
 * - Multi-turn context preservation
 * - Cleaner async/await patterns
 * - Built-in statistics and history
 *
 * Migration:
 * ```typescript
 * // Before (deprecated)
 * for await (const event of runAgenticLoop(task, sessionId, options)) { ... }
 *
 * // After (recommended)
 * const session = await createAgentSession({ adapter, ...options });
 * for await (const event of session.run(task)) { ... }
 * await session.close();
 * ```
 */
export {
  runAgenticLoop,
  // Phase functions (for testing/customization)
  think,
  thinkTestMode,
  act,
  actAll,
  actTestMode,
  observe,
  observeAll,
  saveCheckpointIfDue,
  handleGenerationError,
  decide,
  createDecisionEvents,
  isTerminal,
  // Context functions
  getAwarenessWithCaching,
  fetchAwareness,
  fetchAwarenessFromAdapter,
  formatCanvasForContext,
  formatTasksForContext,
  formatUserMessage,
  injectCanvasContextForIteration,
  handleMutationToolEffect,
  // Types
  type LoopContext,
  type LoopState,
  type LoopOptions,
  type MCPExecutor,
} from './agent-sdk/core/loop/index.js';

// =============================================================================
// TYPES
// =============================================================================

export type {
  AgentEvent,
  AgentConfig,
  AgentState,
  CancellationToken,
  PlanTask,
  AgentMode,
  // Core event types
  IterationEvent,
  ThinkingEvent,
  ToolCallEvent,
  ToolResultEvent,
  ObservationEvent,
  DecisionEvent,
  ContextEvent,
  ErrorEvent,
  CompleteEvent,
  CancelledEvent,
} from './agent-sdk/agents/types.js';

export type {
  AgentToolName,
} from './agent-sdk/tools/generic-definitions.js';

export type {
  ModelProvider,
  ModelPreference,
} from './agent-sdk/types/index.js';

// =============================================================================
// ADAPTERS
// =============================================================================

export {
  // Types
  type ActionAdapter,
  type ActionAdapterRegistry,
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
  // No-op adapter
  NoOpAdapter,
  // Registry
  createActionAdapterRegistry,
  getAdapterRegistry,
  setAdapterRegistry,
  resetAdapterRegistry,
} from './agent-sdk/adapters/types.js';

// =============================================================================
// PROVIDERS
// =============================================================================

export {
  createProvider,
  type LLMProvider,
  type ProviderConfig,
} from './agent-sdk/core/providers/index.js';

// =============================================================================
// CONTEXT MANAGEMENT
// =============================================================================

export {
  createContextManager,
  type ContextManager,
} from './agent-sdk/context/manager.js';

export {
  MemoryTier,
  MessagePriority,
  type ContextMessage,
  type ContextStats,
} from './agent-sdk/context/types.js';

export {
  createMessage,
} from './agent-sdk/context/memory.js';

export {
  ToolResultLifecycle,
  type ToolResultStage,
} from './agent-sdk/context/tool-lifecycle.js';

export {
  EchoPoisoningPrevention,
} from './agent-sdk/context/echo-prevention.js';

export {
  generateSessionId,
  type SessionSerializer,
} from './agent-sdk/context/serialization.js';

// =============================================================================
// HOOKS
// =============================================================================

export {
  createHooksManager,
  CommonHooks,
  HooksManager,
} from './agent-sdk/hooks/manager.js';

export type {
  HookType,
  HookContext,
  HookHandler,
  HookResult,
} from './agent-sdk/hooks/types.js';

// =============================================================================
// RESOURCES
// =============================================================================

export {
  createResourceRegistry,
  ResourceRegistry,
} from './agent-sdk/resources/registry.js';

export type {
  ResourceProvider,
  ResourceDefinition,
  ResolvedResource,
} from './agent-sdk/resources/types.js';

export {
  registerBuiltInProviders,
} from './agent-sdk/resources/providers.js';

// =============================================================================
// SKILLS
// =============================================================================

export {
  getSkillRegistry,
  type SkillRegistry,
} from './agent-sdk/skills/index.js';

export type {
  SkillDefinition,
} from './agent-sdk/types/index.js';

// =============================================================================
// TOOLS
// =============================================================================

export {
  AGENT_TOOL_NAMES,
  GENERIC_TOOL_SCHEMAS,
} from './agent-sdk/tools/generic-definitions.js';

export {
  createToolExecutor,
  type ToolExecutor,
} from './agent-sdk/tools/executor.js';

export {
  toolSetToGeminiFormat,
  type ToolSet,
} from './agent-sdk/tools/ai-sdk-bridge.js';

// =============================================================================
// STATE
// =============================================================================

export {
  createResources,
  cloneResources,
  updateBrowser,
  updateTask,
  addHistory,
  addError,
  createCheckpoint,
  updateAwareness,
  invalidateAwareness,
  needsAwarenessRefresh,
  isMutationTool,
  MUTATION_TOOLS,
  READ_ONLY_TOOLS,
  type AgentResources,
  type BrowserResource,
  type TaskResource,
  type ContextResource,
  type HistoryResource,
  type HistoryEntry,
  type TaskStatus,
  type Checkpoint,
  type TaskError,
} from './agent-sdk/agents/state.js';

// =============================================================================
// PLANNING
// =============================================================================

export {
  detectAgentMode,
} from './agent-sdk/agents/mode-detection.js';

export {
  getSystemPrompt,
} from './agent-sdk/agents/prompts.js';

// =============================================================================
// CONSTANTS
// =============================================================================

export {
  MODEL_DEFAULTS,
  LOOP_DEFAULTS,
} from './agent-sdk/core/constants.js';

// =============================================================================
// UTILITIES
// =============================================================================

export {
  extractUserResponse,
} from './agent-sdk/core/response-extractor.js';
