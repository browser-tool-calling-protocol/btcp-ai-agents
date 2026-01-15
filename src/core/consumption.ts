/**
 * Consumption Patterns (Native Implementation)
 *
 * Three ways to consume the canvas agent:
 * 1. Streaming (real-time events)
 * 2. Batch (collect all events)
 * 3. Simple (get final result)
 *
 * All consumption patterns use the native runAgenticLoop which:
 * - Provides Claude Agent SDK-compatible interface
 * - Runs the THINK → ACT → OBSERVE → DECIDE loop
 * - Supports parallel delegation and full context management
 *
 * ## Cancellation
 *
 * To cancel operations, use the `signal` property in AgentConfig with an AbortSignal:
 *
 * ```typescript
 * const controller = new AbortController();
 * const config: AgentConfig = {
 *   canvasId: "my-canvas",
 *   signal: controller.signal,
 * };
 *
 * // Later, to cancel:
 * controller.abort("User requested cancellation");
 * ```
 *
 * @see docs/engineering/CLAUDE_CODE_PATTERNS.md#pattern-2
 *
 * @module @waiboard/ai-agents/core
 */

import { runAgenticLoop } from "./loop.js";
import type { AgentConfig, CancellationToken, AgentEvent } from "../agents/types.js";
import { createCancellationToken } from "../agents/types.js";

/**
 * Build loop config from AgentConfig
 */
function buildLoopConfig(config: AgentConfig) {
  return {
    sessionId: config.sessionId,
    model: config.model as "fast" | "balanced" | "powerful" | undefined,
    provider: config.provider,
    mcpUrl: config.mcpUrl,
    maxIterations: config.maxIterations,
    tokenBudget: config.tokenBudget,
    verbose: config.verbose,
    signal: config.signal,
    systemPrompt: config.systemPrompt,
    mode: config.mode,
    contextManager: config.contextManager,
    hooksManager: config.hooksManager,
    resourceRegistry: config.resourceRegistry,
    sessionSerializer: config.sessionSerializer,
  };
}

/**
 * Streaming consumption - real-time events
 *
 * Use for:
 * - Live progress updates
 * - Interactive UIs
 * - Cancellation support
 *
 * The agentic loop automatically:
 * - Assesses task complexity
 * - Manages context and memory
 * - Plans and coordinates complex multi-step tasks
 *
 * @example
 * ```typescript
 * // With cancellation support
 * const controller = new AbortController();
 * const config: AgentConfig = {
 *   canvasId: "my-canvas",
 *   signal: controller.signal,
 * };
 *
 * for await (const event of streamCanvasAgent(task, config)) {
 *   if (event.type === "thinking") {
 *     showSpinner(event.message);
 *   } else if (event.type === "complete") {
 *     showSuccess(event.summary);
 *   }
 * }
 *
 * // To cancel:
 * controller.abort("User cancelled");
 * ```
 */
export async function* streamCanvasAgent(
  task: string,
  config: AgentConfig
): AsyncGenerator<AgentEvent> {
  const canvasId = config.canvasId || "default";
  yield* runAgenticLoop(task, canvasId, buildLoopConfig(config));
}

/**
 * Batch consumption - collect all events
 *
 * Use for:
 * - Testing
 * - Logging/audit
 * - Post-processing
 *
 * @example
 * ```typescript
 * const events = await runCanvasAgent(task, config);
 *
 * const errors = events.filter(e => e.type === "error");
 * const tools = events.filter(e => e.type === "acting");
 * ```
 */
export async function runCanvasAgent(
  task: string,
  config: AgentConfig
): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  const canvasId = config.canvasId || "default";

  for await (const event of runAgenticLoop(task, canvasId, buildLoopConfig(config))) {
    events.push(event);
  }

  return events;
}

/**
 * Simple consumption - get final result
 *
 * Use for:
 * - Simple integrations
 * - Scripts
 * - One-shot operations
 *
 * @example
 * ```typescript
 * const result = await getCanvasAgentResult(task, config);
 *
 * if (result.success) {
 *   console.log(result.summary);
 * } else {
 *   console.error(result.error);
 * }
 * ```
 */
export async function getCanvasAgentResult(
  task: string,
  config: AgentConfig
): Promise<{
  success: boolean;
  summary?: string;
  error?: string;
  duration?: number;
  events?: AgentEvent[];
}> {
  const events = await runCanvasAgent(task, config);

  // Find the terminal event
  const lastEvent = events[events.length - 1];

  if (lastEvent?.type === "complete") {
    return {
      success: true,
      summary: lastEvent.summary,
      duration: lastEvent.totalDuration,
      events,
    };
  }

  if (lastEvent?.type === "failed") {
    return {
      success: false,
      error: lastEvent.reason,
      events,
    };
  }

  if (lastEvent?.type === "timeout") {
    return {
      success: false,
      error: "Operation timed out",
      events,
    };
  }

  if (lastEvent?.type === "cancelled") {
    return {
      success: false,
      error: lastEvent.reason || "Operation was cancelled",
      events,
    };
  }

  return {
    success: false,
    error: "Unknown terminal state",
    events,
  };
}

/**
 * Session-based consumption with history
 *
 * Maintains conversation history for multi-turn interactions.
 *
 * @example
 * ```typescript
 * const session = createCanvasAgentSession({ canvasId: "my-canvas" });
 *
 * await session.chat("Create a rectangle");
 * await session.chat("Make it blue");
 * await session.chat("Move it to the right");
 *
 * console.log(session.getHistory());
 * ```
 */
export class CanvasAgentSession {
  private config: AgentConfig;
  private history: AgentEvent[] = [];
  private cancellation: CancellationToken;

  constructor(config: AgentConfig) {
    this.config = config;
    this.cancellation = createCancellationToken();
  }

  /**
   * Send a message and stream responses
   */
  async *chat(task: string): AsyncGenerator<AgentEvent> {
    // Reset cancellation token for new chat
    this.cancellation = createCancellationToken();
    const canvasId = this.config.canvasId || "default";

    for await (const event of runAgenticLoop(
      task,
      canvasId,
      buildLoopConfig(this.config)
    )) {
      this.history.push(event);
      yield event;
    }
  }

  /**
   * Send a message and get the final result
   */
  async send(task: string): Promise<{
    success: boolean;
    summary?: string;
    error?: string;
  }> {
    const result = await getCanvasAgentResult(task, this.config);
    this.history.push(...(result.events || []));

    return {
      success: result.success,
      summary: result.summary,
      error: result.error,
    };
  }

  /**
   * Cancel the current operation
   */
  cancel(reason?: string): void {
    this.cancellation.cancel(reason);
  }

  /**
   * Get conversation history
   */
  getHistory(): AgentEvent[] {
    return [...this.history];
  }

  /**
   * Clear conversation history
   */
  clearHistory(): void {
    this.history = [];
  }

  /**
   * Get current configuration
   */
  getConfig(): AgentConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<AgentConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}

/**
 * Create a canvas agent session
 */
export function createCanvasAgentSession(
  config: AgentConfig
): CanvasAgentSession {
  return new CanvasAgentSession(config);
}

/**
 * Express-compatible handler for streaming responses
 *
 * Use for:
 * - HTTP streaming endpoints
 * - Server-Sent Events (SSE)
 *
 * @example
 * ```typescript
 * import express from "express";
 *
 * const app = express();
 *
 * app.post("/api/canvas/agent", async (req, res) => {
 *   await handleCanvasAgentStream(req.body.task, req.body, res);
 * });
 * ```
 */
export async function handleCanvasAgentStream(
  task: string,
  config: AgentConfig,
  res: {
    setHeader: (name: string, value: string) => void;
    write: (data: string) => void;
    end: () => void;
  }
): Promise<void> {
  // Set up SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const canvasId = config.canvasId || "default";

  try {
    for await (const event of runAgenticLoop(task, canvasId, buildLoopConfig(config))) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  } catch (error) {
    res.write(
      `data: ${JSON.stringify({
        type: "error",
        timestamp: Date.now(),
        error: {
          code: "STREAM_ERROR",
          message: error instanceof Error ? error.message : "Unknown error",
          recoverable: false,
        },
      })}\n\n`
    );
  } finally {
    res.end();
  }
}
