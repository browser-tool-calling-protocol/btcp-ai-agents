/**
 * Orchestration - Simplified Claude Code Style
 *
 * Following Claude Code's actual pattern: ONE agentic loop handles everything.
 * The LLM naturally decides:
 * - Simple tasks → fewer iterations, maybe no tools
 * - Complex tasks → more iterations, multiple tool calls
 * - Chat → no tools at all (guided by CHAT_HANDLING in system prompt)
 *
 * ```
 * User Prompt
 *     │
 *     ▼
 * ┌─────────────────┐
 * │  AGENTIC LOOP   │  LLM decides everything:
 * │                 │  • Chat? Respond directly (no tools)
 * │  while(!done) { │  • Simple? 1-2 tool calls
 * │    think        │  • Complex? Many iterations
 * │    act?         │
 * │    observe?     │  System prompt guides behavior
 * │    decide       │  via <analyze>/<plan>/<execute> tags
 * │  }              │
 * └─────────────────┘
 * ```
 *
 * ## Why No Pre-Routing?
 *
 * - LLM is smart enough to handle complexity naturally
 * - Pre-assessment wastes tokens and adds latency
 * - Claude Code doesn't pre-route - it just loops
 *
 * ## Legacy Exports
 *
 * The complexity/exploration/planning modules are still exported for
 * backwards compatibility but are no longer used in the main flow.
 */

import type { AgentEvent } from "../types/index.js";
import type { MCPExecutor, LoopOptions } from "../core/loop.js";
import type { HooksManager } from "../hooks/manager.js";
import { runAgenticLoop } from "../core/loop.js";

// Legacy imports - kept for backwards compatibility re-exports
import { assessComplexity, estimateOperationCount } from "./complexity.js";
import type { ComplexityAssessment } from "./complexity.js";
import { exploreCanvas, calculateAvailableRegions } from "./exploration.js";
import type { ExplorationResult } from "./exploration.js";
import {
  createExecutionPlan,
  detectSections,
  detectSpecialists,
  calculateTaskRegion,
} from "./plan-builder.js";
import type { ExecutionPlan, ExecutionPlanPhase, ExecutionTask } from "./plan-builder.js";
import { executePlan } from "./plan-executor.js";

// ============================================================================
// RE-EXPORTS (for backwards compatibility)
// ============================================================================

export type { ComplexityAssessment } from "./complexity.js";
export { assessComplexity, estimateOperationCount } from "./complexity.js";

export type { ExplorationResult } from "./exploration.js";
export { exploreCanvas, calculateAvailableRegions } from "./exploration.js";

export type { ExecutionPlan, ExecutionPlanPhase, ExecutionTask } from "./plan-builder.js";
export {
  createExecutionPlan,
  detectSections,
  detectSpecialists,
  calculateTaskRegion,
} from "./plan-builder.js";

export { executePlan } from "./plan-executor.js";

// ============================================================================
// TYPES
// ============================================================================

/**
 * The phases of complex task handling (including clarification)
 */
export type OrchestrationPhase = "check" | "clarify" | "explore" | "plan" | "execute";

/**
 * Configuration for the orchestrator
 */
export interface OrchestratorConfig {
  /** MCP executor (optional - created lazily if not provided) */
  executor?: MCPExecutor;

  /** Hooks for observability */
  hooks?: HooksManager;

  /** Anthropic API key */
  apiKey?: string;

  /** Skip approval for plans (auto-execute) */
  autoApprove?: boolean;

  /** Callback when plan is ready for approval */
  onPlanReady?: (plan: ExecutionPlan) => Promise<boolean>;

  /** Progress callback */
  onProgress?: (phase: OrchestrationPhase, message: string) => void;

  /** MCP server URL (used if executor not provided) */
  mcpUrl?: string;

  /** Enable verbose logging */
  verbose?: boolean;
}

// ============================================================================
// MAIN ORCHESTRATOR
// ============================================================================

/**
 * Orchestrate canvas agent task
 *
 * Simplified to just run the agentic loop - no pre-routing, no complexity
 * assessment, no separate planning phase. The LLM handles everything naturally.
 *
 * This follows Claude Code's pattern: one loop, LLM decides.
 *
 * @example
 * ```typescript
 * for await (const event of orchestrate('Create a flowchart', 'canvas-1', {})) {
 *   console.log(event.type, event.message);
 * }
 * ```
 */
export async function* orchestrate(
  task: string,
  canvasId: string,
  config: OrchestratorConfig = {}
): AsyncGenerator<AgentEvent> {
  // Build loop options from orchestrator config
  const loopOptions: LoopOptions = {
    hooks: config.hooks,
    mcpUrl: config.mcpUrl,
    verbose: config.verbose,
  };

  if (config.executor) {
    loopOptions.executor = config.executor;
  }

  // Just run the loop - it handles everything
  // - Chat intent → LLM responds without tools (guided by CHAT_HANDLING prompt)
  // - Simple tasks → LLM does 1-2 tool calls
  // - Complex tasks → LLM iterates until done
  for await (const event of runAgenticLoop(task, canvasId, loopOptions)) {
    yield event as AgentEvent;
  }
}
