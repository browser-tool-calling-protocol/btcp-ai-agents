/**
 * THINK Phase
 *
 * Gathers context, fetches awareness, and prepares the user message
 * for LLM generation.
 *
 * Responsibilities:
 * - Fetch canvas snapshot
 * - Age tool results (lifecycle management)
 * - Inject context for iteration
 * - Get awareness (cached or fresh)
 * - Format user message
 */

import type {
  LoopContext,
  LoopState,
  ThinkResult,
  AgentEvent,
  CanvasAwareness,
} from "./types.js";
import {
  fetchCanvasSnapshot,
  getAwarenessWithCaching,
  injectCanvasContextForIteration,
  formatUserMessage,
} from "./context.js";

/**
 * Execute THINK phase
 *
 * This phase prepares all context needed for LLM generation:
 * 1. Updates echo prevention turn counter
 * 2. Fetches fresh canvas snapshot
 * 3. Ages tool results (3-stage lifecycle)
 * 4. Injects canvas/task/corrections context
 * 5. Gets awareness (cached or fresh)
 * 6. Formats user message
 */
export async function think(
  ctx: LoopContext,
  state: LoopState
): Promise<ThinkResult> {
  const events: AgentEvent[] = [];

  // Update echo prevention turn counter
  ctx.echoPrevention.setTurn(state.iteration);

  // Fetch fresh canvas snapshot for context injection
  const stateSnapshot = await fetchCanvasSnapshot(ctx, state);

  // Get any echo poisoning corrections
  const corrections = ctx.echoPrevention.formatCorrectionsForContext();

  // Inject context for this iteration
  const injectionResult = injectCanvasContextForIteration(
    ctx.contextManager,
    stateSnapshot,
    state.taskState,
    corrections
  );

  // Emit corrections event if any
  if (corrections) {
    events.push({
      type: "correction",
      timestamp: Date.now(),
      iteration: state.iteration,
      corrections: ctx.echoPrevention.getCorrections().map((c) => ({
        type: c.type,
        message: c.message,
      })),
    });
  }

  // Emit context injected event
  events.push({
    type: "context_injected",
    timestamp: Date.now(),
    iteration: state.iteration,
    canvasState: {
      elementCount: stateSnapshot?.elementCount ?? 0,
      selection: stateSnapshot?.selection ?? [],
    },
    taskCount: state.taskState.length,
    tokensUsed: injectionResult.tokensUsed,
  });

  // Age tool results at start of iteration
  const ageingReport = ctx.toolLifecycle.ageResults(state.iteration);
  if (ageingReport.tokensSaved > 0 && ctx.config.verbose) {
    console.log(`[Agent] Aged tool results: saved ${ageingReport.tokensSaved} tokens`);
  }

  // Emit thinking event
  events.push({
    type: "thinking",
    timestamp: Date.now(),
    iteration: state.iteration,
    message: `Analyzing canvas state (iteration ${state.iteration})...`,
  });

  // Get awareness - fetches only if stale
  const awareness = await getAwarenessWithCaching(ctx, state);

  // Emit context event
  events.push({
    type: "context",
    timestamp: Date.now(),
    summary: awareness.summary,
    tokensUsed: awareness.tokensUsed,
  });

  // Format user message with awareness
  const userMessage = formatUserMessage(
    ctx.resolvedTask,
    awareness,
    state.history,
    state.taskState
  );

  // Add user message to context manager
  ctx.contextManager.addUserMessage(userMessage);

  return {
    events,
    userMessage,
    awareness,
    stateSnapshot,
    corrections,
  };
}

/**
 * Execute THINK phase in test mode
 *
 * Simplified version for testing that skips MCP operations.
 */
export async function thinkTestMode(
  ctx: LoopContext,
  state: LoopState
): Promise<ThinkResult> {
  const events: AgentEvent[] = [];

  // Emit thinking event
  events.push({
    type: "thinking",
    timestamp: Date.now(),
    iteration: state.iteration,
    message: `Test mode - analyzing task (iteration ${state.iteration})...`,
  });

  // Mock awareness - consistent with createMockAwareness
  const awareness: CanvasAwareness = {
    summary: `Canvas "${ctx.canvasId}" is empty. Use canvas_read to get current state, canvas_write to create elements.`,
    tokensUsed: 100,
    skeleton: [],
    relevant: [],
  };

  // Emit context event
  events.push({
    type: "context",
    timestamp: Date.now(),
    summary: awareness.summary,
    tokensUsed: awareness.tokensUsed,
  });

  // Format user message
  const userMessage = formatUserMessage(
    ctx.resolvedTask,
    awareness,
    state.history,
    state.taskState
  );

  return {
    events,
    userMessage,
    awareness,
    stateSnapshot: null,
    corrections: null,
  };
}
