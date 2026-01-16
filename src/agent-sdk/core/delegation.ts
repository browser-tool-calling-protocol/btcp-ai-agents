/**
 * Sub-Agent Delegation (Pattern 7) - Registry-Based Implementation
 *
 * Claude Code-style Task tool pattern for spawning specialized sub-agents.
 *
 * ## Architecture
 *
 * **Core Agents (built-in):**
 * - planner - Plans complex tasks, breaks down work
 * - analyzer - Analyzes data, provides insights (read-only)
 * - explorer - Explores context, finds patterns
 *
 * **Domain Agents (from registry):**
 * - Loaded dynamically at runtime
 * - Matched by description/keywords
 * - Registered via `registerAgent()`
 *
 * ## Claude Code Pattern: Loop Reuse
 *
 * Sub-agents REUSE the main agentic loop (`runAgenticLoop`) with:
 * 1. Fresh ContextManager - no parent history leaks through
 * 2. Specialized systemPrompt - from core definitions or registry
 * 3. enabledTools whitelist - only permitted tools (NO agent_delegate = no nesting)
 * 4. Tighter limits - 10 iterations, 50K tokens
 *
 * Uses Google Generative AI directly (no AI SDK).
 *
 * @module @btcp/ai-agents/core
 */

import { generateWithGemini } from "./google-direct.js";
import { getModelId } from "./client.js";
import { MODEL_DEFAULTS, LOOP_DEFAULTS } from "./constants.js";
import type { ModelPreference } from "../types/index.js";
import type { AgentToolName } from "../tools/generic-definitions.js";
import type { AgentEvent } from "../agents/types.js";
import { createContextManager } from "../context/manager.js";
import { createHooksManager, type HooksManager } from "../hooks/manager.js";
import type { LoopOptions } from "./loop.js";

// Legacy type alias
type CanvasToolName = AgentToolName;

// ============================================================================
// CORE AGENT TYPES (built-in)
// ============================================================================

/**
 * Core agent types - always available, built into the framework
 *
 * These are capability-based agents following Claude Code's Task tool pattern:
 * - planner: Plans complex tasks, breaks down work
 * - analyzer: Analyzes data, provides insights (read-only)
 * - explorer: Explores context, finds patterns
 */
export type CoreAgentType = "planner" | "analyzer" | "explorer";

/**
 * Sub-agent type - can be a core agent or a registered domain agent
 *
 * Domain agents are registered at runtime via `registerAgent()` and
 * matched by task description/keywords.
 */
export type SubAgentType = CoreAgentType | string;

/**
 * Sub-agent definition
 */
export interface SubAgentDefinition {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  allowedTools: string[];
  /** Model tier: fast (cost-effective), balanced (default), powerful (most capable) */
  model: ModelPreference;
  maxTokens: number;
  /** Keywords for task matching (optional) */
  keywords?: RegExp;
}

/**
 * Sub-agent task input
 */
export interface SubAgentTask {
  /** Type of sub-agent to spawn (core agent or registered domain agent) */
  subagent: SubAgentType;
  /** Task description */
  task: string;
  /** Context to pass to sub-agent */
  context?: {
    contextId?: string;
    elementIds?: string[];
    additionalContext?: string;
  };
  /** Expected return type */
  expectReturn?: "elements" | "positions" | "styles" | "analysis" | "plan";
}

/**
 * Sub-agent result
 */
export interface SubAgentResult {
  subagent: SubAgentType;
  success: boolean;
  result?: unknown;
  error?: string;
  duration: number;
  tokensUsed?: number;

  /**
   * Summary of what the sub-agent accomplished (~100 tokens)
   * This is the ONLY narrative context that crosses the isolation boundary
   */
  summary?: string;

  /**
   * Element IDs created by the sub-agent
   * These allow the parent to reference created elements
   */
  createdIds?: string[];

  /**
   * Element IDs modified by the sub-agent
   */
  modifiedIds?: string[];

  /**
   * Token economy metrics for observability
   * Tracks the savings from context isolation
   */
  metrics?: SubAgentMetrics;
}

/**
 * Token economy metrics for sub-agent delegation
 * Demonstrates the 77% token savings from isolated execution
 */
export interface SubAgentMetrics {
  /** Tokens used by sub-agent (isolated, NOT in parent context) */
  isolatedTokens: number;

  /** Tokens returned to parent context (~100 via summary + IDs) */
  returnedTokens: number;

  /** Estimated tokens if executed inline in parent context */
  estimatedInlineTokens: number;

  /** Token savings percentage: (estimated - returned) / estimated * 100 */
  savingsPercent: number;

  /** Number of iterations the sub-agent used */
  iterations: number;

  /** Number of tool calls made */
  toolCalls: number;
}

// ============================================================================
// CORE AGENT DEFINITIONS (built-in)
// ============================================================================

/**
 * Core agent definitions - always available
 *
 * These 3 agents are built into the framework following Claude Code's pattern.
 * Domain-specific agents can be registered via the AgentRegistry.
 */
export const CORE_AGENT_DEFINITIONS: Record<CoreAgentType, SubAgentDefinition> = {
  planner: {
    id: "planner",
    name: "Planner Agent",
    description: "Plans complex tasks, breaks down work into steps",
    systemPrompt: `# Planner Agent

You design implementation plans. PLANNING-ONLY.

## Constraints

STRICTLY PROHIBITED:
- context_write
- task_execute
- Executing modifications

PERMITTED:
- context_read
- context_search

## Required Output

### 1. Task Breakdown
Numbered steps with:
- Clear action
- Dependencies
- Estimated complexity

### 2. Critical Elements
| Element | Purpose | Dependencies |
|---------|---------|--------------|

### 3. Recommendation
- Agent: [planner|analyzer|explorer]
- Complexity: [simple|medium|complex]
- Approach: brief description`,
    allowedTools: ["context_read", "context_search", "agent_plan"],
    model: "balanced",
    maxTokens: 4000,
  },

  analyzer: {
    id: "analyzer",
    name: "Analyzer Agent",
    description: "Analyzes data and provides insights (read-only)",
    systemPrompt: `# Analyzer Agent

You analyze data and provide insights. READ-ONLY.

## Constraints

STRICTLY PROHIBITED:
- context_write
- task_execute
- agent_delegate
- Any modifications

PERMITTED:
- context_read
- context_search
- state_snapshot

## Output

- Data summary by type
- Relationships found
- Identified patterns
- Issues detected
- Recommendations

If asked to modify: "I'm read-only. I can analyze but not change."`,
    allowedTools: ["context_read", "context_search", "state_snapshot"],
    model: "fast",
    maxTokens: 3000,
  },

  explorer: {
    id: "explorer",
    name: "Explorer Agent",
    description: "Explores context, finds patterns and relationships",
    systemPrompt: `# Explorer Agent

You explore context to find patterns and relationships. READ-ONLY.

## Constraints

STRICTLY PROHIBITED:
- context_write
- task_execute
- Any modifications

PERMITTED:
- context_read
- context_search
- state_snapshot

## Focus Areas

- Structure discovery
- Pattern identification
- Relationship mapping
- Data exploration

## Output

- What you found
- Patterns identified
- Relationships discovered
- Questions for further exploration

If asked to modify: "I'm read-only. I explore but don't change."`,
    allowedTools: ["context_read", "context_search", "state_snapshot"],
    model: "fast",
    maxTokens: 3000,
  },
};

// Legacy alias for backward compatibility
export const SUBAGENT_DEFINITIONS = CORE_AGENT_DEFINITIONS as Record<string, SubAgentDefinition>;

/**
 * Get agent definition from core agents or registry
 */
export function getAgentDefinition(agentType: SubAgentType): SubAgentDefinition | undefined {
  // Check core agents first
  if (agentType in CORE_AGENT_DEFINITIONS) {
    return CORE_AGENT_DEFINITIONS[agentType as CoreAgentType];
  }

  // Check registry for domain agents
  const { getAgentRegistry } = require("../agents/registry.js");
  const registry = getAgentRegistry();
  return registry?.get(agentType);
}

/**
 * Delegate task to a specialized sub-agent
 *
 * @param task - The sub-agent task configuration
 *
 * @example
 * ```typescript
 * const result = await delegateToSubAgent({
 *   subagent: "planner",
 *   task: "Break down this task into steps",
 *   context: { contextId: "my-context" },
 *   expectReturn: "plan"
 * });
 *
 * if (result.success) {
 *   console.log(result.result);
 * }
 * ```
 */
export async function delegateToSubAgent(
  task: SubAgentTask
): Promise<SubAgentResult> {
  const startTime = Date.now();
  const definition = getAgentDefinition(task.subagent);

  if (!definition) {
    return {
      subagent: task.subagent,
      success: false,
      error: `Unknown sub-agent type: ${task.subagent}. Available core agents: planner, analyzer, explorer. Register domain agents via registerAgent().`,
      duration: Date.now() - startTime,
    };
  }

  try {
    // Build context prompt
    let contextPrompt = `Task: ${task.task}\n\n`;

    if (task.context?.contextId) {
      contextPrompt += `Context ID: ${task.context.contextId}\n`;
    }

    if (task.context?.elementIds?.length) {
      contextPrompt += `Relevant elements: ${task.context.elementIds.join(", ")}\n`;
    }

    if (task.context?.additionalContext) {
      contextPrompt += `\nAdditional context:\n${task.context.additionalContext}\n`;
    }

    if (task.expectReturn) {
      contextPrompt += `\nExpected output format: ${task.expectReturn}\n`;
    }

    // Get model ID for the sub-agent's tier
    const modelId = getModelId(definition.model);

    // Execute sub-agent using direct Google AI
    const generateResult = await generateWithGemini({
      model: modelId,
      systemPrompt: definition.systemPrompt,
      userMessage: contextPrompt,
      maxTokens: definition.maxTokens,
    });

    const response = generateResult.text || "";
    const tokensUsed = generateResult.usage?.totalTokens || 0;

    // Parse result
    const result = parseSubAgentResult(response, task.expectReturn);

    return {
      subagent: task.subagent,
      success: true,
      result,
      duration: Date.now() - startTime,
      tokensUsed,
    };
  } catch (error) {
    return {
      subagent: task.subagent,
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      duration: Date.now() - startTime,
      tokensUsed: 0,
    };
  }
}

// ============================================================================
// MAIN LOOP REUSE FOR SUB-AGENTS (Gap Analysis Fix for Critical Gap 1)
// ============================================================================

/**
 * Execute sub-agent by reusing the main agentic loop
 *
 * This is the Claude Code Task tool pattern:
 * - Same loop, different context
 * - Full tool execution capability
 * - Context isolation (only summary returns to parent)
 *
 * ## Why Loop Reuse?
 *
 * | Aspect | Separate Loop (Wrong) | Reuse Main Loop (Correct) |
 * |--------|----------------------|---------------------------|
 * | Tool execution | Must reimplement | Already works |
 * | Error handling | Must reimplement | Already works |
 * | Hooks integration | Must reimplement | Already works |
 * | MCP connection | Must manage | Shared |
 * | Streaming events | Must reimplement | Already works |
 * | Maintenance | Two codepaths | Single codepath |
 *
 * ## Context Isolation
 *
 * The sub-agent receives:
 * 1. Fresh ContextManager - no parent history
 * 2. Specialized systemPrompt - from SUBAGENT_DEFINITIONS
 * 3. enabledTools whitelist - only permitted tools (NO canvas_delegate = no nesting)
 * 4. Tighter limits - 10 iterations, 50K tokens
 *
 * The parent receives:
 * - Summary (~100 tokens) - NOT full tool results
 * - Created/modified element IDs - for reference
 * - Metrics - token savings data
 *
 * @example
 * ```typescript
 * const result = await executeSubagentWithMainLoop({
 *   subagent: "planner",
 *   task: "Break down this complex task",
 *   context: { contextId: "my-context" },
 *   expectReturn: "plan"
 * }, parentConfig);
 *
 * // Parent only sees summary, NOT the full execution context
 * console.log(result.summary); // "Created 5-step plan"
 * console.log(result.metrics.savingsPercent); // 77
 * ```
 */
export async function executeSubagentWithMainLoop(
  task: SubAgentTask,
  parentConfig: LoopOptions
): Promise<SubAgentResult> {
  // Lazy import to avoid circular dependency
  const { runAgenticLoop } = await import("./loop.js");

  const startTime = Date.now();
  const definition = getAgentDefinition(task.subagent);

  if (!definition) {
    return {
      subagent: task.subagent,
      success: false,
      error: `Unknown sub-agent type: ${task.subagent}. Available core agents: planner, analyzer, explorer.`,
      duration: Date.now() - startTime,
    };
  }

  // Use definition's system prompt directly (skills come from registry if needed)
  const systemPrompt = definition.systemPrompt;

  // Build self-contained task prompt (sub-agent has NO parent history)
  const taskPrompt = formatSubagentTaskPrompt(task);

  // Track elements via isolated hooks
  const createdIds: string[] = [];
  const modifiedIds: string[] = [];
  let tokensUsed = 0;
  let iterations = 0;
  let toolCalls = 0;

  // Create ISOLATED hooks manager for tracking
  const subagentHooks = createHooksManager();
  subagentHooks.registerPostHook((ctx) => {
    if (ctx.hookType !== "post-tool-use") return;
    toolCalls++;
    // Track created and modified elements from tool results
    const result = ctx.toolResult;
    if (result && typeof result === "object") {
      const res = result as Record<string, unknown>;
      if (Array.isArray(res.createdIds)) createdIds.push(...res.createdIds);
      if (Array.isArray(res.modifiedIds)) modifiedIds.push(...res.modifiedIds);
      if (Array.isArray(res.created)) createdIds.push(...res.created.map((e: { id?: string }) => e.id).filter((id): id is string => typeof id === "string"));
      if (res.elementId && typeof res.elementId === "string") createdIds.push(res.elementId);
    }
  });

  // Determine context ID (use contextId or fall back to canvasId for compatibility)
  const contextId = task.context?.contextId || parentConfig.canvasId;
  if (!contextId) {
    return {
      subagent: task.subagent,
      success: false,
      error: "No contextId provided",
      duration: Date.now() - startTime,
    };
  }

  // Collect events for summary extraction
  const events: AgentEvent[] = [];

  try {
    // REUSE the main agentic loop with isolated configuration
    for await (const event of runAgenticLoop(taskPrompt, contextId, {
      // Fresh context - NO parent history crosses the boundary
      contextManager: createContextManager({ maxTokens: 50_000 }),

      // Specialized system prompt
      systemPrompt,

      // Same MCP connection as parent
      mcpUrl: parentConfig.mcpUrl,

      // ISOLATED hooks (don't pollute parent metrics)
      hooks: subagentHooks,

      // Tighter limits for sub-agent (10 iterations, 50K tokens)
      maxIterations: 10,
      tokenBudget: 50_000,

      // Model tier from definition
      model: definition.model,

      // Provider from parent config
      provider: parentConfig.provider,

      // CRITICAL: Whitelist only allowed tools
      // By NOT including agent_delegate, we prevent infinite nesting
      enabledTools: definition.allowedTools as AgentToolName[],

      // Verbose mode from parent
      verbose: parentConfig.verbose,
    })) {
      events.push(event);
      iterations++;

      // Track token usage from context events
      if (event.type === "context" && "tokensUsed" in event) {
        tokensUsed += event.tokensUsed || 0;
      }
    }

    // Extract completion status and summary
    const completeEvent = events.find(e => e.type === "complete");
    const failedEvent = events.find(e => e.type === "failed");

    // Parse the result based on expectReturn type
    let result: unknown;
    if (completeEvent && "summary" in completeEvent) {
      result = parseSubAgentResultFromSummary(
        completeEvent.summary,
        task.expectReturn,
        { createdIds, modifiedIds }
      );
    }

    // Calculate token economy metrics (Gap 5)
    const AVG_TOKENS_PER_TOOL_RESULT = 800;
    const estimatedInlineTokens = toolCalls * AVG_TOKENS_PER_TOOL_RESULT;
    const summaryText = completeEvent && "summary" in completeEvent ? completeEvent.summary : "";
    const returnedTokens = Math.ceil((summaryText.length + JSON.stringify({ createdIds, modifiedIds }).length) / 4);
    const savingsPercent = estimatedInlineTokens > 0
      ? Math.round(((estimatedInlineTokens - returnedTokens) / estimatedInlineTokens) * 100)
      : 0;

    // ONLY return summary - all intermediate events stay isolated
    return {
      subagent: task.subagent,
      success: !!completeEvent && !failedEvent,
      result,
      summary: completeEvent && "summary" in completeEvent ? completeEvent.summary : failedEvent && "reason" in failedEvent ? failedEvent.reason : "Sub-agent execution completed",
      createdIds: [...new Set(createdIds)], // Dedupe
      modifiedIds: [...new Set(modifiedIds)],
      tokensUsed,
      duration: Date.now() - startTime,

      // Token economy metrics for observability
      metrics: {
        isolatedTokens: tokensUsed,
        returnedTokens,
        estimatedInlineTokens,
        savingsPercent,
        iterations,
        toolCalls,
      },

      // Error if failed
      error: failedEvent && "reason" in failedEvent ? failedEvent.reason : undefined,
    };
  } catch (error) {
    return {
      subagent: task.subagent,
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      duration: Date.now() - startTime,
      tokensUsed: 0,
      metrics: {
        isolatedTokens: tokensUsed,
        returnedTokens: 0,
        estimatedInlineTokens: 0,
        savingsPercent: 0,
        iterations,
        toolCalls,
      },
    };
  } finally {
    // Cleanup isolated hooks to prevent memory leaks
    subagentHooks.destroy();
  }
}

/**
 * Format self-contained task prompt for sub-agent
 *
 * The sub-agent receives ONLY this prompt - no parent context leaks through.
 * This is critical for context isolation.
 */
function formatSubagentTaskPrompt(task: SubAgentTask): string {
  const parts: string[] = [`Task: ${task.task}`];

  if (task.context?.elementIds?.length) {
    parts.push(`\nWork with elements: ${task.context.elementIds.join(", ")}`);
  }

  if (task.context?.additionalContext) {
    parts.push(`\nContext: ${task.context.additionalContext}`);
  }

  if (task.expectReturn) {
    parts.push(`\nExpected output: ${task.expectReturn}`);
  }

  parts.push("\nComplete the task using available tools. Summarize what you accomplished.");

  return parts.join("\n");
}

/**
 * Parse sub-agent result from summary and tracked elements
 */
function parseSubAgentResultFromSummary(
  summary: string,
  expectReturn: SubAgentTask["expectReturn"],
  tracked: { createdIds: string[]; modifiedIds: string[] }
): unknown {
  switch (expectReturn) {
    case "elements":
      return {
        type: "elements",
        elements: tracked.createdIds.map(id => ({ id })),
      };
    case "positions":
      return {
        type: "positions",
        positions: tracked.modifiedIds.map(id => ({ id })),
      };
    case "styles":
      return {
        type: "styles",
        styles: tracked.modifiedIds.map(id => ({ id, applied: true })),
      };
    case "plan":
      return {
        type: "plan",
        summary,
      };
    case "analysis":
    default:
      return {
        type: "analysis",
        analysis: summary,
        createdIds: tracked.createdIds,
        modifiedIds: tracked.modifiedIds,
      };
  }
}

/**
 * Parse sub-agent response into structured result
 */
function parseSubAgentResult(
  response: string,
  expectReturn?: SubAgentTask["expectReturn"]
): unknown {
  // Try to extract JSON from response
  const jsonMatch = response.match(/```json\n?([\s\S]*?)\n?```/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1]);
    } catch {
      // Continue to other parsing methods
    }
  }

  // Try to parse entire response as JSON
  try {
    return JSON.parse(response);
  } catch {
    // Return as text analysis
    return {
      type: expectReturn || "text",
      content: response,
    };
  }
}

/**
 * Detect which core agent should handle a task
 *
 * Returns core agent type based on task intent:
 * - planner: for planning/breaking down tasks
 * - analyzer: for analyzing/reviewing data
 * - explorer: for exploring/finding patterns
 *
 * For domain-specific tasks, check the agent registry.
 */
export function detectSubAgent(task: string): CoreAgentType | null {
  const lower = task.toLowerCase();

  // Planner keywords
  if (/plan|break down|steps|strategy|how to|approach|organize/i.test(lower)) {
    return "planner";
  }

  // Analyzer keywords
  if (/analyze|inspect|review|audit|check|evaluate|assess/i.test(lower)) {
    return "analyzer";
  }

  // Explorer keywords
  if (/explore|find|search|discover|what|where|look for|identify/i.test(lower)) {
    return "explorer";
  }

  return null;
}

/**
 * Detect agent for task - checks core agents first, then registry
 *
 * Claude Code pattern: match by task description to agent descriptions.
 */
export function detectAgentForTask(task: string): SubAgentType {
  // Check core agents first
  const coreAgent = detectSubAgent(task);
  if (coreAgent) {
    return coreAgent;
  }

  // Check registry for matching domain agent
  try {
    const { getAgentRegistry } = require("../agents/registry.js");
    const registry = getAgentRegistry();
    const match = registry?.findByDescription?.(task);
    if (match) {
      return match.id;
    }
  } catch {
    // Registry not available
  }

  // Default to planner for complex tasks
  return "planner";
}

/**
 * Get sub-agent definition (alias for getAgentDefinition)
 * @deprecated Use getAgentDefinition instead
 */
export function getSubAgentDefinition(
  type: SubAgentType
): SubAgentDefinition | undefined {
  return getAgentDefinition(type);
}

/**
 * List all available agents (core + registered)
 */
export function listSubAgents(): SubAgentDefinition[] {
  const coreAgents = Object.values(CORE_AGENT_DEFINITIONS);

  // Try to include registered agents
  try {
    const { getAgentRegistry } = require("../agents/registry.js");
    const registry = getAgentRegistry();
    const registeredAgents = registry?.list?.() || [];
    return [...coreAgents, ...registeredAgents];
  } catch {
    return coreAgents;
  }
}

/**
 * List core agents only
 */
export function listCoreAgents(): SubAgentDefinition[] {
  return Object.values(CORE_AGENT_DEFINITIONS);
}

/**
 * Parallel delegation to multiple sub-agents
 *
 * @example
 * ```typescript
 * const [planResult, analyzeResult] = await delegateParallel([
 *   { subagent: "planner", task: "...", expectReturn: "plan" },
 *   { subagent: "analyzer", task: "...", expectReturn: "analysis" }
 * ]);
 * ```
 */
export async function delegateParallel(
  tasks: SubAgentTask[]
): Promise<SubAgentResult[]> {
  return Promise.all(tasks.map((task) => delegateToSubAgent(task)));
}

// ============================================================================
// COMPATIBILITY LAYER FOR PLANNING MODULE
// ============================================================================

import type { AgentType } from "../types/index.js";
import type { MCPExecutor } from "./loop.js";
// HooksManager already imported at top of file

/**
 * Agent request for compatibility with planning module
 */
export interface AgentRequest {
  agentType: AgentType | SubAgentType;
  task: string;
  context?: string;
  maxTokens?: number;
}

/**
 * Agent result for compatibility with planning module
 */
export interface AgentResult {
  success: boolean;
  output?: string;
  error?: string;
  elementIds?: string[];
  tokensUsed?: number;
}

/**
 * Map agent type to sub-agent type
 * Returns the agent type directly if it's a valid SubAgentType
 */
function mapAgentToSubAgent(agentType: AgentType | SubAgentType): SubAgentType | undefined {
  const mapping: Record<string, SubAgentType> = {
    // AgentType → CoreAgentType
    "generic-agent": "planner",
    "planner-agent": "planner",
    "executor-agent": "planner", // Use planner as fallback
    "analyzer-agent": "analyzer",
    "explorer-agent": "explorer",
    // Direct mappings for core agents
    "planner": "planner",
    "analyzer": "analyzer",
    "explorer": "explorer",
  };

  // Check mapping first
  if (agentType in mapping) {
    return mapping[agentType];
  }

  // Check if it's a registered agent
  const definition = getAgentDefinition(agentType);
  if (definition) {
    return agentType;
  }

  return undefined;
}

/**
 * Delegate to agent - compatibility wrapper for planning module
 * Wraps delegateToSubAgent with the ai-agents-claude interface
 */
export async function delegateToAgent(
  request: AgentRequest,
  _executor?: MCPExecutor,
  _hooks?: HooksManager
): Promise<AgentResult> {
  const subAgentType = mapAgentToSubAgent(request.agentType);

  // Check for unknown agent type
  if (!subAgentType) {
    return {
      success: false,
      output: "",
      error: `Unknown agent type: ${request.agentType}`,
      tokensUsed: 0,
    };
  }

  const result = await delegateToSubAgent({
    subagent: subAgentType,
    task: request.task,
    context: {
      additionalContext: request.context,
    },
  });

  return {
    success: result.success,
    output: typeof result.result === "string" ? result.result : JSON.stringify(result.result),
    error: result.error,
    tokensUsed: result.tokensUsed,
  };
}

// ============================================================================
// TASK ANALYSIS (Pattern 7)
// ============================================================================

/**
 * Delegation plan structure
 */
export interface DelegationPlan {
  /** Primary agent to handle the task */
  primaryAgent: SubAgentType;
  /** Specific subtasks for delegation */
  subtasks: Array<{ agent: SubAgentType; task: string }>;
  /** Whether subtasks can run in parallel */
  canParallelize: boolean;
  /** Task complexity estimate */
  complexity: "simple" | "moderate" | "complex";
}

/**
 * Analyze a task and suggest delegation
 *
 * Returns delegation plan with appropriate agents.
 */
export function analyzeTaskForDelegation(task: string): DelegationPlan {
  const lower = task.toLowerCase();
  const subtasks: Array<{ agent: SubAgentType; task: string }> = [];

  // Determine primary agent based on task type
  let primaryAgent: SubAgentType = "planner";
  if (/plan|break down|steps|strategy/i.test(lower)) {
    primaryAgent = "planner";
  } else if (/analyze|inspect|review|audit|check/i.test(lower)) {
    primaryAgent = "analyzer";
    subtasks.push({ agent: "analyzer", task });
  } else if (/explore|find|search|discover|what/i.test(lower)) {
    primaryAgent = "explorer";
    subtasks.push({ agent: "explorer", task });
  }

  // Check registry for domain-specific agents
  try {
    const { getAgentRegistry } = require("../agents/registry.js");
    const registry = getAgentRegistry();
    const match = registry?.findByDescription?.(task);
    if (match) {
      primaryAgent = match.id;
      subtasks.push({ agent: match.id, task });
    }
  } catch {
    // Registry not available
  }

  // Determine execution strategy
  const canParallelize = subtasks.length >= 2 && subtasks.length <= 3;

  return {
    primaryAgent,
    subtasks,
    canParallelize,
    complexity: calculateComplexity(task, subtasks.length),
  };
}

// ============================================================================
// HELPERS FOR TASK ANALYSIS
// ============================================================================

function calculateComplexity(
  task: string,
  subtaskCount: number
): "simple" | "moderate" | "complex" {
  // Simple: single operation, short task
  if (subtaskCount === 0 && task.split(" ").length < 10) {
    return "simple";
  }

  // Complex: multiple subtasks or long task
  if (subtaskCount >= 2 || task.split(" ").length > 30) {
    return "complex";
  }

  return "moderate";
}

// ============================================================================
// SDK-ALIGNED TYPES
// ============================================================================

/**
 * SDK-aligned delegation options
 */
export interface DelegateOptions {
  /** Sub-agent type to use (core agent or registered domain agent) */
  agent: SubAgentType;
  /** Task description */
  task: string;
  /** Context ID */
  contextId?: string;
  /** Element IDs to work with */
  elementIds?: string[];
  /** Additional context string */
  context?: string;
  /** Expected return type */
  expectReturn?: "elements" | "positions" | "styles" | "analysis" | "plan";
}

/**
 * SDK-aligned delegation result
 */
export interface DelegateResult {
  /** Whether delegation succeeded */
  success: boolean;
  /** Result data (type depends on expectReturn) */
  result?: unknown;
  /** Error message if failed */
  error?: string;
  /** Summary of what the agent accomplished */
  summary?: string;
  /** IDs of created elements */
  createdIds?: string[];
  /** IDs of modified elements */
  modifiedIds?: string[];
  /** Duration in milliseconds */
  durationMs: number;
  /** Tokens used by the sub-agent */
  tokensUsed?: number;
  /** Token economy metrics */
  metrics?: {
    isolatedTokens: number;
    returnedTokens: number;
    savingsPercent: number;
  };
}

// ============================================================================
// SDK-ALIGNED FUNCTIONS
// ============================================================================

/**
 * Delegate a task to a specialized sub-agent (SDK-aligned)
 *
 * This is the SDK-aligned wrapper for delegateToSubAgent with a cleaner API.
 *
 * @example
 * ```typescript
 * const result = await delegate({
 *   agent: 'planner',
 *   task: 'Break down this complex task',
 *   contextId: 'my-context',
 *   expectReturn: 'plan',
 * });
 *
 * if (result.success) {
 *   console.log('Plan:', result.result);
 * }
 * ```
 */
export async function delegate(options: DelegateOptions): Promise<DelegateResult> {
  const task: SubAgentTask = {
    subagent: options.agent,
    task: options.task,
    context: {
      contextId: options.contextId,
      elementIds: options.elementIds,
      additionalContext: options.context,
    },
    expectReturn: options.expectReturn,
  };

  const result = await delegateToSubAgent(task);

  return {
    success: result.success,
    result: result.result,
    error: result.error,
    summary: result.summary,
    createdIds: result.createdIds,
    modifiedIds: result.modifiedIds,
    durationMs: result.duration,
    tokensUsed: result.tokensUsed,
    metrics: result.metrics
      ? {
          isolatedTokens: result.metrics.isolatedTokens,
          returnedTokens: result.metrics.returnedTokens,
          savingsPercent: result.metrics.savingsPercent,
        }
      : undefined,
  };
}

/**
 * Delegate multiple tasks in parallel (SDK-aligned)
 *
 * @example
 * ```typescript
 * const results = await delegateAll([
 *   { agent: 'analyzer', task: 'Analyze existing data' },
 *   { agent: 'explorer', task: 'Find related patterns' },
 * ]);
 *
 * const [analysis, exploration] = results;
 * ```
 */
export async function delegateAll(
  options: DelegateOptions[]
): Promise<DelegateResult[]> {
  const tasks: SubAgentTask[] = options.map((opt) => ({
    subagent: opt.agent,
    task: opt.task,
    context: {
      contextId: opt.contextId,
      elementIds: opt.elementIds,
      additionalContext: opt.context,
    },
    expectReturn: opt.expectReturn,
  }));

  const results = await delegateParallel(tasks);

  return results.map((result) => ({
    success: result.success,
    result: result.result,
    error: result.error,
    summary: result.summary,
    createdIds: result.createdIds,
    modifiedIds: result.modifiedIds,
    durationMs: result.duration,
    tokensUsed: result.tokensUsed,
    metrics: result.metrics
      ? {
          isolatedTokens: result.metrics.isolatedTokens,
          returnedTokens: result.metrics.returnedTokens,
          savingsPercent: result.metrics.savingsPercent,
        }
      : undefined,
  }));
}

/**
 * Detect which agent should handle a task (SDK-aligned alias)
 *
 * @example
 * ```typescript
 * const agent = detectAgent('Plan the implementation');
 * // Returns: 'planner'
 *
 * const agent2 = detectAgent('Analyze this data');
 * // Returns: 'analyzer'
 * ```
 */
export function detectAgent(task: string): SubAgentType | null {
  return detectSubAgent(task);
}

/**
 * Core agent types available for delegation (SDK-aligned constants)
 */
export const AgentTypes = {
  PLANNER: "planner" as const,
  ANALYZER: "analyzer" as const,
  EXPLORER: "explorer" as const,
} as const;
