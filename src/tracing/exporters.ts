/**
 * Trace Exporters
 *
 * Export traces to various destinations:
 * - Console (for debugging)
 * - JSON Lines (for file storage)
 * - OpenTelemetry Protocol (OTLP) (for observability platforms)
 */

import { promises as fs } from "node:fs";
import { dirname } from "node:path";
import type {
  Trace,
  Span,
  TraceExporter,
  ExporterConfig,
  SpanEvent,
  TraceSummary,
  LatencyBreakdown,
  ModelMetrics,
  ErrorCategory,
  ConversationTurn,
  ThinkingRecord,
  ToolCallRecord,
} from "./types.js";

// ============================================================================
// CONSOLE EXPORTER
// ============================================================================

/**
 * Console exporter display mode
 * - "summary": Quick stats, latency, errors (default)
 * - "debug": Full conversation flow with reasoning and tool details
 * - "minimal": Just span hierarchy
 */
export type ConsoleDisplayMode = "summary" | "debug" | "minimal";

/**
 * Exports traces to console with enhanced formatting
 * - Hierarchical span visualization
 * - Latency breakdown bar chart
 * - Cost tracking
 * - Model metrics
 * - Conversation flow with reasoning (debug mode)
 */
export class ConsoleExporter implements TraceExporter {
  private verbose: boolean;
  private colorize: boolean;
  private showLatencyChart: boolean;
  private showModelMetrics: boolean;
  private showConversation: boolean;
  private showReasoning: boolean;
  private showToolDetails: boolean;
  private mode: ConsoleDisplayMode;
  private maxContentLength: number;

  constructor(options: {
    verbose?: boolean;
    colorize?: boolean;
    showLatencyChart?: boolean;
    showModelMetrics?: boolean;
    /** Show conversation messages (user/assistant) */
    showConversation?: boolean;
    /** Show reasoning/thinking content */
    showReasoning?: boolean;
    /** Show tool call inputs and outputs */
    showToolDetails?: boolean;
    /** Display mode: "summary" (default), "debug", or "minimal" */
    mode?: ConsoleDisplayMode;
    /** Max content length before truncation (default 500) */
    maxContentLength?: number;
  } = {}) {
    this.mode = options.mode ?? "summary";
    this.verbose = options.verbose ?? (this.mode === "debug");
    this.colorize = options.colorize ?? true;
    this.showLatencyChart = options.showLatencyChart ?? (this.mode !== "minimal");
    this.showModelMetrics = options.showModelMetrics ?? (this.mode === "summary");
    // Debug mode defaults: show conversation, reasoning, and tool details
    this.showConversation = options.showConversation ?? (this.mode === "debug");
    this.showReasoning = options.showReasoning ?? (this.mode === "debug");
    this.showToolDetails = options.showToolDetails ?? (this.mode === "debug");
    this.maxContentLength = options.maxContentLength ?? 500;
  }

  async export(trace: Trace): Promise<void> {
    const summary = trace.summary;

    // DEBUG MODE: Focus only on REASONING FLOW
    if (this.mode === "debug") {
      // Minimal header
      console.log("\n" + this.c("═".repeat(80), "magenta"));
      console.log(this.c("  REASONING FLOW", "bold") + this.c(` │ ${trace.turns?.length || 0} turns │ ${this.formatDuration(trace.durationMs || 0)}`, "dim"));
      console.log(this.c("═".repeat(80), "magenta"));

      // Show REASONING FLOW (the main content for debugging)
      if (trace.turns && trace.turns.length > 0) {
        this.printReasoningFlow(trace);
      } else {
        console.log("\n  " + this.c("No conversation turns recorded", "dim"));
      }

      // Minimal footer with key stats only
      if (summary) {
        console.log("\n" + this.c("─".repeat(80), "dim"));
        const stats = [
          `${summary.llmCalls} LLM calls`,
          `${summary.toolCalls} tools`,
          `${summary.totalTokens} tokens`,
          summary.errorCount > 0 ? this.c(`${summary.errorCount} errors`, "red") : null,
          summary.warningCount > 0 ? this.c(`${summary.warningCount} warnings`, "yellow") : null,
        ].filter(Boolean).join(" │ ");
        console.log("  " + this.c(stats, "dim"));
      }

      console.log(this.c("═".repeat(80), "magenta") + "\n");
      return;
    }

    // SUMMARY/MINIMAL MODE: Original behavior
    console.log("\n" + this.c("═".repeat(80), "dim"));
    console.log(this.c("  TRACE SUMMARY", "bold") + this.c(`: ${trace.traceId.slice(0, 20)}...`, "cyan"));
    console.log(this.c("═".repeat(80), "dim"));

    // Quick stats line (always show unless minimal)
    if (this.mode !== "minimal") {
      this.printQuickStats(trace, summary);
    }

    if (summary && this.mode !== "minimal") {
      // Latency breakdown chart
      if (this.showLatencyChart && summary.latencyBreakdown) {
        this.printLatencyBreakdown(summary.latencyBreakdown);
      }

      // Performance metrics (only in summary mode)
      if (this.mode === "summary") {
        this.printPerformanceMetrics(summary);
      }

      // Model metrics
      if (this.showModelMetrics && summary.modelMetrics && summary.modelMetrics.length > 0) {
        this.printModelMetrics(summary.modelMetrics);
      }

      // Error summary
      if (summary.errorCount > 0 && summary.errorsByCategory) {
        this.printErrorSummary(summary.errorsByCategory, summary.errorCount);
      }
    }

    // Span hierarchy (for non-debug modes)
    if (this.verbose) {
      this.printSpanHierarchy(trace);
    }

    console.log(this.c("═".repeat(80), "dim") + "\n");
  }

  private printQuickStats(trace: Trace, summary?: TraceSummary): void {
    const duration = this.formatDuration(trace.durationMs || 0);
    const spans = trace.spans.length;
    const tokens = summary?.totalTokens.toLocaleString() || "0";
    const cost = summary?.estimatedCost
      ? `$${summary.estimatedCost.toFixed(4)}`
      : "N/A";

    console.log("");
    console.log(`  ${this.c("⏱️", "yellow")}  Duration    │ ${this.c(duration, "yellow")}`);
    console.log(`  ${this.c("🔢", "cyan")}  Spans       │ ${spans} (${summary?.llmCalls || 0} LLM, ${summary?.toolCalls || 0} tool)`);
    console.log(`  ${this.c("🪙", "cyan")}  Tokens      │ ${tokens} (${summary?.promptTokens || 0} in → ${summary?.completionTokens || 0} out)`);
    console.log(`  ${this.c("💰", "green")}  Est. Cost   │ ${this.c(cost, "green")}`);

    if (summary?.tokensPerSecond) {
      console.log(`  ${this.c("⚡", "yellow")}  Throughput  │ ${summary.tokensPerSecond.toFixed(0)} tokens/sec`);
    }
    if (summary?.timeToFirstTokenMs) {
      console.log(`  ${this.c("🚀", "cyan")}  TTFT        │ ${summary.timeToFirstTokenMs}ms`);
    }
  }

  private printLatencyBreakdown(breakdown: LatencyBreakdown): void {
    console.log("\n" + this.c("─".repeat(80), "dim"));
    console.log("  LATENCY BREAKDOWN");
    console.log(this.c("─".repeat(80), "dim"));

    const barWidth = 30;

    // LLM bar
    const llmBar = this.makeBar(breakdown.llmPercent, barWidth, "cyan");
    console.log(`  LLM       │ ${llmBar} ${breakdown.llmPercent.toFixed(0)}% (${this.formatDuration(breakdown.llmMs)})`);

    // Tool bar
    const toolBar = this.makeBar(breakdown.toolPercent, barWidth, "green");
    console.log(`  Tools     │ ${toolBar} ${breakdown.toolPercent.toFixed(0)}% (${this.formatDuration(breakdown.toolMs)})`);

    // Overhead bar
    const overheadBar = this.makeBar(breakdown.overheadPercent, barWidth, "dim");
    console.log(`  Overhead  │ ${overheadBar} ${breakdown.overheadPercent.toFixed(0)}% (${this.formatDuration(breakdown.overheadMs)})`);

    console.log(`            │ ${"─".repeat(barWidth + 15)}`);
    console.log(`  Total     │ ${this.c(this.formatDuration(breakdown.totalMs), "bold")}`);
  }

  private makeBar(percent: number, width: number, color: string): string {
    const filled = Math.round((percent / 100) * width);
    const empty = width - filled;
    const bar = this.c("█".repeat(filled), color) + this.c("░".repeat(empty), "dim");
    return bar;
  }

  private printPerformanceMetrics(summary: TraceSummary): void {
    console.log("\n" + this.c("─".repeat(80), "dim"));
    console.log("  OPERATIONS");
    console.log(this.c("─".repeat(80), "dim"));

    console.log(`  LLM Calls    │ ${summary.llmCalls} calls, ${this.formatDuration(summary.llmLatencyMs)} total`);
    console.log(`  Tool Calls   │ ${summary.toolCalls} calls, ${this.formatDuration(summary.toolLatencyMs)} total`);

    if (summary.llmCalls > 0) {
      const avgLlm = summary.llmLatencyMs / summary.llmCalls;
      console.log(`  Avg LLM      │ ${this.formatDuration(avgLlm)}/call`);
    }
    if (summary.toolCalls > 0) {
      const avgTool = summary.toolLatencyMs / summary.toolCalls;
      console.log(`  Avg Tool     │ ${this.formatDuration(avgTool)}/call`);
    }
  }

  private printModelMetrics(metrics: ModelMetrics[]): void {
    console.log("\n" + this.c("─".repeat(80), "dim"));
    console.log("  MODEL METRICS");
    console.log(this.c("─".repeat(80), "dim"));

    for (const m of metrics) {
      const successPct = (m.successRate * 100).toFixed(0);
      const cost = m.estimatedCost > 0 ? `$${m.estimatedCost.toFixed(4)}` : "N/A";

      console.log(`  ${this.c(m.model, "cyan")} (${m.provider})`);
      console.log(`    Calls: ${m.callCount} │ Success: ${successPct}% │ Cost: ${cost}`);
      console.log(`    Latency: ${this.formatDuration(m.avgLatencyMs)}/call │ ${m.avgTokensPerSecond.toFixed(0)} tok/s`);
    }
  }

  private printErrorSummary(errorsByCategory: Record<ErrorCategory, number>, total: number): void {
    console.log("\n" + this.c("─".repeat(80), "dim"));
    console.log(`  ${this.c("ERRORS", "red")} (${total} total)`);
    console.log(this.c("─".repeat(80), "dim"));

    const categories = Object.entries(errorsByCategory)
      .filter(([_, count]) => count > 0)
      .sort((a, b) => b[1] - a[1]);

    for (const [category, count] of categories) {
      const label = category.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      console.log(`  ${this.c("•", "red")} ${label}: ${count}`);
    }
  }

  // ==========================================================================
  // CONVERSATION DEBUGGING
  // ==========================================================================

  /**
   * Print the conversation flow with messages and reasoning
   */
  private printConversationFlow(turns: ConversationTurn[]): void {
    console.log("\n" + this.c("─".repeat(80), "cyan"));
    console.log("  " + this.c("CONVERSATION FLOW", "bold"));
    console.log(this.c("─".repeat(80), "cyan"));

    for (const turn of turns) {
      this.printTurn(turn);
    }
  }

  /**
   * Print a single conversation turn
   */
  private printTurn(turn: ConversationTurn): void {
    const turnLabel = this.c(`Turn ${turn.turn}`, "bold");
    const durationLabel = this.c(`(${this.formatDuration(turn.durationMs)})`, "dim");
    console.log(`\n  ┌─ ${turnLabel} ${durationLabel}`);

    // User message
    if (turn.userMessage) {
      console.log("  │");
      console.log(`  │  ${this.c("👤 USER", "cyan")}`);
      this.printWrappedContent(turn.userMessage.content, "  │    ");
    }

    // Thinking/Reasoning
    if (this.showReasoning && turn.thinking && turn.thinking.length > 0) {
      console.log("  │");
      console.log(`  │  ${this.c("🧠 REASONING", "magenta")}`);
      for (const thought of turn.thinking) {
        this.printThinkingRecord(thought);
      }
    }

    // Tool calls
    if (turn.toolCalls && turn.toolCalls.length > 0) {
      console.log("  │");
      console.log(`  │  ${this.c("🔧 TOOL CALLS", "green")} (${turn.toolCalls.length})`);
      for (const toolCall of turn.toolCalls) {
        this.printToolCall(toolCall);
      }
    }

    // Assistant response
    if (turn.assistantMessage) {
      console.log("  │");
      console.log(`  │  ${this.c("🤖 ASSISTANT", "yellow")}`);
      this.printWrappedContent(turn.assistantMessage.content, "  │    ");
    }

    // Token usage for this turn
    if (turn.tokenUsage && turn.tokenUsage.totalTokens > 0) {
      console.log("  │");
      console.log(`  │  ${this.c("tokens:", "dim")} ${turn.tokenUsage.promptTokens} in → ${turn.tokenUsage.completionTokens} out`);
    }

    console.log("  └─");
  }

  /**
   * Print a thinking/reasoning record
   */
  private printThinkingRecord(thought: ThinkingRecord): void {
    const typeIcons: Record<string, string> = {
      analyze: "🔍",
      plan: "📋",
      observe: "👁️",
      decide: "⚡",
      assess_clarity: "❓",
      summarize: "📝",
      raw: "💭",
    };
    const icon = typeIcons[thought.type] || "💭";
    const typeLabel = this.c(`[${thought.type}]`, "magenta");
    console.log(`  │    ${icon} ${typeLabel}`);
    this.printWrappedContent(thought.content, "  │      ", this.maxContentLength);
  }

  /**
   * Print a tool call with input/output
   */
  private printToolCall(toolCall: ToolCallRecord): void {
    const statusIcon = toolCall.success ? this.c("✓", "green") : this.c("✗", "red");
    const toolName = this.c(toolCall.tool, "green");
    const duration = this.c(`(${this.formatDuration(toolCall.durationMs)})`, "dim");

    console.log(`  │    ${statusIcon} ${toolName} ${duration}`);

    if (this.showToolDetails) {
      // Input
      if (toolCall.input && Object.keys(toolCall.input).length > 0) {
        const inputStr = JSON.stringify(toolCall.input, null, 2);
        console.log(`  │      ${this.c("input:", "dim")}`);
        this.printWrappedContent(inputStr, "  │        ", this.maxContentLength);
      }

      // Output
      if (toolCall.output !== undefined) {
        const outputStr = typeof toolCall.output === "string"
          ? toolCall.output
          : JSON.stringify(toolCall.output, null, 2);
        console.log(`  │      ${this.c("output:", "dim")}`);
        this.printWrappedContent(outputStr, "  │        ", this.maxContentLength);
      }

      // Error
      if (toolCall.error) {
        console.log(`  │      ${this.c("error:", "red")} ${toolCall.error}`);
      }
    }
  }

  /**
   * Print agent events in chronological order
   */
  private printAgentEvents(trace: Trace): void {
    // Collect all events from all spans
    const allEvents: Array<{ event: SpanEvent; spanName: string; timestamp: number }> = [];

    for (const span of trace.spans) {
      for (const event of span.events) {
        // Filter to show only interesting events for debugging
        if (this.isDebugRelevantEvent(event.name)) {
          allEvents.push({
            event,
            spanName: span.name,
            timestamp: event.timestamp,
          });
        }
      }
    }

    // Sort by timestamp
    allEvents.sort((a, b) => a.timestamp - b.timestamp);

    if (allEvents.length === 0) return;

    console.log("\n" + this.c("─".repeat(80), "dim"));
    console.log("  " + this.c("AGENT ACTIVITY TIMELINE", "bold"));
    console.log(this.c("─".repeat(80), "dim"));

    const startTime = trace.startTime;

    for (const { event, spanName } of allEvents) {
      const relativeTime = event.timestamp - startTime;
      const timeStr = this.c(`+${this.formatDuration(relativeTime)}`, "dim");
      const eventIcon = this.getEventIcon(event.name);
      const eventLabel = this.formatEventName(event.name);

      console.log(`  ${timeStr.padEnd(15)} ${eventIcon} ${eventLabel}`);

      // Print relevant attributes
      this.printEventDetails(event, spanName);
    }
  }

  /**
   * Check if an event is relevant for debugging
   */
  private isDebugRelevantEvent(eventName: string): boolean {
    const relevantEvents = [
      "user_message",
      "assistant_message",
      "thinking_content",
      "reasoning_analyze",
      "reasoning_plan",
      "reasoning_observe",
      "reasoning_decide",
      "reasoning_summarize",
      "tool_call_start",
      "tool_call_end",
      "tool_call_error",
      "llm_request_start",
      "llm_request_end",
      "llm_first_token",
      "agent_loop_start",
      "agent_loop_iteration",
      "agent_loop_end",
      "delegation_start",
      "delegation_end",
      "error",
      "warning",
    ];
    return relevantEvents.includes(eventName);
  }

  /**
   * Get icon for event type
   */
  private getEventIcon(eventName: string): string {
    const icons: Record<string, string> = {
      user_message: "👤",
      assistant_message: "🤖",
      thinking_content: "💭",
      reasoning_analyze: "🔍",
      reasoning_plan: "📋",
      reasoning_observe: "👁️",
      reasoning_decide: "⚡",
      reasoning_summarize: "📝",
      tool_call_start: "🔧",
      tool_call_end: "✓",
      tool_call_error: "✗",
      llm_request_start: "📤",
      llm_request_end: "📥",
      llm_first_token: "⚡",
      agent_loop_start: "🔄",
      agent_loop_iteration: "→",
      agent_loop_end: "✓",
      delegation_start: "📋",
      delegation_end: "✓",
      error: "❌",
      warning: "⚠️",
    };
    return icons[eventName] || "•";
  }

  /**
   * Format event name for display
   */
  private formatEventName(eventName: string): string {
    const labels: Record<string, string> = {
      user_message: this.c("User message", "cyan"),
      assistant_message: this.c("Assistant response", "yellow"),
      thinking_content: this.c("Thinking", "magenta"),
      reasoning_analyze: this.c("Analyzing", "magenta"),
      reasoning_plan: this.c("Planning", "magenta"),
      reasoning_observe: this.c("Observing", "magenta"),
      reasoning_decide: this.c("Deciding", "magenta"),
      reasoning_summarize: this.c("Summarizing", "magenta"),
      tool_call_start: this.c("Tool call started", "green"),
      tool_call_end: this.c("Tool call completed", "green"),
      tool_call_error: this.c("Tool call failed", "red"),
      llm_request_start: this.c("LLM request started", "cyan"),
      llm_request_end: this.c("LLM response received", "cyan"),
      llm_first_token: this.c("First token", "yellow"),
      agent_loop_start: this.c("Agent loop started", "bold"),
      agent_loop_iteration: this.c("Loop iteration", "dim"),
      agent_loop_end: this.c("Agent loop completed", "bold"),
      delegation_start: this.c("Delegation started", "cyan"),
      delegation_end: this.c("Delegation completed", "cyan"),
      error: this.c("ERROR", "red"),
      warning: this.c("WARNING", "yellow"),
    };
    return labels[eventName] || eventName;
  }

  /**
   * Print event-specific details
   */
  private printEventDetails(event: SpanEvent, spanName: string): void {
    const attrs = event.attributes;
    const indent = "                  ";

    switch (event.name) {
      case "user_message":
        if (attrs["message.length"]) {
          console.log(`${indent}${this.c(`(${attrs["message.length"]} chars)`, "dim")}`);
        }
        break;

      case "tool_call_start":
        if (attrs["tool.name"]) {
          console.log(`${indent}${this.c("tool:", "dim")} ${attrs["tool.name"]}`);
        }
        break;

      case "tool_call_end":
        if (attrs["tool.duration_ms"]) {
          const status = attrs["tool.success"] ? this.c("success", "green") : this.c("failed", "red");
          console.log(`${indent}${status} ${this.c(`in ${attrs["tool.duration_ms"]}ms`, "dim")}`);
        }
        break;

      case "llm_request_start":
        if (attrs["llm.model"]) {
          console.log(`${indent}${this.c("model:", "dim")} ${attrs["llm.model"]}`);
        }
        break;

      case "llm_request_end":
        if (attrs["llm.usage.total_tokens"]) {
          console.log(`${indent}${this.c("tokens:", "dim")} ${attrs["llm.usage.total_tokens"]}`);
        }
        break;

      case "llm_first_token":
        if (attrs["llm.time_to_first_token_ms"]) {
          console.log(`${indent}${this.c("TTFT:", "dim")} ${attrs["llm.time_to_first_token_ms"]}ms`);
        }
        break;

      case "agent_loop_iteration":
        if (attrs["agent.iteration"]) {
          console.log(`${indent}${this.c("iteration:", "dim")} ${attrs["agent.iteration"]}`);
        }
        break;

      case "error":
        if (attrs["error.message"]) {
          console.log(`${indent}${this.c(String(attrs["error.message"]), "red")}`);
        }
        break;

      case "warning":
        if (attrs["warning.message"]) {
          console.log(`${indent}${this.c(String(attrs["warning.message"]), "yellow")}`);
        }
        break;
    }
  }

  /**
   * Print content wrapped to fit console width
   */
  private printWrappedContent(content: string, prefix: string, maxLength?: number): void {
    let displayContent = content;

    // Truncate if needed
    if (maxLength && displayContent.length > maxLength) {
      displayContent = displayContent.slice(0, maxLength) + this.c("...[truncated]", "dim");
    }

    // Split by newlines and print each line
    const lines = displayContent.split("\n");
    for (const line of lines) {
      // Wrap long lines
      const maxLineLength = 70;
      if (line.length > maxLineLength) {
        for (let i = 0; i < line.length; i += maxLineLength) {
          console.log(`${prefix}${line.slice(i, i + maxLineLength)}`);
        }
      } else {
        console.log(`${prefix}${line}`);
      }
    }
  }

  private printSpanHierarchy(trace: Trace): void {
    // In debug mode with turns, show reasoning flow instead of span hierarchy
    if (this.mode === "debug" && trace.turns && trace.turns.length > 0) {
      this.printReasoningFlow(trace);
      return;
    }

    console.log("\n" + this.c("─".repeat(80), "dim"));
    console.log("  SPAN HIERARCHY");
    console.log(this.c("─".repeat(80), "dim"));

    // Build parent-child map
    const childrenMap = new Map<string | undefined, Span[]>();
    for (const span of trace.spans) {
      const parentId = span.parentSpanId;
      if (!childrenMap.has(parentId)) {
        childrenMap.set(parentId, []);
      }
      childrenMap.get(parentId)!.push(span);
    }

    // Print tree starting from root
    const rootSpans = childrenMap.get(undefined) || [];
    for (let i = 0; i < rootSpans.length; i++) {
      const isLast = i === rootSpans.length - 1;
      this.printSpanTree(rootSpans[i], childrenMap, "", isLast, trace.turns);
    }
  }

  /**
   * Print reasoning flow - the main debugging view for conversation history
   * Shows: User → Assistant (Reasoning, Tools, Response) for each turn
   */
  private printReasoningFlow(trace: Trace): void {
    const turns = trace.turns || [];

    for (let i = 0; i < turns.length; i++) {
      const turn = turns[i];
      const isLast = i === turns.length - 1;
      const turnConnector = isLast ? "└─" : "├─";
      const turnPrefix = isLast ? "  " : "│ ";

      // Turn header
      console.log(`  ${turnConnector} ${this.c(`Turn ${turn.turn}`, "bold")} ${this.c(`(${this.formatDuration(turn.durationMs)})`, "dim")}`);

      // User message
      if (turn.userMessage) {
        console.log(`  ${turnPrefix} │`);
        console.log(`  ${turnPrefix} ├─ ${this.c("👤 User:", "cyan")} ${this.truncateText(turn.userMessage.content, 60)}`);
      }

      // Assistant section (contains Reasoning, Tools, and Response)
      const hasReasoning = turn.thinking && turn.thinking.length > 0;
      const hasTools = turn.toolCalls && turn.toolCalls.length > 0;
      const hasResponse = turn.assistantMessage;

      if (hasReasoning || hasTools || hasResponse) {
        console.log(`  ${turnPrefix} │`);
        console.log(`  ${turnPrefix} └─ ${this.c("🤖 Assistant:", "yellow")}`);

        // Reasoning (under Assistant)
        if (hasReasoning && turn.thinking) {
          const reasoningIsLast = !hasTools && !hasResponse;
          const reasoningConnector = reasoningIsLast ? "└─" : "├─";
          const reasoningPrefix = reasoningIsLast ? "   " : "│  ";

          console.log(`  ${turnPrefix}    ${reasoningConnector} ${this.c("🧠 Reasoning:", "magenta")}`);

          for (let j = 0; j < turn.thinking.length; j++) {
            const thought = turn.thinking[j];
            const thoughtIsLast = j === turn.thinking.length - 1;
            const thoughtConnector = thoughtIsLast ? "└─" : "├─";
            const thoughtPrefix = thoughtIsLast ? "   " : "│  ";

            const icons: Record<string, string> = {
              analyze: "🔍", plan: "📋", observe: "👁️",
              decide: "⚡", assess_clarity: "❓", summarize: "📝", raw: "💭"
            };
            const icon = icons[thought.type] || "💭";

            console.log(`  ${turnPrefix}    ${reasoningPrefix} ${thoughtConnector} ${icon} ${this.c(`[${thought.type}]`, "magenta")}`);

            // Show reasoning content (truncated)
            const contentLines = thought.content.split("\n").slice(0, 3);
            for (const line of contentLines) {
              console.log(`  ${turnPrefix}    ${reasoningPrefix} ${thoughtPrefix}   ${this.c(this.truncateText(line, 50), "dim")}`);
            }
            if (thought.content.split("\n").length > 3) {
              console.log(`  ${turnPrefix}    ${reasoningPrefix} ${thoughtPrefix}   ${this.c("...", "dim")}`);
            }
          }
        }

        // Tools (under Assistant)
        if (hasTools && turn.toolCalls) {
          const toolsIsLast = !hasResponse;
          const toolsConnector = toolsIsLast ? "└─" : "├─";
          const toolsPrefix = toolsIsLast ? "   " : "│  ";

          console.log(`  ${turnPrefix}    ${toolsConnector} ${this.c("🔧 Tools:", "green")}`);

          for (let j = 0; j < turn.toolCalls.length; j++) {
            const tc = turn.toolCalls[j];
            const tcIsLast = j === turn.toolCalls.length - 1;
            const tcConnector = tcIsLast ? "└─" : "├─";
            const tcPrefix = tcIsLast ? "   " : "│  ";

            const statusIcon = tc.success ? this.c("✓", "green") : this.c("✗", "red");
            console.log(`  ${turnPrefix}    ${toolsPrefix} ${tcConnector} ${statusIcon} ${this.c(tc.tool, "green")} ${this.c(`(${this.formatDuration(tc.durationMs)})`, "dim")}`);

            // Show tool input summary
            if (tc.input && this.showToolDetails) {
              const inputSummary = this.summarizeObject(tc.input, 50);
              console.log(`  ${turnPrefix}    ${toolsPrefix} ${tcPrefix}   ${this.c("→", "dim")} ${this.c(inputSummary, "dim")}`);
            }

            // Show tool output summary or error
            if (tc.error) {
              console.log(`  ${turnPrefix}    ${toolsPrefix} ${tcPrefix}   ${this.c("✗", "red")} ${this.c(tc.error, "red")}`);
            } else if (tc.output && this.showToolDetails) {
              const outputSummary = this.summarizeObject(tc.output, 50);
              console.log(`  ${turnPrefix}    ${toolsPrefix} ${tcPrefix}   ${this.c("←", "dim")} ${this.c(outputSummary, "dim")}`);
            }
          }
        }

        // Response (under Assistant)
        if (hasResponse && turn.assistantMessage) {
          console.log(`  ${turnPrefix}    └─ ${this.c("💬 Response:", "yellow")} ${this.truncateText(turn.assistantMessage.content, 50)}`);
        }
      }

      // Spacing between turns
      if (!isLast) {
        console.log(`  │`);
      }
    }
  }

  /**
   * Truncate text with ellipsis
   */
  private truncateText(text: string, maxLen: number): string {
    const singleLine = text.replace(/\n/g, " ").trim();
    if (singleLine.length <= maxLen) return singleLine;
    return singleLine.slice(0, maxLen - 3) + "...";
  }

  /**
   * Summarize an object for display
   */
  private summarizeObject(obj: unknown, maxLen: number): string {
    if (obj === null || obj === undefined) return "null";
    if (typeof obj === "string") return this.truncateText(obj, maxLen);
    if (Array.isArray(obj)) {
      if (obj.length === 0) return "[]";
      return `[${obj.length} items]`;
    }
    if (typeof obj === "object") {
      const keys = Object.keys(obj);
      if (keys.length === 0) return "{}";
      const preview = keys.slice(0, 2).join(", ");
      return `{${preview}${keys.length > 2 ? ", ..." : ""}}`;
    }
    return String(obj).slice(0, maxLen);
  }

  private printSpanTree(
    span: Span,
    childrenMap: Map<string | undefined, Span[]>,
    prefix: string,
    isLast: boolean,
    turns?: ConversationTurn[]
  ): void {
    const connector = isLast ? "└── " : "├── ";
    const childPrefix = isLast ? "    " : "│   ";

    // Status icon
    const status =
      span.status === "ok"
        ? this.c("✓", "green")
        : span.status === "error"
          ? this.c("✗", "red")
          : this.c("○", "yellow");

    // Duration
    const duration =
      span.durationMs !== undefined
        ? this.c(` (${this.formatDuration(span.durationMs)})`, "dim")
        : "";

    // Name with highlight for important spans
    let name = span.name;
    if (span.name.startsWith("llm:")) {
      name = this.c(span.name, "cyan");
    } else if (span.name.startsWith("tool:")) {
      name = this.c(span.name, "green");
    } else {
      name = this.c(span.name, "bold");
    }

    console.log(`  ${prefix}${connector}${status} ${name}${duration}`);

    // Print key attributes
    const attrPrefix = `  ${prefix}${childPrefix}`;

    // For turn spans, show user message preview
    if (span.name.startsWith("turn_") && turns) {
      const turnNum = parseInt(span.name.replace("turn_", ""));
      const turn = turns.find(t => t.turn === turnNum);
      if (turn?.userMessage) {
        const preview = this.truncateText(turn.userMessage.content, 50);
        console.log(`${attrPrefix}${this.c("👤", "cyan")} ${this.c(preview, "dim")}`);
      }
      // Show reasoning summary
      if (turn?.thinking && turn.thinking.length > 0) {
        const phases = turn.thinking.map(t => t.type).join(" → ");
        console.log(`${attrPrefix}${this.c("🧠", "magenta")} ${this.c(phases, "dim")}`);
      }
    }

    // For LLM spans
    if (span.attributes["llm.model"]) {
      const model = span.attributes["llm.model"];
      const tokens = span.attributes["llm.usage.total_tokens"] || 0;
      console.log(`${attrPrefix}${this.c(`model: ${model}, tokens: ${tokens}`, "dim")}`);
    }

    // For tool spans, show input/output preview
    if (span.name.startsWith("tool:") && this.showToolDetails) {
      if (span.attributes["tool.input"]) {
        const inputPreview = this.truncateText(String(span.attributes["tool.input"]), 40);
        console.log(`${attrPrefix}${this.c("→", "dim")} ${this.c(inputPreview, "dim")}`);
      }
    }

    if (span.statusMessage) {
      console.log(`${attrPrefix}${this.c(span.statusMessage, "red")}`);
    }

    // Print children
    const children = childrenMap.get(span.spanId) || [];
    for (let i = 0; i < children.length; i++) {
      const childIsLast = i === children.length - 1;
      this.printSpanTree(children[i], childrenMap, prefix + childPrefix, childIsLast, turns);
    }
  }

  async exportSpan(span: Span): Promise<void> {
    if (!this.verbose) return;

    const status =
      span.status === "ok"
        ? this.c("✓", "green")
        : span.status === "error"
          ? this.c("✗", "red")
          : this.c("○", "yellow");

    const duration =
      span.durationMs !== undefined
        ? ` (${this.formatDuration(span.durationMs)})`
        : "";

    console.log(`${status} ${span.name}${duration}`);
  }

  async flush(): Promise<void> {
    // Console doesn't need flushing
  }

  async shutdown(): Promise<void> {
    // Nothing to clean up
  }

  private shouldPrintEvent(event: SpanEvent): boolean {
    // Skip verbose events unless in verbose mode
    const verboseEvents = ["llm_stream_chunk", "thinking_content"];
    return !verboseEvents.includes(event.name);
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
    return `${(ms / 60000).toFixed(2)}m`;
  }

  private c(text: string, color: string): string {
    if (!this.colorize) return text;

    const colors: Record<string, string> = {
      bold: "\x1b[1m",
      dim: "\x1b[2m",
      red: "\x1b[31m",
      green: "\x1b[32m",
      yellow: "\x1b[33m",
      cyan: "\x1b[36m",
      magenta: "\x1b[35m",
      reset: "\x1b[0m",
    };

    return `${colors[color] || ""}${text}${colors.reset}`;
  }
}

// ============================================================================
// JSON LINES EXPORTER
// ============================================================================

/**
 * Exports traces to a JSON Lines file
 * Each line is a complete JSON object (trace or span)
 */
export class JsonLinesExporter implements TraceExporter {
  private filePath: string;
  private buffer: string[] = [];
  private bufferSize: number;
  private flushIntervalMs: number;
  private flushTimer: NodeJS.Timeout | null = null;
  private includeSpans: boolean;

  constructor(config: {
    filePath: string;
    bufferSize?: number;
    flushIntervalMs?: number;
    includeSpans?: boolean;
  }) {
    this.filePath = config.filePath;
    this.bufferSize = config.bufferSize ?? 100;
    this.flushIntervalMs = config.flushIntervalMs ?? 5000;
    this.includeSpans = config.includeSpans ?? true;

    // Start flush timer
    this.startFlushTimer();
  }

  async export(trace: Trace): Promise<void> {
    const record = {
      type: "trace",
      timestamp: new Date().toISOString(),
      ...trace,
    };

    this.buffer.push(JSON.stringify(record));

    if (this.buffer.length >= this.bufferSize) {
      await this.flush();
    }
  }

  async exportSpan(span: Span): Promise<void> {
    if (!this.includeSpans) return;

    const record = {
      type: "span",
      timestamp: new Date().toISOString(),
      ...span,
    };

    this.buffer.push(JSON.stringify(record));

    if (this.buffer.length >= this.bufferSize) {
      await this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const lines = this.buffer.join("\n") + "\n";
    this.buffer = [];

    // Ensure directory exists
    await fs.mkdir(dirname(this.filePath), { recursive: true }).catch(() => {});

    // Append to file
    await fs.appendFile(this.filePath, lines, "utf-8");
  }

  async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flush().catch(console.error);
    }, this.flushIntervalMs);
  }
}

// ============================================================================
// OTLP EXPORTER
// ============================================================================

/**
 * Exports traces to an OpenTelemetry Protocol (OTLP) endpoint
 */
export class OTLPExporter implements TraceExporter {
  private endpoint: string;
  private headers: Record<string, string>;
  private buffer: Trace[] = [];
  private bufferSize: number;
  private flushIntervalMs: number;
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(config: {
    endpoint: string;
    headers?: Record<string, string>;
    bufferSize?: number;
    flushIntervalMs?: number;
  }) {
    this.endpoint = config.endpoint;
    this.headers = config.headers || {};
    this.bufferSize = config.bufferSize ?? 10;
    this.flushIntervalMs = config.flushIntervalMs ?? 5000;

    this.startFlushTimer();
  }

  async export(trace: Trace): Promise<void> {
    this.buffer.push(trace);

    if (this.buffer.length >= this.bufferSize) {
      await this.flush();
    }
  }

  async exportSpan(_span: Span): Promise<void> {
    // OTLP batches spans within traces, so we don't export individual spans
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const traces = this.buffer;
    this.buffer = [];

    const payload = this.convertToOTLP(traces);

    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...this.headers,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`OTLP export failed: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error("OTLP export error:", error);
      // Re-add traces to buffer for retry
      this.buffer.unshift(...traces);
    }
  }

  async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flush().catch(console.error);
    }, this.flushIntervalMs);
  }

  /**
   * Convert traces to OTLP format
   */
  private convertToOTLP(traces: Trace[]): unknown {
    return {
      resourceSpans: traces.map((trace) => ({
        resource: {
          attributes: this.convertAttributes(trace.attributes),
        },
        scopeSpans: [
          {
            scope: {
              name: "ai-agents",
              version: "1.0.0",
            },
            spans: trace.spans.map((span) => this.convertSpan(span)),
          },
        ],
      })),
    };
  }

  private convertSpan(span: Span): unknown {
    return {
      traceId: span.traceId.replace("trace_", ""),
      spanId: span.spanId.replace("span_", ""),
      parentSpanId: span.parentSpanId?.replace("span_", ""),
      name: span.name,
      kind: this.convertSpanKind(span.kind),
      startTimeUnixNano: span.startTime * 1_000_000,
      endTimeUnixNano: (span.endTime || span.startTime) * 1_000_000,
      attributes: this.convertAttributes(span.attributes),
      events: span.events.map((event) => ({
        timeUnixNano: event.timestamp * 1_000_000,
        name: event.name,
        attributes: this.convertAttributes(event.attributes),
      })),
      status: {
        code: span.status === "ok" ? 1 : span.status === "error" ? 2 : 0,
        message: span.statusMessage,
      },
    };
  }

  private convertSpanKind(kind: string): number {
    const kinds: Record<string, number> = {
      internal: 1,
      server: 2,
      client: 3,
      producer: 4,
      consumer: 5,
    };
    return kinds[kind] || 1;
  }

  private convertAttributes(
    attrs: Record<string, string | number | boolean | undefined>
  ): Array<{ key: string; value: unknown }> {
    return Object.entries(attrs)
      .filter(([_, v]) => v !== undefined)
      .map(([key, value]) => ({
        key,
        value: this.convertValue(value),
      }));
  }

  private convertValue(value: string | number | boolean | undefined): unknown {
    if (typeof value === "string") return { stringValue: value };
    if (typeof value === "number") {
      if (Number.isInteger(value)) return { intValue: value };
      return { doubleValue: value };
    }
    if (typeof value === "boolean") return { boolValue: value };
    return { stringValue: String(value) };
  }
}

// ============================================================================
// IN-MEMORY EXPORTER (for testing)
// ============================================================================

/**
 * Stores traces in memory for testing
 */
export class InMemoryExporter implements TraceExporter {
  private traces: Trace[] = [];
  private spans: Span[] = [];

  async export(trace: Trace): Promise<void> {
    this.traces.push(trace);
  }

  async exportSpan(span: Span): Promise<void> {
    this.spans.push(span);
  }

  async flush(): Promise<void> {
    // Nothing to flush
  }

  async shutdown(): Promise<void> {
    // Nothing to clean up
  }

  getTraces(): Trace[] {
    return this.traces;
  }

  getSpans(): Span[] {
    return this.spans;
  }

  clear(): void {
    this.traces = [];
    this.spans = [];
  }
}

// ============================================================================
// MULTI EXPORTER
// ============================================================================

/**
 * Exports to multiple destinations
 */
export class MultiExporter implements TraceExporter {
  private exporters: TraceExporter[];

  constructor(exporters: TraceExporter[]) {
    this.exporters = exporters;
  }

  async export(trace: Trace): Promise<void> {
    await Promise.all(this.exporters.map((e) => e.export(trace)));
  }

  async exportSpan(span: Span): Promise<void> {
    await Promise.all(this.exporters.map((e) => e.exportSpan(span)));
  }

  async flush(): Promise<void> {
    await Promise.all(this.exporters.map((e) => e.flush()));
  }

  async shutdown(): Promise<void> {
    await Promise.all(this.exporters.map((e) => e.shutdown()));
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create an exporter from configuration
 */
export function createExporter(config: ExporterConfig): TraceExporter {
  switch (config.type) {
    case "console":
      return new ConsoleExporter({ verbose: true });

    case "jsonl":
      if (!config.filePath) {
        throw new Error("filePath required for jsonl exporter");
      }
      return new JsonLinesExporter({
        filePath: config.filePath,
        bufferSize: config.batchSize,
        flushIntervalMs: config.flushIntervalMs,
      });

    case "otlp":
      if (!config.endpoint) {
        throw new Error("endpoint required for otlp exporter");
      }
      return new OTLPExporter({
        endpoint: config.endpoint,
        headers: config.headers,
        bufferSize: config.batchSize,
        flushIntervalMs: config.flushIntervalMs,
      });

    default:
      throw new Error(`Unknown exporter type: ${config.type}`);
  }
}
