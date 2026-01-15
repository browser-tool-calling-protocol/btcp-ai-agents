/**
 * Debug View for Benchmark
 *
 * Provides detailed conversation and reasoning flow visualization
 * for debugging AI agent execution during benchmarks.
 *
 * Example output:
 * ```
 * ✓ llm:openai/gpt-4o (152ms)
 * ✓ tool:canvas_write (82ms)
 * ✓ llm:openai/gpt-4o (102ms)
 *
 * ════════════════════════════════════════════════════════════════════════════════
 *   REASONING FLOW │ 2 turns │ 492ms
 * ════════════════════════════════════════════════════════════════════════════════
 *   ├─ Turn 1 (285ms)
 *   │  ├─ USER: Create a moodboard for a minimalist coffee shop brand...
 *   │  ├─ REASONING:
 *   │  │  ├─ [analyze] User wants a moodboard for a coffee shop brand...
 *   │  │  └─ [plan] 1. Create a frame for the moodboard...
 *   │  ├─ TOOLS:
 *   │  │  └─ ✓ canvas_write (82ms)
 *   │  └─ ASSISTANT: I've created a minimalist moodboard...
 *   └─ Turn 2 (205ms)
 *      ...
 * ```
 */

import type {
  AgentEventRecord,
  ToolCallRecord,
  BenchmarkScenario,
  ScenarioResult,
} from "./types.js";

// ============================================================================
// TYPES
// ============================================================================

/**
 * Reasoning step with parsed content
 */
export interface ParsedReasoningStep {
  type: "analyze" | "plan" | "observe" | "decide" | "assess_clarity" | "execute" | "summarize";
  content: string;
}

/**
 * Tool execution record for debug view
 */
export interface DebugToolExecution {
  tool: string;
  success: boolean;
  durationMs: number;
  args?: Record<string, unknown>;
  result?: unknown;
  error?: string;
}

/**
 * A single turn in the conversation
 */
export interface DebugTurn {
  turnNumber: number;
  durationMs: number;
  userMessage?: string;
  reasoning: ParsedReasoningStep[];
  tools: DebugToolExecution[];
  assistantMessage?: string;
  llmCalls: Array<{ provider: string; model: string; durationMs: number }>;
}

/**
 * Complete debug session data
 */
export interface DebugSession {
  scenarioId: string;
  scenarioName: string;
  prompt: string;
  model: string;
  provider: string;
  turns: DebugTurn[];
  totalDurationMs: number;
  totalTokens: number;
  totalLlmCalls: number;
  totalToolCalls: number;
  warnings: string[];
}

/**
 * Live ticker event for real-time output
 */
export interface TickerEvent {
  type: "llm" | "tool" | "reasoning";
  name: string;
  durationMs: number;
  success: boolean;
  provider?: string;
}

// ============================================================================
// TICKER OUTPUT (Real-time during execution)
// ============================================================================

/**
 * Format a ticker event for real-time console output
 */
export function formatTickerEvent(event: TickerEvent): string {
  const icon = event.success ? "✓" : "✗";
  const duration = `(${event.durationMs}ms)`;

  switch (event.type) {
    case "llm":
      return `${icon} llm:${event.provider || "unknown"}/${event.name} ${duration}`;
    case "tool":
      return `${icon} tool:${event.name} ${duration}`;
    case "reasoning":
      return `${icon} reasoning_${event.name} ${duration}`;
    default:
      return `${icon} ${event.name} ${duration}`;
  }
}

/**
 * Create a ticker event from an agent event
 */
export function createTickerEventFromAgentEvent(
  event: AgentEventRecord,
  durationMs: number,
  provider?: string,
  model?: string
): TickerEvent | null {
  switch (event.type) {
    case "acting":
      return {
        type: "tool",
        name: event.tool || "unknown",
        durationMs,
        success: true,
      };
    case "observing":
      // Observing events complete a tool call
      const result = event.data?.result as { success?: boolean } | undefined;
      return {
        type: "tool",
        name: event.tool || "result",
        durationMs,
        success: result?.success !== false,
      };
    case "reasoning":
      return {
        type: "reasoning",
        name: "debug",
        durationMs,
        success: true,
      };
    case "complete":
      return {
        type: "llm",
        name: model || "completion",
        durationMs,
        success: true,
        provider,
      };
    case "failed":
      return {
        type: "llm",
        name: model || "failed",
        durationMs,
        success: false,
        provider,
      };
    default:
      return null;
  }
}

// ============================================================================
// PARSING AND EXTRACTION
// ============================================================================

/**
 * Parse reasoning content into structured steps
 */
export function parseReasoningContent(content: string): ParsedReasoningStep[] {
  const steps: ParsedReasoningStep[] = [];
  const tagPatterns = [
    { tag: "analyze", regex: /<analyze>([\s\S]*?)<\/analyze>/gi },
    { tag: "plan", regex: /<plan>([\s\S]*?)<\/plan>/gi },
    { tag: "observe", regex: /<observe>([\s\S]*?)<\/observe>/gi },
    { tag: "decide", regex: /<decide>([\s\S]*?)<\/decide>/gi },
    { tag: "assess_clarity", regex: /<assess_clarity>([\s\S]*?)<\/assess_clarity>/gi },
    { tag: "execute", regex: /<execute>([\s\S]*?)<\/execute>/gi },
    { tag: "summarize", regex: /<summarize>([\s\S]*?)<\/summarize>/gi },
  ] as const;

  for (const { tag, regex } of tagPatterns) {
    let match;
    while ((match = regex.exec(content)) !== null) {
      steps.push({
        type: tag as ParsedReasoningStep["type"],
        content: match[1].trim(),
      });
    }
  }

  return steps;
}

/**
 * Extract turns from event records
 */
export function extractTurns(
  scenario: BenchmarkScenario,
  events: AgentEventRecord[],
  toolCalls: ToolCallRecord[],
  finalOutput: string | undefined,
  model: string,
  provider: string,
  totalDurationMs: number
): DebugTurn[] {
  const turns: DebugTurn[] = [];
  let currentTurn: DebugTurn = {
    turnNumber: 1,
    durationMs: 0,
    userMessage: scenario.prompt,
    reasoning: [],
    tools: [],
    llmCalls: [],
  };

  let turnStartTime = events[0]?.timestamp || Date.now();
  let lastEventTime = turnStartTime;

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const eventDuration = event.timestamp - lastEventTime;
    lastEventTime = event.timestamp;

    // Extract reasoning from content
    if (event.type === "reasoning" && event.content) {
      const parsed = parseReasoningContent(event.content);
      currentTurn.reasoning.push(...parsed);
    }

    // Track tool calls
    if (event.type === "acting" && event.tool) {
      const matchingToolCall = toolCalls.find(
        (tc) => tc.tool === event.tool && Math.abs(tc.timestamp - event.timestamp) < 1000
      );
      currentTurn.tools.push({
        tool: event.tool,
        success: !matchingToolCall?.error,
        durationMs: matchingToolCall?.duration || eventDuration,
        args: matchingToolCall?.args,
        result: matchingToolCall?.result,
        error: matchingToolCall?.error,
      });
    }

    // Track LLM calls (complete events indicate LLM response)
    if (event.type === "complete") {
      currentTurn.llmCalls.push({
        provider,
        model,
        durationMs: eventDuration,
      });
      currentTurn.assistantMessage = event.content || finalOutput;
      currentTurn.durationMs = event.timestamp - turnStartTime;

      // Push completed turn and start new one if there are more events
      turns.push(currentTurn);

      // Check if there's a follow-up user message (multi-turn)
      const nextEvent = events[i + 1];
      if (nextEvent) {
        currentTurn = {
          turnNumber: turns.length + 1,
          durationMs: 0,
          reasoning: [],
          tools: [],
          llmCalls: [],
        };
        turnStartTime = nextEvent.timestamp;
      }
    }
  }

  // Handle case where no complete event was recorded
  if (turns.length === 0 && (currentTurn.reasoning.length > 0 || currentTurn.tools.length > 0)) {
    currentTurn.durationMs = totalDurationMs;
    currentTurn.assistantMessage = finalOutput;
    turns.push(currentTurn);
  }

  return turns;
}

/**
 * Build a debug session from scenario result
 */
export function buildDebugSession(
  scenario: BenchmarkScenario,
  result: ScenarioResult
): DebugSession {
  const warnings: string[] = [];

  // Count errors
  const toolErrors = result.rawData.toolCalls.filter((tc) => tc.error);
  if (toolErrors.length > 0) {
    warnings.push(`${toolErrors.length} tool call(s) failed`);
  }

  // Extract turns
  const turns = extractTurns(
    scenario,
    result.rawData.events,
    result.rawData.toolCalls,
    result.rawData.finalOutput,
    result.model,
    result.provider,
    result.duration
  );

  return {
    scenarioId: result.scenarioId,
    scenarioName: result.scenarioName,
    prompt: scenario.prompt,
    model: result.model,
    provider: result.provider,
    turns,
    totalDurationMs: result.duration,
    totalTokens: result.scores.efficiency.tokenCount,
    totalLlmCalls: turns.reduce((sum, t) => sum + t.llmCalls.length, 0),
    totalToolCalls: result.rawData.toolCalls.length,
    warnings,
  };
}

// ============================================================================
// DEBUG VIEW FORMATTING
// ============================================================================

const WIDTH = 80;
const REASONING_ICONS: Record<string, string> = {
  analyze: "🔍",
  plan: "📋",
  observe: "👁️",
  decide: "⚡",
  assess_clarity: "🎯",
  execute: "🚀",
  summarize: "📝",
};

/**
 * Truncate text with ellipsis
 */
function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + "...";
}

/**
 * Wrap text to multiple lines with prefix
 */
function wrapText(text: string, prefix: string, maxLen: number): string[] {
  const lines: string[] = [];
  const words = text.split(/\s+/);
  let currentLine = "";

  for (const word of words) {
    if (currentLine.length + word.length + 1 > maxLen) {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = currentLine ? `${currentLine} ${word}` : word;
    }
  }

  if (currentLine) lines.push(currentLine);

  return lines.map((line, i) => (i === 0 ? `${prefix}${line}` : `${" ".repeat(prefix.length)}${line}`));
}

/**
 * Format tool args for display (single-line JSON)
 */
function formatToolArgs(args: Record<string, unknown> | undefined): string {
  if (!args) return "";
  return JSON.stringify(args);
}

/**
 * Format tool result for display (single-line JSON)
 */
function formatToolResult(result: unknown): string {
  if (!result) return "";
  if (typeof result === "object") {
    return JSON.stringify(result);
  }
  return String(result);
}

/**
 * Generate the main debug view report
 */
export function generateDebugView(session: DebugSession): string {
  const lines: string[] = [];

  // Header
  lines.push("");
  lines.push("═".repeat(WIDTH));
  lines.push(
    `  REASONING FLOW │ ${session.turns.length} turn${session.turns.length !== 1 ? "s" : ""} │ ${session.totalDurationMs}ms`
  );
  lines.push("═".repeat(WIDTH));

  // Render each turn
  for (let i = 0; i < session.turns.length; i++) {
    const turn = session.turns[i];
    const isLast = i === session.turns.length - 1;
    const turnPrefix = isLast ? "  └─" : "  ├─";
    const linePrefix = isLast ? "     " : "  │  ";

    lines.push(`${turnPrefix} Turn ${turn.turnNumber} (${turn.durationMs}ms)`);

    // User message (full content)
    if (turn.userMessage) {
      lines.push(`${linePrefix}│`);
      lines.push(`${linePrefix}├─ 👤 User:`);
      const userLines = turn.userMessage.split("\n");
      for (const userLine of userLines) {
        lines.push(`${linePrefix}│     ${userLine}`);
      }
    }

    // Assistant section (contains Reasoning, Tools, and Response)
    const hasReasoning = turn.reasoning.length > 0;
    const hasTools = turn.tools.length > 0;
    const hasResponse = turn.assistantMessage;

    if (hasReasoning || hasTools || hasResponse) {
      lines.push(`${linePrefix}│`);
      lines.push(`${linePrefix}└─ 🤖 Assistant:`);

      // Reasoning (under Assistant)
      if (hasReasoning) {
        const reasoningIsLast = !hasTools && !hasResponse;
        const reasoningConnector = reasoningIsLast ? "└─" : "├─";
        const reasoningPrefix = reasoningIsLast ? "   " : "│  ";

        lines.push(`${linePrefix}   ${reasoningConnector} 🧠 Reasoning:`);
        for (let j = 0; j < turn.reasoning.length; j++) {
          const step = turn.reasoning[j];
          const stepIsLast = j === turn.reasoning.length - 1;
          const stepPrefix = stepIsLast ? "└─" : "├─";
          const icon = REASONING_ICONS[step.type] || "•";

          // First line with tag
          lines.push(`${linePrefix}   ${reasoningPrefix} ${stepPrefix} ${icon} [${step.type}]`);

          // Content lines - show full content (no truncation)
          const contentLines = step.content.split("\n");
          for (const contentLine of contentLines) {
            const padding = stepIsLast ? "      " : "│     ";
            lines.push(`${linePrefix}   ${reasoningPrefix} ${padding}${contentLine.trim()}`);
          }
        }
      }

      // Tools (under Assistant)
      if (hasTools) {
        const toolsIsLast = !hasResponse;
        const toolsConnector = toolsIsLast ? "└─" : "├─";
        const toolsPrefix = toolsIsLast ? "   " : "│  ";

        lines.push(`${linePrefix}   ${toolsConnector} 🔧 Tools:`);
        for (let j = 0; j < turn.tools.length; j++) {
          const tool = turn.tools[j];
          const toolIsLast = j === turn.tools.length - 1;
          const toolPrefix = toolIsLast ? "└─" : "├─";
          const icon = tool.success ? "✓" : "✗";

          lines.push(`${linePrefix}   ${toolsPrefix} ${toolPrefix} ${icon} ${tool.tool} (${tool.durationMs}ms)`);

          // Tool details (full content)
          const detailPadding = toolIsLast ? "      " : "│     ";
          if (tool.args) {
            lines.push(`${linePrefix}   ${toolsPrefix} ${detailPadding}→ Input:`);
            const argsLines = formatToolArgs(tool.args).split("\n");
            for (const argLine of argsLines) {
              lines.push(`${linePrefix}   ${toolsPrefix} ${detailPadding}  ${argLine}`);
            }
          }
          if (tool.success && tool.result) {
            lines.push(`${linePrefix}   ${toolsPrefix} ${detailPadding}← Output:`);
            const resultLines = formatToolResult(tool.result).split("\n");
            for (const resultLine of resultLines) {
              lines.push(`${linePrefix}   ${toolsPrefix} ${detailPadding}  ${resultLine}`);
            }
          }
          if (tool.error) {
            lines.push(`${linePrefix}   ${toolsPrefix} ${detailPadding}✗ Error: ${tool.error}`);
          }
        }
      }

      // Response (under Assistant) - show full content
      if (hasResponse) {
        lines.push(`${linePrefix}   └─ 💬 Response:`);
        const responseLines = turn.assistantMessage!.split("\n");
        for (const responseLine of responseLines) {
          lines.push(`${linePrefix}         ${responseLine}`);
        }
      }
    }

    // Add spacing between turns
    if (!isLast) {
      lines.push(`${linePrefix}`);
    }
  }

  // Footer summary
  lines.push("");
  lines.push("─".repeat(WIDTH));
  const summaryParts = [
    `${session.totalLlmCalls} LLM call${session.totalLlmCalls !== 1 ? "s" : ""}`,
    `${session.totalToolCalls} tool${session.totalToolCalls !== 1 ? "s" : ""}`,
    `${session.totalTokens} tokens`,
  ];
  if (session.warnings.length > 0) {
    summaryParts.push(`${session.warnings.length} warning${session.warnings.length !== 1 ? "s" : ""}`);
  }
  lines.push(`  ${summaryParts.join(" │ ")}`);
  lines.push("═".repeat(WIDTH));

  return lines.join("\n");
}

/**
 * Generate a compact ticker summary (shown during execution)
 */
export function generateTickerSummary(
  events: TickerEvent[],
  durationMs: number
): string {
  const lines: string[] = [];

  lines.push("");
  lines.push("=== Debug Mode Example (Conversation & Reasoning Flow) ===");
  lines.push("");

  for (const event of events) {
    lines.push(formatTickerEvent(event));
  }

  lines.push("");

  return lines.join("\n");
}

// ============================================================================
// LIVE DEBUG REPORTER
// ============================================================================

/**
 * LiveDebugReporter - Outputs debug information in real-time during benchmark execution
 */
export class LiveDebugReporter {
  private events: TickerEvent[] = [];
  private startTime: number;
  private model: string;
  private provider: string;
  private lastToolTimestamp: number = 0;

  constructor(model: string, provider: string) {
    this.startTime = Date.now();
    this.model = model;
    this.provider = provider;
  }

  /**
   * Report an LLM call
   */
  reportLlmCall(durationMs: number, success: boolean = true): void {
    const event: TickerEvent = {
      type: "llm",
      name: this.model,
      durationMs,
      success,
      provider: this.provider,
    };
    this.events.push(event);
    console.log(formatTickerEvent(event));
  }

  /**
   * Report a tool execution
   */
  reportToolCall(
    toolName: string,
    durationMs: number,
    success: boolean = true,
    error?: string
  ): void {
    const event: TickerEvent = {
      type: "tool",
      name: toolName,
      durationMs,
      success,
    };
    this.events.push(event);
    console.log(formatTickerEvent(event));
  }

  /**
   * Report a reasoning step
   */
  reportReasoning(stepType: string, durationMs: number): void {
    const event: TickerEvent = {
      type: "reasoning",
      name: stepType,
      durationMs,
      success: true,
    };
    this.events.push(event);
    console.log(formatTickerEvent(event));
  }

  /**
   * Get all recorded events
   */
  getEvents(): TickerEvent[] {
    return this.events;
  }

  /**
   * Get total duration
   */
  getTotalDuration(): number {
    return Date.now() - this.startTime;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  WIDTH as DEBUG_VIEW_WIDTH,
  REASONING_ICONS,
};
