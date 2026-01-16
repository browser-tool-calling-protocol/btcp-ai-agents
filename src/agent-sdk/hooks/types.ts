/**
 * Hooks System Types
 *
 * Pattern 5: Pre/Post Hooks for Observability
 * Generic hook types that work with any tool system.
 */

// ============================================================================
// HOOK TYPES
// ============================================================================

/**
 * Hook event types
 */
export type HookType =
  | "pre-tool-use"
  | "post-tool-use"
  | "pre-step"
  | "post-step"
  | "context-change"
  | "error"
  | "checkpoint"
  | "session-start"
  | "session-end";

/**
 * Hook context passed to handlers
 */
export interface HookContext<TToolName extends string = string> {
  /** Type of hook being triggered */
  hookType: HookType;
  /** Tool name (if applicable) */
  tool?: TToolName;
  /** Tool input (if applicable) */
  toolInput?: unknown;
  /** Tool result (if applicable) */
  toolResult?: unknown;
  /** Step name (if applicable) */
  step?: string;
  /** Step index (if applicable) */
  stepIndex?: number;
  /** Session/context ID */
  contextId?: string;
  /** Timestamp of event */
  timestamp: number;
  /** Duration of operation (ms) */
  duration?: number;
  /** Agent resources state */
  resources?: AgentResources;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Hook result - can block operations
 */
export interface HookResult {
  /** Whether to proceed with the operation */
  proceed: boolean;
  /** Reason for blocking (if proceed is false) */
  reason?: string;
  /** Modified input (for pre hooks) */
  modifiedInput?: unknown;
}

/**
 * Hook handler function
 */
export type HookHandler<TToolName extends string = string> = (
  context: HookContext<TToolName>
) => Promise<HookResult | void> | HookResult | void;

// ============================================================================
// AGENT RESOURCES (Generic)
// ============================================================================

/**
 * Generic agent resources state
 * Can be extended with specific resource types
 */
export interface AgentResources {
  /** Session/context state */
  context?: {
    id: string;
    tokenBudget: number;
    tokensUsed: number;
  };

  /** Task state */
  task?: {
    id: string;
    status: TaskStatus;
    currentStep: number;
  };

  /** Operation history */
  history?: OperationRecord[];

  /** Accumulated errors */
  errors?: ErrorRecord[];

  /** Additional custom resources */
  [key: string]: unknown;
}

export type TaskStatus = "pending" | "running" | "paused" | "completed" | "failed";

export interface OperationRecord {
  tool: string;
  input: unknown;
  result: unknown;
  timestamp: number;
  duration: number;
}

export interface ErrorRecord {
  type: "transient" | "validation" | "conflict" | "not_found" | "unknown";
  message: string;
  tool?: string;
  timestamp: number;
  recoverable: boolean;
}

// ============================================================================
// METRICS TYPES
// ============================================================================

/**
 * Internal metrics storage
 */
export interface OperationMetrics<TToolName extends string = string> {
  calls: Map<TToolName, number>;
  durations: Map<TToolName, number[]>;
  errors: Map<TToolName, number>;
}

/**
 * Metrics summary for external use
 */
export interface OperationMetricsSummary {
  [tool: string]: {
    calls: number;
    errors: number;
    avgDuration: number;
    p95Duration: number;
  };
}

// ============================================================================
// HOOK CONFIGURATION
// ============================================================================

/**
 * Hook configuration for settings
 */
export interface HookConfig {
  /** Hook type/event */
  type: HookType;
  /** Handler function or command */
  handler: HookHandler | string;
  /** Whether hook is enabled */
  enabled?: boolean;
  /** Priority (lower runs first) */
  priority?: number;
}

/**
 * Hooks manager configuration
 */
export interface HooksManagerConfig {
  /** Initial hooks to register */
  hooks?: HookConfig[];
  /** Whether to emit events */
  emitEvents?: boolean;
  /** Whether to track metrics */
  trackMetrics?: boolean;
  /**
   * Maximum number of duration samples to keep per tool.
   * Uses a circular buffer to prevent memory leaks in long-running sessions.
   * @default 1000
   */
  metricsBufferSize?: number;
}
