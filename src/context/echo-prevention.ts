/**
 * Echo Poisoning Prevention
 *
 * Prevents LLM errors from compounding over iterations by:
 * 1. Validating element ID references against actual canvas state
 * 2. Detecting repeated error patterns (loops)
 * 3. Injecting corrections into context
 *
 * Echo poisoning occurs when the LLM hallucinates IDs or facts, then
 * uses those hallucinations in subsequent turns, creating a feedback loop.
 *
 * @see docs/engineering/CONTEXT_MANAGEMENT_GAP_ANALYSIS.md#gap-4
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

// =============================================================================
// Types
// =============================================================================

export type CorrectionType =
  | "invalid_id"
  | "stale_state"
  | "repeated_error"
  | "contradiction";

export interface Correction {
  type: CorrectionType;
  /** The claimed/incorrect value */
  claimed?: string;
  /** Previous value (for stale_state) */
  oldValue?: string;
  /** Current value (for stale_state) */
  newValue?: string;
  /** Approach that was repeated (for repeated_error) */
  approach?: string;
  /** Number of times repeated */
  count?: number;
  /** Human-readable message */
  message: string;
  /** Timestamp */
  timestamp: number;
}

export interface ValidationIssue {
  type: string;
  claimed: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

export interface LoopDetection {
  detected: boolean;
  count: number;
  message: string;
  severity: "warning" | "critical";
}

interface ErrorEntry {
  error: string;
  toolName: string;
  timestamp: number;
  turnNumber: number;
}

export interface EchoPoisoningConfig {
  /** Maximum number of recent errors to track */
  maxRecentErrors: number;
  /** Number of same errors to trigger loop detection */
  loopThreshold: number;
  /** Time window for error loop detection (ms) */
  errorWindowMs: number;
}

const DEFAULT_CONFIG: EchoPoisoningConfig = {
  maxRecentErrors: 10,
  loopThreshold: 2,
  errorWindowMs: 60_000, // 1 minute
};

// =============================================================================
// Echo Poisoning Prevention
// =============================================================================

/**
 * Prevents echo poisoning by validating tool results and detecting error loops.
 *
 * @example
 * ```typescript
 * const prevention = new EchoPoisoningPrevention();
 *
 * // After tool execution, validate result
 * const validation = await prevention.validateToolResult(
 *   "canvas_write",
 *   result,
 *   canvasSnapshot
 * );
 *
 * if (!validation.valid) {
 *   for (const issue of validation.issues) {
 *     prevention.addCorrection({
 *       type: "invalid_id",
 *       claimed: issue.claimed,
 *       message: issue.message,
 *     });
 *   }
 * }
 *
 * // Before next iteration, get corrections to inject
 * const correctionsContext = prevention.formatCorrectionsForContext();
 * ```
 */
export class EchoPoisoningPrevention {
  private recentErrors: ErrorEntry[] = [];
  private corrections: Correction[] = [];
  private config: EchoPoisoningConfig;
  private currentTurn = 0;

  constructor(config: Partial<EchoPoisoningConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Set the current turn number
   */
  setTurn(turn: number): void {
    this.currentTurn = turn;
  }

  /**
   * Validate tool input against actual canvas state
   */
  validateToolInput(
    toolName: string,
    input: unknown,
    canvasSnapshot: CanvasSnapshotOutput
  ): ValidationResult {
    const validElementIds = new Set(canvasSnapshot.elementIds || []);
    const issues: ValidationIssue[] = [];

    // Check for edit targets that don't exist
    if (toolName === "canvas_edit") {
      const editInput = input as {
        target?: string | string[];
        operations?: Array<{ target?: string | { id?: string } }>;
      };

      // Check single target
      if (typeof editInput.target === "string" && !validElementIds.has(editInput.target)) {
        issues.push({
          type: "invalid_target_id",
          claimed: editInput.target,
          message: `Target "${editInput.target}" does not exist on canvas`,
        });
      }

      // Check array of targets
      if (Array.isArray(editInput.target)) {
        for (const id of editInput.target) {
          if (!validElementIds.has(id)) {
            issues.push({
              type: "invalid_target_id",
              claimed: id,
              message: `Target "${id}" does not exist on canvas`,
            });
          }
        }
      }

      // Check operations with targets
      if (Array.isArray(editInput.operations)) {
        for (const op of editInput.operations) {
          const targetId = typeof op.target === "string" ? op.target : op.target?.id;
          if (targetId && !validElementIds.has(targetId)) {
            issues.push({
              type: "invalid_target_id",
              claimed: targetId,
              message: `Operation target "${targetId}" does not exist on canvas`,
            });
          }
        }
      }
    }

    // Check canvas_read for specific element IDs
    if (toolName === "canvas_read") {
      const readInput = input as { target?: string | { elementId?: string } };
      const targetId = typeof readInput.target === "string"
        ? readInput.target
        : readInput.target?.elementId;

      if (targetId && targetId !== "canvas" && targetId !== "selection" && !validElementIds.has(targetId)) {
        issues.push({
          type: "invalid_target_id",
          claimed: targetId,
          message: `Read target "${targetId}" does not exist on canvas`,
        });
      }
    }

    return { valid: issues.length === 0, issues };
  }

  /**
   * Validate tool result against actual canvas state
   */
  validateToolResult(
    toolName: string,
    result: unknown,
    canvasSnapshot: CanvasSnapshotOutput
  ): ValidationResult {
    const validElementIds = new Set(canvasSnapshot.elementIds || []);
    const issues: ValidationIssue[] = [];

    // Check for created IDs that don't exist
    if (toolName === "canvas_write") {
      const writeResult = result as { createdIds?: string[]; success?: boolean };

      // Only validate if the operation reported success
      if (writeResult.success !== false && Array.isArray(writeResult.createdIds)) {
        for (const id of writeResult.createdIds) {
          if (!validElementIds.has(id)) {
            issues.push({
              type: "invalid_created_id",
              claimed: id,
              message: `Created ID "${id}" not found in canvas state`,
            });
          }
        }
      }
    }

    return { valid: issues.length === 0, issues };
  }

  /**
   * Detect error loop patterns
   */
  detectErrorLoop(error: string, toolName: string): LoopDetection | null {
    const entry: ErrorEntry = {
      error,
      toolName,
      timestamp: Date.now(),
      turnNumber: this.currentTurn,
    };

    this.recentErrors.push(entry);

    // Keep only recent errors within time window
    const cutoff = Date.now() - this.config.errorWindowMs;
    this.recentErrors = this.recentErrors.filter(e => e.timestamp > cutoff);

    // Trim to max size
    if (this.recentErrors.length > this.config.maxRecentErrors) {
      this.recentErrors = this.recentErrors.slice(-this.config.maxRecentErrors);
    }

    // Check for repeated same error
    const sameErrors = this.recentErrors.filter(
      e => e.error === error && e.toolName === toolName
    );

    if (sameErrors.length >= this.config.loopThreshold) {
      return {
        detected: true,
        count: sameErrors.length,
        message: `STOP: You've encountered "${error}" ${sameErrors.length} times with ${toolName}. Try a different approach.`,
        severity: sameErrors.length >= 3 ? "critical" : "warning",
      };
    }

    return null;
  }

  /**
   * Detect if the LLM is hallucinating element IDs
   */
  detectIdHallucination(
    mentionedIds: string[],
    validIds: Set<string>
  ): string[] {
    return mentionedIds.filter(id => !validIds.has(id));
  }

  /**
   * Add a correction to inject into next iteration
   */
  addCorrection(correction: Omit<Correction, "timestamp">): void {
    this.corrections.push({
      ...correction,
      timestamp: Date.now(),
    });
  }

  /**
   * Add correction for invalid ID
   */
  addInvalidIdCorrection(claimedId: string): void {
    this.addCorrection({
      type: "invalid_id",
      claimed: claimedId,
      message: `"${claimedId}" does not exist. Use canvas_find to locate elements.`,
    });
  }

  /**
   * Add correction for stale state
   */
  addStaleStateCorrection(oldValue: string, newValue: string): void {
    this.addCorrection({
      type: "stale_state",
      oldValue,
      newValue,
      message: `Canvas has changed. Previous: ${oldValue}. Current: ${newValue}.`,
    });
  }

  /**
   * Add correction for repeated error
   */
  addRepeatedErrorCorrection(approach: string, count: number): void {
    this.addCorrection({
      type: "repeated_error",
      approach,
      count,
      message: `STOP retrying "${approach}". It has failed ${count} times.`,
    });
  }

  /**
   * Get and clear corrections for injection
   */
  getAndClearCorrections(): Correction[] {
    const corrections = [...this.corrections];
    this.corrections = [];
    return corrections;
  }

  /**
   * Get corrections without clearing
   */
  getCorrections(): Correction[] {
    return [...this.corrections];
  }

  /**
   * Format corrections for context injection
   */
  formatCorrectionsForContext(): string | null {
    const corrections = this.getAndClearCorrections();
    if (corrections.length === 0) return null;

    const formatted = corrections.map(c => {
      switch (c.type) {
        case "invalid_id":
          return `- "${c.claimed}" does not exist. Use canvas_find to locate elements.`;
        case "stale_state":
          return `- Canvas has changed. Previous: ${c.oldValue}. Current: ${c.newValue}.`;
        case "repeated_error":
          return `- STOP retrying "${c.approach}". It has failed ${c.count} times. Try a different approach.`;
        case "contradiction":
          return `- Contradiction detected: ${c.message}`;
        default:
          return `- ${c.message}`;
      }
    });

    return `## Important Corrections

${formatted.join("\n")}

Acknowledge these corrections before proceeding. Do not repeat the same errors.`;
  }

  /**
   * Check if there are pending corrections
   */
  hasCorrections(): boolean {
    return this.corrections.length > 0;
  }

  /**
   * Get correction count
   */
  get correctionCount(): number {
    return this.corrections.length;
  }

  /**
   * Get recent error count
   */
  get errorCount(): number {
    return this.recentErrors.length;
  }

  /**
   * Clear all state
   */
  clear(): void {
    this.recentErrors = [];
    this.corrections = [];
  }

  /**
   * Extract element IDs from LLM text
   */
  static extractElementIds(text: string): string[] {
    // Match common ID patterns:
    // - element-xxx
    // - frame-xxx
    // - text-xxx
    // - rect-xxx
    // - UUIDs
    const patterns = [
      /\b(element|frame|text|rect|ellipse|line|arrow|group|image)-[a-zA-Z0-9_-]+\b/g,
      /\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b/gi,
      /\bid[:=]["']?([a-zA-Z0-9_-]+)["']?/gi,
    ];

    const ids = new Set<string>();

    for (const pattern of patterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        ids.add(match[1] || match[0]);
      }
    }

    return Array.from(ids);
  }
}

// =============================================================================
// Factory & Helpers
// =============================================================================

/**
 * Create an echo poisoning prevention instance
 */
export function createEchoPoisoningPrevention(
  config?: Partial<EchoPoisoningConfig>
): EchoPoisoningPrevention {
  return new EchoPoisoningPrevention(config);
}

/**
 * Quick validation of element IDs against canvas state
 */
export function validateElementIds(
  ids: string[],
  canvasSnapshot: CanvasSnapshotOutput
): { valid: string[]; invalid: string[] } {
  const validIds = new Set(canvasSnapshot.elementIds || []);
  const valid: string[] = [];
  const invalid: string[] = [];

  for (const id of ids) {
    if (validIds.has(id)) {
      valid.push(id);
    } else {
      invalid.push(id);
    }
  }

  return { valid, invalid };
}
