/**
 * Planning Module
 *
 * ## Architecture Note (Simplified Claude Code Pattern)
 *
 * Following Claude Code's actual pattern, the main flow now uses a SINGLE agentic loop
 * that handles all complexity levels naturally. The LLM decides when to iterate,
 * use tools, or respond directly.
 *
 * The `orchestrate()` function is now a simple pass-through to `runAgenticLoop()`.
 * Pre-routing and complexity assessment have been removed from the main flow.
 *
 * ## Module Status
 *
 * **ACTIVE (used in main flow):**
 * - `orchestrate()` - Primary entry point (simplified to single loop)
 * - `delegateToSubAgent()`, `delegateParallel()` - Sub-agent delegation (used as tool)
 *
 * **DEPRECATED (kept for backwards compatibility, not used in main flow):**
 * - `assessComplexity()` - LLM handles complexity naturally
 * - `exploreCanvas()` - Context fetched via MCP resource
 * - `createExecutionPlan()` - LLM plans within the loop
 * - `executePlan()` - Single loop handles execution
 *
 * **EXPERIMENTAL (may be integrated or removed):**
 * - `generateInfographic()` - High-level infographic generation API
 * - `executeIsolatedSubAgent()` - Claude Code Task tool pattern
 * - `decideDelegationStrategy()` - Decision engine for delegation
 *
 * @see docs/engineering/CLAUDE_CODE_PATTERNS.md
 */

export {
  // Main API
  generateInfographic,
  analyzeInfographicRequest,
  executeInfographicPlan,

  // Types
  type InfographicPlan,
  type InfographicSection,
  type InfographicSectionType,
  type InfographicSpecialist,
  type ExecutionPhase,
} from './infographic-strategy.js';

// Re-export sub-agent delegation utilities
export {
  delegateToSubAgent,
  delegateParallel,
  detectSubAgent,
  getSubAgentDefinition,
  listSubAgents,
  SUBAGENT_DEFINITIONS,
  type SubAgentType,
  type SubAgentDefinition,
  type SubAgentTask,
  type SubAgentResult,
} from '../core/delegation.js';

// Isolated delegation (Claude Code Task tool pattern)
export {
  executeIsolatedSubAgent,
  executeParallelIsolated,
  orchestrateComplexTask,
  executeReasoningPhase,
  type SubAgentContract,
  type IsolatedSubAgentResult,
  type IsolatedExecutionConfig,
  type ReasoningResult,
} from './isolated-delegation.js';

// Decision engine (when to spawn isolated context)
export {
  decideDelegationStrategy,
  executeWithDecision,
  type DelegationFactors,
  type DelegationDecision,
} from './decision-engine.js';

// Orchestration - simplified to single agentic loop
export {
  // Main orchestrator (ACTIVE - primary entry point)
  orchestrate,

  // Legacy phases (DEPRECATED - kept for backwards compatibility)
  // These are no longer called in the main flow; LLM handles naturally
  /** @deprecated No longer used in main flow - LLM handles complexity naturally */
  assessComplexity,
  /** @deprecated No longer used in main flow - context via MCP resource */
  exploreCanvas,
  /** @deprecated No longer used in main flow - LLM plans in loop */
  createExecutionPlan,
  /** @deprecated No longer used in main flow - single loop handles execution */
  executePlan,

  // Types
  type OrchestrationPhase,
  type ComplexityAssessment,
  type ExplorationResult,
  type ExecutionPlan,
  type ExecutionPlanPhase,
  type ExecutionTask,
  type OrchestratorConfig,
} from './orchestration.js';

// ============================================================================
// STRUCTURED PLAN FORMAT (Plan-Walkthrough Pattern)
// ============================================================================

/**
 * Structured plan types for explicit change scope
 * Enables: Generate plan → Validate scope → Walkthrough → Execute → Verify
 */
export {
  // Types
  type StructuredPlan,
  type ChangeScope,
  type CreateSpec,
  type UpdateSpec,
  type DeleteSpec,
  type ElementReference,
  type ContextReference,
  type PlanTask,
  type TaskStatus,
  type PlanExecutionResult,

  // Schemas
  StructuredPlanSchema,
  ChangeScopeSchema,
  CreateSpecSchema,
  UpdateSpecSchema,
  DeleteSpecSchema,
  ElementReferenceSchema,
  ContextReferenceSchema,
  PlanTaskSchema,
  TaskStatusSchema,

  // Helpers
  createEmptyPlan,
  generatePlanId,
  generateTaskId,
  generateTempId,
  getPlanProgress,
  getCurrentTask,
  getChangeScopeSummary,
  formatPlanForContext,
  formatPlanAsYaml,
} from './structured-plan.js';

/**
 * Plan validation and scope verification
 */
export {
  // Validation
  validatePlanSchema,
  validatePlanPreExecution,

  // Execution tracking
  ExecutionTracker,

  // Parsing
  parsePlanFromOutput,

  // Walkthrough helpers
  formatPlanForWalkthrough,
  formatScopeValidationReport,

  // Types
  type ValidationError,
  type PlanValidationResult,
  type ScopeValidationResult,
  type CanvasStateForValidation,
} from './plan-validator.js';
