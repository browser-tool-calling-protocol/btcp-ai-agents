/**
 * Plan Builder Module
 *
 * Creates execution plans based on exploration results.
 * Does NOT execute anything - just builds the plan structure.
 */

import type { AgentType } from "../types/index.js";
import type { ComplexityAssessment } from "./complexity.js";
import type { ExplorationResult } from "./exploration.js";

// ============================================================================
// TYPES
// ============================================================================

/**
 * Execution plan created from exploration
 */
export interface ExecutionPlan {
  /** Unique plan ID */
  id: string;

  /** High-level summary */
  summary: string;

  /** Phases of execution */
  phases: ExecutionPlanPhase[];

  /** Total estimated time */
  estimatedDurationMs: number;

  /** Total estimated tokens */
  estimatedTokens: number;

  /** Requires user approval before execution? */
  requiresApproval: boolean;

  /** Warnings or considerations */
  warnings: string[];
}

/**
 * A phase in the execution plan
 */
export interface ExecutionPlanPhase {
  id: string;
  name: string;
  description: string;

  /** Tasks in this phase */
  tasks: ExecutionTask[];

  /** Can tasks run in parallel? */
  parallel: boolean;

  /** Dependencies on previous phases */
  dependsOn: string[];
}

/**
 * A single task in a phase
 */
export interface ExecutionTask {
  id: string;
  description: string;
  agentType: AgentType;
  workRegion?: { x: number; y: number; width: number; height: number };
  inputs?: Record<string, unknown>;
  estimatedTokens: number;
}

/**
 * Detected section from task analysis
 */
interface DetectedSection {
  name: string;
  type: string;
  priority: "high" | "normal" | "low";
  specialist?: AgentType;
  inputs?: Record<string, unknown>;
  estimatedTokens: number;
}

// ============================================================================
// PLAN CREATION
// ============================================================================

/**
 * Create an execution plan based on exploration results
 *
 * This phase:
 * - Analyzes the task + exploration results
 * - Creates a structured plan
 * - Does NOT execute anything
 * - Returns plan for approval
 */
export function createExecutionPlan(
  task: string,
  exploration: ExplorationResult,
  complexity: ComplexityAssessment
): ExecutionPlan {
  const planId = `plan-${Date.now()}`;

  // Detect what needs to be created
  const sections = detectSections(task);
  const specialists = detectSpecialists(task);

  // Create phases based on dependencies
  const phases: ExecutionPlanPhase[] = [];

  // Phase 0: Setup (if needed)
  if (exploration.canvasState.elementCount === 0) {
    phases.push({
      id: "phase-setup",
      name: "Setup",
      description: "Initialize canvas structure",
      tasks: [
        {
          id: "task-skeleton",
          description: "Create layout skeleton",
          agentType: "canvas-agent",
          estimatedTokens: 1000,
        },
      ],
      parallel: false,
      dependsOn: [],
    });
  }

  // Phase 1: Foundation elements (header, etc.)
  const foundationSections = sections.filter(
    (s) => s.type === "header" || s.priority === "high"
  );
  if (foundationSections.length > 0) {
    phases.push({
      id: "phase-foundation",
      name: "Foundation",
      description: "Create header and core structure",
      tasks: foundationSections.map((s, i) => ({
        id: `task-foundation-${i}`,
        description: `Create ${s.name}`,
        agentType: s.specialist || "canvas-agent",
        workRegion: exploration.availableRegions[0]?.bounds,
        estimatedTokens: s.estimatedTokens,
      })),
      parallel: false,
      dependsOn: phases.length > 0 ? ["phase-setup"] : [],
    });
  }

  // Phase 2: Parallel content sections
  const contentSections = sections.filter(
    (s) => s.type !== "header" && s.type !== "footer" && s.priority !== "high"
  );
  if (contentSections.length > 0) {
    phases.push({
      id: "phase-content",
      name: "Content",
      description: `Create ${contentSections.length} content sections`,
      tasks: contentSections.map((s, i) => ({
        id: `task-content-${i}`,
        description: `Create ${s.name}`,
        agentType: s.specialist || "canvas-agent",
        workRegion: calculateTaskRegion(i, contentSections.length, exploration),
        inputs: s.inputs,
        estimatedTokens: s.estimatedTokens,
      })),
      parallel: contentSections.length >= 2,
      dependsOn: ["phase-foundation"],
    });
  }

  // Phase 3: Assembly (footer, connectors, polish)
  const assemblySections = sections.filter((s) => s.type === "footer");
  phases.push({
    id: "phase-assembly",
    name: "Assembly",
    description: "Add footer, connectors, and polish",
    tasks: [
      ...assemblySections.map((s, i) => ({
        id: `task-assembly-${i}`,
        description: `Create ${s.name}`,
        agentType: s.specialist || ("canvas-agent" as AgentType),
        estimatedTokens: s.estimatedTokens,
      })),
      {
        id: "task-polish",
        description: "Apply final styling and ensure consistency",
        agentType: "style-specialist" as AgentType,
        estimatedTokens: 2000,
      },
    ],
    parallel: false,
    dependsOn: phases.length > 0 ? [phases[phases.length - 1].id] : [],
  });

  // Calculate totals
  const totalTokens = phases.reduce(
    (sum, phase) =>
      sum + phase.tasks.reduce((tSum, task) => tSum + task.estimatedTokens, 0),
    0
  );

  return {
    id: planId,
    summary: `${phases.length} phases, ${sections.length} sections, ${specialists.length} specialists`,
    phases,
    estimatedDurationMs: totalTokens * 2,
    estimatedTokens: totalTokens,
    requiresApproval: complexity.isComplex && complexity.confidence > 0.7,
    warnings: exploration.constraints,
  };
}

/**
 * Detect sections from task description
 */
export function detectSections(task: string): DetectedSection[] {
  const lower = task.toLowerCase();
  const sections: DetectedSection[] = [];

  // Always add header
  sections.push({
    name: "Header",
    type: "header",
    priority: "high",
    specialist: "canvas-agent",
    estimatedTokens: 1500,
  });

  // Detect content types
  if (/statistic|metric|number|kpi/.test(lower)) {
    sections.push({
      name: "Statistics",
      type: "statistics",
      priority: "normal",
      specialist: "canvas-agent",
      estimatedTokens: 2000,
    });
  }

  if (/timeline|history|evolution/.test(lower)) {
    sections.push({
      name: "Timeline",
      type: "timeline",
      priority: "normal",
      specialist: "diagram-specialist",
      estimatedTokens: 4000,
    });
  }

  if (/diagram|flowchart|process|flow/.test(lower)) {
    sections.push({
      name: "Diagram",
      type: "diagram",
      priority: "normal",
      specialist: "diagram-specialist",
      estimatedTokens: 4000,
    });
  }

  if (/compar|vs|versus/.test(lower)) {
    sections.push({
      name: "Comparison",
      type: "comparison",
      priority: "normal",
      specialist: "layout-specialist",
      estimatedTokens: 2500,
    });
  }

  if (/chart|graph|data/.test(lower)) {
    sections.push({
      name: "Chart",
      type: "chart",
      priority: "normal",
      specialist: "diagram-specialist",
      estimatedTokens: 3000,
    });
  }

  if (/icon|feature|benefit/.test(lower)) {
    sections.push({
      name: "Icons",
      type: "icons",
      priority: "normal",
      specialist: "canvas-agent",
      estimatedTokens: 2000,
    });
  }

  // Add footer if sections detected
  if (sections.length > 1) {
    sections.push({
      name: "Footer",
      type: "footer",
      priority: "low",
      specialist: "canvas-agent",
      estimatedTokens: 1000,
    });
  }

  return sections;
}

/**
 * Detect which specialists are needed
 */
export function detectSpecialists(task: string): AgentType[] {
  const lower = task.toLowerCase();
  const specialists: AgentType[] = [];

  if (/diagram|timeline|flowchart|chart/.test(lower)) {
    specialists.push("diagram-specialist");
  }
  if (/layout|arrange|align|compar/.test(lower)) {
    specialists.push("layout-specialist");
  }
  if (/style|color|theme|polish/.test(lower)) {
    specialists.push("style-specialist");
  }
  if (/connect|arrow|flow/.test(lower)) {
    specialists.push("connector-specialist");
  }

  return [...new Set(specialists)];
}

/**
 * Calculate work region for a task
 */
export function calculateTaskRegion(
  index: number,
  total: number,
  exploration: ExplorationResult
): { x: number; y: number; width: number; height: number } {
  const canvasBounds = exploration.canvasState.bounds;
  const sectionHeight = 300;
  const gap = 20;

  return {
    x: 0,
    y: canvasBounds.height + gap + index * (sectionHeight + gap),
    width: canvasBounds.width,
    height: sectionHeight,
  };
}
