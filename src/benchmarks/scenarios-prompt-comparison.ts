/**
 * Prompt Version Comparison Suite
 *
 * Scenarios designed for A/B testing different prompt versions.
 * Each scenario has clear, measurable outcomes for comparison.
 *
 * Usage:
 * - Run same scenarios with different prompt versions
 * - Compare scores across versions
 * - Track improvements/regressions per prompt change
 */

import type { BenchmarkScenario } from "./types.js";

// ============================================================================
// ANALYZE STEP COMPARISON
// Tests quality of task understanding and decomposition
// ============================================================================

export const ANALYZE_COMPARISON_SCENARIOS: BenchmarkScenario[] = [
  {
    id: "compare-analyze-001",
    name: "Implicit Requirements Extraction",
    description: "Measures ability to identify implicit requirements",
    category: "complex_create",
    complexity: "moderate",
    prompt: "Create a professional-looking dashboard header",
    expected: {
      shouldUseTool: true,
      expectedReasoning: {
        requiredTags: ["analyze"],
        // Quality measured by: identifies need for branding, sizing, positioning
      },
      expectedOutput: {
        shouldHaveUserContent: true,
      },
    },
    scoringWeights: {
      reasoning: 0.4, // Heavy weight on analysis quality
      toolUsage: 0.2,
      output: 0.2,
      efficiency: 0.2,
    },
    tags: ["comparison", "analyze", "implicit-reqs"],
    timeout: 90000,
  },
  {
    id: "compare-analyze-002",
    name: "Domain Knowledge Application",
    description: "Measures application of domain knowledge",
    category: "complex_create",
    complexity: "moderate",
    prompt: "Create an entity-relationship diagram for an e-commerce system",
    expected: {
      shouldUseTool: true,
      expectedReasoning: {
        requiredTags: ["analyze", "plan"],
        // Quality measured by: identifies standard entities (User, Product, Order, etc.)
      },
    },
    scoringWeights: {
      reasoning: 0.5,
      toolUsage: 0.2,
      output: 0.2,
      efficiency: 0.1,
    },
    tags: ["comparison", "analyze", "domain-knowledge"],
    timeout: 120000,
  },
  {
    id: "compare-analyze-003",
    name: "Constraint Recognition",
    description: "Measures recognition of implicit constraints",
    category: "complex_create",
    complexity: "moderate",
    prompt: "Create a mobile app wireframe for a login screen",
    expected: {
      shouldUseTool: true,
      expectedReasoning: {
        requiredTags: ["analyze"],
        // Quality measured by: recognizes mobile constraints (portrait, touch targets, etc.)
      },
    },
    scoringWeights: {
      reasoning: 0.4,
      toolUsage: 0.2,
      output: 0.3,
      efficiency: 0.1,
    },
    tags: ["comparison", "analyze", "constraints"],
    timeout: 90000,
  },
];

// ============================================================================
// CLARITY ASSESSMENT COMPARISON
// Tests accuracy of request clarity classification
// ============================================================================

export const CLARITY_COMPARISON_SCENARIOS: BenchmarkScenario[] = [
  {
    id: "compare-clarity-001",
    name: "Clear vs Vague Discrimination",
    description: "Measures accuracy in distinguishing clear from vague requests",
    category: "complex_create",
    complexity: "moderate",
    prompt: "Create a mindmap about sustainable energy with solar, wind, and hydro branches",
    expected: {
      shouldUseTool: true,
      expectedClarity: {
        outputType: "mindmap",
        topicClarity: "specific",
        decision: "execute", // Should NOT clarify
      },
      expectedOutput: {
        shouldHaveUserContent: true,
        notContainsPatterns: ["what type|which kind|clarify|would you"],
      },
    },
    scoringWeights: {
      reasoning: 0.3,
      toolUsage: 0.2,
      output: 0.3,
      efficiency: 0.2,
    },
    tags: ["comparison", "clarity", "discrimination"],
    timeout: 90000,
  },
  {
    id: "compare-clarity-002",
    name: "Helpful Clarification Quality",
    description: "Measures quality of clarification questions",
    category: "clarification",
    complexity: "simple",
    prompt: "Create a visualization",
    expected: {
      shouldUseTool: false,
      expectedClarity: {
        decision: "clarify",
      },
      expectedOutput: {
        shouldHaveUserContent: true,
        // Quality measured by: offers specific options, not generic "what?"
        containsPatterns: ["flowchart|mindmap|diagram|chart|would you like"],
      },
    },
    scoringWeights: {
      reasoning: 0.3,
      toolUsage: 0.1,
      output: 0.5, // Heavy weight on clarification quality
      efficiency: 0.1,
    },
    tags: ["comparison", "clarity", "question-quality"],
    timeout: 45000,
  },
  {
    id: "compare-clarity-003",
    name: "Context-Based Inference",
    description: "Measures ability to infer from context instead of asking",
    category: "modify",
    complexity: "moderate",
    prompt: "Make it look better",
    initialCanvasState: {
      elements: [
        { id: "frame", type: "frame", x: 0, y: 0, width: 400, height: 300, name: "Wireframe" },
        { id: "header", type: "rectangle", x: 10, y: 10, width: 380, height: 50, name: "Header" },
        { id: "sidebar", type: "rectangle", x: 10, y: 70, width: 100, height: 220, name: "Sidebar" },
        { id: "content", type: "rectangle", x: 120, y: 70, width: 270, height: 220, name: "Content" },
      ],
    },
    expected: {
      shouldUseTool: true, // Should infer and improve
      expectedTools: {
        tools: ["canvas_read", "canvas_edit"],
        ordered: false,
      },
      // Quality measured by: makes reasonable improvements vs asking
    },
    scoringWeights: {
      reasoning: 0.4,
      toolUsage: 0.2,
      output: 0.3,
      efficiency: 0.1,
    },
    tags: ["comparison", "clarity", "inference"],
    timeout: 90000,
  },
];

// ============================================================================
// PLANNING COMPARISON
// Tests quality of execution planning
// ============================================================================

export const PLANNING_COMPARISON_SCENARIOS: BenchmarkScenario[] = [
  {
    id: "compare-plan-001",
    name: "Step Ordering Quality",
    description: "Measures logical ordering of execution steps",
    category: "complex_create",
    complexity: "moderate",
    prompt: "Create a flowchart with Start, two parallel processes A and B, a merge point, and End",
    expected: {
      shouldUseTool: true,
      expectedReasoning: {
        requiredTags: ["plan"],
        // Quality measured by: correct dependency ordering (start before processes, merge after both)
      },
    },
    scoringWeights: {
      reasoning: 0.4,
      toolUsage: 0.2,
      output: 0.2,
      efficiency: 0.2,
    },
    tags: ["comparison", "plan", "ordering"],
    timeout: 90000,
  },
  {
    id: "compare-plan-002",
    name: "Completeness of Plan",
    description: "Measures whether plan covers all requirements",
    category: "complex_create",
    complexity: "complex",
    prompt: "Create a kanban board with: To Do, In Progress, Review, Done columns. Add 2 cards to To Do, 1 to In Progress",
    expected: {
      shouldUseTool: true,
      expectedReasoning: {
        requiredTags: ["analyze", "plan"],
        // Quality measured by: plan covers all 4 columns + all 3 cards
      },
      expectedCanvasChanges: {
        elementsCreated: {
          minCount: 7, // 4 columns + 3 cards
        },
      },
    },
    scoringWeights: {
      reasoning: 0.3,
      toolUsage: 0.2,
      output: 0.3,
      efficiency: 0.2,
    },
    tags: ["comparison", "plan", "completeness"],
    timeout: 120000,
  },
  {
    id: "compare-plan-003",
    name: "Plan Adaptation to Context",
    description: "Measures plan adaptation to existing canvas state",
    category: "modify",
    complexity: "moderate",
    prompt: "Add error handling paths to this flowchart",
    initialCanvasState: {
      elements: [
        { id: "start", type: "ellipse", x: 200, y: 50, width: 100, height: 60, text: "Start" },
        { id: "process", type: "rectangle", x: 175, y: 150, width: 150, height: 80, text: "Process" },
        { id: "end", type: "ellipse", x: 200, y: 280, width: 100, height: 60, text: "End" },
        { id: "arrow1", type: "arrow", x: 200, y: 100, width: 0, height: 50, startId: "start", endId: "process" },
        { id: "arrow2", type: "arrow", x: 200, y: 230, width: 0, height: 50, startId: "process", endId: "end" },
      ],
    },
    expected: {
      shouldUseTool: true,
      expectedTools: {
        tools: ["canvas_read", "canvas_write"],
        ordered: true,
      },
      expectedReasoning: {
        requiredTags: ["analyze", "plan"],
        // Quality measured by: plan integrates with existing structure
      },
    },
    scoringWeights: {
      reasoning: 0.4,
      toolUsage: 0.2,
      output: 0.2,
      efficiency: 0.2,
    },
    tags: ["comparison", "plan", "adaptation"],
    timeout: 90000,
  },
];

// ============================================================================
// TOOL USAGE COMPARISON
// Tests efficiency and correctness of tool selection
// ============================================================================

export const TOOL_USAGE_COMPARISON_SCENARIOS: BenchmarkScenario[] = [
  {
    id: "compare-tool-001",
    name: "Minimal Tool Calls",
    description: "Measures efficiency in minimizing tool calls",
    category: "simple_create",
    complexity: "simple",
    prompt: "Create three rectangles: red at 0,0; green at 100,0; blue at 200,0",
    expected: {
      shouldUseTool: true,
      expectedTools: {
        tools: ["canvas_write"],
        minCalls: 1,
        maxCalls: 1, // Optimal is single batched call
      },
      expectedCanvasChanges: {
        elementsCreated: {
          minCount: 3,
          maxCount: 3,
        },
      },
    },
    scoringWeights: {
      reasoning: 0.1,
      toolUsage: 0.5, // Heavy weight on efficiency
      output: 0.2,
      efficiency: 0.2,
    },
    tags: ["comparison", "tool", "efficiency"],
    timeout: 45000,
  },
  {
    id: "compare-tool-002",
    name: "Correct Tool Selection",
    description: "Measures accuracy of tool selection for task",
    category: "query",
    complexity: "simple",
    prompt: "Tell me about the elements on the canvas without making any changes",
    initialCanvasState: {
      elements: [
        { id: "el1", type: "rectangle", x: 100, y: 100, width: 100, height: 100 },
        { id: "el2", type: "text", x: 250, y: 100, text: "Hello" },
      ],
    },
    expected: {
      shouldUseTool: true,
      expectedTools: {
        tools: ["canvas_read"], // ONLY read, no write/edit
        maxCalls: 2,
      },
      expectedCanvasChanges: {
        elementsCreated: { minCount: 0, maxCount: 0 },
        elementsDeleted: 0,
      },
    },
    scoringWeights: {
      reasoning: 0.2,
      toolUsage: 0.5, // Heavy weight on correct selection
      output: 0.2,
      efficiency: 0.1,
    },
    tags: ["comparison", "tool", "selection"],
    timeout: 45000,
  },
  {
    id: "compare-tool-003",
    name: "Tool Parameter Accuracy",
    description: "Measures accuracy of tool parameters",
    category: "simple_create",
    complexity: "simple",
    prompt: "Create a rectangle exactly at x=150, y=200 with width=300, height=100, and red background",
    expected: {
      shouldUseTool: true,
      expectedTools: {
        tools: ["canvas_write"],
      },
      // Quality measured by: parameters match request exactly
    },
    scoringWeights: {
      reasoning: 0.1,
      toolUsage: 0.5, // Heavy weight on parameter accuracy
      output: 0.2,
      efficiency: 0.2,
    },
    tags: ["comparison", "tool", "parameters"],
    timeout: 45000,
  },
];

// ============================================================================
// OUTPUT QUALITY COMPARISON
// Tests quality of user-facing communication
// ============================================================================

export const OUTPUT_COMPARISON_SCENARIOS: BenchmarkScenario[] = [
  {
    id: "compare-output-001",
    name: "Summary Completeness",
    description: "Measures completeness of action summary",
    category: "complex_create",
    complexity: "moderate",
    prompt: "Create a simple org chart with CEO, two VPs, and four managers",
    expected: {
      shouldUseTool: true,
      expectedOutput: {
        shouldHaveUserContent: true,
        // Quality measured by: mentions all created elements
        containsPatterns: ["CEO|org chart|VP|manager|created"],
      },
    },
    scoringWeights: {
      reasoning: 0.2,
      toolUsage: 0.2,
      output: 0.5, // Heavy weight on output quality
      efficiency: 0.1,
    },
    tags: ["comparison", "output", "completeness"],
    timeout: 120000,
  },
  {
    id: "compare-output-002",
    name: "Error Communication Clarity",
    description: "Measures clarity of error explanations",
    category: "error_recovery",
    complexity: "simple",
    prompt: "Move the element called 'missing-element-xyz' to position 500, 500",
    initialCanvasState: {
      elements: [
        { id: "el1", type: "rectangle", x: 100, y: 100, width: 100, height: 100, name: "actual-element" },
      ],
    },
    expected: {
      shouldUseTool: true,
      expectedOutput: {
        shouldHaveUserContent: true,
        // Quality measured by: clear explanation of what's wrong and what exists
        containsPatterns: ["not found|doesn't exist|no element|available"],
      },
    },
    scoringWeights: {
      reasoning: 0.2,
      toolUsage: 0.2,
      output: 0.5, // Heavy weight on error communication
      efficiency: 0.1,
    },
    tags: ["comparison", "output", "error-clarity"],
    timeout: 45000,
  },
  {
    id: "compare-output-003",
    name: "Helpful Suggestions",
    description: "Measures proactive helpfulness in responses",
    category: "simple_create",
    complexity: "simple",
    prompt: "Add a basic rectangle",
    expected: {
      shouldUseTool: true,
      expectedTools: {
        tools: ["canvas_write"],
      },
      expectedOutput: {
        shouldHaveUserContent: true,
        // Quality measured by: offers follow-up suggestions
      },
    },
    scoringWeights: {
      reasoning: 0.2,
      toolUsage: 0.2,
      output: 0.4,
      efficiency: 0.2,
    },
    tags: ["comparison", "output", "helpfulness"],
    timeout: 45000,
  },
];

// ============================================================================
// BASELINE SCENARIOS
// Standard scenarios for consistent comparison baseline
// ============================================================================

export const BASELINE_SCENARIOS: BenchmarkScenario[] = [
  {
    id: "baseline-001",
    name: "Simple Create Baseline",
    description: "Baseline for simple creation performance",
    category: "simple_create",
    complexity: "simple",
    prompt: "Create a blue rectangle",
    expected: {
      shouldUseTool: true,
      expectedTools: {
        tools: ["canvas_write"],
        minCalls: 1,
        maxCalls: 2,
      },
      expectedOutput: {
        shouldHaveUserContent: true,
      },
    },
    scoringWeights: {
      reasoning: 0.25,
      toolUsage: 0.25,
      output: 0.25,
      efficiency: 0.25,
    },
    tags: ["baseline", "simple-create"],
    timeout: 45000,
  },
  {
    id: "baseline-002",
    name: "Query Baseline",
    description: "Baseline for query performance",
    category: "query",
    complexity: "simple",
    prompt: "What's on the canvas?",
    initialCanvasState: {
      elements: [
        { id: "r1", type: "rectangle", x: 0, y: 0, width: 100, height: 100 },
        { id: "t1", type: "text", x: 150, y: 50, text: "Hello" },
      ],
    },
    expected: {
      shouldUseTool: true,
      expectedTools: {
        tools: ["canvas_read"],
      },
      expectedOutput: {
        shouldHaveUserContent: true,
        containsPatterns: ["rectangle|text|element"],
      },
    },
    scoringWeights: {
      reasoning: 0.25,
      toolUsage: 0.25,
      output: 0.25,
      efficiency: 0.25,
    },
    tags: ["baseline", "query"],
    timeout: 45000,
  },
  {
    id: "baseline-003",
    name: "Modify Baseline",
    description: "Baseline for modification performance",
    category: "modify",
    complexity: "simple",
    prompt: "Change the rectangle's color to red",
    initialCanvasState: {
      elements: [
        { id: "r1", type: "rectangle", x: 100, y: 100, width: 100, height: 100, backgroundColor: "#3b82f6" },
      ],
    },
    expected: {
      shouldUseTool: true,
      expectedTools: {
        tools: ["canvas_edit"],
      },
      expectedOutput: {
        shouldHaveUserContent: true,
        containsPatterns: ["changed|updated|red"],
      },
    },
    scoringWeights: {
      reasoning: 0.25,
      toolUsage: 0.25,
      output: 0.25,
      efficiency: 0.25,
    },
    tags: ["baseline", "modify"],
    timeout: 45000,
  },
  {
    id: "baseline-004",
    name: "Complex Create Baseline",
    description: "Baseline for complex creation performance",
    category: "complex_create",
    complexity: "moderate",
    prompt: "Create a simple flowchart: Start → Process → End",
    expected: {
      shouldUseTool: true,
      expectedReasoning: {
        requiredTags: ["analyze", "plan"],
      },
      expectedOutput: {
        shouldHaveUserContent: true,
        containsPatterns: ["flowchart|created|start|end"],
      },
    },
    scoringWeights: {
      reasoning: 0.25,
      toolUsage: 0.25,
      output: 0.25,
      efficiency: 0.25,
    },
    tags: ["baseline", "complex-create"],
    timeout: 90000,
  },
  {
    id: "baseline-005",
    name: "Clarification Baseline",
    description: "Baseline for clarification performance",
    category: "clarification",
    complexity: "simple",
    prompt: "Create a diagram",
    expected: {
      shouldUseTool: false,
      expectedClarity: {
        decision: "clarify",
      },
      expectedOutput: {
        shouldHaveUserContent: true,
        containsPatterns: ["what|type|kind|would you"],
      },
    },
    scoringWeights: {
      reasoning: 0.25,
      toolUsage: 0.25,
      output: 0.25,
      efficiency: 0.25,
    },
    tags: ["baseline", "clarification"],
    timeout: 45000,
  },
];

// ============================================================================
// EXPORT ALL COMPARISON SCENARIOS
// ============================================================================

export const ALL_COMPARISON_SCENARIOS: BenchmarkScenario[] = [
  ...ANALYZE_COMPARISON_SCENARIOS,
  ...CLARITY_COMPARISON_SCENARIOS,
  ...PLANNING_COMPARISON_SCENARIOS,
  ...TOOL_USAGE_COMPARISON_SCENARIOS,
  ...OUTPUT_COMPARISON_SCENARIOS,
  ...BASELINE_SCENARIOS,
];

/**
 * Comparison scenario sets for targeted A/B testing
 */
export const COMPARISON_SCENARIO_SETS = {
  analyze: ANALYZE_COMPARISON_SCENARIOS.map((s) => s.id),
  clarity: CLARITY_COMPARISON_SCENARIOS.map((s) => s.id),
  planning: PLANNING_COMPARISON_SCENARIOS.map((s) => s.id),
  toolUsage: TOOL_USAGE_COMPARISON_SCENARIOS.map((s) => s.id),
  output: OUTPUT_COMPARISON_SCENARIOS.map((s) => s.id),
  baseline: BASELINE_SCENARIOS.map((s) => s.id),
  all: ALL_COMPARISON_SCENARIOS.map((s) => s.id),
};

/**
 * Recommended prompt comparison workflow:
 *
 * 1. Run baseline scenarios with current prompt (version A)
 * 2. Make prompt changes (version B)
 * 3. Run same baseline scenarios
 * 4. Compare scores
 * 5. If improvement detected, run full comparison suite
 * 6. Document changes and their impact
 */
export const PROMPT_COMPARISON_WORKFLOW = {
  quickCheck: BASELINE_SCENARIOS.map((s) => s.id),
  fullComparison: ALL_COMPARISON_SCENARIOS.map((s) => s.id),
  analyzeImpact: ANALYZE_COMPARISON_SCENARIOS.map((s) => s.id),
  clarityImpact: CLARITY_COMPARISON_SCENARIOS.map((s) => s.id),
  planningImpact: PLANNING_COMPARISON_SCENARIOS.map((s) => s.id),
  toolEfficiencyImpact: TOOL_USAGE_COMPARISON_SCENARIOS.map((s) => s.id),
  outputQualityImpact: OUTPUT_COMPARISON_SCENARIOS.map((s) => s.id),
};
