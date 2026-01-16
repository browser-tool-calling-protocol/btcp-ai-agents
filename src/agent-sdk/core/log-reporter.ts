/**
 * Unified Log Reporter
 *
 * Provides a consistent logging interface for both the agentic loop
 * and benchmark system. Supports multiple output destinations.
 *
 * @module @waiboard/ai-agents/core
 */

// ============================================================================
// LOG ENTRY TYPES
// ============================================================================

/**
 * Log level for entries
 */
export type LogLevel = "trace" | "debug" | "info" | "warn" | "error";

/**
 * Log entry type identifying the kind of event
 */
export type LogEntryType =
  | "thinking"       // LLM reasoning/thinking
  | "tool_start"     // Tool execution started
  | "tool_end"       // Tool execution completed
  | "tool_error"     // Tool execution failed
  | "message"        // User/assistant message
  | "context"        // Context/awareness update
  | "decision"       // Agent decision (continue/complete/fail)
  | "checkpoint"     // Checkpoint saved
  | "error"          // General error
  | "custom";        // Custom event

/**
 * A single log entry
 */
export interface LogEntry {
  /** ISO timestamp */
  timestamp: string;
  /** Log level */
  level: LogLevel;
  /** Entry type */
  type: LogEntryType;
  /** Session/run ID */
  sessionId: string;
  /** Iteration/step number */
  step: number;
  /** Tool name (if applicable) */
  tool?: string;
  /** Tool input arguments (if applicable) */
  toolInput?: Record<string, unknown>;
  /** Tool output result (if applicable) */
  toolOutput?: unknown;
  /** Duration in milliseconds (if applicable) */
  durationMs?: number;
  /** Message content (for thinking/message types) */
  content?: string;
  /** Token count at this point */
  tokenCount?: number;
  /** Token delta from previous step */
  tokenDelta?: number;
  /** Error information (if applicable) */
  error?: {
    code?: string;
    message: string;
    stack?: string;
  };
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// LOG REPORTER INTERFACE
// ============================================================================

/**
 * Log Reporter Interface
 *
 * Implement this interface to create custom log destinations.
 */
export interface LogReporter {
  /**
   * Log an entry
   */
  log(entry: LogEntry): void;

  /**
   * Log thinking/reasoning content
   */
  thinking(sessionId: string, step: number, content: string, tokenCount?: number): void;

  /**
   * Log tool execution start
   */
  toolStart(
    sessionId: string,
    step: number,
    tool: string,
    input: Record<string, unknown>
  ): void;

  /**
   * Log tool execution end
   */
  toolEnd(
    sessionId: string,
    step: number,
    tool: string,
    output: unknown,
    durationMs: number,
    success: boolean
  ): void;

  /**
   * Log a message (user or assistant)
   */
  message(
    sessionId: string,
    step: number,
    role: "user" | "assistant",
    content: string
  ): void;

  /**
   * Log an error
   */
  error(
    sessionId: string,
    step: number,
    error: Error | string,
    context?: Record<string, unknown>
  ): void;

  /**
   * Flush any buffered entries (for file-based reporters)
   */
  flush?(): void | Promise<void>;

  /**
   * Close the reporter (cleanup resources)
   */
  close?(): void | Promise<void>;
}

// ============================================================================
// CONSOLE LOG REPORTER
// ============================================================================

/**
 * Console Log Reporter Options
 */
export interface ConsoleLogReporterOptions {
  /** Minimum log level to output */
  minLevel?: LogLevel;
  /** Show timestamps */
  showTimestamps?: boolean;
  /** Use colors (ANSI escape codes) */
  useColors?: boolean;
  /** Show full tool input/output (not truncated) */
  showFullContent?: boolean;
  /** Custom prefix for all log lines */
  prefix?: string;
}

/**
 * Console-based log reporter
 */
export class ConsoleLogReporter implements LogReporter {
  private options: Required<ConsoleLogReporterOptions>;
  private levelPriority: Record<LogLevel, number> = {
    trace: 0,
    debug: 1,
    info: 2,
    warn: 3,
    error: 4,
  };

  constructor(options: ConsoleLogReporterOptions = {}) {
    this.options = {
      minLevel: options.minLevel ?? "info",
      showTimestamps: options.showTimestamps ?? true,
      useColors: options.useColors ?? true,
      showFullContent: options.showFullContent ?? true,
      prefix: options.prefix ?? "[Agent]",
    };
  }

  private shouldLog(level: LogLevel): boolean {
    return this.levelPriority[level] >= this.levelPriority[this.options.minLevel];
  }

  private formatTimestamp(timestamp: string): string {
    if (!this.options.showTimestamps) return "";
    const time = timestamp.split("T")[1]?.split(".")[0] || timestamp;
    return `[${time}]`;
  }

  private colorize(text: string, color: string): string {
    if (!this.options.useColors) return text;
    const colors: Record<string, string> = {
      reset: "\x1b[0m",
      red: "\x1b[31m",
      green: "\x1b[32m",
      yellow: "\x1b[33m",
      blue: "\x1b[34m",
      magenta: "\x1b[35m",
      cyan: "\x1b[36m",
      gray: "\x1b[90m",
      bold: "\x1b[1m",
    };
    return `${colors[color] || ""}${text}${colors.reset}`;
  }

  private getLevelIcon(level: LogLevel): string {
    const icons: Record<LogLevel, string> = {
      trace: "·",
      debug: "-",
      info: "→",
      warn: "!",
      error: "✗",
    };
    return icons[level];
  }

  private getLevelColor(level: LogLevel): string {
    const colors: Record<LogLevel, string> = {
      trace: "gray",
      debug: "gray",
      info: "blue",
      warn: "yellow",
      error: "red",
    };
    return colors[level];
  }

  log(entry: LogEntry): void {
    if (!this.shouldLog(entry.level)) return;

    const timestamp = this.formatTimestamp(entry.timestamp);
    const icon = this.getLevelIcon(entry.level);
    const color = this.getLevelColor(entry.level);
    const prefix = this.options.prefix;

    let line = `${prefix} ${timestamp} ${this.colorize(icon, color)}`;

    switch (entry.type) {
      case "thinking":
        line += ` ${this.colorize("🧠 Thinking:", "cyan")}`;
        if (entry.content) {
          console.log(line);
          // Show full content
          for (const contentLine of entry.content.split("\n")) {
            console.log(`${prefix}    ${contentLine}`);
          }
          return;
        }
        break;

      case "tool_start":
        line += ` ${this.colorize("⚙", "magenta")} ${entry.tool}`;
        console.log(line);
        if (entry.toolInput && this.options.showFullContent) {
          console.log(`${prefix}    → Input:`);
          for (const inputLine of JSON.stringify(entry.toolInput, null, 2).split("\n")) {
            console.log(`${prefix}      ${inputLine}`);
          }
        }
        return;

      case "tool_end":
        const status = entry.error ? this.colorize("✗", "red") : this.colorize("✓", "green");
        line += ` ${status} ${entry.tool} (${entry.durationMs}ms)`;
        console.log(line);
        if (entry.toolOutput && this.options.showFullContent) {
          console.log(`${prefix}    ← Output:`);
          const outputStr = typeof entry.toolOutput === "string"
            ? entry.toolOutput
            : JSON.stringify(entry.toolOutput, null, 2);
          for (const outputLine of outputStr.split("\n")) {
            console.log(`${prefix}      ${outputLine}`);
          }
        }
        return;

      case "tool_error":
        line += ` ${this.colorize("✗", "red")} ${entry.tool} failed: ${entry.error?.message}`;
        break;

      case "message":
        const role = entry.metadata?.role as string;
        const roleIcon = role === "user" ? "👤" : "🤖";
        line += ` ${roleIcon} ${role === "user" ? "User" : "Assistant"}:`;
        console.log(line);
        if (entry.content) {
          for (const contentLine of entry.content.split("\n")) {
            console.log(`${prefix}    ${contentLine}`);
          }
        }
        return;

      case "decision":
        const decision = entry.metadata?.decision as string;
        const decisionIcon = decision === "complete" ? "✓" : decision === "failed" ? "✗" : "→";
        line += ` ${this.colorize(decisionIcon, decision === "complete" ? "green" : decision === "failed" ? "red" : "blue")} Decision: ${decision}`;
        break;

      case "error":
        line += ` ${this.colorize("ERROR:", "red")} ${entry.error?.message}`;
        break;

      default:
        line += ` ${entry.content || JSON.stringify(entry.metadata)}`;
    }

    console.log(line);
  }

  thinking(sessionId: string, step: number, content: string, tokenCount?: number): void {
    this.log({
      timestamp: new Date().toISOString(),
      level: "debug",
      type: "thinking",
      sessionId,
      step,
      content,
      tokenCount,
    });
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
    this.log({
      timestamp: new Date().toISOString(),
      level: success ? "info" : "error",
      type: success ? "tool_end" : "tool_error",
      sessionId,
      step,
      tool,
      toolOutput: output,
      durationMs,
      error: success ? undefined : { message: String(output) },
    });
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
    this.log({
      timestamp: new Date().toISOString(),
      level: "error",
      type: "error",
      sessionId,
      step,
      error: {
        message: err.message,
        stack: err.stack,
      },
      metadata: context,
    });
  }
}

// ============================================================================
// FILE LOG REPORTER
// ============================================================================

/**
 * File Log Reporter Options
 */
export interface FileLogReporterOptions {
  /** Log file path */
  filePath: string;
  /** Append to existing file (default: false) */
  append?: boolean;
  /** Flush after each write */
  autoFlush?: boolean;
}

/**
 * File-based log reporter (JSONL format)
 */
export class FileLogReporter implements LogReporter {
  private filePath: string;
  private buffer: LogEntry[] = [];
  private autoFlush: boolean;
  private initialized = false;

  constructor(options: FileLogReporterOptions) {
    this.filePath = options.filePath;
    this.autoFlush = options.autoFlush ?? true;
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;

    const { mkdirSync, existsSync, writeFileSync } = await import("node:fs");
    const { dirname } = await import("node:path");

    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Write header
    writeFileSync(
      this.filePath,
      JSON.stringify({
        type: "header",
        version: "1.0",
        startTime: new Date().toISOString(),
      }) + "\n"
    );

    this.initialized = true;
  }

  log(entry: LogEntry): void {
    this.buffer.push(entry);
    if (this.autoFlush) {
      this.flush();
    }
  }

  thinking(sessionId: string, step: number, content: string, tokenCount?: number): void {
    this.log({
      timestamp: new Date().toISOString(),
      level: "debug",
      type: "thinking",
      sessionId,
      step,
      content,
      tokenCount,
    });
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
    this.log({
      timestamp: new Date().toISOString(),
      level: success ? "info" : "error",
      type: success ? "tool_end" : "tool_error",
      sessionId,
      step,
      tool,
      toolOutput: output,
      durationMs,
      error: success ? undefined : { message: String(output) },
    });
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
    this.log({
      timestamp: new Date().toISOString(),
      level: "error",
      type: "error",
      sessionId,
      step,
      error: {
        message: err.message,
        stack: err.stack,
      },
      metadata: context,
    });
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    await this.ensureInitialized();

    const { appendFileSync } = await import("node:fs");
    const lines = this.buffer.map((entry) => JSON.stringify(entry)).join("\n") + "\n";
    appendFileSync(this.filePath, lines);
    this.buffer = [];
  }

  async close(): Promise<void> {
    await this.flush();

    const { appendFileSync } = await import("node:fs");
    appendFileSync(
      this.filePath,
      JSON.stringify({
        type: "footer",
        endTime: new Date().toISOString(),
      }) + "\n"
    );
  }
}

// ============================================================================
// MULTI LOG REPORTER
// ============================================================================

/**
 * Multi-destination log reporter
 *
 * Forwards log entries to multiple reporters.
 */
export class MultiLogReporter implements LogReporter {
  private reporters: LogReporter[];

  constructor(reporters: LogReporter[] = []) {
    this.reporters = reporters;
  }

  addReporter(reporter: LogReporter): void {
    this.reporters.push(reporter);
  }

  removeReporter(reporter: LogReporter): void {
    const index = this.reporters.indexOf(reporter);
    if (index >= 0) {
      this.reporters.splice(index, 1);
    }
  }

  log(entry: LogEntry): void {
    for (const reporter of this.reporters) {
      reporter.log(entry);
    }
  }

  thinking(sessionId: string, step: number, content: string, tokenCount?: number): void {
    for (const reporter of this.reporters) {
      reporter.thinking(sessionId, step, content, tokenCount);
    }
  }

  toolStart(
    sessionId: string,
    step: number,
    tool: string,
    input: Record<string, unknown>
  ): void {
    for (const reporter of this.reporters) {
      reporter.toolStart(sessionId, step, tool, input);
    }
  }

  toolEnd(
    sessionId: string,
    step: number,
    tool: string,
    output: unknown,
    durationMs: number,
    success: boolean
  ): void {
    for (const reporter of this.reporters) {
      reporter.toolEnd(sessionId, step, tool, output, durationMs, success);
    }
  }

  message(
    sessionId: string,
    step: number,
    role: "user" | "assistant",
    content: string
  ): void {
    for (const reporter of this.reporters) {
      reporter.message(sessionId, step, role, content);
    }
  }

  error(
    sessionId: string,
    step: number,
    error: Error | string,
    context?: Record<string, unknown>
  ): void {
    for (const reporter of this.reporters) {
      reporter.error(sessionId, step, error, context);
    }
  }

  async flush(): Promise<void> {
    await Promise.all(
      this.reporters.map((r) => r.flush?.())
    );
  }

  async close(): Promise<void> {
    await Promise.all(
      this.reporters.map((r) => r.close?.())
    );
  }
}

// ============================================================================
// NULL LOG REPORTER
// ============================================================================

/**
 * Null log reporter (no-op)
 *
 * Use when logging is disabled.
 */
export class NullLogReporter implements LogReporter {
  log(_entry: LogEntry): void {}
  thinking(): void {}
  toolStart(): void {}
  toolEnd(): void {}
  message(): void {}
  error(): void {}
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create a log reporter based on options
 */
export function createLogReporter(options?: {
  console?: boolean | ConsoleLogReporterOptions;
  file?: string | FileLogReporterOptions;
  reporters?: LogReporter[];
}): LogReporter {
  if (!options) {
    return new NullLogReporter();
  }

  const reporters: LogReporter[] = [];

  // Add console reporter
  if (options.console) {
    const consoleOptions = typeof options.console === "boolean" ? {} : options.console;
    reporters.push(new ConsoleLogReporter(consoleOptions));
  }

  // Add file reporter
  if (options.file) {
    const fileOptions = typeof options.file === "string"
      ? { filePath: options.file }
      : options.file;
    reporters.push(new FileLogReporter(fileOptions));
  }

  // Add custom reporters
  if (options.reporters) {
    reporters.push(...options.reporters);
  }

  if (reporters.length === 0) {
    return new NullLogReporter();
  }

  if (reporters.length === 1) {
    return reporters[0];
  }

  return new MultiLogReporter(reporters);
}
