/**
 * Staleness Detection
 *
 * Detects stale sessions and canvas states to prevent:
 * - Using outdated element IDs
 * - Assuming canvas state from old sessions
 * - Context poisoning from stale data
 *
 * @see docs/engineering/CONTEXT_MANAGEMENT_GAP_ANALYSIS.md#gap-6
 */

// Generic state snapshot type (replaces CanvasSnapshotOutput)
interface StateSnapshot {
  elementCount?: number;
  elementIds?: string[];
  selection?: string[];
  summary?: string;
  [key: string]: unknown;
}

// Legacy type alias
type CanvasSnapshotOutput = StateSnapshot;
import type { SerializedSession } from "./types.js";

// =============================================================================
// Types
// =============================================================================

export type StalenessLevel = "low" | "medium" | "high" | "critical";

export interface Contradiction {
  /** Type of contradiction */
  type: string;
  /** Saved value */
  saved: string;
  /** Current value */
  current: string;
}

export interface StalenessReport {
  /** Age in milliseconds */
  age: number;
  /** Staleness level based on age */
  level: StalenessLevel;
  /** Whether session is significantly stale */
  isSignificantlyStale: boolean;
  /** Whether canvas has changed since save */
  canvasChanged: boolean;
  /** Element count difference */
  elementCountDiff: number;
  /** List of detected contradictions */
  contradictions: Contradiction[];
  /** Human-readable recommendation */
  recommendation: string;
  /** Whether session can be safely resumed */
  canResume: boolean;
}

export interface CanvasChangeReport {
  /** Whether canvas has changed */
  hasChanged: boolean;
  /** New elements added */
  addedCount: number;
  /** Elements removed */
  removedCount: number;
  /** Elements that still exist */
  existingCount: number;
  /** IDs that were removed */
  removedIds: string[];
  /** IDs that were added */
  addedIds: string[];
}

export interface StalenessConfig {
  /** Age threshold for low staleness (ms) - default 1 hour */
  lowThresholdMs: number;
  /** Age threshold for medium staleness (ms) - default 1 day */
  mediumThresholdMs: number;
  /** Age threshold for high staleness (ms) - default 4 days */
  highThresholdMs: number;
  /** Maximum element count change before warning */
  maxElementCountDiff: number;
}

const DEFAULT_CONFIG: StalenessConfig = {
  lowThresholdMs: 60 * 60 * 1000, // 1 hour
  mediumThresholdMs: 24 * 60 * 60 * 1000, // 1 day
  highThresholdMs: 4 * 24 * 60 * 60 * 1000, // 4 days
  maxElementCountDiff: 10,
};

// =============================================================================
// Staleness Detection
// =============================================================================

/**
 * Detect staleness of a saved session against current canvas state
 */
export function detectStaleness(
  savedState: SerializedSession,
  currentCanvas: CanvasSnapshotOutput,
  config: Partial<StalenessConfig> = {}
): StalenessReport {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const age = Date.now() - savedState.updatedAt;

  // Time-based staleness
  const level: StalenessLevel =
    age > cfg.highThresholdMs ? "critical" :
    age > cfg.mediumThresholdMs ? "high" :
    age > cfg.lowThresholdMs ? "medium" : "low";

  // Canvas-based staleness
  const savedCanvas = savedState.metadata?.lastCanvasState as {
    elementCount?: number;
    elementIds?: string[];
  } | undefined;

  const canvasChanged = savedCanvas
    ? savedCanvas.elementCount !== currentCanvas.elementCount
    : false;

  const elementCountDiff = savedCanvas
    ? Math.abs((savedCanvas.elementCount ?? 0) - (currentCanvas.elementCount ?? 0))
    : 0;

  // Detect contradictions
  const contradictions: Contradiction[] = [];

  if (savedCanvas && canvasChanged) {
    contradictions.push({
      type: "element_count",
      saved: `${savedCanvas.elementCount ?? 0} elements`,
      current: `${currentCanvas.elementCount ?? 0} elements`,
    });
  }

  // Check for removed elements (if we have ID lists)
  if (savedCanvas?.elementIds && currentCanvas.elementIds) {
    const savedIds = new Set<string>(savedCanvas.elementIds);
    const currentIds = new Set<string>(currentCanvas.elementIds);

    const removedIds = Array.from(savedIds).filter(id => !currentIds.has(id));
    const addedIds = Array.from(currentIds).filter(id => !savedIds.has(id));

    if (removedIds.length > 0) {
      contradictions.push({
        type: "elements_removed",
        saved: `${removedIds.length} elements existed`,
        current: `${removedIds.length} elements removed`,
      });
    }

    if (addedIds.length > cfg.maxElementCountDiff) {
      contradictions.push({
        type: "elements_added",
        saved: `${savedIds.size} elements`,
        current: `${addedIds.length} new elements added`,
      });
    }
  }

  // Build recommendation
  let recommendation: string;
  let canResume = true;

  if (level === "critical") {
    recommendation = "Start fresh session. This session is too old to resume safely.";
    canResume = false;
  } else if (canvasChanged && elementCountDiff > cfg.maxElementCountDiff) {
    recommendation = "Canvas has changed significantly. Refresh canvas state before continuing.";
    canResume = true;
  } else if (level === "high") {
    recommendation = "Session is old. Verify canvas state before continuing.";
    canResume = true;
  } else if (canvasChanged) {
    recommendation = "Canvas has minor changes. Consider refreshing canvas state.";
    canResume = true;
  } else {
    recommendation = "Session can be resumed normally.";
    canResume = true;
  }

  return {
    age,
    level,
    isSignificantlyStale: level === "high" || level === "critical",
    canvasChanged,
    elementCountDiff,
    contradictions,
    recommendation,
    canResume,
  };
}

/**
 * Detect changes between saved and current canvas state
 */
export function detectCanvasChanges(
  savedElementIds: string[],
  currentElementIds: string[]
): CanvasChangeReport {
  const savedSet = new Set(savedElementIds);
  const currentSet = new Set(currentElementIds);

  const removedIds = savedElementIds.filter(id => !currentSet.has(id));
  const addedIds = currentElementIds.filter(id => !savedSet.has(id));
  const existingIds = savedElementIds.filter(id => currentSet.has(id));

  return {
    hasChanged: removedIds.length > 0 || addedIds.length > 0,
    addedCount: addedIds.length,
    removedCount: removedIds.length,
    existingCount: existingIds.length,
    removedIds,
    addedIds,
  };
}

/**
 * Check if a specific element ID is still valid
 */
export function isElementIdValid(
  elementId: string,
  currentCanvas: CanvasSnapshotOutput
): boolean {
  const currentIds = new Set(currentCanvas.elementIds || []);
  return currentIds.has(elementId);
}

/**
 * Filter element IDs to only valid ones
 */
export function filterValidElementIds(
  elementIds: string[],
  currentCanvas: CanvasSnapshotOutput
): { valid: string[]; invalid: string[] } {
  const currentIds = new Set(currentCanvas.elementIds || []);
  const valid: string[] = [];
  const invalid: string[] = [];

  for (const id of elementIds) {
    if (currentIds.has(id)) {
      valid.push(id);
    } else {
      invalid.push(id);
    }
  }

  return { valid, invalid };
}

/**
 * Get human-readable age string
 */
export function formatAge(ageMs: number): string {
  const seconds = Math.floor(ageMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} day${days > 1 ? "s" : ""}`;
  if (hours > 0) return `${hours} hour${hours > 1 ? "s" : ""}`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? "s" : ""}`;
  return `${seconds} second${seconds !== 1 ? "s" : ""}`;
}

/**
 * Get staleness level color for UI
 */
export function getStalenessColor(level: StalenessLevel): string {
  switch (level) {
    case "low":
      return "green";
    case "medium":
      return "yellow";
    case "high":
      return "orange";
    case "critical":
      return "red";
  }
}

/**
 * Create a context message for session restoration with staleness info
 */
export function createStalenessContextMessage(report: StalenessReport): string | null {
  if (!report.isSignificantlyStale && !report.canvasChanged) {
    return null;
  }

  const parts: string[] = [];

  parts.push("## Session Restoration Notice\n");

  if (report.isSignificantlyStale) {
    parts.push(`**Warning**: This session is ${formatAge(report.age)} old (${report.level} staleness).`);
  }

  if (report.canvasChanged) {
    parts.push(`**Canvas Changed**: ${report.elementCountDiff} element difference detected.`);
  }

  if (report.contradictions.length > 0) {
    parts.push("\n### Detected Changes:");
    for (const c of report.contradictions) {
      parts.push(`- ${c.type}: was "${c.saved}", now "${c.current}"`);
    }
  }

  parts.push(`\n**Recommendation**: ${report.recommendation}`);

  if (!report.canResume) {
    parts.push("\n**Action Required**: Start a new session or refresh canvas state completely.");
  }

  return parts.join("\n");
}

// =============================================================================
// Session Metadata Helpers
// =============================================================================

/**
 * Create canvas state metadata for session persistence
 */
export function createCanvasStateMetadata(
  snapshot: CanvasSnapshotOutput
): Record<string, unknown> {
  return {
    lastCanvasState: {
      elementCount: snapshot.elementCount,
      elementIds: snapshot.elementIds,
      timestamp: Date.now(),
    },
  };
}

/**
 * Merge canvas state into session metadata
 */
export function mergeCanvasStateMetadata(
  existingMetadata: Record<string, unknown> | undefined,
  snapshot: CanvasSnapshotOutput
): Record<string, unknown> {
  return {
    ...existingMetadata,
    ...createCanvasStateMetadata(snapshot),
  };
}
