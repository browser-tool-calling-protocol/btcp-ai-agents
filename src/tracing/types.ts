/**
 * Conversation Tracing Types
 *
 * OpenTelemetry-inspired tracing for AI agent conversations.
 * Captures the full flow: user input → reasoning → tool calls → response.
 */

// ============================================================================
// CORE TRACE TYPES
// ============================================================================

/**
 * Unique identifiers for tracing
 */
export type TraceId = `trace_${string}`;
export type SpanId = `span_${string}`;

/**
 * Span status following OpenTelemetry conventions
 */
export type SpanStatus = "unset" | "ok" | "error";

/**
 * Span kind following OpenTelemetry conventions
 */
export type SpanKind =
  | "internal" // Internal operation
  | "client" // Outgoing request (LLM call, tool call)
  | "server" // Incoming request (user message)
  | "producer" // Message producer
  | "consumer"; // Message consumer

/**
 * Event types that can occur during a conversation
 */
export type TraceEventType =
  // User interaction
  | "user_message"
  | "assistant_message"
  // Reasoning phases
  | "thinking_start"
  | "thinking_content"
  | "thinking_end"
  | "reasoning_analyze"
  | "reasoning_plan"
  | "reasoning_assess_clarity"
  | "reasoning_observe"
  | "reasoning_decide"
  | "reasoning_summarize"
  // Context
  | "context_injection"
  | "skill_injection"
  | "resource_injection"
  | "canvas_context"
  // LLM operations
  | "llm_request_start"
  | "llm_request_end"
  | "llm_stream_start"
  | "llm_stream_chunk"
  | "llm_stream_end"
  | "llm_first_token"
  | "llm_token_usage"
  // Tool operations
  | "tool_call_start"
  | "tool_call_input"
  | "tool_call_output"
  | "tool_call_end"
  | "tool_call_error"
  | "tool_stream_progress"
  // Agent operations
  | "agent_loop_start"
  | "agent_loop_iteration"
  | "agent_loop_end"
  | "delegation_start"
  | "delegation_end"
  // Checkpoint/persistence
  | "checkpoint_save"
  | "checkpoint_restore"
  // Errors
  | "error"
  | "warning"
  // Custom
  | "custom";

// ============================================================================
// SPAN STRUCTURE
// ============================================================================

/**
 * A span represents a single operation within a trace.
 * Spans can be nested to represent parent-child relationships.
 */
export interface Span {
  /** Unique span identifier */
  spanId: SpanId;
  /** Trace this span belongs to */
  traceId: TraceId;
  /** Parent span (if nested) */
  parentSpanId?: SpanId;
  /** Human-readable operation name */
  name: string;
  /** Type of span */
  kind: SpanKind;
  /** Start timestamp (Unix ms) */
  startTime: number;
  /** End timestamp (Unix ms) */
  endTime?: number;
  /** Duration in milliseconds */
  durationMs?: number;
  /** Span status */
  status: SpanStatus;
  /** Status message (for errors) */
  statusMessage?: string;
  /** Span attributes (key-value metadata) */
  attributes: SpanAttributes;
  /** Events that occurred during this span */
  events: SpanEvent[];
  /** Links to other spans */
  links?: SpanLink[];
}

/**
 * Span attributes following semantic conventions
 */
export interface SpanAttributes {
  // General
  "service.name"?: string;
  "service.version"?: string;

  // LLM attributes (following emerging LLM semantic conventions)
  "llm.vendor"?: string;
  "llm.model"?: string;
  "llm.request.type"?: "chat" | "completion" | "embedding";
  "llm.request.max_tokens"?: number;
  "llm.request.temperature"?: number;
  "llm.response.finish_reason"?: string;
  "llm.usage.prompt_tokens"?: number;
  "llm.usage.completion_tokens"?: number;
  "llm.usage.total_tokens"?: number;

  // Tool attributes
  "tool.name"?: string;
  "tool.input"?: string; // JSON string
  "tool.output"?: string; // JSON string
  "tool.success"?: boolean;
  "tool.error"?: string;

  // Agent attributes
  "agent.mode"?: string;
  "agent.iteration"?: number;
  "agent.max_iterations"?: number;
  "agent.subagent"?: string;

  // Canvas attributes
  "canvas.id"?: string;
  "canvas.elements_count"?: number;
  "canvas.operation"?: string;

  // User/session attributes
  "user.id"?: string;
  "session.id"?: string;
  "conversation.turn"?: number;

  // Error attributes
  "error.type"?: string;
  "error.message"?: string;
  "error.stack"?: string;

  // Custom attributes
  [key: string]: string | number | boolean | undefined;
}

/**
 * An event that occurred at a specific point within a span
 */
export interface SpanEvent {
  /** Event name/type */
  name: TraceEventType;
  /** Timestamp (Unix ms) */
  timestamp: number;
  /** Event attributes */
  attributes: Record<string, string | number | boolean | undefined>;
}

/**
 * A link to another span (for async operations)
 */
export interface SpanLink {
  traceId: TraceId;
  spanId: SpanId;
  attributes?: Record<string, string | number | boolean>;
}

// ============================================================================
// TRACE STRUCTURE
// ============================================================================

/**
 * A complete trace representing a conversation or request
 */
export interface Trace {
  /** Unique trace identifier */
  traceId: TraceId;
  /** Root span of the trace */
  rootSpan: Span;
  /** All spans in the trace (flattened) */
  spans: Span[];
  /** Trace start time */
  startTime: number;
  /** Trace end time */
  endTime?: number;
  /** Total duration */
  durationMs?: number;
  /** Trace-level attributes */
  attributes: TraceAttributes;
  /** Summary statistics */
  summary?: TraceSummary;
  /** Conversation turns with messages and reasoning (for debugging) */
  turns?: ConversationTurn[];
  /** Correlation ID for cross-service correlation */
  correlationId?: string;
  /** Parent trace ID for sub-agent traces */
  parentTraceId?: TraceId;
  /** Context propagation baggage */
  baggage?: Record<string, string>;
  /** Errors collected during trace */
  errors?: ErrorDetails[];
}

/**
 * Trace-level attributes
 */
export interface TraceAttributes {
  // Request context
  "request.id"?: string;
  "request.type"?: "chat" | "command" | "workflow";

  // Environment
  "deployment.environment"?: string;
  "service.name"?: string;
  "service.version"?: string;

  // User context
  "user.id"?: string;
  "session.id"?: string;
  "canvas.id"?: string;

  // Model info
  "llm.vendor"?: string;
  "llm.model"?: string;

  // Custom
  [key: string]: string | number | boolean | undefined;
}

/**
 * Summary statistics for a trace
 */
export interface TraceSummary {
  /** Total spans */
  totalSpans: number;
  /** Total LLM calls */
  llmCalls: number;
  /** Total tool calls */
  toolCalls: number;
  /** Total tokens used */
  totalTokens: number;
  /** Prompt tokens */
  promptTokens: number;
  /** Completion tokens */
  completionTokens: number;
  /** Total duration */
  totalDurationMs: number;
  /** LLM latency (cumulative) */
  llmLatencyMs: number;
  /** Tool execution latency (cumulative) */
  toolLatencyMs: number;
  /** Errors encountered */
  errorCount: number;
  /** Warnings encountered */
  warningCount: number;
  /** Estimated total cost in USD */
  estimatedCost?: number;
  /** Cost breakdown */
  costBreakdown?: CostBreakdown;
  /** Tokens per second (throughput) */
  tokensPerSecond?: number;
  /** Time to first token in ms */
  timeToFirstTokenMs?: number;
  /** Model-specific metrics */
  modelMetrics?: ModelMetrics[];
  /** Latency breakdown by category */
  latencyBreakdown?: LatencyBreakdown;
  /** Errors by category */
  errorsByCategory?: Record<ErrorCategory, number>;
}

/**
 * Per-model metrics aggregation
 */
export interface ModelMetrics {
  /** Model ID */
  model: string;
  /** Provider name */
  provider: string;
  /** Number of calls */
  callCount: number;
  /** Total latency in ms */
  totalLatencyMs: number;
  /** Average latency per call */
  avgLatencyMs: number;
  /** Total tokens used */
  totalTokens: number;
  /** Average tokens per second */
  avgTokensPerSecond: number;
  /** Success rate (0-1) */
  successRate: number;
  /** Estimated cost in USD */
  estimatedCost: number;
}

/**
 * Latency breakdown by operation type
 */
export interface LatencyBreakdown {
  /** LLM generation time */
  llmMs: number;
  /** LLM percentage of total */
  llmPercent: number;
  /** Tool execution time */
  toolMs: number;
  /** Tool percentage of total */
  toolPercent: number;
  /** Framework overhead time */
  overheadMs: number;
  /** Overhead percentage of total */
  overheadPercent: number;
  /** Total duration */
  totalMs: number;
}

/**
 * Error category for classification
 */
export type ErrorCategory =
  | "llm_error" // Model API failures (rate limits, invalid requests)
  | "tool_error" // Tool execution failures
  | "mcp_error" // MCP connection/protocol issues
  | "validation_error" // Input validation failures
  | "timeout_error" // Timeouts
  | "rate_limit_error" // Rate limiting
  | "auth_error" // Authentication/authorization
  | "network_error" // Network connectivity
  | "unknown_error"; // Uncategorized

/**
 * Detailed error information
 */
export interface ErrorDetails {
  /** Error category */
  category: ErrorCategory;
  /** Error code */
  code: string;
  /** Human-readable message */
  message: string;
  /** Stack trace (if available) */
  stack?: string;
  /** Whether the error is retryable */
  retryable: boolean;
  /** Suggested retry delay in ms */
  retryDelayMs?: number;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
  /** Timestamp */
  timestamp: number;
}

/**
 * Classify an error into a category
 */
export function classifyError(error: Error | string): ErrorCategory {
  const message =
    typeof error === "string" ? error : error.message.toLowerCase();

  if (message.includes("rate limit") || message.includes("429")) {
    return "rate_limit_error";
  }
  if (message.includes("timeout") || message.includes("timed out")) {
    return "timeout_error";
  }
  if (
    message.includes("unauthorized") ||
    message.includes("forbidden") ||
    message.includes("401") ||
    message.includes("403")
  ) {
    return "auth_error";
  }
  if (
    message.includes("network") ||
    message.includes("econnrefused") ||
    message.includes("enotfound")
  ) {
    return "network_error";
  }
  if (message.includes("mcp") || message.includes("canvas-mcp")) {
    return "mcp_error";
  }
  if (message.includes("validation") || message.includes("invalid")) {
    return "validation_error";
  }
  if (
    message.includes("tool") ||
    message.includes("canvas_") ||
    message.includes("execution")
  ) {
    return "tool_error";
  }
  if (
    message.includes("model") ||
    message.includes("llm") ||
    message.includes("openai") ||
    message.includes("anthropic") ||
    message.includes("gemini")
  ) {
    return "llm_error";
  }

  return "unknown_error";
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(category: ErrorCategory): boolean {
  return ["rate_limit_error", "timeout_error", "network_error"].includes(
    category
  );
}

// ============================================================================
// CONVERSATION-SPECIFIC TYPES
// ============================================================================

/**
 * A single turn in the conversation
 */
export interface ConversationTurn {
  /** Turn number (1-indexed) */
  turn: number;
  /** User message */
  userMessage: MessageRecord;
  /** Assistant response */
  assistantMessage?: MessageRecord;
  /** Thinking/reasoning (if captured) */
  thinking?: ThinkingRecord[];
  /** Tool calls made in this turn */
  toolCalls: ToolCallRecord[];
  /** Token usage for this turn */
  tokenUsage: TokenUsage;
  /** Duration of this turn */
  durationMs: number;
  /** Span for this turn */
  span: Span;
}

/**
 * Record of a message
 */
export interface MessageRecord {
  /** Role */
  role: "user" | "assistant" | "system";
  /** Content */
  content: string;
  /** Timestamp */
  timestamp: number;
  /** Token count (estimated) */
  tokenCount?: number;
}

/**
 * Record of thinking/reasoning
 */
export interface ThinkingRecord {
  /** Reasoning type */
  type: "analyze" | "plan" | "assess_clarity" | "observe" | "decide" | "summarize" | "raw";
  /** Content */
  content: string;
  /** Timestamp */
  timestamp: number;
}

/**
 * Record of a tool call
 */
export interface ToolCallRecord {
  /** Tool name */
  tool: string;
  /** Call ID (from LLM) */
  callId?: string;
  /** Input arguments */
  input: Record<string, unknown>;
  /** Output/result */
  output?: unknown;
  /** Success status */
  success: boolean;
  /** Error message (if failed) */
  error?: string;
  /** Start timestamp */
  startTime: number;
  /** End timestamp */
  endTime: number;
  /** Duration */
  durationMs: number;
  /** Span for this tool call */
  span: Span;
}

/**
 * Token usage breakdown
 */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** Cost estimate in USD */
  estimatedCost?: number;
  /** Cost breakdown by token type */
  costBreakdown?: CostBreakdown;
}

/**
 * Cost breakdown by token type
 */
export interface CostBreakdown {
  /** Cost for prompt tokens in USD */
  promptCost: number;
  /** Cost for completion tokens in USD */
  completionCost: number;
  /** Model used for pricing */
  model: string;
  /** Provider used */
  provider: string;
}

/**
 * Model pricing configuration (per 1K tokens)
 */
export interface ModelPricing {
  /** Cost per 1K prompt tokens */
  promptPer1K: number;
  /** Cost per 1K completion tokens */
  completionPer1K: number;
}

/**
 * Known model pricing (updated January 2025)
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  // OpenAI
  "gpt-4o": { promptPer1K: 0.0025, completionPer1K: 0.01 },
  "gpt-4o-2024-11-20": { promptPer1K: 0.0025, completionPer1K: 0.01 },
  "gpt-4o-mini": { promptPer1K: 0.00015, completionPer1K: 0.0006 },
  "gpt-4-turbo": { promptPer1K: 0.01, completionPer1K: 0.03 },
  "gpt-4": { promptPer1K: 0.03, completionPer1K: 0.06 },
  "gpt-3.5-turbo": { promptPer1K: 0.0005, completionPer1K: 0.0015 },
  // Anthropic
  "claude-3-5-sonnet-20241022": { promptPer1K: 0.003, completionPer1K: 0.015 },
  "claude-3-5-haiku-20241022": { promptPer1K: 0.0008, completionPer1K: 0.004 },
  "claude-3-opus-20240229": { promptPer1K: 0.015, completionPer1K: 0.075 },
  // Google
  "gemini-2.0-pro": { promptPer1K: 0.00125, completionPer1K: 0.005 },
  "gemini-2.0-flash": { promptPer1K: 0.000075, completionPer1K: 0.0003 },
  "gemini-1.5-pro": { promptPer1K: 0.00125, completionPer1K: 0.005 },
  "gemini-1.5-flash": { promptPer1K: 0.000075, completionPer1K: 0.0003 },
};

/**
 * Calculate cost for token usage
 */
export function calculateCost(
  model: string,
  promptTokens: number,
  completionTokens: number
): CostBreakdown | undefined {
  // Try exact match first, then prefix match
  let pricing = MODEL_PRICING[model];
  if (!pricing) {
    // Try to find a matching prefix (e.g., "gpt-4o" matches "gpt-4o-2024-11-20")
    const matchingKey = Object.keys(MODEL_PRICING).find(
      (key) => model.startsWith(key) || key.startsWith(model)
    );
    if (matchingKey) {
      pricing = MODEL_PRICING[matchingKey];
    }
  }

  if (!pricing) {
    return undefined;
  }

  const promptCost = (promptTokens / 1000) * pricing.promptPer1K;
  const completionCost = (completionTokens / 1000) * pricing.completionPer1K;

  // Extract provider from model name
  let provider = "unknown";
  if (model.startsWith("gpt-")) provider = "openai";
  else if (model.startsWith("claude-")) provider = "anthropic";
  else if (model.startsWith("gemini-")) provider = "google";

  return {
    promptCost,
    completionCost,
    model,
    provider,
  };
}

// ============================================================================
// EXPORTER TYPES
// ============================================================================

/**
 * Trace exporter interface
 */
export interface TraceExporter {
  /** Export a complete trace */
  export(trace: Trace): Promise<void>;
  /** Export a span (for streaming) */
  exportSpan(span: Span): Promise<void>;
  /** Flush any buffered data */
  flush(): Promise<void>;
  /** Shutdown the exporter */
  shutdown(): Promise<void>;
}

/**
 * Exporter configuration
 */
export interface ExporterConfig {
  /** Exporter type */
  type: "console" | "jsonl" | "otlp" | "custom";
  /** Endpoint for remote exporters */
  endpoint?: string;
  /** Headers for remote exporters */
  headers?: Record<string, string>;
  /** File path for file exporters */
  filePath?: string;
  /** Batch size for batching exporters */
  batchSize?: number;
  /** Flush interval in ms */
  flushIntervalMs?: number;
}

// ============================================================================
// TRACER OPTIONS
// ============================================================================

/**
 * Options for creating a tracer
 */
export interface TracerOptions {
  /** Service name */
  serviceName?: string;
  /** Service version */
  serviceVersion?: string;
  /** Environment */
  environment?: string;
  /** Exporters to use */
  exporters?: TraceExporter[];
  /** Whether to capture thinking content */
  captureThinking?: boolean;
  /** Whether to capture tool inputs/outputs */
  captureToolIO?: boolean;
  /** Maximum content length to capture (truncate beyond) */
  maxContentLength?: number;
  /** Sampling rate (0-1) */
  samplingRate?: number;
  /** Custom attributes to add to all traces */
  defaultAttributes?: Record<string, string | number | boolean>;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * Generate a trace ID
 */
export function generateTraceId(): TraceId {
  const hex = Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join("");
  return `trace_${hex}` as TraceId;
}

/**
 * Generate a span ID
 */
export function generateSpanId(): SpanId {
  const hex = Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join("");
  return `span_${hex}` as SpanId;
}
