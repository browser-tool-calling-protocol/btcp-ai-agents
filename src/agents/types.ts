/**
 * Agent Types
 *
 * Type definitions for the streaming agent architecture.
 * Updated to use browser/session terminology for BTCP integration.
 *
 * Enhanced with full integration support for:
 * - ContextManager (tiered memory)
 * - HooksManager (pre/post hooks)
 * - ResourceRegistry (@alias resolution)
 * - SessionSerializer (persistence)
 * - BTCPAgentClient (browser tool execution)
 */

import type { AgentToolName } from "../tools/generic-definitions.js";
import type { BTCPAgentClient } from "../btcp/client.js";

// Tool result type
interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

// Type alias for browser tools
type BrowserToolName = AgentToolName;
/** @deprecated Use BrowserToolName instead */
type CanvasToolName = BrowserToolName;
import type { AgentResources } from "./state.js";
import type { ContextManager } from "../context/manager.js";
import type { HooksManager } from "../hooks/manager.js";
import type { ResourceRegistry } from "../resources/registry.js";
import type { SessionSerializer } from "../context/serialization.js";
import type { SubAgentType } from "../core/delegation.js";

/**
 * Agent event types emitted during execution
 * Extended with alias, checkpoint, and delegation events
 */
export type AgentEventType =
  | "thinking"
  | "context"
  | "reasoning"
  | "plan"
  | "step_start"
  | "step_complete"
  | "acting"
  | "observing"
  | "blocked"
  | "error"
  | "recovery"
  | "complete"
  | "failed"
  | "timeout"
  | "cancelled"
  // New event types for full integration
  | "alias_resolving"
  | "alias_resolved"
  | "checkpoint"
  | "delegating"
  | "delegation_complete"
  // Context management events
  | "task_update"
  | "context_injected"
  | "correction"
  // Human-in-the-loop events
  | "clarification_needed"
  // Tool events
  | "tool_call"
  | "tool_result";

/**
 * Base event structure
 */
interface BaseAgentEvent {
  type: AgentEventType;
  timestamp: number;
  iteration?: number;
}

/**
 * Thinking event - agent is analyzing
 */
export interface ThinkingEvent extends BaseAgentEvent {
  type: "thinking";
  message?: string;
}

/**
 * Context event - context has been built
 */
export interface ContextEvent extends BaseAgentEvent {
  type: "context";
  summary: string;
  tokensUsed: number;
}

/**
 * Reasoning event - LLM has generated reasoning
 */
export interface ReasoningEvent extends BaseAgentEvent {
  type: "reasoning";
  content: string;
  decision?: "continue" | "complete";
}

/**
 * Plan event - execution plan generated
 */
export interface PlanEvent extends BaseAgentEvent {
  type: "plan";
  steps: Array<{
    description: string;
    tool?: BrowserToolName;
  }>;
}

/**
 * Step start event - starting a plan step
 */
export interface StepStartEvent extends BaseAgentEvent {
  type: "step_start";
  step: number;
  description: string;
  tool?: BrowserToolName;
}

/**
 * Step complete event - plan step finished
 */
export interface StepCompleteEvent extends BaseAgentEvent {
  type: "step_complete";
  step: number;
  result: ToolResult;
}

/**
 * Acting event - about to execute tool
 */
export interface ActingEvent extends BaseAgentEvent {
  type: "acting";
  tool: BrowserToolName;
  input: unknown;
}

/**
 * Observing event - processing tool result
 */
export interface ObservingEvent extends BaseAgentEvent {
  type: "observing";
  result: ToolResult;
}

/**
 * Blocked event - operation blocked by hook
 */
export interface BlockedEvent extends BaseAgentEvent {
  type: "blocked";
  reason: string;
  tool?: BrowserToolName;
}

/**
 * Error event - an error occurred
 */
export interface ErrorEvent extends BaseAgentEvent {
  type: "error";
  error: {
    code: string;
    message: string;
    recoverable: boolean;
  };
}

/**
 * Recovery event - attempting error recovery
 */
export interface RecoveryEvent extends BaseAgentEvent {
  type: "recovery";
  attempt: number;
  maxAttempts: number;
  strategy: string;
}

/**
 * Complete event - task finished successfully
 */
export interface CompleteEvent extends BaseAgentEvent {
  type: "complete";
  summary: string;
  elementsAffected: number;
  totalDuration: number;
}

/**
 * Failed event - task failed after recovery attempts
 */
export interface FailedEvent extends BaseAgentEvent {
  type: "failed";
  reason: string;
  errors: Array<{ code: string; message: string }>;
}

/**
 * Timeout event - max iterations reached
 */
export interface TimeoutEvent extends BaseAgentEvent {
  type: "timeout";
  iterations: number;
  maxIterations: number;
}

/**
 * Cancelled event - user cancelled execution
 */
export interface CancelledEvent extends BaseAgentEvent {
  type: "cancelled";
  reason: string;
}

/**
 * Alias resolving event - aliases being resolved
 */
export interface AliasResolvingEvent extends BaseAgentEvent {
  type: "alias_resolving";
  aliases: string[];
}

/**
 * Alias resolved event - aliases have been resolved
 */
export interface AliasResolvedEvent extends BaseAgentEvent {
  type: "alias_resolved";
  original: string;
  resolved: string;
  aliasCount: number;
  totalTokens: number;
  errors: string[];
}

/**
 * Checkpoint event - session state saved
 */
export interface CheckpointEvent extends BaseAgentEvent {
  type: "checkpoint";
  sessionId: string;
  browserVersion: number;
  operationCount: number;
}

/**
 * Delegating event - spawning sub-agent
 */
export interface DelegatingEvent extends BaseAgentEvent {
  type: "delegating";
  subagent: SubAgentType;
  task: string;
}

/**
 * Delegation complete event - sub-agent finished
 */
export interface DelegationCompleteEvent extends BaseAgentEvent {
  type: "delegation_complete";
  subagent: SubAgentType;
  success: boolean;
  duration: number;
  tokensUsed?: number;
}

/**
 * Task update event - task list changed
 */
export interface TaskUpdateEvent extends BaseAgentEvent {
  type: "task_update";
  tasks: PlanTask[];
  currentTask?: PlanTask;
  progress: {
    total: number;
    completed: number;
    inProgress: number;
    pending: number;
  };
}

/**
 * Context injected event - fresh context injected for iteration
 */
export interface ContextInjectedEvent extends BaseAgentEvent {
  type: "context_injected";
  canvasState: {
    elementCount: number;
    selection: string[];
  };
  taskCount: number;
  tokensUsed: number;
}

/**
 * Correction event - corrections injected due to echo poisoning
 */
export interface CorrectionEvent extends BaseAgentEvent {
  type: "correction";
  corrections: Array<{
    type: "invalid_id" | "stale_state" | "repeated_error" | "contradiction";
    message: string;
  }>;
}

/**
 * Clarification needed event - agent is asking user for clarification
 *
 * This is a special "interruptible" event that signals the stream should end
 * and wait for user response. The next user message will contain the clarification.
 *
 * @see packages/ai-agents/src/tools/canvas-clarify.ts
 */
export interface ClarificationNeededEvent extends BaseAgentEvent {
  type: "clarification_needed";
  /** Unique ID for this clarification request */
  clarificationId: string;
  /** Questions to ask the user */
  questions: string[];
  /** Why clarification is needed */
  reason?: string;
  /** Suggested options for the user */
  options?: Array<{
    label: string;
    description?: string;
    value: string;
  }>;
  /** Type of clarification */
  clarificationType: string;
}

/**
 * Tool call event - emitted when a tool is about to be called
 */
export interface ToolCallEvent extends BaseAgentEvent {
  type: "tool_call";
  /** Tool being called */
  tool: unknown;
  /** Tool input */
  input?: unknown;
}

/**
 * Tool result event - emitted after a tool completes
 */
export interface ToolResultEvent extends BaseAgentEvent {
  type: "tool_result";
  /** Tool that was called */
  tool: unknown;
  /** Tool result */
  result?: unknown;
}

/**
 * Union of all agent events
 */
export type AgentEvent =
  | ThinkingEvent
  | ContextEvent
  | ReasoningEvent
  | PlanEvent
  | StepStartEvent
  | StepCompleteEvent
  | ActingEvent
  | ObservingEvent
  | BlockedEvent
  | ErrorEvent
  | RecoveryEvent
  | CompleteEvent
  | FailedEvent
  | TimeoutEvent
  | CancelledEvent
  // Alias events
  | AliasResolvingEvent
  | AliasResolvedEvent
  | CheckpointEvent
  | DelegatingEvent
  | DelegationCompleteEvent
  // Context management events
  | TaskUpdateEvent
  | ContextInjectedEvent
  | CorrectionEvent
  // Human-in-the-loop events
  | ClarificationNeededEvent
  // Tool events
  | ToolCallEvent
  | ToolResultEvent;

/**
 * Agent configuration
 */
export interface AgentConfig {
  /** Session ID for browser connection */
  sessionId: string;
  /** Model provider (default: google) - supports "google" and "openai" */
  provider?: "google" | "openai";
  /** Model tier or full model ID (default: balanced) */
  model?: "fast" | "balanced" | "powerful" | string;
  /** Custom system prompt */
  systemPrompt?: string;
  /** Maximum iterations */
  maxIterations?: number;
  /** Token budget for context */
  tokenBudget?: number;
  /** Enable verbose logging */
  verbose?: boolean;
  /** Auto-detect task mode */
  autoDetectMode?: boolean;
  /** Specific mode override */
  mode?: AgentMode;
  /** BTCP server URL (default: http://localhost:8765) */
  btcpUrl?: string;
  /** MCP server URL (legacy, deprecated) */
  mcpUrl?: string;
  /** MCP server configuration (legacy) */
  mcp?: McpConfig;

  // ==========================================================================
  // Full Integration Options (Claude Code Patterns)
  // ==========================================================================

  /**
   * Context manager for tiered memory management.
   * If not provided, a default manager will be created.
   */
  contextManager?: ContextManager;

  /**
   * Hooks manager for pre/post operation hooks.
   * If not provided, a default manager will be created.
   */
  hooksManager?: HooksManager;

  /**
   * Resource registry for @alias resolution.
   * If not provided, a default registry with built-in providers will be created.
   */
  resourceRegistry?: ResourceRegistry;

  /**
   * Session serializer for persistence.
   * If not provided, sessions are not persisted.
   */
  sessionSerializer?: SessionSerializer;

  /**
   * Enable @alias resolution in task text.
   * Default: true
   */
  enableAliasResolution?: boolean;

  /**
   * Checkpoint interval (in iterations).
   * Set to 0 to disable checkpointing.
   * Default: 5
   */
  checkpointInterval?: number;

  /**
   * Enable parallel delegation when multiple sub-agents are needed.
   * Default: true
   */
  enableParallelDelegation?: boolean;

  /**
   * Signal for cancellation support.
   */
  signal?: AbortSignal;

  /**
   * Skip MCP connection check (for testing).
   * When true, the loop will emit mock events instead of connecting to MCP.
   * Default: false
   */
  skipMcpConnection?: boolean;

  // ==========================================================================
  // Tool Access Control (Task Delegation Pattern)
  // ==========================================================================

  /**
   * Whitelist of tools to enable. If provided, ONLY these tools are available.
   * - Main agent: omit for all tools (default behavior)
   * - Sub-agents: use definition.allowedTools from SUBAGENT_DEFINITIONS
   *
   * This enables secure tool isolation for sub-agents.
   *
   * @example
   * // Sub-agent with restricted tools
   * enabledTools: ['context_read', 'context_write', 'task_execute']
   *
   * @example
   * // Main agent with all tools (default when omitted)
   * enabledTools: undefined
   */
  enabledTools?: BrowserToolName[];

  /**
   * BTCP agent client for browser tool execution.
   * If not provided, a default client will be created using btcpUrl.
   */
  btcpClient?: BTCPAgentClient;
}

/**
 * Agent modes for specialized prompts
 */
export type AgentMode =
  | "general"
  | "generation"
  | "diagram"
  | "ui-mockup"
  | "moodboard"
  | "storyboard"
  | "creative"
  | "analysis"
  | "layout"
  | "styling"
  | "editing";

/**
 * MCP server configuration
 */
export interface McpConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

/**
 * LLM reasoning result
 */
export interface ReasoningResult {
  thinking: string;
  decision: "continue" | "complete";
  tool?: BrowserToolName;
  input?: Record<string, unknown>;
  summary?: string;
}

/**
 * Context for LLM prompting
 */
export interface AgentContext {
  summary: string;
  skeleton?: unknown;
  relevant?: unknown[];
  working?: unknown[];
  history?: Array<{ tool: BrowserToolName; result: unknown }>;
  tokensUsed: number;
  compressionRatio?: number;
}

/**
 * Cancellation token
 */
export interface CancellationToken {
  cancelled: boolean;
  reason?: string;
  cancel(reason?: string): void;
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

/**
 * Plan task status (like Claude Code's TodoWrite)
 */
export type PlanTaskStatus = "pending" | "in_progress" | "completed" | "failed";

/**
 * Plan task structure (like Claude Code's TodoWrite)
 */
export interface PlanTask {
  /** Task ID */
  id: string;
  /** Task description */
  content: string;
  /** Current status */
  status: PlanTaskStatus;
  /** Active form for UI display (e.g., "Creating header frame") */
  activeForm?: string;
  /** Created timestamp */
  createdAt: number;
  /** Completed timestamp */
  completedAt?: number;
  /** Element IDs created by this task */
  elementIds?: string[];
}

/**
 * Agent state (used internally)
 */
export interface AgentState {
  resources: AgentResources;
  iteration: number;
  errors: Array<{ code: string; message: string }>;
  history: Array<{ tool: BrowserToolName; result: unknown }>;
  startTime: number;

  /**
   * Current task list from agent_plan (like Claude Code's TodoWrite state)
   * Injected into context each iteration for task awareness
   */
  taskState: PlanTask[];

  /**
   * When task state was last updated
   */
  taskStateUpdatedAt?: number;
}
