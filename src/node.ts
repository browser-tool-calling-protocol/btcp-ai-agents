/**
 * Node.js Entry Point
 *
 * Full-featured entry point for @btcp/ai-agents in Node.js environments.
 * Includes all features plus Node-specific functionality.
 *
 * @example
 * ```typescript
 * import { initNodePlatform, query, createSession } from '@btcp/ai-agents/node';
 *
 * // Initialize the platform
 * initNodePlatform({
 *   assetsPath: './src/prompts/v2',
 *   storagePath: './data/sessions',
 * });
 *
 * // Use the full SDK
 * const session = await createSession({ provider: 'google' });
 * const result = await session.query('Hello!');
 * ```
 */

// ============================================================================
// PLATFORM INITIALIZATION
// ============================================================================

export { initNodePlatform, NodeEnvironment, NodeAssetLoader, NodeFileStorage, NodeLogger } from './platform/node/index.js';
export type { NodePlatformOptions } from './platform/node/index.js';

// Platform registry
export { setPlatform, getPlatform, hasPlatform, getEnv, getAssets, getStorage, getLogger } from './platform/registry.js';

// Platform types
export type { PlatformAdapter, EnvironmentAdapter, AssetLoader, StorageAdapter, LoggerAdapter } from './platform/types.js';

// ============================================================================
// RE-EXPORT EVERYTHING FROM BROWSER (Generic Tools, Agents, Skills, Adapters)
// ============================================================================

// Generic tools
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
} from './tools/generic-definitions.js';

// Tool implementations
export { executeContextRead } from './tools/context-read.js';
export { executeContextWrite } from './tools/context-write.js';
export { executeContextSearch } from './tools/context-search.js';
export { executeTaskExecute } from './tools/task-execute.js';
export { executeStateSnapshot, getSnapshot, listSnapshots, deleteSnapshot } from './tools/state-snapshot.js';
export { executeAgentDelegate, setAgentExecutor, getDelegation, listDelegations, clearCompletedDelegations } from './tools/agent-delegate.js';
export { executeAgentPlan, getPlan, getNextSteps, updateStepStatus, deletePlan } from './tools/agent-plan.js';
export { executeAgentClarify, getClarification, answerClarification, skipClarification, listPendingClarifications, clearOldClarifications, formatClarification } from './tools/agent-clarify.js';

// Generic agents
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
} from './agents/generic-definitions.js';

// Skill registry
export {
  createSkillRegistry,
  getSkillRegistry,
  setSkillRegistry,
  type SkillPlugin,
  type SkillRegistry,
  type SkillInjectionConfig,
  type SkillInjectionResult,
} from './skills/registry.js';

// Action adapters
export {
  createActionAdapterRegistry,
  getAdapterRegistry,
  setAdapterRegistry,
  type ActionAdapter,
  type ActionAdapterRegistry,
} from './adapters/types.js';

// ============================================================================
// FULL SDK (Node.js Only)
// ============================================================================

// Re-export everything from main index
export * from './index.js';

// ============================================================================
// HTTP HANDLERS (Node.js Only)
// ============================================================================

// HTTP handlers for building servers
export {
  handleChat,
  handleCommand,
  handleHealth,
  createChatRouter,
} from './http/index.js';
