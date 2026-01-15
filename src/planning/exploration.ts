/**
 * Canvas Exploration Module
 *
 * Explores the canvas to gather context for planning.
 * Uses READ-ONLY tools - NO mutations happen here.
 */

import type { MCPExecutor } from "../core/loop.js";

// ============================================================================
// TYPES
// ============================================================================

/**
 * Result of exploration phase
 */
export interface ExplorationResult {
  /** Canvas state summary */
  canvasState: {
    elementCount: number;
    elementTypes: Record<string, number>;
    bounds: { x: number; y: number; width: number; height: number };
    frames: string[];
  };

  /** Relevant existing elements */
  relevantElements: Array<{
    id: string;
    type: string;
    position: { x: number; y: number };
  }>;

  /** Available space for new content */
  availableRegions: Array<{
    bounds: { x: number; y: number; width: number; height: number };
    description: string;
  }>;

  /** Style patterns detected */
  stylePatterns?: {
    colors: string[];
    typography: string[];
  };

  /** Issues or constraints discovered */
  constraints: string[];

  /** Time spent exploring */
  durationMs: number;
}

// ============================================================================
// EXPLORATION
// ============================================================================

/**
 * Explore the canvas to gather context for planning
 *
 * This phase uses READ-ONLY tools:
 * - canvas_find (with aggregations)
 * - canvas_read
 *
 * NO mutations happen here.
 */
export async function exploreCanvas(
  task: string,
  executor: MCPExecutor,
  queries?: string[]
): Promise<ExplorationResult> {
  const startTime = Date.now();

  // Default exploration queries
  const defaultQueries = [
    "canvas_find with count and bounds aggregation",
    "canvas_find with type distribution",
  ];

  const _allQueries = [...defaultQueries, ...(queries || [])];

  // Execute read-only exploration
  let elementCount = 0;
  let elementTypes: Record<string, number> = {};
  let bounds = { x: 0, y: 0, width: 800, height: 1600 };
  let frames: string[] = [];
  const relevantElements: ExplorationResult["relevantElements"] = [];
  const constraints: string[] = [];

  try {
    // Get canvas overview
    const overview = await executor.execute("canvas_find", {
      match: {},
      return: "summary",
      aggregate: { count: true, countBy: "type", bounds: true },
    }) as {
      count?: number;
      countBy?: Record<string, number>;
      bounds?: typeof bounds;
    };

    if (overview) {
      elementCount = overview.count || 0;
      elementTypes = overview.countBy || {};
      if (overview.bounds) bounds = overview.bounds;
    }

    // Find frames for potential work regions
    const frameResult = await executor.execute("canvas_find", {
      match: { type: "frame" },
      return: "summary",
    }) as { elements?: Array<{ id: string }> };

    if (frameResult?.elements) {
      frames = frameResult.elements.map((e) => e.id);
    }

    // Check for constraints
    if (elementCount > 100) {
      constraints.push("Canvas has many elements - consider working in isolated frames");
    }

    if (bounds.height > 3000) {
      constraints.push("Canvas is very tall - consider breaking into sections");
    }
  } catch (error) {
    constraints.push(`Exploration error: ${error instanceof Error ? error.message : "Unknown"}`);
  }

  // Calculate available regions
  const availableRegions = calculateAvailableRegions(bounds, elementCount);

  return {
    canvasState: {
      elementCount,
      elementTypes,
      bounds,
      frames,
    },
    relevantElements,
    availableRegions,
    constraints,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Calculate available regions for new content
 */
export function calculateAvailableRegions(
  bounds: { x: number; y: number; width: number; height: number },
  elementCount: number
): ExplorationResult["availableRegions"] {
  const regions: ExplorationResult["availableRegions"] = [];

  if (elementCount === 0) {
    // Empty canvas - full space available
    regions.push({
      bounds: { x: 0, y: 0, width: bounds.width, height: bounds.height },
      description: "Full canvas (empty)",
    });
  } else {
    // Suggest region below existing content
    regions.push({
      bounds: {
        x: 0,
        y: bounds.height + 50,
        width: bounds.width,
        height: 500,
      },
      description: "Below existing content",
    });

    // Suggest region to the right
    regions.push({
      bounds: {
        x: bounds.width + 50,
        y: 0,
        width: 500,
        height: bounds.height,
      },
      description: "Right of existing content",
    });
  }

  return regions;
}
