/**
 * Reasoning Quality Metrics
 *
 * Implements scoring functions for evaluating AI agent reasoning quality.
 * Each metric measures a specific aspect of reasoning performance.
 */

import type {
  ReasoningStepType,
  DimensionScore,
  ReasoningStepScore,
  ToolUsageScore,
  OutputScore,
  EfficiencyScore,
  ExpectedBehavior,
  Issue,
  ToolCallRecord,
  RedundantToolCall,
} from "./types.js";

// ============================================================================
// REASONING STEP METRICS
// ============================================================================

/**
 * Evaluate the quality of an <analyze> reasoning step
 */
export function scoreAnalyzeStep(content: string | null): ReasoningStepScore {
  if (!content) {
    return {
      stepType: "analyze",
      present: false,
      scores: [],
      overallScore: 0,
      feedback: "Missing analysis - should include task understanding",
    };
  }

  const scores: DimensionScore[] = [];

  // Completeness: Does it cover key aspects?
  const completenessPatterns = [
    /what|asking|request|want/i, // Understanding what user wants
    /element|canvas|exist|current/i, // Awareness of current state
    /constraint|limit|consider/i, // Constraint awareness
  ];
  const completenessHits = completenessPatterns.filter((p) =>
    p.test(content)
  ).length;
  scores.push({
    dimension: "completeness",
    score: Math.round((completenessHits / completenessPatterns.length) * 100),
    maxScore: 100,
    details: `Covered ${completenessHits}/${completenessPatterns.length} key aspects`,
  });

  // Clarity: Is the analysis clear and structured?
  const claritySigns = [
    content.includes("-") || content.includes("•"), // Uses lists
    content.split("\n").length > 1, // Multi-line
    content.length > 50, // Sufficient detail
    !/\?\?\?|unclear|don't know/i.test(content), // Not confused
  ];
  const clarityScore = claritySigns.filter(Boolean).length * 25;
  scores.push({
    dimension: "clarity",
    score: clarityScore,
    maxScore: 100,
    details: claritySigns.filter(Boolean).length + "/4 clarity indicators",
  });

  // Relevance: Is it focused on the task?
  const irrelevantPatterns = [
    /weather|joke|off-topic/i,
    /actually|well|um|hmm/i, // Filler words
  ];
  const hasIrrelevant = irrelevantPatterns.some((p) => p.test(content));
  scores.push({
    dimension: "relevance",
    score: hasIrrelevant ? 50 : 100,
    maxScore: 100,
    details: hasIrrelevant ? "Contains potentially irrelevant content" : "Focused on task",
  });

  const overallScore = Math.round(
    scores.reduce((sum, s) => sum + s.score, 0) / scores.length
  );

  return {
    stepType: "analyze",
    present: true,
    content,
    scores,
    overallScore,
    feedback:
      overallScore >= 80
        ? "Strong analysis"
        : overallScore >= 60
          ? "Adequate analysis, could be more thorough"
          : "Analysis needs improvement",
  };
}

/**
 * Evaluate the quality of an <assess_clarity> reasoning step
 */
export function scoreAssessClarityStep(
  content: string | null,
  expected?: ExpectedBehavior["expectedClarity"]
): ReasoningStepScore {
  if (!content) {
    return {
      stepType: "assess_clarity",
      present: false,
      scores: [],
      overallScore: 0,
      feedback: "Missing clarity assessment - critical for semantic routing",
    };
  }

  const scores: DimensionScore[] = [];
  const issues: string[] = [];

  // Structure: Does it follow the expected format?
  const hasOutputType = /output\s*type\s*[:\-=]/i.test(content);
  const hasTopicClarity = /topic\s*(clarity)?[:\-=]/i.test(content);
  const hasComplexity = /complexity[:\-=]/i.test(content);
  const structureScore = [hasOutputType, hasTopicClarity, hasComplexity].filter(
    Boolean
  ).length;

  scores.push({
    dimension: "completeness",
    score: Math.round((structureScore / 3) * 100),
    maxScore: 100,
    details: `Has ${structureScore}/3 required components`,
    issues: structureScore < 3 ? ["Missing clarity assessment components"] : undefined,
  });

  // Accuracy: Does it correctly assess the clarity?
  if (expected) {
    let accuracyScore = 100;

    if (expected.outputType) {
      const mentionsType = content.toLowerCase().includes(expected.outputType.toLowerCase());
      if (!mentionsType) {
        accuracyScore -= 25;
        issues.push(`Did not identify output type: ${expected.outputType}`);
      }
    }

    if (expected.decision) {
      const decisionPatterns: Record<string, RegExp> = {
        clarify: /clarify|ask|question/i,
        delegate: /delegate|sub-?agent/i,
        execute: /execute|proceed|directly/i,
      };
      const correctDecision = decisionPatterns[expected.decision]?.test(content);
      if (!correctDecision) {
        accuracyScore -= 35;
        issues.push(`Wrong routing decision. Expected: ${expected.decision}`);
      }
    }

    scores.push({
      dimension: "accuracy",
      score: Math.max(0, accuracyScore),
      maxScore: 100,
      details: issues.length ? issues.join("; ") : "Correct assessment",
      issues: issues.length ? issues : undefined,
    });
  }

  // Actionability: Does it lead to a clear decision?
  const hasDecision = /decision|proceed|therefore|→|will|should/i.test(content);
  scores.push({
    dimension: "actionability",
    score: hasDecision ? 100 : 40,
    maxScore: 100,
    details: hasDecision ? "Clear decision stated" : "No clear decision",
  });

  const overallScore = Math.round(
    scores.reduce((sum, s) => sum + s.score, 0) / scores.length
  );

  return {
    stepType: "assess_clarity",
    present: true,
    content,
    scores,
    overallScore,
    feedback:
      overallScore >= 80
        ? "Strong clarity assessment with correct routing"
        : overallScore >= 60
          ? "Clarity assessment present but incomplete"
          : "Clarity assessment needs significant improvement",
  };
}

/**
 * Evaluate the quality of a <plan> reasoning step
 */
export function scorePlanStep(
  content: string | null,
  expectedToolCount?: { min?: number; max?: number }
): ReasoningStepScore {
  if (!content) {
    return {
      stepType: "plan",
      present: false,
      scores: [],
      overallScore: 0,
      feedback: "Missing plan - should outline execution steps",
    };
  }

  const scores: DimensionScore[] = [];

  // Structure: Is it well-organized?
  const hasNumberedSteps =
    /\d\.\s|step\s*\d|first|second|third/i.test(content);
  const hasBullets = /[-•]\s/.test(content);
  const isStructured = hasNumberedSteps || hasBullets;

  scores.push({
    dimension: "clarity",
    score: isStructured ? 100 : 50,
    maxScore: 100,
    details: isStructured ? "Well-structured plan" : "Unstructured plan",
  });

  // Completeness: Does it cover the work?
  const stepCount = (content.match(/\d\.|[-•]\s|^[A-Z]/gm) || []).length;
  let completenessScore = 100;

  if (expectedToolCount) {
    if (expectedToolCount.min && stepCount < expectedToolCount.min) {
      completenessScore -= 30;
    }
    if (expectedToolCount.max && stepCount > expectedToolCount.max) {
      completenessScore -= 20;
    }
  }

  scores.push({
    dimension: "completeness",
    score: Math.max(0, completenessScore),
    maxScore: 100,
    details: `Plan has ~${stepCount} steps`,
  });

  // Actionability: Are the steps concrete?
  const actionVerbs = content.match(
    /\b(create|add|write|read|find|edit|delete|move|style|delegate)\b/gi
  );
  const actionScore = actionVerbs
    ? Math.min(100, actionVerbs.length * 20)
    : 30;

  scores.push({
    dimension: "actionability",
    score: actionScore,
    maxScore: 100,
    details: `${actionVerbs?.length || 0} action verbs found`,
  });

  const overallScore = Math.round(
    scores.reduce((sum, s) => sum + s.score, 0) / scores.length
  );

  return {
    stepType: "plan",
    present: true,
    content,
    scores,
    overallScore,
    feedback:
      overallScore >= 80
        ? "Strong, actionable plan"
        : overallScore >= 60
          ? "Plan is adequate but could be more detailed"
          : "Plan needs more structure and specificity",
  };
}

/**
 * Evaluate the quality of an <observe> reasoning step
 */
export function scoreObserveStep(content: string | null): ReasoningStepScore {
  if (!content) {
    return {
      stepType: "observe",
      present: false,
      scores: [],
      overallScore: 0,
      feedback: "Missing observation of tool results",
    };
  }

  const scores: DimensionScore[] = [];

  // Accuracy: Does it correctly interpret results?
  const hasResults = /result|returned|found|created|success|error|fail/i.test(
    content
  );
  const hasIds = /id|elem_|frame_/i.test(content);
  const hasNumbers = /\d+/.test(content);

  const accuracyScore = [hasResults, hasIds, hasNumbers].filter(Boolean).length;
  scores.push({
    dimension: "accuracy",
    score: Math.round((accuracyScore / 3) * 100),
    maxScore: 100,
    details: `${accuracyScore}/3 result indicators`,
  });

  // Relevance: Is it focused on what matters?
  scores.push({
    dimension: "relevance",
    score: content.length > 20 && content.length < 500 ? 100 : 70,
    maxScore: 100,
    details:
      content.length > 500
        ? "Observation is verbose"
        : content.length < 20
          ? "Observation is too brief"
          : "Appropriate length",
  });

  const overallScore = Math.round(
    scores.reduce((sum, s) => sum + s.score, 0) / scores.length
  );

  return {
    stepType: "observe",
    present: true,
    content,
    scores,
    overallScore,
    feedback:
      overallScore >= 80
        ? "Good observation of tool results"
        : "Observation could be more thorough",
  };
}

/**
 * Evaluate the quality of a <summarize> reasoning step
 */
export function scoreSummarizeStep(content: string | null): ReasoningStepScore {
  if (!content) {
    return {
      stepType: "summarize",
      present: false,
      scores: [],
      overallScore: 0,
      feedback: "Missing summary - should capture what was accomplished",
    };
  }

  const scores: DimensionScore[] = [];

  // Completeness: Does it cover what was done?
  const completenessIndicators = [
    /created|made|added|built/i.test(content), // Creation
    /id|elem_|frame_/i.test(content), // Element references
    /complete|done|finish/i.test(content), // Completion status
  ];
  const completenessScore = completenessIndicators.filter(Boolean).length;

  scores.push({
    dimension: "completeness",
    score: Math.round((completenessScore / 3) * 100),
    maxScore: 100,
    details: `${completenessScore}/3 summary components`,
  });

  // Clarity: Is it easy to understand?
  scores.push({
    dimension: "clarity",
    score: content.length > 10 && content.length < 300 ? 100 : 70,
    maxScore: 100,
    details: "Summary clarity assessment",
  });

  const overallScore = Math.round(
    scores.reduce((sum, s) => sum + s.score, 0) / scores.length
  );

  return {
    stepType: "summarize",
    present: true,
    content,
    scores,
    overallScore,
    feedback:
      overallScore >= 80
        ? "Good summary"
        : "Summary could be more comprehensive",
  };
}

/**
 * Score a reasoning step by type
 */
export function scoreReasoningStep(
  stepType: ReasoningStepType,
  content: string | null,
  expected?: ExpectedBehavior
): ReasoningStepScore {
  switch (stepType) {
    case "analyze":
      return scoreAnalyzeStep(content);
    case "assess_clarity":
      return scoreAssessClarityStep(content, expected?.expectedClarity);
    case "plan": {
      // Convert expectedTools to the expected format for scorePlanStep
      const toolCount = expected?.expectedTools
        ? { min: expected.expectedTools.minCalls, max: expected.expectedTools.maxCalls }
        : undefined;
      return scorePlanStep(content, toolCount);
    }
    case "observe":
      return scoreObserveStep(content);
    case "summarize":
      return scoreSummarizeStep(content);
    case "decide":
    case "execute":
      // Generic scoring for other types
      return scoreGenericStep(stepType, content);
    default:
      return scoreGenericStep(stepType, content);
  }
}

function scoreGenericStep(
  stepType: ReasoningStepType,
  content: string | null
): ReasoningStepScore {
  if (!content) {
    return {
      stepType,
      present: false,
      scores: [],
      overallScore: 0,
      feedback: `Missing ${stepType} step`,
    };
  }

  return {
    stepType,
    present: true,
    content,
    scores: [
      {
        dimension: "completeness",
        score: content.length > 20 ? 80 : 50,
        maxScore: 100,
      },
    ],
    overallScore: content.length > 20 ? 80 : 50,
    feedback: "Step present",
  };
}

// ============================================================================
// TOOL USAGE METRICS
// ============================================================================

/**
 * Score tool usage against expected behavior
 */
export function scoreToolUsage(
  toolCalls: ToolCallRecord[],
  expected: ExpectedBehavior
): ToolUsageScore {
  const toolsUsed = toolCalls.map((t) => t.tool);
  const uniqueTools = [...new Set(toolsUsed)];

  // Check if tools should be used at all
  if (!expected.shouldUseTool) {
    if (toolCalls.length === 0) {
      return {
        score: 100,
        correctTools: true,
        correctOrder: true,
        callCount: 0,
        toolsUsed: [],
        unexpectedTools: [],
        missingTools: [],
      };
    }
    return {
      score: 0,
      correctTools: false,
      correctOrder: false,
      callCount: toolCalls.length,
      toolsUsed: uniqueTools,
      unexpectedTools: uniqueTools,
      missingTools: [],
    };
  }

  let score = 100;
  const unexpectedTools: string[] = [];
  const missingTools: string[] = [];

  if (expected.expectedTools) {
    const { tools, ordered, minCalls, maxCalls } = expected.expectedTools;

    // Check for expected tools
    for (const expectedTool of tools) {
      if (!toolsUsed.includes(expectedTool)) {
        missingTools.push(expectedTool);
        score -= 20;
      }
    }

    // Check for unexpected tools
    for (const used of uniqueTools) {
      if (!tools.includes(used)) {
        unexpectedTools.push(used);
        score -= 10;
      }
    }

    // Check order if required
    let correctOrder = true;
    if (ordered) {
      const orderedTools = toolsUsed.filter((t) => tools.includes(t));
      for (let i = 0; i < tools.length; i++) {
        if (orderedTools[i] !== tools[i]) {
          correctOrder = false;
          break;
        }
      }
      if (!correctOrder) {
        score -= 15;
      }
    }

    // Check call count
    if (minCalls !== undefined && toolCalls.length < minCalls) {
      score -= 15;
    }
    if (maxCalls !== undefined && toolCalls.length > maxCalls) {
      score -= 10;
    }

    return {
      score: Math.max(0, score),
      correctTools: missingTools.length === 0,
      correctOrder: ordered ? correctOrder : true,
      callCount: toolCalls.length,
      expectedMinCalls: minCalls,
      expectedMaxCalls: maxCalls,
      toolsUsed: uniqueTools,
      unexpectedTools,
      missingTools,
    };
  }

  // No specific expectations, just return basic info
  return {
    score: toolCalls.length > 0 ? 80 : 60,
    correctTools: true,
    correctOrder: true,
    callCount: toolCalls.length,
    toolsUsed: uniqueTools,
    unexpectedTools: [],
    missingTools: [],
  };
}

// ============================================================================
// OUTPUT METRICS
// ============================================================================

/**
 * Score the output quality
 */
export function scoreOutput(
  output: string | undefined,
  expected: ExpectedBehavior
): OutputScore {
  const hasUserContent = !!output && output.trim().length > 0;

  if (!expected.expectedOutput) {
    return {
      score: hasUserContent ? 80 : 60,
      hasUserContent,
      patternsMatched: [],
      patternsMissed: [],
      forbiddenPatterns: [],
    };
  }

  let score = 100;
  const patternsMatched: string[] = [];
  const patternsMissed: string[] = [];
  const forbiddenPatterns: string[] = [];

  // Check user content expectation
  if (expected.expectedOutput.shouldHaveUserContent !== hasUserContent) {
    score -= 30;
  }

  // Check required patterns
  if (expected.expectedOutput.containsPatterns) {
    for (const pattern of expected.expectedOutput.containsPatterns) {
      const regex = new RegExp(pattern, "i");
      if (output && regex.test(output)) {
        patternsMatched.push(pattern);
      } else {
        patternsMissed.push(pattern);
        score -= 15;
      }
    }
  }

  // Check forbidden patterns
  if (expected.expectedOutput.notContainsPatterns) {
    for (const pattern of expected.expectedOutput.notContainsPatterns) {
      const regex = new RegExp(pattern, "i");
      if (output && regex.test(output)) {
        forbiddenPatterns.push(pattern);
        score -= 20;
      }
    }
  }

  return {
    score: Math.max(0, score),
    hasUserContent,
    patternsMatched,
    patternsMissed,
    forbiddenPatterns,
  };
}

// ============================================================================
// EFFICIENCY METRICS
// ============================================================================

/**
 * Default expected ranges based on complexity level
 */
const COMPLEXITY_EXPECTATIONS: Record<
  string,
  { tokens: number; tools: number; duration: number }
> = {
  trivial: { tokens: 500, tools: 0, duration: 2000 },
  simple: { tokens: 1500, tools: 3, duration: 10000 },
  moderate: { tokens: 3000, tools: 6, duration: 30000 },
  complex: { tokens: 6000, tools: 12, duration: 60000 },
  expert: { tokens: 10000, tools: 20, duration: 120000 },
};

/**
 * Score step efficiency - how close to optimal number of steps
 *
 * @param actualSteps - Number of steps actually taken
 * @param optimalSteps - Minimum steps needed for optimal solution
 * @param allowedOverhead - Multiplier for acceptable overhead (default 1.5 = 50% more allowed)
 */
export function scoreStepEfficiency(
  actualSteps: number,
  optimalSteps: number,
  allowedOverhead = 1.5
): { ratio: number; score: number; feedback: string } {
  // Handle edge cases
  if (optimalSteps <= 0) {
    return {
      ratio: actualSteps > 0 ? Infinity : 1,
      score: actualSteps === 0 ? 100 : 50,
      feedback: actualSteps === 0 ? "No steps needed, none taken" : "Steps taken when none expected",
    };
  }

  const ratio = actualSteps / optimalSteps;

  // Perfect or better than optimal
  if (ratio <= 1.0) {
    return {
      ratio,
      score: 100,
      feedback: `Optimal path: ${actualSteps}/${optimalSteps} steps`,
    };
  }

  // Within acceptable overhead
  if (ratio <= allowedOverhead) {
    const score = Math.round(100 - ((ratio - 1) / (allowedOverhead - 1)) * 15);
    return {
      ratio,
      score,
      feedback: `Acceptable overhead: ${actualSteps}/${optimalSteps} steps (${Math.round((ratio - 1) * 100)}% over)`,
    };
  }

  // Moderately inefficient (up to 2x optimal)
  if (ratio <= 2.0) {
    const score = Math.round(85 - ((ratio - allowedOverhead) / (2 - allowedOverhead)) * 25);
    return {
      ratio,
      score,
      feedback: `Inefficient path: ${actualSteps}/${optimalSteps} steps (${Math.round((ratio - 1) * 100)}% over optimal)`,
    };
  }

  // Very inefficient (more than 2x optimal)
  const score = Math.max(0, Math.round(60 - (ratio - 2) * 20));
  return {
    ratio,
    score,
    feedback: `Very inefficient: ${actualSteps}/${optimalSteps} steps (${Math.round((ratio - 1) * 100)}% over optimal)`,
  };
}

/**
 * Score token efficiency - how close to expected token budget
 *
 * @param actualTokens - Tokens actually consumed
 * @param expectedTokens - Expected token budget for this task
 * @param allowedOverhead - Multiplier for acceptable overhead (default 1.5)
 */
export function scoreTokenEfficiency(
  actualTokens: number,
  expectedTokens: number,
  allowedOverhead = 1.5
): { ratio: number; score: number; feedback: string } {
  // Handle edge cases
  if (expectedTokens <= 0) {
    return {
      ratio: actualTokens > 0 ? Infinity : 1,
      score: actualTokens <= 100 ? 100 : 70,
      feedback: "No token budget specified",
    };
  }

  const ratio = actualTokens / expectedTokens;

  // Under budget
  if (ratio <= 1.0) {
    return {
      ratio,
      score: 100,
      feedback: `Under budget: ${actualTokens}/${expectedTokens} tokens (${Math.round(ratio * 100)}%)`,
    };
  }

  // Within acceptable overhead
  if (ratio <= allowedOverhead) {
    const score = Math.round(100 - ((ratio - 1) / (allowedOverhead - 1)) * 15);
    return {
      ratio,
      score,
      feedback: `Acceptable: ${actualTokens}/${expectedTokens} tokens (${Math.round((ratio - 1) * 100)}% over)`,
    };
  }

  // Over budget but not extreme (up to 2x)
  if (ratio <= 2.0) {
    const score = Math.round(85 - ((ratio - allowedOverhead) / (2 - allowedOverhead)) * 30);
    return {
      ratio,
      score,
      feedback: `Over budget: ${actualTokens}/${expectedTokens} tokens (${Math.round((ratio - 1) * 100)}% over)`,
    };
  }

  // Significantly over budget
  const score = Math.max(0, Math.round(55 - (ratio - 2) * 15));
  return {
    ratio,
    score,
    feedback: `Significantly over budget: ${actualTokens}/${expectedTokens} tokens (${Math.round((ratio - 1) * 100)}% over)`,
  };
}

/**
 * Detect redundant tool calls - same tool called with similar arguments
 *
 * @param toolCalls - Array of tool call records
 * @returns Array of detected redundant calls
 */
export function detectRedundantCalls(toolCalls: ToolCallRecord[]): RedundantToolCall[] {
  const redundantCalls: RedundantToolCall[] = [];

  // Group calls by tool
  const callsByTool = new Map<string, Array<{ index: number; call: ToolCallRecord }>>();
  toolCalls.forEach((call, index) => {
    const existing = callsByTool.get(call.tool) || [];
    existing.push({ index, call });
    callsByTool.set(call.tool, existing);
  });

  // Check each tool's calls for redundancy
  for (const [tool, calls] of callsByTool) {
    if (calls.length < 2) continue;

    for (let i = 0; i < calls.length; i++) {
      for (let j = i + 1; j < calls.length; j++) {
        const first = calls[i];
        const second = calls[j];

        const similarity = calculateArgsSimilarity(first.call.args, second.call.args);

        // High similarity indicates potential redundancy
        if (similarity >= 0.8) {
          const reason = getRedundancyReason(tool, first.call, second.call, similarity);
          if (reason) {
            redundantCalls.push({
              tool,
              firstCallIndex: first.index,
              redundantCallIndex: second.index,
              argsSimilarity: similarity,
              reason,
            });
          }
        }
      }
    }
  }

  return redundantCalls;
}

/**
 * Calculate similarity between two argument objects (0-1)
 */
function calculateArgsSimilarity(
  args1: Record<string, unknown>,
  args2: Record<string, unknown>
): number {
  const keys1 = Object.keys(args1);
  const keys2 = Object.keys(args2);
  const allKeys = new Set([...keys1, ...keys2]);

  if (allKeys.size === 0) return 1.0; // Both empty = identical

  let matchingKeys = 0;
  let matchingValues = 0;

  for (const key of allKeys) {
    if (key in args1 && key in args2) {
      matchingKeys++;
      if (deepEqual(args1[key], args2[key])) {
        matchingValues++;
      }
    }
  }

  // Weight: 40% key overlap, 60% value match
  const keyScore = matchingKeys / allKeys.size;
  const valueScore = matchingKeys > 0 ? matchingValues / matchingKeys : 0;

  return keyScore * 0.4 + valueScore * 0.6;
}

/**
 * Deep equality check for argument values
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;

  if (typeof a === "object" && typeof b === "object") {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const keysA = Object.keys(aObj);
    const keysB = Object.keys(bObj);

    if (keysA.length !== keysB.length) return false;

    return keysA.every((key) => key in bObj && deepEqual(aObj[key], bObj[key]));
  }

  return false;
}

/**
 * Determine the reason for redundancy (or null if not actually redundant)
 */
function getRedundancyReason(
  tool: string,
  first: ToolCallRecord,
  second: ToolCallRecord,
  similarity: number
): string | null {
  // Exact same call
  if (similarity >= 0.99) {
    return `Duplicate call: identical arguments to ${tool}`;
  }

  // Read operations that could be cached
  if (tool === "canvas_read") {
    // If same format and filter, likely redundant
    if (first.args.format === second.args.format) {
      return `Redundant read: same format "${first.args.format}" queried twice`;
    }
  }

  // Find operations with same pattern
  if (tool === "canvas_find") {
    return `Redundant find: similar search pattern executed twice`;
  }

  // Edit operations on same target
  if (tool === "canvas_edit") {
    const firstTarget = JSON.stringify(first.args.target || first.args.operations);
    const secondTarget = JSON.stringify(second.args.target || second.args.operations);
    if (firstTarget === secondTarget) {
      return `Redundant edit: same target edited twice`;
    }
  }

  // High similarity but no specific reason
  if (similarity >= 0.9) {
    return `Similar call: ${Math.round(similarity * 100)}% argument overlap`;
  }

  return null;
}

/**
 * Analyze execution path efficiency
 *
 * @param toolCalls - Array of tool calls made
 * @param expectedTools - Expected tool sequence
 * @returns Path analysis with deviation score
 */
export function analyzeExecutionPath(
  toolCalls: ToolCallRecord[],
  expectedTools?: string[]
): { deviationScore: number; analysis: string } {
  if (!expectedTools || expectedTools.length === 0) {
    return {
      deviationScore: 0,
      analysis: "No expected path defined",
    };
  }

  const actualPath = toolCalls.map((c) => c.tool);

  // Calculate Levenshtein-like distance for tool sequences
  const distance = calculatePathDistance(actualPath, expectedTools);
  const maxLength = Math.max(actualPath.length, expectedTools.length);
  const deviationScore = maxLength > 0 ? distance / maxLength : 0;

  // Generate analysis
  const analyses: string[] = [];

  // Check for missing expected tools
  const missingTools = expectedTools.filter((t) => !actualPath.includes(t));
  if (missingTools.length > 0) {
    analyses.push(`Missing: ${missingTools.join(", ")}`);
  }

  // Check for extra unexpected tools
  const extraTools = actualPath.filter((t) => !expectedTools.includes(t));
  if (extraTools.length > 0) {
    analyses.push(`Extra: ${[...new Set(extraTools)].join(", ")}`);
  }

  // Check for order issues
  if (missingTools.length === 0 && extraTools.length === 0) {
    // All tools present, check order
    let orderCorrect = true;
    let lastIndex = -1;
    for (const expected of expectedTools) {
      const idx = actualPath.indexOf(expected, lastIndex + 1);
      if (idx <= lastIndex) {
        orderCorrect = false;
        break;
      }
      lastIndex = idx;
    }
    if (!orderCorrect) {
      analyses.push("Tools called out of optimal order");
    }
  }

  return {
    deviationScore,
    analysis: analyses.length > 0 ? analyses.join("; ") : "Path matches expected sequence",
  };
}

/**
 * Calculate edit distance between two tool sequences
 */
function calculatePathDistance(actual: string[], expected: string[]): number {
  const m = actual.length;
  const n = expected.length;

  // Create distance matrix
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));

  // Initialize first column and row
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  // Fill the matrix
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (actual[i - 1] === expected[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(
          dp[i - 1][j],     // deletion
          dp[i][j - 1],     // insertion
          dp[i - 1][j - 1]  // substitution
        );
      }
    }
  }

  return dp[m][n];
}

/**
 * Score efficiency based on resource usage (enhanced version)
 *
 * @param tokenCount - Total tokens consumed
 * @param toolCallCount - Number of tool calls
 * @param iterationCount - Number of agent iterations
 * @param durationMs - Total duration in milliseconds
 * @param complexity - Task complexity level
 * @param toolCalls - Full tool call records for redundancy detection
 * @param expectedEfficiency - Optional scenario-specific efficiency expectations
 */
export function scoreEfficiency(
  tokenCount: number,
  toolCallCount: number,
  iterationCount: number,
  durationMs: number,
  complexity: string,
  toolCalls?: ToolCallRecord[],
  expectedEfficiency?: ExpectedBehavior["expectedEfficiency"]
): EfficiencyScore {
  const complexityExpectation = COMPLEXITY_EXPECTATIONS[complexity] || COMPLEXITY_EXPECTATIONS.moderate;

  // Use scenario-specific expectations if provided, otherwise fall back to complexity-based
  const optimalSteps = expectedEfficiency?.optimalSteps ?? complexityExpectation.tools;
  const expectedTokens = expectedEfficiency?.optimalTokens ?? complexityExpectation.tokens;
  const allowedStepOverhead = expectedEfficiency?.allowedStepOverhead ?? 1.5;
  const allowedTokenOverhead = expectedEfficiency?.allowedTokenOverhead ?? 1.5;

  // Calculate step efficiency
  const stepEfficiency = scoreStepEfficiency(toolCallCount, optimalSteps, allowedStepOverhead);

  // Calculate token efficiency
  const tokenEfficiency = scoreTokenEfficiency(tokenCount, expectedTokens, allowedTokenOverhead);

  // Detect redundant calls if tool call records provided
  const redundantCalls = toolCalls ? detectRedundantCalls(toolCalls) : [];
  const redundancyPenalty = Math.min(30, redundantCalls.length * 10);

  // Analyze execution path
  const pathAnalysis = toolCalls
    ? analyzeExecutionPath(toolCalls, expectedEfficiency ? undefined : undefined)
    : { deviationScore: 0, analysis: "No path analysis" };

  // Calculate duration penalty
  let durationPenalty = 0;
  if (durationMs > complexityExpectation.duration * 2) {
    durationPenalty = 15;
  } else if (durationMs > complexityExpectation.duration * 1.5) {
    durationPenalty = 8;
  }

  // Weighted score calculation
  // Step efficiency: 35%, Token efficiency: 35%, Duration: 15%, Redundancy: 15%
  const baseScore =
    stepEfficiency.score * 0.35 +
    tokenEfficiency.score * 0.35 +
    Math.max(0, 100 - durationPenalty) * 0.15 +
    Math.max(0, 100 - redundancyPenalty) * 0.15;

  return {
    score: Math.max(0, Math.round(baseScore)),
    tokenCount,
    toolCallCount,
    iterationCount,
    durationMs,
    tokensPerOperation: toolCallCount > 0 ? Math.round(tokenCount / toolCallCount) : tokenCount,

    // Step efficiency metrics
    stepEfficiencyRatio: stepEfficiency.ratio,
    optimalSteps,
    stepEfficiencyFeedback: stepEfficiency.feedback,

    // Token efficiency metrics
    tokenEfficiencyRatio: tokenEfficiency.ratio,
    expectedTokens,
    tokenEfficiencyFeedback: tokenEfficiency.feedback,

    // Redundancy detection
    redundantCalls: redundantCalls.length > 0 ? redundantCalls : undefined,
    redundantCallCount: redundantCalls.length,

    // Path analysis
    pathDeviationScore: pathAnalysis.deviationScore,
    pathAnalysis: pathAnalysis.analysis,
  };
}

// ============================================================================
// ISSUE DETECTION
// ============================================================================

/**
 * Detect issues in the agent's behavior
 */
export function detectIssues(
  reasoning: Record<string, string | null>,
  toolCalls: ToolCallRecord[],
  output: string | undefined,
  expected: ExpectedBehavior
): Issue[] {
  const issues: Issue[] = [];

  // Missing critical reasoning
  if (expected.expectedReasoning?.requiredTags) {
    for (const tag of expected.expectedReasoning.requiredTags) {
      if (!reasoning[tag]) {
        issues.push({
          severity: "major",
          category: "reasoning",
          message: `Missing required reasoning tag: <${tag}>`,
          details: `The ${tag} step is required for this task type`,
        });
      }
    }
  }

  // Incorrect tool usage
  if (expected.shouldUseTool && toolCalls.length === 0) {
    issues.push({
      severity: "critical",
      category: "tool_usage",
      message: "No tool calls when tools were expected",
      details: "This task requires tool usage but none occurred",
    });
  } else if (!expected.shouldUseTool && toolCalls.length > 0) {
    issues.push({
      severity: "major",
      category: "tool_usage",
      message: "Tool calls when none were expected",
      details: "This is a conversational task that should not use tools",
    });
  }

  // Tool errors
  for (const call of toolCalls) {
    if (call.error) {
      issues.push({
        severity: "major",
        category: "tool_usage",
        message: `Tool ${call.tool} failed: ${call.error}`,
        details: `Arguments: ${JSON.stringify(call.args)}`,
      });
    }
  }

  // Missing user output
  if (expected.expectedOutput?.shouldHaveUserContent && (!output || !output.trim())) {
    issues.push({
      severity: "major",
      category: "output",
      message: "No user-facing output generated",
      details: "The agent should have provided a response to the user",
    });
  }

  // Hallucination indicators
  if (output) {
    const hallucinations = [
      /i cannot|i'm unable|as an ai/i,
      /sorry.*cannot|apologize.*unable/i,
    ];
    for (const pattern of hallucinations) {
      if (pattern.test(output)) {
        issues.push({
          severity: "minor",
          category: "output",
          message: "Possible unnecessary hedging/limitation statement",
          details: "The agent may be adding unnecessary caveats",
        });
        break;
      }
    }
  }

  // Semantic routing issues
  if (
    expected.expectedClarity?.decision === "clarify" &&
    toolCalls.some((c) => c.tool !== "canvas_clarify")
  ) {
    issues.push({
      severity: "major",
      category: "behavior",
      message: "Should have asked for clarification instead of using tools",
      details: "The request was ambiguous and required clarification first",
    });
  }

  return issues;
}

// ============================================================================
// AGGREGATE SCORING
// ============================================================================

/**
 * Calculate overall score from component scores
 */
export function calculateOverallScore(
  reasoningScores: ReasoningStepScore[],
  toolUsage: ToolUsageScore,
  output: OutputScore,
  efficiency: EfficiencyScore,
  issues: Issue[]
): number {
  // Weights for different components
  const weights = {
    reasoning: 0.3,
    toolUsage: 0.3,
    output: 0.25,
    efficiency: 0.15,
  };

  // Average reasoning scores
  const reasoningAvg =
    reasoningScores.length > 0
      ? reasoningScores.reduce((sum, s) => sum + s.overallScore, 0) /
        reasoningScores.length
      : 50;

  // Weighted sum
  let score =
    reasoningAvg * weights.reasoning +
    toolUsage.score * weights.toolUsage +
    output.score * weights.output +
    efficiency.score * weights.efficiency;

  // Penalty for critical issues
  const criticalCount = issues.filter((i) => i.severity === "critical").length;
  const majorCount = issues.filter((i) => i.severity === "major").length;

  score -= criticalCount * 20;
  score -= majorCount * 10;

  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Generate recommendations based on scores
 */
export function generateRecommendations(
  reasoningScores: ReasoningStepScore[],
  toolUsage: ToolUsageScore,
  output: OutputScore,
  issues: Issue[]
): string[] {
  const recommendations: string[] = [];

  // Reasoning improvements
  for (const step of reasoningScores) {
    if (!step.present && step.stepType !== "decide" && step.stepType !== "execute") {
      recommendations.push(`Add <${step.stepType}> reasoning step for better task handling`);
    } else if (step.present && step.overallScore < 60) {
      recommendations.push(`Improve <${step.stepType}> quality: ${step.feedback}`);
    }
  }

  // Tool usage improvements
  if (toolUsage.missingTools.length > 0) {
    recommendations.push(
      `Use missing tools: ${toolUsage.missingTools.join(", ")}`
    );
  }
  if (toolUsage.unexpectedTools.length > 0) {
    recommendations.push(
      `Avoid unnecessary tools: ${toolUsage.unexpectedTools.join(", ")}`
    );
  }

  // Output improvements
  if (output.patternsMissed.length > 0) {
    recommendations.push(
      `Include expected patterns in output: ${output.patternsMissed.join(", ")}`
    );
  }
  if (output.forbiddenPatterns.length > 0) {
    recommendations.push(
      `Remove forbidden patterns from output: ${output.forbiddenPatterns.join(", ")}`
    );
  }

  // Issue-based recommendations
  for (const issue of issues) {
    if (issue.severity === "critical" || issue.severity === "major") {
      recommendations.push(`Fix: ${issue.message}`);
    }
  }

  return recommendations;
}
