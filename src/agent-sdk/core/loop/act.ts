/**
 * ACT Phase
 *
 * Executes tool calls from LLM and yields events for each execution.
 *
 * Responsibilities:
 * - Execute each tool call sequentially
 * - Handle blocked results from hooks
 * - Handle interrupts from agent_clarify
 * - Yield acting/observing events
 * - Track tool calls for LLM history
 */

import type {
  LoopContext,
  LoopState,
  ActResult,
  AgentEvent,
  ToolSet,
} from "./types.js";
import type { AgentToolName } from "../../tools/generic-definitions.js";
import { executeTool, isBlockedResult } from "../../tools/ai-sdk-bridge.js";

// Legacy type alias
type CanvasToolName = AgentToolName;

/**
 * Check if a tool result is an interrupt (clarification needed)
 */
function isInterruptResult(result: unknown): result is {
  clarificationId: string;
  questions?: string[];
  reason?: string;
  options?: string[];
  clarificationType?: string;
} {
  return (
    typeof result === "object" &&
    result !== null &&
    "clarificationId" in result &&
    typeof (result as Record<string, unknown>).clarificationId === "string"
  );
}

/**
 * Execute a single tool call
 *
 * @param ctx - Loop context
 * @param state - Loop state
 * @param tools - Available tools
 * @param toolCall - Tool call to execute
 * @param delegationEvents - Queue for delegation events
 * @returns ActResult with events and outcome
 */
export async function act(
  ctx: LoopContext,
  state: LoopState,
  tools: ToolSet,
  toolCall: { name: string; args: Record<string, unknown> },
  delegationEvents: AgentEvent[]
): Promise<ActResult> {
  const events: AgentEvent[] = [];
  const toolName = toolCall.name as CanvasToolName;
  const toolInput = toolCall.args;
  const toolCallId = `call_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  // Emit acting event
  events.push({
    type: "acting",
    timestamp: Date.now(),
    tool: toolName,
    input: toolInput,
  });

  // Execute the tool
  let toolOutput: unknown;
  try {
    toolOutput = await executeTool(tools, toolName, toolInput);
  } catch (toolError) {
    toolOutput = {
      success: false,
      error: toolError instanceof Error ? toolError.message : String(toolError),
    };
  }

  // Check if blocked by hook
  if (isBlockedResult(toolOutput)) {
    events.push({
      type: "blocked",
      timestamp: Date.now(),
      reason: toolOutput.reason || "Blocked by hook",
      tool: toolName,
    });

    return {
      events,
      toolName,
      toolInput,
      toolOutput,
      blocked: true,
      interrupted: false,
    };
  }

  // Check if agent_clarify tool - interrupts stream for user response
  if (toolName === "agent_clarify" && isInterruptResult(toolOutput)) {
    events.push({
      type: "clarification_needed",
      timestamp: Date.now(),
      clarificationId: toolOutput.clarificationId,
      questions: toolOutput.questions,
      reason: toolOutput.reason,
      options: toolOutput.options,
      clarificationType: toolOutput.clarificationType,
    });

    return {
      events,
      toolName,
      toolInput,
      toolOutput,
      blocked: false,
      interrupted: true,
    };
  }

  // Emit observing event
  events.push({
    type: "observing",
    timestamp: Date.now(),
    result: {
      success: true,
      data: toolOutput,
    },
  });

  // Add tool call and result to LLM provider history
  ctx.llmProvider.addToolCallToHistory(toolName, toolInput);
  ctx.llmProvider.addToolResultToHistory(toolName, toolOutput);
  state.lastToolCalls.push({ name: toolName, args: toolInput });

  // Yield any queued delegation events
  while (delegationEvents.length > 0) {
    events.push(delegationEvents.shift()!);
  }

  // Add tool result to context manager
  ctx.contextManager.addToolResult(
    toolCallId,
    toolName,
    typeof toolOutput === "string" ? toolOutput : JSON.stringify(toolOutput)
  );

  return {
    events,
    toolName,
    toolInput,
    toolOutput,
    blocked: false,
    interrupted: false,
  };
}

/**
 * Execute all tool calls from LLM response
 *
 * @param ctx - Loop context
 * @param state - Loop state
 * @param tools - Available tools
 * @param toolCalls - Array of tool calls to execute
 * @param delegationEvents - Queue for delegation events
 * @returns Array of ActResults for each tool call
 */
export async function actAll(
  ctx: LoopContext,
  state: LoopState,
  tools: ToolSet,
  toolCalls: Array<{ name: string; args: Record<string, unknown> }>,
  delegationEvents: AgentEvent[]
): Promise<ActResult[]> {
  const results: ActResult[] = [];

  for (const toolCall of toolCalls) {
    const result = await act(ctx, state, tools, toolCall, delegationEvents);
    results.push(result);

    // Stop processing if interrupted
    if (result.interrupted) {
      break;
    }
  }

  return results;
}

/**
 * Execute a mock tool in test mode
 *
 * @param ctx - Loop context
 * @param state - Loop state
 * @param toolName - Tool to execute
 * @param toolInput - Tool input
 * @returns ActResult with events
 */
export async function actTestMode(
  ctx: LoopContext,
  state: LoopState,
  toolName: CanvasToolName,
  toolInput: unknown
): Promise<ActResult> {
  const events: AgentEvent[] = [];

  // Trigger pre-hook
  await ctx.hooksManager.triggerPreExecute(toolName, toolInput);

  // Emit acting event
  events.push({
    type: "acting",
    timestamp: Date.now(),
    tool: toolName,
    input: toolInput,
  });

  try {
    // Call the mock executor
    const result = await ctx.options.executor!.execute(toolName, toolInput);

    // Trigger post-hook
    await ctx.hooksManager.triggerPostExecute(toolName, result, 10);

    // Emit observing event
    events.push({
      type: "observing",
      timestamp: Date.now(),
      result: { success: true, data: result },
    });

    return {
      events,
      toolName,
      toolInput,
      toolOutput: result,
      blocked: false,
      interrupted: false,
    };
  } catch (error) {
    state.errors.push({
      code: "EXECUTOR_ERROR",
      message: error instanceof Error ? error.message : String(error),
    });

    // Yield error event
    events.push({
      type: "error",
      timestamp: Date.now(),
      error: {
        code: "EXECUTOR_ERROR",
        message: error instanceof Error ? error.message : String(error),
        recoverable: state.errors.length < (ctx.options.maxErrors ?? 3),
      },
    });

    return {
      events,
      toolName,
      toolInput,
      toolOutput: { error: error instanceof Error ? error.message : String(error) },
      blocked: false,
      interrupted: false,
    };
  }
}
