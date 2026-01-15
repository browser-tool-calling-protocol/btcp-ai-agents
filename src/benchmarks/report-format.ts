/**
 * Enhanced Benchmark Report Formats
 *
 * Provides multiple output formats for benchmark results:
 * - Console (rich text with colors and visual indicators)
 * - Markdown (for documentation/GitHub)
 * - JSON (for programmatic consumption)
 * - CSV (for spreadsheet analysis)
 */

import type {
  BenchmarkRun,
  BenchmarkSummary,
  ScenarioResult,
  BenchmarkComparison,
  TaskCategory,
  TaskComplexity,
} from "./types.js";

// ============================================================================
// OUTPUT FORMAT TYPES
// ============================================================================

export type OutputFormat = "console" | "markdown" | "json" | "csv" | "html";

export interface ReportOptions {
  /** Output format */
  format: OutputFormat;
  /** Include per-scenario details */
  includeDetails?: boolean;
  /** Include raw data (for debugging) */
  includeRawData?: boolean;
  /** Show efficiency metrics */
  showEfficiency?: boolean;
  /** Show recommendations */
  showRecommendations?: boolean;
  /** Compare against baseline run */
  baselineRun?: BenchmarkRun;
  /** Maximum scenarios to show in detail */
  maxDetailedScenarios?: number;
  /** Group by category or complexity */
  groupBy?: "category" | "complexity" | "none";
}

// ============================================================================
// VISUAL HELPERS
// ============================================================================

/** Create a progress bar visualization */
function progressBar(value: number, max: number, width: number = 20): string {
  const filled = Math.round((value / max) * width);
  const empty = width - filled;
  return `[${"█".repeat(filled)}${"░".repeat(empty)}]`;
}

/** Create a sparkline for score trends */
function sparkline(scores: number[]): string {
  const chars = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
  if (scores.length === 0) return "";

  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const range = max - min || 1;

  return scores
    .map((score) => {
      const normalized = (score - min) / range;
      const index = Math.floor(normalized * (chars.length - 1));
      return chars[index];
    })
    .join("");
}

/** Format duration in human-readable form */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

/** Format token count with thousands separator */
function formatTokens(count: number): string {
  if (count === 0) return "0";
  if (count < 1000) return count.toString();
  return `${(count / 1000).toFixed(1)}k`;
}

/** Get status emoji/symbol */
function statusIcon(passed: boolean, format: OutputFormat): string {
  if (format === "console" || format === "markdown") {
    return passed ? "✓" : "✗";
  }
  return passed ? "PASS" : "FAIL";
}

/** Score color indicator */
function scoreIndicator(score: number): string {
  if (score >= 90) return "🟢";
  if (score >= 70) return "🟡";
  if (score >= 50) return "🟠";
  return "🔴";
}

// ============================================================================
// CONSOLE REPORT (Rich Text)
// ============================================================================

export function generateConsoleReport(
  run: BenchmarkRun,
  options: Partial<ReportOptions> = {}
): string {
  const opts: ReportOptions = {
    format: "console",
    includeDetails: true,
    showEfficiency: true,
    showRecommendations: true,
    maxDetailedScenarios: 10,
    groupBy: "category",
    ...options,
  };

  const lines: string[] = [];
  const width = 80;

  // Header
  lines.push("");
  lines.push("╔" + "═".repeat(width - 2) + "╗");
  lines.push("║" + " REASONING BENCHMARK REPORT ".padStart((width + 26) / 2).padEnd(width - 2) + "║");
  lines.push("╠" + "═".repeat(width - 2) + "╣");

  // Run metadata
  lines.push("║" + ` Run ID: ${run.runId}`.padEnd(width - 2) + "║");
  lines.push("║" + ` Date: ${new Date(run.timestamp).toISOString()}`.padEnd(width - 2) + "║");
  lines.push("║" + ` Model: ${run.config.model} (${run.config.provider})`.padEnd(width - 2) + "║");
  lines.push("║" + ` Prompt: ${run.config.promptVersion || "default"}`.padEnd(width - 2) + "║");
  lines.push("╠" + "═".repeat(width - 2) + "╣");

  // Summary section
  lines.push("║" + " SUMMARY".padEnd(width - 2) + "║");
  lines.push("╟" + "─".repeat(width - 2) + "╢");

  const passRate = run.summary.passRate;
  const avgScore = run.summary.averageScore;

  lines.push(
    "║" +
      `  Scenarios: ${run.summary.totalScenarios} total, ${run.summary.passedScenarios} passed, ${run.summary.failedScenarios} failed`.padEnd(
        width - 2
      ) +
      "║"
  );
  lines.push(
    "║" +
      `  Pass Rate: ${progressBar(passRate, 100, 20)} ${passRate.toFixed(1)}%`.padEnd(width - 2) +
      "║"
  );
  lines.push(
    "║" +
      `  Avg Score: ${progressBar(avgScore, 100, 20)} ${avgScore.toFixed(1)}/100 ${scoreIndicator(avgScore)}`.padEnd(
        width - 2
      ) +
      "║"
  );
  lines.push(
    "║" +
      `  Duration:  ${formatDuration(run.summary.totalDuration)}`.padEnd(width - 2) +
      "║"
  );
  lines.push(
    "║" +
      `  Tokens:    ${formatTokens(run.summary.totalTokens)} (${formatTokens(run.summary.totalTokens / run.summary.totalScenarios)}/scenario avg)`.padEnd(
        width - 2
      ) +
      "║"
  );

  // Category breakdown
  lines.push("╠" + "═".repeat(width - 2) + "╣");
  lines.push("║" + " SCORES BY CATEGORY".padEnd(width - 2) + "║");
  lines.push("╟" + "─".repeat(width - 2) + "╢");

  const categories = Object.entries(run.summary.scoresByCategory)
    .filter(([_, stats]) => stats.count > 0)
    .sort((a, b) => b[1].averageScore - a[1].averageScore);

  for (const [category, stats] of categories) {
    const bar = progressBar(stats.averageScore, 100, 15);
    const line = `  ${category.padEnd(18)} ${stats.passed}/${stats.count} ${bar} ${stats.averageScore.toFixed(0)}`;
    lines.push("║" + line.padEnd(width - 2) + "║");
  }

  // Complexity breakdown
  lines.push("╟" + "─".repeat(width - 2) + "╢");
  lines.push("║" + " SCORES BY COMPLEXITY".padEnd(width - 2) + "║");
  lines.push("╟" + "─".repeat(width - 2) + "╢");

  const complexities = Object.entries(run.summary.scoresByComplexity)
    .filter(([_, stats]) => stats.count > 0)
    .sort((a, b) => {
      const order = ["trivial", "simple", "moderate", "complex", "expert"];
      return order.indexOf(a[0]) - order.indexOf(b[0]);
    });

  for (const [complexity, stats] of complexities) {
    const bar = progressBar(stats.averageScore, 100, 15);
    const line = `  ${complexity.padEnd(18)} ${stats.passed}/${stats.count} ${bar} ${stats.averageScore.toFixed(0)}`;
    lines.push("║" + line.padEnd(width - 2) + "║");
  }

  // Efficiency metrics
  if (opts.showEfficiency) {
    lines.push("╠" + "═".repeat(width - 2) + "╣");
    lines.push("║" + " EFFICIENCY METRICS".padEnd(width - 2) + "║");
    lines.push("╟" + "─".repeat(width - 2) + "╢");

    const avgDuration = run.summary.totalDuration / run.summary.totalScenarios;
    const avgTokens = run.summary.totalTokens / run.summary.totalScenarios;
    const tokensPerSecond =
      run.summary.totalDuration > 0
        ? (run.summary.totalTokens / run.summary.totalDuration) * 1000
        : 0;

    // Calculate efficiency stats from results
    const efficiencyScores = run.results.map((r) => r.scores.efficiency.score);
    const avgEfficiency =
      efficiencyScores.length > 0
        ? efficiencyScores.reduce((a, b) => a + b, 0) / efficiencyScores.length
        : 0;

    const toolCallCounts = run.results.map((r) => r.scores.efficiency.toolCallCount);
    const avgToolCalls =
      toolCallCounts.length > 0
        ? toolCallCounts.reduce((a, b) => a + b, 0) / toolCallCounts.length
        : 0;

    lines.push(
      "║" + `  Avg Duration/Scenario: ${formatDuration(avgDuration)}`.padEnd(width - 2) + "║"
    );
    lines.push(
      "║" + `  Avg Tokens/Scenario:   ${formatTokens(avgTokens)}`.padEnd(width - 2) + "║"
    );
    lines.push(
      "║" + `  Tokens/Second:         ${tokensPerSecond.toFixed(0)}`.padEnd(width - 2) + "║"
    );
    lines.push(
      "║" + `  Avg Tool Calls:        ${avgToolCalls.toFixed(1)}`.padEnd(width - 2) + "║"
    );
    lines.push(
      "║" +
        `  Efficiency Score:      ${progressBar(avgEfficiency, 100, 15)} ${avgEfficiency.toFixed(0)}/100`.padEnd(
          width - 2
        ) +
        "║"
    );
  }

  // Per-scenario details
  if (opts.includeDetails) {
    lines.push("╠" + "═".repeat(width - 2) + "╣");
    lines.push("║" + " SCENARIO DETAILS".padEnd(width - 2) + "║");
    lines.push("╟" + "─".repeat(width - 2) + "╢");

    // Show failed scenarios first
    const failed = run.results.filter((r) => !r.passed);
    const passed = run.results.filter((r) => r.passed);

    if (failed.length > 0) {
      lines.push("║" + "  FAILED:".padEnd(width - 2) + "║");
      for (const result of failed.slice(0, opts.maxDetailedScenarios || 10)) {
        lines.push(
          "║" +
            `   ${statusIcon(false, "console")} ${result.scenarioId.padEnd(25)} ${result.overallScore.toFixed(0).padStart(3)}/100  ${formatDuration(result.duration).padStart(6)}`.padEnd(
              width - 2
            ) +
            "║"
        );
        if (result.issues.length > 0) {
          lines.push(
            "║" + `      └─ ${result.issues[0].message.slice(0, 50)}`.padEnd(width - 2) + "║"
          );
        }
      }
    }

    if (passed.length > 0 && (opts.maxDetailedScenarios || 10) > failed.length) {
      lines.push("║" + "  PASSED:".padEnd(width - 2) + "║");
      const showCount = Math.min(
        passed.length,
        (opts.maxDetailedScenarios || 10) - failed.length
      );
      for (const result of passed.slice(0, showCount)) {
        lines.push(
          "║" +
            `   ${statusIcon(true, "console")} ${result.scenarioId.padEnd(25)} ${result.overallScore.toFixed(0).padStart(3)}/100  ${formatDuration(result.duration).padStart(6)}`.padEnd(
              width - 2
            ) +
            "║"
        );
      }
      if (passed.length > showCount) {
        lines.push(
          "║" + `   ... and ${passed.length - showCount} more passed scenarios`.padEnd(width - 2) + "║"
        );
      }
    }
  }

  // Recommendations
  if (opts.showRecommendations) {
    const allRecs = run.results.flatMap((r) => r.recommendations);
    const uniqueRecs = [...new Set(allRecs)].slice(0, 5);

    if (uniqueRecs.length > 0) {
      lines.push("╠" + "═".repeat(width - 2) + "╣");
      lines.push("║" + " RECOMMENDATIONS".padEnd(width - 2) + "║");
      lines.push("╟" + "─".repeat(width - 2) + "╢");
      for (const rec of uniqueRecs) {
        lines.push("║" + `  • ${rec.slice(0, width - 6)}`.padEnd(width - 2) + "║");
      }
    }
  }

  lines.push("╚" + "═".repeat(width - 2) + "╝");
  lines.push("");

  return lines.join("\n");
}

// ============================================================================
// MARKDOWN REPORT
// ============================================================================

export function generateMarkdownReport(
  run: BenchmarkRun,
  options: Partial<ReportOptions> = {}
): string {
  const opts: ReportOptions = {
    format: "markdown",
    includeDetails: true,
    showEfficiency: true,
    showRecommendations: true,
    ...options,
  };

  const lines: string[] = [];

  // Header
  lines.push("# Reasoning Benchmark Report");
  lines.push("");
  lines.push("## Run Information");
  lines.push("");
  lines.push(`| Property | Value |`);
  lines.push(`|----------|-------|`);
  lines.push(`| Run ID | \`${run.runId}\` |`);
  lines.push(`| Date | ${new Date(run.timestamp).toISOString()} |`);
  lines.push(`| Model | ${run.config.model} |`);
  lines.push(`| Provider | ${run.config.provider} |`);
  lines.push(`| Prompt Version | ${run.config.promptVersion || "default"} |`);
  lines.push("");

  // Summary
  lines.push("## Summary");
  lines.push("");
  lines.push(`- **Total Scenarios**: ${run.summary.totalScenarios}`);
  lines.push(
    `- **Passed**: ${run.summary.passedScenarios} (${run.summary.passRate.toFixed(1)}%)`
  );
  lines.push(`- **Failed**: ${run.summary.failedScenarios}`);
  lines.push(`- **Average Score**: ${run.summary.averageScore.toFixed(1)}/100`);
  lines.push(`- **Duration**: ${formatDuration(run.summary.totalDuration)}`);
  lines.push(`- **Tokens Used**: ${formatTokens(run.summary.totalTokens)}`);
  lines.push("");

  // Category scores
  lines.push("## Scores by Category");
  lines.push("");
  lines.push("| Category | Passed | Avg Score | Avg Duration |");
  lines.push("|----------|--------|-----------|--------------|");

  for (const [category, stats] of Object.entries(run.summary.scoresByCategory)) {
    if (stats.count > 0) {
      lines.push(
        `| ${category} | ${stats.passed}/${stats.count} | ${stats.averageScore.toFixed(1)} | ${formatDuration(stats.averageDuration)} |`
      );
    }
  }
  lines.push("");

  // Complexity scores
  lines.push("## Scores by Complexity");
  lines.push("");
  lines.push("| Complexity | Passed | Avg Score | Avg Duration |");
  lines.push("|------------|--------|-----------|--------------|");

  for (const [complexity, stats] of Object.entries(run.summary.scoresByComplexity)) {
    if (stats.count > 0) {
      lines.push(
        `| ${complexity} | ${stats.passed}/${stats.count} | ${stats.averageScore.toFixed(1)} | ${formatDuration(stats.averageDuration)} |`
      );
    }
  }
  lines.push("");

  // Scenario details
  if (opts.includeDetails) {
    lines.push("## Scenario Results");
    lines.push("");
    lines.push("| Status | Scenario | Score | Duration | Tools |");
    lines.push("|--------|----------|-------|----------|-------|");

    const sortedResults = [...run.results].sort((a, b) => {
      if (a.passed !== b.passed) return a.passed ? 1 : -1;
      return b.overallScore - a.overallScore;
    });

    for (const result of sortedResults) {
      const status = result.passed ? "✅" : "❌";
      const tools = result.scores.toolUsage.toolsUsed.slice(0, 3).join(", ");
      lines.push(
        `| ${status} | ${result.scenarioId} | ${result.overallScore.toFixed(0)}/100 | ${formatDuration(result.duration)} | ${tools} |`
      );
    }
    lines.push("");
  }

  // Failed scenarios detail
  const failed = run.results.filter((r) => !r.passed);
  if (failed.length > 0) {
    lines.push("## Failed Scenarios");
    lines.push("");
    for (const result of failed) {
      lines.push(`### ${result.scenarioId}`);
      lines.push("");
      lines.push(`- **Score**: ${result.overallScore}/100`);
      lines.push(`- **Duration**: ${formatDuration(result.duration)}`);
      if (result.issues.length > 0) {
        lines.push(`- **Issues**:`);
        for (const issue of result.issues) {
          lines.push(`  - [${issue.severity}] ${issue.message}`);
        }
      }
      lines.push("");
    }
  }

  // Recommendations
  if (opts.showRecommendations) {
    const allRecs = run.results.flatMap((r) => r.recommendations);
    const uniqueRecs = [...new Set(allRecs)].slice(0, 10);

    if (uniqueRecs.length > 0) {
      lines.push("## Recommendations");
      lines.push("");
      for (const rec of uniqueRecs) {
        lines.push(`- ${rec}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

// ============================================================================
// CSV REPORT
// ============================================================================

export function generateCsvReport(run: BenchmarkRun): string {
  const lines: string[] = [];

  // Header
  lines.push(
    [
      "scenario_id",
      "scenario_name",
      "passed",
      "overall_score",
      "reasoning_score",
      "tool_usage_score",
      "output_score",
      "efficiency_score",
      "duration_ms",
      "token_count",
      "tool_call_count",
      "tools_used",
      "model",
      "provider",
      "prompt_version",
      "run_id",
      "timestamp",
    ].join(",")
  );

  // Data rows
  for (const result of run.results) {
    const reasoningScore =
      result.scores.reasoning.length > 0
        ? result.scores.reasoning.reduce((sum, r) => sum + r.overallScore, 0) /
          result.scores.reasoning.length
        : 0;

    lines.push(
      [
        result.scenarioId,
        `"${result.scenarioName}"`,
        result.passed,
        result.overallScore,
        reasoningScore.toFixed(1),
        result.scores.toolUsage.score,
        result.scores.output.score,
        result.scores.efficiency.score,
        result.duration,
        result.scores.efficiency.tokenCount,
        result.scores.efficiency.toolCallCount,
        `"${result.scores.toolUsage.toolsUsed.join(";")}"`,
        run.config.model,
        run.config.provider,
        run.config.promptVersion || "default",
        run.runId,
        run.timestamp,
      ].join(",")
    );
  }

  return lines.join("\n");
}

// ============================================================================
// COMPARISON REPORT
// ============================================================================

export function generateEnhancedComparisonReport(
  comparison: BenchmarkComparison,
  baseRun: BenchmarkRun,
  compareRun: BenchmarkRun
): string {
  const lines: string[] = [];
  const width = 80;

  lines.push("╔" + "═".repeat(width - 2) + "╗");
  lines.push("║" + " BENCHMARK COMPARISON".padStart((width + 19) / 2).padEnd(width - 2) + "║");
  lines.push("╠" + "═".repeat(width - 2) + "╣");

  // Run info
  lines.push("║" + " RUNS COMPARED".padEnd(width - 2) + "║");
  lines.push("╟" + "─".repeat(width - 2) + "╢");
  lines.push(
    "║" +
      `  Base:    ${baseRun.runId} (${baseRun.config.model})`.padEnd(width - 2) +
      "║"
  );
  lines.push(
    "║" +
      `  Compare: ${compareRun.runId} (${compareRun.config.model})`.padEnd(width - 2) +
      "║"
  );

  // Delta summary
  lines.push("╠" + "═".repeat(width - 2) + "╣");
  lines.push("║" + " OVERALL CHANGE".padEnd(width - 2) + "║");
  lines.push("╟" + "─".repeat(width - 2) + "╢");

  const scoreDeltaStr =
    comparison.scoreDelta >= 0 ? `+${comparison.scoreDelta.toFixed(1)}` : comparison.scoreDelta.toFixed(1);
  const passDeltaStr =
    comparison.passRateDelta >= 0
      ? `+${comparison.passRateDelta.toFixed(1)}%`
      : `${comparison.passRateDelta.toFixed(1)}%`;

  const scoreEmoji = comparison.scoreDelta > 0 ? "📈" : comparison.scoreDelta < 0 ? "📉" : "➡️";
  const passEmoji =
    comparison.passRateDelta > 0 ? "📈" : comparison.passRateDelta < 0 ? "📉" : "➡️";

  lines.push(
    "║" + `  Score Delta:     ${scoreDeltaStr} ${scoreEmoji}`.padEnd(width - 2) + "║"
  );
  lines.push(
    "║" + `  Pass Rate Delta: ${passDeltaStr} ${passEmoji}`.padEnd(width - 2) + "║"
  );

  // Scenario changes
  lines.push("╟" + "─".repeat(width - 2) + "╢");
  lines.push(
    "║" + `  Improved:  ${comparison.improved.length} scenarios`.padEnd(width - 2) + "║"
  );
  lines.push(
    "║" + `  Regressed: ${comparison.regressed.length} scenarios`.padEnd(width - 2) + "║"
  );
  lines.push(
    "║" + `  Unchanged: ${comparison.unchanged.length} scenarios`.padEnd(width - 2) + "║"
  );

  // Category deltas
  const significantCategoryChanges = Object.entries(comparison.categoryDeltas)
    .filter(([_, delta]) => Math.abs(delta) > 5)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));

  if (significantCategoryChanges.length > 0) {
    lines.push("╠" + "═".repeat(width - 2) + "╣");
    lines.push("║" + " CATEGORY CHANGES".padEnd(width - 2) + "║");
    lines.push("╟" + "─".repeat(width - 2) + "╢");

    for (const [category, delta] of significantCategoryChanges) {
      const sign = delta > 0 ? "+" : "";
      const emoji = delta > 0 ? "⬆️" : "⬇️";
      lines.push(
        "║" + `  ${category.padEnd(18)} ${sign}${delta.toFixed(1)} ${emoji}`.padEnd(width - 2) + "║"
      );
    }
  }

  // Improved scenarios
  if (comparison.improved.length > 0) {
    lines.push("╠" + "═".repeat(width - 2) + "╣");
    lines.push("║" + " ✅ IMPROVED SCENARIOS".padEnd(width - 2) + "║");
    lines.push("╟" + "─".repeat(width - 2) + "╢");
    for (const id of comparison.improved.slice(0, 5)) {
      lines.push("║" + `  ${id}`.padEnd(width - 2) + "║");
    }
    if (comparison.improved.length > 5) {
      lines.push(
        "║" + `  ... and ${comparison.improved.length - 5} more`.padEnd(width - 2) + "║"
      );
    }
  }

  // Regressed scenarios
  if (comparison.regressed.length > 0) {
    lines.push("╠" + "═".repeat(width - 2) + "╣");
    lines.push("║" + " ❌ REGRESSED SCENARIOS".padEnd(width - 2) + "║");
    lines.push("╟" + "─".repeat(width - 2) + "╢");
    for (const id of comparison.regressed.slice(0, 5)) {
      lines.push("║" + `  ${id}`.padEnd(width - 2) + "║");
    }
    if (comparison.regressed.length > 5) {
      lines.push(
        "║" + `  ... and ${comparison.regressed.length - 5} more`.padEnd(width - 2) + "║"
      );
    }
  }

  lines.push("╚" + "═".repeat(width - 2) + "╝");

  return lines.join("\n");
}

// ============================================================================
// MULTI-MODEL COMPARISON
// ============================================================================

export interface MultiModelComparisonResult {
  scenarios: string[];
  models: Array<{
    model: string;
    provider: string;
    runId: string;
    summary: BenchmarkSummary;
    results: Map<string, ScenarioResult>;
  }>;
}

export function generateMultiModelReport(comparison: MultiModelComparisonResult): string {
  const lines: string[] = [];
  const width = 100;

  lines.push("╔" + "═".repeat(width - 2) + "╗");
  lines.push("║" + " MULTI-MODEL BENCHMARK COMPARISON".padStart((width + 31) / 2).padEnd(width - 2) + "║");
  lines.push("╠" + "═".repeat(width - 2) + "╣");

  // Model summary table
  lines.push("║" + " MODEL SUMMARY".padEnd(width - 2) + "║");
  lines.push("╟" + "─".repeat(width - 2) + "╢");

  const modelHeader =
    "  " +
    "Model".padEnd(25) +
    "Pass Rate".padStart(12) +
    "Avg Score".padStart(12) +
    "Duration".padStart(12) +
    "Tokens".padStart(12);
  lines.push("║" + modelHeader.padEnd(width - 2) + "║");
  lines.push("╟" + "─".repeat(width - 2) + "╢");

  // Sort by average score
  const sortedModels = [...comparison.models].sort(
    (a, b) => b.summary.averageScore - a.summary.averageScore
  );

  for (const model of sortedModels) {
    const row =
      "  " +
      `${model.model} (${model.provider})`.slice(0, 23).padEnd(25) +
      `${model.summary.passRate.toFixed(1)}%`.padStart(12) +
      model.summary.averageScore.toFixed(1).padStart(12) +
      formatDuration(model.summary.totalDuration).padStart(12) +
      formatTokens(model.summary.totalTokens).padStart(12);
    lines.push("║" + row.padEnd(width - 2) + "║");
  }

  // Per-scenario comparison
  lines.push("╠" + "═".repeat(width - 2) + "╣");
  lines.push("║" + " SCENARIO-BY-SCENARIO COMPARISON".padEnd(width - 2) + "║");
  lines.push("╟" + "─".repeat(width - 2) + "╢");

  // Header with model names (truncated)
  const scenarioHeader =
    "  " +
    "Scenario".padEnd(30) +
    sortedModels.map((m) => m.model.slice(0, 12).padStart(14)).join("");
  lines.push("║" + scenarioHeader.padEnd(width - 2) + "║");
  lines.push("╟" + "─".repeat(width - 2) + "╢");

  // Show each scenario
  for (const scenarioId of comparison.scenarios.slice(0, 20)) {
    const scores = sortedModels.map((m) => {
      const result = m.results.get(scenarioId);
      return result ? result.overallScore.toFixed(0) : "-";
    });

    const row = "  " + scenarioId.slice(0, 28).padEnd(30) + scores.map((s) => s.padStart(14)).join("");
    lines.push("║" + row.padEnd(width - 2) + "║");
  }

  if (comparison.scenarios.length > 20) {
    lines.push(
      "║" + `  ... and ${comparison.scenarios.length - 20} more scenarios`.padEnd(width - 2) + "║"
    );
  }

  lines.push("╚" + "═".repeat(width - 2) + "╝");

  return lines.join("\n");
}

// ============================================================================
// MAIN EXPORT
// ============================================================================

export function generateBenchmarkReport(
  run: BenchmarkRun,
  options: Partial<ReportOptions> = {}
): string {
  const format = options.format || "console";

  switch (format) {
    case "console":
      return generateConsoleReport(run, options);
    case "markdown":
      return generateMarkdownReport(run, options);
    case "csv":
      return generateCsvReport(run);
    case "json":
      return JSON.stringify(run, null, 2);
    default:
      return generateConsoleReport(run, options);
  }
}
