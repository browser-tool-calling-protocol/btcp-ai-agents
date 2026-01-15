/**
 * Efficiency Metrics Tests
 *
 * Tests for step efficiency, token efficiency, redundant call detection,
 * and debug logging functionality.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, unlinkSync, readFileSync } from "node:fs";
import {
  scoreStepEfficiency,
  scoreTokenEfficiency,
  detectRedundantCalls,
  analyzeExecutionPath,
  scoreEfficiency,
} from "../metrics.js";
import {
  BenchmarkDebugLogger,
  readDebugLog,
  filterLogEntries,
  generateDebugReport,
} from "../debug-logger.js";
import type { ToolCallRecord, DebugLogEntry } from "../types.js";

// ============================================================================
// STEP EFFICIENCY TESTS
// ============================================================================

describe("scoreStepEfficiency", () => {
  it("scores optimal path as 100", () => {
    const result = scoreStepEfficiency(2, 2);
    expect(result.ratio).toBe(1);
    expect(result.score).toBe(100);
    expect(result.feedback).toContain("Optimal");
  });

  it("scores under optimal as 100", () => {
    const result = scoreStepEfficiency(1, 2);
    expect(result.ratio).toBe(0.5);
    expect(result.score).toBe(100);
  });

  it("scores acceptable overhead correctly", () => {
    // 3 steps when 2 optimal = 1.5x = at the edge of acceptable
    const result = scoreStepEfficiency(3, 2, 1.5);
    expect(result.ratio).toBe(1.5);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.score).toBeGreaterThanOrEqual(85);
    expect(result.feedback).toContain("Acceptable");
  });

  it("scores inefficient path with lower score", () => {
    // 4 steps when 2 optimal = 2x
    const result = scoreStepEfficiency(4, 2);
    expect(result.ratio).toBe(2);
    expect(result.score).toBeLessThan(85);
    expect(result.feedback).toContain("Inefficient");
  });

  it("scores very inefficient path with low score", () => {
    // 6 steps when 2 optimal = 3x
    const result = scoreStepEfficiency(6, 2);
    expect(result.ratio).toBe(3);
    expect(result.score).toBeLessThan(60);
    expect(result.feedback).toContain("Very inefficient");
  });

  it("handles zero optimal steps", () => {
    const result = scoreStepEfficiency(0, 0);
    expect(result.score).toBe(100);

    const resultWithSteps = scoreStepEfficiency(2, 0);
    expect(resultWithSteps.score).toBe(50);
  });
});

// ============================================================================
// TOKEN EFFICIENCY TESTS
// ============================================================================

describe("scoreTokenEfficiency", () => {
  it("scores under budget as 100", () => {
    const result = scoreTokenEfficiency(800, 1000);
    expect(result.ratio).toBe(0.8);
    expect(result.score).toBe(100);
    expect(result.feedback).toContain("Under budget");
  });

  it("scores on budget as 100", () => {
    const result = scoreTokenEfficiency(1000, 1000);
    expect(result.ratio).toBe(1);
    expect(result.score).toBe(100);
  });

  it("scores acceptable overage correctly", () => {
    // 1200 tokens when 1000 expected = 1.2x
    const result = scoreTokenEfficiency(1200, 1000, 1.5);
    expect(result.ratio).toBe(1.2);
    expect(result.score).toBeGreaterThanOrEqual(85);
    expect(result.feedback).toContain("Acceptable");
  });

  it("scores over budget with lower score", () => {
    // 1800 tokens when 1000 expected = 1.8x
    const result = scoreTokenEfficiency(1800, 1000);
    expect(result.ratio).toBe(1.8);
    expect(result.score).toBeLessThan(85);
    expect(result.feedback).toContain("Over budget");
  });

  it("scores significantly over budget with low score", () => {
    // 2500 tokens when 1000 expected = 2.5x
    const result = scoreTokenEfficiency(2500, 1000);
    expect(result.ratio).toBe(2.5);
    expect(result.score).toBeLessThan(55);
    expect(result.feedback).toContain("Significantly over");
  });
});

// ============================================================================
// REDUNDANT CALL DETECTION TESTS
// ============================================================================

describe("detectRedundantCalls", () => {
  it("detects duplicate canvas_read calls", () => {
    const toolCalls: ToolCallRecord[] = [
      { tool: "canvas_read", args: { format: "json" }, duration: 100, timestamp: 1000 },
      { tool: "canvas_write", args: { elements: [] }, duration: 150, timestamp: 1100 },
      { tool: "canvas_read", args: { format: "json" }, duration: 100, timestamp: 1200 },
    ];

    const redundant = detectRedundantCalls(toolCalls);
    expect(redundant.length).toBe(1);
    expect(redundant[0].tool).toBe("canvas_read");
    expect(redundant[0].firstCallIndex).toBe(0);
    expect(redundant[0].redundantCallIndex).toBe(2);
    // Exact duplicate is detected as "Duplicate call" (similarity >= 0.99)
    expect(redundant[0].reason).toContain("Duplicate call");
  });

  it("detects exact duplicate calls", () => {
    const toolCalls: ToolCallRecord[] = [
      { tool: "canvas_find", args: { match: { type: "rectangle" } }, duration: 100, timestamp: 1000 },
      { tool: "canvas_find", args: { match: { type: "rectangle" } }, duration: 100, timestamp: 1100 },
    ];

    const redundant = detectRedundantCalls(toolCalls);
    expect(redundant.length).toBe(1);
    expect(redundant[0].argsSimilarity).toBeGreaterThanOrEqual(0.99);
  });

  it("does not flag different operations as redundant", () => {
    const toolCalls: ToolCallRecord[] = [
      { tool: "canvas_read", args: { format: "json" }, duration: 100, timestamp: 1000 },
      { tool: "canvas_read", args: { format: "summary" }, duration: 100, timestamp: 1100 },
    ];

    const redundant = detectRedundantCalls(toolCalls);
    expect(redundant.length).toBe(0);
  });

  it("handles empty tool calls", () => {
    const redundant = detectRedundantCalls([]);
    expect(redundant.length).toBe(0);
  });
});

// ============================================================================
// EXECUTION PATH ANALYSIS TESTS
// ============================================================================

describe("analyzeExecutionPath", () => {
  it("identifies matching path", () => {
    const toolCalls: ToolCallRecord[] = [
      { tool: "canvas_read", args: {}, duration: 100, timestamp: 1000 },
      { tool: "canvas_write", args: {}, duration: 100, timestamp: 1100 },
    ];

    const result = analyzeExecutionPath(toolCalls, ["canvas_read", "canvas_write"]);
    expect(result.deviationScore).toBe(0);
    expect(result.analysis).toContain("matches expected");
  });

  it("identifies missing tools", () => {
    const toolCalls: ToolCallRecord[] = [
      { tool: "canvas_write", args: {}, duration: 100, timestamp: 1000 },
    ];

    const result = analyzeExecutionPath(toolCalls, ["canvas_read", "canvas_write"]);
    expect(result.analysis).toContain("Missing");
    expect(result.analysis).toContain("canvas_read");
  });

  it("identifies extra tools", () => {
    const toolCalls: ToolCallRecord[] = [
      { tool: "canvas_read", args: {}, duration: 100, timestamp: 1000 },
      { tool: "canvas_find", args: {}, duration: 100, timestamp: 1100 },
      { tool: "canvas_write", args: {}, duration: 100, timestamp: 1200 },
    ];

    const result = analyzeExecutionPath(toolCalls, ["canvas_read", "canvas_write"]);
    expect(result.analysis).toContain("Extra");
    expect(result.analysis).toContain("canvas_find");
  });

  it("handles no expected path", () => {
    const toolCalls: ToolCallRecord[] = [
      { tool: "canvas_read", args: {}, duration: 100, timestamp: 1000 },
    ];

    const result = analyzeExecutionPath(toolCalls, undefined);
    expect(result.deviationScore).toBe(0);
    expect(result.analysis).toBe("No expected path defined");
  });
});

// ============================================================================
// INTEGRATED EFFICIENCY SCORING TESTS
// ============================================================================

describe("scoreEfficiency", () => {
  it("calculates efficiency with expectedEfficiency config", () => {
    const toolCalls: ToolCallRecord[] = [
      { tool: "canvas_write", args: { elements: [] }, duration: 100, timestamp: 1000 },
    ];

    const result = scoreEfficiency(
      1000, // tokens
      1,    // tool calls
      1,    // iterations
      500,  // duration
      "simple",
      toolCalls,
      { optimalSteps: 1, optimalTokens: 1000 }
    );

    expect(result.stepEfficiencyRatio).toBe(1);
    expect(result.tokenEfficiencyRatio).toBe(1);
    expect(result.stepEfficiencyFeedback).toContain("Optimal");
    expect(result.tokenEfficiencyFeedback).toContain("Under budget");
    expect(result.redundantCallCount).toBe(0);
    expect(result.score).toBeGreaterThanOrEqual(90);
  });

  it("penalizes redundant calls", () => {
    const toolCalls: ToolCallRecord[] = [
      { tool: "canvas_read", args: { format: "json" }, duration: 100, timestamp: 1000 },
      { tool: "canvas_read", args: { format: "json" }, duration: 100, timestamp: 1100 },
      { tool: "canvas_write", args: { elements: [] }, duration: 100, timestamp: 1200 },
    ];

    const result = scoreEfficiency(
      1500,
      3,
      3,
      500,
      "simple",
      toolCalls,
      { optimalSteps: 2, optimalTokens: 1000 }
    );

    expect(result.redundantCallCount).toBe(1);
    expect(result.redundantCalls).toBeDefined();
    expect(result.redundantCalls?.length).toBe(1);
  });

  it("falls back to complexity-based defaults", () => {
    const result = scoreEfficiency(
      3000,
      6,
      6,
      30000,
      "moderate"
    );

    // Should use moderate defaults: 3000 tokens, 6 tools
    expect(result.optimalSteps).toBe(6);
    expect(result.expectedTokens).toBe(3000);
    expect(result.stepEfficiencyRatio).toBe(1);
    expect(result.tokenEfficiencyRatio).toBe(1);
  });
});

// ============================================================================
// DEBUG LOGGER TESTS
// ============================================================================

describe("BenchmarkDebugLogger", () => {
  const testLogDir = ".benchmark-results/test-logs";
  let logger: BenchmarkDebugLogger;
  let logPath: string;

  beforeEach(() => {
    logger = new BenchmarkDebugLogger("test-run-123", "test-scenario-001", {
      logDir: testLogDir,
    });
    logPath = logger.getLogPath();
  });

  afterEach(() => {
    // Cleanup test log file
    if (existsSync(logPath)) {
      unlinkSync(logPath);
    }
  });

  it("creates log file on first write", () => {
    logger.log("info", "Test message");
    expect(existsSync(logPath)).toBe(true);
  });

  it("logs events with correct structure", () => {
    logger.logEvent({
      type: "tool_call",
      timestamp: Date.now(),
      tool: "canvas_read",
      data: { format: "json" },
    }, 500);

    const summary = logger.finalize();
    expect(summary.totalSteps).toBe(1);
    expect(summary.entryCount).toBeGreaterThanOrEqual(1);
  });

  it("logs tool calls with args and results", () => {
    const toolCall: ToolCallRecord = {
      tool: "canvas_write",
      args: { elements: [{ type: "rectangle" }] },
      result: { created: ["elem_1"] },
      duration: 150,
      timestamp: Date.now(),
    };

    logger.logToolCall(toolCall, 1, 800);
    const summary = logger.finalize();

    expect(summary.totalSteps).toBeGreaterThanOrEqual(1);
  });

  it("logs reasoning steps", () => {
    logger.logReasoning("analyze", "User wants to create a rectangle", 300);
    logger.logReasoning("plan", "Will use canvas_write to create", 500);

    const summary = logger.finalize();
    expect(summary.totalSteps).toBe(2);
  });

  it("tracks errors", () => {
    logger.log("error", "Something went wrong");
    const summary = logger.finalize();

    expect(summary.errorCount).toBe(1);
  });

  it("logs efficiency metrics", () => {
    logger.logEfficiency({
      stepEfficiencyRatio: 1.5,
      tokenEfficiencyRatio: 1.2,
      redundantCallCount: 0,
      pathDeviationScore: 0,
    });

    const summary = logger.finalize();
    expect(summary.entryCount).toBeGreaterThanOrEqual(1);
  });

  it("generates correct summary on finalize", () => {
    logger.log("info", "Start");
    logger.logReasoning("analyze", "Analysis");
    logger.logToolCall({
      tool: "canvas_write",
      args: {},
      duration: 100,
      timestamp: Date.now(),
    }, 1, 1000);
    logger.log("info", "End");

    const summary = logger.finalize();

    expect(summary.runId).toBe("test-run-123");
    expect(summary.scenarioId).toBe("test-scenario-001");
    expect(summary.entryCount).toBeGreaterThanOrEqual(4);
    expect(summary.totalTokens).toBe(1000);
    expect(summary.errorCount).toBe(0);
    expect(summary.startTime).toBeDefined();
    expect(summary.endTime).toBeDefined();
  });
});

// ============================================================================
// LOG READING AND FILTERING TESTS
// ============================================================================

describe("readDebugLog and filterLogEntries", () => {
  const testLogDir = ".benchmark-results/test-logs";
  let logger: BenchmarkDebugLogger;
  let logPath: string;

  beforeEach(() => {
    logger = new BenchmarkDebugLogger("test-read-run", "test-read-scenario", {
      logDir: testLogDir,
    });
    logPath = logger.getLogPath();

    // Write some test entries
    logger.log("info", "Info message");
    logger.log("debug", "Debug message");
    logger.log("error", "Error message");
    logger.logToolCall({
      tool: "canvas_read",
      args: {},
      duration: 100,
      timestamp: Date.now(),
    });
    logger.finalize();
  });

  afterEach(() => {
    if (existsSync(logPath)) {
      unlinkSync(logPath);
    }
  });

  it("reads log file correctly", () => {
    const { header, entries, footer } = readDebugLog(logPath);

    expect(header).toBeDefined();
    expect(header?.runId).toBe("test-read-run");
    expect(entries.length).toBeGreaterThanOrEqual(4);
    expect(footer).toBeDefined();
  });

  it("filters entries by level", () => {
    const { entries } = readDebugLog(logPath);

    const errorOnly = filterLogEntries(entries, { level: "error" });
    expect(errorOnly.length).toBe(1);
    expect(errorOnly[0].level).toBe("error");
  });

  it("filters entries by event type", () => {
    const { entries } = readDebugLog(logPath);

    const toolCalls = filterLogEntries(entries, { eventType: "tool_call" });
    expect(toolCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("filters entries with errors", () => {
    const { entries } = readDebugLog(logPath);

    const withErrors = filterLogEntries(entries, { hasError: true });
    expect(withErrors.length).toBe(1);
  });

  it("generates readable report", () => {
    const { entries } = readDebugLog(logPath);
    const summary = {
      runId: "test-read-run",
      scenarioId: "test-read-scenario",
      logPath,
      entryCount: entries.length,
      totalSteps: 4,
      totalTokens: 0,
      totalDurationMs: 100,
      errorCount: 1,
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
    };

    const report = generateDebugReport(entries, summary);

    expect(report).toContain("BENCHMARK DEBUG REPORT");
    expect(report).toContain("test-read-run");
    expect(report).toContain("EXECUTION TIMELINE");
    expect(report).toContain("SUMMARY BY EVENT TYPE");
  });
});
