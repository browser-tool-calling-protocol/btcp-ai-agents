/**
 * Context Builder
 *
 * @deprecated This module is deprecated. Context building is now handled by
 * canvas-driver and exposed via the canvas_snapshot MCP tool.
 *
 * For AI agents, use the canvas_snapshot MCP tool instead:
 * ```typescript
 * const result = await mcp.execute('canvas_snapshot', {
 *   task: 'Add a flowchart',
 *   tokenBudget: 8000,
 * });
 * ```
 *
 * @see packages/canvas-driver/src/utils/context-builder.ts
 */

// Local type definitions (mirroring canvas-driver types for ai-agents usage)
export interface BuiltContext {
  summary: string;
  skeleton?: unknown[];
  relevant?: unknown[];
  working?: unknown[];
  tokensUsed: number;
  compressionRatio?: number;
  viewport?: { x: number; y: number; zoom: number };
  selection?: string[];
}

export interface ContextOptions {
  task?: string;
  tokenBudget?: number;
  includeHistory?: boolean;
  focusArea?: { x: number; y: number; width: number; height: number };
}

export interface OperationHistoryEntry {
  tool: string;
  timestamp: number;
  elementIds?: string[];
  description?: string;
}

export interface FrameTreeNode {
  id: string;
  name?: string;
  children: FrameTreeNode[];
  bounds: { x: number; y: number; width: number; height: number };
}

export interface RelevantElement {
  id: string;
  type: string;
  relevanceScore: number;
  reason?: string;
}

/** Token budgets for different context tiers */
export const TOKEN_BUDGETS = {
  MINIMAL: 500,
  COMPACT: 2000,
  STANDARD: 8000,
  EXTENDED: 16000,
  FULL: 32000,
} as const;

/**
 * @deprecated Use canvas_snapshot MCP tool instead.
 * This function is kept for backwards compatibility but will be removed.
 */
export async function buildContext(
  _canvasId: string,
  _task: string,
  _options: Record<string, unknown> = {}
): Promise<{
  summary: string;
  tokensUsed: number;
  skeleton?: unknown[];
  relevant?: unknown[];
  working?: unknown[];
  history?: unknown[];
  compressionRatio?: number;
}> {
  console.warn(
    "[DEPRECATED] buildContext is deprecated. Use canvas_snapshot MCP tool instead."
  );
  // Return empty context - callers should migrate to canvas_snapshot MCP tool
  return {
    summary: "Context building moved to canvas-driver. Use canvas_snapshot MCP tool.",
    tokensUsed: 100,
  };
}
