/**
 * Structured Plan Format
 *
 * A parseable plan format for the "plan-walkthrough" pattern:
 * 1. Generate plan with explicit change scope
 * 2. Walkthrough/validate with user
 * 3. Execute and verify changes match scope
 *
 * Format:
 * - objective: What the user wants to achieve
 * - references: Context/resources being used
 * - tasks: Action items to complete
 * - changes: Expected mutations (creates, updates, deletes)
 */

import { z } from "zod";

// ============================================================================
// ELEMENT REFERENCE
// ============================================================================

/**
 * Reference to an existing canvas element
 */
export const ElementReferenceSchema = z.object({
  /** Element ID */
  id: z.string().describe("Element ID from canvas_read"),
  /** Element type for validation */
  type: z.string().optional().describe("Element type (rectangle, text, etc.)"),
  /** Why this element is referenced */
  reason: z.string().optional().describe("Why this element is relevant to the plan"),
});

export type ElementReference = z.infer<typeof ElementReferenceSchema>;

/**
 * Reference to external context (not on canvas)
 */
export const ContextReferenceSchema = z.object({
  /** Reference type */
  type: z.enum(["user_input", "image_url", "color_palette", "style_guide", "data"]),
  /** Reference value or description */
  value: z.string(),
  /** Source of this reference */
  source: z.string().optional(),
});

export type ContextReference = z.infer<typeof ContextReferenceSchema>;

// ============================================================================
// CHANGE SPECIFICATIONS
// ============================================================================

/**
 * Element to be created
 */
export const CreateSpecSchema = z.object({
  /** Temporary ID for cross-referencing in the plan */
  tempId: z.string().describe("Temporary ID like 'new-header-1' for referencing in tasks"),
  /** Element type to create */
  type: z.enum([
    "rectangle",
    "ellipse",
    "diamond",
    "text",
    "line",
    "arrow",
    "freedraw",
    "image",
    "frame",
  ]),
  /** Brief description of what this element represents */
  description: z.string(),
  /** Approximate position (can be refined during execution) */
  region: z
    .object({
      x: z.number().optional(),
      y: z.number().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
    })
    .optional(),
  /** Parent frame/container (tempId or actual ID) */
  parent: z.string().optional(),
});

export type CreateSpec = z.infer<typeof CreateSpecSchema>;

/**
 * Element to be updated
 */
export const UpdateSpecSchema = z.object({
  /** Element ID to update (must exist on canvas) */
  targetId: z.string().describe("Existing element ID from references"),
  /** What will be changed */
  changes: z.record(z.string(), z.unknown()).describe("Properties to change"),
  /** Brief reason for the update */
  reason: z.string().optional(),
});

export type UpdateSpec = z.infer<typeof UpdateSpecSchema>;

/**
 * Element to be deleted
 */
export const DeleteSpecSchema = z.object({
  /** Element ID to delete */
  targetId: z.string().describe("Element ID to remove"),
  /** Reason for deletion */
  reason: z.string().optional(),
});

export type DeleteSpec = z.infer<typeof DeleteSpecSchema>;

/**
 * All expected changes from this plan
 */
export const ChangeScopeSchema = z.object({
  /** Elements to create */
  creates: z.array(CreateSpecSchema).default([]),
  /** Elements to update */
  updates: z.array(UpdateSpecSchema).default([]),
  /** Elements to delete */
  deletes: z.array(DeleteSpecSchema).default([]),
});

export type ChangeScope = z.infer<typeof ChangeScopeSchema>;

// ============================================================================
// TASK DEFINITION
// ============================================================================

/**
 * Task status
 */
export const TaskStatusSchema = z.enum(["pending", "in_progress", "completed", "failed", "skipped"]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

/**
 * Individual task in the plan
 */
export const PlanTaskSchema = z.object({
  /** Unique task ID */
  id: z.string(),
  /** What needs to be done (imperative form) */
  content: z.string().min(1).describe("Task description (e.g., 'Create header frame')"),
  /** Current status */
  status: TaskStatusSchema,
  /** Present continuous form for UI display */
  activeForm: z.string().min(1).describe("Present tense (e.g., 'Creating header frame')"),
  /** Element IDs this task will create (tempIds from changes.creates) */
  creates: z.array(z.string()).optional(),
  /** Element IDs this task will update (from changes.updates) */
  updates: z.array(z.string()).optional(),
  /** Element IDs this task will delete (from changes.deletes) */
  deletes: z.array(z.string()).optional(),
  /** Dependencies on other task IDs */
  dependsOn: z.array(z.string()).optional(),
});

export type PlanTask = z.infer<typeof PlanTaskSchema>;

// ============================================================================
// STRUCTURED PLAN
// ============================================================================

/**
 * Complete structured plan for plan-walkthrough pattern
 */
export const StructuredPlanSchema = z.object({
  /** Plan version for compatibility */
  version: z.literal("1.0").default("1.0"),

  /** Unique plan ID */
  id: z.string(),

  /**
   * OBJECTIVE
   * What the user wants to achieve (high-level goal)
   */
  objective: z.object({
    /** One-line summary */
    summary: z.string().describe("One-line goal (e.g., 'Create a marketing infographic')"),
    /** Detailed description if needed */
    details: z.string().optional(),
    /** User's original request (for reference) */
    userRequest: z.string().optional(),
  }),

  /**
   * REFERENCES
   * Context and resources being used
   */
  references: z.object({
    /** Existing canvas elements being used/modified */
    elements: z.array(ElementReferenceSchema).default([]),
    /** External context (user input, images, data) */
    context: z.array(ContextReferenceSchema).default([]),
    /** Canvas state snapshot info */
    canvasState: z
      .object({
        elementCount: z.number(),
        bounds: z
          .object({
            x: z.number(),
            y: z.number(),
            width: z.number(),
            height: z.number(),
          })
          .optional(),
        hasSelection: z.boolean().optional(),
        selectedIds: z.array(z.string()).optional(),
      })
      .optional(),
  }),

  /**
   * TASKS
   * Ordered list of actions to complete
   */
  tasks: z.array(PlanTaskSchema),

  /**
   * CHANGES
   * Expected mutations - enables scope validation
   */
  changes: ChangeScopeSchema,

  /** Created timestamp */
  createdAt: z.number().default(() => Date.now()),

  /** Last updated timestamp */
  updatedAt: z.number().optional(),
});

export type StructuredPlan = z.infer<typeof StructuredPlanSchema>;

// ============================================================================
// PLAN RESULT (after execution)
// ============================================================================

/**
 * Result of executing a structured plan
 */
export interface PlanExecutionResult {
  /** Plan ID that was executed */
  planId: string;

  /** Overall success */
  success: boolean;

  /** Execution summary */
  summary: string;

  /** Actual changes made */
  actualChanges: {
    /** Created element IDs (mapped from tempIds) */
    created: Map<string, string>; // tempId -> actualId
    /** Updated element IDs */
    updated: string[];
    /** Deleted element IDs */
    deleted: string[];
  };

  /** Tasks that completed */
  completedTasks: string[];

  /** Tasks that failed */
  failedTasks: Array<{ id: string; error: string }>;

  /** Scope validation result */
  scopeValidation: {
    /** Did actual changes match expected scope? */
    valid: boolean;
    /** Unexpected creates (not in plan) */
    unexpectedCreates: string[];
    /** Unexpected updates (not in plan) */
    unexpectedUpdates: string[];
    /** Unexpected deletes (not in plan) */
    unexpectedDeletes: string[];
    /** Missing creates (in plan but not executed) */
    missingCreates: string[];
    /** Missing updates (in plan but not executed) */
    missingUpdates: string[];
  };

  /** Execution metrics */
  metrics: {
    durationMs: number;
    tokensUsed: number;
    toolCalls: number;
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create an empty structured plan
 */
export function createEmptyPlan(id: string, objective: string): StructuredPlan {
  return {
    version: "1.0",
    id,
    objective: {
      summary: objective,
    },
    references: {
      elements: [],
      context: [],
    },
    tasks: [],
    changes: {
      creates: [],
      updates: [],
      deletes: [],
    },
    createdAt: Date.now(),
  };
}

/**
 * Generate a unique plan ID
 */
export function generatePlanId(): string {
  return `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Generate a task ID
 */
export function generateTaskId(prefix = "task"): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Generate a temp ID for creates
 */
export function generateTempId(type: string): string {
  return `new-${type}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Get plan progress summary
 */
export function getPlanProgress(plan: StructuredPlan): {
  total: number;
  completed: number;
  inProgress: number;
  pending: number;
  failed: number;
  percent: number;
} {
  const total = plan.tasks.length;
  const completed = plan.tasks.filter((t) => t.status === "completed").length;
  const inProgress = plan.tasks.filter((t) => t.status === "in_progress").length;
  const pending = plan.tasks.filter((t) => t.status === "pending").length;
  const failed = plan.tasks.filter((t) => t.status === "failed").length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return { total, completed, inProgress, pending, failed, percent };
}

/**
 * Get current active task
 */
export function getCurrentTask(plan: StructuredPlan): PlanTask | undefined {
  return plan.tasks.find((t) => t.status === "in_progress");
}

/**
 * Get change scope summary
 */
export function getChangeScopeSummary(scope: ChangeScope): string {
  const parts: string[] = [];

  if (scope.creates.length > 0) {
    parts.push(`+${scope.creates.length} new`);
  }
  if (scope.updates.length > 0) {
    parts.push(`~${scope.updates.length} updates`);
  }
  if (scope.deletes.length > 0) {
    parts.push(`-${scope.deletes.length} deletes`);
  }

  return parts.length > 0 ? parts.join(", ") : "no changes";
}

/**
 * Format plan for LLM context injection
 */
export function formatPlanForContext(plan: StructuredPlan): string {
  const lines: string[] = [];

  // Objective
  lines.push(`## Objective\n${plan.objective.summary}`);
  if (plan.objective.details) {
    lines.push(plan.objective.details);
  }

  // References (compact)
  if (plan.references.elements.length > 0) {
    lines.push(
      `\n## References\nElements: ${plan.references.elements.map((e) => e.id).join(", ")}`
    );
  }

  // Tasks with status
  lines.push("\n## Tasks");
  for (const task of plan.tasks) {
    const status =
      task.status === "completed"
        ? "✓"
        : task.status === "in_progress"
          ? "→"
          : task.status === "failed"
            ? "✗"
            : "○";
    const display = task.status === "in_progress" ? task.activeForm : task.content;
    lines.push(`${status} ${display}`);
  }

  // Change scope (compact)
  const scopeSummary = getChangeScopeSummary(plan.changes);
  lines.push(`\n## Expected Changes\n${scopeSummary}`);

  return lines.join("\n");
}

/**
 * Format plan as structured YAML-like block for prompts
 */
export function formatPlanAsYaml(plan: StructuredPlan): string {
  const lines: string[] = ["```plan"];

  lines.push(`objective: ${plan.objective.summary}`);

  if (plan.references.elements.length > 0) {
    lines.push("references:");
    for (const ref of plan.references.elements) {
      lines.push(`  - ${ref.id}${ref.reason ? ` # ${ref.reason}` : ""}`);
    }
  }

  lines.push("tasks:");
  for (const task of plan.tasks) {
    const status = `[${task.status}]`;
    lines.push(`  - ${status} ${task.content}`);
    if (task.creates && task.creates.length > 0) {
      lines.push(`    creates: [${task.creates.join(", ")}]`);
    }
    if (task.updates && task.updates.length > 0) {
      lines.push(`    updates: [${task.updates.join(", ")}]`);
    }
  }

  lines.push("changes:");
  if (plan.changes.creates.length > 0) {
    lines.push("  creates:");
    for (const c of plan.changes.creates) {
      lines.push(`    - ${c.tempId}: ${c.type} # ${c.description}`);
    }
  }
  if (plan.changes.updates.length > 0) {
    lines.push("  updates:");
    for (const u of plan.changes.updates) {
      lines.push(`    - ${u.targetId}: ${Object.keys(u.changes).join(", ")}`);
    }
  }
  if (plan.changes.deletes.length > 0) {
    lines.push("  deletes:");
    for (const d of plan.changes.deletes) {
      lines.push(`    - ${d.targetId}${d.reason ? ` # ${d.reason}` : ""}`);
    }
  }

  lines.push("```");
  return lines.join("\n");
}
