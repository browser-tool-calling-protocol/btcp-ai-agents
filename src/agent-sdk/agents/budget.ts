/**
 * Context Management Module
 *
 * Implements Claude Code's context window management patterns:
 * 1. Budget Allocation - Fixed percentages for each category
 * 2. Compression Hierarchy - Full → Summary → Minimal → Count
 * 3. Lazy Loading - Load only what's needed
 * 4. Semantic Chunking - Relevance-based selection
 * 5. Sliding Window - Maintain recent history
 *
 * @see docs/engineering/CLAUDE_CODE_PATTERNS.md#context-efficiency
 */

import type { AgentToolName } from "../tools/generic-definitions.js";

// Legacy type alias
type CanvasToolName = AgentToolName;
import type { AgentResources } from "./state.js";

// ============================================================================
// TYPES
// ============================================================================

/**
 * Context allocation configuration
 */
export interface ContextAllocation {
  /** Category name */
  category: ContextCategory;
  /** Allocated tokens */
  tokens: number;
  /** Percentage of total budget */
  percentage: number;
  /** Priority (higher = more important, cut last) */
  priority: number;
  /** Whether this category is required (cannot be cut) */
  required: boolean;
}

/**
 * Context categories matching Claude Code's structure
 */
export type ContextCategory =
  | "system_prompt"    // Base instructions
  | "tools"            // Tool definitions
  | "mcp"              // MCP tool schemas
  | "skills"           // Active skill context
  | "canvas_state"     // Current canvas summary
  | "working_set"      // Selected/viewport elements
  | "history"          // Recent operations
  | "task"             // Current task context
  | "free";            // Available for generation

/**
 * Context budget configuration
 */
export interface ContextBudget {
  /** Total token budget */
  total: number;
  /** Allocations per category */
  allocations: Map<ContextCategory, ContextAllocation>;
  /** Current usage per category */
  usage: Map<ContextCategory, number>;
}

/**
 * Compression level for content
 */
export type CompressionLevel = "full" | "summary" | "minimal" | "count";

/**
 * Context chunk - self-managed unit of context
 */
export interface ContextChunk {
  id: string;
  category: ContextCategory;
  content: string;
  tokens: number;
  compressionLevel: CompressionLevel;
  /** Can this chunk be compressed further? */
  compressible: boolean;
  /** Priority within category */
  priority: number;
  /** Metadata for reconstruction */
  metadata?: Record<string, unknown>;
}

/**
 * Built context ready for LLM (from ContextManager)
 */
export interface ManagedBuiltContext {
  chunks: ContextChunk[];
  totalTokens: number;
  budget: ContextBudget;
  compressionApplied: boolean;
  warnings: string[];
}

// ============================================================================
// DEFAULT ALLOCATIONS
// ============================================================================

/**
 * Default context budget allocations (matching Claude Code patterns)
 *
 * Total: 8000 tokens (for fast models like Haiku/Sonnet)
 * For Opus: multiply by 2-3x
 */
export const DEFAULT_ALLOCATIONS: Record<ContextCategory, Omit<ContextAllocation, "tokens">> = {
  system_prompt: {
    category: "system_prompt",
    percentage: 10,    // ~800 tokens
    priority: 100,     // Highest - never cut
    required: true,
  },
  tools: {
    category: "tools",
    percentage: 15,    // ~1200 tokens
    priority: 95,      // Very high - tools are essential
    required: true,
  },
  mcp: {
    category: "mcp",
    percentage: 5,     // ~400 tokens
    priority: 90,      // High - MCP tools needed
    required: false,
  },
  skills: {
    category: "skills",
    percentage: 15,    // ~1200 tokens
    priority: 70,      // Medium-high - helpful but can compress
    required: false,
  },
  canvas_state: {
    category: "canvas_state",
    percentage: 10,    // ~800 tokens
    priority: 80,      // High - need to understand canvas
    required: true,
  },
  working_set: {
    category: "working_set",
    percentage: 15,    // ~1200 tokens
    priority: 75,      // Medium-high - current focus
    required: false,
  },
  history: {
    category: "history",
    percentage: 10,    // ~800 tokens
    priority: 50,      // Medium - helps but can trim
    required: false,
  },
  task: {
    category: "task",
    percentage: 10,    // ~800 tokens
    priority: 85,      // High - need task context
    required: true,
  },
  free: {
    category: "free",
    percentage: 10,    // ~800 tokens minimum free
    priority: 0,       // Lowest - this is what we're protecting
    required: true,
  },
};

// ============================================================================
// CONTEXT BUDGET
// ============================================================================

/**
 * Create a context budget with allocations
 */
export function createContextBudget(
  totalTokens: number = 8000,
  customAllocations?: Partial<Record<ContextCategory, Partial<ContextAllocation>>>
): ContextBudget {
  const allocations = new Map<ContextCategory, ContextAllocation>();
  const usage = new Map<ContextCategory, number>();

  for (const [category, defaults] of Object.entries(DEFAULT_ALLOCATIONS)) {
    const custom = customAllocations?.[category as ContextCategory];
    const percentage = custom?.percentage ?? defaults.percentage;
    const tokens = Math.floor(totalTokens * (percentage / 100));

    allocations.set(category as ContextCategory, {
      category: category as ContextCategory,
      tokens,
      percentage,
      priority: custom?.priority ?? defaults.priority,
      required: custom?.required ?? defaults.required,
    });

    usage.set(category as ContextCategory, 0);
  }

  return { total: totalTokens, allocations, usage };
}

/**
 * Get remaining tokens for a category
 */
export function getRemainingTokens(
  budget: ContextBudget,
  category: ContextCategory
): number {
  const allocation = budget.allocations.get(category);
  const used = budget.usage.get(category) ?? 0;
  return allocation ? allocation.tokens - used : 0;
}

/**
 * Get total remaining tokens across all categories
 */
export function getTotalRemaining(budget: ContextBudget): number {
  let remaining = 0;
  for (const [category, allocation] of budget.allocations) {
    const used = budget.usage.get(category) ?? 0;
    remaining += allocation.tokens - used;
  }
  return remaining;
}

/**
 * Update usage for a category
 */
export function updateUsage(
  budget: ContextBudget,
  category: ContextCategory,
  tokens: number
): ContextBudget {
  const newUsage = new Map(budget.usage);
  newUsage.set(category, tokens);
  return { ...budget, usage: newUsage };
}

// ============================================================================
// CONTEXT CHUNKS
// ============================================================================

/**
 * Create a context chunk
 */
export function createChunk(
  category: ContextCategory,
  content: string,
  options: {
    id?: string;
    compressionLevel?: CompressionLevel;
    compressible?: boolean;
    priority?: number;
    metadata?: Record<string, unknown>;
  } = {}
): ContextChunk {
  return {
    id: options.id ?? crypto.randomUUID(),
    category,
    content,
    tokens: estimateTokens(content),
    compressionLevel: options.compressionLevel ?? "full",
    compressible: options.compressible ?? true,
    priority: options.priority ?? 50,
    metadata: options.metadata,
  };
}

/**
 * Compress a chunk to a lower level
 */
export function compressChunk(
  chunk: ContextChunk,
  targetLevel: CompressionLevel
): ContextChunk {
  if (!chunk.compressible) return chunk;

  const levelOrder: CompressionLevel[] = ["full", "summary", "minimal", "count"];
  const currentIndex = levelOrder.indexOf(chunk.compressionLevel);
  const targetIndex = levelOrder.indexOf(targetLevel);

  if (targetIndex <= currentIndex) return chunk;

  let compressed = chunk.content;

  switch (targetLevel) {
    case "summary":
      compressed = summarizeContent(chunk.content, chunk.category);
      break;
    case "minimal":
      compressed = minimalizeContent(chunk.content, chunk.category);
      break;
    case "count":
      compressed = countContent(chunk.content, chunk.category);
      break;
  }

  return {
    ...chunk,
    content: compressed,
    tokens: estimateTokens(compressed),
    compressionLevel: targetLevel,
  };
}

// ============================================================================
// CONTEXT MANAGER
// ============================================================================

/**
 * Context Manager - orchestrates context allocation and compression
 */
export class ContextManager {
  private budget: ContextBudget;
  private chunks: Map<string, ContextChunk> = new Map();

  constructor(totalTokens: number = 8000) {
    this.budget = createContextBudget(totalTokens);
  }

  /**
   * Add a chunk to context
   */
  addChunk(chunk: ContextChunk): boolean {
    const remaining = getRemainingTokens(this.budget, chunk.category);

    if (chunk.tokens <= remaining) {
      this.chunks.set(chunk.id, chunk);
      this.budget = updateUsage(
        this.budget,
        chunk.category,
        (this.budget.usage.get(chunk.category) ?? 0) + chunk.tokens
      );
      return true;
    }

    // Try compression
    if (chunk.compressible) {
      const compressed = this.compressToFit(chunk, remaining);
      if (compressed && compressed.tokens <= remaining) {
        this.chunks.set(compressed.id, compressed);
        this.budget = updateUsage(
          this.budget,
          chunk.category,
          (this.budget.usage.get(chunk.category) ?? 0) + compressed.tokens
        );
        return true;
      }
    }

    return false;
  }

  /**
   * Remove a chunk from context
   */
  removeChunk(id: string): boolean {
    const chunk = this.chunks.get(id);
    if (!chunk) return false;

    this.chunks.delete(id);
    this.budget = updateUsage(
      this.budget,
      chunk.category,
      Math.max(0, (this.budget.usage.get(chunk.category) ?? 0) - chunk.tokens)
    );
    return true;
  }

  /**
   * Get chunks for a category
   */
  getChunks(category: ContextCategory): ContextChunk[] {
    return Array.from(this.chunks.values())
      .filter(c => c.category === category)
      .sort((a, b) => b.priority - a.priority);
  }

  /**
   * Build final context
   */
  build(): ManagedBuiltContext {
    const warnings: string[] = [];

    // Check for over-budget categories
    for (const [category, allocation] of this.budget.allocations) {
      const used = this.budget.usage.get(category) ?? 0;
      if (used > allocation.tokens) {
        warnings.push(`${category} over budget: ${used}/${allocation.tokens} tokens`);
      }
    }

    // Sort chunks by category priority, then by chunk priority
    const sortedChunks = Array.from(this.chunks.values()).sort((a, b) => {
      const catA = this.budget.allocations.get(a.category)?.priority ?? 0;
      const catB = this.budget.allocations.get(b.category)?.priority ?? 0;
      if (catA !== catB) return catB - catA;
      return b.priority - a.priority;
    });

    return {
      chunks: sortedChunks,
      totalTokens: Array.from(this.budget.usage.values()).reduce((a, b) => a + b, 0),
      budget: this.budget,
      compressionApplied: sortedChunks.some(c => c.compressionLevel !== "full"),
      warnings,
    };
  }

  /**
   * Get budget summary
   */
  getSummary(): string {
    const lines: string[] = ["Context Budget:"];

    for (const [category, allocation] of this.budget.allocations) {
      const used = this.budget.usage.get(category) ?? 0;
      const bar = generateBar(used, allocation.tokens, 20);
      lines.push(`  ${category.padEnd(15)} ${bar} ${used}/${allocation.tokens}`);
    }

    const total = Array.from(this.budget.usage.values()).reduce((a, b) => a + b, 0);
    lines.push(`  ${"TOTAL".padEnd(15)} ${generateBar(total, this.budget.total, 20)} ${total}/${this.budget.total}`);

    return lines.join("\n");
  }

  /**
   * Compress chunks to fit budget
   */
  private compressToFit(
    chunk: ContextChunk,
    maxTokens: number
  ): ContextChunk | null {
    const levels: CompressionLevel[] = ["summary", "minimal", "count"];

    for (const level of levels) {
      const compressed = compressChunk(chunk, level);
      if (compressed.tokens <= maxTokens) {
        return compressed;
      }
    }

    return null;
  }

  /**
   * Rebalance context when over budget
   */
  rebalance(): void {
    const overBudget = getTotalRemaining(this.budget) < 0;
    if (!overBudget) return;

    // Sort categories by priority (lowest first - cut these first)
    const categories = Array.from(this.budget.allocations.entries())
      .filter(([_, a]) => !a.required)
      .sort((a, b) => a[1].priority - b[1].priority);

    for (const [category] of categories) {
      const chunks = this.getChunks(category);

      // Try compressing chunks in this category
      for (const chunk of chunks) {
        if (!chunk.compressible) continue;

        const compressed = compressChunk(chunk, "minimal");
        const tokensSaved = chunk.tokens - compressed.tokens;

        if (tokensSaved > 0) {
          this.chunks.set(chunk.id, compressed);
          this.budget = updateUsage(
            this.budget,
            category,
            (this.budget.usage.get(category) ?? 0) - tokensSaved
          );

          if (getTotalRemaining(this.budget) >= 0) return;
        }
      }
    }
  }
}

// ============================================================================
// COMPRESSION HELPERS
// ============================================================================

/**
 * Summarize content based on category
 */
function summarizeContent(content: string, category: ContextCategory): string {
  switch (category) {
    case "canvas_state":
      // Extract just the key stats
      return content.replace(/\n\n+/g, "\n").slice(0, 500) + "...";

    case "working_set":
      // Keep IDs and types, remove details
      const lines = content.split("\n");
      return lines.slice(0, 10).join("\n") + `\n... (${lines.length - 10} more)`;

    case "history":
      // Keep only last 5 operations
      const historyLines = content.split("\n");
      return historyLines.slice(-5).join("\n");

    case "skills":
      // Keep headers and first line of each section
      return content.replace(/^(#{1,3}.*)\n(.*)\n[\s\S]*?(?=^#|\Z)/gm, "$1\n$2\n...\n");

    default:
      return content.slice(0, Math.floor(content.length / 2)) + "...";
  }
}

/**
 * Minimize content based on category
 */
function minimalizeContent(content: string, category: ContextCategory): string {
  switch (category) {
    case "canvas_state":
      // Just counts
      const matches = content.match(/(\d+)\s+elements?/i);
      return matches ? `Canvas: ${matches[1]} elements` : "Canvas: unknown size";

    case "working_set":
      const count = (content.match(/id/gi) || []).length;
      return `Working set: ${count} elements`;

    case "history":
      const opCount = content.split("\n").filter(l => l.trim()).length;
      return `History: ${opCount} recent operations`;

    case "skills":
      const skillMatches = content.match(/^#+\s+(.+)$/gm) || [];
      return `Skills: ${skillMatches.slice(0, 3).map(s => s.replace(/^#+\s+/, "")).join(", ")}`;

    default:
      return `[${category}: ${estimateTokens(content)} tokens compressed]`;
  }
}

/**
 * Count-only content
 */
function countContent(content: string, category: ContextCategory): string {
  const tokens = estimateTokens(content);
  return `[${category}: ${tokens} tokens available on request]`;
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Estimate token count (rough approximation)
 * ~4 characters per token for English text
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Generate ASCII progress bar
 */
function generateBar(used: number, total: number, width: number): string {
  const percentage = Math.min(1, used / total);
  const filled = Math.round(percentage * width);
  const empty = width - filled;

  const filledChar = percentage > 0.9 ? "█" : percentage > 0.7 ? "▓" : "░";
  return `[${filledChar.repeat(filled)}${"·".repeat(empty)}]`;
}

// ============================================================================
// CONTEXT BUILDER FOR CANVAS AGENT
// ============================================================================

/**
 * Build context for canvas agent from resources
 */
export function buildCanvasAgentContext(
  task: string,
  resources: AgentResources,
  options: {
    budget?: number;
    includeSkills?: boolean;
    maxHistoryEntries?: number;
  } = {}
): ManagedBuiltContext {
  const manager = new ContextManager(options.budget ?? 8000);

  // System prompt (required, fixed)
  manager.addChunk(createChunk("system_prompt", getSystemPromptContent(), {
    id: "system",
    compressible: false,
    priority: 100,
  }));

  // Task context (required)
  manager.addChunk(createChunk("task", `Current Task: ${task}`, {
    id: "task",
    compressible: false,
    priority: 90,
  }));

  // Canvas state
  const canvasSummary = resources.browser.summary
    ? formatCanvasSummary(resources.browser.summary)
    : `Canvas ID: ${resources.browser.id}, Version: ${resources.browser.version}`;

  manager.addChunk(createChunk("canvas_state", canvasSummary, {
    id: "canvas",
    priority: 80,
  }));

  // Working set (selection/viewport)
  if (resources.browser.workingSet?.length) {
    manager.addChunk(createChunk(
      "working_set",
      formatWorkingSet(resources.browser.workingSet),
      { id: "working", priority: 75 }
    ));
  }

  // History
  const historyCount = options.maxHistoryEntries ?? 10;
  const recentHistory = resources.history.operations.slice(-historyCount);
  if (recentHistory.length > 0) {
    manager.addChunk(createChunk(
      "history",
      formatHistory(recentHistory),
      { id: "history", priority: 50 }
    ));
  }

  // Skills (if enabled)
  if (options.includeSkills && resources.context.skills.length > 0) {
    manager.addChunk(createChunk(
      "skills",
      `Active skills: ${resources.context.skills.join(", ")}`,
      { id: "skills", priority: 70 }
    ));
  }

  // Rebalance if needed
  manager.rebalance();

  return manager.build();
}

// ============================================================================
// FORMATTING HELPERS
// ============================================================================

function getSystemPromptContent(): string {
  return "You are a canvas manipulation agent using Claude Code patterns.";
}

function formatCanvasSummary(summary: {
  elementCount: number;
  typeBreakdown: Record<string, number>;
  bounds: { x: number; y: number; width: number; height: number };
  frameCount: number;
}): string {
  const types = Object.entries(summary.typeBreakdown)
    .map(([t, c]) => `${c} ${t}`)
    .join(", ");

  return `Canvas: ${summary.elementCount} elements (${types}), ${summary.frameCount} frames, bounds: ${summary.bounds.width}x${summary.bounds.height}`;
}

function formatWorkingSet(elements: Array<{ id: string; type: string; [key: string]: unknown }>): string {
  return elements
    .slice(0, 20)
    .map(e => `- ${e.id} (${e.type})`)
    .join("\n");
}

function formatHistory(history: Array<{ tool: CanvasToolName; success: boolean; duration: number }>): string {
  return history
    .map(h => `- ${h.tool}: ${h.success ? "✓" : "✗"} (${h.duration}ms)`)
    .join("\n");
}

