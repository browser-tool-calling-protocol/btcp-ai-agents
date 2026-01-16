/**
 * Benchmark Debug Logger
 *
 * Provides persistent file-based logging for benchmark runs to enable
 * debugging of reasoning processes and tool calls.
 *
 * Implements the unified LogReporter interface from core/log-reporter.ts
 * for compatibility with the agentic loop tracing system.
 */

import { writeFileSync, appendFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import type {
  DebugLogEntry,
  DebugLogSummary,
  DebugLogLevel,
  AgentEventRecord,
  ToolCallRecord,
} from "./types.js";
import type {
  LogReporter,
  LogEntry,
  LogLevel,
  LogEntryType,
} from "../agent-sdk/core/log-reporter.js";

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_LOG_DIR = ".benchmark-results/logs";
// No truncation - show full content for debugging
const MAX_REASONING_LENGTH = Infinity;
const MAX_TOOL_RESULT_LENGTH = Infinity;

// ============================================================================
// DEBUG LOGGER CLASS
// ============================================================================

/**
 * BenchmarkDebugLogger - Writes detailed debug logs to file during benchmark runs
 *
 * Usage:
 * ```typescript
 * const logger = new BenchmarkDebugLogger(runId, scenarioId);
 * logger.logEvent(event);
 * logger.logToolCall(toolCall);
 * logger.logReasoning("analyze", "Analyzing the user request...");
 * const summary = logger.finalize();
 * ```
 */
export class BenchmarkDebugLogger {
  private readonly runId: string;
  private readonly scenarioId: string;
  private readonly logPath: string;
  private readonly startTime: Date;

  private stepNumber = 0;
  private totalTokens = 0;
  private lastTokenCount = 0;
  private errorCount = 0;
  private entryCount = 0;
  private initialized = false;

  constructor(
    runId: string,
    scenarioId: string,
    options: { logDir?: string } = {}
  ) {
    this.runId = runId;
    this.scenarioId = scenarioId;
    this.startTime = new Date();

    const logDir = options.logDir || DEFAULT_LOG_DIR;
    this.logPath = join(logDir, `debug-${runId}-${scenarioId}.log`);

    this.ensureLogDirectory(logDir);
  }

  /**
   * Ensure the log directory exists
   */
  private ensureLogDirectory(logDir: string): void {
    try {
      if (!existsSync(logDir)) {
        mkdirSync(logDir, { recursive: true });
      }
    } catch (error) {
      console.warn(`[DebugLogger] Failed to create log directory: ${error}`);
    }
  }

  /**
   * Initialize the log file with header
   */
  private initialize(): void {
    if (this.initialized) return;

    const header = {
      type: "header",
      runId: this.runId,
      scenarioId: this.scenarioId,
      startTime: this.startTime.toISOString(),
      version: "1.0",
    };

    try {
      writeFileSync(this.logPath, JSON.stringify(header) + "\n");
      this.initialized = true;
    } catch (error) {
      console.warn(`[DebugLogger] Failed to initialize log file: ${error}`);
    }
  }

  /**
   * Write a log entry to file
   */
  private writeEntry(entry: DebugLogEntry): void {
    if (!this.initialized) {
      this.initialize();
    }

    try {
      appendFileSync(this.logPath, JSON.stringify(entry) + "\n");
      this.entryCount++;
    } catch (error) {
      console.warn(`[DebugLogger] Failed to write log entry: ${error}`);
    }
  }

  /**
   * Log an agent event
   */
  logEvent(event: AgentEventRecord, tokenCount?: number): void {
    this.stepNumber++;

    const tokenDelta = tokenCount !== undefined ? tokenCount - this.lastTokenCount : undefined;
    if (tokenCount !== undefined) {
      this.totalTokens = tokenCount;
      this.lastTokenCount = tokenCount;
    }

    const entry: DebugLogEntry = {
      timestamp: new Date().toISOString(),
      level: this.getLogLevel(event.type),
      eventType: event.type,
      scenarioId: this.scenarioId,
      runId: this.runId,
      stepNumber: this.stepNumber,
      tool: event.tool,
      reasoning: event.content ? this.truncate(event.content, MAX_REASONING_LENGTH) : undefined,
      tokenCount,
      tokenDelta,
      metadata: event.data,
    };

    if (event.type === "error" || event.type === "failed") {
      this.errorCount++;
      entry.error = event.content || "Unknown error";
    }

    this.writeEntry(entry);
  }

  /**
   * Log a tool call with full details
   */
  logToolCall(
    toolCall: ToolCallRecord,
    stepNumber?: number,
    tokenCount?: number
  ): void {
    if (stepNumber !== undefined) {
      this.stepNumber = stepNumber;
    } else {
      this.stepNumber++;
    }

    const tokenDelta = tokenCount !== undefined ? tokenCount - this.lastTokenCount : undefined;
    if (tokenCount !== undefined) {
      this.totalTokens = tokenCount;
      this.lastTokenCount = tokenCount;
    }

    const entry: DebugLogEntry = {
      timestamp: new Date().toISOString(),
      level: toolCall.error ? "error" : "info",
      eventType: "tool_call",
      scenarioId: this.scenarioId,
      runId: this.runId,
      stepNumber: this.stepNumber,
      tool: toolCall.tool,
      toolArgs: toolCall.args,
      toolResult: toolCall.result
        ? this.truncate(JSON.stringify(toolCall.result), MAX_TOOL_RESULT_LENGTH)
        : undefined,
      durationMs: toolCall.duration,
      tokenCount,
      tokenDelta,
      error: toolCall.error,
    };

    if (toolCall.error) {
      this.errorCount++;
    }

    this.writeEntry(entry);
  }

  /**
   * Log a reasoning step
   */
  logReasoning(
    stepType: string,
    content: string,
    tokenCount?: number
  ): void {
    this.stepNumber++;

    const tokenDelta = tokenCount !== undefined ? tokenCount - this.lastTokenCount : undefined;
    if (tokenCount !== undefined) {
      this.totalTokens = tokenCount;
      this.lastTokenCount = tokenCount;
    }

    const entry: DebugLogEntry = {
      timestamp: new Date().toISOString(),
      level: "debug",
      eventType: `reasoning_${stepType}`,
      scenarioId: this.scenarioId,
      runId: this.runId,
      stepNumber: this.stepNumber,
      reasoning: this.truncate(content, MAX_REASONING_LENGTH),
      tokenCount,
      tokenDelta,
    };

    this.writeEntry(entry);
  }

  /**
   * Log a custom message
   */
  log(
    level: DebugLogLevel,
    message: string,
    metadata?: Record<string, unknown>
  ): void {
    const entry: DebugLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      eventType: "custom",
      scenarioId: this.scenarioId,
      runId: this.runId,
      stepNumber: this.stepNumber,
      reasoning: message,
      metadata,
    };

    if (level === "error") {
      this.errorCount++;
      entry.error = message;
    }

    this.writeEntry(entry);
  }

  /**
   * Log efficiency metrics
   */
  logEfficiency(metrics: {
    stepEfficiencyRatio?: number;
    tokenEfficiencyRatio?: number;
    redundantCallCount?: number;
    pathDeviationScore?: number;
  }): void {
    const entry: DebugLogEntry = {
      timestamp: new Date().toISOString(),
      level: "info",
      eventType: "efficiency_metrics",
      scenarioId: this.scenarioId,
      runId: this.runId,
      stepNumber: this.stepNumber,
      metadata: {
        stepEfficiencyRatio: metrics.stepEfficiencyRatio,
        tokenEfficiencyRatio: metrics.tokenEfficiencyRatio,
        redundantCallCount: metrics.redundantCallCount,
        pathDeviationScore: metrics.pathDeviationScore,
      },
    };

    this.writeEntry(entry);
  }

  /**
   * Finalize the log and return summary
   */
  finalize(): DebugLogSummary {
    const endTime = new Date();
    const totalDurationMs = endTime.getTime() - this.startTime.getTime();

    const footer = {
      type: "footer",
      endTime: endTime.toISOString(),
      totalDurationMs,
      totalSteps: this.stepNumber,
      totalTokens: this.totalTokens,
      errorCount: this.errorCount,
      entryCount: this.entryCount,
    };

    try {
      appendFileSync(this.logPath, JSON.stringify(footer) + "\n");
    } catch (error) {
      console.warn(`[DebugLogger] Failed to write footer: ${error}`);
    }

    return {
      runId: this.runId,
      scenarioId: this.scenarioId,
      logPath: this.logPath,
      entryCount: this.entryCount,
      totalSteps: this.stepNumber,
      totalTokens: this.totalTokens,
      totalDurationMs,
      errorCount: this.errorCount,
      startTime: this.startTime.toISOString(),
      endTime: endTime.toISOString(),
    };
  }

  /**
   * Get the log file path
   */
  getLogPath(): string {
    return this.logPath;
  }

  /**
   * Determine log level based on event type
   */
  private getLogLevel(eventType: string): DebugLogLevel {
    switch (eventType) {
      case "error":
      case "failed":
        return "error";
      case "blocked":
      case "timeout":
        return "warn";
      case "thinking":
      case "reasoning":
      case "plan":
        return "debug";
      case "tool_use":
      case "acting":
      case "observing":
        return "info";
      default:
        return "trace";
    }
  }

  /**
   * Truncate string to max length
   */
  private truncate(str: string, maxLength: number): string {
    if (str.length <= maxLength) return str;
    return str.slice(0, maxLength - 3) + "...";
  }
}

// ============================================================================
// LOG READER UTILITIES
// ============================================================================

/**
 * Read and parse a debug log file
 */
export function readDebugLog(logPath: string): {
  header: Record<string, unknown> | null;
  entries: DebugLogEntry[];
  footer: Record<string, unknown> | null;
} {
  const result: {
    header: Record<string, unknown> | null;
    entries: DebugLogEntry[];
    footer: Record<string, unknown> | null;
  } = {
    header: null,
    entries: [],
    footer: null,
  };

  try {
    const content = readFileSync(logPath, "utf-8");
    const lines = content.trim().split("\n");

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.type === "header") {
          result.header = parsed;
        } else if (parsed.type === "footer") {
          result.footer = parsed;
        } else {
          result.entries.push(parsed as DebugLogEntry);
        }
      } catch {
        // Skip malformed lines
      }
    }
  } catch (error) {
    console.warn(`[DebugLogger] Failed to read log file: ${error}`);
  }

  return result;
}

/**
 * Filter log entries by criteria
 */
export function filterLogEntries(
  entries: DebugLogEntry[],
  filter: {
    level?: DebugLogLevel | DebugLogLevel[];
    eventType?: string | string[];
    tool?: string;
    hasError?: boolean;
    stepRange?: { min?: number; max?: number };
  }
): DebugLogEntry[] {
  return entries.filter((entry) => {
    // Level filter
    if (filter.level) {
      const levels = Array.isArray(filter.level) ? filter.level : [filter.level];
      if (!levels.includes(entry.level)) return false;
    }

    // Event type filter
    if (filter.eventType) {
      const types = Array.isArray(filter.eventType) ? filter.eventType : [filter.eventType];
      if (!types.includes(entry.eventType)) return false;
    }

    // Tool filter
    if (filter.tool && entry.tool !== filter.tool) return false;

    // Error filter
    if (filter.hasError !== undefined) {
      const hasError = !!entry.error;
      if (hasError !== filter.hasError) return false;
    }

    // Step range filter
    if (filter.stepRange) {
      if (filter.stepRange.min !== undefined && entry.stepNumber < filter.stepRange.min) {
        return false;
      }
      if (filter.stepRange.max !== undefined && entry.stepNumber > filter.stepRange.max) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Generate a human-readable report from log entries
 */
export function generateDebugReport(
  entries: DebugLogEntry[],
  summary: DebugLogSummary
): string {
  const lines: string[] = [];

  lines.push("═".repeat(80));
  lines.push("  BENCHMARK DEBUG REPORT");
  lines.push("═".repeat(80));
  lines.push("");
  lines.push(`Run ID:      ${summary.runId}`);
  lines.push(`Scenario:    ${summary.scenarioId}`);
  lines.push(`Log File:    ${summary.logPath}`);
  lines.push(`Duration:    ${(summary.totalDurationMs / 1000).toFixed(2)}s`);
  lines.push(`Total Steps: ${summary.totalSteps}`);
  lines.push(`Total Tokens: ${summary.totalTokens}`);
  lines.push(`Errors:      ${summary.errorCount}`);
  lines.push("");
  lines.push("─".repeat(80));
  lines.push("  EXECUTION TIMELINE");
  lines.push("─".repeat(80));
  lines.push("");

  for (const entry of entries) {
    const levelIcon = getLevelIcon(entry.level);
    const time = entry.timestamp.split("T")[1].split(".")[0];

    let line = `${levelIcon} [${time}] Step ${entry.stepNumber}: ${entry.eventType}`;

    if (entry.tool) {
      line += ` (${entry.tool})`;
    }

    if (entry.tokenDelta && entry.tokenDelta > 0) {
      line += ` +${entry.tokenDelta} tokens`;
    }

    if (entry.durationMs) {
      line += ` [${entry.durationMs}ms]`;
    }

    lines.push(line);

    // Add details for important entries (full content)
    if (entry.reasoning) {
      const reasoningLines = entry.reasoning.split("\n");
      for (const rl of reasoningLines) {
        lines.push(`   └─ ${rl}`);
      }
    }

    if (entry.error) {
      lines.push(`   └─ ERROR: ${entry.error}`);
    }

    if (entry.toolArgs && Object.keys(entry.toolArgs).length > 0) {
      lines.push(`   └─ Args:`);
      const argsLines = JSON.stringify(entry.toolArgs, null, 2).split("\n");
      for (const al of argsLines) {
        lines.push(`      ${al}`);
      }
    }

    if (entry.toolResult) {
      lines.push(`   └─ Result: ${entry.toolResult}`);
    }
  }

  lines.push("");
  lines.push("─".repeat(80));
  lines.push("  SUMMARY BY EVENT TYPE");
  lines.push("─".repeat(80));
  lines.push("");

  // Group by event type
  const byType = new Map<string, number>();
  for (const entry of entries) {
    byType.set(entry.eventType, (byType.get(entry.eventType) || 0) + 1);
  }

  for (const [type, count] of [...byType.entries()].sort((a, b) => b[1] - a[1])) {
    lines.push(`  ${type.padEnd(25)} ${count}`);
  }

  lines.push("");
  lines.push("═".repeat(80));

  return lines.join("\n");
}

/**
 * Get icon for log level
 */
function getLevelIcon(level: DebugLogLevel): string {
  switch (level) {
    case "error":
      return "X";
    case "warn":
      return "!";
    case "info":
      return "*";
    case "debug":
      return "-";
    case "trace":
      return ".";
    default:
      return " ";
  }
}

// ============================================================================
// LOG REPORTER ADAPTER
// ============================================================================

/**
 * BenchmarkLogReporter - Adapts BenchmarkDebugLogger to the LogReporter interface
 *
 * This allows the benchmark system to use the unified logging interface
 * while maintaining backward compatibility with existing benchmark code.
 */
export class BenchmarkLogReporter implements LogReporter {
  private logger: BenchmarkDebugLogger;

  constructor(logger: BenchmarkDebugLogger) {
    this.logger = logger;
  }

  /**
   * Convert LogLevel to DebugLogLevel
   */
  private toDebugLevel(level: LogLevel): DebugLogLevel {
    return level as DebugLogLevel;
  }

  /**
   * Convert LogEntryType to event type string
   */
  private toEventType(type: LogEntryType): string {
    switch (type) {
      case "thinking":
        return "reasoning";
      case "tool_start":
        return "tool_use";
      case "tool_end":
        return "tool_call";
      case "tool_error":
        return "error";
      case "message":
        return "message";
      case "context":
        return "context";
      case "decision":
        return "decision";
      case "checkpoint":
        return "checkpoint";
      case "error":
        return "error";
      case "custom":
      default:
        return "custom";
    }
  }

  log(entry: LogEntry): void {
    const debugEntry: DebugLogEntry = {
      timestamp: entry.timestamp,
      level: this.toDebugLevel(entry.level),
      eventType: this.toEventType(entry.type),
      scenarioId: this.logger["scenarioId"],
      runId: this.logger["runId"],
      stepNumber: entry.step,
      tool: entry.tool,
      toolArgs: entry.toolInput,
      toolResult: entry.toolOutput ? JSON.stringify(entry.toolOutput) : undefined,
      reasoning: entry.content,
      tokenCount: entry.tokenCount,
      tokenDelta: entry.tokenDelta,
      durationMs: entry.durationMs,
      error: entry.error?.message,
      metadata: entry.metadata,
    };

    this.logger["writeEntry"](debugEntry);
  }

  thinking(sessionId: string, step: number, content: string, tokenCount?: number): void {
    this.logger.logReasoning("thinking", content, tokenCount);
  }

  toolStart(
    sessionId: string,
    step: number,
    tool: string,
    input: Record<string, unknown>
  ): void {
    this.log({
      timestamp: new Date().toISOString(),
      level: "info",
      type: "tool_start",
      sessionId,
      step,
      tool,
      toolInput: input,
    });
  }

  toolEnd(
    sessionId: string,
    step: number,
    tool: string,
    output: unknown,
    durationMs: number,
    success: boolean
  ): void {
    this.logger.logToolCall(
      {
        tool,
        args: {},
        result: output,
        duration: durationMs,
        timestamp: Date.now(),
        error: success ? undefined : String(output),
      },
      step
    );
  }

  message(
    sessionId: string,
    step: number,
    role: "user" | "assistant",
    content: string
  ): void {
    this.log({
      timestamp: new Date().toISOString(),
      level: "info",
      type: "message",
      sessionId,
      step,
      content,
      metadata: { role },
    });
  }

  error(
    sessionId: string,
    step: number,
    error: Error | string,
    context?: Record<string, unknown>
  ): void {
    const err = error instanceof Error ? error : new Error(error);
    this.logger.log("error", err.message, context);
  }

  flush(): void {
    // BenchmarkDebugLogger writes synchronously, no buffering needed
  }

  close(): void {
    this.logger.finalize();
  }
}

/**
 * Create a LogReporter that wraps a BenchmarkDebugLogger
 */
export function createBenchmarkLogReporter(
  runId: string,
  scenarioId: string,
  options?: { logDir?: string }
): { reporter: LogReporter; logger: BenchmarkDebugLogger } {
  const logger = new BenchmarkDebugLogger(runId, scenarioId, options);
  const reporter = new BenchmarkLogReporter(logger);
  return { reporter, logger };
}

// ============================================================================
// EXPORT
// ============================================================================

export { DEFAULT_LOG_DIR };
