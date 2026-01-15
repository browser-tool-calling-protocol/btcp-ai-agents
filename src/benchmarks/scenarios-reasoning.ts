/**
 * TAOD Loop Reasoning Scenarios
 *
 * Tests the Think → Act → Observe → Decide reasoning pattern.
 * These scenarios specifically evaluate the quality of each reasoning phase.
 */

import type { BenchmarkScenario } from "./types.js";

// ============================================================================
// ANALYZE PHASE SCENARIOS
// Tests the <analyze> reasoning step quality
// ============================================================================

export const ANALYZE_SCENARIOS: BenchmarkScenario[] = [
  {
    id: "analyze-001",
    name: "Task Understanding - Simple",
    description: "Tests if agent correctly understands a simple task",
    category: "simple_create",
    complexity: "simple",
    prompt: "Create a red rectangle",
    expected: {
      shouldUseTool: true,
      expectedReasoning: {
        requiredTags: ["analyze"],
      },
      expectedOutput: {
        shouldHaveUserContent: true,
        containsPatterns: ["rectangle|created"],
      },
    },
    tags: ["reasoning", "analyze", "simple"],
    timeout: 45000,
  },
  {
    id: "analyze-002",
    name: "Task Understanding - Implicit Requirements",
    description: "Tests if agent infers implicit requirements from context",
    category: "simple_create",
    complexity: "moderate",
    prompt: "Add a title to this dashboard",
    initialCanvasState: {
      elements: [
        { id: "frame_1", type: "frame", x: 0, y: 0, width: 800, height: 600, name: "Dashboard" },
        { id: "chart_1", type: "rectangle", x: 50, y: 100, width: 300, height: 200, name: "chart" },
      ],
    },
    expected: {
      shouldUseTool: true,
      expectedReasoning: {
        requiredTags: ["analyze"],
      },
      expectedTools: {
        tools: ["canvas_read", "canvas_write"],
        ordered: false,
        minCalls: 1,
      },
      expectedOutput: {
        shouldHaveUserContent: true,
        containsPatterns: ["title|text|created"],
      },
    },
    tags: ["reasoning", "analyze", "context-awareness"],
    timeout: 60000,
  },
  {
    id: "analyze-003",
    name: "Task Understanding - Multiple Interpretations",
    description: "Tests handling of ambiguous 'large' element request",
    category: "simple_create",
    complexity: "moderate",
    prompt: "Make a large blue square",
    expected: {
      shouldUseTool: true,
      expectedReasoning: {
        requiredTags: ["analyze"],
      },
      expectedOutput: {
        shouldHaveUserContent: true,
        containsPatterns: ["square|rectangle|created"],
      },
    },
    tags: ["reasoning", "analyze", "ambiguity"],
    timeout: 45000,
  },
  {
    id: "analyze-004",
    name: "Task Understanding - Domain Knowledge",
    description: "Tests if agent applies domain knowledge for wireframe",
    category: "complex_create",
    complexity: "moderate",
    prompt: "Create a login form wireframe",
    expected: {
      shouldUseTool: true,
      expectedReasoning: {
        requiredTags: ["analyze", "plan"],
      },
      expectedOutput: {
        shouldHaveUserContent: true,
        containsPatterns: ["login|form|wireframe|created"],
      },
    },
    tags: ["reasoning", "analyze", "domain-knowledge"],
    timeout: 90000,
  },
];

// ============================================================================
// ASSESS_CLARITY PHASE SCENARIOS
// Tests the <assess_clarity> semantic routing step
// ============================================================================

export const CLARITY_ASSESSMENT_SCENARIOS: BenchmarkScenario[] = [
  {
    id: "clarity-001",
    name: "Clear Output Type Detection",
    description: "Tests if agent correctly identifies clear output type",
    category: "complex_create",
    complexity: "moderate",
    prompt: "Create a mindmap about project management with 5 branches",
    expected: {
      shouldUseTool: true,
      expectedClarity: {
        outputType: "mindmap",
        topicClarity: "specific",
        complexity: "single",
        decision: "execute",
      },
      expectedReasoning: {
        requiredTags: ["assess_clarity"],
      },
      expectedOutput: {
        shouldHaveUserContent: true,
        notContainsPatterns: ["what type|which kind|clarify"],
      },
    },
    tags: ["reasoning", "clarity", "known-type"],
    timeout: 90000,
  },
  {
    id: "clarity-002",
    name: "Unknown Output Type Detection",
    description: "Tests if agent asks for clarification when type is unknown",
    category: "clarification",
    complexity: "simple",
    prompt: "Make something to organize my thoughts",
    expected: {
      shouldUseTool: false,
      expectedClarity: {
        outputType: "unknown",
        topicClarity: "vague",
        decision: "clarify",
      },
      expectedReasoning: {
        requiredTags: ["assess_clarity"],
      },
      expectedOutput: {
        shouldHaveUserContent: true,
        containsPatterns: ["what|type|kind|would you like|mindmap|diagram|kanban"],
      },
    },
    tags: ["reasoning", "clarity", "unknown-type"],
    timeout: 45000,
  },
  {
    id: "clarity-003",
    name: "Missing Topic Detection",
    description: "Tests if agent asks for topic when missing",
    category: "clarification",
    complexity: "simple",
    prompt: "Create a flowchart",
    expected: {
      shouldUseTool: false,
      expectedClarity: {
        outputType: "flowchart",
        topicClarity: "missing",
        decision: "clarify",
      },
      expectedReasoning: {
        requiredTags: ["assess_clarity"],
      },
      expectedOutput: {
        shouldHaveUserContent: true,
        containsPatterns: ["what|about|topic|process|describe"],
      },
    },
    tags: ["reasoning", "clarity", "missing-topic"],
    timeout: 45000,
  },
  {
    id: "clarity-004",
    name: "Multi-Section Complexity Detection",
    description: "Tests detection of multi-section complex requests",
    category: "delegation",
    complexity: "complex",
    prompt: "Create a comprehensive project dashboard with timeline, metrics, team section, and milestones",
    expected: {
      shouldUseTool: true,
      expectedClarity: {
        complexity: "multi-section",
        decision: "delegate",
      },
      expectedReasoning: {
        requiredTags: ["assess_clarity", "plan"],
      },
      expectedDelegation: {
        shouldDelegate: true,
      },
    },
    tags: ["reasoning", "clarity", "multi-section"],
    timeout: 120000,
  },
  {
    id: "clarity-005",
    name: "Borderline Ambiguity",
    description: "Tests handling of somewhat ambiguous but workable request",
    category: "simple_create",
    complexity: "simple",
    prompt: "Add some shapes to represent our data flow",
    expected: {
      shouldUseTool: true, // Should try, may ask clarifying questions
      expectedReasoning: {
        requiredTags: ["assess_clarity"],
      },
    },
    tags: ["reasoning", "clarity", "borderline"],
    timeout: 60000,
  },
];

// ============================================================================
// PLAN PHASE SCENARIOS
// Tests the <plan> reasoning step quality
// ============================================================================

export const PLANNING_SCENARIOS: BenchmarkScenario[] = [
  {
    id: "plan-001",
    name: "Simple Plan - Single Step",
    description: "Tests planning for simple single-step task",
    category: "simple_create",
    complexity: "trivial",
    prompt: "Add a circle",
    expected: {
      shouldUseTool: true,
      expectedTools: {
        tools: ["canvas_write"],
        maxCalls: 2,
      },
      expectedReasoning: {
        optionalTags: ["plan"], // Simple tasks may skip plan
      },
    },
    tags: ["reasoning", "plan", "simple"],
    timeout: 30000,
  },
  {
    id: "plan-002",
    name: "Multi-Step Plan - Sequential",
    description: "Tests planning for multi-step sequential task",
    category: "complex_create",
    complexity: "moderate",
    prompt: "Create a flowchart with Start, Process, Decision, and End nodes connected with arrows",
    expected: {
      shouldUseTool: true,
      expectedReasoning: {
        requiredTags: ["analyze", "plan"],
      },
      expectedTools: {
        tools: ["canvas_write"],
        minCalls: 1,
      },
    },
    tags: ["reasoning", "plan", "sequential"],
    timeout: 90000,
  },
  {
    id: "plan-003",
    name: "Plan with Dependencies",
    description: "Tests planning when later steps depend on earlier ones",
    category: "complex_create",
    complexity: "complex",
    prompt: "Create a kanban board with 3 columns (To Do, In Progress, Done) and add 2 task cards to each column",
    expected: {
      shouldUseTool: true,
      expectedReasoning: {
        requiredTags: ["analyze", "plan"],
      },
      expectedOutput: {
        shouldHaveUserContent: true,
        containsPatterns: ["kanban|column|card|created"],
      },
    },
    tags: ["reasoning", "plan", "dependencies"],
    timeout: 120000,
  },
  {
    id: "plan-004",
    name: "Plan Adaptation - Existing Content",
    description: "Tests planning that adapts to existing canvas content",
    category: "modify",
    complexity: "moderate",
    prompt: "Organize these elements into a neat grid",
    initialCanvasState: {
      elements: [
        { id: "el_1", type: "rectangle", x: 523, y: 187, width: 100, height: 80 },
        { id: "el_2", type: "rectangle", x: 45, y: 412, width: 100, height: 80 },
        { id: "el_3", type: "rectangle", x: 287, y: 89, width: 100, height: 80 },
        { id: "el_4", type: "rectangle", x: 156, y: 534, width: 100, height: 80 },
      ],
    },
    expected: {
      shouldUseTool: true,
      expectedReasoning: {
        requiredTags: ["analyze", "plan"],
      },
      expectedTools: {
        tools: ["canvas_read", "canvas_edit"],
        ordered: false,
        minCalls: 2,
      },
    },
    tags: ["reasoning", "plan", "adaptation"],
    timeout: 90000,
  },
];

// ============================================================================
// OBSERVE PHASE SCENARIOS
// Tests the <observe> reasoning step quality (tool result interpretation)
// ============================================================================

export const OBSERVATION_SCENARIOS: BenchmarkScenario[] = [
  {
    id: "observe-001",
    name: "Observe Success - Simple Create",
    description: "Tests observation of successful creation",
    category: "simple_create",
    complexity: "simple",
    prompt: "Create a rectangle and tell me its ID",
    expected: {
      shouldUseTool: true,
      expectedTools: {
        tools: ["canvas_write"],
        minCalls: 1,
      },
      expectedOutput: {
        shouldHaveUserContent: true,
        containsPatterns: ["id|created|rectangle"],
      },
    },
    tags: ["reasoning", "observe", "success"],
    timeout: 45000,
  },
  {
    id: "observe-002",
    name: "Observe Empty Results",
    description: "Tests observation when search returns no results",
    category: "query",
    complexity: "simple",
    prompt: "Find all triangles on the canvas",
    initialCanvasState: {
      elements: [
        { id: "rect_1", type: "rectangle", x: 100, y: 100, width: 100, height: 100 },
      ],
    },
    expected: {
      shouldUseTool: true,
      expectedTools: {
        tools: ["canvas_find"],
      },
      expectedOutput: {
        shouldHaveUserContent: true,
        containsPatterns: ["no|none|not found|0|empty"],
      },
    },
    tags: ["reasoning", "observe", "empty"],
    timeout: 45000,
  },
  {
    id: "observe-003",
    name: "Observe and Count",
    description: "Tests accurate counting of results",
    category: "query",
    complexity: "simple",
    prompt: "How many rectangles are on the canvas?",
    initialCanvasState: {
      elements: [
        { id: "rect_1", type: "rectangle", x: 0, y: 0, width: 50, height: 50 },
        { id: "rect_2", type: "rectangle", x: 100, y: 0, width: 50, height: 50 },
        { id: "rect_3", type: "rectangle", x: 200, y: 0, width: 50, height: 50 },
        { id: "ellipse_1", type: "ellipse", x: 300, y: 0, width: 50, height: 50 },
      ],
    },
    expected: {
      shouldUseTool: true,
      expectedTools: {
        tools: ["canvas_find", "canvas_read"],
        ordered: false,
      },
      expectedOutput: {
        shouldHaveUserContent: true,
        containsPatterns: ["3|three"],
      },
    },
    tags: ["reasoning", "observe", "count"],
    timeout: 45000,
  },
];

// ============================================================================
// DECIDE PHASE SCENARIOS
// Tests the decision-making quality (continue vs complete)
// ============================================================================

export const DECISION_SCENARIOS: BenchmarkScenario[] = [
  {
    id: "decide-001",
    name: "Decide Complete - Task Finished",
    description: "Tests recognition that task is complete",
    category: "simple_create",
    complexity: "simple",
    prompt: "Add a blue rectangle at 0,0",
    expected: {
      shouldUseTool: true,
      expectedTools: {
        tools: ["canvas_write"],
        maxCalls: 2, // Should complete in 1-2 calls
      },
      expectedOutput: {
        shouldHaveUserContent: true,
        containsPatterns: ["created|added|done"],
      },
    },
    tags: ["reasoning", "decide", "complete"],
    timeout: 45000,
  },
  {
    id: "decide-002",
    name: "Decide Continue - More Work Needed",
    description: "Tests recognition that more work is needed",
    category: "complex_create",
    complexity: "moderate",
    prompt: "Create 3 rectangles in a row and connect them with arrows",
    expected: {
      shouldUseTool: true,
      expectedReasoning: {
        requiredTags: ["plan"],
      },
      expectedTools: {
        tools: ["canvas_write"],
        minCalls: 1,
      },
      expectedOutput: {
        shouldHaveUserContent: true,
        containsPatterns: ["3|three|arrow|connected"],
      },
    },
    tags: ["reasoning", "decide", "continue"],
    timeout: 90000,
  },
  {
    id: "decide-003",
    name: "Decide Stop - Max Iterations Safety",
    description: "Tests graceful handling when task is taking too long",
    category: "complex_create",
    complexity: "expert",
    prompt: "Create an extremely detailed infographic with 50 data points, charts, icons, and annotations",
    expected: {
      shouldUseTool: true,
      expectedReasoning: {
        requiredTags: ["plan"],
      },
      // May not complete fully but should make progress and report
      expectedOutput: {
        shouldHaveUserContent: true,
      },
    },
    tags: ["reasoning", "decide", "safety"],
    timeout: 180000,
  },
];

// ============================================================================
// FULL TAOD LOOP SCENARIOS
// Tests complete Think → Act → Observe → Decide cycles
// ============================================================================

export const FULL_TAOD_SCENARIOS: BenchmarkScenario[] = [
  {
    id: "taod-001",
    name: "Complete TAOD Cycle - Simple",
    description: "Tests a complete reasoning cycle for simple task",
    category: "simple_create",
    complexity: "simple",
    prompt: "Create a green circle at the center of the canvas",
    expected: {
      shouldUseTool: true,
      expectedReasoning: {
        requiredTags: ["analyze"],
        optionalTags: ["plan", "summarize"],
      },
      expectedTools: {
        tools: ["canvas_write"],
        minCalls: 1,
        maxCalls: 3,
      },
      expectedOutput: {
        shouldHaveUserContent: true,
        containsPatterns: ["circle|created|green"],
      },
    },
    tags: ["reasoning", "taod", "complete"],
    timeout: 45000,
  },
  {
    id: "taod-002",
    name: "Complete TAOD Cycle - With Iteration",
    description: "Tests reasoning cycle requiring multiple iterations",
    category: "complex_create",
    complexity: "moderate",
    prompt: "Create a simple org chart with CEO at top, 2 managers below, and 2 employees under each manager",
    expected: {
      shouldUseTool: true,
      expectedReasoning: {
        requiredTags: ["analyze", "plan"],
        optionalTags: ["summarize"],
      },
      expectedTools: {
        tools: ["canvas_write"],
        minCalls: 1,
      },
      expectedOutput: {
        shouldHaveUserContent: true,
        containsPatterns: ["org|chart|CEO|manager|employee|created"],
      },
    },
    tags: ["reasoning", "taod", "iteration"],
    timeout: 120000,
  },
  {
    id: "taod-003",
    name: "Complete TAOD Cycle - With Error Recovery",
    description: "Tests reasoning cycle with error handling",
    category: "modify",
    complexity: "moderate",
    prompt: "Delete the element named 'nonexistent-xyz-123'",
    initialCanvasState: {
      elements: [
        { id: "rect_1", type: "rectangle", x: 100, y: 100, width: 100, height: 100, name: "actual-element" },
      ],
    },
    expected: {
      shouldUseTool: true,
      expectedTools: {
        tools: ["canvas_find", "canvas_edit"],
        ordered: false,
      },
      expectedOutput: {
        shouldHaveUserContent: true,
        containsPatterns: ["not found|doesn't exist|no element"],
      },
    },
    tags: ["reasoning", "taod", "error-handling"],
    timeout: 60000,
  },
];

// ============================================================================
// EXPORT ALL REASONING SCENARIOS
// ============================================================================

export const ALL_REASONING_SCENARIOS: BenchmarkScenario[] = [
  ...ANALYZE_SCENARIOS,
  ...CLARITY_ASSESSMENT_SCENARIOS,
  ...PLANNING_SCENARIOS,
  ...OBSERVATION_SCENARIOS,
  ...DECISION_SCENARIOS,
  ...FULL_TAOD_SCENARIOS,
];

/**
 * Reasoning scenario sets for targeted testing
 */
export const REASONING_SCENARIO_SETS = {
  analyze: ANALYZE_SCENARIOS.map((s) => s.id),
  clarity: CLARITY_ASSESSMENT_SCENARIOS.map((s) => s.id),
  planning: PLANNING_SCENARIOS.map((s) => s.id),
  observation: OBSERVATION_SCENARIOS.map((s) => s.id),
  decision: DECISION_SCENARIOS.map((s) => s.id),
  taod: FULL_TAOD_SCENARIOS.map((s) => s.id),
  all: ALL_REASONING_SCENARIOS.map((s) => s.id),
};
