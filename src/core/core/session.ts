/**
 * Session API (SDK V2 Pattern)
 *
 * Session-based interface for multi-turn conversations.
 * Each turn is a separate send()/stream() cycle.
 *
 * @see https://platform.claude.com/docs/en/agent-sdk/typescript-v2-preview
 *
 * @example
 * ```typescript
 * import { createSession } from '@waiboard/ai-agents/sdk';
 *
 * // Create session
 * const session = await createSession({ canvasId: 'my-canvas' });
 *
 * // First turn
 * await session.send('Create a flowchart');
 * for await (const message of session.stream()) {
 *   console.log(message);
 * }
 *
 * // Second turn (context preserved)
 * await session.send('Add colors to the boxes');
 * for await (const message of session.stream()) {
 *   console.log(message);
 * }
 *
 * // Cleanup
 * await session.close();
 * ```
 */

import { nanoid } from "nanoid";
import type { CanvasAgentOptions } from "./options.js";
import { mergeWithDefaults } from "./options.js";
import type {
  SDKMessage,
  SDKSystemMessage,
  SDKResultMessage,
} from "./messages.js";
import { agentEventToSDKMessage } from "./messages.js";
import { resolveTools } from "./tools.js";
import { mergeAgents, GENERIC_AGENTS } from "./agents.js";

// Legacy alias
const CANVAS_AGENTS = GENERIC_AGENTS;
import type { HookConfig, HookInput, HookOutput } from "./hooks.js";
import { sortHooksByPriority, matchesHook } from "./hooks.js";
import { runAgenticLoop } from "./execution.js";

// ============================================================================
// SESSION OPTIONS
// ============================================================================

/**
 * Session creation options
 */
export interface SessionOptions extends Partial<CanvasAgentOptions> {
  /** Include partial messages in stream */
  includePartialMessages?: boolean;
}

// ============================================================================
// SESSION INTERFACE
// ============================================================================

/**
 * Session interface for multi-turn conversations
 */
export interface Session {
  /**
   * Send a message to the agent
   */
  send(message: string): Promise<void>;

  /**
   * Stream responses from the agent
   */
  stream(): AsyncGenerator<SDKMessage>;

  /**
   * Close the session
   */
  close(): Promise<void>;

  /**
   * Get the session ID
   */
  getSessionId(): string;

  /**
   * Fork this session into a new one
   */
  fork(): Promise<Session>;

  /**
   * Check if session is active
   */
  isActive(): boolean;

  /**
   * Get conversation history
   */
  getHistory(): SessionMessage[];

  /**
   * Clear conversation history
   */
  clearHistory(): void;

  /**
   * Update session configuration
   */
  updateConfig(updates: Partial<SessionOptions>): void;

  /**
   * Get current configuration
   */
  getConfig(): SessionOptions;

  /**
   * Interrupt current streaming operation
   */
  interrupt(): void;
}

/**
 * Session message (user or assistant)
 */
export interface SessionMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

// ============================================================================
// SESSION STATE
// ============================================================================

interface SessionState {
  id: string;
  options: CanvasAgentOptions;
  history: SessionMessage[];
  pendingMessage: string | null;
  isStreaming: boolean;
  closed: boolean;
  abortController: AbortController | null;
}

// ============================================================================
// SESSION IMPLEMENTATION
// ============================================================================

/**
 * Create a new session
 */
export async function createSession(
  options?: SessionOptions
): Promise<Session> {
  const sessionId = `session_${nanoid(12)}`;
  const mergedOptions = mergeWithDefaults(options || { canvasId: "" });

  const state: SessionState = {
    id: sessionId,
    options: mergedOptions,
    history: [],
    pendingMessage: null,
    isStreaming: false,
    closed: false,
    abortController: null,
  };

  return createSessionFromState(state);
}

/**
 * Resume an existing session
 */
export async function resumeSession(
  sessionId: string,
  options?: SessionOptions
): Promise<Session> {
  const mergedOptions = mergeWithDefaults(options || { canvasId: "" });

  // TODO: Load session state from storage
  // For now, create a new session with the given ID
  const state: SessionState = {
    id: sessionId,
    options: mergedOptions,
    history: [],
    pendingMessage: null,
    isStreaming: false,
    closed: false,
    abortController: null,
  };

  return createSessionFromState(state);
}

/**
 * Create session object from state
 */
function createSessionFromState(state: SessionState): Session {
  return {
    async send(message: string): Promise<void> {
      if (state.closed) {
        throw new Error("Session is closed");
      }
      if (state.isStreaming) {
        throw new Error("Cannot send while streaming");
      }
      state.pendingMessage = message;
      state.history.push({
        role: "user",
        content: message,
        timestamp: Date.now(),
      });
    },

    async *stream(): AsyncGenerator<SDKMessage> {
      if (state.closed) {
        throw new Error("Session is closed");
      }
      if (!state.pendingMessage) {
        throw new Error("No pending message. Call send() first.");
      }
      if (state.isStreaming) {
        throw new Error("Already streaming");
      }

      state.isStreaming = true;
      const message = state.pendingMessage;
      state.pendingMessage = null;

      try {
        // Build context from history
        const context = buildContextFromHistory(state.history.slice(0, -1));

        // Resolve tools and agents
        const tools = state.options.tools
          ? resolveTools(state.options.tools)
          : resolveTools({ type: "all" });

        // Emit system message on first turn
        if (state.history.length === 1) {
          const agents = mergeAgents(state.options.agents, CANVAS_AGENTS);
          const systemMessage: SDKSystemMessage = {
            type: "system",
            tools,
            model: state.options.model || "gemini-2.5-flash",
            sessionId: state.id,
            cwd: state.options.cwd,
            agents: Object.keys(agents),
            timestamp: Date.now(),
          };
          yield systemMessage;
        }

        // Run hooks
        await runHooks("SessionStart", {
          type: "SessionStart",
          sessionId: state.id,
          timestamp: Date.now(),
        }, state.options.hooks || []);

        // Build prompt with context
        const promptWithContext = context
          ? `${context}\n\nUser: ${message}`
          : message;

        // Track metrics
        let totalTokens = 0;
        let toolCalls = 0;
        let turns = 0;
        const startTime = Date.now();
        let lastResponse = "";

        // Create abort controller for this stream
        state.abortController = new AbortController();

        // Run the agentic loop using native execution
        for await (const event of runAgenticLoop(promptWithContext, state.options.canvasId, {
          sessionId: state.id,
          model: (state.options.model as "fast" | "balanced" | "powerful" | undefined),
          mcpUrl: state.options.mcpUrl,
          verbose: state.options.verbose,
          signal: state.abortController.signal,
        })) {
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

          // Capture response for history
          if (event.type === "complete" && "summary" in event) {
            lastResponse = String(event.summary);
          }

          // Run hooks for tool events (acting = tool use)
          if (event.type === "acting" && "tool" in event && event.tool) {
            const hookResult = await runHooks("PreToolUse", {
              type: "PreToolUse",
              tool: String(event.tool),
              toolInput: "input" in event ? event.input : undefined,
              sessionId: state.id,
              timestamp: Date.now(),
            }, state.options.hooks || []);

            if (hookResult?.proceed === false) {
              continue;
            }
          }

          // Convert to SDK message (cast to handle type differences)
          const sdkMessage = agentEventToSDKMessage(event as Parameters<typeof agentEventToSDKMessage>[0], state.id);

          // Filter partial messages if not requested
          if (sdkMessage.type === "partial" && !state.options.includePartialMessages) {
            continue;
          }

          yield sdkMessage;
        }

        // Add assistant response to history
        if (lastResponse) {
          state.history.push({
            role: "assistant",
            content: lastResponse,
            timestamp: Date.now(),
          });
        }

        // Run SessionEnd hooks
        await runHooks("SessionEnd", {
          type: "SessionEnd",
          sessionId: state.id,
          timestamp: Date.now(),
        }, state.options.hooks || []);

      } catch (error) {
        const errorResult: SDKResultMessage = {
          type: "result",
          success: false,
          error: error instanceof Error ? error.message : String(error),
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          durationMs: 0,
          turns: 0,
          toolCalls: 0,
          sessionId: state.id,
          timestamp: Date.now(),
        };
        yield errorResult;
      } finally {
        state.isStreaming = false;
      }
    },

    async close(): Promise<void> {
      if (state.closed) return;
      state.closed = true;

      // Run Stop hooks
      await runHooks("Stop", {
        type: "Stop",
        reason: "user_interrupt",
        sessionId: state.id,
        timestamp: Date.now(),
      }, state.options.hooks || []);

      // TODO: Persist session state if needed
    },

    getSessionId(): string {
      return state.id;
    },

    async fork(): Promise<Session> {
      const newState: SessionState = {
        id: `session_${nanoid(12)}`,
        options: { ...state.options },
        history: [...state.history],
        pendingMessage: null,
        isStreaming: false,
        closed: false,
        abortController: null,
      };
      return createSessionFromState(newState);
    },

    isActive(): boolean {
      return !state.closed;
    },

    getHistory(): SessionMessage[] {
      return [...state.history];
    },

    clearHistory(): void {
      state.history = [];
    },

    updateConfig(updates: Partial<SessionOptions>): void {
      state.options = { ...state.options, ...updates };
    },

    getConfig(): SessionOptions {
      return { ...state.options };
    },

    interrupt(): void {
      if (state.abortController) {
        state.abortController.abort();
        state.abortController = null;
      }
    },
  };
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Build context string from conversation history
 */
function buildContextFromHistory(history: SessionMessage[]): string {
  if (history.length === 0) return "";

  const contextParts: string[] = ["Previous conversation:"];

  for (const msg of history.slice(-5)) { // Keep last 5 messages for context
    const role = msg.role === "user" ? "User" : "Assistant";
    contextParts.push(`${role}: ${msg.content}`);
  }

  return contextParts.join("\n");
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
// SESSION STORAGE (Stub for future implementation)
// ============================================================================

/**
 * Session storage interface
 */
export interface SessionStorage {
  save(sessionId: string, state: SessionState): Promise<void>;
  load(sessionId: string): Promise<SessionState | null>;
  delete(sessionId: string): Promise<void>;
  list(): Promise<string[]>;
}

/**
 * In-memory session storage
 */
export function createInMemoryStorage(): SessionStorage {
  const sessions = new Map<string, SessionState>();

  return {
    async save(sessionId, state) {
      sessions.set(sessionId, state);
    },

    async load(sessionId) {
      return sessions.get(sessionId) || null;
    },

    async delete(sessionId) {
      sessions.delete(sessionId);
    },

    async list() {
      return Array.from(sessions.keys());
    },
  };
}
