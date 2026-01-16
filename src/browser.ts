/**
 * Browser Entry Point
 *
 * Browser-safe entry point for @btcp/ai-agents.
 * Use this in browser extensions and web applications.
 *
 * @example
 * ```typescript
 * import { initBrowserPlatform, query } from '@btcp/ai-agents/browser';
 *
 * // Initialize the platform
 * initBrowserPlatform({
 *   config: {
 *     GOOGLE_API_KEY: '...',
 *   },
 * });
 *
 * // Use the SDK
 * const result = await query({
 *   prompt: 'Hello!',
 *   model: 'balanced',
 * });
 * ```
 */

// ============================================================================
// PLATFORM INITIALIZATION
// ============================================================================

export { initBrowserPlatform, BrowserEnvironment, BrowserAssetLoader, BrowserStorage, BrowserLogger } from './platform/browser/index.js';
export type { BrowserPlatformOptions } from './platform/browser/index.js';

// Platform registry
export { setPlatform, getPlatform, hasPlatform, getEnv, getAssets, getStorage, getLogger } from './platform/registry.js';

// Platform types
export type { PlatformAdapter, EnvironmentAdapter, AssetLoader, StorageAdapter, LoggerAdapter } from './platform/types.js';

// ============================================================================
// GENERIC AGENT TOOLS
// ============================================================================

// Tool definitions
export {
  AGENT_TOOL_NAMES,
  ContextReadInputSchema,
  ContextWriteInputSchema,
  ContextSearchInputSchema,
  TaskExecuteInputSchema,
  StateSnapshotInputSchema,
  AgentDelegateInputSchema,
  AgentPlanInputSchema,
  AgentClarifyInputSchema,
  GENERIC_TOOL_SCHEMAS,
  generateGenericToolReference,
  getGenericToolSchema,
  type AgentToolName,
  type ContextReadInput,
  type ContextWriteInput,
  type ContextSearchInput,
  type TaskExecuteInput,
  type StateSnapshotInput,
  type AgentDelegateInput,
  type AgentPlanInput,
  type AgentClarifyInput,
  type GenericToolResult,
  type GenericToolContext,
  type GenericToolDefinition,
} from './agent-sdk/tools/generic-definitions.js';

// Tool implementations
export { executeContextRead } from './agent-sdk/tools/context-read.js';
export { executeContextWrite } from './agent-sdk/tools/context-write.js';
export { executeContextSearch } from './agent-sdk/tools/context-search.js';
export { executeTaskExecute } from './agent-sdk/tools/task-execute.js';
export { executeStateSnapshot, getSnapshot, listSnapshots, deleteSnapshot } from './agent-sdk/tools/state-snapshot.js';
export { executeAgentDelegate, setAgentExecutor, getDelegation, listDelegations, clearCompletedDelegations } from './agent-sdk/tools/agent-delegate.js';
export { executeAgentPlan, getPlan, getNextSteps, updateStepStatus, deletePlan } from './agent-sdk/tools/agent-plan.js';
export { executeAgentClarify, getClarification, answerClarification, skipClarification, listPendingClarifications, clearOldClarifications, formatClarification } from './agent-sdk/tools/agent-clarify.js';

// ============================================================================
// GENERIC AGENTS
// ============================================================================

export {
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
} from './agent-sdk/agents/generic-definitions.js';

// ============================================================================
// SKILL REGISTRY
// ============================================================================

export {
  createSkillRegistry,
  getSkillRegistry,
  setSkillRegistry,
  type SkillPlugin,
  type SkillRegistry,
  type SkillInjectionConfig,
  type SkillInjectionResult,
} from './agent-sdk/skills/registry.js';

// ============================================================================
// ACTION ADAPTERS
// ============================================================================

export {
  createActionAdapterRegistry,
  getAdapterRegistry,
  setAdapterRegistry,
  type ActionAdapter,
  type ActionAdapterRegistry,
} from './agent-sdk/adapters/types.js';

// ============================================================================
// CORE SDK (Browser-Safe Parts)
// ============================================================================

// Re-export core types that are browser-safe
export type {
  AgentType,
  AgentDefinition,
  AgentCapabilities,
  AgentTool,
} from './types/index.js';
