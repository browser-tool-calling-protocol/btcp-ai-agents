/**
 * Delegation Decision Engine
 *
 * How Claude Code decides WHEN to spawn isolated sub-agents vs direct execution.
 *
 * ## The Core Question
 *
 * For any task, Claude Code must decide:
 * 1. Execute directly (no isolation overhead)
 * 2. Delegate to sub-agent (isolation benefits)
 *
 * ## Claude Code's Native Design Pattern
 *
 * Claude Code's architecture is fundamentally based on this decision tree:
 *
 * ```
 *                        ┌─────────────┐
 *                        │   New Task  │
 *                        └──────┬──────┘
 *                               │
 *                        ┌──────▼──────┐
 *                        │  Analyze    │
 *                        │  Complexity │
 *                        └──────┬──────┘
 *                               │
 *              ┌────────────────┼────────────────┐
 *              │                │                │
 *        ┌─────▼─────┐   ┌─────▼─────┐   ┌─────▼─────┐
 *        │  Simple   │   │ Moderate  │   │  Complex  │
 *        │  < 3 ops  │   │  3-10 ops │   │  > 10 ops │
 *        └─────┬─────┘   └─────┬─────┘   └─────┬─────┘
 *              │               │               │
 *              ▼               ▼               ▼
 *        ┌───────────┐  ┌───────────┐  ┌───────────┐
 *        │  Direct   │  │ Consider  │  │  Always   │
 *        │ Execution │  │ Isolation │  │  Isolate  │
 *        └───────────┘  └─────┬─────┘  └───────────┘
 *                             │
 *                    ┌────────┴────────┐
 *                    │                 │
 *              Specialization?    Parallelizable?
 *                    │                 │
 *                    YES → Isolate     YES → Isolate
 *                    NO  → Direct      NO  → Maybe Direct
 * ```
 *
 * ## Key Insight: Isolation Has Overhead
 *
 * Spawning a sub-agent costs:
 * - ~2000 tokens for system prompt
 * - ~500 tokens for context building
 * - API call latency
 * - Coordination overhead
 *
 * So isolation should only be used when benefits > costs.
 */

import type { AgentType, AgentEvent } from "../types/index.js";
import type { MCPExecutor } from "../core/loop.js";
import type { HooksManager } from "../hooks/manager.js";
import { runAgenticLoop } from "../core/loop.js";
import {
  executeIsolatedSubAgent,
  executeParallelIsolated,
  type SubAgentContract,
  type IsolatedExecutionConfig,
} from "./isolated-delegation.js";

// ============================================================================
// DECISION FACTORS
// ============================================================================

/**
 * Factors that influence the isolation decision
 */
export interface DelegationFactors {
  /** Estimated number of operations needed */
  estimatedOperations: number;

  /** Whether task requires specialized knowledge */
  requiresSpecialization: boolean;

  /** Which specialists would be useful */
  relevantSpecialists: AgentType[];

  /** Whether subtasks can run in parallel */
  parallelizable: boolean;

  /** Number of independent subtasks */
  subtaskCount: number;

  /** Risk level (higher = more reason to isolate) */
  riskLevel: "low" | "medium" | "high";

  /** Token budget remaining */
  remainingTokenBudget: number;

  /** Whether user explicitly requested delegation */
  userRequestedDelegation: boolean;

  /** Task contains multiple distinct goals */
  multipleGoals: boolean;
}

/**
 * The decision: how to execute this task
 */
export interface DelegationDecision {
  /** The chosen strategy */
  strategy: "direct" | "isolated" | "parallel-isolated";

  /** Reason for the decision */
  reason: string;

  /** Confidence in the decision (0-1) */
  confidence: number;

  /** Estimated token savings from isolation (if applicable) */
  estimatedTokenSavings?: number;

  /** Contracts to execute (if isolated) */
  contracts?: SubAgentContract[];

  /** Warnings or considerations */
  warnings: string[];
}

// ============================================================================
// DECISION ENGINE
// ============================================================================

/**
 * Analyze a task and decide whether to isolate
 *
 * This is Claude Code's native decision pattern:
 * 1. Analyze the task for complexity signals
 * 2. Check if isolation benefits outweigh overhead
 * 3. Return the optimal execution strategy
 */
export function decideDelegationStrategy(
  task: string,
  context: {
    canvasId: string;
    remainingTokenBudget?: number;
    forceStrategy?: "direct" | "isolated";
  }
): DelegationDecision {
  // Extract decision factors from task
  const factors = analyzeTaskFactors(task, context);

  // If user explicitly requested, honor it
  if (context.forceStrategy) {
    return {
      strategy: context.forceStrategy,
      reason: "User explicitly requested this strategy",
      confidence: 1.0,
      warnings: [],
    };
  }

  // Decision logic based on factors
  return makeDecision(factors, task, context.canvasId);
}

/**
 * Analyze task to extract decision factors
 */
function analyzeTaskFactors(
  task: string,
  context: { remainingTokenBudget?: number }
): DelegationFactors {
  const lower = task.toLowerCase();
  const words = task.split(/\s+/).length;

  // Estimate operations based on task complexity signals
  const estimatedOperations = estimateOperations(task);

  // Check for specialization needs
  const specialists = detectSpecialists(task);

  // Check for parallelization opportunity
  const subtasks = detectSubtasks(task);

  // Assess risk level
  const riskLevel = assessRisk(task);

  // Check for multiple goals
  const multipleGoals = detectMultipleGoals(task);

  return {
    estimatedOperations,
    requiresSpecialization: specialists.length > 0,
    relevantSpecialists: specialists,
    parallelizable: subtasks.length >= 2 && !hasSequentialDependency(subtasks),
    subtaskCount: subtasks.length,
    riskLevel,
    remainingTokenBudget: context.remainingTokenBudget ?? 100000,
    userRequestedDelegation: detectDelegationRequest(task),
    multipleGoals,
  };
}

/**
 * Make the delegation decision based on factors
 */
function makeDecision(
  factors: DelegationFactors,
  task: string,
  canvasId: string
): DelegationDecision {
  const warnings: string[] = [];

  // =========================================================================
  // RULE 1: Simple tasks → Direct execution
  // =========================================================================
  if (
    factors.estimatedOperations <= 3 &&
    !factors.requiresSpecialization &&
    !factors.multipleGoals
  ) {
    return {
      strategy: "direct",
      reason: "Simple task with few operations - isolation overhead not justified",
      confidence: 0.9,
      warnings,
    };
  }

  // =========================================================================
  // RULE 2: User explicitly requested delegation
  // =========================================================================
  if (factors.userRequestedDelegation) {
    return {
      strategy: factors.parallelizable ? "parallel-isolated" : "isolated",
      reason: "User explicitly requested delegation/parallel execution",
      confidence: 0.95,
      contracts: createContracts(task, factors, canvasId),
      warnings,
    };
  }

  // =========================================================================
  // RULE 3: High risk → Isolate (contain failures)
  // =========================================================================
  if (factors.riskLevel === "high") {
    warnings.push("High-risk task isolated to contain potential failures");
    return {
      strategy: "isolated",
      reason: "High-risk task - isolation provides failure containment",
      confidence: 0.85,
      contracts: createContracts(task, factors, canvasId),
      warnings,
    };
  }

  // =========================================================================
  // RULE 4: Parallel opportunity → Parallel isolated
  // =========================================================================
  if (factors.parallelizable && factors.subtaskCount >= 2) {
    const estimatedSavings = estimateParallelSavings(factors);
    return {
      strategy: "parallel-isolated",
      reason: `${factors.subtaskCount} independent subtasks can run in parallel`,
      confidence: 0.9,
      estimatedTokenSavings: estimatedSavings,
      contracts: createContracts(task, factors, canvasId),
      warnings,
    };
  }

  // =========================================================================
  // RULE 5: Multiple specialists needed → Isolated
  // =========================================================================
  if (factors.relevantSpecialists.length >= 2) {
    return {
      strategy: "isolated",
      reason: `Requires ${factors.relevantSpecialists.length} specialists: ${factors.relevantSpecialists.join(", ")}`,
      confidence: 0.85,
      contracts: createContracts(task, factors, canvasId),
      warnings,
    };
  }

  // =========================================================================
  // RULE 6: Token budget pressure → Isolate (save context space)
  // =========================================================================
  if (
    factors.remainingTokenBudget < 20000 &&
    factors.estimatedOperations > 5
  ) {
    warnings.push("Token budget low - isolating to preserve parent context");
    return {
      strategy: "isolated",
      reason: "Limited token budget - isolation saves context space",
      confidence: 0.8,
      estimatedTokenSavings: factors.estimatedOperations * 500,
      contracts: createContracts(task, factors, canvasId),
      warnings,
    };
  }

  // =========================================================================
  // RULE 7: Complex but single-domain → Consider based on operations
  // =========================================================================
  if (factors.estimatedOperations > 10) {
    return {
      strategy: "isolated",
      reason: `Complex task with ~${factors.estimatedOperations} operations - isolation prevents context bloat`,
      confidence: 0.75,
      contracts: createContracts(task, factors, canvasId),
      warnings,
    };
  }

  // =========================================================================
  // RULE 8: Moderate complexity, single specialist → Can go either way
  // =========================================================================
  if (factors.relevantSpecialists.length === 1) {
    // Direct is simpler, use it unless there's a strong reason not to
    return {
      strategy: "direct",
      reason: "Moderate task with single specialist - direct execution simpler",
      confidence: 0.6, // Lower confidence = might reconsider
      warnings: ["Consider isolation if task proves more complex than expected"],
    };
  }

  // =========================================================================
  // DEFAULT: Direct execution for moderate tasks
  // =========================================================================
  return {
    strategy: "direct",
    reason: "Moderate complexity - direct execution preferred for simplicity",
    confidence: 0.7,
    warnings,
  };
}

// ============================================================================
// ANALYSIS HELPERS
// ============================================================================

/**
 * Estimate number of canvas operations needed
 */
function estimateOperations(task: string): number {
  const lower = task.toLowerCase();
  let estimate = 1;

  // Multiple items mentioned
  const countMatches = lower.match(/\d+\s*(elements?|items?|nodes?|shapes?)/g);
  if (countMatches) {
    countMatches.forEach((match) => {
      const num = parseInt(match);
      if (!isNaN(num)) estimate += num;
    });
  }

  // List indicators
  if (lower.includes("including") || lower.includes("with")) estimate += 3;
  if (lower.match(/,.*,.*,/)) estimate += lower.split(",").length; // Multiple commas

  // Complexity keywords
  const complexityKeywords = [
    "complex",
    "detailed",
    "comprehensive",
    "full",
    "complete",
    "extensive",
  ];
  if (complexityKeywords.some((kw) => lower.includes(kw))) estimate *= 2;

  // Section types that typically need multiple elements
  const sectionTypes = [
    "timeline",
    "diagram",
    "flowchart",
    "chart",
    "comparison",
    "statistics",
  ];
  const matchedSections = sectionTypes.filter((s) => lower.includes(s));
  estimate += matchedSections.length * 5;

  return Math.min(estimate, 50); // Cap at 50
}

/**
 * Detect which specialists would be useful
 */
function detectSpecialists(task: string): AgentType[] {
  const lower = task.toLowerCase();
  const specialists: AgentType[] = [];

  if (
    lower.includes("diagram") ||
    lower.includes("flowchart") ||
    lower.includes("timeline")
  ) {
    specialists.push("diagram-specialist");
  }

  if (
    lower.includes("align") ||
    lower.includes("arrange") ||
    lower.includes("layout") ||
    lower.includes("compar")
  ) {
    specialists.push("layout-specialist");
  }

  if (
    lower.includes("style") ||
    lower.includes("color") ||
    lower.includes("theme") ||
    lower.includes("beautify")
  ) {
    specialists.push("style-specialist");
  }

  if (
    lower.includes("connect") ||
    lower.includes("arrow") ||
    lower.includes("flow") ||
    lower.includes("link")
  ) {
    specialists.push("connector-specialist");
  }

  if (
    lower.includes("mockup") ||
    lower.includes("wireframe") ||
    lower.includes("ui") ||
    lower.includes("interface")
  ) {
    specialists.push("mockup-specialist");
  }

  return specialists;
}

/**
 * Detect independent subtasks in the task
 */
function detectSubtasks(task: string): string[] {
  const subtasks: string[] = [];
  const lower = task.toLowerCase();

  // Look for explicit lists
  const listPatterns = [
    /(?:including|with)[:\s]+([^.]+)/i,
    /(?:create|make|add)[:\s]+(.+?)(?:\.|$)/i,
    /\d+\.\s*([^\n]+)/g,
  ];

  for (const pattern of listPatterns) {
    const matches = task.match(pattern);
    if (matches) {
      const items = matches[1]?.split(/,|and/).map((s) => s.trim()) || [];
      subtasks.push(...items.filter((i) => i.length > 0));
    }
  }

  // Look for section types
  const sectionTypes = [
    "header",
    "footer",
    "timeline",
    "statistics",
    "chart",
    "diagram",
    "comparison",
    "icons",
    "image",
    "quote",
  ];
  for (const section of sectionTypes) {
    if (lower.includes(section) && !subtasks.some((s) => s.includes(section))) {
      subtasks.push(section);
    }
  }

  return [...new Set(subtasks)]; // Deduplicate
}

/**
 * Check if subtasks have sequential dependencies
 */
function hasSequentialDependency(subtasks: string[]): boolean {
  // Header must come first
  // Footer depends on other content
  // Connectors depend on elements being created

  const hasHeader = subtasks.some((s) => s.includes("header"));
  const hasFooter = subtasks.some((s) => s.includes("footer"));
  const hasConnectors = subtasks.some(
    (s) => s.includes("connect") || s.includes("arrow")
  );

  // If we have connectors, they depend on elements
  if (hasConnectors && subtasks.length > 1) return true;

  // If just header/footer with content, they can be somewhat parallel
  // (header doesn't depend on content, content doesn't depend on footer)

  return false;
}

/**
 * Assess risk level of the task
 */
function assessRisk(task: string): "low" | "medium" | "high" {
  const lower = task.toLowerCase();

  // High risk indicators
  if (
    lower.includes("delete") ||
    lower.includes("remove all") ||
    lower.includes("replace all") ||
    lower.includes("clear")
  ) {
    return "high";
  }

  // Medium risk indicators
  if (
    lower.includes("complex") ||
    lower.includes("experimental") ||
    lower.includes("try") ||
    lower.includes("might")
  ) {
    return "medium";
  }

  // Low risk for most creation tasks
  return "low";
}

/**
 * Detect if task has multiple distinct goals
 */
function detectMultipleGoals(task: string): boolean {
  const lower = task.toLowerCase();

  // Multiple action verbs
  const actionVerbs = ["create", "make", "add", "style", "arrange", "connect"];
  const verbCount = actionVerbs.filter((v) => lower.includes(v)).length;

  if (verbCount >= 3) return true;

  // Multiple "and" connectors
  const andCount = (lower.match(/\band\b/g) || []).length;
  if (andCount >= 2) return true;

  // Explicit list with multiple items
  if (lower.includes("including") && lower.split(",").length >= 3) return true;

  return false;
}

/**
 * Detect if user explicitly requested delegation
 */
function detectDelegationRequest(task: string): boolean {
  const lower = task.toLowerCase();

  const delegationPhrases = [
    "in parallel",
    "simultaneously",
    "delegate",
    "spawn",
    "use specialists",
    "break down into",
    "separate tasks",
  ];

  return delegationPhrases.some((phrase) => lower.includes(phrase));
}

/**
 * Estimate token savings from parallel isolation
 */
function estimateParallelSavings(factors: DelegationFactors): number {
  // Each isolated sub-agent saves its full reasoning from parent context
  // Estimate ~2000 tokens per sub-agent for reasoning + tool results

  const perAgentSavings = 2000;
  const coordinationOverhead = 500;

  return factors.subtaskCount * perAgentSavings - coordinationOverhead;
}

/**
 * Create contracts from task analysis
 */
function createContracts(
  task: string,
  factors: DelegationFactors,
  canvasId: string
): SubAgentContract[] {
  const subtasks = detectSubtasks(task);
  const contracts: SubAgentContract[] = [];

  let yOffset = 0;
  const sectionHeight = 200;

  for (let i = 0; i < subtasks.length; i++) {
    const subtask = subtasks[i];
    const specialist = findBestSpecialist(subtask, factors.relevantSpecialists);

    contracts.push({
      contractId: `section-${i}`,
      agentType: specialist,
      task: `Create ${subtask} section`,
      workRegion: {
        canvasId,
        bounds: { x: 0, y: yOffset, width: 800, height: sectionHeight },
      },
      inputs: {},
      expectedOutput: { type: "elements" },
      limits: {
        maxIterations: 10,
        maxTokens: 4000,
        timeoutMs: 30000,
      },
    });

    yOffset += sectionHeight + 20; // Gap between sections
  }

  return contracts;
}

/**
 * Find best specialist for a subtask
 */
function findBestSpecialist(
  subtask: string,
  available: AgentType[]
): AgentType {
  const lower = subtask.toLowerCase();

  if (lower.includes("diagram") || lower.includes("timeline")) {
    return available.includes("diagram-specialist")
      ? "diagram-specialist"
      : "canvas-agent";
  }

  if (lower.includes("layout") || lower.includes("compar")) {
    return available.includes("layout-specialist")
      ? "layout-specialist"
      : "canvas-agent";
  }

  if (lower.includes("style") || lower.includes("color")) {
    return available.includes("style-specialist")
      ? "style-specialist"
      : "canvas-agent";
  }

  return "canvas-agent";
}

// ============================================================================
// EXECUTION ENGINE
// ============================================================================

/**
 * Execute a task using the decided strategy
 *
 * This is the unified entry point that:
 * 1. Decides the best strategy
 * 2. Executes using that strategy
 * 3. Returns consistent results
 */
export async function* executeWithDecision(
  task: string,
  canvasId: string,
  config: IsolatedExecutionConfig & {
    hooks?: HooksManager;
    forceStrategy?: "direct" | "isolated";
  }
): AsyncGenerator<AgentEvent> {
  // Step 1: Make the decision
  const decision = decideDelegationStrategy(task, {
    canvasId,
    forceStrategy: config.forceStrategy,
  });

  // Emit the decision for visibility
  yield {
    type: "thinking",
    message: `Strategy: ${decision.strategy} (${decision.reason})`,
  };

  if (decision.warnings.length > 0) {
    for (const warning of decision.warnings) {
      yield { type: "warning", message: warning };
    }
  }

  // Step 2: Execute based on strategy
  switch (decision.strategy) {
    case "direct":
      // Direct execution - no isolation
      for await (const event of runAgenticLoop(task, canvasId, {
        executor: config.executor,
        hooks: config.hooks,
      })) {
        yield event;
      }
      break;

    case "isolated":
      // Single isolated sub-agent
      if (decision.contracts && decision.contracts.length > 0) {
        for (const contract of decision.contracts) {
          yield { type: "step_start", step: contract.contractId, message: contract.task };

          const result = await executeIsolatedSubAgent(contract, config);

          yield {
            type: result.success ? "step_complete" : "error",
            step: contract.contractId,
            message: result.summary,
          };
        }
      }
      yield { type: "complete", summary: "Task completed with isolated execution" };
      break;

    case "parallel-isolated":
      // Parallel isolated sub-agents
      if (decision.contracts && decision.contracts.length > 0) {
        yield {
          type: "thinking",
          message: `Executing ${decision.contracts.length} contracts in parallel...`,
        };

        const results = await executeParallelIsolated(decision.contracts, config);

        for (const result of results) {
          yield {
            type: result.success ? "step_complete" : "error",
            step: result.contractId,
            message: result.summary,
          };
        }
      }
      yield {
        type: "complete",
        summary: `Task completed with ${decision.contracts?.length || 0} parallel agents`,
      };
      break;
  }
}
