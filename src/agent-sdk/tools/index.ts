/**
 * Generic Agent Tools
 *
 * This module exports generic agent tools that work with any domain.
 *
 * Generic Agent Tools:
 * - context_read   → Read context/memory/history
 * - context_write  → Write to context/memory
 * - context_search → Search through context
 * - task_execute   → Execute action via adapter
 * - state_snapshot → Capture state checkpoint
 * - agent_delegate → Delegate to sub-agent
 * - agent_plan     → Create execution plan
 * - agent_clarify  → Request user clarification
 */

// Generic agent tool definitions
export * from "./generic-definitions.js";
export * from "./error-codes.js";

// Generic agent tool implementations
export { executeContextRead } from "./context-read.js";
export { executeContextWrite } from "./context-write.js";
export { executeContextSearch } from "./context-search.js";
export { executeTaskExecute } from "./task-execute.js";
export {
  executeStateSnapshot,
  getSnapshot,
  listSnapshots,
  deleteSnapshot,
} from "./state-snapshot.js";
export {
  executeAgentDelegate,
  setAgentExecutor,
  getDelegation,
  listDelegations,
  clearCompletedDelegations,
} from "./agent-delegate.js";
export {
  executeAgentPlan,
  getPlan,
  getNextSteps,
  updateStepStatus,
  deletePlan,
} from "./agent-plan.js";
export {
  executeAgentClarify,
  getClarification,
  answerClarification,
  skipClarification,
  listPendingClarifications,
  clearOldClarifications,
  formatClarification,
} from "./agent-clarify.js";

// Export executor module (has ToolExecutor class)
export {
  ToolExecutor,
  createToolExecutor,
  executeTool,
  getToolDefinition,
  getAllToolDefinitions,
  getToolNames,
  type ExecutorConfig,
  type ToolOutputMap,
} from "./executor.js";

// Export ai-sdk-bridge with renamed ToolExecutor type to avoid conflict
export {
  createTypedTool,
  createTypedTools,
  wrapToolResult,
  createErrorResult,
  isBlockedResult,
  type ToolExecutor as AIToolExecutor,
  type TypedToolConfig,
  type ToolSet,
  type BlockedResult,
} from "./ai-sdk-bridge.js";
