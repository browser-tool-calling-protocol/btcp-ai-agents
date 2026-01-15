/**
 * Loop Types
 *
 * Shared type definitions for the TOAD (Think, Act, Observe, Decide) loop.
 */

import type { Content } from "@google/genai";
import type {
  AgentEvent,
  AgentConfig,
  AgentState,
  CancellationToken,
  PlanTask,
} from "../../agents/types.js";
import type { CanvasAwareness } from "../../agents/state.js";
import type { ContextManager } from "../../context/manager.js";
import type { HooksManager } from "../../hooks/manager.js";
import type { ResourceRegistry } from "../../resources/registry.js";
import type { SessionSerializer } from "../../context/serialization.js";
import type { ToolResultLifecycle } from "../../context/tool-lifecycle.js";
import type { EchoPoisoningPrevention } from "../../context/echo-prevention.js";
import type { LLMProvider } from "../providers/index.js";
import type { AgentTool, ModelPreference, ModelProvider } from "../../types/index.js";
import type { AgentToolName } from "../../tools/generic-definitions.js";
import type { ToolSet } from "../../tools/ai-sdk-bridge.js";
import type { LogReporter } from "../log-reporter.js";

// ============================================================================
// MCP CLIENT TYPE
// ============================================================================

/**
 * MCP client interface for tool execution
 */
export interface McpClient {
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
  getTools?(): Promise<Array<{ name: string; description: string }>>;
}

// ============================================================================
// MCP EXECUTOR
// ============================================================================

/**
 * MCP executor interface - injected dependency for tool execution
 */
export interface MCPExecutor {
  execute(tool: AgentTool | string, input: unknown): Promise<unknown>;
}

// ============================================================================
// STATE SNAPSHOT OUTPUT
// ============================================================================

/**
 * Generic state snapshot output
 *
 * Extended with optional properties for canvas compatibility
 */
export interface StateSnapshotOutput {
  /** Snapshot ID */
  id?: string;
  /** Timestamp */
  timestamp?: number;
  /** Snapshot data */
  data?: Record<string, unknown>;
  /** Summary string */
  summary?: string;
  /** Formatted output */
  formatted?: string;
  /** Tokens used */
  tokensUsed?: number;
  /** Compression ratio */
  compressionRatio?: number;
  /** Frame skeleton */
  skeleton?: unknown[];
  /** Relevant items */
  relevant?: unknown[];

  // Canvas-compatible optional properties
  /** Element count (for canvas compatibility) */
  elementCount?: number;
  /** Selection (for canvas compatibility) */
  selection?: string[];
  /** Element IDs (for canvas compatibility) */
  elementIds?: string[];
  /** Type counts (for canvas compatibility) */
  typeCounts?: Record<string, number>;
  /** Viewport (for canvas compatibility) */
  viewport?: { x: number; y: number; zoom?: number };
  /** Available regions (for canvas compatibility) */
  availableRegions?: string[];
}

// ============================================================================
// LOOP OPTIONS
// ============================================================================

/**
 * Loop options for runAgenticLoop
 * Extends AgentConfig with additional test/integration options
 */
export interface LoopOptions extends Partial<AgentConfig> {
  /** Custom MCP executor (for testing) */
  executor?: MCPExecutor;
  /** Pre-configured hooks manager (for testing) */
  hooks?: HooksManager;
  /** Pre-configured resource registry (for testing) */
  registry?: ResourceRegistry;
  /** Maximum errors before failure */
  maxErrors?: number;
  /** Skip MCP connection check (for testing) */
  skipMcpConnection?: boolean;
  /**
   * Custom MCP client for testing.
   * When provided, this client is used instead of creating an HttpMcpClient.
   */
  mcpClient?: McpClient & {
    connect(): Promise<boolean>;
    disconnect(): void;
  };
  /**
   * Whitelist of tools to enable. If provided, ONLY these tools are available.
   */
  enabledTools?: AgentToolName[];
  /**
   * Log reporter for unified logging/tracing.
   * When provided, the loop will report all events to this reporter.
   */
  logReporter?: LogReporter;
}

// ============================================================================
// LOOP CONTEXT
// ============================================================================

/**
 * Immutable loop context passed between phases
 */
export interface LoopContext {
  // Core identifiers
  readonly task: string;
  readonly resolvedTask: string;
  readonly canvasId: string;
  readonly sessionId: string;

  // Configuration
  readonly config: AgentConfig;
  readonly options: LoopOptions;
  readonly maxIterations: number;
  readonly checkpointInterval: number;
  readonly maxHistoryEntries: number;

  // Integration systems
  readonly contextManager: ContextManager;
  readonly hooksManager: HooksManager;
  readonly resourceRegistry: ResourceRegistry;
  readonly sessionSerializer: SessionSerializer | undefined;

  // Context management
  readonly toolLifecycle: ToolResultLifecycle;
  readonly echoPrevention: EchoPoisoningPrevention;

  // MCP & Tools
  readonly mcpClient: McpClient & {
    connect(): Promise<boolean>;
    disconnect(): void;
  };
  readonly tools: ToolSet;

  // LLM
  readonly llmProvider: LLMProvider;
  readonly modelId: string;
  readonly systemPrompt: string;

  // Cancellation
  readonly cancellation?: CancellationToken;

  // Logging
  readonly logReporter?: LogReporter;
}

/**
 * Mutable loop state that changes during execution
 */
export interface LoopState {
  iteration: number;
  errors: Array<{ code: string; message: string }>;
  history: Array<{ tool: string; result: unknown }>;
  startTime: number;
  taskState: PlanTask[];
  taskStateUpdatedAt?: number;
  resources: AgentState["resources"];
  lastStateSnapshot: StateSnapshotOutput | null;
  isFirstIteration: boolean;
  lastToolCalls: Array<{ name: string; args: Record<string, unknown> }>;
}

// ============================================================================
// PHASE RESULTS
// ============================================================================

/**
 * Result from THINK phase
 */
export interface ThinkResult {
  events: AgentEvent[];
  userMessage: string;
  awareness: CanvasAwareness;
  stateSnapshot: StateSnapshotOutput | null;
  corrections: string | null;
}

/**
 * Result from LLM generation
 */
export interface GenerateResult {
  text: string | null;
  toolCalls: Array<{ name: string; args: Record<string, unknown> }>;
  finishReason: string;
}

/**
 * Result from ACT phase (single tool execution)
 */
export interface ActResult {
  events: AgentEvent[];
  toolName: AgentToolName;
  toolInput: unknown;
  toolOutput: unknown;
  blocked: boolean;
  interrupted: boolean;
}

/**
 * Result from OBSERVE phase
 */
export interface ObserveResult {
  events: AgentEvent[];
  stateUpdated: boolean;
}

/**
 * Decision from DECIDE phase
 */
export type Decision =
  | { type: "continue" }
  | { type: "complete"; summary: string }
  | { type: "interrupted"; clarificationId: string }
  | { type: "failed"; reason: string; errors: Array<{ code: string; message: string }> }
  | { type: "cancelled"; reason: string }
  | { type: "timeout" };

// ============================================================================
// RE-EXPORTS
// ============================================================================

export type {
  AgentEvent,
  AgentConfig,
  AgentState,
  CancellationToken,
  PlanTask,
  AgentToolName,
  ToolSet,
  LLMProvider,
  ContextManager,
  HooksManager,
  ResourceRegistry,
  SessionSerializer,
  ToolResultLifecycle,
  EchoPoisoningPrevention,
  ModelPreference,
  ModelProvider,
  CanvasAwareness,
  LogReporter,
};

// Legacy type alias
export type CanvasToolName = AgentToolName;
export type CanvasSnapshotOutput = StateSnapshotOutput;
