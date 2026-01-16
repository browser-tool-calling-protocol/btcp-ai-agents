/**
 * Agent Definitions Module
 *
 * Agent types, modes, system prompts, state management, and context budgeting.
 * Implements Pattern 7: Sub-Agent Delegation with specialized agents.
 *
 * Generic agents work with any action adapter (domain-agnostic).
 */

// Types
export * from './types.js';

// ============================================================================
// GENERIC AGENT DEFINITIONS (Domain-Agnostic)
// ============================================================================

export {
  // Generic agent definitions
  GENERIC_AGENT,
  PLANNER_AGENT,
  EXECUTOR_AGENT,
  ANALYZER_AGENT,
  EXPLORER_AGENT,
  GENERIC_AGENTS,
  // Generic agent utilities
  getGenericAgent,
  detectGenericAgent,
  getGenericSpecialistTypes,
  getGenericAgentTools,
  // Types
  type GenericAgentType,
  type GenericAgentDefinition,
  type GenericAgentCapabilities,
  type ModelTier,
} from './generic-definitions.js';

// Context builder
export { buildContext, type ContextOptions, type BuiltContext } from "./context-builder.js";

// System prompts
export {
  getSystemPrompt,
  getGenericSystemPrompt,
  withContext,
  PROMPTS,
} from "./prompts.js";

// Mode detection
export {
  detectAgentMode,
  getModeConfidence,
  detectAllModes,
  MODE_DESCRIPTIONS,
} from "./mode-detection.js";

// Agent state (Pattern 4: Stateless Systems)
export * from "./state.js";

// Context budget management
export * from "./budget.js";

// Agent registry (Pattern 7: Sub-Agent Delegation)
export {
  getAgentRegistry,
  registerAgent,
  unregisterAgent,
  getRegisteredAgent,
  listRegisteredAgents,
  findAgentForTask,
  clearAgentRegistry,
  AgentRegistry,
  type RegisteredAgent,
} from "./registry.js";
