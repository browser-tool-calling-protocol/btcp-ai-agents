/**
 * Resources Module (Pattern 4)
 *
 * Stateless systems with observable state.
 * All agent state lives in resources - serializable, inspectable, testable.
 *
 * Updated to use browser/session terminology for BTCP integration.
 *
 * @see docs/engineering/CLAUDE_CODE_PATTERNS.md#pattern-4
 */

import type { AgentToolName } from "../tools/generic-definitions.js";
import type { ActionDefinition } from "../adapters/types.js";

// Legacy type alias
type BrowserToolName = AgentToolName;

/**
 * Browser resource - current browser state
 */
export interface BrowserResource {
  /** Session identifier */
  id: string;
  /** Version number (incremented on each change) */
  version: number;
  /** Available browser tools (from BTCP) */
  availableTools?: ActionDefinition[];
  /** Summary of browser state */
  summary?: BrowserSummary;
  /** Current working context */
  workingSet?: Element[];
  /** Last known viewport */
  viewport?: ViewportState;
}

/**
 * Browser summary
 */
export interface BrowserSummary {
  elementCount: number;
  typeBreakdown: Record<string, number>;
  bounds: BoundingBox;
  toolCount: number;
}

// Legacy type aliases
/** @deprecated Use BrowserResource instead */
export type CanvasResource = BrowserResource;
/** @deprecated Use BrowserSummary instead */
export type CanvasSummary = BrowserSummary;

/**
 * Viewport state
 */
export interface ViewportState {
  x: number;
  y: number;
  zoom: number;
  width: number;
  height: number;
}

/**
 * Bounding box
 */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Element (simplified)
 */
export interface Element {
  id: string;
  type: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  [key: string]: unknown;
}

/**
 * Task resource - current task state
 */
export interface TaskResource {
  /** Task identifier */
  id: string;
  /** Current status */
  status: TaskStatus;
  /** Current step in execution plan */
  currentStep: number;
  /** Total steps in plan */
  totalSteps?: number;
  /** Checkpoint for recovery */
  checkpoint?: Checkpoint;
  /** Start time */
  startedAt: number;
  /** Errors encountered */
  errors: TaskError[];
}

/**
 * Task status
 */
export type TaskStatus =
  | "pending"
  | "analyzing"
  | "planning"
  | "executing"
  | "completed"
  | "failed"
  | "cancelled";

/**
 * Task checkpoint for recovery
 */
export interface Checkpoint {
  step: number;
  timestamp: number;
  browserVersion: number;
  data?: unknown;
}

/**
 * Task error
 */
export interface TaskError {
  code: string;
  message: string;
  timestamp: number;
  recoverable: boolean;
  tool?: CanvasToolName;
}

/**
 * Browser awareness - AI's understanding of current browser state
 *
 * This is NOT the LLM context window (see packages/ai-agents/src/context).
 * This is the browser state snapshot that the AI uses for reasoning.
 *
 * Fetched via BTCP tools and cached with staleness tracking.
 */
export interface BrowserAwareness {
  /** Compact summary string */
  summary: string;
  /** Formatted context string */
  formatted?: string;
  /** Available browser tools from BTCP */
  availableTools?: Array<{
    name: string;
    description: string;
  }>;
  /** DOM or page structure skeleton */
  skeleton?: Array<{
    id: string;
    name?: string;
    bounds: { x: number; y: number; width: number; height: number };
    childCount: number;
    children?: unknown[];
  }>;
  /** Task-relevant elements */
  relevant?: Array<{
    id: string;
    type: string;
    name?: string;
    bounds: { x: number; y: number; width: number; height: number };
    text?: string;
    score: number;
  }>;
  /** Tokens used */
  tokensUsed: number;
  /** Compression ratio */
  compressionRatio?: number;
}

/** @deprecated Use BrowserAwareness instead */
export type CanvasAwareness = BrowserAwareness;

/**
 * Context resource - token management and cached context
 *
 * Implements caching with staleness tracking to avoid
 * redundant BTCP calls during the agentic loop.
 */
export interface ContextResource {
  /** Token budget */
  tokenBudget: number;
  /** Tokens used */
  tokensUsed: number;
  /** Active strategies */
  strategies: ContextStrategy[];
  /** Loaded skills */
  skills: string[];

  // === Browser Awareness (cached snapshot) ===

  /** Cached browser awareness (AI's understanding of browser state) */
  awareness: BrowserAwareness | null;
  /** When the awareness was fetched */
  awarenessFetchedAt: number;
  /** Is the awareness stale? (invalidated after mutations) */
  awarenessIsStale: boolean;
}

/**
 * Context strategy
 */
export type ContextStrategy =
  | "lazy"
  | "compressed"
  | "semantic"
  | "viewport"
  | "selection";

/**
 * History resource - operation history
 */
export interface HistoryResource {
  /** Operations performed */
  operations: HistoryEntry[];
  /** Maximum entries to keep */
  maxEntries: number;
}

/**
 * History entry
 */
export interface HistoryEntry {
  tool: BrowserToolName;
  input: unknown;
  result: unknown;
  timestamp: number;
  duration: number;
  success: boolean;
}

/**
 * Complete agent resources
 */
export interface AgentResources {
  browser: BrowserResource;
  task: TaskResource;
  context: ContextResource;
  history: HistoryResource;
}

// Legacy type alias for backward compatibility
/** @deprecated Use AgentResources.browser instead of AgentResources.canvas */
type CanvasToolName = BrowserToolName;

/**
 * Create default resources
 */
export function createResources(sessionId: string): AgentResources {
  const now = Date.now();

  return {
    browser: {
      id: sessionId,
      version: 0,
    },
    task: {
      id: crypto.randomUUID(),
      status: "pending",
      currentStep: 0,
      startedAt: now,
      errors: [],
    },
    context: {
      tokenBudget: 8000,
      tokensUsed: 0,
      strategies: ["lazy"],
      skills: [],
      awareness: null,
      awarenessFetchedAt: 0,
      awarenessIsStale: true, // Start stale to trigger initial fetch
    },
    history: {
      operations: [],
      maxEntries: 50,
    },
  };
}

/**
 * Clone resources (immutable update helper)
 */
export function cloneResources(resources: AgentResources): AgentResources {
  return {
    browser: { ...resources.browser },
    task: { ...resources.task, errors: [...resources.task.errors] },
    context: {
      ...resources.context,
      strategies: [...resources.context.strategies],
      skills: [...resources.context.skills],
      awareness: resources.context.awareness ? { ...resources.context.awareness } : null,
    },
    history: {
      ...resources.history,
      operations: [...resources.history.operations],
    },
  };
}

/**
 * Update browser resource
 */
export function updateBrowser(
  resources: AgentResources,
  updates: Partial<BrowserResource>
): AgentResources {
  return {
    ...resources,
    browser: { ...resources.browser, ...updates },
  };
}

/** @deprecated Use updateBrowser instead */
export const updateCanvas = updateBrowser;

/**
 * Update task resource
 */
export function updateTask(
  resources: AgentResources,
  updates: Partial<TaskResource>
): AgentResources {
  return {
    ...resources,
    task: { ...resources.task, ...updates },
  };
}

/**
 * Add history entry
 */
export function addHistory(
  resources: AgentResources,
  entry: HistoryEntry
): AgentResources {
  const operations = [
    ...resources.history.operations.slice(-(resources.history.maxEntries - 1)),
    entry,
  ];

  return {
    ...resources,
    history: { ...resources.history, operations },
  };
}

/**
 * Add task error
 */
export function addError(
  resources: AgentResources,
  error: Omit<TaskError, "timestamp">
): AgentResources {
  return {
    ...resources,
    task: {
      ...resources.task,
      errors: [
        ...resources.task.errors,
        { ...error, timestamp: Date.now() },
      ],
    },
  };
}

/**
 * Create checkpoint
 */
export function createCheckpoint(
  resources: AgentResources,
  data?: unknown
): AgentResources {
  return {
    ...resources,
    task: {
      ...resources.task,
      checkpoint: {
        step: resources.task.currentStep,
        timestamp: Date.now(),
        browserVersion: resources.browser.version,
        data,
      },
    },
  };
}

// ============================================================================
// Browser Awareness Helpers
// ============================================================================

/**
 * Tools that mutate state (require context invalidation)
 */
export const MUTATION_TOOLS: BrowserToolName[] = [
  "context_write",
  "task_execute",
] as unknown as BrowserToolName[];

/**
 * Tools that only read state (no invalidation needed)
 */
export const READ_ONLY_TOOLS: BrowserToolName[] = [
  "context_read",
  "context_search",
  "state_snapshot",
] as unknown as BrowserToolName[];

/**
 * Check if a tool mutates browser state
 */
export function isMutationTool(tool: BrowserToolName): boolean {
  return MUTATION_TOOLS.includes(tool);
}

/**
 * Update cached awareness after fetching from BTCP
 */
export function updateAwareness(
  resources: AgentResources,
  awareness: BrowserAwareness
): AgentResources {
  return {
    ...resources,
    context: {
      ...resources.context,
      awareness,
      awarenessFetchedAt: Date.now(),
      awarenessIsStale: false,
      tokensUsed: awareness.tokensUsed,
    },
  };
}

/**
 * Invalidate cached awareness (call after mutations)
 */
export function invalidateAwareness(resources: AgentResources): AgentResources {
  return {
    ...resources,
    context: {
      ...resources.context,
      awarenessIsStale: true,
    },
    // Also increment browser version on mutation
    browser: {
      ...resources.browser,
      version: resources.browser.version + 1,
    },
  };
}

/**
 * Check if awareness needs refresh
 *
 * Returns true if:
 * - No cached awareness
 * - Awareness is marked stale (after mutation)
 * - Awareness is older than maxAge (optional TTL)
 */
export function needsAwarenessRefresh(
  resources: AgentResources,
  maxAge?: number
): boolean {
  const { awareness, awarenessIsStale, awarenessFetchedAt } = resources.context;

  // No cache
  if (!awareness) return true;

  // Explicitly stale
  if (awarenessIsStale) return true;

  // TTL expired (if maxAge provided)
  if (maxAge && Date.now() - awarenessFetchedAt > maxAge) return true;

  return false;
}

/**
 * Serialize resources for persistence
 */
export function serializeResources(resources: AgentResources): string {
  return JSON.stringify(resources);
}

/**
 * Deserialize resources from persistence
 */
export function deserializeResources(data: string): AgentResources {
  return JSON.parse(data) as AgentResources;
}

/**
 * Get resource summary for debugging
 */
export function getResourcesSummary(resources: AgentResources): string {
  return `Browser: v${resources.browser.version} | Task: ${resources.task.status} (step ${resources.task.currentStep}) | Context: ${resources.context.tokensUsed}/${resources.context.tokenBudget} tokens | History: ${resources.history.operations.length} ops`;
}
