/**
 * AI Agent Tracing
 *
 * OpenTelemetry-inspired tracing for AI agent conversations.
 * Captures the full flow: user input → reasoning → tool calls → response.
 *
 * ## Quick Start
 *
 * ```typescript
 * import { ConversationTracer, ConsoleExporter } from '@waiboard/ai-agents/tracing';
 *
 * // Create tracer with console output
 * const tracer = new ConversationTracer({
 *   serviceName: 'my-agent',
 *   exporters: [new ConsoleExporter({ verbose: true })],
 * });
 *
 * // Start trace
 * tracer.startTrace('chat', { 'user.id': 'user123' });
 *
 * // Record conversation
 * tracer.recordUserMessage('Create a mindmap');
 * tracer.recordThinking('analyze', 'User wants a mindmap...');
 *
 * const toolCall = tracer.recordToolCall('canvas_write', { tree: {...} });
 * tracer.completeToolCall(toolCall, { created: ['elem1'] }, true);
 *
 * tracer.recordAssistantMessage('Created your mindmap!');
 * tracer.endTurn();
 *
 * // End trace
 * await tracer.endTrace();
 * ```
 *
 * ## With Automatic Instrumentation
 *
 * ```typescript
 * import { withTracing, createTracingHandlers } from '@waiboard/ai-agents/tracing';
 *
 * const result = await withTracing('agent-query', async (tracer, handlers) => {
 *   handlers.onUserMessage('Create something');
 *   // ... agent execution with handlers ...
 *   handlers.onAssistantMessage('Done!');
 *   return { success: true };
 * });
 *
 * console.log(result.trace.summary);
 * ```
 *
 * ## Export to Files
 *
 * ```typescript
 * import { JsonLinesExporter, OTLPExporter } from '@waiboard/ai-agents/tracing';
 *
 * const tracer = new ConversationTracer({
 *   exporters: [
 *     new JsonLinesExporter({ filePath: './traces.jsonl' }),
 *     new OTLPExporter({ endpoint: 'http://localhost:4318/v1/traces' }),
 *   ],
 * });
 * ```
 *
 * @module tracing
 */

// Types
export type {
  // Core types
  TraceId,
  SpanId,
  SpanStatus,
  SpanKind,
  TraceEventType,

  // Span types
  Span,
  SpanAttributes,
  SpanEvent,
  SpanLink,

  // Trace types
  Trace,
  TraceAttributes,
  TraceSummary,

  // Conversation types
  ConversationTurn,
  MessageRecord,
  ThinkingRecord,
  ToolCallRecord,
  TokenUsage,

  // Cost tracking types
  CostBreakdown,
  ModelPricing,

  // Metrics types
  ModelMetrics,
  LatencyBreakdown,

  // Error types
  ErrorCategory,
  ErrorDetails,

  // Exporter types
  TraceExporter,
  ExporterConfig,

  // Options
  TracerOptions,
} from "./types.js";

// Type utilities
export {
  generateTraceId,
  generateSpanId,
  // Cost utilities
  calculateCost,
  MODEL_PRICING,
  // Error utilities
  classifyError,
  isRetryableError,
} from "./types.js";

// Tracer
export { ConversationTracer, getTracer, setTracer } from "./tracer.js";

// Exporters
export {
  ConsoleExporter,
  JsonLinesExporter,
  OTLPExporter,
  InMemoryExporter,
  MultiExporter,
  createExporter,
  type ConsoleDisplayMode,
} from "./exporters.js";

// Instrumentation
export {
  type InstrumentedQueryOptions,
  type InstrumentedResult,
  type InstrumentationContext,
  type AgentEventHandlers,
  getInstrumentationContext,
  setInstrumentationContext,
  removeInstrumentationContext,
  createTracingHandlers,
  withTracing,
  traced,
  TraceSpan,
  TraceToolCall,
  instrumentSDKMessage,
  traceReasoningTags,
} from "./instrumentation.js";

// Agent Loop Integration
export {
  type TracedAgentOptions,
  type TracedAgentResult,
  createTracedAgentLoop,
  runTracedAgent,
  createTracingMiddleware,
} from "./agent-integration.js";
