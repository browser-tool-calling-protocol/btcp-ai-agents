/**
 * Agentic Loop
 *
 * Core implementation of the THINK → ACT → OBSERVE → DECIDE loop
 * with streaming async generator for real-time feedback.
 *
 * ## Architecture
 *
 * ```
 * ┌─────────────────────────────────────────────────────────────┐
 * │                        AGENTIC LOOP                          │
 * │                                                               │
 * │   ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐  │
 * │   │  THINK  │───▶│   ACT   │───▶│ OBSERVE │───▶│ DECIDE  │  │
 * │   │         │    │         │    │         │    │         │  │
 * │   │Context  │    │Execute  │    │Process  │    │Continue │  │
 * │   │Awareness│    │Tools    │    │Results  │    │Complete │  │
 * │   │Messages │    │         │    │State    │    │Fail     │  │
 * │   └─────────┘    └─────────┘    └─────────┘    └─────────┘  │
 * │        │                                             │       │
 * │        └─────────────────────────────────────────────┘       │
 * │                        (if continue)                         │
 * └─────────────────────────────────────────────────────────────┘
 * ```
 *
 * @see docs/engineering/CLAUDE_CODE_PATTERNS.md#the-agentic-loop
 */

import type {
  LoopContext,
  LoopState,
  LoopOptions,
  AgentEvent,
  AgentConfig,
  CancellationToken,
  McpClient,
  AgentToolName,
  ActionAdapter,
} from "./types.js";

// Phase imports
import { think, thinkTestMode } from "./think.js";
import { act, actAll, actTestMode } from "./act.js";
import { observe, observeAll, saveCheckpointIfDue, handleGenerationError } from "./observe.js";
import { decide, createDecisionEvents, createReasoningEvent, isTerminal } from "./decide.js";
import { createCanvasTools } from "./tools.js";

// Integration system imports
import { createProvider, type LLMProvider } from "../providers/index.js";
import { getModelId } from "../client.js";
import { toolSetToGeminiFormat } from "../../tools/ai-sdk-bridge.js";
import { getSystemPrompt } from "../../agents/prompts.js";
import { detectAgentMode } from "../../agents/mode-detection.js";
import { getSkillRegistry } from "../../skills/index.js";

// Adapter imports
import { createMCPAdapter } from "../../adapters/mcp-adapter.js";

// Helper function for skill injection
function injectRelevantSkills(task: string, systemPrompt: string): string {
  const registry = getSkillRegistry();
  const result = registry.injectSkills(task, systemPrompt);
  return result.prompt;
}

// Alias for backward compatibility
const getSystemPromptWithXml = getSystemPrompt;
import { createToolExecutor } from "../../tools/executor.js";
import { HttpMcpClient } from "../../mcp/http-client.js";
import { createContextManager } from "../../context/manager.js";
import { MemoryTier, MessagePriority } from "../../context/types.js";
import { createHooksManager, CommonHooks } from "../../hooks/manager.js";
import { createResourceRegistry } from "../../resources/registry.js";
import { registerBuiltInProviders } from "../../resources/providers.js";
import { generateSessionId } from "../../context/serialization.js";
import { ToolResultLifecycle } from "../../context/tool-lifecycle.js";
import { EchoPoisoningPrevention } from "../../context/echo-prevention.js";
import { MODEL_DEFAULTS, LOOP_DEFAULTS } from "../constants.js";
import { extractUserResponse } from "../response-extractor.js";

// Re-export types
export type { MCPExecutor, LoopOptions, LoopContext, LoopState } from "./types.js";
export type { AgentConfig, AgentEvent, AgentState, CancellationToken } from "./types.js";

// Re-export phase functions for testing
export { think, thinkTestMode } from "./think.js";
export { act, actAll, actTestMode } from "./act.js";
export { observe, observeAll, saveCheckpointIfDue, handleGenerationError } from "./observe.js";
export { decide, createDecisionEvents, isTerminal } from "./decide.js";
export { createCanvasTools, executeToolWithHooks } from "./tools.js";

// Re-export context functions
export {
  getAwarenessWithCaching,
  fetchAwarenessFromMcp,
  fetchAwarenessFromAdapter,
  fetchAwareness,
  fetchCanvasSnapshot,
  formatCanvasForContext,
  formatTasksForContext,
  formatUserMessage,
  injectCanvasContextForIteration,
  handleMutationToolEffect,
} from "./context.js";

// Re-export adapter types
export type { ActionAdapter } from "./types.js";

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize integration systems with defaults if not provided
 */
function initializeIntegrationSystems(
  config: AgentConfig,
  optionsHooks?: LoopOptions["hooks"],
  optionsRegistry?: LoopOptions["registry"]
) {
  // Context Manager (6-tier memory)
  const contextManager = config.contextManager ?? createContextManager({
    maxTokens: config.tokenBudget ?? LOOP_DEFAULTS.tokenBudget,
  });

  // Hooks Manager - prefer options.hooks, then config.hooksManager, then create new
  const hooksManager = optionsHooks ?? config.hooksManager ?? createHooksManager();
  if (!optionsHooks && !config.hooksManager) {
    // Register default hooks only if we created a new manager
    hooksManager.registerPostHook(CommonHooks.logOperations(config.verbose));
    hooksManager.registerPostHook(CommonHooks.trackElements());
    hooksManager.registerPreHook(CommonHooks.validateBounds());
  }

  // Resource Registry - prefer options.registry, then config.resourceRegistry, then create new
  const resourceRegistry = optionsRegistry ?? config.resourceRegistry ?? createResourceRegistry();
  if (!optionsRegistry && !config.resourceRegistry) {
    registerBuiltInProviders(resourceRegistry);
  }

  // Session Serializer (optional)
  const sessionSerializer = config.sessionSerializer;

  return { contextManager, hooksManager, resourceRegistry, sessionSerializer };
}

/**
 * Initialize loop context and state
 *
 * @param task - The task to execute
 * @param sessionId - Session identifier (previously canvasId for backward compat)
 */
async function initializeLoop(
  task: string,
  sessionId: string,
  options?: LoopOptions,
  cancellation?: CancellationToken
): Promise<{ ctx: LoopContext; state: LoopState; delegationEvents: AgentEvent[] }> {
  // Merge options into config
  const config: AgentConfig = {
    sessionId,
    ...options,
  };

  const startTime = Date.now();
  const maxIterations = config.maxIterations ?? LOOP_DEFAULTS.maxIterations;
  const checkpointInterval = config.checkpointInterval ?? LOOP_DEFAULTS.checkpointInterval;
  const enableAliasResolution = config.enableAliasResolution ?? LOOP_DEFAULTS.enableAliasResolution;
  const maxHistoryEntries = LOOP_DEFAULTS.maxHistoryEntries;

  // Initialize integration systems
  const {
    contextManager,
    hooksManager,
    resourceRegistry,
    sessionSerializer,
  } = initializeIntegrationSystems(config, options?.hooks, options?.registry);

  // Session ID for persistence
  const sessionId = config.sessionId || generateSessionId("agent");

  // Context management systems
  const toolLifecycle = new ToolResultLifecycle({
    recentThreshold: 1,
    archiveThreshold: 5,
    evictThreshold: 15,
  });

  const echoPrevention = new EchoPoisoningPrevention({
    maxRecentErrors: 10,
    loopThreshold: 2,
  });

  // Resolve aliases if enabled
  let resolvedTask = task;
  const aliasEvents: AgentEvent[] = [];

  if (enableAliasResolution && resourceRegistry.containsAliases(task)) {
    const aliasPattern = /@\w+(?:\([^)]*\))?/g;
    const aliases = task.match(aliasPattern) || [];

    aliasEvents.push({
      type: "alias_resolving",
      timestamp: Date.now(),
      aliases,
    });

    const aliasResult = await resourceRegistry.resolveAliases(task, {
      sessionId: config.sessionId,
    });

    aliasEvents.push({
      type: "alias_resolved",
      timestamp: Date.now(),
      original: task,
      resolved: aliasResult.contextText,
      aliasCount: aliasResult.aliases.length,
      totalTokens: aliasResult.totalTokens,
      errors: aliasResult.errors,
    });

    resolvedTask = aliasResult.contextText;

    // Add resolved alias context to context manager
    if (aliasResult.aliases.length > 0) {
      contextManager.addMessage({
        id: `alias_context_${Date.now()}`,
        role: "system",
        content: `Resolved aliases:\n${aliasResult.aliases
          .filter((a) => a.resource.success)
          .map((a) => `- ${a.alias.match}: ${a.resource.summary}`)
          .join("\n")}`,
        timestamp: Date.now(),
        tokens: aliasResult.totalTokens,
        priority: MessagePriority.HIGH,
        compressible: true,
      }, { tier: MemoryTier.RESOURCES });
    }
  }

  // Detect mode and build system prompt
  // Store the detected mode in config so it's accessible in context
  const detectedMode =
    config.mode ||
    (config.autoDetectMode !== false ? detectAgentMode(resolvedTask) : "general");
  config.mode = detectedMode;

  let systemPrompt = config.systemPrompt || getSystemPromptWithXml(detectedMode);
  systemPrompt = injectRelevantSkills(resolvedTask, systemPrompt);

  // Add system prompt to context manager
  contextManager.addSystemMessage(systemPrompt);

  // ===========================================================================
  // ADAPTER & CLIENT INITIALIZATION
  // ===========================================================================

  // Use provided adapter or create MCP adapter for backward compatibility
  let adapter: ActionAdapter | undefined = options?.adapter;
  let mcpClient: McpClient & { connect(): Promise<boolean>; disconnect(): void };

  if (adapter) {
    // Adapter provided - create a minimal MCP client wrapper for compatibility
    mcpClient = {
      callTool: async (name: string, args: Record<string, unknown>) => {
        const result = await adapter!.execute(name, args);
        if (!result.success) {
          throw new Error(result.error?.message || "Tool execution failed");
        }
        return result.data;
      },
      connect: () => adapter!.connect(),
      disconnect: () => adapter!.disconnect(),
      readResource: async (uri: string) => {
        // Adapters don't have readResource, fall back to getState
        const state = await adapter!.getState();
        return state.data || {};
      },
    } as McpClient & { connect(): Promise<boolean>; disconnect(): void; readResource(uri: string): Promise<unknown> };
  } else {
    // No adapter - use legacy MCP client
    const mcp = options?.mcpClient ?? new HttpMcpClient({
      baseUrl: config.mcpUrl || process.env.CANVAS_MCP_URL || "http://localhost:3112",
      canvasId: config.sessionId || sessionId,
      debug: config.verbose,
    });
    mcpClient = mcp as McpClient & { connect(): Promise<boolean>; disconnect(): void };

    // Create MCP adapter wrapper for unified interface
    if (!config.skipMcpConnection) {
      adapter = createMCPAdapter({
        client: mcp as HttpMcpClient,
        canvasId: config.sessionId || sessionId,
      });
    }
  }

  // Create tool executor
  const executor = createToolExecutor({
    canvasId: config.sessionId || sessionId,
    sessionId,
    mcp: mcpClient,
    hooks: {
      preExecute: async (toolName, input) => {
        return await hooksManager.triggerPreExecute(toolName, input);
      },
      postExecute: async (toolName, _input, result) => {
        await hooksManager.triggerPostExecute(toolName, result, 0);
      },
    },
  });

  // Queue for delegation events
  const delegationEvents: AgentEvent[] = [];

  // Create tools
  const tools = createCanvasTools(
    mcpClient,
    executor,
    hooksManager,
    (event) => { delegationEvents.push(event); },
    config.enabledTools,
    options
  );

  // Initialize LLM provider
  const providerName = config.provider ?? MODEL_DEFAULTS.provider;
  const modelValue = config.model ?? MODEL_DEFAULTS.model;

  // Resolve model ID: if modelValue is a tier (fast/balanced/powerful), look it up;
  // otherwise, assume it's already a full model ID
  const validTiers = ["fast", "balanced", "powerful"] as const;
  const isTier = validTiers.includes(modelValue as typeof validTiers[number]);
  const modelId = isTier
    ? getModelId(modelValue as "fast" | "balanced" | "powerful", providerName)
    : modelValue;

  const llmProvider = createProvider(providerName);

  // Build context
  const ctx: LoopContext = {
    task,
    resolvedTask,
    sessionId,
    config,
    options: options || {},
    maxIterations,
    checkpointInterval,
    maxHistoryEntries,
    contextManager,
    hooksManager,
    resourceRegistry,
    sessionSerializer,
    toolLifecycle,
    echoPrevention,
    // Adapter (primary) for domain-agnostic operation
    adapter,
    // Legacy MCP client (for backward compatibility)
    mcpClient: mcpClient as McpClient & { connect(): Promise<boolean>; disconnect(): void },
    tools,
    llmProvider,
    modelId,
    systemPrompt,
    cancellation,
    logReporter: options?.logReporter,
  };

  // Build initial state
  const state: LoopState = {
    iteration: 0,
    errors: [],
    history: [],
    startTime,
    taskState: [],
    taskStateUpdatedAt: undefined,
    resources: {
      // Use browser terminology but store sessionId
      browser: {
        id: sessionId,
        version: 0,
      },
      task: {
        id: sessionId,
        status: "executing",
        currentStep: 0,
        startedAt: startTime,
        errors: [],
      },
      context: {
        tokenBudget: config.tokenBudget ?? LOOP_DEFAULTS.tokenBudget,
        tokensUsed: 0,
        strategies: [],
        skills: [],
        awareness: null,
        awarenessFetchedAt: 0,
        awarenessIsStale: true,
      },
      history: {
        operations: [],
        maxEntries: 50,
      },
    },
    lastStateSnapshot: null,
    isFirstIteration: true,
    lastToolCalls: [],
  };

  // Add alias events to delegation queue for yielding
  delegationEvents.push(...aliasEvents);

  return { ctx, state, delegationEvents };
}

// ============================================================================
// MAIN AGENTIC LOOP
// ============================================================================

/**
 * Agentic Loop
 *
 * Main entry point for agent execution.
 * Implements the THINK → ACT → OBSERVE → DECIDE loop pattern.
 *
 * The second parameter is `sessionId` (historically called `canvasId` for
 * backward compatibility). It identifies the session for state management.
 *
 * @param task - The task to execute
 * @param sessionId - Session identifier (alias: canvasId for backward compat)
 * @param options - Loop configuration options
 * @param cancellation - Optional cancellation token
 *
 * @example
 * ```typescript
 * // Using adapter (recommended)
 * const adapter = createBTCPAdapter({ serverUrl: 'http://localhost:8765' });
 *
 * for await (const event of runAgenticLoop("Create a flowchart", "my-session", {
 *   adapter,
 *   model: "balanced",
 * })) {
 *   console.log(event.type, event);
 * }
 *
 * // Legacy (without adapter)
 * for await (const event of runAgenticLoop("Create a flowchart", "my-canvas", {
 *   model: "balanced",
 * })) {
 *   if (event.type === "complete") {
 *     console.log("Done:", event.summary);
 *   }
 * }
 * ```
 */
export async function* runAgenticLoop(
  task: string,
  sessionId: string,
  options?: LoopOptions,
  cancellation?: CancellationToken
): AsyncGenerator<AgentEvent> {

  // Initialize context and state
  const { ctx, state, delegationEvents } = await initializeLoop(
    task,
    sessionId,
    options,
    cancellation
  );

  // Yield alias events
  while (delegationEvents.length > 0) {
    yield delegationEvents.shift()!;
  }

  // Check MCP connection (skip for testing)
  if (!ctx.config.skipMcpConnection) {
    const connected = await ctx.mcpClient.connect();
    if (!connected) {
      yield {
        type: "error",
        timestamp: Date.now(),
        error: {
          code: "MCP_CONNECTION_FAILED",
          message: `Cannot connect to canvas-mcp server. Start it with: pnpm --filter @waiboard/canvas-mcp start:http`,
          recoverable: false,
        },
      };

      yield {
        type: "failed",
        timestamp: Date.now(),
        reason: "MCP connection failed",
        errors: [{ code: "MCP_CONNECTION_FAILED", message: "Server not available" }],
      };
      return;
    }
  }

  try {
    // Log initial user message
    ctx.logReporter?.message(ctx.sessionId, 0, "user", ctx.resolvedTask);

    // Main agentic loop
    while (state.iteration < ctx.maxIterations) {
      state.iteration++;

      // Check for cancellation
      const cancelDecision = decide(ctx, state, null, []);
      if (cancelDecision.type === "cancelled") {
        yield* createDecisionEvents(ctx, state, cancelDecision, state.startTime);
        return;
      }

      // =========================================================================
      // THINK: Gather context, prepare messages
      // =========================================================================

      let thinkResult;
      if (ctx.config.skipMcpConnection) {
        thinkResult = await thinkTestMode(ctx, state);
      } else {
        thinkResult = await think(ctx, state);
      }

      // Yield think events
      for (const event of thinkResult.events) {
        yield event;
      }

      // Test mode: simplified execution
      if (ctx.config.skipMcpConnection) {
        if (ctx.options.executor) {
          const testResult = await actTestMode(
            ctx,
            state,
            "context_read" as AgentToolName,
            { target: "context" }
          );

          for (const event of testResult.events) {
            yield event;
          }

          // Check for max errors
          const errorDecision = decide(ctx, state, null, [testResult]);
          if (errorDecision.type === "failed") {
            yield* createDecisionEvents(ctx, state, errorDecision, state.startTime);
            return;
          }
        }

        // Complete test mode
        yield {
          type: "complete",
          timestamp: Date.now(),
          summary: `Test mode completed for: ${ctx.resolvedTask}`,
          elementsAffected: state.resources.browser.version,
          totalDuration: Date.now() - state.startTime,
        };
        return;
      }

      // =========================================================================
      // GENERATE: Call LLM
      // =========================================================================

      try {
        const providerToolSet = toolSetToGeminiFormat(ctx.tools);

        // DEBUG: Log registered tool names on first iteration
        if (state.isFirstIteration && ctx.config.verbose) {
          console.log('[DEBUG] Registered tool names:', Object.keys(ctx.tools).join(', '));
        }

        // On first iteration, add the user message to provider history
        const wasFirstIteration = state.isFirstIteration;
        if (state.isFirstIteration) {
          ctx.llmProvider.addToHistory("user", thinkResult.userMessage);
          state.isFirstIteration = false;
        }

        // Determine if we should force tool usage on first iteration (OpenAI only)
        // Force tools when mode is a canvas operation (anything except "general" which is chat/greeting)
        // This uses the already-detected mode from mode-detection.ts for consistency
        const isCanvasOperation = ctx.config.mode !== "general";
        const shouldForceTools = wasFirstIteration &&
          ctx.llmProvider.name === "openai" &&
          isCanvasOperation;

        // Generate using the provider
        // For OpenAI: use tool_choice: "required" on first iteration for canvas operations
        // This ensures the model uses tools instead of just responding with text
        const generateResult = await ctx.llmProvider.generate({
          model: ctx.modelId,
          systemPrompt: ctx.systemPrompt,
          userMessage: "", // Empty - using history from provider
          toolSet: providerToolSet,
          maxTokens: 4096,
          temperature: MODEL_DEFAULTS.temperature,
          toolChoice: shouldForceTools ? "required" : undefined,
        });

        state.lastToolCalls = [];

        const { text, toolCalls } = generateResult;

        // Add assistant response to context manager
        if (text) {
          ctx.contextManager.addAssistantMessage(text);
          ctx.llmProvider.addToHistory("model", text);

          // Log thinking/reasoning content
          ctx.logReporter?.thinking(ctx.sessionId, state.iteration, text);
        }

        // Emit reasoning event
        yield createReasoningEvent(text, toolCalls.length > 0);

        // =========================================================================
        // DECIDE: Check for completion (no tool calls)
        // =========================================================================

        const preActDecision = decide(ctx, state, generateResult, []);
        if (preActDecision.type === "complete") {
          // Save final checkpoint
          if (ctx.sessionSerializer && ctx.checkpointInterval > 0) {
            await ctx.sessionSerializer.save(ctx.contextManager, ctx.sessionId);
          }

          yield* createDecisionEvents(ctx, state, preActDecision, state.startTime);
          return;
        }

        // =========================================================================
        // ACT: Execute tool calls
        // =========================================================================

        // Log tool starts
        for (const tc of toolCalls) {
          ctx.logReporter?.toolStart(
            ctx.sessionId,
            state.iteration,
            tc.name,
            tc.args
          );
        }

        const actResults = await actAll(
          ctx,
          state,
          ctx.tools,
          toolCalls,
          delegationEvents
        );

        // Yield all act events and log tool executions
        for (const actResult of actResults) {
          for (const event of actResult.events) {
            yield event;
          }

          // Log tool execution
          if (ctx.logReporter) {
            const success = !actResult.blocked && !actResult.interrupted;
            ctx.logReporter.toolEnd(
              ctx.sessionId,
              state.iteration,
              actResult.toolName,
              actResult.toolOutput,
              0, // Duration tracked elsewhere
              success
            );
          }
        }

        // =========================================================================
        // OBSERVE: Process results, update state
        // =========================================================================

        const observeResult = await observeAll(ctx, state, actResults);

        // Yield observe events
        for (const event of observeResult.events) {
          yield event;
        }

        // Save checkpoint if due
        const checkpointEvent = await saveCheckpointIfDue(ctx, state);
        if (checkpointEvent) {
          yield checkpointEvent;
        }

        // =========================================================================
        // DECIDE: Check for interruption or continue
        // =========================================================================

        const postActDecision = decide(ctx, state, generateResult, actResults);
        if (isTerminal(postActDecision)) {
          yield* createDecisionEvents(ctx, state, postActDecision, state.startTime);
          return;
        }

        // Continue to next iteration
      } catch (error) {
        // Trigger error hook
        await ctx.hooksManager.triggerError(error as Error);

        // Handle generation error
        const errorEvents = handleGenerationError(ctx, state, error);
        for (const event of errorEvents) {
          yield event;
        }

        // Check if we should stop
        if (errorEvents.some((e) => e.type === "failed")) {
          return;
        }

        // Continue with recovery
      }
    }

    // Timeout - agent did not complete within allowed iterations
    yield {
      type: "timeout",
      timestamp: Date.now(),
      iterations: state.iteration,
      maxIterations: ctx.maxIterations,
    };

    yield {
      type: "failed",
      timestamp: Date.now(),
      reason: `Agent did not complete within ${ctx.maxIterations} iterations`,
      errors: state.errors,
    };
  } catch (error) {
    await ctx.hooksManager.triggerError(error as Error);

    yield {
      type: "failed",
      timestamp: Date.now(),
      reason: error instanceof Error ? error.message : "Unknown error",
      errors: state.errors,
    };
  } finally {
    // Comprehensive cleanup
    try {
      ctx.mcpClient.disconnect();

      if (ctx.sessionSerializer && state.resources.browser.version > 0) {
        try {
          await ctx.sessionSerializer.save(ctx.contextManager, ctx.sessionId);
        } catch (checkpointError) {
          if (ctx.config.verbose) {
            console.warn("[Agent] Failed to save final checkpoint:", checkpointError);
          }
        }
      }

      if (ctx.config.verbose) {
        const metrics = ctx.hooksManager.getMetrics();
        console.log("[Agent] Final metrics:", metrics);
      }

      // Destroy hooks manager if we created it
      if (!ctx.options.hooks && !ctx.config.hooksManager) {
        ctx.hooksManager.destroy();
      }

      // Clear state references
      state.history.length = 0;
      state.errors.length = 0;
    } catch (cleanupError) {
      if (ctx.config.verbose) {
        console.error("[Agent] Error during cleanup:", cleanupError);
      }
    }
  }
}

// ============================================================================
// HELPER EXPORTS
// ============================================================================

/**
 * Agent resources for state tracking
 */
export interface AgentResources {
  canvas: {
    id: string;
    version: number;
    summary: string | null;
    workingSet: string[];
  };
  task: {
    id: string;
    status: "pending" | "running" | "complete" | "failed";
    currentStep: number;
  };
  context: {
    tokenBudget: number;
    tokensUsed: number;
    strategies: string[];
  };
  history: Array<{ tool: string; result: unknown }>;
  errors: Array<{ code: string; message: string }>;
  aliasContext: {
    original: string;
    resolved: string;
    aliases: Array<{ name: string; value: unknown }>;
  } | null;
}

/**
 * Initialize agent resources
 */
export function initializeResources(
  canvasId: string,
  taskId?: string
): AgentResources {
  return {
    canvas: {
      id: canvasId,
      version: 0,
      summary: null,
      workingSet: [],
    },
    task: {
      id: taskId || `task-${Date.now()}`,
      status: "pending",
      currentStep: 0,
    },
    context: {
      tokenBudget: 8000,
      tokensUsed: 0,
      strategies: ["lazy-load", "compression"],
    },
    history: [],
    errors: [],
    aliasContext: null,
  };
}

/**
 * Run canvas agent and collect all events
 */
export async function runCanvasAgent(
  task: string,
  canvasId: string,
  options?: LoopOptions
): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];

  for await (const event of runAgenticLoop(task, canvasId, options)) {
    events.push(event);
  }

  return events;
}

/**
 * Run canvas agent and return result summary
 */
export async function getCanvasAgentResult(
  task: string,
  canvasId: string,
  options?: LoopOptions
): Promise<string> {
  const events = await runCanvasAgent(task, canvasId, options);

  const failedEvent = events.find((e) => e.type === "failed");
  if (failedEvent && failedEvent.type === "failed") {
    throw new Error(failedEvent.reason);
  }

  const completeEvent = events.find((e) => e.type === "complete");
  if (completeEvent && completeEvent.type === "complete") {
    return completeEvent.summary;
  }

  throw new Error("Agent did not complete successfully");
}
