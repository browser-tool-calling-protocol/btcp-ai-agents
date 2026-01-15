/**
 * Complexity Assessment Module
 *
 * Quick complexity assessment without using tools.
 * Analyzes the prompt text to decide if we need the full
 * explore → plan → execute flow.
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * Complexity assessment result
 */
export interface ComplexityAssessment {
  /** Is this task complex enough to need planning? */
  isComplex: boolean;

  /** Why we made this decision */
  reason: string;

  /** Estimated operations */
  estimatedOperations: number;

  /** Needs exploration before planning? */
  needsExploration: boolean;

  /** What to explore */
  explorationQueries?: string[];

  /** Confidence in assessment */
  confidence: number;

  /** Is the request too ambiguous to proceed? */
  needsClarification?: boolean;

  /** What's missing from the request */
  missingInfo?: string[];
}

// ============================================================================
// COMPLEXITY ASSESSMENT
// ============================================================================

/**
 * Quick complexity assessment without using tools
 *
 * This is FAST - just analyzes the prompt text to decide if we need
 * the full explore → plan → execute flow.
 */
export function assessComplexity(task: string): ComplexityAssessment {
  const lower = task.toLowerCase();
  const words = task.split(/\s+/).length;

  // Signals of complexity
  const signals = {
    // Multiple sections mentioned
    multipleSections: (lower.match(/section|part|area|region/g) || []).length >= 2,

    // List of items
    hasList: /including|with|:/.test(lower) && lower.split(",").length >= 2,

    // Multiple action verbs
    multipleActions: (lower.match(/\b(create|add|make|build|generate|update|modify)\b/g) || []).length >= 2,

    // Complexity keywords
    complexityKeywords: /complex|detailed|comprehensive|full|complete|multiple/.test(lower),

    // Specific complex content types
    complexContent: /infographic|dashboard|diagram|flowchart|timeline/.test(lower),

    // Long description
    longDescription: words > 20,

    // Numbered items
    numberedItems: /\d+\./.test(task),
  };

  // Count positive signals
  const positiveSignals = Object.values(signals).filter(Boolean).length;

  // Determine if exploration is needed
  const needsExploration =
    lower.includes("existing") ||
    lower.includes("current") ||
    lower.includes("modify") ||
    lower.includes("update") ||
    lower.includes("add to") ||
    lower.includes("based on");

  // Build exploration queries if needed
  const explorationQueries: string[] = [];
  if (needsExploration) {
    explorationQueries.push("Get current canvas state and element count");
    if (lower.includes("style") || lower.includes("color")) {
      explorationQueries.push("Analyze existing color palette and styles");
    }
    if (lower.includes("layout") || lower.includes("arrange")) {
      explorationQueries.push("Map current element positions and spacing");
    }
  }

  // Estimate operations
  const estimatedOperations = estimateOperationCount(task);

  // Decision
  const isComplex = positiveSignals >= 2 || estimatedOperations > 5;

  return {
    isComplex,
    reason: isComplex
      ? `Detected ${positiveSignals} complexity signals, ~${estimatedOperations} operations`
      : `Simple task with ${positiveSignals} signals, ~${estimatedOperations} operations`,
    estimatedOperations,
    needsExploration,
    explorationQueries: explorationQueries.length > 0 ? explorationQueries : undefined,
    confidence: positiveSignals >= 3 ? 0.9 : positiveSignals >= 1 ? 0.7 : 0.5,
  };
}

/**
 * Estimate number of operations needed
 */
export function estimateOperationCount(task: string): number {
  const lower = task.toLowerCase();
  let count = 1;

  // Count explicit numbers
  const numbers = task.match(/\d+\s*(element|item|node|shape|section)/g) || [];
  for (const match of numbers) {
    const num = parseInt(match);
    if (!isNaN(num)) count += num;
  }

  // Count listed items
  const commas = (task.match(/,/g) || []).length;
  count += Math.min(commas, 10);

  // Complex content types add operations
  if (/timeline/.test(lower)) count += 5;
  if (/diagram|flowchart/.test(lower)) count += 5;
  if (/infographic/.test(lower)) count += 8;
  if (/dashboard/.test(lower)) count += 10;

  return Math.min(count, 50);
}
