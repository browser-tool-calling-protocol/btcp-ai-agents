/**
 * Agent Instrumentation
 *
 * Automatic tracing instrumentation for the AI agent loop.
 * Hooks into agent events to capture the full conversation flow.
 */

import { ConversationTracer, getTracer } from "./tracer.js";
import type {
  Trace,
  Span,
  TracerOptions,
  TokenUsage,
  ToolCallRecord,
} from "./types.js";

// ============================================================================
// INSTRUMENTED WRAPPER TYPES
// ============================================================================

/**
 * Options for instrumented query execution
 */
export interface InstrumentedQueryOptions {
  /** User message/prompt */
  prompt: string;
  /** Canvas ID */
  canvasId?: string;
  /** Model to use */
  model?: string;
  /** Provider */
  provider?: string;
  /** Maximum iterations */
  maxIterations?: number;
  /** User ID for attribution */
  userId?: string;
  /** Session ID */
  sessionId?: string;
  /** Additional trace attributes */
  attributes?: Record<string, string | number | boolean>;
}

/**
 * Result from instrumented execution
 */
export interface InstrumentedResult<T> {
  /** The actual result */
  result: T;
  /** The trace captured during execution */
  trace: Trace | null;
  /** Duration in milliseconds */
  durationMs: number;
}

// ============================================================================
// INSTRUMENTATION CONTEXT
// ============================================================================

/**
 * Context passed through instrumented operations
 */
export interface InstrumentationContext {
  tracer: ConversationTracer;
  trace: Trace;
  activeToolCalls: Map<string, ToolCallRecord>;
}

// Async local storage for context propagation
const contextStorage = new Map<string, InstrumentationContext>();

/**
 * Get or create instrumentation context
 */
export function getInstrumentationContext(traceId?: string): InstrumentationContext | null {
  if (traceId && contextStorage.has(traceId)) {
    return contextStorage.get(traceId)!;
  }
  return null;
}

/**
 * Set instrumentation context
 */
export function setInstrumentationContext(context: InstrumentationContext): void {
  contextStorage.set(context.trace.traceId, context);
}

/**
 * Remove instrumentation context
 */
export function removeInstrumentationContext(traceId: string): void {
  contextStorage.delete(traceId);
}

// ============================================================================
// HOOK HANDLERS
// ============================================================================

/**
 * Handlers for agent events that map to trace operations
 */
export interface AgentEventHandlers {
  onUserMessage?: (content: string, tokenCount?: number) => void;
  onAssistantMessage?: (content: string, tokenCount?: number) => void;
  onThinking?: (type: string, content: string) => void;
  onToolCallStart?: (tool: string, input: Record<string, unknown>, callId?: string) => void;
  onToolCallEnd?: (callId: string, output: unknown, success: boolean, error?: string) => void;
  onLLMRequest?: (model: string, provider: string) => void;
  onLLMResponse?: (finishReason: string, usage: TokenUsage, success: boolean, error?: string) => void;
  onAgentLoopStart?: (mode: string, maxIterations: number) => void;
  onAgentLoopIteration?: (iteration: number) => void;
  onAgentLoopEnd?: (iterations: number, success: boolean) => void;
  onDelegation?: (subagent: string, task: string) => void;
  onDelegationEnd?: (success: boolean, error?: string) => void;
  onError?: (error: Error | string) => void;
  onWarning?: (message: string) => void;
}

/**
 * Create event handlers that route to a tracer
 */
export function createTracingHandlers(tracer: ConversationTracer): AgentEventHandlers {
  const activeToolCalls = new Map<string, ToolCallRecord>();
  let toolCallCounter = 0;

  return {
    onUserMessage: (content, tokenCount) => {
      tracer.recordUserMessage(content, tokenCount);
    },

    onAssistantMessage: (content, tokenCount) => {
      tracer.recordAssistantMessage(content, tokenCount);
      tracer.endTurn();
    },

    onThinking: (type, content) => {
      tracer.recordThinking(type as any, content);
    },

    onToolCallStart: (tool, input, callId) => {
      const id = callId || `call_${++toolCallCounter}`;
      const record = tracer.recordToolCall(tool, input, id);
      activeToolCalls.set(id, record);
    },

    onToolCallEnd: (callId, output, success, error) => {
      const record = activeToolCalls.get(callId);
      if (record) {
        tracer.completeToolCall(record, output, success, error);
        activeToolCalls.delete(callId);
      }
    },

    onLLMRequest: (model, provider) => {
      tracer.recordLLMRequest(model, provider);
    },

    onLLMResponse: (finishReason, usage, success, error) => {
      tracer.completeLLMRequest(finishReason, usage, success, error);
    },

    onAgentLoopStart: (mode, maxIterations) => {
      tracer.recordAgentLoopStart(mode, maxIterations);
    },

    onAgentLoopIteration: (iteration) => {
      tracer.recordAgentLoopIteration(iteration);
    },

    onAgentLoopEnd: (iterations, success) => {
      tracer.recordAgentLoopEnd(iterations, success);
    },

    onDelegation: (subagent, task) => {
      tracer.recordDelegation(subagent, task);
    },

    onDelegationEnd: (success, error) => {
      tracer.completeDelegation(success, error);
    },

    onError: (error) => {
      tracer.recordError(error);
    },

    onWarning: (message) => {
      tracer.recordWarning(message);
    },
  };
}

// ============================================================================
// INSTRUMENTED EXECUTION
// ============================================================================

/**
 * Execute a function with tracing instrumentation
 */
export async function withTracing<T>(
  name: string,
  fn: (tracer: ConversationTracer, handlers: AgentEventHandlers) => Promise<T>,
  options?: TracerOptions & { attributes?: Record<string, string | number | boolean> }
): Promise<InstrumentedResult<T>> {
  const tracer = new ConversationTracer(options);
  const handlers = createTracingHandlers(tracer);

  const trace = tracer.startTrace(name, options?.attributes || {});
  const context: InstrumentationContext = {
    tracer,
    trace,
    activeToolCalls: new Map(),
  };

  setInstrumentationContext(context);

  const startTime = Date.now();
  let result: T;

  try {
    result = await fn(tracer, handlers);
    await tracer.endTrace("ok");
  } catch (error) {
    tracer.recordError(error as Error);
    await tracer.endTrace("error", (error as Error).message);
    throw error;
  } finally {
    removeInstrumentationContext(trace.traceId);
  }

  return {
    result,
    trace: tracer.getTrace(),
    durationMs: Date.now() - startTime,
  };
}

/**
 * Wrap a function to automatically trace its execution
 */
export function traced<T extends (...args: any[]) => Promise<any>>(
  name: string,
  fn: T,
  options?: TracerOptions
): (...args: Parameters<T>) => Promise<InstrumentedResult<Awaited<ReturnType<T>>>> {
  return async (...args: Parameters<T>) => {
    return withTracing(name, async () => fn(...args), options);
  };
}

// ============================================================================
// SPAN DECORATORS
// ============================================================================

/**
 * Decorator to trace a method as a span
 */
export function TraceSpan(name?: string, kind: "internal" | "client" = "internal") {
  return function (
    _target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    const spanName = name || propertyKey;

    descriptor.value = async function (...args: any[]) {
      const tracer = getTracer();
      const span = tracer.startSpan(spanName, kind);

      try {
        const result = await originalMethod.apply(this, args);
        tracer.endSpan("ok");
        return result;
      } catch (error) {
        tracer.endSpan("error", (error as Error).message);
        throw error;
      }
    };

    return descriptor;
  };
}

/**
 * Decorator to trace a method as a tool call
 */
export function TraceToolCall(toolName?: string) {
  return function (
    _target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    const name = toolName || propertyKey;

    descriptor.value = async function (...args: any[]) {
      const tracer = getTracer();
      const record = tracer.recordToolCall(name, { args });

      try {
        const result = await originalMethod.apply(this, args);
        tracer.completeToolCall(record, result, true);
        return result;
      } catch (error) {
        tracer.completeToolCall(record, null, false, (error as Error).message);
        throw error;
      }
    };

    return descriptor;
  };
}

// ============================================================================
// AGENT EVENT ADAPTER
// ============================================================================

/**
 * Convert SDK messages to trace events
 */
export function instrumentSDKMessage(
  handlers: AgentEventHandlers,
  message: {
    type: string;
    eventType?: string;
    [key: string]: unknown;
  }
): void {
  switch (message.type) {
    case "partial":
      switch (message.eventType) {
        case "tool_use_start":
          handlers.onToolCallStart?.(
            message.toolName as string,
            message.toolInput as Record<string, unknown>,
            message.toolCallId as string
          );
          break;

        case "tool_result":
          handlers.onToolCallEnd?.(
            message.toolCallId as string,
            message.toolResult,
            !message.toolError,
            message.toolError as string
          );
          break;

        case "thinking_delta":
          handlers.onThinking?.("raw", message.thinking as string);
          break;

        case "content_delta":
          // Content streaming - might want to aggregate
          break;
      }
      break;

    case "result":
      if (message.success) {
        const usage = message.usage as { totalTokens?: number } | undefined;
        handlers.onAssistantMessage?.(
          (message.summary as string) || "",
          usage?.totalTokens
        );
      } else {
        handlers.onError?.((message.error as string) || "Unknown error");
      }
      break;
  }
}

// ============================================================================
// REASONING TAG EXTRACTOR
// ============================================================================

/**
 * Extract and trace reasoning tags from LLM output
 */
export function traceReasoningTags(
  handlers: AgentEventHandlers,
  text: string
): void {
  const tagPatterns = [
    { type: "analyze", pattern: /<analyze>([\s\S]*?)<\/analyze>/ },
    { type: "plan", pattern: /<plan>([\s\S]*?)<\/plan>/ },
    { type: "assess_clarity", pattern: /<assess_clarity>([\s\S]*?)<\/assess_clarity>/ },
    { type: "observe", pattern: /<observe>([\s\S]*?)<\/observe>/ },
    { type: "decide", pattern: /<decide>([\s\S]*?)<\/decide>/ },
    { type: "summarize", pattern: /<summarize>([\s\S]*?)<\/summarize>/ },
  ];

  for (const { type, pattern } of tagPatterns) {
    const match = text.match(pattern);
    if (match) {
      handlers.onThinking?.(type, match[1].trim());
    }
  }
}
