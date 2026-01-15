/**
 * Plan Validator - Scope validation for plan-walkthrough pattern
 *
 * Validates that:
 * 1. Plan structure is valid (schema validation)
 * 2. References exist on canvas (pre-execution)
 * 3. Actual changes match expected scope (post-execution)
 *
 * Enables the pattern:
 * 1. Generate plan → 2. Validate scope → 3. Walkthrough with user → 4. Execute → 5. Verify
 */

import type {
  StructuredPlan,
  ChangeScope,
  CreateSpec,
  UpdateSpec,
  DeleteSpec,
  PlanExecutionResult,
  ElementReference,
} from "./structured-plan.js";
import { StructuredPlanSchema } from "./structured-plan.js";

// ============================================================================
// VALIDATION RESULT TYPES
// ============================================================================

export interface ValidationError {
  code: string;
  message: string;
  path?: string;
  severity: "error" | "warning";
}

export interface PlanValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

export interface ScopeValidationResult {
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
  /** Missing deletes (in plan but not executed) */
  missingDeletes: string[];
}

// ============================================================================
// SCHEMA VALIDATION
// ============================================================================

/**
 * Validate plan structure against schema
 */
export function validatePlanSchema(plan: unknown): PlanValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  const result = StructuredPlanSchema.safeParse(plan);

  if (!result.success) {
    for (const issue of result.error.issues) {
      errors.push({
        code: "SCHEMA_ERROR",
        message: issue.message,
        path: issue.path.join("."),
        severity: "error",
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================================================
// PRE-EXECUTION VALIDATION
// ============================================================================

/**
 * Canvas state interface for validation
 */
export interface CanvasStateForValidation {
  elementIds: Set<string>;
  elementTypes: Map<string, string>;
}

/**
 * Validate plan before execution
 *
 * Checks:
 * - Schema validity
 * - Referenced elements exist
 * - Update/delete targets exist
 * - No circular dependencies
 */
export function validatePlanPreExecution(
  plan: StructuredPlan,
  canvasState: CanvasStateForValidation
): PlanValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // 1. Validate referenced elements exist
  for (const ref of plan.references.elements) {
    if (!canvasState.elementIds.has(ref.id)) {
      errors.push({
        code: "REFERENCE_NOT_FOUND",
        message: `Referenced element '${ref.id}' does not exist on canvas`,
        path: `references.elements`,
        severity: "error",
      });
    } else if (ref.type) {
      const actualType = canvasState.elementTypes.get(ref.id);
      if (actualType && actualType !== ref.type) {
        warnings.push({
          code: "TYPE_MISMATCH",
          message: `Element '${ref.id}' is type '${actualType}', expected '${ref.type}'`,
          path: `references.elements`,
          severity: "warning",
        });
      }
    }
  }

  // 2. Validate update targets exist
  for (const update of plan.changes.updates) {
    if (!canvasState.elementIds.has(update.targetId)) {
      errors.push({
        code: "UPDATE_TARGET_NOT_FOUND",
        message: `Update target '${update.targetId}' does not exist on canvas`,
        path: `changes.updates`,
        severity: "error",
      });
    }
  }

  // 3. Validate delete targets exist
  for (const del of plan.changes.deletes) {
    if (!canvasState.elementIds.has(del.targetId)) {
      errors.push({
        code: "DELETE_TARGET_NOT_FOUND",
        message: `Delete target '${del.targetId}' does not exist on canvas`,
        path: `changes.deletes`,
        severity: "error",
      });
    }
  }

  // 4. Validate task dependencies
  const taskIds = new Set(plan.tasks.map((t) => t.id));
  for (const task of plan.tasks) {
    if (task.dependsOn) {
      for (const dep of task.dependsOn) {
        if (!taskIds.has(dep)) {
          errors.push({
            code: "INVALID_DEPENDENCY",
            message: `Task '${task.id}' depends on unknown task '${dep}'`,
            path: `tasks`,
            severity: "error",
          });
        }
      }
    }
  }

  // 5. Check for circular dependencies
  const tasksWithIds = plan.tasks.filter((t): t is typeof t & { id: string } => !!t.id);
  const circularDep = detectCircularDependency(tasksWithIds);
  if (circularDep) {
    errors.push({
      code: "CIRCULAR_DEPENDENCY",
      message: `Circular dependency detected: ${circularDep.join(" → ")}`,
      path: `tasks`,
      severity: "error",
    });
  }

  // 6. Validate create tempIds are unique
  const tempIds = new Set<string>();
  for (const create of plan.changes.creates) {
    if (tempIds.has(create.tempId)) {
      errors.push({
        code: "DUPLICATE_TEMP_ID",
        message: `Duplicate tempId '${create.tempId}' in creates`,
        path: `changes.creates`,
        severity: "error",
      });
    }
    tempIds.add(create.tempId);
  }

  // 7. Validate task change references
  for (const task of plan.tasks) {
    // Check creates references
    if (task.creates) {
      for (const tempId of task.creates) {
        if (!tempIds.has(tempId)) {
          warnings.push({
            code: "UNKNOWN_CREATE_REF",
            message: `Task '${task.id}' references unknown create '${tempId}'`,
            path: `tasks`,
            severity: "warning",
          });
        }
      }
    }
    // Check updates references
    if (task.updates) {
      for (const targetId of task.updates) {
        const inUpdates = plan.changes.updates.some((u) => u.targetId === targetId);
        if (!inUpdates && !canvasState.elementIds.has(targetId)) {
          warnings.push({
            code: "UNKNOWN_UPDATE_REF",
            message: `Task '${task.id}' references unknown update target '${targetId}'`,
            path: `tasks`,
            severity: "warning",
          });
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Detect circular dependencies in tasks
 */
function detectCircularDependency(
  tasks: Array<{ id: string; dependsOn?: string[] }>
): string[] | null {
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const path: string[] = [];

  function dfs(taskId: string): boolean {
    if (recursionStack.has(taskId)) {
      path.push(taskId);
      return true;
    }
    if (visited.has(taskId)) {
      return false;
    }

    visited.add(taskId);
    recursionStack.add(taskId);
    path.push(taskId);

    const task = tasks.find((t) => t.id === taskId);
    if (task?.dependsOn) {
      for (const dep of task.dependsOn) {
        if (dfs(dep)) {
          return true;
        }
      }
    }

    recursionStack.delete(taskId);
    path.pop();
    return false;
  }

  for (const task of tasks) {
    if (dfs(task.id)) {
      // Extract the cycle from path
      const cycleStart = path.indexOf(path[path.length - 1]);
      return path.slice(cycleStart);
    }
    path.length = 0;
    visited.clear();
    recursionStack.clear();
  }

  return null;
}

// ============================================================================
// EXECUTION TRACKING
// ============================================================================

/**
 * Tracks actual changes during plan execution
 */
export class ExecutionTracker {
  private createdElements: Map<string, string> = new Map(); // tempId -> actualId
  private updatedElements: Set<string> = new Set();
  private deletedElements: Set<string> = new Set();
  private expectedScope: ChangeScope;

  constructor(expectedScope: ChangeScope) {
    this.expectedScope = expectedScope;
  }

  /**
   * Record a created element
   */
  recordCreate(tempId: string, actualId: string): void {
    this.createdElements.set(tempId, actualId);
  }

  /**
   * Record an updated element
   */
  recordUpdate(elementId: string): void {
    this.updatedElements.add(elementId);
  }

  /**
   * Record a deleted element
   */
  recordDelete(elementId: string): void {
    this.deletedElements.add(elementId);
  }

  /**
   * Get mapping of tempIds to actual IDs
   */
  getTempIdMapping(): Map<string, string> {
    return new Map(this.createdElements);
  }

  /**
   * Resolve a tempId to actual ID (or return as-is if not a tempId)
   */
  resolveId(id: string): string {
    return this.createdElements.get(id) ?? id;
  }

  /**
   * Validate scope after execution
   */
  validateScope(): ScopeValidationResult {
    const expectedCreates = new Set(this.expectedScope.creates.map((c) => c.tempId));
    const expectedUpdates = new Set(this.expectedScope.updates.map((u) => u.targetId));
    const expectedDeletes = new Set(this.expectedScope.deletes.map((d) => d.targetId));

    const actualCreates = new Set(this.createdElements.keys());
    const actualUpdates = this.updatedElements;
    const actualDeletes = this.deletedElements;

    // Find unexpected changes
    const unexpectedCreates = Array.from(actualCreates).filter((id) => !expectedCreates.has(id));
    const unexpectedUpdates = Array.from(actualUpdates).filter((id) => !expectedUpdates.has(id));
    const unexpectedDeletes = Array.from(actualDeletes).filter((id) => !expectedDeletes.has(id));

    // Find missing changes
    const missingCreates = Array.from(expectedCreates).filter((id) => !actualCreates.has(id));
    const missingUpdates = Array.from(expectedUpdates).filter((id) => !actualUpdates.has(id));
    const missingDeletes = Array.from(expectedDeletes).filter((id) => !actualDeletes.has(id));

    const valid =
      unexpectedCreates.length === 0 &&
      unexpectedUpdates.length === 0 &&
      unexpectedDeletes.length === 0 &&
      missingCreates.length === 0;

    return {
      valid,
      unexpectedCreates,
      unexpectedUpdates,
      unexpectedDeletes,
      missingCreates,
      missingUpdates,
      missingDeletes,
    };
  }

  /**
   * Get summary of tracked changes
   */
  getSummary(): { created: number; updated: number; deleted: number } {
    return {
      created: this.createdElements.size,
      updated: this.updatedElements.size,
      deleted: this.deletedElements.size,
    };
  }
}

// ============================================================================
// PLAN PARSING
// ============================================================================

/**
 * Parse plan from LLM output (handles both JSON and YAML-like formats)
 */
export function parsePlanFromOutput(output: string): StructuredPlan | null {
  // Try JSON first
  const jsonMatch = output.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      const result = StructuredPlanSchema.safeParse(parsed);
      if (result.success) {
        return result.data;
      }
    } catch {
      // Fall through to YAML parsing
    }
  }

  // Try YAML-like format
  const yamlMatch = output.match(/```plan\s*([\s\S]*?)\s*```/);
  if (yamlMatch) {
    return parseYamlLikePlan(yamlMatch[1]);
  }

  return null;
}

/**
 * Parse YAML-like plan format
 */
function parseYamlLikePlan(yaml: string): StructuredPlan | null {
  const lines = yaml.split("\n").map((l) => l.trim());

  const plan: Partial<StructuredPlan> = {
    version: "1.0",
    id: `plan-${Date.now()}`,
    references: { elements: [], context: [] },
    tasks: [],
    changes: { creates: [], updates: [], deletes: [] },
    createdAt: Date.now(),
  };

  let section: "root" | "references" | "tasks" | "changes" | "creates" | "updates" | "deletes" =
    "root";

  for (const line of lines) {
    if (!line || line.startsWith("#")) continue;

    // Parse objective
    if (line.startsWith("objective:")) {
      plan.objective = { summary: line.slice("objective:".length).trim() };
      continue;
    }

    // Section markers
    if (line === "references:") {
      section = "references";
      continue;
    }
    if (line === "tasks:") {
      section = "tasks";
      continue;
    }
    if (line === "changes:") {
      section = "changes";
      continue;
    }
    if (line === "creates:") {
      section = "creates";
      continue;
    }
    if (line === "updates:") {
      section = "updates";
      continue;
    }
    if (line === "deletes:") {
      section = "deletes";
      continue;
    }

    // Parse items based on section
    if (line.startsWith("- ")) {
      const content = line.slice(2).trim();

      if (section === "references") {
        // Parse: - element_id # reason
        const [id, reason] = content.split("#").map((s) => s.trim());
        plan.references!.elements!.push({ id, reason });
      } else if (section === "tasks") {
        // Parse: - [status] task content
        const statusMatch = content.match(/^\[(\w+)\]\s*(.+)$/);
        if (statusMatch) {
          const status = statusMatch[1] as "pending" | "in_progress" | "completed";
          const taskContent = statusMatch[2];
          plan.tasks!.push({
            id: `task-${plan.tasks!.length + 1}`,
            content: taskContent,
            status,
            activeForm: toActiveForm(taskContent),
          });
        }
      } else if (section === "creates") {
        // Parse: - tempId: type # description
        const match = content.match(/^(\S+):\s*(\w+)\s*(?:#\s*(.+))?$/);
        if (match) {
          plan.changes!.creates!.push({
            tempId: match[1],
            type: match[2] as CreateSpec["type"],
            description: match[3] || match[2],
          });
        }
      } else if (section === "updates") {
        // Parse: - targetId: prop1, prop2
        const match = content.match(/^(\S+):\s*(.+)$/);
        if (match) {
          const props = match[2].split(",").map((p) => p.trim());
          plan.changes!.updates!.push({
            targetId: match[1],
            changes: Object.fromEntries(props.map((p) => [p, true])),
          });
        }
      } else if (section === "deletes") {
        // Parse: - targetId # reason
        const [id, reason] = content.split("#").map((s) => s.trim());
        plan.changes!.deletes!.push({ targetId: id, reason });
      }
    }
  }

  // Validate parsed plan
  const result = StructuredPlanSchema.safeParse(plan);
  return result.success ? result.data : null;
}

/**
 * Convert imperative form to active form
 * "Create header" → "Creating header"
 */
function toActiveForm(imperative: string): string {
  const words = imperative.split(" ");
  if (words.length === 0) return imperative;

  const verb = words[0].toLowerCase();
  let activeVerb: string;

  // Handle common verbs
  if (verb.endsWith("e")) {
    activeVerb = verb.slice(0, -1) + "ing";
  } else if (/[^aeiou][aeiou][^aeiouw]$/.test(verb) && verb.length <= 4) {
    activeVerb = verb + verb[verb.length - 1] + "ing";
  } else {
    activeVerb = verb + "ing";
  }

  // Capitalize first letter
  activeVerb = activeVerb.charAt(0).toUpperCase() + activeVerb.slice(1);

  return [activeVerb, ...words.slice(1)].join(" ");
}

// ============================================================================
// WALKTHROUGH HELPERS
// ============================================================================

/**
 * Format plan for user walkthrough/approval
 */
export function formatPlanForWalkthrough(plan: StructuredPlan): string {
  const lines: string[] = [];

  // Header
  lines.push("## Plan Summary");
  lines.push("");
  lines.push(`**Objective:** ${plan.objective.summary}`);
  lines.push("");

  // References
  if (plan.references.elements.length > 0) {
    lines.push("### References");
    for (const ref of plan.references.elements) {
      lines.push(`- \`${ref.id}\`${ref.reason ? ` - ${ref.reason}` : ""}`);
    }
    lines.push("");
  }

  // Tasks
  lines.push("### Tasks");
  for (let i = 0; i < plan.tasks.length; i++) {
    const task = plan.tasks[i];
    lines.push(`${i + 1}. ${task.content}`);
    if (task.creates && task.creates.length > 0) {
      lines.push(`   - Creates: ${task.creates.join(", ")}`);
    }
    if (task.updates && task.updates.length > 0) {
      lines.push(`   - Updates: ${task.updates.join(", ")}`);
    }
  }
  lines.push("");

  // Expected Changes
  lines.push("### Expected Changes");

  if (plan.changes.creates.length > 0) {
    lines.push("**Creates:**");
    for (const c of plan.changes.creates) {
      lines.push(`- \`${c.tempId}\` (${c.type}) - ${c.description}`);
    }
  }

  if (plan.changes.updates.length > 0) {
    lines.push("**Updates:**");
    for (const u of plan.changes.updates) {
      const changes = Object.keys(u.changes).join(", ");
      lines.push(`- \`${u.targetId}\` → ${changes}`);
    }
  }

  if (plan.changes.deletes.length > 0) {
    lines.push("**Deletes:**");
    for (const d of plan.changes.deletes) {
      lines.push(`- \`${d.targetId}\`${d.reason ? ` - ${d.reason}` : ""}`);
    }
  }

  if (
    plan.changes.creates.length === 0 &&
    plan.changes.updates.length === 0 &&
    plan.changes.deletes.length === 0
  ) {
    lines.push("*No changes expected*");
  }

  return lines.join("\n");
}

/**
 * Generate scope validation report
 */
export function formatScopeValidationReport(result: ScopeValidationResult): string {
  const lines: string[] = [];

  if (result.valid) {
    lines.push("✓ All changes match expected scope");
  } else {
    lines.push("⚠ Scope validation issues found:");
    lines.push("");

    if (result.unexpectedCreates.length > 0) {
      lines.push(`**Unexpected creates:** ${result.unexpectedCreates.join(", ")}`);
    }
    if (result.unexpectedUpdates.length > 0) {
      lines.push(`**Unexpected updates:** ${result.unexpectedUpdates.join(", ")}`);
    }
    if (result.unexpectedDeletes.length > 0) {
      lines.push(`**Unexpected deletes:** ${result.unexpectedDeletes.join(", ")}`);
    }
    if (result.missingCreates.length > 0) {
      lines.push(`**Missing creates:** ${result.missingCreates.join(", ")}`);
    }
    if (result.missingUpdates.length > 0) {
      lines.push(`**Missing updates:** ${result.missingUpdates.join(", ")}`);
    }
    if (result.missingDeletes.length > 0) {
      lines.push(`**Missing deletes:** ${result.missingDeletes.join(", ")}`);
    }
  }

  return lines.join("\n");
}
