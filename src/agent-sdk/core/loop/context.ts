/**
 * Context Management
 *
 * Handles canvas awareness, context injection, and message formatting
 * for the agentic loop.
 *
 * Updated to support ActionAdapter for domain-agnostic operation.
 */

import type {
  LoopContext,
  LoopState,
  CanvasAwareness,
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

// Legacy type aliases
type CanvasToolName = AgentToolName;
type CanvasSnapshotOutput = StateSnapshotOutput;

// ============================================================================
// AWARENESS MANAGEMENT
// ============================================================================

/**
 * Mock awareness for test mode
 */
export function createMockAwareness(sessionId: string): CanvasAwareness {
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
): Promise<CanvasAwareness> {
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
 * Fetch awareness from canvas via MCP resource
 * @deprecated Use fetchAwarenessFromAdapter instead
 */
export async function fetchAwarenessFromMcp(
  mcp: McpClient,
  canvasId: string,
  task: string,
  options: ContextOptions
): Promise<CanvasAwareness> {
  try {
    // Build resource URI with query params
    const params = new URLSearchParams();
    if (task) params.set("task", task);
    if (options.tokenBudget) params.set("tokenBudget", String(options.tokenBudget));

    const uri = `resource://canvas/${canvasId}/snapshot${params.toString() ? "?" + params.toString() : ""}`;

    // Use readResource if available, otherwise fall back to callTool
    let result: CanvasSnapshotOutput;
    if (mcp.readResource) {
      result = await mcp.readResource<CanvasSnapshotOutput>(uri);
    } else {
      // Fall back to callTool
      result = await mcp.callTool("canvas_snapshot", {
        task,
        tokenBudget: options.tokenBudget,
      }) as CanvasSnapshotOutput;
    }

    return {
      summary: result.summary ?? "Canvas state unavailable",
      formatted: result.formatted,
      skeleton: result.skeleton as CanvasAwareness["skeleton"],
      relevant: result.relevant as CanvasAwareness["relevant"],
      tokensUsed: result.tokensUsed ?? 0,
      compressionRatio: result.compressionRatio,
    };
  } catch {
    // Fallback to empty awareness on error - still encourage tool use
    return {
      summary: `Canvas "${canvasId}" - use canvas_read to check current state.`,
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
): Promise<CanvasAwareness> {
  try {
    const awarenessContext = await adapter.getAwareness({
      includeSkeleton: true,
      includeRelevant: true,
      maxTokens: options.tokenBudget,
      contextHint: task,
    });

    return {
      summary: awarenessContext.summary,
      skeleton: awarenessContext.skeleton as CanvasAwareness["skeleton"],
      relevant: awarenessContext.relevant as CanvasAwareness["relevant"],
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
): Promise<CanvasAwareness> {
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
 * Fetch canvas snapshot for context injection
 *
 * Uses adapter if available, otherwise falls back to MCP client.
 */
export async function fetchCanvasSnapshot(
  ctx: LoopContext,
  state: LoopState
): Promise<CanvasSnapshotOutput | null> {
  try {
    let snapshotResult: CanvasSnapshotOutput | null = null;

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
      snapshotResult = await ctx.mcpClient.execute<CanvasSnapshotOutput>(
        "canvas_snapshot",
        { format: "level1" }
      );
    } else {
      // Fall back to callTool
      snapshotResult = await ctx.mcpClient.callTool(
        "canvas_snapshot",
        { format: "level1" }
      ) as CanvasSnapshotOutput;
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
 * Format canvas state for context injection (Level 1 summary - ~50 tokens)
 */
export function formatCanvasForContext(snapshot: CanvasSnapshotOutput): string {
  const typeBreakdown = Object.entries(snapshot.typeCounts || {})
    .map(([type, count]) => `${count} ${type}s`)
    .join(", ");

  return `## Canvas State
- Elements: ${snapshot.elementCount || 0} (${typeBreakdown || "empty"})
- Selection: ${snapshot.selection?.join(", ") || "none"}
- Viewport: ${JSON.stringify(snapshot.viewport || { x: 0, y: 0, zoom: 1 })}
- Available space: ${snapshot.availableRegions?.join(", ") || "full canvas"}`;
}

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
 * Inject canvas and task context for iteration
 */
export function injectCanvasContextForIteration(
  contextManager: ContextManager,
  canvasSnapshot: CanvasSnapshotOutput | null,
  taskState: PlanTask[],
  corrections: string | null
): { tokensUsed: number } {
  let tokensUsed = 0;

  // Inject fresh canvas state (Level 1 summary - ~50 tokens)
  if (canvasSnapshot) {
    const canvasSummary = formatCanvasForContext(canvasSnapshot);
    const canvasMsg = createMessage("system", canvasSummary, {
      priority: MessagePriority.HIGH,
      metadata: {
        type: "canvas_state",
        refreshedAt: Date.now(),
        ttl: 0, // Never cache
      },
    });
    contextManager.addMessage(canvasMsg, { tier: MemoryTier.EPHEMERAL });
    tokensUsed += canvasMsg.tokens ?? 0;
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
  awareness: CanvasAwareness,
  history: Array<{ tool: string; result: unknown }>,
  taskState?: PlanTask[]
): string {
  const parts: string[] = [];

  parts.push(`Task: ${task}`);
  parts.push("");
  parts.push("## Current Canvas State");
  parts.push(awareness.summary);

  if (awareness.skeleton) {
    parts.push("");
    parts.push("## Canvas Structure");
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
  toolName: CanvasToolName,
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
