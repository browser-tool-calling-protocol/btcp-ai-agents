/**
 * Reasoning Benchmark System
 *
 * A comprehensive benchmark framework for evaluating AI agent reasoning quality.
 * Enables systematic testing and optimization of prompts and reasoning patterns.
 *
 * ## Quick Start
 *
 * ```typescript
 * import { runSmokeTest, generateReport } from '@waiboard/ai-agents/benchmarks';
 *
 * // Run quick test
 * const result = await runSmokeTest('gemini-2.5-flash', 'google');
 * console.log(generateReport(result));
 * ```
 *
 * ## Full Benchmark
 *
 * ```typescript
 * import {
 *   BenchmarkRunner,
 *   defaultStorage,
 *   generateReport,
 *   analyzeTrends
 * } from '@waiboard/ai-agents/benchmarks';
 *
 * const runner = new BenchmarkRunner({
 *   model: 'gemini-2.5-flash',
 *   provider: 'google',
 *   categories: ['chat', 'simple_create', 'complex_create'],
 *   concurrency: 2,
 *   retries: 1,
 * });
 *
 * const run = await runner.runAll();
 *
 * // Save for tracking
 * await defaultStorage.saveRun(run);
 *
 * // Generate report
 * console.log(generateReport(run));
 *
 * // Analyze trends over time
 * const trends = await analyzeTrends(defaultStorage);
 * console.log(`Improving: ${trends.improving}`);
 * ```
 *
 * ## Comparing Runs
 *
 * ```typescript
 * const comparison = await defaultStorage.compareRuns(baseRunId, currentRunId);
 * console.log(generateComparisonReport(comparison));
 * ```
 *
 * @module benchmarks
 */

// Types
export type {
  // Core types
  ReasoningStepType,
  QualityDimension,
  TaskComplexity,
  TaskCategory,

  // Scenario types
  BenchmarkScenario,
  CanvasState,
  ExpectedBehavior,

  // Result types
  DimensionScore,
  ReasoningStepScore,
  ScenarioResult,
  ToolUsageScore,
  OutputScore,
  EfficiencyScore,
  Issue,
  AgentEventRecord,
  ToolCallRecord,

  // Redundancy detection types
  RedundantToolCall,

  // Run types
  BenchmarkConfig,
  BenchmarkRun,
  BenchmarkSummary,
  CategoryStats,
  ComplexityStats,

  // History types
  BenchmarkHistory,
  BenchmarkComparison,

  // Rubric types
  EvaluationRubric,
  RubricCriterion,
  CriterionCheck,

  // Debug log types
  DebugLogLevel,
  DebugLogEntry,
  DebugLogSummary,
} from "./types.js";

// Metrics
export {
  // Reasoning step scoring
  scoreAnalyzeStep,
  scoreAssessClarityStep,
  scorePlanStep,
  scoreObserveStep,
  scoreSummarizeStep,
  scoreReasoningStep,

  // Component scoring
  scoreToolUsage,
  scoreOutput,
  scoreEfficiency,

  // Efficiency metrics (new)
  scoreStepEfficiency,
  scoreTokenEfficiency,
  detectRedundantCalls,
  analyzeExecutionPath,

  // Analysis
  detectIssues,
  calculateOverallScore,
  generateRecommendations,
} from "./metrics.js";

// Scenarios - Core
export {
  // Scenario collections
  ALL_SCENARIOS,
  CHAT_SCENARIOS,
  QUERY_SCENARIOS,
  SIMPLE_CREATE_SCENARIOS,
  MODIFY_SCENARIOS,
  COMPLEX_CREATE_SCENARIOS,
  CLARIFICATION_SCENARIOS,
  DELEGATION_SCENARIOS,
  ERROR_RECOVERY_SCENARIOS,
  EFFICIENCY_SCENARIOS,
  CONDITIONAL_SCENARIOS,

  // Helpers
  getScenariosByCategory,
  getScenariosByComplexity,
  getScenariosByTags,
  getScenarioById,
  SCENARIO_SETS,
} from "./scenarios.js";

// Scenarios - TAOD Loop Reasoning
export {
  ALL_REASONING_SCENARIOS,
  ANALYZE_SCENARIOS,
  CLARITY_ASSESSMENT_SCENARIOS,
  PLANNING_SCENARIOS,
  OBSERVATION_SCENARIOS,
  DECISION_SCENARIOS,
  FULL_TAOD_SCENARIOS,
  REASONING_SCENARIO_SETS,
} from "./scenarios-reasoning.js";

// Scenarios - Semantic Routing
export {
  ALL_ROUTING_SCENARIOS,
  OUTPUT_TYPE_SCENARIOS,
  TOPIC_CLARITY_SCENARIOS,
  COMPLEXITY_ROUTING_SCENARIOS,
  ROUTING_EDGE_CASES,
  CONTEXT_SENSITIVITY_SCENARIOS,
  ROUTING_SCENARIO_SETS,
} from "./scenarios-routing.js";

// Scenarios - Edge Cases
export {
  ALL_EDGE_CASE_SCENARIOS,
  INPUT_BOUNDARY_SCENARIOS,
  CANVAS_STATE_SCENARIOS,
  CONFLICTING_INSTRUCTION_SCENARIOS,
  RESOURCE_CONSTRAINT_SCENARIOS,
  LANGUAGE_EDGE_CASES,
  RECOVERY_SCENARIOS,
  EDGE_CASE_SCENARIO_SETS,
} from "./scenarios-edge-cases.js";

// Scenarios - Regression Tests
export {
  ALL_REGRESSION_SCENARIOS,
  TOOL_SELECTION_REGRESSIONS,
  REASONING_QUALITY_REGRESSIONS,
  OUTPUT_QUALITY_REGRESSIONS,
  CLARIFICATION_REGRESSIONS,
  DELEGATION_REGRESSIONS,
  EFFICIENCY_REGRESSIONS,
  CONTEXT_HANDLING_REGRESSIONS,
  REGRESSION_SCENARIO_SETS,
  CRITICAL_REGRESSIONS,
} from "./scenarios-regression.js";

// Scenarios - Prompt Comparison
export {
  ALL_COMPARISON_SCENARIOS,
  ANALYZE_COMPARISON_SCENARIOS,
  CLARITY_COMPARISON_SCENARIOS,
  PLANNING_COMPARISON_SCENARIOS,
  TOOL_USAGE_COMPARISON_SCENARIOS,
  OUTPUT_COMPARISON_SCENARIOS,
  BASELINE_SCENARIOS,
  COMPARISON_SCENARIO_SETS,
  PROMPT_COMPARISON_WORKFLOW,
} from "./scenarios-prompt-comparison.js";

// Scorer
export {
  BenchmarkScorer,
  scorer,
  quickScoreToolUsage,
  quickScoreReasoning,
  quickScoreOutput,
  compareResults,
} from "./scorer.js";

// Runner
export {
  BenchmarkRunner,
  runSmokeTest,
  runCoreTests,
  runReasoningTests,
  runFullBenchmark,
  generateReport,
  generateJsonReport,
  type RunnerOptions,
  type MockCanvasDriver,
} from "./runner.js";

// Storage
export {
  type BenchmarkStorage,
  FileBenchmarkStorage,
  MemoryBenchmarkStorage,
  analyzeTrends,
  findProblemScenarios,
  generateComparisonReport,
  defaultStorage,
} from "./storage.js";

// Debug Logger
export {
  BenchmarkDebugLogger,
  BenchmarkLogReporter,
  createBenchmarkLogReporter,
  readDebugLog,
  filterLogEntries,
  generateDebugReport,
  DEFAULT_LOG_DIR,
} from "./debug-logger.js";

// Debug View (Conversation Flow Visualization)
export {
  type ParsedReasoningStep,
  type DebugToolExecution,
  type DebugTurn,
  type DebugSession,
  type TickerEvent,
  formatTickerEvent,
  createTickerEventFromAgentEvent,
  parseReasoningContent,
  extractTurns,
  buildDebugSession,
  generateDebugView,
  generateTickerSummary,
  LiveDebugReporter,
  DEBUG_VIEW_WIDTH,
  REASONING_ICONS,
} from "./debug-view.js";

// Enhanced Report Formats
export {
  type OutputFormat,
  type ReportOptions,
  type MultiModelComparisonResult,
  generateConsoleReport,
  generateMarkdownReport,
  generateCsvReport,
  generateEnhancedComparisonReport,
  generateMultiModelReport,
  generateBenchmarkReport,
} from "./report-format.js";

// Multi-Configuration Runner
export {
  type ModelConfig,
  type AgentVersion,
  type MultiConfigBenchmarkOptions,
  type MultiConfigBenchmarkResult,
  MODELS,
  MODEL_GROUPS,
  MultiConfigBenchmarkRunner,
  compareModelsQuick,
  compareModelsFull,
  abTestPromptVersions,
} from "./multi-config-runner.js";
