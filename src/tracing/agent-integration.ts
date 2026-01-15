/**
 * Agent Loop Tracing Integration
 *
 * Provides seamless integration between the tracing system and the agent loop.
 * This module bridges AgentEvent from the loop to ConversationTracer spans.
 *
 * Usage:
 * ```typescript
 * import { createTracedAgentLoop } from './tracing/agent-integration.js';
 *
 * for await (const event of createTracedAgentLoop(task, canvasId, options)) {
 *   // Events are automatically traced
 *   console.log(event);
 * }
 * ```
 */

import { ConversationTracer, getTracer } from "./tracer.js";
import { ConsoleExporter } from "./exporters.js";
import type {
  Trace,
  TracerOptions,
  TokenUsage,
  ToolCallRecord,
} from "./types.js";
import type { AgentEvent, LoopOptions } from "../core/loop/types.js";
import { runAgenticLoop } from "../core/loop/index.js";

// ============================================================================
// TYPES
// ============================================================================

/**
 * Options for traced agent execution
 */
export interface TracedAgentOptions extends LoopOptions {
  /** Enable tracing (default: true) */
  enableTracing?: boolean;
  /** Tracer options */
  tracerOptions?: TracerOptions;
  /** Use global tracer instead of creating new one */
  useGlobalTracer?: boolean;
  /** Callback when trace completes */
  onTraceComplete?: (trace: Trace) => void;
}

/**
 * Result from traced agent execution
 */
export interface TracedAgentResult {
  /** All events from agent execution */
  events: AgentEvent[];
  /** The complete trace */
  trace: Trace | null;
  /** Whether execution was successful */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Total duration in ms */
  durationMs: number;
}

// ============================================================================
// AGENT LOOP INTEGRATION
// ============================================================================

/**
 * Create a traced agent loop that automatically captures spans
 *
 * This wraps runAgenticLoop and instruments all events:
 * - LLM calls become llm:* spans
 * - Tool calls become tool:* spans
 * - Iterations are tracked
 * - Errors are classified
 *
 * @example
 * ```typescript
 * for await (const event of createTracedAgentLoop("Create a mindmap", "canvas_123")) {
 *   if (event.type === "complete") {
 *     console.log("Done:", event.summary);
 *   }
 * }
 * ```
 */
export async function* createTracedAgentLoop(
  task: string,
  canvasId: string,
  options?: TracedAgentOptions
): AsyncGenerator<AgentEvent> {
  const enableTracing = options?.enableTracing ?? true;

  if (!enableTracing) {
    // Pass through without tracing
    yield* runAgenticLoop(task, canvasId, options);
    return;
  }

  // Create or get tracer
  const tracerOptions: TracerOptions = {
    serviceName: "canvas-agent",
    exporters: [
      new ConsoleExporter({ verbose: options?.verbose ?? false }),
    ],
    captureThinking: true,
    captureToolIO: true,
    ...options?.tracerOptions,
  };

  const tracer = options?.useGlobalTracer
    ? getTracer(tracerOptions)
    : new ConversationTracer(tracerOptions);

  // Start trace
  const trace = tracer.startTrace("agent_query", {
    "canvas.id": canvasId,
    "agent.task": task.slice(0, 200),
    "agent.mode": options?.mode || "auto",
    "llm.model": options?.model || "balanced",
    "llm.vendor": options?.provider || "google",
  });

  // Track active tool calls for completion
  const activeToolCalls = new Map<string, ToolCallRecord>();
  let currentIteration = 0;
  let hasStartedLoop = false;
  let hasRecordedUserMessage = false;

  try {
    for await (const event of runAgenticLoop(task, canvasId, options)) {
      // Instrument event based on type
      switch (event.type) {
        // =====================================================================
        // THINKING/CONTEXT
        // =====================================================================
        case "thinking":
          // Record user message on first thinking event
          if (!hasRecordedUserMessage) {
            tracer.recordUserMessage(task);
            hasRecordedUserMessage = true;
          }
          if (event.message) {
            tracer.recordThinking("raw", event.message);
          }
          break;

        case "context":
          tracer.addEvent("context_injection", {
            "context.summary": event.summary,
            "context.tokens": event.tokensUsed,
          });
          break;

        case "reasoning":
          if (event.content) {
            // Parse reasoning content for structured phases
            const content = event.content;
            if (content.includes("<analyze>") || content.includes("<plan>")) {
              // Has structured reasoning tags - extract them
              const analyzeMatch = content.match(/<analyze>([\s\S]*?)<\/analyze>/);
              if (analyzeMatch) tracer.recordThinking("analyze", analyzeMatch[1]);

              const planMatch = content.match(/<plan>([\s\S]*?)<\/plan>/);
              if (planMatch) tracer.recordThinking("plan", planMatch[1]);

              const observeMatch = content.match(/<observe>([\s\S]*?)<\/observe>/);
              if (observeMatch) tracer.recordThinking("observe", observeMatch[1]);

              const decideMatch = content.match(/<decide>([\s\S]*?)<\/decide>/);
              if (decideMatch) tracer.recordThinking("decide", decideMatch[1]);
            } else {
              // Raw reasoning content
              tracer.recordThinking("raw", content);
            }
          }
          break;

        case "plan":
          if (event.steps) {
            const planContent = event.steps
              .map((s, i) => `${i + 1}. ${s.description}${s.tool ? ` (${s.tool})` : ""}`)
              .join("\n");
            tracer.recordThinking("plan", planContent);
          }
          break;

        // =====================================================================
        // TOOL EXECUTION
        // =====================================================================
        case "acting":
          // Start agent loop on first acting event
          if (!hasStartedLoop) {
            hasStartedLoop = true;
            tracer.recordAgentLoopStart(
              options?.mode || "general",
              options?.maxIterations || 10
            );
          }

          // Record tool call start
          if (event.tool) {
            const callId = `${event.tool}_${Date.now()}`;
            const record = tracer.recordToolCall(
              event.tool,
              (event.input as Record<string, unknown>) || {},
              callId
            );
            activeToolCalls.set(callId, record);
            // Store the callId on the event for matching with observing
            (event as unknown as { _traceCallId: string })._traceCallId = callId;
          }
          break;

        case "observing":
          // Complete the tool call from the most recent acting event
          if (event.result) {
            // Find the most recent uncompleted tool call
            const entries = Array.from(activeToolCalls.entries());
            if (entries.length > 0) {
              const [callId, record] = entries[entries.length - 1];
              const success = event.result.success !== false;
              tracer.completeToolCall(
                record,
                event.result,
                success,
                event.result.error as string | undefined
              );
              activeToolCalls.delete(callId);
            }
          }
          break;

        case "step_start":
          tracer.addEvent("tool_call_start", {
            "step.number": event.step,
            "step.description": event.description,
            "tool.name": event.tool,
          });
          break;

        case "step_complete":
          tracer.addEvent("tool_call_end", {
            "step.number": event.step,
            "tool.success": event.result?.success ?? true,
          });
          break;

        case "blocked":
          tracer.recordWarning(`Operation blocked: ${event.reason}`, {
            "blocked.tool": event.tool || "unknown",
          });
          break;

        // =====================================================================
        // DELEGATION
        // =====================================================================
        case "delegating":
          tracer.recordDelegation(event.subagent, event.task);
          break;

        case "delegation_complete":
          tracer.completeDelegation(event.success, event.success ? undefined : "Delegation failed");
          break;

        // =====================================================================
        // CONTEXT MANAGEMENT
        // =====================================================================
        case "context_injected":
          tracer.addEvent("canvas_context", {
            "canvas.element_count": event.canvasState.elementCount,
            "canvas.selection_count": event.canvasState.selection.length,
            "context.tokens": event.tokensUsed,
          });
          break;

        case "task_update":
          tracer.addEvent("custom", {
            "task.total": event.progress.total,
            "task.completed": event.progress.completed,
            "task.in_progress": event.progress.inProgress,
          });
          break;

        case "correction":
          for (const correction of event.corrections) {
            tracer.recordWarning(`Correction: ${correction.message}`, {
              "correction.type": correction.type,
            });
          }
          break;

        // =====================================================================
        // ALIAS RESOLUTION
        // =====================================================================
        case "alias_resolving":
          tracer.addEvent("resource_injection", {
            "alias.count": event.aliases.length,
            "alias.names": event.aliases.join(", "),
          });
          break;

        case "alias_resolved":
          tracer.addEvent("resource_injection", {
            "alias.count": event.aliasCount,
            "alias.tokens": event.totalTokens,
            "alias.errors": event.errors.length,
          });
          break;

        // =====================================================================
        // CHECKPOINTS
        // =====================================================================
        case "checkpoint":
          tracer.addEvent("checkpoint_save", {
            "checkpoint.session_id": event.sessionId,
            "checkpoint.canvas_version": event.canvasVersion,
            "checkpoint.operation_count": event.operationCount,
          });
          break;

        // =====================================================================
        // COMPLETION
        // =====================================================================
        case "complete":
          if (hasStartedLoop) {
            tracer.recordAgentLoopEnd(currentIteration, true);
          }
          tracer.recordAssistantMessage(event.summary || "Task completed");
          tracer.endTurn();
          break;

        case "failed":
          if (hasStartedLoop) {
            tracer.recordAgentLoopEnd(currentIteration, false);
          }
          tracer.recordError(
            event.reason || "Unknown error",
            { "agent.errors": JSON.stringify(event.errors || []) }
          );
          break;

        case "timeout":
          tracer.recordError("Agent timeout", {
            "agent.iteration": event.iterations,
            "agent.max_iterations": event.maxIterations,
          });
          break;

        case "cancelled":
          tracer.recordWarning("Agent cancelled", {
            reason: event.reason,
          });
          break;

        // =====================================================================
        // ERRORS
        // =====================================================================
        case "error":
          if (event.error) {
            tracer.recordError(event.error.message, {
              "error.code": event.error.code,
              "error.recoverable": event.error.recoverable,
            });
          }
          break;

        case "recovery":
          tracer.addEvent("warning", {
            "recovery.attempt": event.attempt,
            "recovery.max_attempts": event.maxAttempts,
            "recovery.strategy": event.strategy,
          });
          break;

        // =====================================================================
        // CLARIFICATION (Human-in-the-loop)
        // =====================================================================
        case "clarification_needed":
          tracer.addEvent("warning", {
            "clarification.id": event.clarificationId,
            "clarification.type": event.clarificationType,
            "clarification.questions": event.questions.join("; "),
          });
          break;
      }

      // Track iteration from events
      if (event.iteration !== undefined) {
        if (event.iteration > currentIteration) {
          currentIteration = event.iteration;
          tracer.recordAgentLoopIteration(currentIteration);
        }
      }

      // Yield the original event
      yield event;
    }

    // End trace successfully
    const completedTrace = await tracer.endTrace("ok");
    if (completedTrace && options?.onTraceComplete) {
      options.onTraceComplete(completedTrace);
    }
  } catch (error) {
    // Record and re-throw
    tracer.recordError(error as Error);
    await tracer.endTrace("error", (error as Error).message);
    throw error;
  }
}

/**
 * Run traced agent and collect all events
 *
 * @example
 * ```typescript
 * const result = await runTracedAgent("Create a flowchart", "canvas_123");
 * console.log("Success:", result.success);
 * console.log("Trace:", result.trace?.summary);
 * ```
 */
export async function runTracedAgent(
  task: string,
  canvasId: string,
  options?: TracedAgentOptions
): Promise<TracedAgentResult> {
  const events: AgentEvent[] = [];
  let trace: Trace | null = null;
  const startTime = Date.now();

  const captureTrace = (t: Trace) => {
    trace = t;
  };

  try {
    for await (const event of createTracedAgentLoop(task, canvasId, {
      ...options,
      onTraceComplete: captureTrace,
    })) {
      events.push(event);
    }

    const failedEvent = events.find((e) => e.type === "failed");
    const success = !failedEvent;
    const error = failedEvent?.type === "failed" ? failedEvent.reason : undefined;

    return {
      events,
      trace,
      success,
      error,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      events,
      trace,
      success: false,
      error: (error as Error).message,
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Create a tracing middleware for agent events
 *
 * This can be used to add tracing to custom agent implementations.
 *
 * @example
 * ```typescript
 * const middleware = createTracingMiddleware();
 *
 * for await (const event of myAgentLoop()) {
 *   middleware.handleEvent(event);
 *   yield event;
 * }
 *
 * const trace = await middleware.finalize();
 * ```
 */
export function createTracingMiddleware(options?: TracerOptions) {
  const tracer = new ConversationTracer({
    serviceName: "canvas-agent",
    exporters: [new ConsoleExporter({ verbose: false })],
    ...options,
  });

  let traceStarted = false;
  const activeToolCalls = new Map<string, ToolCallRecord>();

  return {
    /**
     * Start a new trace
     */
    startTrace(name: string, attributes?: Record<string, string | number | boolean>) {
      tracer.startTrace(name, attributes);
      traceStarted = true;
    },

    /**
     * Handle an agent event
     */
    handleEvent(event: AgentEvent) {
      if (!traceStarted) {
        tracer.startTrace("agent_query");
        traceStarted = true;
      }

      // Similar event handling as createTracedAgentLoop
      switch (event.type) {
        case "acting":
          if (event.tool) {
            const callId = `${event.tool}_${Date.now()}`;
            const record = tracer.recordToolCall(
              event.tool,
              (event.input as Record<string, unknown>) || {},
              callId
            );
            activeToolCalls.set(callId, record);
          }
          break;

        case "observing":
          // Complete the most recent tool call
          if (event.result) {
            const entries = Array.from(activeToolCalls.entries());
            if (entries.length > 0) {
              const [callId, record] = entries[entries.length - 1];
              const success = event.result.success !== false;
              tracer.completeToolCall(
                record,
                event.result,
                success,
                event.result.error as string | undefined
              );
              activeToolCalls.delete(callId);
            }
          }
          break;

        case "error":
          if (event.error) {
            tracer.recordError(event.error.message);
          }
          break;

        case "complete":
          tracer.recordAssistantMessage(event.summary || "Task completed");
          tracer.endTurn();
          break;

        case "failed":
          tracer.recordError(event.reason || "Unknown error");
          break;
      }
    },

    /**
     * Get the tracer instance
     */
    getTracer() {
      return tracer;
    },

    /**
     * Finalize and export the trace
     */
    async finalize(status: "ok" | "error" = "ok") {
      return await tracer.endTrace(status);
    },
  };
}
