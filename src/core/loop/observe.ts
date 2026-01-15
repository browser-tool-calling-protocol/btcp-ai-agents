/**
 * OBSERVE Phase
 *
 * Processes tool results, updates state, and manages context lifecycle.
 *
 * Responsibilities:
 * - Add tool results to lifecycle for ageing
 * - Validate results for echo poisoning
 * - Update history (capped)
 * - Handle mutation tool effects (invalidate awareness)
 * - Track operation metrics
 */

import type {
  LoopContext,
  LoopState,
  ObserveResult,
  ActResult,
  AgentEvent,
} from "./types.js";
import { handleMutationToolEffect } from "./context.js";

// Default max history entries to prevent unbounded growth
const DEFAULT_MAX_HISTORY = 50;

/**
 * Execute OBSERVE phase for a single tool result
 *
 * @param ctx - Loop context
 * @param state - Loop state
 * @param actResult - Result from ACT phase
 * @returns ObserveResult with events and state update flag
 */
export async function observe(
  ctx: LoopContext,
  state: LoopState,
  actResult: ActResult
): Promise<ObserveResult> {
  const events: AgentEvent[] = [];
  let stateUpdated = false;

  // Skip observation for blocked/interrupted results
  if (actResult.blocked || actResult.interrupted) {
    return { events, stateUpdated: false };
  }

  const { toolName, toolOutput } = actResult;
  const toolCallId = `call_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  // Add tool result to lifecycle for 3-stage ageing
  ctx.toolLifecycle.addResult(
    toolCallId,
    toolName,
    toolOutput,
    state.iteration
  );

  // Validate tool result for echo poisoning
  if (state.lastStateSnapshot) {
    const validation = ctx.echoPrevention.validateToolResult(
      toolName,
      toolOutput,
      state.lastStateSnapshot
    );
    if (!validation.valid) {
      for (const issue of validation.issues) {
        ctx.echoPrevention.addInvalidIdCorrection(issue.claimed);
      }
      if (ctx.config.verbose) {
        console.log(`[Agent] Echo poisoning detected: ${validation.issues.length} invalid IDs`);
      }
    }
  }

  // Update history (capped to prevent memory issues)
  state.history.push({
    tool: toolName,
    result: toolOutput,
  });

  const maxHistory = ctx.maxHistoryEntries || DEFAULT_MAX_HISTORY;
  if (state.history.length > maxHistory) {
    state.history = state.history.slice(-maxHistory);
  }

  // Handle mutation tool effects (invalidate awareness cache)
  handleMutationToolEffect(state, toolName, ctx.config.verbose);

  stateUpdated = true;

  return { events, stateUpdated };
}

/**
 * Execute OBSERVE phase for all tool results
 *
 * @param ctx - Loop context
 * @param state - Loop state
 * @param actResults - Results from ACT phase
 * @returns Combined ObserveResult
 */
export async function observeAll(
  ctx: LoopContext,
  state: LoopState,
  actResults: ActResult[]
): Promise<ObserveResult> {
  const allEvents: AgentEvent[] = [];
  let anyStateUpdated = false;

  for (const actResult of actResults) {
    const result = await observe(ctx, state, actResult);
    allEvents.push(...result.events);
    if (result.stateUpdated) {
      anyStateUpdated = true;
    }
  }

  return {
    events: allEvents,
    stateUpdated: anyStateUpdated,
  };
}

/**
 * Save checkpoint if enabled and due
 *
 * @param ctx - Loop context
 * @param state - Loop state
 * @returns Checkpoint event if saved, null otherwise
 */
export async function saveCheckpointIfDue(
  ctx: LoopContext,
  state: LoopState
): Promise<AgentEvent | null> {
  if (
    ctx.sessionSerializer &&
    ctx.checkpointInterval > 0 &&
    state.iteration % ctx.checkpointInterval === 0
  ) {
    await ctx.sessionSerializer.save(ctx.contextManager, ctx.sessionId);

    return {
      type: "checkpoint",
      timestamp: Date.now(),
      sessionId: ctx.sessionId,
      canvasVersion: state.resources.canvas.version,
      operationCount: state.history.length,
    };
  }

  return null;
}

/**
 * Handle error during generation
 *
 * @param ctx - Loop context
 * @param state - Loop state
 * @param error - Error that occurred
 * @returns Array of events to yield
 */
export function handleGenerationError(
  ctx: LoopContext,
  state: LoopState,
  error: unknown
): AgentEvent[] {
  const events: AgentEvent[] = [];
  const errorMessage = error instanceof Error ? error.message : "Unknown error";

  console.error("[Agent Loop] GENERATION ERROR:", error);
  console.error("[Agent Loop] Error message:", errorMessage);

  // Detect API key missing error
  const isApiKeyError =
    errorMessage.includes("API key is missing") ||
    errorMessage.includes("API_KEY") ||
    (error instanceof Error && error.name === "AI_LoadAPIKeyError");

  const errorCode = isApiKeyError ? "AGENT_API_KEY_MISSING" : "GENERATION_ERROR";

  state.errors.push({
    code: errorCode,
    message: errorMessage,
  });

  // Check for error loop pattern
  const loopDetection = ctx.echoPrevention.detectErrorLoop(errorMessage, "generation");
  if (loopDetection?.detected) {
    ctx.echoPrevention.addRepeatedErrorCorrection("generation approach", loopDetection.count);
    console.warn(`[Agent] Error loop detected: ${loopDetection.message}`);
  }

  // For API key errors, fail immediately
  if (isApiKeyError) {
    events.push({
      type: "error",
      timestamp: Date.now(),
      error: {
        code: "AGENT_API_KEY_MISSING",
        message: errorMessage,
        recoverable: false,
      },
    });

    events.push({
      type: "failed",
      timestamp: Date.now(),
      reason: "API key not configured",
      errors: state.errors,
    });

    return events;
  }

  events.push({
    type: "error",
    timestamp: Date.now(),
    error: {
      code: errorCode,
      message: errorMessage,
      recoverable: state.errors.length < 3,
    },
  });

  // Check if too many errors
  if (state.errors.length >= 3) {
    events.push({
      type: "failed",
      timestamp: Date.now(),
      reason: "Too many errors",
      errors: state.errors,
    });

    return events;
  }

  // Attempt recovery
  events.push({
    type: "recovery",
    timestamp: Date.now(),
    attempt: state.errors.length,
    maxAttempts: 3,
    strategy: "retry",
  });

  return events;
}
