/**
 * Reasoning Benchmark Integration Tests
 *
 * Comprehensive benchmark tests for evaluating AI agent reasoning quality.
 * These tests enable systematic evaluation and optimization of prompts and
 * reasoning patterns over time.
 *
 * ## Running the Benchmarks
 *
 * Quick smoke test:
 * ```bash
 * GOOGLE_API_KEY=xxx pnpm --filter=@waiboard/ai-agents test src/__tests__/integration/reasoning-benchmark.test.ts
 * ```
 *
 * Full benchmark with storage:
 * ```bash
 * GOOGLE_API_KEY=xxx RUN_FULL_BENCHMARK=true pnpm --filter=@waiboard/ai-agents test src/__tests__/integration/reasoning-benchmark.test.ts
 * ```
 *
 * ## Benchmark Categories
 *
 * 1. **Chat Scenarios** - Conversational messages, no tool usage expected
 * 2. **Query Scenarios** - Canvas exploration and search
 * 3. **Simple Create** - Basic element creation (1-2 tools)
 * 4. **Complex Create** - Multi-step creation with planning
 * 5. **Modification** - Editing existing elements
 * 6. **Clarification** - Handling ambiguous requests
 * 7. **Delegation** - Sub-agent delegation patterns
 * 8. **Error Recovery** - Graceful error handling
 * 9. **Efficiency** - Tool usage optimization
 *
 * ## Scoring Dimensions
 *
 * - **Reasoning Quality**: Presence and quality of <analyze>, <plan>, etc.
 * - **Tool Usage**: Correct tools, correct order, efficient usage
 * - **Output Quality**: User-facing response quality
 * - **Efficiency**: Token and time efficiency
 *
 * @see packages/ai-agents/src/benchmarks/ for benchmark implementation
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";

// Benchmark imports
import {
  BenchmarkRunner,
  BenchmarkScorer,
  MemoryBenchmarkStorage,
  generateReport,
  generateComparisonReport,
  analyzeTrends,
  findProblemScenarios,
  SCENARIO_SETS,
  ALL_SCENARIOS,
  CHAT_SCENARIOS,
  QUERY_SCENARIOS,
  SIMPLE_CREATE_SCENARIOS,
  CLARIFICATION_SCENARIOS,
  quickScoreToolUsage,
  quickScoreReasoning,
  quickScoreOutput,
  type BenchmarkRun,
  type ScenarioResult,
  // TAOD Reasoning Scenarios
  ALL_REASONING_SCENARIOS,
  ANALYZE_SCENARIOS,
  CLARITY_ASSESSMENT_SCENARIOS,
  PLANNING_SCENARIOS,
  OBSERVATION_SCENARIOS,
  DECISION_SCENARIOS,
  FULL_TAOD_SCENARIOS,
  REASONING_SCENARIO_SETS,
  // Routing Scenarios
  ALL_ROUTING_SCENARIOS,
  OUTPUT_TYPE_SCENARIOS,
  TOPIC_CLARITY_SCENARIOS,
  COMPLEXITY_ROUTING_SCENARIOS,
  ROUTING_SCENARIO_SETS,
  // Edge Case Scenarios
  ALL_EDGE_CASE_SCENARIOS,
  INPUT_BOUNDARY_SCENARIOS,
  LANGUAGE_EDGE_CASES,
  EDGE_CASE_SCENARIO_SETS,
  // Regression Scenarios
  ALL_REGRESSION_SCENARIOS,
  CRITICAL_REGRESSIONS,
  REGRESSION_SCENARIO_SETS,
  // Comparison Scenarios
  ALL_COMPARISON_SCENARIOS,
  BASELINE_SCENARIOS,
  COMPARISON_SCENARIO_SETS,
  PROMPT_COMPARISON_WORKFLOW,
} from "../../benchmarks/index.js";

// Response extractor for testing
import { extractReasoning, parseLLMOutput } from "../../core/response-extractor.js";

// ============================================================================
// TEST CONFIGURATION
// ============================================================================

const RUN_LIVE_TESTS =
  process.env.GOOGLE_API_KEY !== undefined ||
  process.env.OPENAI_API_KEY !== undefined;
const RUN_FULL_BENCHMARK = process.env.RUN_FULL_BENCHMARK === "true";

const describeIfLive = RUN_LIVE_TESTS ? describe : describe.skip;
const describeIfFull = RUN_LIVE_TESTS && RUN_FULL_BENCHMARK ? describe : describe.skip;

// Model Configuration - Use environment variable or default to OpenAI
const BENCHMARK_MODEL = process.env.BENCHMARK_MODEL || "gpt-4o";
const BENCHMARK_PROVIDER = (process.env.BENCHMARK_PROVIDER || "openai") as
  | "google"
  | "openai"
  | "anthropic";

// Timeouts
const TIMEOUT_SMOKE = 180_000; // 3 min for smoke tests
const TIMEOUT_CATEGORY = 360_000; // 6 min per category
const TIMEOUT_FULL = 2400_000; // 40 min for full benchmark

// ============================================================================
// UNIT TESTS: Scoring Functions (Always Run)
// ============================================================================

describe("Benchmark Scoring - Unit Tests", () => {
  describe("Quick Score Tool Usage", () => {
    it("should score perfect tool usage", () => {
      const result = quickScoreToolUsage(
        [
          { tool: "canvas_read", args: {} },
          { tool: "canvas_write", args: {} },
        ],
        ["canvas_read", "canvas_write"]
      );

      expect(result.score).toBe(100);
      expect(result.passed).toBe(true);
    });

    it("should penalize missing tools", () => {
      const result = quickScoreToolUsage(
        [{ tool: "canvas_read", args: {} }],
        ["canvas_read", "canvas_write"]
      );

      expect(result.score).toBeLessThan(100);
      expect(result.details).toContain("Missing");
    });

    it("should penalize unexpected tools", () => {
      const result = quickScoreToolUsage(
        [
          { tool: "canvas_read", args: {} },
          { tool: "canvas_delete", args: {} }, // Unexpected
        ],
        ["canvas_read"]
      );

      expect(result.score).toBeLessThan(100);
      expect(result.details).toContain("Unexpected");
    });

    it("should penalize exceeding max calls", () => {
      const result = quickScoreToolUsage(
        [
          { tool: "canvas_write", args: {} },
          { tool: "canvas_write", args: {} },
          { tool: "canvas_write", args: {} },
        ],
        ["canvas_write"],
        1 // maxCalls
      );

      expect(result.score).toBeLessThan(100);
      expect(result.details).toContain("Exceeded");
    });
  });

  describe("Quick Score Reasoning", () => {
    it("should score present required tags", () => {
      const reasoning = {
        analyze: "Task analysis here",
        plan: "Planning steps",
        summarize: null,
      };

      const result = quickScoreReasoning(reasoning, ["analyze", "plan"]);

      expect(result.score).toBe(100);
      expect(result.passed).toBe(true);
      expect(result.missing).toHaveLength(0);
    });

    it("should identify missing required tags", () => {
      const reasoning = {
        analyze: "Task analysis",
        plan: null,
        assess_clarity: null,
      };

      const result = quickScoreReasoning(reasoning, [
        "analyze",
        "plan",
        "assess_clarity",
      ]);

      expect(result.passed).toBe(false);
      expect(result.missing).toContain("plan");
      expect(result.missing).toContain("assess_clarity");
    });
  });

  describe("Quick Score Output", () => {
    it("should match expected patterns", () => {
      const output = "I've created a rectangle at position 100,100";

      const result = quickScoreOutput(output, {
        contains: ["created", "rectangle"],
      });

      expect(result.score).toBe(100);
      expect(result.matched).toContain("created");
      expect(result.matched).toContain("rectangle");
    });

    it("should penalize missing patterns", () => {
      const output = "I've created a rectangle";

      const result = quickScoreOutput(output, {
        contains: ["created", "element ID"],
      });

      expect(result.score).toBeLessThan(100);
      expect(result.matched).toContain("created");
    });

    it("should penalize forbidden patterns", () => {
      const output = "I cannot help with that request";

      const result = quickScoreOutput(output, {
        notContains: ["cannot", "error"],
      });

      expect(result.score).toBeLessThan(100);
      expect(result.forbidden).toContain("cannot");
    });
  });
});

describe("Reasoning Tag Extraction - Unit Tests", () => {
  it("should extract all reasoning tags", () => {
    const text = `
<analyze>This is the analysis</analyze>

<assess_clarity>
Output type: mindmap
Topic clarity: specific
Complexity: single
</assess_clarity>

<plan>
1. Create nodes
2. Add connections
</plan>

I've created your mindmap!

<summarize>Created 5 elements</summarize>
`;

    const reasoning = extractReasoning(text);

    expect(reasoning.analyze).toBe("This is the analysis");
    expect(reasoning.assess_clarity).toContain("Output type: mindmap");
    expect(reasoning.plan).toContain("1. Create nodes");
    expect(reasoning.summarize).toBe("Created 5 elements");
  });

  it("should parse LLM output correctly", () => {
    const text = `
<analyze>Task requires creating elements</analyze>
<plan>Use canvas_write to create</plan>

I've created your rectangle at position 100,100. The element ID is rect_1.
`;

    const parsed = parseLLMOutput(text);

    expect(parsed.hasUserContent).toBe(true);
    expect(parsed.userResponse).toContain("rectangle");
    expect(parsed.userResponse).not.toContain("<analyze>");
    expect(parsed.reasoning.analyze).toBe("Task requires creating elements");
  });

  it("should identify reasoning-only output", () => {
    const text = `
<analyze>Checking what user wants</analyze>
<plan>Will delegate to designer</plan>
`;

    const parsed = parseLLMOutput(text);

    expect(parsed.hasUserContent).toBe(false);
  });
});

// ============================================================================
// SCENARIO VALIDATION TESTS (Always Run)
// ============================================================================

describe("Benchmark Scenarios - Validation", () => {
  it("should have unique scenario IDs", () => {
    const ids = ALL_SCENARIOS.map((s) => s.id);
    const uniqueIds = new Set(ids);

    expect(uniqueIds.size).toBe(ids.length);
  });

  it("should have valid categories for all scenarios", () => {
    const validCategories = [
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

    for (const scenario of ALL_SCENARIOS) {
      expect(validCategories).toContain(scenario.category);
    }
  });

  it("should have valid complexity levels", () => {
    const validComplexities = [
      "trivial",
      "simple",
      "moderate",
      "complex",
      "expert",
    ];

    for (const scenario of ALL_SCENARIOS) {
      expect(validComplexities).toContain(scenario.complexity);
    }
  });

  it("should have expected behavior for all scenarios", () => {
    for (const scenario of ALL_SCENARIOS) {
      expect(scenario.expected).toBeDefined();
      expect(typeof scenario.expected.shouldUseTool).toBe("boolean");
    }
  });

  it("should have sufficient scenarios per category", () => {
    expect(CHAT_SCENARIOS.length).toBeGreaterThanOrEqual(3);
    expect(QUERY_SCENARIOS.length).toBeGreaterThanOrEqual(3);
    expect(SIMPLE_CREATE_SCENARIOS.length).toBeGreaterThanOrEqual(3);
    expect(CLARIFICATION_SCENARIOS.length).toBeGreaterThanOrEqual(2);
  });

  it("should have scenario sets defined", () => {
    expect(SCENARIO_SETS.smoke.length).toBeGreaterThanOrEqual(3);
    expect(SCENARIO_SETS.core.length).toBeGreaterThanOrEqual(5);
    expect(SCENARIO_SETS.reasoning.length).toBeGreaterThanOrEqual(5);
    expect(SCENARIO_SETS.full.length).toBe(ALL_SCENARIOS.length);
  });
});

// ============================================================================
// NEW SCENARIO SUITES VALIDATION
// ============================================================================

describe("TAOD Reasoning Scenarios - Validation", () => {
  it("should have unique scenario IDs", () => {
    const ids = ALL_REASONING_SCENARIOS.map((s) => s.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("should have scenarios for each TAOD phase", () => {
    expect(ANALYZE_SCENARIOS.length).toBeGreaterThanOrEqual(3);
    expect(CLARITY_ASSESSMENT_SCENARIOS.length).toBeGreaterThanOrEqual(3);
    expect(PLANNING_SCENARIOS.length).toBeGreaterThanOrEqual(3);
    expect(OBSERVATION_SCENARIOS.length).toBeGreaterThanOrEqual(2);
    expect(DECISION_SCENARIOS.length).toBeGreaterThanOrEqual(2);
    expect(FULL_TAOD_SCENARIOS.length).toBeGreaterThanOrEqual(2);
  });

  it("should have reasoning tags for TAOD scenarios", () => {
    for (const scenario of ALL_REASONING_SCENARIOS) {
      expect(scenario.tags).toBeDefined();
      expect(scenario.tags).toContain("reasoning");
    }
  });

  it("should have REASONING_SCENARIO_SETS properly defined", () => {
    expect(REASONING_SCENARIO_SETS.analyze.length).toBe(ANALYZE_SCENARIOS.length);
    expect(REASONING_SCENARIO_SETS.clarity.length).toBe(CLARITY_ASSESSMENT_SCENARIOS.length);
    expect(REASONING_SCENARIO_SETS.planning.length).toBe(PLANNING_SCENARIOS.length);
    expect(REASONING_SCENARIO_SETS.all.length).toBe(ALL_REASONING_SCENARIOS.length);
  });
});

describe("Routing Scenarios - Validation", () => {
  it("should have unique scenario IDs", () => {
    const ids = ALL_ROUTING_SCENARIOS.map((s) => s.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("should have scenarios for output type recognition", () => {
    expect(OUTPUT_TYPE_SCENARIOS.length).toBeGreaterThanOrEqual(5);
  });

  it("should have scenarios for topic clarity assessment", () => {
    expect(TOPIC_CLARITY_SCENARIOS.length).toBeGreaterThanOrEqual(3);
  });

  it("should have complexity routing scenarios", () => {
    expect(COMPLEXITY_ROUTING_SCENARIOS.length).toBeGreaterThanOrEqual(3);
  });

  it("should have routing tags for all scenarios", () => {
    for (const scenario of ALL_ROUTING_SCENARIOS) {
      expect(scenario.tags).toContain("routing");
    }
  });
});

describe("Edge Case Scenarios - Validation", () => {
  it("should have unique scenario IDs", () => {
    const ids = ALL_EDGE_CASE_SCENARIOS.map((s) => s.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("should have input boundary scenarios", () => {
    expect(INPUT_BOUNDARY_SCENARIOS.length).toBeGreaterThanOrEqual(5);
  });

  it("should have language edge cases", () => {
    expect(LANGUAGE_EDGE_CASES.length).toBeGreaterThanOrEqual(4);
  });

  it("should have edge-case tags for all scenarios", () => {
    for (const scenario of ALL_EDGE_CASE_SCENARIOS) {
      expect(scenario.tags).toContain("edge-case");
    }
  });
});

describe("Regression Scenarios - Validation", () => {
  it("should have unique scenario IDs", () => {
    const ids = ALL_REGRESSION_SCENARIOS.map((s) => s.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("should have critical regressions defined", () => {
    expect(CRITICAL_REGRESSIONS.length).toBeGreaterThanOrEqual(4);
    // All critical regressions should exist in the full set
    for (const id of CRITICAL_REGRESSIONS) {
      expect(ALL_REGRESSION_SCENARIOS.find(s => s.id === id)).toBeDefined();
    }
  });

  it("should have regression tags for all scenarios", () => {
    for (const scenario of ALL_REGRESSION_SCENARIOS) {
      expect(scenario.tags).toContain("regression");
    }
  });
});

describe("Comparison Scenarios - Validation", () => {
  it("should have unique scenario IDs", () => {
    const ids = ALL_COMPARISON_SCENARIOS.map((s) => s.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("should have baseline scenarios", () => {
    expect(BASELINE_SCENARIOS.length).toBeGreaterThanOrEqual(4);
  });

  it("should have prompt comparison workflow defined", () => {
    expect(PROMPT_COMPARISON_WORKFLOW.quickCheck.length).toBeGreaterThanOrEqual(4);
    expect(PROMPT_COMPARISON_WORKFLOW.fullComparison.length).toBe(ALL_COMPARISON_SCENARIOS.length);
  });

  it("should have comparison tags for all scenarios", () => {
    for (const scenario of ALL_COMPARISON_SCENARIOS) {
      const hasTag = scenario.tags?.includes("comparison") || scenario.tags?.includes("baseline");
      expect(hasTag).toBe(true);
    }
  });
});

// ============================================================================
// STORAGE TESTS (Always Run)
// ============================================================================

describe("Benchmark Storage - Unit Tests", () => {
  let storage: MemoryBenchmarkStorage;

  beforeEach(() => {
    storage = new MemoryBenchmarkStorage();
  });

  it("should save and load runs", async () => {
    const mockRun: BenchmarkRun = createMockRun("test-run-1");

    await storage.saveRun(mockRun);
    const loaded = await storage.loadRun("test-run-1");

    expect(loaded).toBeDefined();
    expect(loaded?.runId).toBe("test-run-1");
  });

  it("should track history", async () => {
    await storage.saveRun(createMockRun("run-1"));
    await storage.saveRun(createMockRun("run-2"));
    await storage.saveRun(createMockRun("run-3"));

    const history = await storage.getHistory();

    expect(history.runs.length).toBe(3);
  });

  it("should get latest run", async () => {
    await storage.saveRun(createMockRun("run-1"));
    await storage.saveRun(createMockRun("run-2"));

    const latest = await storage.getLatestRun();

    expect(latest?.runId).toBe("run-2");
  });

  it("should compare runs", async () => {
    const run1 = createMockRun("run-1", 70);
    const run2 = createMockRun("run-2", 85);

    await storage.saveRun(run1);
    await storage.saveRun(run2);

    const comparison = await storage.compareRuns("run-1", "run-2");

    expect(comparison).toBeDefined();
    expect(comparison?.scoreDelta).toBeGreaterThan(0);
  });

  it("should delete runs", async () => {
    await storage.saveRun(createMockRun("run-to-delete"));

    const deleted = await storage.deleteRun("run-to-delete");
    const loaded = await storage.loadRun("run-to-delete");

    expect(deleted).toBe(true);
    expect(loaded).toBeNull();
  });
});

// ============================================================================
// LIVE BENCHMARK TESTS (Require API Key)
// ============================================================================

describeIfLive("Reasoning Benchmark - Live Tests", () => {
  let storage: MemoryBenchmarkStorage;

  beforeAll(() => {
    storage = new MemoryBenchmarkStorage();
  });

  describe("Smoke Test", () => {
    it(
      "should pass basic smoke test scenarios",
      async () => {
        const runner = new BenchmarkRunner(
          {
            scenarios: SCENARIO_SETS.smoke,
            model: BENCHMARK_MODEL,
            provider: BENCHMARK_PROVIDER,
          },
          {
            verbose: false,
            onProgress: (completed, total) => {
              console.log(`Progress: ${completed}/${total}`);
            },
          }
        );

        const run = await runner.runAll();

        // Store for later comparison
        await storage.saveRun(run);

        // Print report
        console.log("\n" + generateReport(run));

        // Assertions
        expect(run.results.length).toBe(SCENARIO_SETS.smoke.length);
        expect(run.summary.passRate).toBeGreaterThanOrEqual(50);
        expect(run.summary.averageScore).toBeGreaterThanOrEqual(40);
      },
      TIMEOUT_SMOKE
    );
  });

  describe("Chat Scenarios", () => {
    it(
      "should handle chat scenarios without tools",
      async () => {
        const runner = new BenchmarkRunner({
          categories: ["chat"],
          model: BENCHMARK_MODEL,
          provider: BENCHMARK_PROVIDER,
        });

        const run = await runner.runAll();

        // Chat scenarios should not use tools
        for (const result of run.results) {
          if (result.passed) {
            expect(result.scores.toolUsage.callCount).toBe(0);
          }
        }

        expect(run.summary.passRate).toBeGreaterThanOrEqual(60);
      },
      TIMEOUT_CATEGORY
    );
  });

  describe("Query Scenarios", () => {
    it(
      "should handle canvas queries correctly",
      async () => {
        const runner = new BenchmarkRunner({
          categories: ["query"],
          model: BENCHMARK_MODEL,
          provider: BENCHMARK_PROVIDER,
        });

        const run = await runner.runAll();

        // Query scenarios should use read/find tools
        for (const result of run.results) {
          if (result.passed) {
            const usedReadOrFind =
              result.scores.toolUsage.toolsUsed.includes("canvas_read") ||
              result.scores.toolUsage.toolsUsed.includes("canvas_find");
            expect(usedReadOrFind).toBe(true);
          }
        }

        expect(run.summary.passRate).toBeGreaterThanOrEqual(50);
      },
      TIMEOUT_CATEGORY
    );
  });

  describe("Clarification Scenarios", () => {
    it(
      "should handle ambiguous requests correctly",
      async () => {
        const runner = new BenchmarkRunner({
          categories: ["clarification"],
          model: BENCHMARK_MODEL,
          provider: BENCHMARK_PROVIDER,
        });

        const run = await runner.runAll();

        console.log("\n" + generateReport(run));

        // At least some scenarios should pass
        expect(run.summary.passRate).toBeGreaterThanOrEqual(30);
      },
      TIMEOUT_CATEGORY
    );
  });

  describe("Simple Create Scenarios", () => {
    it(
      "should create elements efficiently",
      async () => {
        const runner = new BenchmarkRunner({
          categories: ["simple_create"],
          model: BENCHMARK_MODEL,
          provider: BENCHMARK_PROVIDER,
        });

        const run = await runner.runAll();

        // Should use canvas_write
        for (const result of run.results) {
          if (result.passed) {
            expect(result.scores.toolUsage.toolsUsed).toContain("canvas_write");
          }
        }

        expect(run.summary.passRate).toBeGreaterThanOrEqual(40);
      },
      TIMEOUT_CATEGORY
    );
  });

  // ============================================================================
  // TAOD REASONING SUITE
  // ============================================================================

  describe("TAOD Reasoning Suite", () => {
    it(
      "should evaluate analyze step quality",
      async () => {
        const runner = new BenchmarkRunner({
          scenarios: REASONING_SCENARIO_SETS.analyze,
          model: BENCHMARK_MODEL,
          provider: BENCHMARK_PROVIDER,
        });

        const run = await runner.runAll();
        console.log("\n[ANALYZE PHASE RESULTS]");
        console.log(generateReport(run));

        // Analyze scenarios should have analyze tag presence
        for (const result of run.results) {
          const scenario = ANALYZE_SCENARIOS.find(s => s.id === result.scenarioId);
          if (scenario?.expected.expectedReasoning?.requiredTags?.includes("analyze")) {
            // Check that analyze reasoning was attempted
            expect(result.rawData?.reasoning).toBeDefined();
          }
        }
      },
      TIMEOUT_CATEGORY
    );

    it(
      "should evaluate clarity assessment quality",
      async () => {
        const runner = new BenchmarkRunner({
          scenarios: REASONING_SCENARIO_SETS.clarity,
          model: BENCHMARK_MODEL,
          provider: BENCHMARK_PROVIDER,
        });

        const run = await runner.runAll();
        console.log("\n[CLARITY ASSESSMENT RESULTS]");
        console.log(generateReport(run));

        expect(run.summary.passRate).toBeGreaterThanOrEqual(30);
      },
      TIMEOUT_CATEGORY
    );

    it(
      "should evaluate planning quality",
      async () => {
        const runner = new BenchmarkRunner({
          scenarios: REASONING_SCENARIO_SETS.planning,
          model: BENCHMARK_MODEL,
          provider: BENCHMARK_PROVIDER,
        });

        const run = await runner.runAll();
        console.log("\n[PLANNING PHASE RESULTS]");
        console.log(generateReport(run));

        expect(run.summary.passRate).toBeGreaterThanOrEqual(30);
      },
      TIMEOUT_CATEGORY
    );

    it(
      "should evaluate full TAOD cycle",
      async () => {
        const runner = new BenchmarkRunner({
          scenarios: REASONING_SCENARIO_SETS.taod,
          model: BENCHMARK_MODEL,
          provider: BENCHMARK_PROVIDER,
        });

        const run = await runner.runAll();
        console.log("\n[FULL TAOD CYCLE RESULTS]");
        console.log(generateReport(run));

        expect(run.summary.passRate).toBeGreaterThanOrEqual(30);
      },
      TIMEOUT_CATEGORY
    );
  });

  // ============================================================================
  // ROUTING SUITE
  // ============================================================================

  describe("Semantic Routing Suite", () => {
    it(
      "should recognize output types correctly",
      async () => {
        const runner = new BenchmarkRunner({
          scenarios: ROUTING_SCENARIO_SETS.outputType,
          model: BENCHMARK_MODEL,
          provider: BENCHMARK_PROVIDER,
        });

        const run = await runner.runAll();
        console.log("\n[OUTPUT TYPE RECOGNITION RESULTS]");
        console.log(generateReport(run));

        expect(run.summary.passRate).toBeGreaterThanOrEqual(30);
      },
      TIMEOUT_CATEGORY
    );

    it(
      "should assess topic clarity correctly",
      async () => {
        const runner = new BenchmarkRunner({
          scenarios: ROUTING_SCENARIO_SETS.topicClarity,
          model: BENCHMARK_MODEL,
          provider: BENCHMARK_PROVIDER,
        });

        const run = await runner.runAll();
        console.log("\n[TOPIC CLARITY ASSESSMENT RESULTS]");
        console.log(generateReport(run));

        expect(run.summary.passRate).toBeGreaterThanOrEqual(30);
      },
      TIMEOUT_CATEGORY
    );

    it(
      "should route by complexity correctly",
      async () => {
        const runner = new BenchmarkRunner({
          scenarios: ROUTING_SCENARIO_SETS.complexity,
          model: BENCHMARK_MODEL,
          provider: BENCHMARK_PROVIDER,
        });

        const run = await runner.runAll();
        console.log("\n[COMPLEXITY ROUTING RESULTS]");
        console.log(generateReport(run));

        expect(run.summary.passRate).toBeGreaterThanOrEqual(30);
      },
      TIMEOUT_CATEGORY
    );
  });

  // ============================================================================
  // REGRESSION SUITE
  // ============================================================================

  describe("Regression Test Suite", () => {
    it(
      "should pass critical regressions",
      async () => {
        const runner = new BenchmarkRunner({
          scenarios: CRITICAL_REGRESSIONS,
          model: BENCHMARK_MODEL,
          provider: BENCHMARK_PROVIDER,
        });

        const run = await runner.runAll();
        console.log("\n[CRITICAL REGRESSIONS RESULTS]");
        console.log(generateReport(run));

        // Critical regressions should have high pass rate
        expect(run.summary.passRate).toBeGreaterThanOrEqual(50);
      },
      TIMEOUT_CATEGORY
    );
  });
});

// ============================================================================
// FULL BENCHMARK SUITE (Requires RUN_FULL_BENCHMARK=true)
// ============================================================================

describeIfFull("Full Reasoning Benchmark", () => {
  let storage: MemoryBenchmarkStorage;
  let baselineRun: BenchmarkRun | null = null;

  beforeAll(() => {
    storage = new MemoryBenchmarkStorage();
  });

  it(
    "should run complete core benchmark suite",
    async () => {
      const runner = new BenchmarkRunner(
        {
          scenarios: SCENARIO_SETS.full,
          model: BENCHMARK_MODEL,
          provider: BENCHMARK_PROVIDER,
          concurrency: 2,
          retries: 1,
        },
        {
          verbose: false,
          onProgress: (completed, total, result) => {
            const status = result?.passed ? "✓" : "✗";
            console.log(
              `[${completed}/${total}] ${status} ${result?.scenarioId}: ${result?.overallScore}/100`
            );
          },
        }
      );

      const run = await runner.runAll();
      baselineRun = run;

      // Save for tracking
      await storage.saveRun(run);

      // Print full report
      console.log("\n" + generateReport(run));

      // Assertions
      expect(run.results.length).toBe(ALL_SCENARIOS.length);
      expect(run.summary.passRate).toBeGreaterThanOrEqual(40);
      expect(run.summary.averageScore).toBeGreaterThanOrEqual(50);
    },
    TIMEOUT_FULL
  );

  it(
    "should run full TAOD reasoning benchmark",
    async () => {
      const runner = new BenchmarkRunner(
        {
          scenarios: REASONING_SCENARIO_SETS.all,
          model: BENCHMARK_MODEL,
          provider: BENCHMARK_PROVIDER,
          concurrency: 2,
          retries: 1,
        },
        {
          verbose: false,
          onProgress: (completed, total, result) => {
            const status = result?.passed ? "✓" : "✗";
            console.log(
              `[TAOD ${completed}/${total}] ${status} ${result?.scenarioId}: ${result?.overallScore}/100`
            );
          },
        }
      );

      const run = await runner.runAll();
      await storage.saveRun(run);

      console.log("\n=== TAOD REASONING BENCHMARK ===");
      console.log(generateReport(run));

      expect(run.summary.passRate).toBeGreaterThanOrEqual(30);
    },
    TIMEOUT_FULL
  );

  it(
    "should run full routing benchmark",
    async () => {
      const runner = new BenchmarkRunner(
        {
          scenarios: ROUTING_SCENARIO_SETS.all,
          model: BENCHMARK_MODEL,
          provider: BENCHMARK_PROVIDER,
          concurrency: 2,
          retries: 1,
        },
        {
          verbose: false,
          onProgress: (completed, total, result) => {
            const status = result?.passed ? "✓" : "✗";
            console.log(
              `[ROUTING ${completed}/${total}] ${status} ${result?.scenarioId}: ${result?.overallScore}/100`
            );
          },
        }
      );

      const run = await runner.runAll();
      await storage.saveRun(run);

      console.log("\n=== ROUTING BENCHMARK ===");
      console.log(generateReport(run));

      expect(run.summary.passRate).toBeGreaterThanOrEqual(30);
    },
    TIMEOUT_FULL
  );

  it(
    "should run full edge case benchmark",
    async () => {
      const runner = new BenchmarkRunner(
        {
          scenarios: EDGE_CASE_SCENARIO_SETS.all,
          model: BENCHMARK_MODEL,
          provider: BENCHMARK_PROVIDER,
          concurrency: 2,
          retries: 1,
        },
        {
          verbose: false,
          onProgress: (completed, total, result) => {
            const status = result?.passed ? "✓" : "✗";
            console.log(
              `[EDGE ${completed}/${total}] ${status} ${result?.scenarioId}: ${result?.overallScore}/100`
            );
          },
        }
      );

      const run = await runner.runAll();
      await storage.saveRun(run);

      console.log("\n=== EDGE CASE BENCHMARK ===");
      console.log(generateReport(run));

      // Edge cases are hard, lower threshold
      expect(run.summary.passRate).toBeGreaterThanOrEqual(20);
    },
    TIMEOUT_FULL
  );

  it(
    "should run full regression benchmark",
    async () => {
      const runner = new BenchmarkRunner(
        {
          scenarios: REGRESSION_SCENARIO_SETS.all,
          model: BENCHMARK_MODEL,
          provider: BENCHMARK_PROVIDER,
          concurrency: 2,
          retries: 1,
        },
        {
          verbose: false,
          onProgress: (completed, total, result) => {
            const status = result?.passed ? "✓" : "✗";
            console.log(
              `[REGRESS ${completed}/${total}] ${status} ${result?.scenarioId}: ${result?.overallScore}/100`
            );
          },
        }
      );

      const run = await runner.runAll();
      await storage.saveRun(run);

      console.log("\n=== REGRESSION BENCHMARK ===");
      console.log(generateReport(run));

      // Regressions should have high pass rate
      expect(run.summary.passRate).toBeGreaterThanOrEqual(40);
    },
    TIMEOUT_FULL
  );

  it(
    "should run baseline comparison benchmark",
    async () => {
      const runner = new BenchmarkRunner(
        {
          scenarios: COMPARISON_SCENARIO_SETS.baseline,
          model: BENCHMARK_MODEL,
          provider: BENCHMARK_PROVIDER,
          concurrency: 2,
          retries: 1,
        },
        {
          verbose: false,
          onProgress: (completed, total, result) => {
            const status = result?.passed ? "✓" : "✗";
            console.log(
              `[BASELINE ${completed}/${total}] ${status} ${result?.scenarioId}: ${result?.overallScore}/100`
            );
          },
        }
      );

      const run = await runner.runAll();
      await storage.saveRun(run);

      console.log("\n=== BASELINE BENCHMARK ===");
      console.log(generateReport(run));

      // Baseline should be reasonably achievable
      expect(run.summary.passRate).toBeGreaterThanOrEqual(50);
    },
    TIMEOUT_CATEGORY
  );

  it("should analyze trends", async () => {
    // Add another run with slightly different results
    if (baselineRun) {
      const modifiedRun = { ...baselineRun, runId: "modified-run" };
      await storage.saveRun(modifiedRun);

      const trends = await analyzeTrends(storage);

      expect(trends.scoresTrend.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("should identify problem scenarios", async () => {
    const problems = await findProblemScenarios(storage);

    // Log problem scenarios for investigation
    if (problems.length > 0) {
      console.log("\nProblem Scenarios:");
      for (const problem of problems.slice(0, 5)) {
        console.log(
          `  - ${problem.scenarioId}: ${problem.failCount} failures, avg score: ${problem.avgScore.toFixed(1)}`
        );
        if (problem.commonIssue) {
          console.log(`    Issue: ${problem.commonIssue}`);
        }
      }
    }
  });
});

// ============================================================================
// PROMPT VERSION COMPARISON (Advanced)
// ============================================================================

describeIfFull("Prompt Version Comparison", () => {
  it.skip(
    "should compare v1 vs v2 prompt performance",
    async () => {
      const storage = new MemoryBenchmarkStorage();

      // Run with v1 prompts
      process.env.PROMPT_VERSION = "v1";
      const runnerV1 = new BenchmarkRunner({
        scenarios: SCENARIO_SETS.core,
        model: BENCHMARK_MODEL,
        provider: BENCHMARK_PROVIDER,
        promptVersion: "v1",
      });
      const v1Run = await runnerV1.runAll();
      await storage.saveRun(v1Run);

      // Run with v2 prompts
      process.env.PROMPT_VERSION = "v2";
      const runnerV2 = new BenchmarkRunner({
        scenarios: SCENARIO_SETS.core,
        model: BENCHMARK_MODEL,
        provider: BENCHMARK_PROVIDER,
        promptVersion: "v2",
      });
      const v2Run = await runnerV2.runAll();
      await storage.saveRun(v2Run);

      // Compare
      const comparison = await storage.compareRuns(v1Run.runId, v2Run.runId);

      if (comparison) {
        console.log("\n" + generateComparisonReport(comparison));

        // v2 should be at least as good as v1
        expect(comparison.scoreDelta).toBeGreaterThanOrEqual(-10);
      }
    },
    TIMEOUT_FULL * 2
  );
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function createMockRun(runId: string, score: number = 75): BenchmarkRun {
  return {
    runId,
    timestamp: Date.now(),
    config: {
      model: "test-model",
      provider: BENCHMARK_PROVIDER,
    },
    results: [
      createMockResult("test-scenario", score),
    ],
    summary: {
      totalScenarios: 1,
      passedScenarios: score >= 60 ? 1 : 0,
      failedScenarios: score < 60 ? 1 : 0,
      passRate: score >= 60 ? 100 : 0,
      averageScore: score,
      scoresByCategory: {
        chat: { count: 1, passed: 1, averageScore: score, averageDuration: 1000 },
      } as any,
      scoresByComplexity: {
        simple: { count: 1, passed: 1, averageScore: score, averageDuration: 1000 },
      } as any,
      commonIssues: [],
      totalDuration: 1000,
      totalTokens: 500,
    },
  };
}

function createMockResult(scenarioId: string, score: number): ScenarioResult {
  return {
    scenarioId,
    scenarioName: "Test Scenario",
    runId: "mock-run",
    timestamp: Date.now(),
    duration: 1000,
    model: "test-model",
    provider: BENCHMARK_PROVIDER,
    passed: score >= 60,
    overallScore: score,
    scores: {
      reasoning: [],
      toolUsage: {
        score: score,
        correctTools: true,
        correctOrder: true,
        callCount: 1,
        toolsUsed: ["canvas_read"],
        unexpectedTools: [],
        missingTools: [],
      },
      output: {
        score: score,
        hasUserContent: true,
        patternsMatched: [],
        patternsMissed: [],
        forbiddenPatterns: [],
      },
      efficiency: {
        score: score,
        tokenCount: 500,
        toolCallCount: 1,
        iterationCount: 1,
        durationMs: 1000,
      },
    },
    issues: [],
    recommendations: [],
    rawData: {
      events: [],
      toolCalls: [],
      reasoning: {},
    },
  };
}

// ============================================================================
// SKIP INFO
// ============================================================================

describe("Reasoning Benchmark (Skip Info)", () => {
  it("should print run instructions when tests are skipped", () => {
    if (!RUN_LIVE_TESTS) {
      console.log(`
┌─────────────────────────────────────────────────────────────────────────────┐
│  Reasoning Benchmark Tests Skipped                                          │
│                                                                             │
│  These tests evaluate AI agent reasoning quality with real API calls.       │
│                                                                             │
│  Available Benchmark Suites:                                                │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  Quick Smoke Test:                                                          │
│  GOOGLE_API_KEY=xxx pnpm --filter=@waiboard/ai-agents benchmark:smoke       │
│                                                                             │
│  TAOD Reasoning (Think → Act → Observe → Decide):                           │
│  GOOGLE_API_KEY=xxx pnpm --filter=@waiboard/ai-agents benchmark:taod        │
│                                                                             │
│  Semantic Routing:                                                          │
│  GOOGLE_API_KEY=xxx pnpm --filter=@waiboard/ai-agents benchmark:routing     │
│                                                                             │
│  Regression Tests:                                                          │
│  GOOGLE_API_KEY=xxx pnpm --filter=@waiboard/ai-agents benchmark:regression  │
│                                                                             │
│  Edge Cases (requires RUN_FULL_BENCHMARK):                                  │
│  GOOGLE_API_KEY=xxx pnpm --filter=@waiboard/ai-agents benchmark:edge        │
│                                                                             │
│  Baseline Comparison (requires RUN_FULL_BENCHMARK):                         │
│  GOOGLE_API_KEY=xxx pnpm --filter=@waiboard/ai-agents benchmark:baseline    │
│                                                                             │
│  Full Benchmark (all suites):                                               │
│  GOOGLE_API_KEY=xxx pnpm --filter=@waiboard/ai-agents benchmark:full        │
│                                                                             │
│  Estimated Costs:                                                           │
│  - Smoke test: ~$0.02-0.05                                                  │
│  - Single suite: ~$0.10-0.30                                                │
│  - Full benchmark: ~$1.00-2.00                                              │
│                                                                             │
│  Scenario Counts:                                                           │
│  - Core scenarios: ${ALL_SCENARIOS.length.toString().padEnd(3)} | TAOD reasoning: ${ALL_REASONING_SCENARIOS.length.toString().padEnd(3)}            │
│  - Routing: ${ALL_ROUTING_SCENARIOS.length.toString().padEnd(7)} | Edge cases: ${ALL_EDGE_CASE_SCENARIOS.length.toString().padEnd(7)}                    │
│  - Regression: ${ALL_REGRESSION_SCENARIOS.length.toString().padEnd(4)} | Comparison: ${ALL_COMPARISON_SCENARIOS.length.toString().padEnd(4)}                       │
└─────────────────────────────────────────────────────────────────────────────┘
      `);
    }
    expect(true).toBe(true);
  });
});
