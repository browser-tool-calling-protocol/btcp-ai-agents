/**
 * Agent Session
 *
 * Session-based API for the agent framework.
 * Provides a cleaner interface than the generator-based runAgenticLoop.
 *
 * ## Usage
 *
 * ```typescript
 * import { createAgentSession } from '@btcp/ai-agents/agent-sdk';
 * import { createBTCPAdapter } from '@btcp/ai-agents/browser-agent';
 *
 * // Create session
 * const session = await createAgentSession({
 *   adapter: createBTCPAdapter({ serverUrl: 'http://localhost:8765' }),
 *   model: 'balanced',
 * });
 *
 * // Run a task (streaming)
 * for await (const event of session.run("Click the login button")) {
 *   console.log(event.type, event);
 * }
 *
 * // Run another task (multi-turn, context preserved)
 * for await (const event of session.run("Now fill in the form")) {
 *   console.log(event);
 * }
 *
 * // Or execute and get result
 * const result = await session.execute("Submit the form");
 * console.log(result.success, result.summary);
 *
 * // Cleanup
 * await session.close();
 * ```
 *
 * @module agent-session
 */

import type {
  AgentEvent,
  CancellationToken,
} from "./agents/types.js";
import type { ActionAdapter, AwarenessContext } from "./adapters/types.js";
import type { ContextManager } from "./context/manager.js";
import type { HooksManager } from "./hooks/manager.js";
import type { ResourceRegistry } from "./resources/registry.js";
import type { SessionSerializer } from "./context/serialization.js";

import { runAgenticLoop, type LoopOptions } from "./core/loop/index.js";
import { createContextManager } from "./context/manager.js";
import { createHooksManager, CommonHooks } from "./hooks/manager.js";
import { createResourceRegistry } from "./resources/registry.js";
import { registerBuiltInProviders } from "./resources/providers.js";
import { generateSessionId } from "./context/serialization.js";
import { LOOP_DEFAULTS } from "./core/constants.js";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Session configuration options
 */
export interface AgentSessionConfig {
  /**
   * Action adapter for domain-specific operations (required)
   *
   * @example
   * ```typescript
   * adapter: createBTCPAdapter({ serverUrl: 'http://localhost:8765' })
   * ```
   */
  adapter: ActionAdapter;

  /**
   * Session ID (auto-generated if not provided)
   */
  sessionId?: string;

  /**
   * Model provider: 'google' or 'openai'
   * @default 'google'
   */
  provider?: 'google' | 'openai';

  /**
   * Model tier or full model ID
   * @default 'balanced'
   */
  model?: 'fast' | 'balanced' | 'powerful' | string;

  /**
   * Custom system prompt (uses default if not provided)
   */
  systemPrompt?: string;

  /**
   * Maximum iterations per task
   * @default 20
   */
  maxIterations?: number;

  /**
   * Token budget for context window
   * @default 8000
   */
  tokenBudget?: number;

  /**
   * Enable verbose logging
   * @default false
   */
  verbose?: boolean;

  /**
   * Pre-configured hooks manager
   */
  hooks?: HooksManager;

  /**
   * Pre-configured resource registry
   */
  resources?: ResourceRegistry;

  /**
   * Session serializer for persistence
   */
  serializer?: SessionSerializer;

  /**
   * Auto-connect adapter on session creation
   * @default true
   */
  autoConnect?: boolean;
}

/**
 * Result of an executed task
 */
export interface TaskResult {
  /** Whether the task completed successfully */
  success: boolean;
  /** Summary of what was done */
  summary: string;
  /** All events emitted during execution */
  events: AgentEvent[];
  /** Duration in milliseconds */
  duration: number;
  /** Number of iterations used */
  iterations: number;
  /** Any errors encountered */
  errors: Array<{ code: string; message: string }>;
}

/**
 * Session state
 */
export type SessionState = 'created' | 'connected' | 'running' | 'idle' | 'closed' | 'error';

/**
 * Session statistics
 */
export interface SessionStats {
  /** Total tasks executed */
  tasksExecuted: number;
  /** Total events emitted */
  eventsEmitted: number;
  /** Total tool calls made */
  toolCalls: number;
  /** Total tokens used */
  tokensUsed: number;
  /** Session uptime in milliseconds */
  uptime: number;
}

// =============================================================================
// AGENT SESSION CLASS
// =============================================================================

/**
 * Agent Session
 *
 * Manages a stateful agent session with context preservation across tasks.
 */
export class AgentSession {
  // Configuration
  private readonly config: AgentSessionConfig;
  private readonly sessionId: string;

  // State
  private state: SessionState = 'created';
  private currentCancellation: CancellationToken | null = null;
  private taskHistory: Array<{ task: string; result: TaskResult }> = [];

  // Integration systems
  private readonly contextManager: ContextManager;
  private readonly hooksManager: HooksManager;
  private readonly resourceRegistry: ResourceRegistry;

  // Statistics
  private stats: SessionStats = {
    tasksExecuted: 0,
    eventsEmitted: 0,
    toolCalls: 0,
    tokensUsed: 0,
    uptime: 0,
  };
  private createdAt: number;

  constructor(config: AgentSessionConfig) {
    this.config = config;
    this.sessionId = config.sessionId || generateSessionId('session');
    this.createdAt = Date.now();

    // Initialize integration systems
    this.contextManager = createContextManager({
      maxTokens: config.tokenBudget ?? LOOP_DEFAULTS.tokenBudget,
    });

    this.hooksManager = config.hooks ?? createHooksManager();
    if (!config.hooks) {
      this.hooksManager.registerPostHook(CommonHooks.logOperations(config.verbose));
      this.hooksManager.registerPostHook(CommonHooks.trackElements());
    }

    this.resourceRegistry = config.resources ?? createResourceRegistry();
    if (!config.resources) {
      registerBuiltInProviders(this.resourceRegistry);
    }
  }

  // ===========================================================================
  // LIFECYCLE
  // ===========================================================================

  /**
   * Connect the session's adapter
   */
  async connect(): Promise<boolean> {
    if (this.state === 'closed') {
      throw new Error('Cannot connect a closed session');
    }

    try {
      const connected = await this.config.adapter.connect();
      if (connected) {
        this.state = 'connected';
      } else {
        this.state = 'error';
      }
      return connected;
    } catch (error) {
      this.state = 'error';
      throw error;
    }
  }

  /**
   * Close the session and cleanup resources
   */
  async close(): Promise<void> {
    // Cancel any running task
    if (this.currentCancellation) {
      this.currentCancellation.cancel();
    }

    // Disconnect adapter
    this.config.adapter.disconnect();

    // Save session if serializer provided
    if (this.config.serializer) {
      try {
        await this.config.serializer.save(this.contextManager, this.sessionId);
      } catch {
        // Ignore save errors on close
      }
    }

    this.state = 'closed';
  }

  /**
   * Get current session state
   */
  getState(): SessionState {
    return this.state;
  }

  /**
   * Get session ID
   */
  getId(): string {
    return this.sessionId;
  }

  /**
   * Get session statistics
   */
  getStats(): SessionStats {
    return {
      ...this.stats,
      uptime: Date.now() - this.createdAt,
    };
  }

  // ===========================================================================
  // TASK EXECUTION
  // ===========================================================================

  /**
   * Run a task and stream events
   *
   * @param task - The task to execute
   * @param options - Additional options for this task
   *
   * @example
   * ```typescript
   * for await (const event of session.run("Click the button")) {
   *   if (event.type === 'tool_call') {
   *     console.log('Calling:', event.tool);
   *   }
   * }
   * ```
   */
  async *run(
    task: string,
    options?: Partial<AgentSessionConfig>
  ): AsyncGenerator<AgentEvent> {
    // Ensure connected
    if (this.state === 'created') {
      const autoConnect = this.config.autoConnect ?? true;
      if (autoConnect) {
        await this.connect();
      }
    }

    if (this.state === 'closed') {
      throw new Error('Cannot run task on closed session');
    }

    if (this.state === 'running') {
      throw new Error('Another task is already running. Cancel it first.');
    }

    this.state = 'running';
    const startTime = Date.now();
    const events: AgentEvent[] = [];
    let iterations = 0;
    const errors: Array<{ code: string; message: string }> = [];

    // Create cancellation token for this task
    this.currentCancellation = createCancellationToken();

    try {
      // Build loop options
      const loopOptions: LoopOptions = {
        adapter: this.config.adapter,
        sessionId: this.sessionId,
        provider: options?.provider ?? this.config.provider,
        model: options?.model ?? this.config.model,
        systemPrompt: options?.systemPrompt ?? this.config.systemPrompt,
        maxIterations: options?.maxIterations ?? this.config.maxIterations,
        tokenBudget: options?.tokenBudget ?? this.config.tokenBudget,
        verbose: options?.verbose ?? this.config.verbose,
        hooks: this.hooksManager,
        registry: this.resourceRegistry,
      };

      // Run the loop
      for await (const event of runAgenticLoop(
        task,
        this.sessionId,
        loopOptions,
        this.currentCancellation
      )) {
        events.push(event);
        this.stats.eventsEmitted++;

        // Track specific event types
        if (event.type === 'tool_call') {
          this.stats.toolCalls++;
        }
        if (event.type === 'iteration') {
          iterations++;
        }
        if (event.type === 'error') {
          errors.push({ code: (event as any).code || 'UNKNOWN', message: (event as any).message || 'Unknown error' });
        }
        if (event.type === 'context' && 'tokensUsed' in event) {
          this.stats.tokensUsed += (event as any).tokensUsed || 0;
        }

        yield event;
      }

      // Extract result from final event
      const lastEvent = events[events.length - 1];
      const success = lastEvent?.type === 'complete';
      const summary = success ? (lastEvent as any).summary : 'Task did not complete';

      // Store in history
      this.taskHistory.push({
        task,
        result: {
          success,
          summary,
          events,
          duration: Date.now() - startTime,
          iterations,
          errors,
        },
      });

      this.stats.tasksExecuted++;
    } finally {
      this.state = this.config.adapter.isConnected() ? 'connected' : 'idle';
      this.currentCancellation = null;
    }
  }

  /**
   * Execute a task and return the result
   *
   * @param task - The task to execute
   * @param options - Additional options for this task
   *
   * @example
   * ```typescript
   * const result = await session.execute("Submit the form");
   * if (result.success) {
   *   console.log("Done:", result.summary);
   * }
   * ```
   */
  async execute(
    task: string,
    options?: Partial<AgentSessionConfig>
  ): Promise<TaskResult> {
    const startTime = Date.now();
    const events: AgentEvent[] = [];
    let iterations = 0;
    const errors: Array<{ code: string; message: string }> = [];

    for await (const event of this.run(task, options)) {
      events.push(event);
      if (event.type === 'iteration') {
        iterations++;
      }
      if (event.type === 'error') {
        errors.push({ code: (event as any).code || 'UNKNOWN', message: (event as any).message || 'Unknown error' });
      }
    }

    const lastEvent = events[events.length - 1];
    const success = lastEvent?.type === 'complete';
    const summary = success ? (lastEvent as any).summary : 'Task did not complete';

    return {
      success,
      summary,
      events,
      duration: Date.now() - startTime,
      iterations,
      errors,
    };
  }

  /**
   * Cancel the currently running task
   */
  cancel(): void {
    if (this.currentCancellation) {
      this.currentCancellation.cancel();
    }
  }

  // ===========================================================================
  // CONTEXT ACCESS
  // ===========================================================================

  /**
   * Get current awareness/context from adapter
   */
  async getAwareness(): Promise<AwarenessContext> {
    return this.config.adapter.getAwareness();
  }

  /**
   * Get task history
   */
  getHistory(): Array<{ task: string; result: TaskResult }> {
    return [...this.taskHistory];
  }

  /**
   * Clear task history
   */
  clearHistory(): void {
    this.taskHistory = [];
  }

  /**
   * Get the underlying adapter
   */
  getAdapter(): ActionAdapter {
    return this.config.adapter;
  }

  /**
   * Get the context manager
   */
  getContextManager(): ContextManager {
    return this.contextManager;
  }

  /**
   * Get the hooks manager
   */
  getHooksManager(): HooksManager {
    return this.hooksManager;
  }
}

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Create a new agent session
 *
 * @example
 * ```typescript
 * const session = await createAgentSession({
 *   adapter: createBTCPAdapter({ serverUrl: 'http://localhost:8765' }),
 *   model: 'balanced',
 * });
 *
 * for await (const event of session.run("Click the button")) {
 *   console.log(event);
 * }
 *
 * await session.close();
 * ```
 */
export async function createAgentSession(
  config: AgentSessionConfig
): Promise<AgentSession> {
  const session = new AgentSession(config);

  // Auto-connect if enabled (default)
  if (config.autoConnect !== false) {
    await session.connect();
  }

  return session;
}

/**
 * Create a cancellation token
 */
export function createCancellationToken(): CancellationToken {
  const token: CancellationToken = {
    cancelled: false,
    reason: undefined,
    cancel(reason = "User cancelled") {
      token.cancelled = true;
      token.reason = reason;
    },
  };
  return token;
}

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * Run a single task with an adapter (convenience function)
 *
 * Creates a session, runs the task, and closes the session.
 *
 * @example
 * ```typescript
 * const result = await runTask(
 *   "Click the login button",
 *   createBTCPAdapter({ serverUrl: 'http://localhost:8765' }),
 *   { model: 'balanced' }
 * );
 * ```
 */
export async function runTask(
  task: string,
  adapter: ActionAdapter,
  options?: Omit<AgentSessionConfig, 'adapter'>
): Promise<TaskResult> {
  const session = await createAgentSession({ adapter, ...options });
  try {
    return await session.execute(task);
  } finally {
    await session.close();
  }
}

/**
 * Stream events from a single task (convenience function)
 *
 * @example
 * ```typescript
 * for await (const event of streamTask(
 *   "Fill the form",
 *   adapter,
 *   { verbose: true }
 * )) {
 *   console.log(event);
 * }
 * ```
 */
export async function* streamTask(
  task: string,
  adapter: ActionAdapter,
  options?: Omit<AgentSessionConfig, 'adapter'>
): AsyncGenerator<AgentEvent> {
  const session = await createAgentSession({ adapter, ...options });
  try {
    yield* session.run(task);
  } finally {
    await session.close();
  }
}
