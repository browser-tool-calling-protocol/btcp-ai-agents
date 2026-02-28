/**
 * Context Management
 *
 * Handles state awareness, context injection, and message formatting
 * for the agentic loop.
 *
 * Uses ActionAdapter for domain-agnostic operation.
 */

import type {
  LoopContext,
  LoopState,
  BrowserAwareness,
  PlanTask,
  ContextManager,
  McpClient,
  StateSnapshotOutput,
  ActionAdapter,
} from "./types.js";
import type { ContextOptions } from "../../agents/context-builder.js";
import { MemoryTier, MessagePriority } from "../../context/types.js";
import { createMessage } from "../../context/memory.js";
import {
  updateAwareness,
  invalidateAwareness,
  needsAwarenessRefresh,
  isMutationTool,
} from "../../agents/state.js";
import type { AgentToolName } from "../../tools/generic-definitions.js";


// ============================================================================
// AWARENESS MANAGEMENT
// ============================================================================

/**
 * Mock awareness for test mode
 */
export function createMockAwareness(sessionId: string): BrowserAwareness {
  return {
    summary: `Session "${sessionId}" is ready. Use context_read to get current state, task_execute to perform actions.`,
    tokensUsed: 100,
    skeleton: [],
    relevant: [],
  };
}

/**
 * Get awareness with caching - only fetches if stale or missing
 *
 * Uses the unified fetchAwareness function which prefers adapter over MCP.
 */
export async function getAwarenessWithCaching(
  ctx: LoopContext,
  state: LoopState
): Promise<BrowserAwareness> {
  // Test mode: always use mock
  if (ctx.config.skipMcpConnection && !ctx.adapter) {
    return createMockAwareness(ctx.sessionId);
  }

  // Check if we need to refresh
  if (needsAwarenessRefresh(state.resources)) {
    const freshAwareness = await fetchAwareness(
      ctx,
      ctx.resolvedTask,
      {
        tokenBudget: state.resources.context.tokenBudget,
        includeHistory: state.history.length > 0,
      }
    );

    // Update cache
    state.resources = updateAwareness(state.resources, freshAwareness);

    if (ctx.config.verbose) {
      console.log(`[Agent] Awareness fetched (was stale or missing)`);
    }

    return freshAwareness;
  }

  // Use cached awareness
  if (ctx.config.verbose) {
    console.log(`[Agent] Using cached awareness (not stale)`);
  }

  return state.resources.context.awareness!;
}

/**
 * Fetch awareness from MCP resource
 * @deprecated Use fetchAwarenessFromAdapter instead
 */
export async function fetchAwarenessFromMcp(
  mcp: McpClient,
  sessionId: string,
  task: string,
  options: ContextOptions
): Promise<BrowserAwareness> {
  try {
    // Build resource URI with query params
    const params = new URLSearchParams();
    if (task) params.set("task", task);
    if (options.tokenBudget) params.set("tokenBudget", String(options.tokenBudget));

    const uri = `resource://session/${sessionId}/snapshot${params.toString() ? "?" + params.toString() : ""}`;

    // Use readResource if available, otherwise fall back to callTool
    let result: StateSnapshotOutput;
    if (mcp.readResource) {
      result = await mcp.readResource<StateSnapshotOutput>(uri);
    } else {
      // Fall back to callTool
      result = await mcp.callTool("state_snapshot", {
        task,
        tokenBudget: options.tokenBudget,
      }) as StateSnapshotOutput;
    }

    return {
      summary: result.summary ?? "State unavailable",
      formatted: result.formatted,
      skeleton: result.skeleton as BrowserAwareness["skeleton"],
      relevant: result.relevant as BrowserAwareness["relevant"],
      tokensUsed: result.tokensUsed ?? 0,
      compressionRatio: result.compressionRatio,
    };
  } catch {
    // Fallback to empty awareness on error - still encourage tool use
    return {
      summary: `Session "${sessionId}" - use context_read to check current state.`,
      tokensUsed: 50,
    };
  }
}

/**
 * Fetch awareness from ActionAdapter
 *
 * This is the domain-agnostic way to get context awareness.
 * Works with any adapter implementation (BTCP, MCP, etc.)
 */
export async function fetchAwarenessFromAdapter(
  adapter: ActionAdapter,
  task: string,
  options: ContextOptions
): Promise<BrowserAwareness> {
  try {
    const awarenessContext = await adapter.getAwareness({
      includeSkeleton: true,
      includeRelevant: true,
      maxTokens: options.tokenBudget,
      contextHint: task,
    });

    return {
      summary: awarenessContext.summary,
      skeleton: awarenessContext.skeleton as BrowserAwareness["skeleton"],
      relevant: awarenessContext.relevant as BrowserAwareness["relevant"],
      availableTools: awarenessContext.availableActions?.map((name) => ({
        name,
        description: adapter.getActionSchema(name)?.description || "",
      })),
      tokensUsed: awarenessContext.tokensUsed ?? 0,
    };
  } catch (error) {
    // Fallback to minimal awareness
    return {
      summary: `State unavailable - use context_read to check current state. Error: ${error instanceof Error ? error.message : "Unknown"}`,
      tokensUsed: 50,
    };
  }
}

/**
 * Unified awareness fetcher - uses adapter if available, falls back to MCP
 */
export async function fetchAwareness(
  ctx: LoopContext,
  task: string,
  options: ContextOptions
): Promise<BrowserAwareness> {
  // Prefer adapter if available
  if (ctx.adapter) {
    return fetchAwarenessFromAdapter(ctx.adapter, task, options);
  }

  // Fall back to MCP
  return fetchAwarenessFromMcp(
    ctx.mcpClient,
    ctx.sessionId,
    task,
    options
  );
}

/**
 * Fetch state snapshot for context injection
 *
 * Uses adapter if available, otherwise falls back to MCP client.
 */
export async function fetchStateSnapshot(
  ctx: LoopContext,
  state: LoopState
): Promise<StateSnapshotOutput | null> {
  try {
    let snapshotResult: StateSnapshotOutput | null = null;

    // Prefer adapter if available
    if (ctx.adapter) {
      const stateSnapshot = await ctx.adapter.getState({ format: "json" });
      snapshotResult = {
        summary: stateSnapshot.summary,
        timestamp: stateSnapshot.timestamp,
        data: stateSnapshot.data,
        tokensUsed: stateSnapshot.tokensUsed,
      };
    } else if (ctx.mcpClient.execute) {
      // Use execute if available
      snapshotResult = await ctx.mcpClient.execute<StateSnapshotOutput>(
        "state_snapshot",
        { format: "level1" }
      );
    } else {
      // Fall back to callTool
      snapshotResult = await ctx.mcpClient.callTool(
        "state_snapshot",
        { format: "level1" }
      ) as StateSnapshotOutput;
    }

    if (snapshotResult && typeof snapshotResult === "object") {
      state.lastStateSnapshot = snapshotResult;
      return snapshotResult;
    }
  } catch {
    // Use last known snapshot if refresh fails
  }
  return state.lastStateSnapshot;
}

// ============================================================================
// CONTEXT INJECTION
// ============================================================================

/**
 * Format state for context injection (Level 1 summary - ~50 tokens)
 */
export function formatStateForContext(snapshot: StateSnapshotOutput): string {
  const typeBreakdown = Object.entries(snapshot.typeCounts || {})
    .map(([type, count]) => `${count} ${type}s`)
    .join(", ");

  return `## Current State
- Elements: ${snapshot.elementCount || 0} (${typeBreakdown || "empty"})
- Selection: ${snapshot.selection?.join(", ") || "none"}
- Viewport: ${JSON.stringify(snapshot.viewport || { x: 0, y: 0, zoom: 1 })}
- Available space: ${snapshot.availableRegions?.join(", ") || "full"}`;
}

/** @deprecated Use formatStateForContext instead */
export const formatCanvasForContext = formatStateForContext;

/**
 * Format task list for context injection (like Claude Code's TodoWrite)
 */
export function formatTasksForContext(tasks: PlanTask[]): string {
  if (tasks.length === 0) return "";

  const lines: string[] = ["## Current Tasks"];

  for (const task of tasks) {
    const statusIcon =
      task.status === "completed" ? "✓" :
      task.status === "in_progress" ? "→" :
      task.status === "failed" ? "✗" : "○";

    lines.push(`${statusIcon} ${task.content}`);
  }

  return lines.join("\n");
}

/**
 * Get current task from task list
 */
export function getCurrentTask(tasks: PlanTask[]): PlanTask | undefined {
  return tasks.find((t) => t.status === "in_progress");
}

/**
 * Get task progress summary
 */
export function getTaskProgress(tasks: PlanTask[]): {
  total: number;
  completed: number;
  inProgress: number;
  pending: number;
} {
  return {
    total: tasks.length,
    completed: tasks.filter((t) => t.status === "completed").length,
    inProgress: tasks.filter((t) => t.status === "in_progress").length,
    pending: tasks.filter((t) => t.status === "pending").length,
  };
}

/**
 * Inject state and task context for iteration
 */
export function injectStateContextForIteration(
  contextManager: ContextManager,
  stateSnapshot: StateSnapshotOutput | null,
  taskState: PlanTask[],
  corrections: string | null
): { tokensUsed: number } {
  let tokensUsed = 0;

  // Inject fresh state (Level 1 summary - ~50 tokens)
  if (stateSnapshot) {
    const stateSummary = formatStateForContext(stateSnapshot);
    const stateMsg = createMessage("system", stateSummary, {
      priority: MessagePriority.HIGH,
      metadata: {
        type: "state_snapshot",
        refreshedAt: Date.now(),
        ttl: 0, // Never cache
      },
    });
    contextManager.addMessage(stateMsg, { tier: MemoryTier.EPHEMERAL });
    tokensUsed += stateMsg.tokens ?? 0;
  }

  // Inject task state if exists
  if (taskState.length > 0) {
    const taskContext = formatTasksForContext(taskState);
    const taskMsg = createMessage("system", taskContext, {
      priority: MessagePriority.HIGH,
      metadata: { type: "task_state" },
    });
    contextManager.addMessage(taskMsg, { tier: MemoryTier.EPHEMERAL });
    tokensUsed += taskMsg.tokens ?? 0;
  }

  // Inject corrections if any (from echo poisoning prevention)
  if (corrections) {
    const correctionsMsg = createMessage("system", corrections, {
      priority: MessagePriority.CRITICAL,
      metadata: { type: "corrections" },
    });
    contextManager.addMessage(correctionsMsg, { tier: MemoryTier.EPHEMERAL });
    tokensUsed += correctionsMsg.tokens ?? 0;
  }

  return { tokensUsed };
}

/**
 * Format user message with awareness and history
 */
export function formatUserMessage(
  task: string,
  awareness: BrowserAwareness,
  history: Array<{ tool: string; result: unknown }>,
  taskState?: PlanTask[]
): string {
  const parts: string[] = [];

  parts.push(`Task: ${task}`);
  parts.push("");
  parts.push("## Current State");
  parts.push(awareness.summary);

  if (awareness.skeleton) {
    parts.push("");
    parts.push("## State Structure");
    parts.push(JSON.stringify(awareness.skeleton, null, 2));
  }

  if (awareness.relevant?.length) {
    parts.push("");
    parts.push("## Relevant Elements");
    parts.push(JSON.stringify(awareness.relevant, null, 2));
  }

  // Include task state if available
  if (taskState && taskState.length > 0) {
    parts.push("");
    parts.push(formatTasksForContext(taskState));
  }

  if (history.length > 0) {
    parts.push("");
    parts.push("## Recent Operations");
    for (const h of history.slice(-5)) {
      const resultStr = JSON.stringify(h.result);
      parts.push(`- ${h.tool}: ${resultStr.slice(0, 100)}${resultStr.length > 100 ? "..." : ""}`);
    }
  }

  parts.push("");
  parts.push("## Instructions");
  parts.push("You MUST call the appropriate tool to accomplish this task:");
  parts.push("- For queries about context → call context_read");
  parts.push("- To write data → call context_write");
  parts.push("- To execute tasks → call task_execute");
  parts.push("");
  parts.push("After completing the task, summarize what you did.");

  return parts.join("\n");
}

// ============================================================================
// STATE UPDATES
// ============================================================================

/**
 * Handle awareness invalidation after mutation tools
 */
export function handleMutationToolEffect(
  state: LoopState,
  toolName: AgentToolName,
  verbose?: boolean
): void {
  if (isMutationTool(toolName)) {
    state.resources = invalidateAwareness(state.resources);

    if (verbose) {
      console.log(`[Agent] Awareness invalidated after ${toolName}`);
    }
  } else {
    // Read-only tools: just increment version without invalidation
    state.resources.browser.version++;
  }
}

/** @deprecated Use injectStateContextForIteration instead */
export const injectCanvasContextForIteration = injectStateContextForIteration;

/** @deprecated Use fetchStateSnapshot instead */
export const fetchCanvasSnapshot = fetchStateSnapshot;
