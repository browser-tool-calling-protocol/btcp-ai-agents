/**
 * Isolated Sub-Agent Delegation
 *
 * How Claude Code solves the context isolation problem:
 *
 * ## The Problem
 *
 * When delegating complex tasks to sub-agents:
 * 1. Sub-agents shouldn't pollute the parent's context/conversation
 * 2. Parent only needs the final result, not internal reasoning
 * 3. Sub-agents may need extensive thinking before generating output
 * 4. Multiple sub-agents working in parallel shouldn't conflict
 *
 * ## Claude Code's Solution: Task Tool Pattern
 *
 * ```
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                     PARENT AGENT CONTEXT                        │
 * │   • Has full conversation history                               │
 * │   • Sees only: "Delegating to layout-specialist..."            │
 * │   • Receives only: SubAgentResult { success, output, ... }     │
 * └─────────────────────────────────────────────────────────────────┘
 *                              │
 *                   ┌──────────┴──────────┐
 *                   │    Task Tool Call   │
 *                   │ (Context Boundary)  │
 *                   └──────────┬──────────┘
 *                              │
 *                              ▼
 * ┌─────────────────────────────────────────────────────────────────┐
 * │              SUB-AGENT ISOLATED CONTEXT (NEW)                   │
 * │   • Fresh conversation: only task prompt + system prompt        │
 * │   • Own thinking/reasoning (not sent to parent)                 │
 * │   • Own tool calls (results not sent to parent)                 │
 * │   • Returns only: final summary + created element IDs           │
 * └─────────────────────────────────────────────────────────────────┘
 * ```
 *
 * ## Key Patterns
 *
 * 1. **Contract Interface** - Sub-agent receives spec, returns result
 * 2. **Sandboxed Canvas Region** - Work in isolated frame/area
 * 3. **Two-Phase Execution** - Think first, then act
 * 4. **Result Aggregation** - Merge outputs without merging contexts
 */

import type {
  AgentType,
  AgentEvent,
  SubAgentResult,
  OperationRecord,
} from "../types/index.js";
import { getAgentDefinition, getAgentPrompt } from "../core/agents.js";
import { createAISDKClient } from "../core/client.js";
import { MODEL_IDS } from "../core/constants.js";
import type { MCPExecutor } from "../core/loop.js";
import type { HooksManager } from "../hooks/manager.js";

// ============================================================================
// TYPES
// ============================================================================

/**
 * Contract specification for an isolated sub-agent
 *
 * This is all the sub-agent receives - no parent context leaks through
 */
export interface SubAgentContract {
  /** Unique ID for tracking */
  contractId: string;

  /** Which specialist to use */
  agentType: AgentType;

  /** What to create/modify */
  task: string;

  /** Where to work (isolated region) */
  workRegion: {
    /** Frame ID to work within (creates isolation) */
    frameId?: string;
    /** Or explicit bounds */
    bounds?: { x: number; y: number; width: number; height: number };
    /** Canvas ID */
    canvasId: string;
  };

  /** Input data/context (minimal, structured) */
  inputs: {
    /** Existing elements to reference (IDs only, sub-agent fetches details) */
    referenceElements?: string[];
    /** Style constraints */
    style?: {
      colorPalette?: Record<string, string>;
      typography?: Record<string, string>;
      spacing?: number;
    };
    /** Data to visualize */
    data?: Record<string, unknown>;
  };

  /** Expected output specification */
  expectedOutput: {
    /** Type of output */
    type: "elements" | "layout" | "style" | "analysis";
    /** Minimum elements to create */
    minElements?: number;
    /** Required element types */
    requiredTypes?: string[];
  };

  /** Resource limits */
  limits: {
    maxIterations: number;
    maxTokens: number;
    timeoutMs: number;
  };
}

/**
 * Result from an isolated sub-agent
 *
 * This is all the parent receives - no internal context
 */
export interface IsolatedSubAgentResult {
  /** Contract ID for correlation */
  contractId: string;

  /** Success/failure */
  success: boolean;

  /** Human-readable summary */
  summary: string;

  /** Created/modified element IDs */
  elementIds: string[];

  /** Final bounds of created content */
  bounds?: { x: number; y: number; width: number; height: number };

  /** Token usage for budgeting */
  tokensUsed: number;

  /** Error if failed */
  error?: string;

  /** Timing */
  durationMs: number;
}

/**
 * Configuration for the isolated execution engine
 */
export interface IsolatedExecutionConfig {
  /** MCP executor for canvas operations */
  executor: MCPExecutor;

  /** Optional hooks for observability */
  hooks?: HooksManager;

  /** Anthropic API key */
  apiKey?: string;

  /** Enable extended thinking for complex tasks */
  enableExtendedThinking?: boolean;

  /** Progress callback (doesn't leak context, just status) */
  onProgress?: (contractId: string, status: string) => void;
}

// ============================================================================
// TWO-PHASE EXECUTION: THINK THEN ACT
// ============================================================================

/**
 * Phase 1: Reasoning Phase
 *
 * Sub-agent thinks about the task without executing any tools.
 * This allows complex reasoning without token waste from failed attempts.
 *
 * Claude Code does this implicitly with extended thinking, but we make it explicit.
 */
export interface ReasoningResult {
  /** Analysis of the task */
  analysis: string;

  /** Planned approach */
  plan: {
    steps: string[];
    estimatedElements: number;
    estimatedTokens: number;
  };

  /** Potential issues identified */
  risks: string[];

  /** Whether to proceed */
  shouldProceed: boolean;

  /** Reason if not proceeding */
  blockingReason?: string;
}

/**
 * Execute reasoning phase in isolated context
 *
 * The sub-agent receives ONLY the contract, thinks about it,
 * and returns a plan. No tools are called, no context is shared.
 */
export async function executeReasoningPhase(
  contract: SubAgentContract,
  config: IsolatedExecutionConfig
): Promise<ReasoningResult> {
  const agent = getAgentDefinition(contract.agentType);
  if (!agent) {
    return {
      analysis: "Unknown agent type",
      plan: { steps: [], estimatedElements: 0, estimatedTokens: 0 },
      risks: ["Invalid agent type"],
      shouldProceed: false,
      blockingReason: `Unknown agent type: ${contract.agentType}`,
    };
  }

  // Build reasoning prompt (no parent context!)
  const reasoningPrompt = buildReasoningPrompt(contract);

  try {
    const client = createAISDKClient({
      apiKey: config.apiKey,
      model: agent.model || "balanced",
      maxTokens: 1000, // Limited tokens for reasoning
    });

    // Call Claude for reasoning only (no tools)
    const response = await client.generateReasoning(
      reasoningPrompt,
      agent.systemPrompt,
      "", // No canvas context yet
      [] // No tools - pure reasoning
    );

    // Parse the reasoning response
    return parseReasoningResponse(response.thinking || "");
  } catch (error) {
    return {
      analysis: "Reasoning failed",
      plan: { steps: [], estimatedElements: 0, estimatedTokens: 0 },
      risks: [error instanceof Error ? error.message : "Unknown error"],
      shouldProceed: false,
      blockingReason: "Reasoning phase failed",
    };
  }
}

/**
 * Build prompt for reasoning phase
 */
function buildReasoningPrompt(contract: SubAgentContract): string {
  return `
## Task Contract

You are being asked to plan (not execute) the following task:

**Task:** ${contract.task}

**Work Region:**
- Canvas: ${contract.workRegion.canvasId}
- Frame: ${contract.workRegion.frameId || "None (use bounds)"}
- Bounds: ${JSON.stringify(contract.workRegion.bounds || "Full canvas")}

**Inputs:**
- Reference Elements: ${contract.inputs.referenceElements?.join(", ") || "None"}
- Style: ${JSON.stringify(contract.inputs.style || {})}
- Data: ${JSON.stringify(contract.inputs.data || {})}

**Expected Output:**
- Type: ${contract.expectedOutput.type}
- Min Elements: ${contract.expectedOutput.minElements || "Any"}
- Required Types: ${contract.expectedOutput.requiredTypes?.join(", ") || "Any"}

**Limits:**
- Max Iterations: ${contract.limits.maxIterations}
- Max Tokens: ${contract.limits.maxTokens}
- Timeout: ${contract.limits.timeoutMs}ms

## Instructions

Analyze this task and provide your plan in the following format:

<analysis>
What is being asked? What are the key requirements?
</analysis>

<plan>
1. First step...
2. Second step...
3. ...
</plan>

<estimates>
Elements to create: [number]
Token budget needed: [number]
</estimates>

<risks>
- Potential issue 1...
- Potential issue 2...
</risks>

<decision>
PROCEED or BLOCK
</decision>

<reason>
Why proceeding or blocking...
</reason>
`.trim();
}

/**
 * Parse reasoning response into structured result
 */
function parseReasoningResponse(response: string): ReasoningResult {
  const analysis = extractTag(response, "analysis") || "No analysis provided";
  const planText = extractTag(response, "plan") || "";
  const estimatesText = extractTag(response, "estimates") || "";
  const risksText = extractTag(response, "risks") || "";
  const decision = extractTag(response, "decision") || "PROCEED";
  const reason = extractTag(response, "reason") || "";

  // Parse steps from plan
  const steps = planText
    .split("\n")
    .filter((line) => /^\d+\./.test(line.trim()))
    .map((line) => line.replace(/^\d+\.\s*/, "").trim());

  // Parse estimates
  const elementsMatch = estimatesText.match(/elements.*?(\d+)/i);
  const tokensMatch = estimatesText.match(/token.*?(\d+)/i);

  // Parse risks
  const risks = risksText
    .split("\n")
    .filter((line) => line.trim().startsWith("-"))
    .map((line) => line.replace(/^-\s*/, "").trim());

  return {
    analysis,
    plan: {
      steps,
      estimatedElements: elementsMatch ? parseInt(elementsMatch[1]) : 0,
      estimatedTokens: tokensMatch ? parseInt(tokensMatch[1]) : 1000,
    },
    risks,
    shouldProceed: decision.toUpperCase().includes("PROCEED"),
    blockingReason: decision.toUpperCase().includes("BLOCK") ? reason : undefined,
  };
}

/**
 * Extract content between XML-like tags
 */
function extractTag(text: string, tag: string): string | null {
  const regex = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i");
  const match = text.match(regex);
  return match ? match[1].trim() : null;
}

// ============================================================================
// PHASE 2: EXECUTION PHASE
// ============================================================================

/**
 * Execute the task in a completely isolated context
 *
 * Key isolation mechanisms:
 * 1. Fresh Claude conversation (no parent messages)
 * 2. Scoped canvas operations (within frame/bounds)
 * 3. Limited tool access (only what's needed)
 * 4. Result-only return (no internal state leaks)
 */
async function executeIsolatedTask(
  contract: SubAgentContract,
  plan: ReasoningResult,
  config: IsolatedExecutionConfig
): Promise<IsolatedSubAgentResult> {
  const startTime = Date.now();
  const agent = getAgentDefinition(contract.agentType);

  if (!agent) {
    return {
      contractId: contract.contractId,
      success: false,
      summary: "Unknown agent type",
      elementIds: [],
      tokensUsed: 0,
      error: `Unknown agent type: ${contract.agentType}`,
      durationMs: Date.now() - startTime,
    };
  }

  // Notify progress
  config.onProgress?.(contract.contractId, "Starting execution");

  try {
    // Create isolated executor that scopes operations to work region
    const scopedExecutor = createScopedExecutor(
      config.executor,
      contract.workRegion
    );

    // Build execution context (fresh, minimal)
    const executionPrompt = buildExecutionPrompt(contract, plan);

    // Track created elements
    const createdElements: string[] = [];
    let tokensUsed = plan.plan.estimatedTokens;

    // Execute with fresh AI SDK context
    const client = createAISDKClient({
      apiKey: config.apiKey,
      model: agent.model || "balanced",
      maxTokens: contract.limits.maxTokens,
    });

    // Iterative execution loop (isolated from parent)
    let iterations = 0;
    const maxIterations = contract.limits.maxIterations;

    while (iterations < maxIterations) {
      iterations++;
      config.onProgress?.(
        contract.contractId,
        `Iteration ${iterations}/${maxIterations}`
      );

      // Generate next action
      const response = await client.generateReasoning(
        executionPrompt,
        agent.systemPrompt,
        await buildCanvasContext(scopedExecutor, contract.workRegion),
        agent.allowedTools.map((t) => ({ name: t, description: "" }))
      );

      tokensUsed += response.tokensUsed?.input || 0;
      tokensUsed += response.tokensUsed?.output || 0;

      // Check if complete
      if (response.decision === "complete") {
        config.onProgress?.(contract.contractId, "Complete");
        break;
      }

      // Execute tool if requested
      if (response.tool && response.input) {
        const result = await scopedExecutor.execute(
          response.tool,
          response.input
        );

        // Track created elements
        if (result?.created) {
          createdElements.push(...result.created);
        }
      }
    }

    // Calculate final bounds
    const bounds = await calculateBounds(scopedExecutor, createdElements);

    return {
      contractId: contract.contractId,
      success: true,
      summary: `Created ${createdElements.length} elements in ${iterations} iterations`,
      elementIds: createdElements,
      bounds,
      tokensUsed,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      contractId: contract.contractId,
      success: false,
      summary: "Execution failed",
      elementIds: [],
      tokensUsed: 0,
      error: error instanceof Error ? error.message : "Unknown error",
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Create a scoped executor that constrains operations to a region
 */
function createScopedExecutor(
  executor: MCPExecutor,
  workRegion: SubAgentContract["workRegion"]
): MCPExecutor {
  return {
    execute: async (tool: string, input: unknown) => {
      // For write operations, scope to frame if specified
      if (tool === "canvas_write" && workRegion.frameId) {
        const writeInput = input as Record<string, unknown>;
        return executor.execute(tool, {
          ...writeInput,
          target: workRegion.frameId,
        });
      }

      // For find operations, scope to region
      if (tool === "canvas_find" && workRegion.bounds) {
        const findInput = input as Record<string, unknown>;
        return executor.execute(tool, {
          ...findInput,
          bounds: workRegion.bounds,
        });
      }

      // Pass through other operations
      return executor.execute(tool, input);
    },
  };
}

/**
 * Build execution prompt from contract and plan
 */
function buildExecutionPrompt(
  contract: SubAgentContract,
  plan: ReasoningResult
): string {
  return `
## Execution Task

${contract.task}

## Your Plan

${plan.plan.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}

## Constraints

- Work ONLY within the specified region
- Create elements matching the expected output
- Use the provided style guidelines
- Complete within ${contract.limits.maxIterations} iterations

## Style Guidelines

${JSON.stringify(contract.inputs.style || {}, null, 2)}

## Data

${JSON.stringify(contract.inputs.data || {}, null, 2)}

Execute your plan step by step. When complete, respond with "complete".
`.trim();
}

/**
 * Build canvas context for the work region only
 */
async function buildCanvasContext(
  executor: MCPExecutor,
  workRegion: SubAgentContract["workRegion"]
): Promise<string> {
  try {
    const result = await executor.execute("canvas_find", {
      match: {},
      bounds: workRegion.bounds,
      return: "summary",
    });
    return `Current state: ${JSON.stringify(result)}`;
  } catch {
    return "Canvas state: empty";
  }
}

/**
 * Calculate bounds of created elements
 */
async function calculateBounds(
  executor: MCPExecutor,
  elementIds: string[]
): Promise<{ x: number; y: number; width: number; height: number } | undefined> {
  if (elementIds.length === 0) return undefined;

  try {
    const result = await executor.execute("canvas_find", {
      match: { id: { in: elementIds } },
      aggregate: { bounds: true },
    });
    return (result as { bounds?: { x: number; y: number; width: number; height: number } })?.bounds;
  } catch {
    return undefined;
  }
}

// ============================================================================
// MAIN API: ISOLATED DELEGATION
// ============================================================================

/**
 * Execute a sub-agent in complete isolation
 *
 * This is the Claude Code Task tool pattern:
 * - Parent gives contract
 * - Sub-agent runs in isolation
 * - Only result returns to parent
 *
 * @example
 * ```typescript
 * const result = await executeIsolatedSubAgent({
 *   contractId: 'timeline-section',
 *   agentType: 'diagram-specialist',
 *   task: 'Create a timeline showing AI milestones from 1950-2024',
 *   workRegion: {
 *     canvasId: 'main',
 *     frameId: 'timeline-frame',
 *   },
 *   inputs: {
 *     data: { events: [...] },
 *     style: { colorPalette: { primary: '#3b82f6' } },
 *   },
 *   expectedOutput: {
 *     type: 'elements',
 *     minElements: 5,
 *   },
 *   limits: {
 *     maxIterations: 10,
 *     maxTokens: 4000,
 *     timeoutMs: 30000,
 *   },
 * }, { executor });
 *
 * // Parent only sees:
 * // { contractId: 'timeline-section', success: true, elementIds: [...], summary: '...' }
 * // NOT the internal reasoning, tool calls, or intermediate states
 * ```
 */
export async function executeIsolatedSubAgent(
  contract: SubAgentContract,
  config: IsolatedExecutionConfig
): Promise<IsolatedSubAgentResult> {
  const startTime = Date.now();

  // Phase 1: Reasoning (isolated)
  config.onProgress?.(contract.contractId, "Planning...");
  const plan = await executeReasoningPhase(contract, config);

  if (!plan.shouldProceed) {
    return {
      contractId: contract.contractId,
      success: false,
      summary: "Task blocked during planning",
      elementIds: [],
      tokensUsed: 0,
      error: plan.blockingReason,
      durationMs: Date.now() - startTime,
    };
  }

  // Phase 2: Execution (isolated)
  config.onProgress?.(contract.contractId, "Executing...");
  return executeIsolatedTask(contract, plan, config);
}

/**
 * Execute multiple sub-agents in parallel isolation
 *
 * Each agent gets its own isolated context.
 * Results are aggregated without merging contexts.
 */
export async function executeParallelIsolated(
  contracts: SubAgentContract[],
  config: IsolatedExecutionConfig
): Promise<IsolatedSubAgentResult[]> {
  return Promise.all(
    contracts.map((contract) => executeIsolatedSubAgent(contract, config))
  );
}

// ============================================================================
// ORCHESTRATOR: COMPLEX TASK WITH ISOLATION
// ============================================================================

/**
 * Orchestrate a complex task using isolated sub-agents
 *
 * This is how Claude Code handles complex projects:
 * 1. Analyze task at high level
 * 2. Break into contracts for sub-agents
 * 3. Execute sub-agents in isolation (parallel where possible)
 * 4. Aggregate results without merging contexts
 * 5. Final polish pass
 */
export async function* orchestrateComplexTask(
  task: string,
  canvasId: string,
  config: IsolatedExecutionConfig
): AsyncGenerator<AgentEvent> {
  // Step 1: High-level analysis
  yield { type: "thinking", message: "Analyzing task complexity..." };

  const contracts = await analyzeAndCreateContracts(task, canvasId);

  yield {
    type: "plan",
    message: `Created ${contracts.length} isolated contracts`,
    steps: contracts.map((c) => `${c.agentType}: ${c.task.slice(0, 50)}...`),
  };

  // Step 2: Group contracts by dependency
  const { parallel, sequential } = groupByDependency(contracts);

  // Step 3: Execute parallel contracts
  if (parallel.length > 0) {
    yield {
      type: "thinking",
      message: `Executing ${parallel.length} contracts in parallel...`,
    };

    const parallelResults = await executeParallelIsolated(parallel, config);

    for (const result of parallelResults) {
      yield {
        type: result.success ? "step_complete" : "error",
        step: result.contractId,
        message: result.summary,
      };
    }
  }

  // Step 4: Execute sequential contracts
  for (const contract of sequential) {
    yield { type: "step_start", step: contract.contractId, message: contract.task };

    const result = await executeIsolatedSubAgent(contract, config);

    yield {
      type: result.success ? "step_complete" : "error",
      step: result.contractId,
      message: result.summary,
    };

    if (!result.success) {
      yield { type: "warning", message: `Contract ${contract.contractId} failed, continuing...` };
    }
  }

  // Step 5: Final assembly
  yield { type: "complete", summary: `Completed ${contracts.length} isolated contracts` };
}

/**
 * Analyze task and create contracts for sub-agents
 */
async function analyzeAndCreateContracts(
  task: string,
  canvasId: string
): Promise<SubAgentContract[]> {
  // This would use AI to analyze and break down the task
  // For now, return a simple implementation
  const contracts: SubAgentContract[] = [];
  const lower = task.toLowerCase();

  let contractId = 0;
  const createContract = (
    agentType: AgentType,
    subtask: string,
    bounds: { x: number; y: number; width: number; height: number }
  ): SubAgentContract => ({
    contractId: `contract-${++contractId}`,
    agentType,
    task: subtask,
    workRegion: { canvasId, bounds },
    inputs: {},
    expectedOutput: { type: "elements" },
    limits: { maxIterations: 10, maxTokens: 4000, timeoutMs: 30000 },
  });

  // Create contracts based on detected sections
  if (lower.includes("timeline")) {
    contracts.push(
      createContract(
        "diagram-specialist",
        "Create timeline visualization",
        { x: 0, y: 200, width: 800, height: 300 }
      )
    );
  }

  if (lower.includes("statistic") || lower.includes("chart")) {
    contracts.push(
      createContract(
        "canvas-agent",
        "Create statistics display",
        { x: 0, y: 500, width: 800, height: 200 }
      )
    );
  }

  if (lower.includes("compar")) {
    contracts.push(
      createContract(
        "layout-specialist",
        "Create comparison layout",
        { x: 0, y: 700, width: 800, height: 300 }
      )
    );
  }

  return contracts;
}

/**
 * Group contracts by dependency for parallel/sequential execution
 */
function groupByDependency(contracts: SubAgentContract[]): {
  parallel: SubAgentContract[];
  sequential: SubAgentContract[];
} {
  // For now, all contracts are independent
  // In production, would analyze dependencies
  return {
    parallel: contracts,
    sequential: [],
  };
}
