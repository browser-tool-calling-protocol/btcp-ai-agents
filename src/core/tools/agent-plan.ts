/**
 * agent_plan Tool Implementation
 *
 * Create and manage execution plans for complex tasks.
 */

import type {
  AgentPlanInput,
  GenericToolContext,
  GenericToolResult,
} from './generic-definitions.js';

interface PlanStep {
  id: string;
  description: string;
  dependencies: string[];
  complexity?: 'simple' | 'medium' | 'complex';
  agentType?: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  result?: unknown;
  error?: string;
}

interface Plan {
  id: string;
  goal: string;
  steps: PlanStep[];
  status: 'draft' | 'active' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
  metadata?: {
    priority?: 'low' | 'medium' | 'high';
    deadline?: string;
    tags?: string[];
  };
}

// In-memory plan storage (keyed by session)
const plans = new Map<string, Plan>();

export async function executeAgentPlan(
  input: AgentPlanInput,
  context: GenericToolContext
): Promise<GenericToolResult<Plan>> {
  const startTime = Date.now();

  try {
    const { goal, steps, mode, metadata } = input;
    const sessionId = context.sessionId;

    let plan: Plan;

    if (mode === 'create' || !plans.has(sessionId)) {
      // Create new plan
      plan = {
        id: `plan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        goal,
        steps: steps.map((step) => ({
          ...step,
          dependencies: step.dependencies ?? [],
          status: 'pending' as const,
        })),
        status: 'draft',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        metadata,
      };
      plans.set(sessionId, plan);
    } else if (mode === 'update') {
      // Update existing plan
      plan = plans.get(sessionId)!;
      plan.goal = goal;
      plan.steps = steps.map((step) => {
        // Preserve status of existing steps
        const existing = plan.steps.find((s) => s.id === step.id);
        return {
          ...step,
          dependencies: step.dependencies ?? [],
          status: existing?.status ?? ('pending' as const),
          result: existing?.result,
          error: existing?.error,
        };
      });
      plan.updatedAt = new Date().toISOString();
      if (metadata) {
        plan.metadata = { ...plan.metadata, ...metadata };
      }
    } else if (mode === 'append') {
      // Append steps to existing plan
      plan = plans.get(sessionId)!;
      for (const step of steps) {
        // Check for duplicate IDs
        if (plan.steps.some((s) => s.id === step.id)) {
          continue; // Skip duplicates
        }
        plan.steps.push({
          ...step,
          dependencies: step.dependencies ?? [],
          status: 'pending',
        });
      }
      plan.updatedAt = new Date().toISOString();
      if (metadata) {
        plan.metadata = { ...plan.metadata, ...metadata };
      }
    } else {
      throw new Error(`Invalid mode: ${mode}`);
    }

    // Validate plan (check for circular dependencies)
    const validationError = validatePlan(plan);
    if (validationError) {
      return {
        success: false,
        error: {
          code: 'INVALID_PLAN',
          message: validationError,
          recoverable: true,
        },
        metadata: {
          duration: Date.now() - startTime,
        },
      };
    }

    return {
      success: true,
      data: plan,
      metadata: {
        duration: Date.now() - startTime,
        itemsAffected: plan.steps.length,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'PLAN_ERROR',
        message: error instanceof Error ? error.message : 'Failed to create/update plan',
        recoverable: true,
      },
      metadata: {
        duration: Date.now() - startTime,
      },
    };
  }
}

/**
 * Validate a plan for circular dependencies
 */
function validatePlan(plan: Plan): string | null {
  const stepIds = new Set(plan.steps.map((s) => s.id));

  // Check all dependencies exist
  for (const step of plan.steps) {
    for (const dep of step.dependencies) {
      if (!stepIds.has(dep)) {
        return `Step "${step.id}" depends on unknown step "${dep}"`;
      }
    }
  }

  // Check for circular dependencies using DFS
  const visited = new Set<string>();
  const inPath = new Set<string>();

  function hasCycle(stepId: string): boolean {
    if (inPath.has(stepId)) return true;
    if (visited.has(stepId)) return false;

    visited.add(stepId);
    inPath.add(stepId);

    const step = plan.steps.find((s) => s.id === stepId);
    if (step) {
      for (const dep of step.dependencies) {
        if (hasCycle(dep)) return true;
      }
    }

    inPath.delete(stepId);
    return false;
  }

  for (const step of plan.steps) {
    if (hasCycle(step.id)) {
      return `Circular dependency detected involving step "${step.id}"`;
    }
  }

  return null;
}

/**
 * Get the current plan for a session
 */
export function getPlan(sessionId: string): Plan | undefined {
  return plans.get(sessionId);
}

/**
 * Get the next executable steps (all dependencies completed)
 */
export function getNextSteps(sessionId: string): PlanStep[] {
  const plan = plans.get(sessionId);
  if (!plan) return [];

  const completedIds = new Set(
    plan.steps.filter((s) => s.status === 'completed').map((s) => s.id)
  );

  return plan.steps.filter(
    (step) =>
      step.status === 'pending' &&
      step.dependencies.every((dep) => completedIds.has(dep))
  );
}

/**
 * Update a step's status
 */
export function updateStepStatus(
  sessionId: string,
  stepId: string,
  status: PlanStep['status'],
  result?: unknown,
  error?: string
): boolean {
  const plan = plans.get(sessionId);
  if (!plan) return false;

  const step = plan.steps.find((s) => s.id === stepId);
  if (!step) return false;

  step.status = status;
  if (result !== undefined) step.result = result;
  if (error !== undefined) step.error = error;

  plan.updatedAt = new Date().toISOString();

  // Update plan status
  const allCompleted = plan.steps.every(
    (s) => s.status === 'completed' || s.status === 'skipped'
  );
  const anyFailed = plan.steps.some((s) => s.status === 'failed');
  const anyRunning = plan.steps.some((s) => s.status === 'running');

  if (allCompleted) {
    plan.status = 'completed';
  } else if (anyFailed) {
    plan.status = 'failed';
  } else if (anyRunning) {
    plan.status = 'active';
  }

  return true;
}

/**
 * Delete a plan
 */
export function deletePlan(sessionId: string): boolean {
  return plans.delete(sessionId);
}
