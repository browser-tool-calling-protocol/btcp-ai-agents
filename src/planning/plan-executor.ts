/**
 * Plan Executor Module
 *
 * Executes plans using isolated sub-agents.
 * Handles parallel and sequential execution of plan phases.
 */

import type { AgentEvent } from "../types/index.js";
import type { HooksManager } from "../hooks/manager.js";
import type { MCPExecutor } from "../core/loop.js";
import type { ExecutionPlan, ExecutionPlanPhase } from "./plan-builder.js";
import {
  executeIsolatedSubAgent,
  executeParallelIsolated,
  type SubAgentContract,
} from "./isolated-delegation.js";

// ============================================================================
// TYPES
// ============================================================================

/**
 * Configuration for the plan executor
 */
export interface PlanExecutorConfig {
  /** MCP executor */
  executor: MCPExecutor;

  /** Hooks for observability */
  hooks?: HooksManager;

  /** Anthropic API key */
  apiKey?: string;
}

// ============================================================================
// PLAN EXECUTION
// ============================================================================

/**
 * Execute a plan using isolated sub-agents
 */
export async function* executePlan(
  plan: ExecutionPlan,
  config: PlanExecutorConfig
): AsyncGenerator<AgentEvent> {
  yield {
    type: "plan",
    message: `Executing plan: ${plan.summary}`,
    steps: plan.phases.map((p) => `${p.name}: ${p.tasks.length} tasks`),
  };

  const completedTasks = new Map<string, boolean>();

  for (const phase of plan.phases) {
    yield {
      type: "step_start",
      step: phase.name,
      message: phase.description,
    };

    if (phase.parallel && phase.tasks.length >= 2) {
      // Execute tasks in parallel
      yield* executePhaseParallel(phase, config, completedTasks);
    } else {
      // Execute tasks sequentially
      yield* executePhaseSequential(phase, config, completedTasks);
    }

    yield {
      type: "step_complete",
      step: phase.name,
      message: `Phase complete`,
    };
  }

  const successCount = Array.from(completedTasks.values()).filter(Boolean).length;

  yield {
    type: "complete",
    summary: `Plan executed: ${successCount}/${completedTasks.size} tasks succeeded`,
  };
}

/**
 * Execute a phase with parallel tasks
 */
async function* executePhaseParallel(
  phase: ExecutionPlanPhase,
  config: PlanExecutorConfig,
  completedTasks: Map<string, boolean>
): AsyncGenerator<AgentEvent> {
  yield {
    type: "thinking",
    message: `Running ${phase.tasks.length} tasks in parallel`,
  };

  const contracts: SubAgentContract[] = phase.tasks.map((task) => ({
    contractId: task.id,
    agentType: task.agentType,
    task: task.description,
    workRegion: {
      canvasId: "main",
      bounds: task.workRegion,
    },
    inputs: task.inputs || {},
    expectedOutput: { type: "elements" },
    limits: {
      maxIterations: 10,
      maxTokens: task.estimatedTokens,
      timeoutMs: 30000,
    },
  }));

  const results = await executeParallelIsolated(contracts, {
    executor: config.executor,
    hooks: config.hooks,
    apiKey: config.apiKey,
  });

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    completedTasks.set(phase.tasks[i].id, result.success);

    yield {
      type: result.success ? "step_complete" : "error",
      step: phase.tasks[i].description,
      message: result.summary,
    };
  }
}

/**
 * Execute a phase with sequential tasks
 */
async function* executePhaseSequential(
  phase: ExecutionPlanPhase,
  config: PlanExecutorConfig,
  completedTasks: Map<string, boolean>
): AsyncGenerator<AgentEvent> {
  for (const task of phase.tasks) {
    yield {
      type: "thinking",
      message: `Working on: ${task.description}`,
    };

    const result = await executeIsolatedSubAgent(
      {
        contractId: task.id,
        agentType: task.agentType,
        task: task.description,
        workRegion: {
          canvasId: "main",
          bounds: task.workRegion,
        },
        inputs: task.inputs || {},
        expectedOutput: { type: "elements" },
        limits: {
          maxIterations: 10,
          maxTokens: task.estimatedTokens,
          timeoutMs: 30000,
        },
      },
      {
        executor: config.executor,
        hooks: config.hooks,
        apiKey: config.apiKey,
      }
    );

    completedTasks.set(task.id, result.success);

    yield {
      type: result.success ? "step_complete" : "error",
      step: task.description,
      message: result.summary,
    };
  }
}
