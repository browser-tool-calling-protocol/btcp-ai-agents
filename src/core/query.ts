/**
 * Query API (SDK V1 Pattern)
 *
 * The main entry point for canvas agent interactions.
 * Returns an async generator that streams messages as they arrive.
 *
 * @see https://platform.claude.com/docs/en/agent-sdk/typescript
 *
 * @example
 * ```typescript
 * import { query } from '@waiboard/ai-agents/sdk';
 *
 * const messages = query('Create a flowchart', {
 *   canvasId: 'my-canvas',
 *   model: 'gemini-2.5-flash',
 * });
 *
 * for await (const message of messages) {
 *   if (message.type === 'partial') {
 *     console.log('Streaming:', message.delta);
 *   } else if (message.type === 'result') {
 *     console.log('Done:', message.summary);
 *   }
 * }
 * ```
 */

import { nanoid } from "nanoid";
import type { CanvasAgentOptions } from "./options.js";
import { mergeWithDefaults } from "./options.js";
import type {
  SDKMessage,
  SDKSystemMessage,
  SDKPartialMessage,
  SDKResultMessage,
} from "./messages.js";
import { agentEventToSDKMessage, isResultMessage } from "./messages.js";
import type { HookConfig, HookInput, HookOutput } from "./hooks.js";
import { sortHooksByPriority, matchesHook, normalizeHookType } from "./hooks.js";
import { resolveTools } from "./tools.js";
import { mergeAgents, GENERIC_AGENTS } from "./agents.js";

// Legacy alias
const CANVAS_AGENTS = GENERIC_AGENTS;
import { runAgenticLoop } from "./execution.js";

// ============================================================================
// QUERY OPTIONS
// ============================================================================

/**
 * Query options extending canvas agent options
 */
export interface QueryOptions extends Partial<CanvasAgentOptions> {
  /** Include partial messages in stream (default: true) */
  includePartialMessages?: boolean;
  /** Include system message at start (default: true) */
  includeSystemMessage?: boolean;
}

// Extend CanvasAgentOptions to include includeSystemMessage
declare module "./options.js" {
  interface CanvasAgentOptions {
    includeSystemMessage?: boolean;
  }
}

// ============================================================================
// QUERY INTERFACE
// ============================================================================

/**
 * Query result with control methods
 */
export interface Query extends AsyncIterable<SDKMessage> {
  /**
   * Interrupt the current execution
   */
  interrupt(): void;

  /**
   * Change the model mid-execution
   */
  setModel(model: string): void;

  /**
   * Get the session ID (once available)
   */
  getSessionId(): string | undefined;

  /**
   * Check if still running
   */
  isRunning(): boolean;

  /**
   * Get supported models
   */
  supportedModels(): Promise<string[]>;

  /**
   * Get MCP server status
   */
  mcpServerStatus(): Promise<Record<string, { connected: boolean; tools: string[] }>>;
}

// ============================================================================
// QUERY IMPLEMENTATION
// ============================================================================

/**
 * Create a canvas agent query
 *
 * @param prompt - The user's prompt (string or async iterable for streaming input)
 * @param options - Query options
 * @returns Query object with async iteration and control methods
 */
export function query(
  prompt: string | AsyncIterable<string>,
  options?: QueryOptions
): Query {
  // Merge options with defaults
  const mergedOptions = mergeWithDefaults(options || { canvasId: "" });

  // State
  let sessionId: string | undefined;
  let aborted = false;
  let currentModel = mergedOptions.model;

  // Create abort controller
  const abortController = new AbortController();

  // Combine abort signals
  if (mergedOptions.abortSignal) {
    mergedOptions.abortSignal.addEventListener("abort", () => {
      abortController.abort();
    });
  }

  // Create async generator
  async function* generateMessages(): AsyncGenerator<SDKMessage> {
    // Generate session ID
    sessionId = `session_${nanoid(12)}`;

    // Resolve tools
    const tools = mergedOptions.tools
      ? resolveTools(mergedOptions.tools)
      : resolveTools({ type: "all" });

    // Merge agents
    const agents = mergeAgents(mergedOptions.agents, CANVAS_AGENTS);

    // Emit system message if requested
    if (mergedOptions.includeSystemMessage !== false) {
      const systemMessage: SDKSystemMessage = {
        type: "system",
        tools,
        model: currentModel || "gemini-2.5-flash",
        sessionId,
        cwd: mergedOptions.cwd,
        agents: Object.keys(agents),
        timestamp: Date.now(),
      };
      yield systemMessage;
    }

    // Run hooks for SessionStart
    await runHooks("SessionStart", {
      type: "SessionStart",
      sessionId,
      config: mergedOptions as unknown as Record<string, unknown>,
      timestamp: Date.now(),
    }, mergedOptions.hooks || []);

    // Get prompt string
    const promptString = typeof prompt === "string"
      ? prompt
      : await collectAsyncIterable(prompt);

    // Check for abort
    if (aborted || abortController.signal.aborted) {
      yield createAbortedResult(sessionId);
      return;
    }

    try {
      // Track metrics
      let totalTokens = 0;
      let toolCalls = 0;
      let turns = 0;
      const startTime = Date.now();

      // Run the agentic loop using native execution
      // Note: Cast provider since CanvasAgentOptions allows "anthropic" but only google/openai are implemented
      for await (const event of runAgenticLoop(promptString, mergedOptions.canvasId, {
        sessionId,
        model: mergedOptions.model as string | undefined,
        provider: mergedOptions.provider as "google" | "openai" | undefined,
        mcpUrl: mergedOptions.mcpUrl,
        verbose: mergedOptions.verbose,
        signal: abortController.signal,
        // Pass custom MCP client if provided (used by benchmarks)
        mcpClient: (mergedOptions as Record<string, unknown>).mcpClient as
          | import("./loop/types.js").LoopOptions["mcpClient"]
          | undefined,
      })) {
        // Check for abort
        if (aborted || abortController.signal.aborted) {
          yield createAbortedResult(sessionId, startTime, totalTokens, toolCalls, turns);
          return;
        }

        // Track metrics
        if (event.type === "acting") {
          toolCalls++;
        }
        if (event.type === "thinking") {
          turns++;
        }
        if ("tokensUsed" in event && typeof event.tokensUsed === "number") {
          totalTokens += event.tokensUsed;
        }

        // Run PreToolUse hooks for "acting" events (tool execution)
        if (event.type === "acting" && "tool" in event && event.tool) {
          const hookResult = await runHooks("PreToolUse", {
            type: "PreToolUse",
            tool: String(event.tool),
            toolInput: "input" in event ? event.input : undefined,
            sessionId,
            timestamp: Date.now(),
          }, mergedOptions.hooks || []);

          if (hookResult?.proceed === false) {
            // Skip this tool call
            continue;
          }
        }

        // Run PostToolUse hooks for "observing" events (tool results)
        if (event.type === "observing" && "result" in event && event.result !== undefined) {
          await runHooks("PostToolUse", {
            type: "PostToolUse",
            tool: "tool" in event && event.tool ? String(event.tool) : "unknown",
            toolInput: undefined,
            toolResult: event.result,
            sessionId,
            timestamp: Date.now(),
          }, mergedOptions.hooks || []);
        }

        // Convert to SDK message (cast to handle type differences)
        const sdkMessage = agentEventToSDKMessage(event as Parameters<typeof agentEventToSDKMessage>[0], sessionId);

        // Filter partial messages if not requested
        if (sdkMessage.type === "partial" && !mergedOptions.includePartialMessages) {
          continue;
        }

        yield sdkMessage;

        // If this is a result, we're done
        if (sdkMessage.type === "result") {
          break;
        }
      }

      // Run SessionEnd hooks
      await runHooks("SessionEnd", {
        type: "SessionEnd",
        sessionId,
        timestamp: Date.now(),
      }, mergedOptions.hooks || []);

    } catch (error) {
      // Run PostToolUseFailure hooks
      await runHooks("PostToolUseFailure", {
        type: "PostToolUseFailure",
        tool: "unknown",
        toolInput: undefined,
        error: error instanceof Error ? error : new Error(String(error)),
        sessionId,
        timestamp: Date.now(),
      }, mergedOptions.hooks || []);

      // Yield error result
      const errorResult: SDKResultMessage = {
        type: "result",
        success: false,
        error: error instanceof Error ? error.message : String(error),
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        durationMs: 0,
        turns: 0,
        toolCalls: 0,
        sessionId,
        timestamp: Date.now(),
      };
      yield errorResult;
    }
  }

  // Return Query object
  const generator = generateMessages();

  return {
    [Symbol.asyncIterator]() {
      return generator;
    },

    interrupt() {
      aborted = true;
      abortController.abort();
    },

    setModel(model: string) {
      currentModel = model;
    },

    getSessionId() {
      return sessionId;
    },

    isRunning() {
      return !aborted && !abortController.signal.aborted;
    },

    async supportedModels() {
      return [
        "gemini-2.5-pro",
        "gemini-2.5-flash",
        "gemini-2.5-flash-lite",
        "gpt-4o-2024-11-20",
        "gpt-4o-mini",
        "gpt-4-turbo",
        "claude-sonnet-4-5-20250929",
        "claude-3-5-sonnet-20241022",
        "claude-3-5-haiku-20241022",
      ];
    },

    async mcpServerStatus() {
      // TODO: Implement actual MCP server status check
      return {
        "canvas-mcp": {
          connected: !!mergedOptions.mcpUrl,
          tools: resolveTools({ type: "all" }),
        },
      };
    },
  };
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Collect async iterable into string
 */
async function collectAsyncIterable(iterable: AsyncIterable<string>): Promise<string> {
  const parts: string[] = [];
  for await (const part of iterable) {
    parts.push(part);
  }
  return parts.join("");
}

/**
 * Create aborted result message
 */
function createAbortedResult(
  sessionId?: string,
  startTime?: number,
  totalTokens = 0,
  toolCalls = 0,
  turns = 0
): SDKResultMessage {
  return {
    type: "result",
    success: false,
    error: "Query was interrupted",
    usage: {
      inputTokens: totalTokens,
      outputTokens: 0,
      totalTokens,
    },
    durationMs: startTime ? Date.now() - startTime : 0,
    turns,
    toolCalls,
    sessionId,
    timestamp: Date.now(),
  };
}

/**
 * Run hooks for an event
 */
async function runHooks(
  eventType: string,
  input: HookInput,
  hooks: HookConfig[]
): Promise<HookOutput | void> {
  const sortedHooks = sortHooksByPriority(hooks);

  for (const hook of sortedHooks) {
    if (!matchesHook(hook, input)) continue;

    try {
      const result = await hook.handler(input);
      if (result?.proceed === false) {
        return result;
      }
    } catch (error) {
      console.error(`Hook error for ${eventType}:`, error);
    }
  }
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * One-shot prompt convenience function
 *
 * @example
 * ```typescript
 * const result = await prompt('Create 3 rectangles', { canvasId: 'my-canvas' });
 * console.log(result.summary);
 * ```
 */
export async function prompt(
  input: string,
  options?: QueryOptions
): Promise<SDKResultMessage> {
  const messages = query(input, {
    ...options,
    includePartialMessages: false,
  });

  let result: SDKResultMessage | undefined;

  for await (const message of messages) {
    if (isResultMessage(message)) {
      result = message;
      break;
    }
  }

  return result || {
    type: "result",
    success: false,
    error: "No result received",
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    durationMs: 0,
    turns: 0,
    toolCalls: 0,
    timestamp: Date.now(),
  };
}

/**
 * Run query and collect all messages
 */
export async function runQuery(
  input: string,
  options?: QueryOptions
): Promise<SDKMessage[]> {
  const messages: SDKMessage[] = [];
  const q = query(input, options);

  for await (const message of q) {
    messages.push(message);
  }

  return messages;
}

/**
 * Stream query with custom handler
 */
export async function streamQuery(
  input: string,
  options: QueryOptions,
  handler: (message: SDKMessage) => void | Promise<void>
): Promise<SDKResultMessage> {
  const q = query(input, options);
  let result: SDKResultMessage | undefined;

  for await (const message of q) {
    await handler(message);
    if (isResultMessage(message)) {
      result = message;
    }
  }

  return result || {
    type: "result",
    success: false,
    error: "No result received",
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    durationMs: 0,
    turns: 0,
    toolCalls: 0,
    timestamp: Date.now(),
  };
}

// ============================================================================
// SSE STREAMING HANDLER
// ============================================================================

/**
 * Express/HTTP-compatible response interface
 */
export interface SSEResponse {
  setHeader: (name: string, value: string) => void;
  write: (data: string) => void;
  end: () => void;
}

/**
 * Handle canvas agent stream for HTTP/SSE responses
 *
 * @example
 * ```typescript
 * import express from "express";
 * import { handleQueryStream } from '@waiboard/ai-agents/sdk';
 *
 * const app = express();
 *
 * app.post("/api/canvas/agent", async (req, res) => {
 *   await handleQueryStream(req.body.task, req.body, res);
 * });
 * ```
 */
export async function handleQueryStream(
  input: string,
  options: QueryOptions,
  res: SSEResponse
): Promise<void> {
  // Set up SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const q = query(input, options);

    for await (const message of q) {
      res.write(`data: ${JSON.stringify(message)}\n\n`);

      // If this is a result, we're done
      if (message.type === "result") {
        break;
      }
    }
  } catch (error) {
    const errorResult: SDKResultMessage = {
      type: "result",
      success: false,
      error: error instanceof Error ? error.message : String(error),
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      durationMs: 0,
      turns: 0,
      toolCalls: 0,
      timestamp: Date.now(),
    };
    res.write(`data: ${JSON.stringify(errorResult)}\n\n`);
  } finally {
    res.end();
  }
}

/**
 * Alias for handleQueryStream for backward compatibility
 * @deprecated Use handleQueryStream instead
 */
export const handleCanvasAgentStream = handleQueryStream;
