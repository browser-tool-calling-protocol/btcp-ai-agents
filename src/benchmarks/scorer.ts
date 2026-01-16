/**
 * Benchmark Scorer
 *
 * Evaluates agent performance against expected behavior and produces
 * detailed scores and feedback.
 */

import type {
  BenchmarkScenario,
  ScenarioResult,
  ReasoningStepScore,
  ToolUsageScore,
  OutputScore,
  EfficiencyScore,
  Issue,
  AgentEventRecord,
  ToolCallRecord,
  ReasoningStepType,
} from "./types.js";

import {
  scoreReasoningStep,
  scoreToolUsage,
  scoreOutput,
  scoreEfficiency,
  detectIssues,
  calculateOverallScore,
  generateRecommendations,
} from "./metrics.js";

import { extractReasoning, extractUserResponse } from "../agent-sdk/core/response-extractor.js";

// ============================================================================
// SCORER CLASS
// ============================================================================

/**
 * Evaluates a scenario run and produces detailed scoring
 */
export class BenchmarkScorer {
  /**
   * Score a completed scenario run
   */
  score(
    scenario: BenchmarkScenario,
    events: AgentEventRecord[],
    toolCalls: ToolCallRecord[],
    finalOutput: string | undefined,
    model: string,
    provider: string,
    duration: number,
    tokenCount: number = 0,
    promptVersion?: string
  ): ScenarioResult {
    const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const timestamp = Date.now();

    // Extract reasoning from events
    const reasoning = this.extractReasoningFromEvents(events, finalOutput);

    // Score reasoning steps
    const reasoningScores = this.scoreReasoning(reasoning, scenario);

    // Score tool usage
    const toolUsageScore = scoreToolUsage(toolCalls, scenario.expected);

    // Score output
    const userResponse = finalOutput ? extractUserResponse(finalOutput) : undefined;
    const outputScore = scoreOutput(userResponse, scenario.expected);

    // Score efficiency (with enhanced metrics)
    const iterationCount = events.filter(
      (e) => e.type === "acting" || e.type === "tool_call"
    ).length;
    const efficiencyScore = scoreEfficiency(
      tokenCount,
      toolCalls.length,
      iterationCount,
      duration,
      scenario.complexity,
      toolCalls,
      scenario.expected.expectedEfficiency
    );

    // Detect issues
    const issues = detectIssues(reasoning, toolCalls, userResponse, scenario.expected);

    // Calculate overall score
    const overallScore = calculateOverallScore(
      reasoningScores,
      toolUsageScore,
      outputScore,
      efficiencyScore,
      issues
    );

    // Determine pass/fail
    const passed = this.determinePassFail(
      overallScore,
      issues,
      scenario.expected,
      toolUsageScore,
      outputScore
    );

    // Generate recommendations
    const recommendations = generateRecommendations(
      reasoningScores,
      toolUsageScore,
      outputScore,
      issues
    );

    return {
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      runId,
      timestamp,
      duration,
      model,
      provider,
      promptVersion,
      passed,
      overallScore,
      scores: {
        reasoning: reasoningScores,
        toolUsage: toolUsageScore,
        output: outputScore,
        efficiency: efficiencyScore,
      },
      issues,
      recommendations,
      rawData: {
        events,
        finalOutput,
        toolCalls,
        reasoning,
        canvasState: undefined, // Could be populated by runner
      },
    };
  }

  /**
   * Extract reasoning tags from agent events and output
   */
  private extractReasoningFromEvents(
    events: AgentEventRecord[],
    finalOutput?: string
  ): Record<string, string | null> {
    let combinedText = "";

    // Collect reasoning from events
    for (const event of events) {
      if (event.type === "thinking" || event.type === "reasoning") {
        if (event.content) {
          combinedText += "\n" + event.content;
        }
      }
    }

    // Also check final output for reasoning tags
    if (finalOutput) {
      combinedText += "\n" + finalOutput;
    }

    return extractReasoning(combinedText);
  }

  /**
   * Score all reasoning steps
   */
  private scoreReasoning(
    reasoning: Record<string, string | null>,
    scenario: BenchmarkScenario
  ): ReasoningStepScore[] {
    const scores: ReasoningStepScore[] = [];
    const allSteps: ReasoningStepType[] = [
      "analyze",
      "assess_clarity",
      "plan",
      "observe",
      "summarize",
      "decide",
    ];

    // Score required tags first
    const requiredTags = scenario.expected.expectedReasoning?.requiredTags || [];
    const optionalTags = scenario.expected.expectedReasoning?.optionalTags || [];

    for (const step of allSteps) {
      const content = reasoning[step] || null;
      const isRequired = requiredTags.includes(step);
      const isOptional = optionalTags.includes(step);

      // Skip steps that aren't expected for this scenario
      if (!isRequired && !isOptional && !content) {
        continue;
      }

      const score = scoreReasoningStep(step, content, scenario.expected);

      // Penalize missing required steps
      if (isRequired && !score.present) {
        score.overallScore = 0;
        score.feedback = `REQUIRED: ${step} reasoning is required for this scenario`;
      }

      scores.push(score);
    }

    return scores;
  }

  /**
   * Determine if scenario passes based on scores and criteria
   */
  private determinePassFail(
    overallScore: number,
    issues: Issue[],
    expected: BenchmarkScenario["expected"],
    toolUsage: ToolUsageScore,
    output: OutputScore
  ): boolean {
    // Critical issues = automatic fail
    if (issues.some((i) => i.severity === "critical")) {
      return false;
    }

    // Too many major issues = fail
    if (issues.filter((i) => i.severity === "major").length >= 3) {
      return false;
    }

    // Wrong tool usage pattern = fail
    if (expected.shouldUseTool && !toolUsage.correctTools) {
      return false;
    }
    if (!expected.shouldUseTool && toolUsage.callCount > 0) {
      return false;
    }

    // Missing user content when expected = fail
    if (expected.expectedOutput?.shouldHaveUserContent && !output.hasUserContent) {
      return false;
    }

    // Score threshold
    return overallScore >= 60;
  }
}

// ============================================================================
// QUICK SCORING FUNCTIONS
// ============================================================================

/**
 * Quick score for a single aspect
 */
export function quickScoreToolUsage(
  toolCalls: { tool: string; args?: unknown }[],
  expectedTools: string[],
  maxCalls?: number
): { score: number; passed: boolean; details: string } {
  const used = toolCalls.map((t) => t.tool);
  const uniqueUsed = [...new Set(used)];

  let score = 100;
  const missing = expectedTools.filter((t) => !used.includes(t));
  const unexpected = uniqueUsed.filter((t) => !expectedTools.includes(t));

  score -= missing.length * 20;
  score -= unexpected.length * 10;

  if (maxCalls && toolCalls.length > maxCalls) {
    score -= 15;
  }

  const details = [
    missing.length ? `Missing: ${missing.join(", ")}` : null,
    unexpected.length ? `Unexpected: ${unexpected.join(", ")}` : null,
    maxCalls && toolCalls.length > maxCalls
      ? `Exceeded max calls: ${toolCalls.length}/${maxCalls}`
      : null,
  ]
    .filter(Boolean)
    .join("; ");

  return {
    score: Math.max(0, score),
    passed: score >= 70,
    details: details || "Tool usage is correct",
  };
}

/**
 * Quick score for reasoning presence
 */
export function quickScoreReasoning(
  reasoning: Record<string, string | null>,
  requiredTags: string[]
): { score: number; passed: boolean; missing: string[] } {
  const missing = requiredTags.filter((tag) => !reasoning[tag]);
  const presentRequired = requiredTags.length - missing.length;

  const score = requiredTags.length > 0
    ? Math.round((presentRequired / requiredTags.length) * 100)
    : 100;

  return {
    score,
    passed: missing.length === 0,
    missing,
  };
}

/**
 * Quick score for output patterns
 */
export function quickScoreOutput(
  output: string | undefined,
  patterns: { contains?: string[]; notContains?: string[] }
): { score: number; passed: boolean; matched: string[]; forbidden: string[] } {
  if (!output) {
    return {
      score: 0,
      passed: false,
      matched: [],
      forbidden: [],
    };
  }

  let score = 100;
  const matched: string[] = [];
  const forbidden: string[] = [];

  if (patterns.contains) {
    for (const pattern of patterns.contains) {
      if (new RegExp(pattern, "i").test(output)) {
        matched.push(pattern);
      } else {
        score -= 20;
      }
    }
  }

  if (patterns.notContains) {
    for (const pattern of patterns.notContains) {
      if (new RegExp(pattern, "i").test(output)) {
        forbidden.push(pattern);
        score -= 25;
      }
    }
  }

  return {
    score: Math.max(0, score),
    passed: score >= 70,
    matched,
    forbidden,
  };
}

// ============================================================================
// COMPARISON UTILITIES
// ============================================================================

/**
 * Compare two scenario results
 */
export function compareResults(
  baseline: ScenarioResult,
  current: ScenarioResult
): {
  improved: boolean;
  regressed: boolean;
  scoreDelta: number;
  changes: string[];
} {
  const scoreDelta = current.overallScore - baseline.overallScore;
  const changes: string[] = [];

  // Overall change
  if (scoreDelta > 5) {
    changes.push(`Overall score improved: ${baseline.overallScore} → ${current.overallScore}`);
  } else if (scoreDelta < -5) {
    changes.push(`Overall score regressed: ${baseline.overallScore} → ${current.overallScore}`);
  }

  // Tool usage changes
  if (current.scores.toolUsage.score !== baseline.scores.toolUsage.score) {
    changes.push(
      `Tool usage: ${baseline.scores.toolUsage.score} → ${current.scores.toolUsage.score}`
    );
  }

  // Output changes
  if (current.scores.output.score !== baseline.scores.output.score) {
    changes.push(
      `Output quality: ${baseline.scores.output.score} → ${current.scores.output.score}`
    );
  }

  // Efficiency changes
  if (current.scores.efficiency.score !== baseline.scores.efficiency.score) {
    changes.push(
      `Efficiency: ${baseline.scores.efficiency.score} → ${current.scores.efficiency.score}`
    );
  }

  // Pass/fail change
  if (current.passed !== baseline.passed) {
    changes.push(
      current.passed ? "Now passing (was failing)" : "Now failing (was passing)"
    );
  }

  return {
    improved: scoreDelta > 5 || (!baseline.passed && current.passed),
    regressed: scoreDelta < -5 || (baseline.passed && !current.passed),
    scoreDelta,
    changes,
  };
}

// ============================================================================
// EXPORT SINGLETON
// ============================================================================

export const scorer = new BenchmarkScorer();
