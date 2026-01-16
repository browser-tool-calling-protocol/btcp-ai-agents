/**
 * Benchmark Runner
 *
 * Executes benchmark scenarios against the AI agent and collects results.
 * Supports concurrent execution, retries, and progress tracking.
 */

import type {
  BenchmarkScenario,
  BenchmarkConfig,
  BenchmarkRun,
  BenchmarkSummary,
  ScenarioResult,
  AgentEventRecord,
  ToolCallRecord,
  CategoryStats,
  ComplexityStats,
  TaskCategory,
  TaskComplexity,
  DebugLogSummary,
} from "./types.js";

import { BenchmarkScorer } from "./scorer.js";
import { ALL_SCENARIOS, getScenarioById, SCENARIO_SETS } from "./scenarios.js";
import { BenchmarkDebugLogger } from "./debug-logger.js";
import { MockMcpClient } from "./mock-mcp-client.js";
import {
  query,
  type SDKMessage,
  type SDKPartialMessage,
  type SDKResultMessage,
  isPartialMessage,
  isResultMessage,
} from "../agent-sdk/core/index.js";
import type {
  AgentEvent,
  ActingEvent,
  ObservingEvent,
  CompleteEvent,
  ContextEvent,
} from "../agent-sdk/agents/types.js";

// Type guard helpers for AgentEvent (from agents/types.ts)
function isActingEvent(event: AgentEvent): event is ActingEvent {
  return event.type === "acting";
}
function isObservingEvent(event: AgentEvent): event is ObservingEvent {
  return event.type === "observing";
}
function isCompleteEvent(event: AgentEvent): event is CompleteEvent {
  return event.type === "complete";
}
function isContextEvent(event: AgentEvent): event is ContextEvent {
  return event.type === "context";
}

/**
 * Convert SDKMessage to AgentEvent format for benchmark scoring
 *
 * Maps SDK message types to the agents/types.ts AgentEvent format:
 * - partial(tool_use_start) → acting
 * - partial(tool_result) → observing
 * - partial(thinking_delta) → reasoning
 * - result(success: true) → complete
 * - result(success: false) → failed
 */
function sdkMessageToAgentEvent(msg: SDKMessage): AgentEvent | null {
  if (isPartialMessage(msg)) {
    const partial = msg as SDKPartialMessage;
    switch (partial.eventType) {
      case "tool_use_start":
        return {
          type: "acting",
          timestamp: msg.timestamp,
          tool: partial.toolName,
          input: partial.toolInput,
        } as ActingEvent;

      case "tool_result":
        return {
          type: "observing",
          timestamp: msg.timestamp,
          result: { success: true, data: partial.toolResult },
        } as ObservingEvent;

      case "thinking_delta":
        return {
          type: "reasoning",
          timestamp: msg.timestamp,
          content: partial.thinking || "",
        } as AgentEvent;

      case "content_block_start":
        return {
          type: "context",
          timestamp: msg.timestamp,
          summary: "",
          tokensUsed: 0,
        } as ContextEvent;

      default:
        // Other partial events don't have direct AgentEvent equivalents
        return null;
    }
  }

  if (isResultMessage(msg)) {
    const result = msg as SDKResultMessage;
    if (result.success) {
      return {
        type: "complete",
        timestamp: msg.timestamp,
        summary: result.summary || "Task completed",
        elementsAffected: result.toolCalls,
        totalDuration: result.durationMs,
      } as CompleteEvent;
    } else {
      return {
        type: "failed",
        timestamp: msg.timestamp,
        reason: result.error || "Unknown error",
        errors: [{ code: "BENCHMARK_ERROR", message: result.error || "Unknown error" }],
      } as AgentEvent;
    }
  }

  // System and other message types don't map to AgentEvent
  return null;
}

// ============================================================================
// RUNNER TYPES
// ============================================================================

export interface RunnerOptions {
  /** Progress callback */
  onProgress?: (completed: number, total: number, result?: ScenarioResult) => void;

  /** Error callback */
  onError?: (scenarioId: string, error: Error) => void;

  /** Verbose logging */
  verbose?: boolean;

  /** Enable debug logging to file */
  enableDebugLog?: boolean;

  /** Custom directory for debug logs */
  debugLogDir?: string;

  /** Callback when debug log is created */
  onDebugLog?: (summary: DebugLogSummary) => void;
}

export interface MockCanvasDriver {
  elements: Map<string, unknown>;
  toolCallLog: Array<{ tool: string; args: unknown; timestamp: number }>;
  create: (spec: unknown) => unknown;
  clear: () => void;
  getAll: () => unknown[];
  resetToolCallLog: () => void;
}

// ============================================================================
// BENCHMARK RUNNER CLASS
// ============================================================================

/**
 * Executes benchmark scenarios and collects results
 */
export class BenchmarkRunner {
  private scorer: BenchmarkScorer;
  private config: BenchmarkConfig;
  private options: RunnerOptions;

  constructor(config: BenchmarkConfig, options: RunnerOptions = {}) {
    this.config = config;
    this.options = options;
    this.scorer = new BenchmarkScorer();
  }

  /**
   * Run all scenarios matching the configuration
   */
  async runAll(): Promise<BenchmarkRun> {
    const scenarios = this.selectScenarios();
    const runId = `bench_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const startTime = Date.now();

    const results: ScenarioResult[] = [];

    // Run scenarios (respecting concurrency)
    if (this.config.concurrency && this.config.concurrency > 1) {
      results.push(...(await this.runConcurrent(scenarios)));
    } else {
      results.push(...(await this.runSequential(scenarios)));
    }

    // Calculate summary
    const summary = this.calculateSummary(results);

    return {
      runId,
      timestamp: startTime,
      config: this.config,
      results,
      summary,
    };
  }

  /**
   * Run a single scenario
   */
  async runScenario(scenario: BenchmarkScenario): Promise<ScenarioResult> {
    const startTime = Date.now();
    const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const events: AgentEventRecord[] = [];
    const toolCalls: ToolCallRecord[] = [];
    let finalOutput: string | undefined;
    let tokenCount = 0;

    // Create debug logger if enabled
    const debugLogger = this.options.enableDebugLog
      ? new BenchmarkDebugLogger(runId, scenario.id, {
          logDir: this.options.debugLogDir,
        })
      : null;

    try {
      // Log scenario start
      debugLogger?.log("info", `Starting scenario: ${scenario.name}`, {
        prompt: scenario.prompt,
        complexity: scenario.complexity,
        category: scenario.category,
      });

      // Create mock MCP client for benchmark (simulates canvas operations)
      const mockMcpClient = new MockMcpClient();
      if (scenario.initialCanvasState?.elements) {
        mockMcpClient.setInitialState(
          scenario.initialCanvasState.elements.map((el) => ({
            id: el.id || `elem_${Math.random().toString(36).slice(2, 8)}`,
            type: el.type || "rectangle",
            ...el,
          }))
        );
      }

      // Run the agent using the new core API with mock MCP
      const queryStream = query(scenario.prompt, {
        canvasId: `benchmark-${scenario.id}`,
        model: this.config.model,
        provider: this.config.provider,
        verbose: this.options.verbose,
        maxTurns: 15,
        includePartialMessages: true,
        includeSystemMessage: false,
        mcpClient: mockMcpClient,
      });

      for await (const sdkMessage of queryStream) {
        // Convert SDK message to AgentEvent for benchmark scoring
        const event = sdkMessageToAgentEvent(sdkMessage);
        if (!event) continue; // Skip messages that don't map to AgentEvent

        // Convert and record event
        const eventRecord = this.convertEvent(event);
        events.push(eventRecord);

        // Log event to debug logger
        debugLogger?.logEvent(eventRecord, tokenCount);

        // Track tool calls
        if (isActingEvent(event) && event.tool) {
          const toolCall: ToolCallRecord = {
            tool: event.tool,
            args: (event.input as Record<string, unknown>) || {},
            duration: 0,
            timestamp: Date.now(),
          };
          toolCalls.push(toolCall);
        }

        // Track tool results
        if (isObservingEvent(event) && toolCalls.length > 0) {
          const lastCall = toolCalls[toolCalls.length - 1];
          lastCall.result = event.result;
          lastCall.duration = Date.now() - lastCall.timestamp;

          // Log completed tool call
          debugLogger?.logToolCall(lastCall, toolCalls.length, tokenCount);
        }

        // Capture final output
        if (isCompleteEvent(event)) {
          finalOutput = event.summary;
        }

        // Track tokens from result messages
        if (isResultMessage(sdkMessage)) {
          const result = sdkMessage as SDKResultMessage;
          tokenCount += result.usage.totalTokens;
        }

        // Track tokens (if available from context events)
        if (isContextEvent(event)) {
          tokenCount += event.tokensUsed;
        }

        // Log reasoning events
        if (event.type === "reasoning" && "content" in event) {
          debugLogger?.logReasoning(
            "reasoning",
            (event as { content: string }).content,
            tokenCount
          );
        }
      }

      const duration = Date.now() - startTime;

      // Score the result
      const result = this.scorer.score(
        scenario,
        events,
        toolCalls,
        finalOutput,
        this.config.model,
        this.config.provider,
        duration,
        tokenCount,
        this.config.promptVersion
      );

      // Log efficiency metrics
      debugLogger?.logEfficiency({
        stepEfficiencyRatio: result.scores.efficiency.stepEfficiencyRatio,
        tokenEfficiencyRatio: result.scores.efficiency.tokenEfficiencyRatio,
        redundantCallCount: result.scores.efficiency.redundantCallCount,
        pathDeviationScore: result.scores.efficiency.pathDeviationScore,
      });

      // Finalize debug log
      if (debugLogger) {
        const logSummary = debugLogger.finalize();
        this.options.onDebugLog?.(logSummary);
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      // Log error
      debugLogger?.log("error", `Scenario failed: ${(error as Error).message}`, {
        stack: (error as Error).stack,
      });

      // Finalize debug log even on error
      if (debugLogger) {
        const logSummary = debugLogger.finalize();
        this.options.onDebugLog?.(logSummary);
      }

      // Return failed result
      return this.createFailedResult(scenario, error as Error, duration, events, toolCalls);
    }
  }

  /**
   * Run scenarios sequentially
   */
  private async runSequential(scenarios: BenchmarkScenario[]): Promise<ScenarioResult[]> {
    const results: ScenarioResult[] = [];

    for (let i = 0; i < scenarios.length; i++) {
      const scenario = scenarios[i];
      let result: ScenarioResult | null = null;
      let retries = this.config.retries || 0;

      while (retries >= 0) {
        try {
          result = await this.runScenario(scenario);

          // If passed or no more retries, keep result
          if (result.passed || retries === 0) {
            break;
          }

          retries--;
        } catch (error) {
          this.options.onError?.(scenario.id, error as Error);
          retries--;
        }
      }

      if (result) {
        results.push(result);
        this.options.onProgress?.(i + 1, scenarios.length, result);
      }
    }

    return results;
  }

  /**
   * Run scenarios concurrently
   */
  private async runConcurrent(scenarios: BenchmarkScenario[]): Promise<ScenarioResult[]> {
    const concurrency = this.config.concurrency || 3;
    const results: ScenarioResult[] = [];
    let completed = 0;

    // Create batches
    const batches: BenchmarkScenario[][] = [];
    for (let i = 0; i < scenarios.length; i += concurrency) {
      batches.push(scenarios.slice(i, i + concurrency));
    }

    for (const batch of batches) {
      const batchResults = await Promise.all(
        batch.map(async (scenario) => {
          try {
            return await this.runScenario(scenario);
          } catch (error) {
            this.options.onError?.(scenario.id, error as Error);
            return this.createFailedResult(scenario, error as Error, 0, [], []);
          }
        })
      );

      for (const result of batchResults) {
        results.push(result);
        completed++;
        this.options.onProgress?.(completed, scenarios.length, result);
      }
    }

    return results;
  }

  /**
   * Select scenarios based on configuration
   */
  private selectScenarios(): BenchmarkScenario[] {
    let scenarios = [...ALL_SCENARIOS];

    // Filter by specific IDs
    if (this.config.scenarios && this.config.scenarios.length > 0) {
      scenarios = this.config.scenarios
        .map((id) => getScenarioById(id))
        .filter((s): s is BenchmarkScenario => s !== undefined);
    }

    // Filter by category
    if (this.config.categories && this.config.categories.length > 0) {
      scenarios = scenarios.filter((s) =>
        this.config.categories!.includes(s.category)
      );
    }

    // Filter by complexity
    if (this.config.complexities && this.config.complexities.length > 0) {
      scenarios = scenarios.filter((s) =>
        this.config.complexities!.includes(s.complexity)
      );
    }

    // Filter by tags
    if (this.config.tags && this.config.tags.length > 0) {
      scenarios = scenarios.filter((s) =>
        this.config.tags!.some((tag) => s.tags?.includes(tag))
      );
    }

    return scenarios;
  }

  /**
   * Convert agent event to record format
   */
  private convertEvent(event: AgentEvent): AgentEventRecord {
    const record: AgentEventRecord = {
      type: event.type,
      timestamp: event.timestamp || Date.now(),
      data: event as unknown as Record<string, unknown>,
    };

    // Extract tool from acting events
    if (isActingEvent(event)) {
      record.tool = event.tool;
    }

    // Extract content from reasoning events
    if (event.type === "reasoning" && "content" in event) {
      record.content = (event as { content: string }).content;
    }

    // Extract summary from complete events
    if (isCompleteEvent(event)) {
      record.content = event.summary;
    }

    return record;
  }

  /**
   * Create a failed result for error cases
   */
  private createFailedResult(
    scenario: BenchmarkScenario,
    error: Error,
    duration: number,
    events: AgentEventRecord[],
    toolCalls: ToolCallRecord[]
  ): ScenarioResult {
    return {
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      runId: `failed_${Date.now()}`,
      timestamp: Date.now(),
      duration,
      model: this.config.model,
      provider: this.config.provider,
      promptVersion: this.config.promptVersion,
      passed: false,
      overallScore: 0,
      scores: {
        reasoning: [],
        toolUsage: {
          score: 0,
          correctTools: false,
          correctOrder: false,
          callCount: toolCalls.length,
          toolsUsed: toolCalls.map((t) => t.tool),
          unexpectedTools: [],
          missingTools: [],
        },
        output: {
          score: 0,
          hasUserContent: false,
          patternsMatched: [],
          patternsMissed: [],
          forbiddenPatterns: [],
        },
        efficiency: {
          score: 0,
          tokenCount: 0,
          toolCallCount: toolCalls.length,
          iterationCount: 0,
          durationMs: duration,
        },
      },
      issues: [
        {
          severity: "critical",
          category: "behavior",
          message: `Scenario failed with error: ${error.message}`,
          details: error.stack,
        },
      ],
      recommendations: ["Fix the error that caused the scenario to fail"],
      rawData: {
        events,
        toolCalls,
        reasoning: {},
      },
    };
  }

  /**
   * Calculate summary statistics from results
   */
  private calculateSummary(results: ScenarioResult[]): BenchmarkSummary {
    const passed = results.filter((r) => r.passed);
    const failed = results.filter((r) => !r.passed);

    // Calculate by category
    const scoresByCategory: Record<TaskCategory, CategoryStats> = {} as Record<
      TaskCategory,
      CategoryStats
    >;
    const categories: TaskCategory[] = [
      "chat",
      "query",
      "simple_create",
      "complex_create",
      "modify",
      "layout",
      "style",
      "diagram",
      "delegation",
      "clarification",
      "error_recovery",
    ];

    for (const category of categories) {
      const categoryScenarios = this.config.scenarios
        ? results.filter((r) => {
            const scenario = getScenarioById(r.scenarioId);
            return scenario?.category === category;
          })
        : results.filter((r) => {
            const scenario = ALL_SCENARIOS.find((s) => s.id === r.scenarioId);
            return scenario?.category === category;
          });

      if (categoryScenarios.length > 0) {
        scoresByCategory[category] = {
          count: categoryScenarios.length,
          passed: categoryScenarios.filter((r) => r.passed).length,
          averageScore:
            categoryScenarios.reduce((sum, r) => sum + r.overallScore, 0) /
            categoryScenarios.length,
          averageDuration:
            categoryScenarios.reduce((sum, r) => sum + r.duration, 0) /
            categoryScenarios.length,
        };
      }
    }

    // Calculate by complexity
    const scoresByComplexity: Record<TaskComplexity, ComplexityStats> = {} as Record<
      TaskComplexity,
      ComplexityStats
    >;
    const complexities: TaskComplexity[] = [
      "trivial",
      "simple",
      "moderate",
      "complex",
      "expert",
    ];

    for (const complexity of complexities) {
      const complexityResults = results.filter((r) => {
        const scenario = ALL_SCENARIOS.find((s) => s.id === r.scenarioId);
        return scenario?.complexity === complexity;
      });

      if (complexityResults.length > 0) {
        scoresByComplexity[complexity] = {
          count: complexityResults.length,
          passed: complexityResults.filter((r) => r.passed).length,
          averageScore:
            complexityResults.reduce((sum, r) => sum + r.overallScore, 0) /
            complexityResults.length,
          averageDuration:
            complexityResults.reduce((sum, r) => sum + r.duration, 0) /
            complexityResults.length,
        };
      }
    }

    // Find common issues
    const issueMap = new Map<string, { count: number; severity: string }>();
    for (const result of results) {
      for (const issue of result.issues) {
        const key = issue.message;
        const existing = issueMap.get(key);
        if (existing) {
          existing.count++;
        } else {
          issueMap.set(key, { count: 1, severity: issue.severity });
        }
      }
    }

    const commonIssues = Array.from(issueMap.entries())
      .map(([message, data]) => ({
        message,
        count: data.count,
        severity: data.severity,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Calculate totals
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
    const totalTokens = results.reduce(
      (sum, r) => sum + r.scores.efficiency.tokenCount,
      0
    );

    return {
      totalScenarios: results.length,
      passedScenarios: passed.length,
      failedScenarios: failed.length,
      passRate: results.length > 0 ? (passed.length / results.length) * 100 : 0,
      averageScore:
        results.length > 0
          ? results.reduce((sum, r) => sum + r.overallScore, 0) / results.length
          : 0,
      scoresByCategory,
      scoresByComplexity,
      commonIssues,
      totalDuration,
      totalTokens,
    };
  }
}

// ============================================================================
// QUICK RUN FUNCTIONS
// ============================================================================

/**
 * Run a quick smoke test
 */
export async function runSmokeTest(
  model: string,
  provider: "google" | "openai" | "anthropic"
): Promise<BenchmarkRun> {
  const runner = new BenchmarkRunner({
    scenarios: SCENARIO_SETS.smoke,
    model,
    provider,
  });
  return runner.runAll();
}

/**
 * Run core functionality tests
 */
export async function runCoreTests(
  model: string,
  provider: "google" | "openai" | "anthropic"
): Promise<BenchmarkRun> {
  const runner = new BenchmarkRunner({
    scenarios: SCENARIO_SETS.core,
    model,
    provider,
  });
  return runner.runAll();
}

/**
 * Run reasoning quality tests
 */
export async function runReasoningTests(
  model: string,
  provider: "google" | "openai" | "anthropic"
): Promise<BenchmarkRun> {
  const runner = new BenchmarkRunner({
    scenarios: SCENARIO_SETS.reasoning,
    model,
    provider,
  });
  return runner.runAll();
}

/**
 * Run full benchmark suite
 */
export async function runFullBenchmark(
  model: string,
  provider: "google" | "openai" | "anthropic",
  options?: RunnerOptions
): Promise<BenchmarkRun> {
  const runner = new BenchmarkRunner(
    {
      scenarios: SCENARIO_SETS.full,
      model,
      provider,
      concurrency: 2,
      retries: 1,
    },
    options
  );
  return runner.runAll();
}

// ============================================================================
// REPORTING UTILITIES
// ============================================================================

/**
 * Generate a human-readable report from benchmark results
 */
export function generateReport(run: BenchmarkRun): string {
  const lines: string[] = [];

  lines.push("═".repeat(70));
  lines.push("  REASONING BENCHMARK REPORT");
  lines.push("═".repeat(70));
  lines.push("");
  lines.push(`Run ID: ${run.runId}`);
  lines.push(`Date: ${new Date(run.timestamp).toISOString()}`);
  lines.push(`Model: ${run.config.model} (${run.config.provider})`);
  lines.push(`Prompt Version: ${run.config.promptVersion || "default"}`);
  lines.push("");

  // Summary
  lines.push("─".repeat(70));
  lines.push("  SUMMARY");
  lines.push("─".repeat(70));
  lines.push(`Total Scenarios: ${run.summary.totalScenarios}`);
  lines.push(
    `Passed: ${run.summary.passedScenarios} (${run.summary.passRate.toFixed(1)}%)`
  );
  lines.push(`Failed: ${run.summary.failedScenarios}`);
  lines.push(`Average Score: ${run.summary.averageScore.toFixed(1)}/100`);
  lines.push(`Total Duration: ${(run.summary.totalDuration / 1000).toFixed(1)}s`);
  lines.push(`Total Tokens: ${run.summary.totalTokens.toLocaleString()}`);
  lines.push("");

  // By Category
  lines.push("─".repeat(70));
  lines.push("  SCORES BY CATEGORY");
  lines.push("─".repeat(70));
  for (const [category, stats] of Object.entries(run.summary.scoresByCategory)) {
    if (stats.count > 0) {
      lines.push(
        `  ${category.padEnd(20)} ${stats.passed}/${stats.count} passed, avg: ${stats.averageScore.toFixed(1)}`
      );
    }
  }
  lines.push("");

  // By Complexity
  lines.push("─".repeat(70));
  lines.push("  SCORES BY COMPLEXITY");
  lines.push("─".repeat(70));
  for (const [complexity, stats] of Object.entries(run.summary.scoresByComplexity)) {
    if (stats.count > 0) {
      lines.push(
        `  ${complexity.padEnd(20)} ${stats.passed}/${stats.count} passed, avg: ${stats.averageScore.toFixed(1)}`
      );
    }
  }
  lines.push("");

  // Common Issues
  if (run.summary.commonIssues.length > 0) {
    lines.push("─".repeat(70));
    lines.push("  COMMON ISSUES");
    lines.push("─".repeat(70));
    for (const issue of run.summary.commonIssues.slice(0, 5)) {
      lines.push(`  [${issue.severity}] ${issue.message} (${issue.count}x)`);
    }
    lines.push("");
  }

  // Failed Scenarios
  const failed = run.results.filter((r) => !r.passed);
  if (failed.length > 0) {
    lines.push("─".repeat(70));
    lines.push("  FAILED SCENARIOS");
    lines.push("─".repeat(70));
    for (const result of failed) {
      lines.push(`  ✗ ${result.scenarioId}: ${result.scenarioName}`);
      lines.push(`    Score: ${result.overallScore}/100`);
      if (result.issues.length > 0) {
        lines.push(`    Issue: ${result.issues[0].message}`);
      }
    }
    lines.push("");
  }

  // Recommendations
  const allRecs = run.results.flatMap((r) => r.recommendations);
  const uniqueRecs = [...new Set(allRecs)];
  if (uniqueRecs.length > 0) {
    lines.push("─".repeat(70));
    lines.push("  TOP RECOMMENDATIONS");
    lines.push("─".repeat(70));
    for (const rec of uniqueRecs.slice(0, 5)) {
      lines.push(`  • ${rec}`);
    }
    lines.push("");
  }

  lines.push("═".repeat(70));

  return lines.join("\n");
}

/**
 * Generate JSON report for storage/analysis
 */
export function generateJsonReport(run: BenchmarkRun): string {
  return JSON.stringify(run, null, 2);
}
