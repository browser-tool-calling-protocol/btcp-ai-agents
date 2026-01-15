/**
 * Conversation Tracer
 *
 * Main tracing class that captures the full conversation flow.
 * Provides a simple API for instrumenting AI agent conversations.
 */

import {
  type Trace,
  type TraceId,
  type Span,
  type SpanId,
  type SpanKind,
  type SpanStatus,
  type SpanAttributes,
  type SpanEvent,
  type TraceEventType,
  type TracerOptions,
  type TraceExporter,
  type TraceSummary,
  type ConversationTurn,
  type MessageRecord,
  type ThinkingRecord,
  type ToolCallRecord,
  type TokenUsage,
  type ModelMetrics,
  type LatencyBreakdown,
  type ErrorCategory,
  type ErrorDetails,
  generateTraceId,
  generateSpanId,
  calculateCost,
  classifyError,
  isRetryableError,
} from "./types.js";

// ============================================================================
// CONVERSATION TRACER
// ============================================================================

/**
 * Main tracer class for capturing AI agent conversations
 */
export class ConversationTracer {
  private options: Required<TracerOptions>;
  private currentTrace: Trace | null = null;
  private spanStack: Span[] = [];
  private turns: ConversationTurn[] = [];
  private currentTurn: Partial<ConversationTurn> | null = null;
  private errors: ErrorDetails[] = [];
  private streamChunkCount: number = 0;
  private firstTokenTime: number | null = null;
  private currentModel: string | null = null;
  private currentProvider: string | null = null;

  constructor(options: TracerOptions = {}) {
    this.options = {
      serviceName: options.serviceName || "ai-agents",
      serviceVersion: options.serviceVersion || "1.0.0",
      environment: options.environment || process.env.NODE_ENV || "development",
      exporters: options.exporters || [],
      captureThinking: options.captureThinking ?? true,
      captureToolIO: options.captureToolIO ?? true,
      maxContentLength: options.maxContentLength ?? 10000,
      samplingRate: options.samplingRate ?? 1.0,
      defaultAttributes: options.defaultAttributes || {},
    };
  }

  // ==========================================================================
  // TRACE LIFECYCLE
  // ==========================================================================

  /**
   * Start a new trace for a conversation
   */
  startTrace(name: string, attributes: SpanAttributes = {}): Trace {
    // Check sampling
    if (Math.random() > this.options.samplingRate) {
      // Create a no-op trace that won't be exported
      return this.createNoOpTrace();
    }

    const traceId = generateTraceId();
    const rootSpan = this.createSpan(traceId, name, "server", undefined, attributes);

    this.currentTrace = {
      traceId,
      rootSpan,
      spans: [rootSpan],
      startTime: rootSpan.startTime,
      attributes: {
        "service.name": this.options.serviceName,
        "service.version": this.options.serviceVersion,
        "deployment.environment": this.options.environment,
        ...this.options.defaultAttributes,
        ...attributes,
      },
    };

    this.spanStack = [rootSpan];
    this.turns = [];
    this.currentTurn = null;
    this.errors = [];
    this.streamChunkCount = 0;
    this.firstTokenTime = null;
    this.currentModel = null;
    this.currentProvider = null;

    return this.currentTrace;
  }

  /**
   * End the current trace
   */
  async endTrace(status: SpanStatus = "ok", statusMessage?: string): Promise<Trace | null> {
    if (!this.currentTrace) return null;

    // End root span
    this.endSpan(status, statusMessage);

    // Calculate summary
    this.currentTrace.summary = this.calculateSummary();
    this.currentTrace.endTime = Date.now();
    this.currentTrace.durationMs = this.currentTrace.endTime - this.currentTrace.startTime;

    // Include turns for conversation debugging
    if (this.turns.length > 0) {
      this.currentTrace.turns = [...this.turns];
    }

    // Export trace
    await this.exportTrace(this.currentTrace);

    const trace = this.currentTrace;
    this.currentTrace = null;
    this.spanStack = [];

    return trace;
  }

  /**
   * Get the current trace
   */
  getTrace(): Trace | null {
    return this.currentTrace;
  }

  /**
   * Get the current trace ID
   */
  getTraceId(): TraceId | null {
    return this.currentTrace?.traceId || null;
  }

  /**
   * Shutdown the tracer and all exporters
   * Call this when the application is shutting down to ensure
   * all pending data is flushed and resources are released.
   */
  async shutdown(): Promise<void> {
    // End any active trace
    if (this.currentTrace) {
      await this.endTrace("ok");
    }

    // Shutdown all exporters
    for (const exporter of this.options.exporters) {
      try {
        await exporter.shutdown();
      } catch (error) {
        console.error(`Failed to shutdown exporter: ${error}`);
      }
    }
  }

  // ==========================================================================
  // SPAN OPERATIONS
  // ==========================================================================

  /**
   * Start a new span
   */
  startSpan(
    name: string,
    kind: SpanKind = "internal",
    attributes: SpanAttributes = {}
  ): Span | null {
    if (!this.currentTrace) return null;

    const parentSpan = this.spanStack[this.spanStack.length - 1];
    const span = this.createSpan(
      this.currentTrace.traceId,
      name,
      kind,
      parentSpan?.spanId,
      attributes
    );

    this.currentTrace.spans.push(span);
    this.spanStack.push(span);

    return span;
  }

  /**
   * End the current span
   */
  endSpan(status: SpanStatus = "ok", statusMessage?: string): Span | null {
    if (this.spanStack.length === 0) return null;

    const span = this.spanStack.pop()!;
    span.endTime = Date.now();
    span.durationMs = span.endTime - span.startTime;
    span.status = status;
    if (statusMessage) span.statusMessage = statusMessage;

    // Export span immediately for streaming
    this.exportSpan(span);

    return span;
  }

  /**
   * Get the current span
   */
  getCurrentSpan(): Span | null {
    return this.spanStack[this.spanStack.length - 1] || null;
  }

  /**
   * Add attributes to the current span
   */
  setAttributes(attributes: SpanAttributes): void {
    const span = this.getCurrentSpan();
    if (span) {
      Object.assign(span.attributes, attributes);
    }
  }

  /**
   * Add an event to the current span
   */
  addEvent(
    name: TraceEventType,
    attributes: Record<string, string | number | boolean | undefined> = {}
  ): void {
    const span = this.getCurrentSpan();
    if (span) {
      span.events.push({
        name,
        timestamp: Date.now(),
        attributes,
      });
    }
  }

  // ==========================================================================
  // CONVERSATION RECORDING
  // ==========================================================================

  /**
   * Record a user message
   */
  recordUserMessage(content: string, tokenCount?: number): void {
    if (!this.currentTrace) return;

    // Start a new turn
    const turnNumber = this.turns.length + 1;
    const span = this.startSpan(`turn_${turnNumber}`, "internal", {
      "conversation.turn": turnNumber,
    });

    this.currentTurn = {
      turn: turnNumber,
      userMessage: {
        role: "user",
        content: this.truncateContent(content),
        timestamp: Date.now(),
        tokenCount,
      },
      thinking: [],
      toolCalls: [],
      tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      durationMs: 0,
      span: span!,
    };

    this.addEvent("user_message", {
      "message.role": "user",
      "message.length": content.length,
      "message.tokens": tokenCount,
    });
  }

  /**
   * Record an assistant message
   */
  recordAssistantMessage(content: string, tokenCount?: number): void {
    if (!this.currentTurn) return;

    this.currentTurn.assistantMessage = {
      role: "assistant",
      content: this.truncateContent(content),
      timestamp: Date.now(),
      tokenCount,
    };

    this.addEvent("assistant_message", {
      "message.role": "assistant",
      "message.length": content.length,
      "message.tokens": tokenCount,
    });
  }

  /**
   * Record thinking/reasoning content
   */
  recordThinking(
    type: ThinkingRecord["type"],
    content: string
  ): void {
    if (!this.currentTurn || !this.options.captureThinking) return;

    this.currentTurn.thinking = this.currentTurn.thinking || [];
    this.currentTurn.thinking.push({
      type,
      content: this.truncateContent(content),
      timestamp: Date.now(),
    });

    const eventName = type === "raw" ? "thinking_content" : `reasoning_${type}`;
    this.addEvent(eventName as TraceEventType, {
      "thinking.type": type,
      "thinking.length": content.length,
    });
  }

  /**
   * Record a tool call
   */
  recordToolCall(
    tool: string,
    input: Record<string, unknown>,
    callId?: string
  ): ToolCallRecord {
    const span = this.startSpan(`tool:${tool}`, "client", {
      "tool.name": tool,
      "tool.input": this.options.captureToolIO
        ? this.truncateContent(JSON.stringify(input))
        : "[redacted]",
    });

    const record: ToolCallRecord = {
      tool,
      callId,
      input,
      success: false,
      startTime: Date.now(),
      endTime: 0,
      durationMs: 0,
      span: span!,
    };

    this.addEvent("tool_call_start", {
      "tool.name": tool,
      "tool.call_id": callId,
    });

    if (this.options.captureToolIO) {
      this.addEvent("tool_call_input", {
        "tool.name": tool,
        "tool.input": this.truncateContent(JSON.stringify(input)),
      });
    }

    return record;
  }

  /**
   * Complete a tool call record
   */
  completeToolCall(
    record: ToolCallRecord,
    output: unknown,
    success: boolean = true,
    error?: string
  ): void {
    record.endTime = Date.now();
    record.durationMs = record.endTime - record.startTime;
    record.output = output;
    record.success = success;
    record.error = error;

    // Update span
    this.setAttributes({
      "tool.success": success,
      "tool.error": error,
      "tool.output": this.options.captureToolIO && success
        ? this.truncateContent(JSON.stringify(output))
        : undefined,
    });

    if (this.options.captureToolIO && success) {
      this.addEvent("tool_call_output", {
        "tool.name": record.tool,
        "tool.output": this.truncateContent(JSON.stringify(output)),
      });
    }

    this.addEvent("tool_call_end", {
      "tool.name": record.tool,
      "tool.success": success,
      "tool.duration_ms": record.durationMs,
      "tool.error": error,
    });

    this.endSpan(success ? "ok" : "error", error);

    // Add to current turn
    if (this.currentTurn) {
      this.currentTurn.toolCalls = this.currentTurn.toolCalls || [];
      this.currentTurn.toolCalls.push(record);
    }
  }

  /**
   * Record token usage
   */
  recordTokenUsage(usage: TokenUsage): void {
    if (!this.currentTurn) return;

    this.currentTurn.tokenUsage = {
      promptTokens: (this.currentTurn.tokenUsage?.promptTokens || 0) + usage.promptTokens,
      completionTokens: (this.currentTurn.tokenUsage?.completionTokens || 0) + usage.completionTokens,
      totalTokens: (this.currentTurn.tokenUsage?.totalTokens || 0) + usage.totalTokens,
    };

    this.setAttributes({
      "llm.usage.prompt_tokens": this.currentTurn.tokenUsage.promptTokens,
      "llm.usage.completion_tokens": this.currentTurn.tokenUsage.completionTokens,
      "llm.usage.total_tokens": this.currentTurn.tokenUsage.totalTokens,
    });

    this.addEvent("llm_token_usage", {
      "llm.usage.prompt_tokens": usage.promptTokens,
      "llm.usage.completion_tokens": usage.completionTokens,
      "llm.usage.total_tokens": usage.totalTokens,
    });
  }

  /**
   * End the current conversation turn
   */
  endTurn(): ConversationTurn | null {
    if (!this.currentTurn || !this.currentTurn.span) return null;

    // End the turn span
    const span = this.currentTurn.span;
    span.endTime = Date.now();
    span.durationMs = span.endTime - span.startTime;
    span.status = "ok";

    this.currentTurn.durationMs = span.durationMs;

    // Pop from span stack if it's still there
    const stackIndex = this.spanStack.indexOf(span);
    if (stackIndex !== -1) {
      this.spanStack.splice(stackIndex, 1);
    }

    const turn = this.currentTurn as ConversationTurn;
    this.turns.push(turn);
    this.currentTurn = null;

    return turn;
  }

  /**
   * Get all recorded turns
   */
  getTurns(): ConversationTurn[] {
    return this.turns;
  }

  // ==========================================================================
  // LLM OPERATIONS
  // ==========================================================================

  /**
   * Record an LLM request
   */
  recordLLMRequest(
    model: string,
    provider: string,
    options: {
      maxTokens?: number;
      temperature?: number;
      requestType?: "chat" | "completion" | "embedding";
    } = {}
  ): Span | null {
    // Track current model/provider for cost calculation
    this.currentModel = model;
    this.currentProvider = provider;

    const span = this.startSpan(`llm:${provider}/${model}`, "client", {
      "llm.vendor": provider,
      "llm.model": model,
      "llm.request.type": options.requestType || "chat",
      "llm.request.max_tokens": options.maxTokens,
      "llm.request.temperature": options.temperature,
    });

    this.addEvent("llm_request_start", {
      "llm.vendor": provider,
      "llm.model": model,
    });

    return span;
  }

  /**
   * Complete an LLM request
   */
  completeLLMRequest(
    finishReason: string,
    usage: TokenUsage,
    success: boolean = true,
    error?: string
  ): void {
    // Calculate cost if we have model info
    if (this.currentModel) {
      const costBreakdown = calculateCost(
        this.currentModel,
        usage.promptTokens,
        usage.completionTokens
      );
      if (costBreakdown) {
        usage.costBreakdown = costBreakdown;
        usage.estimatedCost = costBreakdown.promptCost + costBreakdown.completionCost;
      }
    }

    this.setAttributes({
      "llm.response.finish_reason": finishReason,
      "llm.usage.prompt_tokens": usage.promptTokens,
      "llm.usage.completion_tokens": usage.completionTokens,
      "llm.usage.total_tokens": usage.totalTokens,
    });

    this.addEvent("llm_request_end", {
      "llm.response.finish_reason": finishReason,
      "llm.usage.total_tokens": usage.totalTokens,
      "llm.usage.estimated_cost": usage.estimatedCost,
      success,
      error,
    });

    this.recordTokenUsage(usage);
    this.endSpan(success ? "ok" : "error", error);

    // Reset streaming state
    this.streamChunkCount = 0;
    this.firstTokenTime = null;
  }

  // ==========================================================================
  // STREAMING OPERATIONS
  // ==========================================================================

  /**
   * Record the start of a streaming response
   */
  recordStreamStart(): void {
    this.streamChunkCount = 0;
    this.firstTokenTime = null;

    this.addEvent("llm_stream_start", {
      timestamp: Date.now(),
    });
  }

  /**
   * Record the first token arrival (for TTFT metric)
   */
  recordFirstToken(): void {
    if (this.firstTokenTime === null) {
      this.firstTokenTime = Date.now();
      const currentSpan = this.getCurrentSpan();
      const ttft = currentSpan ? this.firstTokenTime - currentSpan.startTime : 0;

      this.addEvent("llm_first_token", {
        "llm.time_to_first_token_ms": ttft,
      });
    }
  }

  /**
   * Record a streaming chunk
   */
  recordStreamChunk(chunk: string, tokenDelta?: number): void {
    // Record first token on first chunk
    if (this.streamChunkCount === 0) {
      this.recordFirstToken();
    }

    this.streamChunkCount++;

    this.addEvent("llm_stream_chunk", {
      "chunk.index": this.streamChunkCount,
      "chunk.length": chunk.length,
      "chunk.token_delta": tokenDelta,
    });
  }

  /**
   * Record the end of streaming
   */
  recordStreamEnd(totalChunks?: number): void {
    this.addEvent("llm_stream_end", {
      "stream.total_chunks": totalChunks ?? this.streamChunkCount,
    });
  }

  /**
   * Record tool execution progress (for long-running tools)
   */
  recordToolProgress(progress: number, message?: string): void {
    this.addEvent("tool_stream_progress", {
      "tool.progress": progress,
      "tool.progress_message": message,
    });
  }

  // ==========================================================================
  // AGENT LOOP OPERATIONS
  // ==========================================================================

  /**
   * Record agent loop start
   */
  recordAgentLoopStart(mode: string, maxIterations: number): Span | null {
    const span = this.startSpan("agent_loop", "internal", {
      "agent.mode": mode,
      "agent.max_iterations": maxIterations,
    });

    this.addEvent("agent_loop_start", {
      "agent.mode": mode,
      "agent.max_iterations": maxIterations,
    });

    return span;
  }

  /**
   * Record an agent loop iteration
   */
  recordAgentLoopIteration(iteration: number): void {
    this.setAttributes({
      "agent.iteration": iteration,
    });

    this.addEvent("agent_loop_iteration", {
      "agent.iteration": iteration,
    });
  }

  /**
   * Record agent loop end
   */
  recordAgentLoopEnd(iterations: number, success: boolean = true): void {
    this.addEvent("agent_loop_end", {
      "agent.iterations": iterations,
      success,
    });

    this.endSpan(success ? "ok" : "error");
  }

  /**
   * Record a delegation to a sub-agent
   */
  recordDelegation(subagent: string, task: string): Span | null {
    const span = this.startSpan(`delegate:${subagent}`, "internal", {
      "agent.subagent": subagent,
    });

    this.addEvent("delegation_start", {
      "agent.subagent": subagent,
      "delegation.task": this.truncateContent(task),
    });

    return span;
  }

  /**
   * Complete a delegation
   */
  completeDelegation(success: boolean = true, error?: string): void {
    this.addEvent("delegation_end", {
      success,
      error,
    });

    this.endSpan(success ? "ok" : "error", error);
  }

  // ==========================================================================
  // ERROR HANDLING
  // ==========================================================================

  /**
   * Record an error with classification
   */
  recordError(error: Error | string, attributes: SpanAttributes = {}): ErrorDetails {
    const errorMessage = typeof error === "string" ? error : error.message;
    const errorStack = typeof error === "string" ? undefined : error.stack;
    const errorType = typeof error === "string" ? "Error" : error.constructor.name;
    const category = classifyError(error);
    const retryable = isRetryableError(category);

    const errorDetails: ErrorDetails = {
      category,
      code: errorType,
      message: errorMessage,
      stack: errorStack,
      retryable,
      retryDelayMs: retryable ? this.getRetryDelay(category) : undefined,
      timestamp: Date.now(),
      metadata: attributes as Record<string, unknown>,
    };

    // Store for summary
    this.errors.push(errorDetails);

    // Also add to trace if active
    if (this.currentTrace) {
      this.currentTrace.errors = this.currentTrace.errors || [];
      this.currentTrace.errors.push(errorDetails);
    }

    this.setAttributes({
      "error.type": errorType,
      "error.message": errorMessage,
      "error.stack": errorStack,
      "error.category": category,
      "error.retryable": retryable,
      ...attributes,
    });

    this.addEvent("error", {
      "error.type": errorType,
      "error.message": errorMessage,
      "error.category": category,
      "error.retryable": retryable,
    });

    return errorDetails;
  }

  /**
   * Record a warning
   */
  recordWarning(message: string, attributes: Record<string, string | number | boolean> = {}): void {
    this.addEvent("warning", {
      "warning.message": message,
      ...attributes,
    });
  }

  /**
   * Get suggested retry delay based on error category
   */
  private getRetryDelay(category: ErrorCategory): number {
    switch (category) {
      case "rate_limit_error":
        return 60000; // 60 seconds
      case "timeout_error":
        return 5000; // 5 seconds
      case "network_error":
        return 2000; // 2 seconds
      default:
        return 1000;
    }
  }

  /**
   * Get all recorded errors
   */
  getErrors(): ErrorDetails[] {
    return this.errors;
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  private createSpan(
    traceId: TraceId,
    name: string,
    kind: SpanKind,
    parentSpanId?: SpanId,
    attributes: SpanAttributes = {}
  ): Span {
    return {
      spanId: generateSpanId(),
      traceId,
      parentSpanId,
      name,
      kind,
      startTime: Date.now(),
      status: "unset",
      attributes: {
        "service.name": this.options.serviceName,
        ...attributes,
      },
      events: [],
    };
  }

  private createNoOpTrace(): Trace {
    const traceId = generateTraceId();
    const rootSpan = this.createSpan(traceId, "noop", "internal");
    return {
      traceId,
      rootSpan,
      spans: [],
      startTime: Date.now(),
      attributes: {},
    };
  }

  private truncateContent(content: string): string {
    if (content.length <= this.options.maxContentLength) {
      return content;
    }
    return content.slice(0, this.options.maxContentLength) + "...[truncated]";
  }

  private calculateSummary(): TraceSummary {
    let totalTokens = 0;
    let promptTokens = 0;
    let completionTokens = 0;
    let llmLatencyMs = 0;
    let toolLatencyMs = 0;
    let llmCalls = 0;
    let toolCalls = 0;
    let errorCount = 0;
    let warningCount = 0;
    let totalCost = 0;
    let firstTokenTime: number | null = null;

    // Model metrics aggregation
    const modelStats: Map<string, {
      provider: string;
      callCount: number;
      totalLatencyMs: number;
      totalTokens: number;
      successCount: number;
      cost: number;
    }> = new Map();

    // Error categorization
    const errorsByCategory: Record<ErrorCategory, number> = {
      llm_error: 0,
      tool_error: 0,
      mcp_error: 0,
      validation_error: 0,
      timeout_error: 0,
      rate_limit_error: 0,
      auth_error: 0,
      network_error: 0,
      unknown_error: 0,
    };

    for (const span of this.currentTrace?.spans || []) {
      // Count LLM calls and aggregate by model
      if (span.name.startsWith("llm:")) {
        llmCalls++;
        llmLatencyMs += span.durationMs || 0;

        const model = span.attributes["llm.model"] as string | undefined;
        const provider = span.attributes["llm.vendor"] as string | undefined;
        const spanTokens = (span.attributes["llm.usage.total_tokens"] as number) || 0;
        const isSuccess = span.status === "ok";

        if (model) {
          const existing = modelStats.get(model) || {
            provider: provider || "unknown",
            callCount: 0,
            totalLatencyMs: 0,
            totalTokens: 0,
            successCount: 0,
            cost: 0,
          };

          existing.callCount++;
          existing.totalLatencyMs += span.durationMs || 0;
          existing.totalTokens += spanTokens;
          if (isSuccess) existing.successCount++;

          // Calculate cost for this span
          const spanPromptTokens = (span.attributes["llm.usage.prompt_tokens"] as number) || 0;
          const spanCompletionTokens = (span.attributes["llm.usage.completion_tokens"] as number) || 0;
          const costBreakdown = calculateCost(model, spanPromptTokens, spanCompletionTokens);
          if (costBreakdown) {
            const spanCost = costBreakdown.promptCost + costBreakdown.completionCost;
            existing.cost += spanCost;
            totalCost += spanCost;
          }

          modelStats.set(model, existing);
        }

        // Check for first token event
        for (const event of span.events) {
          if (event.name === "llm_first_token" && firstTokenTime === null) {
            firstTokenTime = event.attributes["llm.time_to_first_token_ms"] as number;
          }
        }
      }

      // Count tool calls
      if (span.name.startsWith("tool:")) {
        toolCalls++;
        toolLatencyMs += span.durationMs || 0;
      }

      // Sum tokens
      if (span.attributes["llm.usage.total_tokens"]) {
        totalTokens += span.attributes["llm.usage.total_tokens"] as number;
      }
      if (span.attributes["llm.usage.prompt_tokens"]) {
        promptTokens += span.attributes["llm.usage.prompt_tokens"] as number;
      }
      if (span.attributes["llm.usage.completion_tokens"]) {
        completionTokens += span.attributes["llm.usage.completion_tokens"] as number;
      }

      // Count errors and warnings with categorization
      for (const event of span.events) {
        if (event.name === "error") {
          errorCount++;
          const category = (event.attributes["error.category"] as ErrorCategory) || "unknown_error";
          errorsByCategory[category] = (errorsByCategory[category] || 0) + 1;
        }
        if (event.name === "warning") warningCount++;
      }
    }

    // Calculate latency breakdown
    const totalDurationMs = this.currentTrace?.rootSpan.durationMs || 0;
    const overheadMs = Math.max(0, totalDurationMs - llmLatencyMs - toolLatencyMs);

    const latencyBreakdown: LatencyBreakdown = {
      llmMs: llmLatencyMs,
      llmPercent: totalDurationMs > 0 ? (llmLatencyMs / totalDurationMs) * 100 : 0,
      toolMs: toolLatencyMs,
      toolPercent: totalDurationMs > 0 ? (toolLatencyMs / totalDurationMs) * 100 : 0,
      overheadMs,
      overheadPercent: totalDurationMs > 0 ? (overheadMs / totalDurationMs) * 100 : 0,
      totalMs: totalDurationMs,
    };

    // Build model metrics array
    const modelMetrics: ModelMetrics[] = Array.from(modelStats.entries()).map(
      ([model, stats]) => ({
        model,
        provider: stats.provider,
        callCount: stats.callCount,
        totalLatencyMs: stats.totalLatencyMs,
        avgLatencyMs: stats.callCount > 0 ? stats.totalLatencyMs / stats.callCount : 0,
        totalTokens: stats.totalTokens,
        avgTokensPerSecond:
          stats.totalLatencyMs > 0
            ? (stats.totalTokens / stats.totalLatencyMs) * 1000
            : 0,
        successRate: stats.callCount > 0 ? stats.successCount / stats.callCount : 0,
        estimatedCost: stats.cost,
      })
    );

    // Calculate overall tokens per second
    const tokensPerSecond = totalDurationMs > 0 ? (totalTokens / totalDurationMs) * 1000 : 0;

    // Calculate cost breakdown
    const costBreakdown = this.currentModel
      ? calculateCost(this.currentModel, promptTokens, completionTokens)
      : undefined;

    return {
      totalSpans: this.currentTrace?.spans.length || 0,
      llmCalls,
      toolCalls,
      totalTokens,
      promptTokens,
      completionTokens,
      totalDurationMs,
      llmLatencyMs,
      toolLatencyMs,
      errorCount,
      warningCount,
      estimatedCost: totalCost > 0 ? totalCost : undefined,
      costBreakdown,
      tokensPerSecond,
      timeToFirstTokenMs: firstTokenTime ?? undefined,
      modelMetrics: modelMetrics.length > 0 ? modelMetrics : undefined,
      latencyBreakdown,
      errorsByCategory: errorCount > 0 ? errorsByCategory : undefined,
    };
  }

  private async exportTrace(trace: Trace): Promise<void> {
    for (const exporter of this.options.exporters) {
      try {
        await exporter.export(trace);
      } catch (error) {
        console.error(`Failed to export trace: ${error}`);
      }
    }
  }

  private async exportSpan(span: Span): Promise<void> {
    for (const exporter of this.options.exporters) {
      try {
        await exporter.exportSpan(span);
      } catch (error) {
        console.error(`Failed to export span: ${error}`);
      }
    }
  }
}

// ============================================================================
// GLOBAL TRACER
// ============================================================================

let globalTracer: ConversationTracer | null = null;

/**
 * Get or create the global tracer instance
 */
export function getTracer(options?: TracerOptions): ConversationTracer {
  if (!globalTracer || options) {
    globalTracer = new ConversationTracer(options);
  }
  return globalTracer;
}

/**
 * Set the global tracer instance
 */
export function setTracer(tracer: ConversationTracer): void {
  globalTracer = tracer;
}
