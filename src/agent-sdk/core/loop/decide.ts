/**
 * DECIDE Phase
 *
 * Determines loop continuation or termination based on LLM response
 * and execution results.
 *
 * Responsibilities:
 * - Check for cancellation
 * - Check for completion (no tool calls)
 * - Check for interruption (clarification needed)
 * - Check for timeout (max iterations)
 * - Decide whether to continue loop
 */

import type {
  LoopContext,
  LoopState,
  GenerateResult,
  ActResult,
  Decision,
  AgentEvent,
} from "./types.js";
import { extractUserResponse } from "../response-extractor.js";

/**
 * Check if loop should be cancelled
 */
export function checkCancellation(
  ctx: LoopContext
): Decision | null {
  if (ctx.config.signal?.aborted || ctx.cancellation?.cancelled) {
    return {
      type: "cancelled",
      reason: ctx.cancellation?.reason || "User cancelled",
    };
  }
  return null;
}

/**
 * Check if LLM decided to complete (no tool calls)
 */
export function checkCompletion(
  ctx: LoopContext,
  state: LoopState,
  generateResult: GenerateResult
): Decision | null {
  const { text, toolCalls, finishReason } = generateResult;

  // If LLM finished without calling any tools, it has decided to respond directly
  if (finishReason === "stop" && toolCalls.length === 0) {
    // Extract clean user-facing response (strip reasoning XML tags)
    const userResponse = extractUserResponse(text || "");

    return {
      type: "complete",
      summary: userResponse || "Task completed successfully",
    };
  }

  return null;
}

/**
 * Check if any tool was interrupted (e.g., clarification needed)
 */
export function checkInterruption(
  actResults: ActResult[]
): Decision | null {
  const interruptedResult = actResults.find((r) => r.interrupted);
  if (interruptedResult) {
    // Find clarification event
    const clarificationEvent = interruptedResult.events.find(
      (e) => e.type === "clarification_needed"
    ) as AgentEvent & { clarificationId: string } | undefined;

    return {
      type: "interrupted",
      clarificationId: clarificationEvent?.clarificationId || "unknown",
    };
  }
  return null;
}

/**
 * Check if max iterations reached
 */
export function checkTimeout(
  ctx: LoopContext,
  state: LoopState
): Decision | null {
  if (state.iteration >= ctx.maxIterations) {
    return { type: "timeout" };
  }
  return null;
}

/**
 * Check for failure conditions
 */
export function checkFailure(
  state: LoopState,
  maxErrors: number = 3
): Decision | null {
  if (state.errors.length >= maxErrors) {
    return {
      type: "failed",
      reason: "Too many errors",
      errors: state.errors,
    };
  }
  return null;
}

/**
 * Make final decision for this iteration
 *
 * Order of checks:
 * 1. Cancellation (user cancelled)
 * 2. Completion (LLM finished without tools)
 * 3. Interruption (clarification needed)
 * 4. Failure (too many errors)
 * 5. Timeout (max iterations)
 * 6. Continue (default)
 */
export function decide(
  ctx: LoopContext,
  state: LoopState,
  generateResult: GenerateResult | null,
  actResults: ActResult[]
): Decision {
  // 1. Check cancellation
  const cancellation = checkCancellation(ctx);
  if (cancellation) return cancellation;

  // 2. Check completion (if we have a generate result)
  if (generateResult) {
    const completion = checkCompletion(ctx, state, generateResult);
    if (completion) return completion;
  }

  // 3. Check interruption
  const interruption = checkInterruption(actResults);
  if (interruption) return interruption;

  // 4. Check failure
  const failure = checkFailure(state, ctx.options.maxErrors);
  if (failure) return failure;

  // 5. Check timeout (at end of iteration)
  if (state.iteration >= ctx.maxIterations) {
    return { type: "timeout" };
  }

  // 6. Continue
  return { type: "continue" };
}

/**
 * Create events for decision
 */
export function createDecisionEvents(
  ctx: LoopContext,
  state: LoopState,
  decision: Decision,
  startTime: number
): AgentEvent[] {
  const events: AgentEvent[] = [];

  switch (decision.type) {
    case "complete":
      events.push({
        type: "complete",
        timestamp: Date.now(),
        summary: decision.summary,
        elementsAffected: state.resources.browser.version,
        totalDuration: Date.now() - startTime,
      });
      break;

    case "cancelled":
      events.push({
        type: "cancelled",
        timestamp: Date.now(),
        reason: decision.reason,
      });
      break;

    case "timeout":
      events.push({
        type: "timeout",
        timestamp: Date.now(),
        iterations: state.iteration,
        maxIterations: ctx.maxIterations,
      });
      events.push({
        type: "failed",
        timestamp: Date.now(),
        reason: `Agent did not complete within ${ctx.maxIterations} iterations`,
        errors: state.errors,
      });
      break;

    case "failed":
      events.push({
        type: "failed",
        timestamp: Date.now(),
        reason: decision.reason,
        errors: decision.errors,
      });
      break;

    case "interrupted":
      // Interruption event already emitted by ACT phase
      break;

    case "continue":
      // No event needed for continue
      break;
  }

  return events;
}

/**
 * Emit reasoning event from LLM response
 */
export function createReasoningEvent(
  text: string | null,
  hasToolCalls: boolean
): AgentEvent {
  return {
    type: "reasoning",
    timestamp: Date.now(),
    content: text || "Processing...",
    decision: hasToolCalls ? "continue" : "complete",
  };
}

/**
 * Check if decision is terminal (loop should stop)
 */
export function isTerminal(decision: Decision): boolean {
  return decision.type !== "continue";
}
