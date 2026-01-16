/**
 * Hooks Manager
 *
 * Implements Pattern 5: Pre/Post Hooks for Observability
 * Provides complete audit trail, UI updates, and security enforcement.
 *
 * @example
 * ```typescript
 * import { HooksManager } from '@waiboard/ai-agents/hooks';
 *
 * const hooks = new HooksManager();
 *
 * // Log all operations
 * hooks.onPostToolUse((ctx) => {
 *   console.log(`[${ctx.tool}] completed in ${ctx.duration}ms`);
 * });
 *
 * // Block dangerous operations
 * hooks.onPreToolUse((ctx) => {
 *   if (ctx.tool === 'write' && ctx.toolInput?.dangerous) {
 *     return { proceed: false, reason: 'Dangerous operation blocked' };
 *   }
 * });
 *
 * // Track metrics
 * const metrics = hooks.getMetrics();
 * console.log(metrics);
 * ```
 */

import { EventEmitter } from "events";
import type {
  HookType,
  HookContext,
  HookHandler,
  HookResult,
  AgentResources,
  OperationMetrics,
  OperationMetricsSummary,
  HooksManagerConfig,
} from "./types.js";

// ============================================================================
// CIRCULAR BUFFER FOR METRICS
// ============================================================================

/**
 * Fixed-size circular buffer for storing metrics without memory leaks.
 * When full, oldest values are overwritten.
 */
class CircularBuffer<T> {
  private buffer: T[];
  private head = 0;
  private size = 0;
  private readonly capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.buffer = new Array(capacity);
  }

  /**
   * Add a value to the buffer
   */
  push(value: T): void {
    this.buffer[this.head] = value;
    this.head = (this.head + 1) % this.capacity;
    if (this.size < this.capacity) {
      this.size++;
    }
  }

  /**
   * Get all values in order (oldest first)
   */
  toArray(): T[] {
    if (this.size === 0) return [];

    if (this.size < this.capacity) {
      // Buffer not full yet
      return this.buffer.slice(0, this.size);
    }

    // Buffer is full, need to reorder from head position
    return [
      ...this.buffer.slice(this.head),
      ...this.buffer.slice(0, this.head),
    ];
  }

  /**
   * Get current number of items
   */
  get length(): number {
    return this.size;
  }

  /**
   * Clear the buffer
   */
  clear(): void {
    this.buffer = new Array(this.capacity);
    this.head = 0;
    this.size = 0;
  }
}

/** Default capacity for duration metrics buffer per tool */
const DEFAULT_METRICS_BUFFER_SIZE = 1000;

// ============================================================================
// HOOKS MANAGER
// ============================================================================

/**
 * Generic Hooks Manager for agent operations
 *
 * Provides:
 * - Pre/post tool hooks for validation and metrics
 * - Context change tracking
 * - Error handling hooks
 * - Checkpoint hooks for state persistence
 * - Operation metrics collection
 *
 * @typeParam TToolName - Tool name type (defaults to string)
 *
 * @example
 * ```typescript
 * // Generic usage
 * const hooks = new HooksManager();
 *
 * // With specific tool types
 * type MyTools = 'read' | 'write' | 'search';
 * const typedHooks = new HooksManager<MyTools>();
 *
 * // Rate limiting
 * hooks.onPreToolUse(CommonHooks.rateLimit(10, 1000)); // 10 ops per second
 *
 * // Get metrics
 * console.log(hooks.getMetrics());
 * ```
 */
export class HooksManager<TToolName extends string = string> extends EventEmitter {
  private handlers: Map<HookType, HookHandler<TToolName>[]> = new Map();
  /**
   * Internal metrics storage using CircularBuffer for durations
   * to prevent memory leaks during long-running sessions.
   */
  private metricsInternal: {
    calls: Map<TToolName, number>;
    durations: Map<TToolName, CircularBuffer<number>>;
    errors: Map<TToolName, number>;
  } = {
    calls: new Map(),
    durations: new Map(),
    errors: new Map(),
  };
  private config: Required<HooksManagerConfig>;
  private metricsBufferSize: number;

  constructor(config: HooksManagerConfig = {}) {
    super();
    this.metricsBufferSize = config.metricsBufferSize ?? DEFAULT_METRICS_BUFFER_SIZE;
    this.config = {
      hooks: config.hooks || [],
      emitEvents: config.emitEvents ?? true,
      trackMetrics: config.trackMetrics ?? true,
      metricsBufferSize: this.metricsBufferSize,
    };

    // Register initial hooks
    for (const hookConfig of this.config.hooks) {
      if (hookConfig.enabled !== false && typeof hookConfig.handler === "function") {
        this.register(hookConfig.type, hookConfig.handler as HookHandler<TToolName>);
      }
    }
  }

  // ==========================================================================
  // REGISTRATION
  // ==========================================================================

  /**
   * Register a hook handler
   * @returns Unregister function
   */
  register(type: HookType, handler: HookHandler<TToolName>): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, []);
    }
    this.handlers.get(type)!.push(handler);

    // Return unregister function
    return () => {
      const handlers = this.handlers.get(type);
      if (handlers) {
        const index = handlers.indexOf(handler);
        if (index > -1) {
          handlers.splice(index, 1);
        }
      }
    };
  }

  // ==========================================================================
  // TRIGGERING
  // ==========================================================================

  /**
   * Trigger hooks for an event
   * Returns { blocked: true } if any handler blocks the operation
   */
  async trigger(
    type: HookType,
    context: Partial<HookContext<TToolName>>
  ): Promise<{ blocked: boolean; message?: string; modifiedInput?: unknown }> {
    const handlers = this.handlers.get(type) || [];
    const fullContext: HookContext<TToolName> = {
      hookType: type,
      timestamp: Date.now(),
      ...context,
    };

    // Track metrics for tool usage
    if (this.config.trackMetrics) {
      if (type === "pre-tool-use" && context.tool) {
        this.incrementCallCount(context.tool);
      }
      if (type === "post-tool-use" && context.tool && context.duration) {
        this.recordDuration(context.tool, context.duration);
      }
      if (type === "error" && context.tool) {
        this.incrementErrorCount(context.tool);
      }
    }

    let modifiedInput: unknown = undefined;

    // Execute handlers
    for (const handler of handlers) {
      try {
        const result = await handler(fullContext);
        if (result && "proceed" in result) {
          if (!result.proceed) {
            return { blocked: true, message: result.reason };
          }
          if (result.modifiedInput !== undefined) {
            modifiedInput = result.modifiedInput;
          }
        }
      } catch (error) {
        console.error(`Hook handler error for ${type}:`, error);
        // Don't block on handler errors
      }
    }

    // Emit event for external listeners
    // Note: Skip emitting 'error' type as it conflicts with Node.js EventEmitter conventions
    if (this.config.emitEvents && type !== "error") {
      this.emit(type, fullContext);
    }

    return { blocked: false, modifiedInput };
  }

  // ==========================================================================
  // CONVENIENCE METHODS
  // ==========================================================================

  /** Register pre-tool-use hook */
  onPreToolUse(handler: HookHandler<TToolName>): () => void {
    return this.register("pre-tool-use", handler);
  }

  /** Register post-tool-use hook */
  onPostToolUse(handler: HookHandler<TToolName>): () => void {
    return this.register("post-tool-use", handler);
  }

  /** Register pre-step hook */
  onPreStep(handler: HookHandler<TToolName>): () => void {
    return this.register("pre-step", handler);
  }

  /** Register post-step hook */
  onPostStep(handler: HookHandler<TToolName>): () => void {
    return this.register("post-step", handler);
  }

  /** Register context-change hook */
  onContextChange(handler: HookHandler<TToolName>): () => void {
    return this.register("context-change", handler);
  }

  /** Register error hook */
  onError(handler: HookHandler<TToolName>): () => void {
    return this.register("error", handler);
  }

  /** Register checkpoint hook */
  onCheckpoint(handler: HookHandler<TToolName>): () => void {
    return this.register("checkpoint", handler);
  }

  /** Register session-start hook */
  onSessionStart(handler: HookHandler<TToolName>): () => void {
    return this.register("session-start", handler);
  }

  /** Register session-end hook */
  onSessionEnd(handler: HookHandler<TToolName>): () => void {
    return this.register("session-end", handler);
  }

  // ==========================================================================
  // TRIGGER CONVENIENCE METHODS (for agentic loop integration)
  // ==========================================================================

  /**
   * Trigger pre-execute hook for a tool
   * @returns { proceed: boolean, reason?: string }
   */
  async triggerPreExecute(
    tool: TToolName,
    input: unknown
  ): Promise<{ proceed: boolean; reason?: string }> {
    const result = await this.trigger("pre-tool-use", { tool, toolInput: input });
    return { proceed: !result.blocked, reason: result.message };
  }

  /**
   * Trigger post-execute hook for a tool
   */
  async triggerPostExecute(
    tool: TToolName,
    result: unknown,
    duration: number
  ): Promise<void> {
    await this.trigger("post-tool-use", { tool, toolResult: result, duration });
  }

  /**
   * Trigger error hook
   */
  async triggerError(error: Error): Promise<void> {
    await this.trigger("error", { metadata: { error } });
  }

  /**
   * Register a pre-execute hook (alias for onPreToolUse)
   */
  registerPreHook(handler: HookHandler<TToolName>): () => void {
    return this.onPreToolUse(handler);
  }

  /**
   * Register a post-execute hook (alias for onPostToolUse)
   */
  registerPostHook(handler: HookHandler<TToolName>): () => void {
    return this.onPostToolUse(handler);
  }

  // ==========================================================================
  // MANAGEMENT
  // ==========================================================================

  /** Clear all handlers for a type */
  clearHandlers(type: HookType): void {
    this.handlers.delete(type);
  }

  /** Clear all handlers */
  clearAll(): void {
    this.handlers.clear();
  }

  /** Get handler count for a type */
  handlerCount(type: HookType): number {
    return this.handlers.get(type)?.length || 0;
  }

  /** Get all registered hook types */
  getRegisteredTypes(): HookType[] {
    return Array.from(this.handlers.keys());
  }

  /** Check if hook type has handlers */
  hasHandlers(type: HookType): boolean {
    return (this.handlers.get(type)?.length || 0) > 0;
  }

  // ==========================================================================
  // METRICS (Using CircularBuffer to prevent memory leaks)
  // ==========================================================================

  private incrementCallCount(tool: TToolName): void {
    const count = this.metricsInternal.calls.get(tool) || 0;
    this.metricsInternal.calls.set(tool, count + 1);
  }

  private recordDuration(tool: TToolName, duration: number): void {
    let buffer = this.metricsInternal.durations.get(tool);
    if (!buffer) {
      buffer = new CircularBuffer<number>(this.metricsBufferSize);
      this.metricsInternal.durations.set(tool, buffer);
    }
    buffer.push(duration);
  }

  private incrementErrorCount(tool: TToolName): void {
    const count = this.metricsInternal.errors.get(tool) || 0;
    this.metricsInternal.errors.set(tool, count + 1);
  }

  /** Get metrics for all tools */
  getMetrics(): OperationMetricsSummary {
    const summary: OperationMetricsSummary = {};

    for (const [tool, count] of this.metricsInternal.calls) {
      const buffer = this.metricsInternal.durations.get(tool);
      const durations = buffer?.toArray() || [];
      const avgDuration =
        durations.length > 0
          ? durations.reduce((a, b) => a + b, 0) / durations.length
          : 0;

      summary[tool] = {
        calls: count,
        errors: this.metricsInternal.errors.get(tool) || 0,
        avgDuration: Math.round(avgDuration),
        p95Duration: durations.length > 0 ? percentile(durations, 0.95) : 0,
      };
    }

    return summary;
  }

  /** Get metrics for a specific tool */
  getToolMetrics(tool: TToolName): {
    calls: number;
    errors: number;
    avgDuration: number;
    p95Duration: number;
  } | null {
    const calls = this.metricsInternal.calls.get(tool);
    if (calls === undefined) return null;

    const buffer = this.metricsInternal.durations.get(tool);
    const durations = buffer?.toArray() || [];
    const avgDuration =
      durations.length > 0
        ? durations.reduce((a, b) => a + b, 0) / durations.length
        : 0;

    return {
      calls,
      errors: this.metricsInternal.errors.get(tool) || 0,
      avgDuration: Math.round(avgDuration),
      p95Duration: durations.length > 0 ? percentile(durations, 0.95) : 0,
    };
  }

  /** Reset metrics */
  resetMetrics(): void {
    this.metricsInternal.calls.clear();
    this.metricsInternal.durations.clear();
    this.metricsInternal.errors.clear();
  }

  /**
   * Destroy the hooks manager, cleaning up all resources.
   * Call this when the agent session ends to prevent memory leaks.
   *
   * This method:
   * - Clears all registered handlers
   * - Removes all event listeners (from EventEmitter)
   * - Resets all metrics
   *
   * After calling destroy(), the instance should not be reused.
   */
  destroy(): void {
    // Clear all handlers
    this.handlers.clear();

    // Remove all event listeners (EventEmitter cleanup)
    this.removeAllListeners();

    // Reset metrics
    this.metricsInternal.calls.clear();
    this.metricsInternal.durations.clear();
    this.metricsInternal.errors.clear();
  }

  /**
   * Get the metrics property for backwards compatibility
   * @deprecated Use getMetrics() instead
   */
  get metrics(): OperationMetrics<TToolName> {
    // Convert internal structure to backwards-compatible format
    const durationsMap = new Map<TToolName, number[]>();
    for (const [tool, buffer] of this.metricsInternal.durations) {
      durationsMap.set(tool, buffer.toArray());
    }
    return {
      calls: this.metricsInternal.calls,
      durations: durationsMap,
      errors: this.metricsInternal.errors,
    };
  }
}

// ============================================================================
// UTILITIES
// ============================================================================

function percentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil(p * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

// ============================================================================
// DEFAULT INSTANCE
// ============================================================================

/**
 * Default hooks manager instance
 */
export const hooksManager = new HooksManager();

// ============================================================================
// COMMON HOOK IMPLEMENTATIONS
// ============================================================================

/**
 * Common hook implementations for reuse
 */
export const CommonHooks = {
  /**
   * Log all operations to console
   * @param verbose - Whether to log (default: true)
   */
  logOperations: <TToolName extends string = string>(
    verbose: boolean = true
  ): HookHandler<TToolName> => {
    return (ctx: HookContext<TToolName>) => {
      if (!verbose) return;
      const tool = ctx.tool || "unknown";
      const duration = ctx.duration ? ` (${ctx.duration}ms)` : "";
      console.log(`[Hook ${ctx.hookType}] ${tool}${duration}`);
    };
  },

  /**
   * Track created elements for later reference
   */
  trackElements: <TToolName extends string = string>(): HookHandler<TToolName> => {
    const createdElements: string[] = [];

    return (ctx: HookContext<TToolName>) => {
      if (ctx.hookType !== "post-tool-use") return;
      if (ctx.tool === "canvas_write" && ctx.toolResult) {
        const result = ctx.toolResult as { created?: Array<{ id: string }> };
        if (result.created) {
          for (const el of result.created) {
            if (el.id) createdElements.push(el.id);
          }
        }
      }
    };
  },

  /**
   * Validate element bounds are within canvas limits
   */
  validateBounds: <TToolName extends string = string>(
    maxX: number = 10000,
    maxY: number = 10000
  ): HookHandler<TToolName> => {
    return (ctx: HookContext<TToolName>) => {
      if (ctx.hookType !== "pre-tool-use") return;
      if (ctx.tool !== "canvas_write" && ctx.tool !== "canvas_edit") return;

      const input = ctx.toolInput as { elements?: Array<{ x?: number; y?: number }> };
      if (!input?.elements) return;

      for (const el of input.elements) {
        if (el.x !== undefined && (el.x > maxX || el.x < -maxX)) {
          return {
            proceed: false,
            reason: `Element x position ${el.x} exceeds bounds (max: ±${maxX})`,
          };
        }
        if (el.y !== undefined && (el.y > maxY || el.y < -maxY)) {
          return {
            proceed: false,
            reason: `Element y position ${el.y} exceeds bounds (max: ±${maxY})`,
          };
        }
      }
    };
  },

  /**
   * Rate limit operations
   */
  rateLimit: <TToolName extends string = string>(
    maxOps: number,
    windowMs: number
  ): HookHandler<TToolName> => {
    const timestamps: number[] = [];
    return (ctx: HookContext<TToolName>) => {
      if (ctx.hookType !== "pre-tool-use") return;

      const now = Date.now();
      const cutoff = now - windowMs;

      // Clean old timestamps
      while (timestamps.length > 0 && timestamps[0] < cutoff) {
        timestamps.shift();
      }

      if (timestamps.length >= maxOps) {
        return {
          proceed: false,
          reason: `Rate limit exceeded: ${maxOps} operations per ${windowMs}ms`,
        };
      }

      timestamps.push(now);
    };
  },

  /**
   * Block specific tools
   */
  blockTools: <TToolName extends string = string>(
    blockedTools: TToolName[],
    reason?: string
  ): HookHandler<TToolName> => {
    return (ctx: HookContext<TToolName>) => {
      if (ctx.hookType !== "pre-tool-use") return;
      if (ctx.tool && blockedTools.includes(ctx.tool)) {
        return {
          proceed: false,
          reason: reason || `Tool '${ctx.tool}' is blocked`,
        };
      }
    };
  },

  /**
   * Allow only specific tools
   */
  allowOnlyTools: <TToolName extends string = string>(
    allowedTools: TToolName[],
    reason?: string
  ): HookHandler<TToolName> => {
    return (ctx: HookContext<TToolName>) => {
      if (ctx.hookType !== "pre-tool-use") return;
      if (ctx.tool && !allowedTools.includes(ctx.tool)) {
        return {
          proceed: false,
          reason: reason || `Tool '${ctx.tool}' is not allowed`,
        };
      }
    };
  },

  /**
   * Track tool calls
   */
  trackCalls: <TToolName extends string = string>(): {
    handler: HookHandler<TToolName>;
    getCalls: () => Array<{ tool: TToolName; timestamp: number }>;
    clear: () => void;
  } => {
    const calls: Array<{ tool: TToolName; timestamp: number }> = [];
    return {
      handler: (ctx: HookContext<TToolName>) => {
        if (ctx.hookType === "post-tool-use" && ctx.tool) {
          calls.push({ tool: ctx.tool, timestamp: ctx.timestamp });
        }
      },
      getCalls: () => [...calls],
      clear: () => (calls.length = 0),
    };
  },

  /**
   * Auto-checkpoint after N operations
   */
  autoCheckpoint: <TToolName extends string = string>(
    onCheckpoint: (resources: AgentResources) => Promise<void>,
    threshold: number = 5
  ): HookHandler<TToolName> => {
    let operationCount = 0;

    return async (ctx: HookContext<TToolName>) => {
      if (ctx.hookType !== "post-tool-use") return;

      operationCount++;

      if (operationCount >= threshold && ctx.resources) {
        await onCheckpoint(ctx.resources);
        operationCount = 0;
      }
    };
  },

  /**
   * Timeout operations
   */
  timeout: <TToolName extends string = string>(
    maxDurationMs: number
  ): HookHandler<TToolName> => {
    return (ctx: HookContext<TToolName>) => {
      if (ctx.hookType !== "post-tool-use") return;
      if (ctx.duration && ctx.duration > maxDurationMs) {
        console.warn(
          `Tool '${ctx.tool}' exceeded timeout: ${ctx.duration}ms > ${maxDurationMs}ms`
        );
      }
    };
  },

  /**
   * Emit events to external emitter
   */
  emitEvents: <TToolName extends string = string>(
    emitter: EventEmitter
  ): HookHandler<TToolName> => {
    return (ctx: HookContext<TToolName>) => {
      if (ctx.hookType === "post-tool-use") {
        emitter.emit("tool:complete", {
          tool: ctx.tool,
          result: ctx.toolResult,
          duration: ctx.duration,
        });
      }
      if (ctx.hookType === "error") {
        emitter.emit("tool:error", {
          tool: ctx.tool,
          error: ctx.metadata?.error,
        });
      }
    };
  },

  /**
   * Validate input with custom validator
   */
  validateInput: <TToolName extends string = string>(
    validator: (tool: TToolName, input: unknown) => boolean | string
  ): HookHandler<TToolName> => {
    return (ctx: HookContext<TToolName>) => {
      if (ctx.hookType !== "pre-tool-use") return;
      if (!ctx.tool) return;

      const result = validator(ctx.tool, ctx.toolInput);
      if (result === false) {
        return { proceed: false, reason: "Input validation failed" };
      }
      if (typeof result === "string") {
        return { proceed: false, reason: result };
      }
    };
  },

  /**
   * Transform input before tool execution
   */
  transformInput: <TToolName extends string = string>(
    transformer: (tool: TToolName, input: unknown) => unknown
  ): HookHandler<TToolName> => {
    return (ctx: HookContext<TToolName>) => {
      if (ctx.hookType !== "pre-tool-use") return;
      if (!ctx.tool) return;

      const modified = transformer(ctx.tool, ctx.toolInput);
      if (modified !== ctx.toolInput) {
        return { proceed: true, modifiedInput: modified };
      }
    };
  },
};

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Create a new hooks manager with configuration
 */
export function createHooksManager<TToolName extends string = string>(
  config?: HooksManagerConfig
): HooksManager<TToolName> {
  return new HooksManager<TToolName>(config);
}

/**
 * Create a hooks manager with common hooks pre-registered
 */
export function createHooksManagerWithDefaults<TToolName extends string = string>(
  options: {
    logging?: boolean;
    rateLimit?: { maxOps: number; windowMs: number };
    trackCalls?: boolean;
  } = {}
): {
  manager: HooksManager<TToolName>;
  getCallHistory?: () => Array<{ tool: TToolName; timestamp: number }>;
} {
  const manager = new HooksManager<TToolName>();
  let callTracker: ReturnType<typeof CommonHooks.trackCalls<TToolName>> | undefined;

  if (options.logging) {
    manager.onPostToolUse(CommonHooks.logOperations());
  }

  if (options.rateLimit) {
    manager.onPreToolUse(
      CommonHooks.rateLimit(options.rateLimit.maxOps, options.rateLimit.windowMs)
    );
  }

  if (options.trackCalls) {
    callTracker = CommonHooks.trackCalls<TToolName>();
    manager.onPostToolUse(callTracker.handler);
  }

  return {
    manager,
    getCallHistory: callTracker?.getCalls,
  };
}
