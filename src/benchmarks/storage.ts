/**
 * Benchmark Storage
 *
 * Persists benchmark results for tracking improvement over time.
 * Supports file-based and in-memory storage.
 */

import { promises as fs } from "node:fs";
import { join, dirname } from "node:path";
import type {
  BenchmarkRun,
  BenchmarkHistory,
  BenchmarkComparison,
  ScenarioResult,
  BenchmarkSummary,
  TaskCategory,
  TaskComplexity,
} from "./types.js";

// ============================================================================
// STORAGE INTERFACE
// ============================================================================

export interface BenchmarkStorage {
  /** Save a benchmark run */
  saveRun(run: BenchmarkRun): Promise<void>;

  /** Load a specific run by ID */
  loadRun(runId: string): Promise<BenchmarkRun | null>;

  /** Get history of all runs */
  getHistory(): Promise<BenchmarkHistory>;

  /** Get latest run */
  getLatestRun(): Promise<BenchmarkRun | null>;

  /** Compare two runs */
  compareRuns(baseRunId: string, compareRunId: string): Promise<BenchmarkComparison | null>;

  /** Delete a run */
  deleteRun(runId: string): Promise<boolean>;

  /** Clear all data */
  clearAll(): Promise<void>;
}

// ============================================================================
// FILE-BASED STORAGE
// ============================================================================

/**
 * File-based storage for benchmark results
 */
export class FileBenchmarkStorage implements BenchmarkStorage {
  private baseDir: string;
  private historyFile: string;

  constructor(baseDir: string = "./.benchmark-results") {
    this.baseDir = baseDir;
    this.historyFile = join(baseDir, "history.json");
  }

  async saveRun(run: BenchmarkRun): Promise<void> {
    await this.ensureDir();

    // Save full run data
    const runFile = join(this.baseDir, `run_${run.runId}.json`);
    await fs.writeFile(runFile, JSON.stringify(run, null, 2));

    // Update history
    const history = await this.getHistory();
    history.runs.push({
      runId: run.runId,
      timestamp: run.timestamp,
      model: run.config.model,
      promptVersion: run.config.promptVersion,
      summary: run.summary,
    });

    // Keep last 100 runs in history
    if (history.runs.length > 100) {
      history.runs = history.runs.slice(-100);
    }

    await fs.writeFile(this.historyFile, JSON.stringify(history, null, 2));
  }

  async loadRun(runId: string): Promise<BenchmarkRun | null> {
    try {
      const runFile = join(this.baseDir, `run_${runId}.json`);
      const data = await fs.readFile(runFile, "utf-8");
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  async getHistory(): Promise<BenchmarkHistory> {
    try {
      const data = await fs.readFile(this.historyFile, "utf-8");
      return JSON.parse(data);
    } catch {
      return { runs: [] };
    }
  }

  async getLatestRun(): Promise<BenchmarkRun | null> {
    const history = await this.getHistory();
    if (history.runs.length === 0) return null;

    const latest = history.runs[history.runs.length - 1];
    return this.loadRun(latest.runId);
  }

  async compareRuns(
    baseRunId: string,
    compareRunId: string
  ): Promise<BenchmarkComparison | null> {
    const baseRun = await this.loadRun(baseRunId);
    const compareRun = await this.loadRun(compareRunId);

    if (!baseRun || !compareRun) return null;

    return this.computeComparison(baseRun, compareRun);
  }

  async deleteRun(runId: string): Promise<boolean> {
    try {
      const runFile = join(this.baseDir, `run_${runId}.json`);
      await fs.unlink(runFile);

      // Update history
      const history = await this.getHistory();
      history.runs = history.runs.filter((r) => r.runId !== runId);
      await fs.writeFile(this.historyFile, JSON.stringify(history, null, 2));

      return true;
    } catch {
      return false;
    }
  }

  async clearAll(): Promise<void> {
    try {
      await fs.rm(this.baseDir, { recursive: true, force: true });
    } catch {
      // Directory might not exist
    }
  }

  private async ensureDir(): Promise<void> {
    try {
      await fs.mkdir(this.baseDir, { recursive: true });
    } catch {
      // Directory might already exist
    }
  }

  private computeComparison(
    baseRun: BenchmarkRun,
    compareRun: BenchmarkRun
  ): BenchmarkComparison {
    const improved: string[] = [];
    const regressed: string[] = [];
    const unchanged: string[] = [];

    // Compare individual scenarios
    const baseResults = new Map(
      baseRun.results.map((r) => [r.scenarioId, r])
    );

    for (const compareResult of compareRun.results) {
      const baseResult = baseResults.get(compareResult.scenarioId);
      if (!baseResult) {
        // New scenario
        if (compareResult.passed) {
          improved.push(compareResult.scenarioId);
        }
        continue;
      }

      const scoreDiff = compareResult.overallScore - baseResult.overallScore;

      if (scoreDiff > 5 || (!baseResult.passed && compareResult.passed)) {
        improved.push(compareResult.scenarioId);
      } else if (scoreDiff < -5 || (baseResult.passed && !compareResult.passed)) {
        regressed.push(compareResult.scenarioId);
      } else {
        unchanged.push(compareResult.scenarioId);
      }
    }

    // Calculate category deltas
    const categoryDeltas: Record<TaskCategory, number> = {} as Record<TaskCategory, number>;
    const categories = Object.keys(baseRun.summary.scoresByCategory) as TaskCategory[];

    for (const category of categories) {
      const baseScore = baseRun.summary.scoresByCategory[category]?.averageScore || 0;
      const compareScore = compareRun.summary.scoresByCategory[category]?.averageScore || 0;
      categoryDeltas[category] = compareScore - baseScore;
    }

    // Calculate complexity deltas
    const complexityDeltas: Record<TaskComplexity, number> = {} as Record<TaskComplexity, number>;
    const complexities = Object.keys(baseRun.summary.scoresByComplexity) as TaskComplexity[];

    for (const complexity of complexities) {
      const baseScore = baseRun.summary.scoresByComplexity[complexity]?.averageScore || 0;
      const compareScore = compareRun.summary.scoresByComplexity[complexity]?.averageScore || 0;
      complexityDeltas[complexity] = compareScore - baseScore;
    }

    return {
      baseRun: baseRun.runId,
      compareRun: compareRun.runId,
      scoreDelta: compareRun.summary.averageScore - baseRun.summary.averageScore,
      passRateDelta: compareRun.summary.passRate - baseRun.summary.passRate,
      improved,
      regressed,
      unchanged,
      categoryDeltas,
      complexityDeltas,
    };
  }
}

// ============================================================================
// IN-MEMORY STORAGE
// ============================================================================

/**
 * In-memory storage for testing and temporary use
 */
export class MemoryBenchmarkStorage implements BenchmarkStorage {
  private runs: Map<string, BenchmarkRun> = new Map();
  private history: BenchmarkHistory = { runs: [] };

  async saveRun(run: BenchmarkRun): Promise<void> {
    this.runs.set(run.runId, run);
    this.history.runs.push({
      runId: run.runId,
      timestamp: run.timestamp,
      model: run.config.model,
      promptVersion: run.config.promptVersion,
      summary: run.summary,
    });
  }

  async loadRun(runId: string): Promise<BenchmarkRun | null> {
    return this.runs.get(runId) || null;
  }

  async getHistory(): Promise<BenchmarkHistory> {
    return this.history;
  }

  async getLatestRun(): Promise<BenchmarkRun | null> {
    if (this.history.runs.length === 0) return null;
    const latest = this.history.runs[this.history.runs.length - 1];
    return this.runs.get(latest.runId) || null;
  }

  async compareRuns(
    baseRunId: string,
    compareRunId: string
  ): Promise<BenchmarkComparison | null> {
    const baseRun = this.runs.get(baseRunId);
    const compareRun = this.runs.get(compareRunId);

    if (!baseRun || !compareRun) return null;

    // Use same comparison logic as file storage
    const fileStorage = new FileBenchmarkStorage();
    return (fileStorage as any).computeComparison(baseRun, compareRun);
  }

  async deleteRun(runId: string): Promise<boolean> {
    const deleted = this.runs.delete(runId);
    this.history.runs = this.history.runs.filter((r) => r.runId !== runId);
    return deleted;
  }

  async clearAll(): Promise<void> {
    this.runs.clear();
    this.history = { runs: [] };
  }
}

// ============================================================================
// ANALYSIS UTILITIES
// ============================================================================

/**
 * Analyze trends across multiple runs
 */
export async function analyzeTrends(
  storage: BenchmarkStorage,
  numRuns: number = 10
): Promise<{
  scoresTrend: number[];
  passRatesTrend: number[];
  improving: boolean;
  avgImprovement: number;
}> {
  const history = await storage.getHistory();
  const recentRuns = history.runs.slice(-numRuns);

  if (recentRuns.length < 2) {
    return {
      scoresTrend: recentRuns.map((r) => r.summary.averageScore),
      passRatesTrend: recentRuns.map((r) => r.summary.passRate),
      improving: false,
      avgImprovement: 0,
    };
  }

  const scores = recentRuns.map((r) => r.summary.averageScore);
  const passRates = recentRuns.map((r) => r.summary.passRate);

  // Calculate linear regression slope for scores
  const n = scores.length;
  const sumX = (n * (n - 1)) / 2;
  const sumY = scores.reduce((a, b) => a + b, 0);
  const sumXY = scores.reduce((sum, y, x) => sum + x * y, 0);
  const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

  return {
    scoresTrend: scores,
    passRatesTrend: passRates,
    improving: slope > 0,
    avgImprovement: slope,
  };
}

/**
 * Find scenarios that consistently fail
 */
export async function findProblemScenarios(
  storage: BenchmarkStorage,
  numRuns: number = 5
): Promise<
  Array<{
    scenarioId: string;
    failCount: number;
    avgScore: number;
    commonIssue?: string;
  }>
> {
  const history = await storage.getHistory();
  const recentRunIds = history.runs.slice(-numRuns).map((r) => r.runId);

  const scenarioStats = new Map<
    string,
    { fails: number; scores: number[]; issues: string[] }
  >();

  for (const runId of recentRunIds) {
    const run = await storage.loadRun(runId);
    if (!run) continue;

    for (const result of run.results) {
      const stats = scenarioStats.get(result.scenarioId) || {
        fails: 0,
        scores: [],
        issues: [],
      };

      if (!result.passed) stats.fails++;
      stats.scores.push(result.overallScore);

      for (const issue of result.issues) {
        if (issue.severity === "critical" || issue.severity === "major") {
          stats.issues.push(issue.message);
        }
      }

      scenarioStats.set(result.scenarioId, stats);
    }
  }

  return Array.from(scenarioStats.entries())
    .filter(([_, stats]) => stats.fails >= 2)
    .map(([scenarioId, stats]) => ({
      scenarioId,
      failCount: stats.fails,
      avgScore: stats.scores.reduce((a, b) => a + b, 0) / stats.scores.length,
      commonIssue: findMostCommon(stats.issues),
    }))
    .sort((a, b) => b.failCount - a.failCount);
}

/**
 * Generate comparison report between two runs
 */
export function generateComparisonReport(comparison: BenchmarkComparison): string {
  const lines: string[] = [];

  lines.push("═".repeat(70));
  lines.push("  BENCHMARK COMPARISON REPORT");
  lines.push("═".repeat(70));
  lines.push("");
  lines.push(`Base Run: ${comparison.baseRun}`);
  lines.push(`Compare Run: ${comparison.compareRun}`);
  lines.push("");

  // Overall change
  const scoreChange = comparison.scoreDelta > 0 ? `+${comparison.scoreDelta.toFixed(1)}` : comparison.scoreDelta.toFixed(1);
  const passChange = comparison.passRateDelta > 0 ? `+${comparison.passRateDelta.toFixed(1)}%` : `${comparison.passRateDelta.toFixed(1)}%`;

  lines.push("─".repeat(70));
  lines.push("  OVERALL CHANGE");
  lines.push("─".repeat(70));
  lines.push(`Score Delta: ${scoreChange}`);
  lines.push(`Pass Rate Delta: ${passChange}`);
  lines.push("");

  // Scenario changes
  if (comparison.improved.length > 0) {
    lines.push(`✓ Improved (${comparison.improved.length}):`);
    for (const id of comparison.improved.slice(0, 5)) {
      lines.push(`    ${id}`);
    }
    if (comparison.improved.length > 5) {
      lines.push(`    ... and ${comparison.improved.length - 5} more`);
    }
    lines.push("");
  }

  if (comparison.regressed.length > 0) {
    lines.push(`✗ Regressed (${comparison.regressed.length}):`);
    for (const id of comparison.regressed.slice(0, 5)) {
      lines.push(`    ${id}`);
    }
    if (comparison.regressed.length > 5) {
      lines.push(`    ... and ${comparison.regressed.length - 5} more`);
    }
    lines.push("");
  }

  lines.push(`○ Unchanged: ${comparison.unchanged.length} scenarios`);
  lines.push("");

  // Category changes
  const significantCategoryChanges = Object.entries(comparison.categoryDeltas)
    .filter(([_, delta]) => Math.abs(delta) > 5)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));

  if (significantCategoryChanges.length > 0) {
    lines.push("─".repeat(70));
    lines.push("  SIGNIFICANT CATEGORY CHANGES");
    lines.push("─".repeat(70));
    for (const [category, delta] of significantCategoryChanges) {
      const sign = delta > 0 ? "+" : "";
      lines.push(`  ${category}: ${sign}${delta.toFixed(1)}`);
    }
    lines.push("");
  }

  lines.push("═".repeat(70));

  return lines.join("\n");
}

// ============================================================================
// HELPERS
// ============================================================================

function findMostCommon(arr: string[]): string | undefined {
  if (arr.length === 0) return undefined;

  const counts = new Map<string, number>();
  for (const item of arr) {
    counts.set(item, (counts.get(item) || 0) + 1);
  }

  let maxCount = 0;
  let mostCommon: string | undefined;

  for (const [item, count] of counts) {
    if (count > maxCount) {
      maxCount = count;
      mostCommon = item;
    }
  }

  return mostCommon;
}

// ============================================================================
// DEFAULT STORAGE
// ============================================================================

export const defaultStorage = new FileBenchmarkStorage(
  join(process.cwd(), ".benchmark-results")
);
