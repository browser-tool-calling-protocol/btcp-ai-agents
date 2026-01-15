/**
 * Execution Engine
 *
 * SDK-aligned entry point for canvas agent execution.
 * Provides the `execute()` function as the primary API.
 *
 * The execution engine runs a THINK → ACT → OBSERVE → DECIDE loop
 * with streaming async generator for real-time feedback.
 *
 * @module @waiboard/ai-agents/core
 *
 * @example
 * ```typescript
 * import { execute, type ExecuteOptions, type SDKMessage } from '@waiboard/ai-agents/core';
 *
 * // Execute a task
 * for await (const message of execute('Create a flowchart', {
 *   canvasId: 'my-canvas',
 *   model: 'balanced',
 * })) {
 *   if (message.type === 'partial') {
 *     console.log('Progress:', message.content);
 *   } else if (message.type === 'result') {
 *     console.log('Done:', message.summary);
 *   }
 * }
 * ```
 */

import { nanoid } from "nanoid";
import type { ModelPreference, ModelProvider } from "../types/index.js";
import type { AgentEvent as LoopAgentEvent, AgentMode } from "../agents/types.js";
import type { HooksManager } from "../hooks/manager.js";
import type { ContextManager } from "../context/manager.js";
import type { ResourceRegistry } from "../resources/registry.js";
import type { SessionSerializer } from "../context/serialization.js";
import type { HookConfig } from "./hooks.js";
import type { ToolsOption } from "./tools.js";
import type { AgentsOption } from "./agents.js";
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
import { MODEL_DEFAULTS, LOOP_DEFAULTS } from "./constants.js";

// Re-export the loop for internal use
export { runAgenticLoop } from "./loop.js";
export type { LoopOptions, MCPExecutor } from "./loop.js";

// ============================================================================
// EXECUTE OPTIONS
// ============================================================================

/**
 * Options for the execute() function
 */
export interface ExecuteOptions {
  /** Canvas ID to operate on (required) */
  canvasId: string;

  /** Session ID for persistence (auto-generated if not provided) */
  sessionId?: string;

  /** Model preference tier: 'fast', 'balanced', or 'powerful' */
  model?: ModelPreference;

  /** LLM provider: 'google' or 'openai' */
  provider?: ModelProvider;

  /** MCP server URL (defaults to localhost:3112) */
  mcpUrl?: string;

  /** Maximum iterations before timeout */
  maxIterations?: number;

  /** Token budget for context */
  tokenBudget?: number;

  /** Enable verbose logging */
  verbose?: boolean;

  /** Abort signal for cancellation */
  abortSignal?: AbortSignal;

  /** Tools to enable (defaults to all) */
  tools?: ToolsOption;

  /** Agents configuration */
  agents?: AgentsOption;

  /** Hooks configuration */
  hooks?: HookConfig[];

  /** Working directory context */
  cwd?: string;

  /** Include partial messages in stream */
  includePartialMessages?: boolean;

  /** Include system message at start */
  includeSystemMessage?: boolean;

  // Advanced options (for internal use)

  /** Pre-configured context manager */
  contextManager?: ContextManager;

  /** Pre-configured hooks manager */
  hooksManager?: HooksManager;

  /** Pre-configured resource registry */
  resourceRegistry?: ResourceRegistry;

  /** Session serializer for persistence */
  sessionSerializer?: SessionSerializer;

  /** Custom system prompt (overrides default) */
  systemPrompt?: string;

  /** Agent mode override */
  mode?: AgentMode;

  /** Skip MCP connection check (for testing) */
  skipMcpConnection?: boolean;
}

// ============================================================================
// EXECUTE FUNCTION
// ============================================================================

/**
 * Execute a canvas agent task
 *
 * This is the primary SDK-aligned entry point for canvas agent execution.
 * Returns an async generator that yields SDK messages during execution.
 *
 * @param task - The task description
 * @param options - Execution options
 * @returns Async generator yielding SDK messages
 *
 * @example
 * ```typescript
 * // Stream execution events
 * for await (const message of execute('Create a mindmap about AI', {
 *   canvasId: 'my-canvas',
 *   model: 'balanced',
 * })) {
 *   switch (message.type) {
 *     case 'system':
 *       console.log('Session started:', message.sessionId);
 *       break;
 *     case 'partial':
 *       console.log('Progress:', message.content);
 *       break;
 *     case 'tool':
 *       console.log('Tool call:', message.tool, message.input);
 *       break;
 *     case 'result':
 *       console.log('Done:', message.success ? message.summary : message.error);
 *       break;
 *   }
 * }
 * ```
 */
export async function* execute(
  task: string,
  options: ExecuteOptions
): AsyncGenerator<SDKMessage> {
  const sessionId = options.sessionId || `session_${nanoid(12)}`;

  // Resolve tools
  const tools = options.tools
    ? resolveTools(options.tools)
    : resolveTools({ type: "all" });

  // Merge agents
  const agents = mergeAgents(options.agents, CANVAS_AGENTS);

  // Emit system message if requested
  if (options.includeSystemMessage !== false) {
    const systemMessage: SDKSystemMessage = {
      type: "system",
      tools,
      model: options.model || MODEL_DEFAULTS.model,
      sessionId,
      cwd: options.cwd,
      agents: Object.keys(agents),
      timestamp: Date.now(),
    };
    yield systemMessage;
  }

  // Track metrics
  let totalTokens = 0;
  let toolCalls = 0;
  let turns = 0;
  const startTime = Date.now();

  try {
    // Import and run the agentic loop
    const { runAgenticLoop } = await import("./loop.js");

    // Run the loop
    for await (const event of runAgenticLoop(task, options.canvasId, {
      sessionId,
      model: options.model,
      provider: options.provider,
      mcpUrl: options.mcpUrl,
      maxIterations: options.maxIterations ?? LOOP_DEFAULTS.maxIterations,
      tokenBudget: options.tokenBudget ?? LOOP_DEFAULTS.tokenBudget,
      verbose: options.verbose,
      signal: options.abortSignal,
      systemPrompt: options.systemPrompt,
      mode: options.mode,
      contextManager: options.contextManager,
      hooksManager: options.hooksManager,
      resourceRegistry: options.resourceRegistry,
      sessionSerializer: options.sessionSerializer,
      skipMcpConnection: options.skipMcpConnection,
    })) {
      // Check for abort
      if (options.abortSignal?.aborted) {
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

      // Convert to SDK message (cast to handle type differences)
      const sdkMessage = agentEventToSDKMessage(event as Parameters<typeof agentEventToSDKMessage>[0], sessionId);

      // Filter partial messages if not requested
      if (sdkMessage.type === "partial" && !options.includePartialMessages) {
        continue;
      }

      yield sdkMessage;

      // If this is a result, we're done
      if (sdkMessage.type === "result") {
        break;
      }
    }
  } catch (error) {
    // Yield error result
    const errorResult: SDKResultMessage = {
      type: "result",
      success: false,
      error: error instanceof Error ? error.message : String(error),
      usage: {
        inputTokens: totalTokens,
        outputTokens: 0,
        totalTokens,
      },
      durationMs: Date.now() - startTime,
      turns,
      toolCalls,
      sessionId,
      timestamp: Date.now(),
    };
    yield errorResult;
  }
}

/**
 * Create aborted result message
 */
function createAbortedResult(
  sessionId: string,
  startTime: number,
  totalTokens: number,
  toolCalls: number,
  turns: number
): SDKResultMessage {
  return {
    type: "result",
    success: false,
    error: "Execution was interrupted",
    usage: {
      inputTokens: totalTokens,
      outputTokens: 0,
      totalTokens,
    },
    durationMs: Date.now() - startTime,
    turns,
    toolCalls,
    sessionId,
    timestamp: Date.now(),
  };
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Execute and collect all messages
 *
 * @param task - The task description
 * @param options - Execution options
 * @returns Array of all SDK messages
 */
export async function runExecution(
  task: string,
  options: ExecuteOptions
): Promise<SDKMessage[]> {
  const messages: SDKMessage[] = [];

  for await (const message of execute(task, options)) {
    messages.push(message);
  }

  return messages;
}

/**
 * Execute and get final result only
 *
 * @param task - The task description
 * @param options - Execution options
 * @returns The final result message
 */
export async function getExecutionResult(
  task: string,
  options: ExecuteOptions
): Promise<SDKResultMessage> {
  let result: SDKResultMessage | undefined;

  for await (const message of execute(task, {
    ...options,
    includePartialMessages: false,
  })) {
    if (message.type === "result") {
      result = message as SDKResultMessage;
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

// ============================================================================
// RE-EXPORTS FOR BACKWARD COMPATIBILITY
// ============================================================================

// Re-export types from agents/types
export type {
  AgentEvent,
  AgentConfig,
  AgentState,
  CancellationToken,
} from "../agents/types.js";

// Re-export helper functions
export {
  initializeResources,
  runCanvasAgent,
  getCanvasAgentResult,
  type AgentResources,
} from "./loop.js";
