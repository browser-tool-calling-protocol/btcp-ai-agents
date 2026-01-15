/**
 * Regression Test Scenarios
 *
 * Tests for known issues, previously fixed bugs, and common failure patterns.
 * These scenarios ensure that fixes remain in place and known issues are tracked.
 *
 * Each scenario documents:
 * - The original issue
 * - Expected correct behavior
 * - Related components/prompts affected
 */

import type { BenchmarkScenario } from "./types.js";

// ============================================================================
// TOOL SELECTION REGRESSIONS
// Previously identified issues with tool selection
// ============================================================================

export const TOOL_SELECTION_REGRESSIONS: BenchmarkScenario[] = [
  {
    id: "regress-tool-001",
    name: "Query Should Not Modify",
    description: "ISSUE: Query requests sometimes triggered canvas_write instead of canvas_read",
    category: "query",
    complexity: "simple",
    prompt: "What elements are currently on the canvas?",
    initialCanvasState: {
      elements: [
        { id: "el1", type: "rectangle", x: 100, y: 100, width: 100, height: 100 },
      ],
    },
    expected: {
      shouldUseTool: true,
      expectedTools: {
        tools: ["canvas_read", "canvas_find"],
        ordered: false,
        maxCalls: 2,
      },
      expectedCanvasChanges: {
        elementsCreated: {
          minCount: 0,
          maxCount: 0,
        },
        elementsDeleted: 0,
      },
      expectedOutput: {
        shouldHaveUserContent: true,
      },
    },
    tags: ["regression", "tool-selection", "query-modify"],
    timeout: 45000,
  },
  {
    id: "regress-tool-002",
    name: "Modify Should Not Delete Without Reason",
    description: "ISSUE: Edit requests sometimes deleted elements instead of modifying",
    category: "modify",
    complexity: "simple",
    prompt: "Change the color of the rectangle to green",
    initialCanvasState: {
      elements: [
        { id: "rect1", type: "rectangle", x: 100, y: 100, width: 100, height: 100, backgroundColor: "#3b82f6" },
      ],
    },
    expected: {
      shouldUseTool: true,
      expectedTools: {
        tools: ["canvas_edit"],
      },
      expectedCanvasChanges: {
        elementsDeleted: 0, // Should NOT delete
      },
      expectedOutput: {
        shouldHaveUserContent: true,
        containsPatterns: ["changed|updated|green"],
      },
    },
    tags: ["regression", "tool-selection", "modify-delete"],
    timeout: 45000,
  },
  {
    id: "regress-tool-003",
    name: "Simple Create Should Not Read First",
    description: "ISSUE: Simple create operations unnecessarily read canvas first",
    category: "simple_create",
    complexity: "trivial",
    prompt: "Add a rectangle at 0,0",
    initialCanvasState: {
      elements: [],
    },
    expected: {
      shouldUseTool: true,
      expectedTools: {
        tools: ["canvas_write"],
        minCalls: 1,
        maxCalls: 1, // Should NOT read first
      },
      expectedOutput: {
        shouldHaveUserContent: true,
      },
    },
    tags: ["regression", "tool-selection", "unnecessary-read"],
    timeout: 30000,
  },
];

// ============================================================================
// REASONING QUALITY REGRESSIONS
// Previously identified issues with reasoning steps
// ============================================================================

export const REASONING_QUALITY_REGRESSIONS: BenchmarkScenario[] = [
  {
    id: "regress-reason-001",
    name: "Plan Required for Multi-Step",
    description: "ISSUE: Multi-step tasks sometimes skipped planning, causing incomplete execution",
    category: "complex_create",
    complexity: "moderate",
    prompt: "Create a flowchart with Start, two Process boxes, a Decision diamond, and End",
    initialCanvasState: {
      elements: [],
    },
    expected: {
      shouldUseTool: true,
      expectedReasoning: {
        requiredTags: ["analyze", "plan"], // MUST plan
      },
      expectedOutput: {
        shouldHaveUserContent: true,
        containsPatterns: ["flowchart|created|start|process|decision|end"],
      },
    },
    tags: ["regression", "reasoning", "missing-plan"],
    timeout: 120000,
  },
  {
    id: "regress-reason-002",
    name: "Clarity Assessment for Vague Requests",
    description: "ISSUE: Vague requests sometimes proceeded without clarification",
    category: "clarification",
    complexity: "simple",
    prompt: "Make something nice",
    expected: {
      shouldUseTool: false,
      expectedReasoning: {
        requiredTags: ["assess_clarity"],
      },
      expectedClarity: {
        decision: "clarify",
      },
      expectedOutput: {
        shouldHaveUserContent: true,
        containsPatterns: ["what|type|kind|prefer|like"],
      },
    },
    tags: ["regression", "reasoning", "missing-clarity"],
    timeout: 45000,
  },
  {
    id: "regress-reason-003",
    name: "Observe Step After Tool Use",
    description: "ISSUE: Tool results sometimes not properly interpreted before next action",
    category: "modify",
    complexity: "moderate",
    prompt: "Count the rectangles and if there are more than 3, delete the extras",
    initialCanvasState: {
      elements: [
        { id: "r1", type: "rectangle", x: 0, y: 0, width: 50, height: 50 },
        { id: "r2", type: "rectangle", x: 100, y: 0, width: 50, height: 50 },
        { id: "r3", type: "rectangle", x: 200, y: 0, width: 50, height: 50 },
        { id: "r4", type: "rectangle", x: 300, y: 0, width: 50, height: 50 },
        { id: "r5", type: "rectangle", x: 400, y: 0, width: 50, height: 50 },
      ],
    },
    expected: {
      shouldUseTool: true,
      expectedTools: {
        tools: ["canvas_read", "canvas_edit"],
        ordered: true,
      },
      expectedCanvasChanges: {
        elementsDeleted: 2, // Should delete exactly 2
      },
      expectedOutput: {
        shouldHaveUserContent: true,
        containsPatterns: ["5|five|deleted|2|two|removed"],
      },
    },
    tags: ["regression", "reasoning", "observe-before-act"],
    timeout: 90000,
  },
];

// ============================================================================
// OUTPUT QUALITY REGRESSIONS
// Previously identified issues with user-facing output
// ============================================================================

export const OUTPUT_QUALITY_REGRESSIONS: BenchmarkScenario[] = [
  {
    id: "regress-output-001",
    name: "Must Provide User-Facing Summary",
    description: "ISSUE: Some responses had no user-facing content",
    category: "simple_create",
    complexity: "simple",
    prompt: "Create a blue rectangle",
    expected: {
      shouldUseTool: true,
      expectedOutput: {
        shouldHaveUserContent: true, // MUST have output
        containsPatterns: ["created|added|rectangle|blue"],
      },
    },
    tags: ["regression", "output", "missing-summary"],
    timeout: 45000,
  },
  {
    id: "regress-output-002",
    name: "Error Explanation Required",
    description: "ISSUE: Error cases sometimes returned no explanation",
    category: "error_recovery",
    complexity: "simple",
    prompt: "Delete the element named 'doesnt-exist-123'",
    initialCanvasState: {
      elements: [
        { id: "el1", type: "rectangle", x: 100, y: 100, width: 100, height: 100, name: "existing" },
      ],
    },
    expected: {
      shouldUseTool: true,
      expectedOutput: {
        shouldHaveUserContent: true, // MUST explain
        containsPatterns: ["not found|doesn't exist|could not|no element"],
      },
    },
    tags: ["regression", "output", "missing-error-message"],
    timeout: 45000,
  },
  {
    id: "regress-output-003",
    name: "Action Confirmation Required",
    description: "ISSUE: Modifications sometimes didn't confirm what changed",
    category: "modify",
    complexity: "simple",
    prompt: "Move the rectangle to position 500, 500",
    initialCanvasState: {
      elements: [
        { id: "rect1", type: "rectangle", x: 100, y: 100, width: 100, height: 100, name: "box" },
      ],
    },
    expected: {
      shouldUseTool: true,
      expectedOutput: {
        shouldHaveUserContent: true,
        containsPatterns: ["moved|updated|500|position"],
        mentionsCreatedElements: false,
      },
    },
    tags: ["regression", "output", "missing-confirmation"],
    timeout: 45000,
  },
];

// ============================================================================
// CLARIFICATION REGRESSIONS
// Previously identified issues with clarification flow
// ============================================================================

export const CLARIFICATION_REGRESSIONS: BenchmarkScenario[] = [
  {
    id: "regress-clarify-001",
    name: "No False Clarifications",
    description: "ISSUE: Clear requests sometimes triggered unnecessary clarification",
    category: "simple_create",
    complexity: "simple",
    prompt: "Create a 200x100 blue rectangle at position 50, 75",
    expected: {
      shouldUseTool: true, // Should execute, NOT clarify
      expectedTools: {
        tools: ["canvas_write"],
      },
      expectedOutput: {
        shouldHaveUserContent: true,
        notContainsPatterns: ["would you like|what type|clarify|which"],
      },
    },
    tags: ["regression", "clarification", "false-positive"],
    timeout: 45000,
  },
  {
    id: "regress-clarify-002",
    name: "Clarify When Truly Ambiguous",
    description: "ISSUE: Ambiguous requests sometimes guessed instead of clarifying",
    category: "clarification",
    complexity: "simple",
    prompt: "Show me how things connect",
    initialCanvasState: {
      elements: [],
    },
    expected: {
      shouldUseTool: false, // Should clarify, NOT guess
      expectedClarity: {
        decision: "clarify",
      },
      expectedOutput: {
        shouldHaveUserContent: true,
        containsPatterns: ["what|which|things|connect|could you"],
      },
    },
    tags: ["regression", "clarification", "false-negative"],
    timeout: 45000,
  },
  {
    id: "regress-clarify-003",
    name: "Helpful Clarification Questions",
    description: "ISSUE: Clarification questions sometimes too generic",
    category: "clarification",
    complexity: "simple",
    prompt: "Create a diagram",
    expected: {
      shouldUseTool: false,
      expectedOutput: {
        shouldHaveUserContent: true,
        // Should offer specific options, not just "what?"
        containsPatterns: ["flowchart|mindmap|org chart|what type|kind"],
      },
    },
    tags: ["regression", "clarification", "helpful-questions"],
    timeout: 45000,
  },
];

// ============================================================================
// DELEGATION REGRESSIONS
// Previously identified issues with sub-agent delegation
// ============================================================================

export const DELEGATION_REGRESSIONS: BenchmarkScenario[] = [
  {
    id: "regress-delegate-001",
    name: "Complex Tasks Should Delegate",
    description: "ISSUE: Complex multi-section tasks sometimes handled directly instead of delegating",
    category: "delegation",
    complexity: "complex",
    prompt:
      "Create a comprehensive project overview with: team section showing 5 members, timeline with 4 milestones, and status metrics dashboard",
    expected: {
      shouldUseTool: true,
      expectedDelegation: {
        shouldDelegate: true,
      },
      expectedReasoning: {
        requiredTags: ["assess_clarity", "plan"],
      },
    },
    tags: ["regression", "delegation", "should-delegate"],
    timeout: 180000,
  },
  {
    id: "regress-delegate-002",
    name: "Simple Tasks Should Not Delegate",
    description: "ISSUE: Simple tasks sometimes unnecessarily delegated",
    category: "simple_create",
    complexity: "simple",
    prompt: "Add a rectangle to the canvas",
    expected: {
      shouldUseTool: true,
      expectedDelegation: {
        shouldDelegate: false, // Should NOT delegate
      },
      expectedTools: {
        tools: ["canvas_write"],
        maxCalls: 2,
      },
    },
    tags: ["regression", "delegation", "unnecessary-delegation"],
    timeout: 45000,
  },
];

// ============================================================================
// EFFICIENCY REGRESSIONS
// Previously identified issues with execution efficiency
// ============================================================================

export const EFFICIENCY_REGRESSIONS: BenchmarkScenario[] = [
  {
    id: "regress-eff-001",
    name: "Batch Similar Operations",
    description: "ISSUE: Multiple similar elements created with separate tool calls",
    category: "simple_create",
    complexity: "simple",
    prompt: "Create 5 rectangles in a horizontal row",
    expected: {
      shouldUseTool: true,
      expectedTools: {
        tools: ["canvas_write"],
        maxCalls: 2, // Should batch, not 5 calls
      },
      expectedCanvasChanges: {
        elementsCreated: {
          minCount: 5,
          maxCount: 5,
        },
      },
    },
    tags: ["regression", "efficiency", "batch-operations"],
    timeout: 60000,
  },
  {
    id: "regress-eff-002",
    name: "No Redundant Reads",
    description: "ISSUE: Canvas read repeated unnecessarily between operations",
    category: "complex_create",
    complexity: "moderate",
    prompt: "Create a frame and put two rectangles inside it",
    initialCanvasState: {
      elements: [],
    },
    expected: {
      shouldUseTool: true,
      expectedTools: {
        tools: ["canvas_write"],
        maxCalls: 3, // Should not read between each write
      },
    },
    tags: ["regression", "efficiency", "redundant-reads"],
    timeout: 60000,
  },
  {
    id: "regress-eff-003",
    name: "Early Exit on Completion",
    description: "ISSUE: Agent continued iterating after task was complete",
    category: "simple_create",
    complexity: "trivial",
    prompt: "Add a single text element saying 'Hello'",
    expected: {
      shouldUseTool: true,
      expectedTools: {
        tools: ["canvas_write"],
        maxCalls: 1, // Should complete in single call
      },
      expectedOutput: {
        shouldHaveUserContent: true,
      },
    },
    tags: ["regression", "efficiency", "early-exit"],
    timeout: 30000,
  },
];

// ============================================================================
// CONTEXT HANDLING REGRESSIONS
// Previously identified issues with context interpretation
// ============================================================================

export const CONTEXT_HANDLING_REGRESSIONS: BenchmarkScenario[] = [
  {
    id: "regress-ctx-001",
    name: "Respect Canvas State",
    description: "ISSUE: Agent sometimes ignored existing canvas elements",
    category: "modify",
    complexity: "moderate",
    prompt: "Align all rectangles horizontally",
    initialCanvasState: {
      elements: [
        { id: "r1", type: "rectangle", x: 50, y: 100, width: 80, height: 60 },
        { id: "r2", type: "rectangle", x: 200, y: 250, width: 80, height: 60 },
        { id: "r3", type: "rectangle", x: 350, y: 50, width: 80, height: 60 },
      ],
    },
    expected: {
      shouldUseTool: true,
      expectedTools: {
        tools: ["canvas_read", "canvas_edit"],
        ordered: true,
      },
      expectedOutput: {
        shouldHaveUserContent: true,
        containsPatterns: ["aligned|moved|updated"],
      },
    },
    tags: ["regression", "context", "respect-state"],
    timeout: 90000,
  },
  {
    id: "regress-ctx-002",
    name: "Handle Empty Canvas Correctly",
    description: "ISSUE: Agent sometimes assumed elements existed on empty canvas",
    category: "query",
    complexity: "simple",
    prompt: "List all elements on the canvas",
    initialCanvasState: {
      elements: [],
    },
    expected: {
      shouldUseTool: true,
      expectedOutput: {
        shouldHaveUserContent: true,
        containsPatterns: ["empty|no element|nothing|0|none"],
      },
    },
    tags: ["regression", "context", "empty-canvas"],
    timeout: 30000,
  },
];

// ============================================================================
// EXPORT ALL REGRESSION SCENARIOS
// ============================================================================

export const ALL_REGRESSION_SCENARIOS: BenchmarkScenario[] = [
  ...TOOL_SELECTION_REGRESSIONS,
  ...REASONING_QUALITY_REGRESSIONS,
  ...OUTPUT_QUALITY_REGRESSIONS,
  ...CLARIFICATION_REGRESSIONS,
  ...DELEGATION_REGRESSIONS,
  ...EFFICIENCY_REGRESSIONS,
  ...CONTEXT_HANDLING_REGRESSIONS,
];

/**
 * Regression scenario sets for targeted testing
 */
export const REGRESSION_SCENARIO_SETS = {
  toolSelection: TOOL_SELECTION_REGRESSIONS.map((s) => s.id),
  reasoningQuality: REASONING_QUALITY_REGRESSIONS.map((s) => s.id),
  outputQuality: OUTPUT_QUALITY_REGRESSIONS.map((s) => s.id),
  clarification: CLARIFICATION_REGRESSIONS.map((s) => s.id),
  delegation: DELEGATION_REGRESSIONS.map((s) => s.id),
  efficiency: EFFICIENCY_REGRESSIONS.map((s) => s.id),
  contextHandling: CONTEXT_HANDLING_REGRESSIONS.map((s) => s.id),
  all: ALL_REGRESSION_SCENARIOS.map((s) => s.id),
};

/**
 * Critical regressions that MUST pass for any release
 */
export const CRITICAL_REGRESSIONS = [
  "regress-tool-001", // Query should not modify
  "regress-tool-002", // Modify should not delete
  "regress-output-001", // Must have user output
  "regress-clarify-001", // No false clarifications
  "regress-eff-003", // Early exit
];
