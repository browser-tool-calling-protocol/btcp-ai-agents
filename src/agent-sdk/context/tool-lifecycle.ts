/**
 * Tool Result Lifecycle Manager
 *
 * Manages the 3-stage lifecycle of tool results:
 * 1. IMMEDIATE - Full result for current turn (5,000 tokens max)
 * 2. RECENT - Compressed for 1-5 turns (500 tokens)
 * 3. ARCHIVED - Summary for 5+ turns (100 tokens)
 *
 * This prevents context bloat by automatically aging tool results
 * and preserving only the most relevant information over time.
 *
 * @see docs/engineering/CONTEXT_MANAGEMENT_GAP_ANALYSIS.md#gap-3
 */

import { estimateTokens } from "./tokens.js";
import { compressToolResult } from "./tool-compressors.js";

// =============================================================================
// Types
// =============================================================================

export type ToolResultStage = "immediate" | "recent" | "archived" | "evicted";

export interface ToolResultWithAge {
  /** Unique tool call ID */
  id: string;
  /** Tool name */
  toolName: string;
  /** Original result data */
  result: unknown;
  /** Full content (IMMEDIATE stage) */
  fullContent: string;
  /** Compressed content (RECENT stage) */
  compressedContent: string | null;
  /** Archived summary (ARCHIVED stage) */
  archivedContent: string | null;
  /** Turn number when created */
  createdAtTurn: number;
  /** Current lifecycle stage */
  stage: ToolResultStage;
  /** Current token count */
  tokens: number;
}

export interface AgeingReport {
  /** IDs of results moved to RECENT stage */
  compressed: string[];
  /** IDs of results moved to ARCHIVED stage */
  archived: string[];
  /** IDs of results evicted */
  evicted: string[];
  /** Total tokens saved by ageing */
  tokensSaved: number;
}

export interface ToolLifecycleConfig {
  /** Turns before IMMEDIATE -> RECENT (default: 1) */
  recentThreshold: number;
  /** Turns before RECENT -> ARCHIVED (default: 5) */
  archiveThreshold: number;
  /** Turns before ARCHIVED -> EVICTED (default: 15) */
  evictThreshold: number;
  /** Max tokens for RECENT stage (default: 500) */
  recentMaxTokens: number;
  /** Max tokens for ARCHIVED stage (default: 100) */
  archiveMaxTokens: number;
}

const DEFAULT_CONFIG: ToolLifecycleConfig = {
  recentThreshold: 1,
  archiveThreshold: 5,
  evictThreshold: 15,
  recentMaxTokens: 500,
  archiveMaxTokens: 100,
};

// =============================================================================
// Tool Result Lifecycle Manager
// =============================================================================

/**
 * Manages the lifecycle of tool results to optimize context window usage.
 *
 * @example
 * ```typescript
 * const lifecycle = new ToolResultLifecycle();
 *
 * // Add result after tool execution
 * lifecycle.addResult("call_123", "canvas_read", result, 1);
 *
 * // Age results at end of each iteration
 * const report = lifecycle.ageResults(2);
 * console.log(`Saved ${report.tokensSaved} tokens`);
 *
 * // Get content for context injection
 * const content = lifecycle.getContent("call_123");
 * ```
 */
export class ToolResultLifecycle {
  private results: Map<string, ToolResultWithAge> = new Map();
  private config: ToolLifecycleConfig;

  constructor(config: Partial<ToolLifecycleConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Add a new tool result (starts in IMMEDIATE stage)
   */
  addResult(
    toolCallId: string,
    toolName: string,
    result: unknown,
    turnNumber: number
  ): ToolResultWithAge {
    const fullContent = typeof result === "string"
      ? result
      : JSON.stringify(result, null, 2);

    const entry: ToolResultWithAge = {
      id: toolCallId,
      toolName,
      result,
      fullContent,
      compressedContent: null,
      archivedContent: null,
      createdAtTurn: turnNumber,
      stage: "immediate",
      tokens: estimateTokens(fullContent),
    };

    this.results.set(toolCallId, entry);
    return entry;
  }

  /**
   * Age all results by one turn (call at end of each iteration)
   *
   * Transitions:
   * - IMMEDIATE -> RECENT (after recentThreshold turns)
   * - RECENT -> ARCHIVED (after archiveThreshold turns)
   * - ARCHIVED -> EVICTED (after evictThreshold turns)
   */
  ageResults(currentTurn: number): AgeingReport {
    const report: AgeingReport = {
      compressed: [],
      archived: [],
      evicted: [],
      tokensSaved: 0,
    };

    for (const [id, entry] of this.results) {
      const age = currentTurn - entry.createdAtTurn;

      // IMMEDIATE -> RECENT
      if (entry.stage === "immediate" && age >= this.config.recentThreshold) {
        const compressed = this.compressToRecent(entry);
        entry.compressedContent = compressed.content;
        entry.stage = "recent";
        report.compressed.push(id);
        report.tokensSaved += entry.tokens - compressed.tokens;
        entry.tokens = compressed.tokens;
      }

      // RECENT -> ARCHIVED
      if (entry.stage === "recent" && age >= this.config.archiveThreshold) {
        const archived = this.compressToArchived(entry);
        entry.archivedContent = archived.content;
        entry.stage = "archived";
        report.archived.push(id);
        report.tokensSaved += entry.tokens - archived.tokens;
        entry.tokens = archived.tokens;
      }

      // ARCHIVED -> EVICTED
      if (entry.stage === "archived" && age >= this.config.evictThreshold) {
        this.results.delete(id);
        report.evicted.push(id);
        report.tokensSaved += entry.tokens;
      }
    }

    return report;
  }

  /**
   * Compress to RECENT stage - preserve IDs, types, bounds
   */
  private compressToRecent(entry: ToolResultWithAge): { content: string; tokens: number } {
    const compressed = compressToolResult(entry.toolName, entry.fullContent, {
      budget: this.config.recentMaxTokens,
      level: "moderate",
    });

    return {
      content: compressed.content,
      tokens: compressed.compressedTokens,
    };
  }

  /**
   * Compress to ARCHIVED stage - one-line summary
   */
  private compressToArchived(entry: ToolResultWithAge): { content: string; tokens: number } {
    const summary = this.generateSummary(entry);
    return {
      content: summary,
      tokens: estimateTokens(summary),
    };
  }

  /**
   * Generate a summary for archived results
   */
  private generateSummary(entry: ToolResultWithAge): string {
    // Tool-specific summaries
    switch (entry.toolName) {
      case "canvas_read": {
        const data = entry.result as { elements?: unknown[] };
        const elementCount = Array.isArray(data) ? data.length : data?.elements?.length ?? 0;
        return `[${entry.toolName}: read ${elementCount} elements]`;
      }
      case "canvas_write": {
        const writeData = entry.result as { createdIds?: string[]; success?: boolean };
        const createdCount = writeData?.createdIds?.length ?? 0;
        return `[${entry.toolName}: created ${createdCount} elements]`;
      }
      case "canvas_edit": {
        const editData = entry.result as { modifiedCount?: number; success?: boolean };
        return `[${entry.toolName}: modified ${editData?.modifiedCount ?? "some"} elements]`;
      }
      case "canvas_find": {
        const findData = entry.result as { matches?: unknown[]; ids?: string[] };
        const matchCount = findData?.matches?.length ?? findData?.ids?.length ?? 0;
        return `[${entry.toolName}: found ${matchCount} matches]`;
      }
      case "canvas_capture": {
        return `[${entry.toolName}: captured image]`;
      }
      case "canvas_layout": {
        const layoutData = entry.result as { arranged?: number; success?: boolean };
        return `[${entry.toolName}: arranged ${layoutData?.arranged ?? "elements"}]`;
      }
      case "canvas_style": {
        return `[${entry.toolName}: applied styles]`;
      }
      case "canvas_delegate": {
        const delegateData = entry.result as { success?: boolean; subagent?: string };
        return `[${entry.toolName}: delegated to ${delegateData?.subagent ?? "subagent"}]`;
      }
      default:
        return `[${entry.toolName}: completed]`;
    }
  }

  /**
   * Get current content for a tool result (appropriate to its lifecycle stage)
   */
  getContent(toolCallId: string): string | null {
    const entry = this.results.get(toolCallId);
    if (!entry) return null;

    switch (entry.stage) {
      case "immediate":
        return entry.fullContent;
      case "recent":
        return entry.compressedContent;
      case "archived":
        return entry.archivedContent;
      default:
        return null;
    }
  }

  /**
   * Get all results at a specific stage
   */
  getResultsByStage(stage: ToolResultStage): ToolResultWithAge[] {
    return Array.from(this.results.values()).filter((r) => r.stage === stage);
  }

  /**
   * Get total tokens used by all results
   */
  getTotalTokens(): number {
    return Array.from(this.results.values()).reduce((sum, r) => sum + r.tokens, 0);
  }

  /**
   * Get tokens by stage
   */
  getTokensByStage(): Record<ToolResultStage, number> {
    const result: Record<ToolResultStage, number> = {
      immediate: 0,
      recent: 0,
      archived: 0,
      evicted: 0,
    };

    for (const entry of this.results.values()) {
      result[entry.stage] += entry.tokens;
    }

    return result;
  }

  /**
   * Force compress a specific result to RECENT stage
   */
  forceCompress(toolCallId: string): boolean {
    const entry = this.results.get(toolCallId);
    if (!entry || entry.stage !== "immediate") return false;

    const compressed = this.compressToRecent(entry);
    entry.compressedContent = compressed.content;
    entry.stage = "recent";
    entry.tokens = compressed.tokens;
    return true;
  }

  /**
   * Force archive a specific result
   */
  forceArchive(toolCallId: string): boolean {
    const entry = this.results.get(toolCallId);
    if (!entry || entry.stage === "archived" || entry.stage === "evicted") return false;

    // Compress to recent first if needed
    if (entry.stage === "immediate") {
      const compressed = this.compressToRecent(entry);
      entry.compressedContent = compressed.content;
    }

    const archived = this.compressToArchived(entry);
    entry.archivedContent = archived.content;
    entry.stage = "archived";
    entry.tokens = archived.tokens;
    return true;
  }

  /**
   * Remove a specific result
   */
  remove(toolCallId: string): boolean {
    return this.results.delete(toolCallId);
  }

  /**
   * Clear all results
   */
  clear(): void {
    this.results.clear();
  }

  /**
   * Get result count
   */
  get size(): number {
    return this.results.size;
  }

  /**
   * Get all result IDs
   */
  getIds(): string[] {
    return Array.from(this.results.keys());
  }

  /**
   * Check if a result exists
   */
  has(toolCallId: string): boolean {
    return this.results.has(toolCallId);
  }

  /**
   * Get a specific result entry
   */
  get(toolCallId: string): ToolResultWithAge | undefined {
    return this.results.get(toolCallId);
  }
}

// =============================================================================
// Factory & Helpers
// =============================================================================

/**
 * Create a tool result lifecycle manager with default config
 */
export function createToolResultLifecycle(
  config?: Partial<ToolLifecycleConfig>
): ToolResultLifecycle {
  return new ToolResultLifecycle(config);
}

/**
 * Get lifecycle stage label for display
 */
export function getStageLabel(stage: ToolResultStage): string {
  switch (stage) {
    case "immediate":
      return "Full Detail";
    case "recent":
      return "Compressed";
    case "archived":
      return "Summary Only";
    case "evicted":
      return "Removed";
  }
}

/**
 * Check if a tool result needs compression based on age
 */
export function needsCompression(
  createdAtTurn: number,
  currentTurn: number,
  config: ToolLifecycleConfig = DEFAULT_CONFIG
): ToolResultStage {
  const age = currentTurn - createdAtTurn;

  if (age >= config.evictThreshold) return "evicted";
  if (age >= config.archiveThreshold) return "archived";
  if (age >= config.recentThreshold) return "recent";
  return "immediate";
}
