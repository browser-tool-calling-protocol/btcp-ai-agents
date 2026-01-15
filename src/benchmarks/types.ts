/**
 * Reasoning Benchmark Types
 *
 * Defines types for evaluating and benchmarking AI agent reasoning quality.
 * Inspired by Claude Code's approach to structured reasoning evaluation.
 */

// ============================================================================
// CORE BENCHMARK TYPES
// ============================================================================

/**
 * Reasoning step types that can be evaluated
 */
export type ReasoningStepType =
  | "analyze" // Initial task analysis
  | "assess_clarity" // Clarity assessment (semantic routing)
  | "plan" // Execution planning
  | "execute" // Execution tracking
  | "observe" // Tool result observation
  | "decide" // Decision reasoning
  | "summarize"; // Task summary

/**
 * Quality dimensions for reasoning evaluation
 */
export type QualityDimension =
  | "accuracy" // Correctness of reasoning
  | "completeness" // Coverage of relevant aspects
  | "clarity" // Clear, understandable output
  | "efficiency" // Token/tool efficiency
  | "relevance" // Alignment with task
  | "actionability"; // Leads to appropriate action

/**
 * Task complexity levels
 */
export type TaskComplexity = "trivial" | "simple" | "moderate" | "complex" | "expert";

/**
 * Task categories for benchmarking
 */
export type TaskCategory =
  | "chat" // Pure conversation, no tools
  | "query" // Canvas queries, exploration
  | "simple_create" // 1-2 tool calls
  | "complex_create" // Multi-step creation
  | "modify" // Edit existing elements
  | "layout" // Arrangement/layout
  | "style" // Styling operations
  | "diagram" // Diagram creation
  | "delegation" // Sub-agent delegation
  | "clarification" // Ambiguous requests
  | "error_recovery"; // Error handling

// ============================================================================
// BENCHMARK SCENARIO
// ============================================================================

/**
 * A benchmark scenario defines a test case with expected behavior
 */
export interface BenchmarkScenario {
  /** Unique scenario ID */
  id: string;

  /** Human-readable name */
  name: string;

  /** Description of what's being tested */
  description: string;

  /** Category of the task */
  category: TaskCategory;

  /** Complexity level */
  complexity: TaskComplexity;

  /** The user input prompt */
  prompt: string;

  /** Initial canvas state (optional) */
  initialCanvasState?: CanvasState;

  /** Expected behavior specification */
  expected: ExpectedBehavior;

  /** Optional context for evaluation */
  context?: Record<string, unknown>;

  /** Tags for filtering scenarios */
  tags?: string[];

  /** Timeout in milliseconds */
  timeout?: number;

  /** Custom scoring weights for prompt comparison (0-1 weights, should sum to 1) */
  scoringWeights?: {
    reasoning?: number;
    toolUsage?: number;
    output?: number;
    efficiency?: number;
  };
}

/**
 * Canvas state for scenario setup
 */
export interface CanvasState {
  elements: Array<{
    id: string;
    type: string;
    x: number;
    y: number;
    width?: number;
    height?: number;
    text?: string;
    name?: string;
    backgroundColor?: string;
    [key: string]: unknown;
  }>;
}

/**
 * Expected behavior specification
 */
export interface ExpectedBehavior {
  /** Should use tools at all? */
  shouldUseTool: boolean;

  /** Expected tool calls (order matters if ordered is true) */
  expectedTools?: {
    tools: string[];
    ordered?: boolean;
    minCalls?: number;
    maxCalls?: number;
  };

  /** Expected reasoning tags present */
  expectedReasoning?: {
    requiredTags?: ReasoningStepType[];
    optionalTags?: ReasoningStepType[];
  };

  /** Expected clarity assessment (for semantic routing) */
  expectedClarity?: {
    outputType?: string;
    topicClarity?: "specific" | "vague" | "missing";
    complexity?: "simple" | "single" | "multi-section";
    decision?: "clarify" | "delegate" | "execute";
  };

  /** Expected delegation behavior */
  expectedDelegation?: {
    shouldDelegate: boolean;
    subagent?: string;
    skill?: string;
  };

  /** Expected output characteristics */
  expectedOutput?: {
    shouldHaveUserContent: boolean;
    containsPatterns?: string[];
    notContainsPatterns?: string[];
    mentionsCreatedElements?: boolean;
  };

  /** Expected canvas modifications */
  expectedCanvasChanges?: {
    elementsCreated?: {
      minCount?: number;
      maxCount?: number;
      types?: string[];
    };
    elementsModified?: number;
    elementsDeleted?: number;
  };

  /** Expected efficiency metrics for evaluating optimal path */
  expectedEfficiency?: {
    /** Minimum number of steps to solve this task optimally */
    optimalSteps: number;
    /** Expected token budget for this task */
    optimalTokens: number;
    /** Allowed overhead multiplier (e.g., 1.5 = allow 50% more steps) */
    allowedStepOverhead?: number;
    /** Allowed token overhead multiplier */
    allowedTokenOverhead?: number;
  };

  /** Custom validation function (serialized for storage) */
  customValidation?: string;
}

// ============================================================================
// EVALUATION RESULTS
// ============================================================================

/**
 * Score for a single quality dimension (0-100)
 */
export interface DimensionScore {
  dimension: QualityDimension;
  score: number;
  maxScore: number;
  details?: string;
  issues?: string[];
}

/**
 * Score for a reasoning step
 */
export interface ReasoningStepScore {
  stepType: ReasoningStepType;
  present: boolean;
  content?: string;
  scores: DimensionScore[];
  overallScore: number;
  feedback?: string;
}

/**
 * Full evaluation result for a scenario run
 */
export interface ScenarioResult {
  /** Scenario that was run */
  scenarioId: string;
  scenarioName: string;

  /** Run metadata */
  runId: string;
  timestamp: number;
  duration: number;

  /** Model/provider info */
  model: string;
  provider: string;
  promptVersion?: string;

  /** Pass/fail status */
  passed: boolean;

  /** Overall score (0-100) */
  overallScore: number;

  /** Individual component scores */
  scores: {
    reasoning: ReasoningStepScore[];
    toolUsage: ToolUsageScore;
    output: OutputScore;
    efficiency: EfficiencyScore;
  };

  /** Issues found */
  issues: Issue[];

  /** Recommendations for improvement */
  recommendations: string[];

  /** Raw data for debugging */
  rawData: {
    events: AgentEventRecord[];
    finalOutput?: string;
    toolCalls: ToolCallRecord[];
    reasoning: Record<string, string | null>;
    canvasState?: CanvasState;
  };
}

/**
 * Tool usage scoring
 */
export interface ToolUsageScore {
  score: number;
  correctTools: boolean;
  correctOrder: boolean;
  callCount: number;
  expectedMinCalls?: number;
  expectedMaxCalls?: number;
  toolsUsed: string[];
  unexpectedTools: string[];
  missingTools: string[];
}

/**
 * Output quality scoring
 */
export interface OutputScore {
  score: number;
  hasUserContent: boolean;
  patternsMatched: string[];
  patternsMissed: string[];
  forbiddenPatterns: string[];
}

/**
 * Efficiency scoring with step and token efficiency ratios
 */
export interface EfficiencyScore {
  /** Overall efficiency score (0-100) */
  score: number;
  /** Total tokens consumed */
  tokenCount: number;
  /** Number of tool calls made */
  toolCallCount: number;
  /** Number of agent iterations */
  iterationCount: number;
  /** Total duration in milliseconds */
  durationMs: number;
  /** Average tokens per tool operation */
  tokensPerOperation?: number;

  // Step efficiency metrics
  /** Ratio of actual steps to optimal steps (1.0 = optimal, >1 = inefficient) */
  stepEfficiencyRatio?: number;
  /** Optimal number of steps for this task */
  optimalSteps?: number;
  /** Feedback on step efficiency */
  stepEfficiencyFeedback?: string;

  // Token efficiency metrics
  /** Ratio of actual tokens to expected tokens (1.0 = on budget, >1 = over budget) */
  tokenEfficiencyRatio?: number;
  /** Expected token budget for this task */
  expectedTokens?: number;
  /** Feedback on token efficiency */
  tokenEfficiencyFeedback?: string;

  // Redundancy detection
  /** Tools that were called redundantly (same tool, same/similar args) */
  redundantCalls?: RedundantToolCall[];
  /** Number of redundant calls detected */
  redundantCallCount?: number;

  // Path analysis
  /** How far the agent deviated from the optimal path (0 = optimal) */
  pathDeviationScore?: number;
  /** Description of path inefficiencies */
  pathAnalysis?: string;
}

/**
 * Represents a redundant tool call
 */
export interface RedundantToolCall {
  /** The tool that was called redundantly */
  tool: string;
  /** Index of the first call */
  firstCallIndex: number;
  /** Index of the redundant call */
  redundantCallIndex: number;
  /** Similarity score between args (0-1) */
  argsSimilarity: number;
  /** Reason why this is considered redundant */
  reason: string;
}

/**
 * Issue found during evaluation
 */
export interface Issue {
  severity: "critical" | "major" | "minor" | "info";
  category: "reasoning" | "tool_usage" | "output" | "efficiency" | "behavior";
  message: string;
  details?: string;
  location?: string;
}

/**
 * Agent event for tracking
 */
export interface AgentEventRecord {
  type: string;
  timestamp: number;
  tool?: string;
  content?: string;
  data?: Record<string, unknown>;
}

/**
 * Tool call record
 */
export interface ToolCallRecord {
  tool: string;
  args: Record<string, unknown>;
  result?: unknown;
  duration: number;
  timestamp: number;
  error?: string;
}

// ============================================================================
// BENCHMARK RUN
// ============================================================================

/**
 * Benchmark run configuration
 */
export interface BenchmarkConfig {
  /** Scenarios to run (empty = all) */
  scenarios?: string[];

  /** Categories to include */
  categories?: TaskCategory[];

  /** Complexity levels to include */
  complexities?: TaskComplexity[];

  /** Tags to filter by */
  tags?: string[];

  /** Model to test */
  model: string;

  /** Provider */
  provider: "google" | "openai" | "anthropic";

  /** Prompt version */
  promptVersion?: "v1" | "v2";

  /** Max concurrent runs */
  concurrency?: number;

  /** Retry failed scenarios */
  retries?: number;

  /** Store results */
  storeResults?: boolean;

  /** Verbose logging */
  verbose?: boolean;
}

/**
 * Full benchmark run result
 */
export interface BenchmarkRun {
  /** Run ID */
  runId: string;

  /** Timestamp */
  timestamp: number;

  /** Configuration used */
  config: BenchmarkConfig;

  /** Individual scenario results */
  results: ScenarioResult[];

  /** Aggregate statistics */
  summary: BenchmarkSummary;
}

/**
 * Aggregate benchmark statistics
 */
export interface BenchmarkSummary {
  /** Total scenarios run */
  totalScenarios: number;

  /** Passed scenarios */
  passedScenarios: number;

  /** Failed scenarios */
  failedScenarios: number;

  /** Pass rate percentage */
  passRate: number;

  /** Average overall score */
  averageScore: number;

  /** Score by category */
  scoresByCategory: Record<TaskCategory, CategoryStats>;

  /** Score by complexity */
  scoresByComplexity: Record<TaskComplexity, ComplexityStats>;

  /** Common issues */
  commonIssues: Array<{
    message: string;
    count: number;
    severity: string;
  }>;

  /** Total duration */
  totalDuration: number;

  /** Token usage */
  totalTokens: number;
}

/**
 * Category-level statistics
 */
export interface CategoryStats {
  count: number;
  passed: number;
  averageScore: number;
  averageDuration: number;
}

/**
 * Complexity-level statistics
 */
export interface ComplexityStats {
  count: number;
  passed: number;
  averageScore: number;
  averageDuration: number;
}

// ============================================================================
// HISTORY & COMPARISON
// ============================================================================

/**
 * Historical benchmark data for tracking improvement
 */
export interface BenchmarkHistory {
  runs: Array<{
    runId: string;
    timestamp: number;
    model: string;
    promptVersion?: string;
    summary: BenchmarkSummary;
  }>;
}

/**
 * Comparison between two benchmark runs
 */
export interface BenchmarkComparison {
  baseRun: string;
  compareRun: string;

  /** Overall improvement/regression */
  scoreDelta: number;
  passRateDelta: number;

  /** Improved scenarios */
  improved: string[];

  /** Regressed scenarios */
  regressed: string[];

  /** Unchanged scenarios */
  unchanged: string[];

  /** Category-level changes */
  categoryDeltas: Record<TaskCategory, number>;

  /** Complexity-level changes */
  complexityDeltas: Record<TaskComplexity, number>;
}

// ============================================================================
// RUBRIC SYSTEM
// ============================================================================

/**
 * Rubric for evaluating a specific aspect
 */
export interface EvaluationRubric {
  id: string;
  name: string;
  description: string;

  /** What reasoning step/aspect this evaluates */
  target: ReasoningStepType | "overall" | "tool_usage" | "output";

  /** Scoring criteria */
  criteria: RubricCriterion[];

  /** Maximum possible score */
  maxScore: number;
}

/**
 * Single criterion in a rubric
 */
export interface RubricCriterion {
  id: string;
  description: string;
  points: number;
  check: CriterionCheck;
}

/**
 * How to check a criterion
 */
export type CriterionCheck =
  | { type: "present"; tag: ReasoningStepType }
  | { type: "contains"; patterns: string[] }
  | { type: "notContains"; patterns: string[] }
  | { type: "length"; min?: number; max?: number }
  | { type: "toolCount"; min?: number; max?: number }
  | { type: "toolPresent"; tools: string[] }
  | { type: "custom"; fn: string };

// ============================================================================
// DEBUG LOGGING TYPES
// ============================================================================

/**
 * Log level for debug entries
 */
export type DebugLogLevel = "trace" | "debug" | "info" | "warn" | "error";

/**
 * A single debug log entry
 */
export interface DebugLogEntry {
  /** ISO timestamp */
  timestamp: string;
  /** Log level */
  level: DebugLogLevel;
  /** Event type from agent loop */
  eventType: string;
  /** Scenario ID being executed */
  scenarioId: string;
  /** Run ID for correlation */
  runId: string;
  /** Step number in the execution */
  stepNumber: number;
  /** Tool being called (if applicable) */
  tool?: string;
  /** Tool arguments (if applicable) */
  toolArgs?: Record<string, unknown>;
  /** Tool result summary (if applicable) */
  toolResult?: string;
  /** Reasoning content (truncated) */
  reasoning?: string;
  /** Token count at this point */
  tokenCount?: number;
  /** Token delta from previous step */
  tokenDelta?: number;
  /** Duration of this step in ms */
  durationMs?: number;
  /** Any error that occurred */
  error?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Summary of a debug log file
 */
export interface DebugLogSummary {
  /** Run ID */
  runId: string;
  /** Scenario ID */
  scenarioId: string;
  /** Log file path */
  logPath: string;
  /** Total entries */
  entryCount: number;
  /** Total steps */
  totalSteps: number;
  /** Total tokens consumed */
  totalTokens: number;
  /** Total duration */
  totalDurationMs: number;
  /** Errors encountered */
  errorCount: number;
  /** Start timestamp */
  startTime: string;
  /** End timestamp */
  endTime: string;
}
