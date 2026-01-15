/**
 * Edge Case & Stress Test Scenarios
 *
 * Tests boundary conditions, unusual inputs, and stress scenarios.
 * These scenarios help identify potential failure modes and edge cases.
 */

import type { BenchmarkScenario } from "./types.js";

// ============================================================================
// INPUT BOUNDARY TESTS
// Tests handling of various input extremes
// ============================================================================

export const INPUT_BOUNDARY_SCENARIOS: BenchmarkScenario[] = [
  {
    id: "edge-input-001",
    name: "Very Long Prompt",
    description: "Tests handling of unusually long user request",
    category: "complex_create",
    complexity: "moderate",
    prompt: `Create a comprehensive visualization that includes the following elements in great detail:
      - A central hub rectangle positioned at coordinates (400, 300) with dimensions 150x100 pixels
      - Eight satellite circles arranged in a radial pattern around the hub, each at a distance of 200 pixels from the center
      - Connect each satellite to the hub with a directional arrow
      - Label each satellite with the following topics: Marketing, Sales, Engineering, Design, Product, Support, Finance, HR
      - Use a color gradient from blue (#3b82f6) for the first satellite to green (#22c55e) for the last
      - Add a title text "Company Departments" above the entire diagram centered horizontally
      - Add a legend in the bottom right corner explaining the color coding
      - Ensure all text is readable and properly sized
      - The overall diagram should be centered on the canvas
      - Use consistent spacing and alignment throughout
      - Add subtle shadows to the rectangles for depth
      - Include connector labels showing relationships between departments`,
    expected: {
      shouldUseTool: true,
      expectedReasoning: {
        requiredTags: ["analyze", "plan"],
      },
      expectedOutput: {
        shouldHaveUserContent: true,
      },
    },
    tags: ["edge-case", "input", "long-prompt"],
    timeout: 180000,
  },
  {
    id: "edge-input-002",
    name: "Single Character Input",
    description: "Tests handling of minimal input",
    category: "clarification",
    complexity: "trivial",
    prompt: "?",
    expected: {
      shouldUseTool: false,
      expectedOutput: {
        shouldHaveUserContent: true,
        containsPatterns: ["help|assist|question|what"],
      },
    },
    tags: ["edge-case", "input", "minimal"],
    timeout: 15000,
  },
  {
    id: "edge-input-003",
    name: "Numeric Only Input",
    description: "Tests handling of numeric-only request",
    category: "clarification",
    complexity: "simple",
    prompt: "100 200 300 400",
    expected: {
      shouldUseTool: false,
      expectedOutput: {
        shouldHaveUserContent: true,
        containsPatterns: ["what|understand|clarify|coordinates|numbers"],
      },
    },
    tags: ["edge-case", "input", "numeric"],
    timeout: 30000,
  },
  {
    id: "edge-input-004",
    name: "Special Characters",
    description: "Tests handling of special characters in request",
    category: "simple_create",
    complexity: "simple",
    prompt: "Create a text element with: @#$%^&*()_+{}[]|\\:\";<>?,./",
    expected: {
      shouldUseTool: true,
      expectedTools: {
        tools: ["canvas_write"],
      },
      expectedOutput: {
        shouldHaveUserContent: true,
      },
    },
    tags: ["edge-case", "input", "special-chars"],
    timeout: 45000,
  },
  {
    id: "edge-input-005",
    name: "Unicode Characters",
    description: "Tests handling of international/emoji characters",
    category: "simple_create",
    complexity: "simple",
    prompt: "Create a text element saying: Hello 世界 🌍 مرحبا",
    expected: {
      shouldUseTool: true,
      expectedTools: {
        tools: ["canvas_write"],
      },
      expectedOutput: {
        shouldHaveUserContent: true,
      },
    },
    tags: ["edge-case", "input", "unicode"],
    timeout: 45000,
  },
  {
    id: "edge-input-006",
    name: "HTML/Code in Request",
    description: "Tests handling of code/markup in request",
    category: "simple_create",
    complexity: "simple",
    prompt: "Create a text element with: <div class='test'>Hello</div>",
    expected: {
      shouldUseTool: true,
      expectedTools: {
        tools: ["canvas_write"],
      },
      expectedOutput: {
        shouldHaveUserContent: true,
      },
    },
    tags: ["edge-case", "input", "code"],
    timeout: 45000,
  },
];

// ============================================================================
// CANVAS STATE EXTREMES
// Tests behavior with extreme canvas states
// ============================================================================

export const CANVAS_STATE_SCENARIOS: BenchmarkScenario[] = [
  {
    id: "edge-canvas-001",
    name: "Large Element Count Query",
    description: "Tests handling of canvas with many elements",
    category: "query",
    complexity: "moderate",
    prompt: "How many elements are on the canvas?",
    initialCanvasState: {
      elements: Array.from({ length: 50 }, (_, i) => ({
        id: `rect_${i}`,
        type: "rectangle",
        x: (i % 10) * 100,
        y: Math.floor(i / 10) * 100,
        width: 80,
        height: 60,
      })),
    },
    expected: {
      shouldUseTool: true,
      expectedTools: {
        tools: ["canvas_read"],
      },
      expectedOutput: {
        shouldHaveUserContent: true,
        containsPatterns: ["50|fifty"],
      },
    },
    tags: ["edge-case", "canvas", "large"],
    timeout: 60000,
  },
  {
    id: "edge-canvas-002",
    name: "Deeply Nested Elements",
    description: "Tests handling of deeply nested frame structure",
    category: "query",
    complexity: "moderate",
    prompt: "Describe the structure of the canvas",
    initialCanvasState: {
      elements: [
        { id: "frame_1", type: "frame", x: 0, y: 0, width: 800, height: 600, name: "Level 1" },
        {
          id: "frame_2",
          type: "frame",
          x: 50,
          y: 50,
          width: 700,
          height: 500,
          name: "Level 2",
          parentId: "frame_1",
        },
        {
          id: "frame_3",
          type: "frame",
          x: 100,
          y: 100,
          width: 600,
          height: 400,
          name: "Level 3",
          parentId: "frame_2",
        },
        {
          id: "content",
          type: "rectangle",
          x: 150,
          y: 150,
          width: 500,
          height: 300,
          parentId: "frame_3",
        },
      ],
    },
    expected: {
      shouldUseTool: true,
      expectedOutput: {
        shouldHaveUserContent: true,
        containsPatterns: ["nested|frame|level|hierarchy"],
      },
    },
    tags: ["edge-case", "canvas", "nested"],
    timeout: 60000,
  },
  {
    id: "edge-canvas-003",
    name: "Overlapping Elements",
    description: "Tests handling of heavily overlapping elements",
    category: "modify",
    complexity: "moderate",
    prompt: "Spread these overlapping elements apart",
    initialCanvasState: {
      elements: [
        { id: "el_1", type: "rectangle", x: 100, y: 100, width: 100, height: 100 },
        { id: "el_2", type: "rectangle", x: 110, y: 110, width: 100, height: 100 },
        { id: "el_3", type: "rectangle", x: 120, y: 120, width: 100, height: 100 },
        { id: "el_4", type: "rectangle", x: 130, y: 130, width: 100, height: 100 },
        { id: "el_5", type: "rectangle", x: 140, y: 140, width: 100, height: 100 },
      ],
    },
    expected: {
      shouldUseTool: true,
      expectedTools: {
        tools: ["canvas_read", "canvas_edit"],
        ordered: false,
      },
      expectedOutput: {
        shouldHaveUserContent: true,
        containsPatterns: ["spread|arranged|spaced|moved"],
      },
    },
    tags: ["edge-case", "canvas", "overlap"],
    timeout: 90000,
  },
  {
    id: "edge-canvas-004",
    name: "Elements at Extreme Coordinates",
    description: "Tests handling of elements at canvas boundaries",
    category: "query",
    complexity: "simple",
    prompt: "Where are all the elements located?",
    initialCanvasState: {
      elements: [
        { id: "el_neg", type: "rectangle", x: -500, y: -500, width: 100, height: 100 },
        { id: "el_far", type: "rectangle", x: 10000, y: 10000, width: 100, height: 100 },
        { id: "el_origin", type: "rectangle", x: 0, y: 0, width: 100, height: 100 },
      ],
    },
    expected: {
      shouldUseTool: true,
      expectedTools: {
        tools: ["canvas_read"],
      },
      expectedOutput: {
        shouldHaveUserContent: true,
      },
    },
    tags: ["edge-case", "canvas", "coordinates"],
    timeout: 45000,
  },
];

// ============================================================================
// CONFLICTING INSTRUCTIONS
// Tests handling of contradictory or impossible requests
// ============================================================================

export const CONFLICTING_INSTRUCTION_SCENARIOS: BenchmarkScenario[] = [
  {
    id: "edge-conflict-001",
    name: "Contradictory Colors",
    description: "Tests handling of contradictory color request",
    category: "simple_create",
    complexity: "simple",
    prompt: "Create a red rectangle that is blue",
    expected: {
      shouldUseTool: true, // Should pick one or ask
      expectedOutput: {
        shouldHaveUserContent: true,
      },
    },
    tags: ["edge-case", "conflict", "color"],
    timeout: 45000,
  },
  {
    id: "edge-conflict-002",
    name: "Contradictory Shapes",
    description: "Tests handling of contradictory shape request",
    category: "clarification",
    complexity: "simple",
    prompt: "Create a circular rectangle",
    expected: {
      shouldUseTool: false, // Should clarify or pick closest interpretation
      expectedOutput: {
        shouldHaveUserContent: true,
        containsPatterns: ["rounded|circle|rectangle|ellipse|which|clarify"],
      },
    },
    tags: ["edge-case", "conflict", "shape"],
    timeout: 45000,
  },
  {
    id: "edge-conflict-003",
    name: "Impossible Position",
    description: "Tests handling of impossible positioning request",
    category: "simple_create",
    complexity: "simple",
    prompt: "Create a rectangle at the left of the right edge and right of the left edge",
    expected: {
      shouldUseTool: true, // Should make reasonable interpretation
      expectedTools: {
        tools: ["canvas_write"],
      },
      expectedOutput: {
        shouldHaveUserContent: true,
      },
    },
    tags: ["edge-case", "conflict", "position"],
    timeout: 45000,
  },
  {
    id: "edge-conflict-004",
    name: "Delete Non-Deletable",
    description: "Tests handling of request to delete what doesn't exist",
    category: "error_recovery",
    complexity: "simple",
    prompt: "Delete all triangles",
    initialCanvasState: {
      elements: [
        { id: "rect", type: "rectangle", x: 100, y: 100, width: 100, height: 100 },
      ],
    },
    expected: {
      shouldUseTool: true,
      expectedTools: {
        tools: ["canvas_find"],
      },
      expectedOutput: {
        shouldHaveUserContent: true,
        containsPatterns: ["no|none|triangle|found|exist"],
      },
    },
    tags: ["edge-case", "conflict", "not-found"],
    timeout: 45000,
  },
];

// ============================================================================
// RATE LIMITING & TIMEOUT SCENARIOS
// Tests behavior under resource constraints
// ============================================================================

export const RESOURCE_CONSTRAINT_SCENARIOS: BenchmarkScenario[] = [
  {
    id: "edge-resource-001",
    name: "Potentially Infinite Loop Request",
    description: "Tests handling of request that could cause infinite loop",
    category: "complex_create",
    complexity: "complex",
    prompt: "Keep adding rectangles until I say stop",
    expected: {
      shouldUseTool: true, // Should add some, then inform user
      expectedOutput: {
        shouldHaveUserContent: true,
        containsPatterns: ["added|created|rectangle|stop|continue|let me know"],
      },
    },
    tags: ["edge-case", "resource", "loop"],
    timeout: 60000,
  },
  {
    id: "edge-resource-002",
    name: "Very Large Element Request",
    description: "Tests handling of request for massive elements",
    category: "simple_create",
    complexity: "simple",
    prompt: "Create a rectangle with width 100000 and height 100000",
    expected: {
      shouldUseTool: true,
      expectedOutput: {
        shouldHaveUserContent: true,
      },
    },
    tags: ["edge-case", "resource", "large-element"],
    timeout: 45000,
  },
  {
    id: "edge-resource-003",
    name: "Many Small Operations",
    description: "Tests handling of many small sequential operations",
    category: "complex_create",
    complexity: "moderate",
    prompt: "Create rectangles at positions (0,0), (10,0), (20,0), (30,0), (40,0), (50,0), (60,0), (70,0), (80,0), (90,0)",
    expected: {
      shouldUseTool: true,
      expectedTools: {
        tools: ["canvas_write"],
        minCalls: 1,
        maxCalls: 3, // Should batch efficiently
      },
      expectedCanvasChanges: {
        elementsCreated: {
          minCount: 10,
          maxCount: 10,
        },
      },
    },
    tags: ["edge-case", "resource", "batch"],
    timeout: 60000,
  },
];

// ============================================================================
// LANGUAGE & FORMATTING EDGE CASES
// Tests handling of various language patterns
// ============================================================================

export const LANGUAGE_EDGE_CASES: BenchmarkScenario[] = [
  {
    id: "edge-lang-001",
    name: "All Caps Request",
    description: "Tests handling of shouting/caps request",
    category: "simple_create",
    complexity: "simple",
    prompt: "CREATE A BIG RED RECTANGLE NOW",
    expected: {
      shouldUseTool: true,
      expectedTools: {
        tools: ["canvas_write"],
      },
      expectedOutput: {
        shouldHaveUserContent: true,
      },
    },
    tags: ["edge-case", "language", "caps"],
    timeout: 45000,
  },
  {
    id: "edge-lang-002",
    name: "No Punctuation Run-on",
    description: "Tests handling of run-on sentence",
    category: "complex_create",
    complexity: "moderate",
    prompt: "create a rectangle and then add a circle next to it and connect them with a line and make everything blue",
    expected: {
      shouldUseTool: true,
      expectedTools: {
        tools: ["canvas_write"],
        minCalls: 1,
      },
      expectedReasoning: {
        requiredTags: ["analyze", "plan"],
      },
      expectedOutput: {
        shouldHaveUserContent: true,
      },
    },
    tags: ["edge-case", "language", "run-on"],
    timeout: 90000,
  },
  {
    id: "edge-lang-003",
    name: "Typos and Misspellings",
    description: "Tests handling of typos in request",
    category: "simple_create",
    complexity: "simple",
    prompt: "creaet a retcangle at postion 100,100",
    expected: {
      shouldUseTool: true,
      expectedTools: {
        tools: ["canvas_write"],
      },
      expectedOutput: {
        shouldHaveUserContent: true,
        containsPatterns: ["rectangle|created|added"],
      },
    },
    tags: ["edge-case", "language", "typos"],
    timeout: 45000,
  },
  {
    id: "edge-lang-004",
    name: "Abbreviations and Shorthand",
    description: "Tests handling of abbreviated requests",
    category: "simple_create",
    complexity: "simple",
    prompt: "rect 100x50 @ 0,0 blue bg",
    expected: {
      shouldUseTool: true,
      expectedTools: {
        tools: ["canvas_write"],
      },
      expectedOutput: {
        shouldHaveUserContent: true,
      },
    },
    tags: ["edge-case", "language", "abbreviation"],
    timeout: 45000,
  },
  {
    id: "edge-lang-005",
    name: "Overly Polite Request",
    description: "Tests handling of overly polite/indirect request",
    category: "simple_create",
    complexity: "simple",
    prompt: "Would it perhaps be possible, if it's not too much trouble, to maybe consider adding a small rectangle somewhere on the canvas, if that would be alright?",
    expected: {
      shouldUseTool: true,
      expectedTools: {
        tools: ["canvas_write"],
      },
      expectedOutput: {
        shouldHaveUserContent: true,
      },
    },
    tags: ["edge-case", "language", "polite"],
    timeout: 45000,
  },
];

// ============================================================================
// RECOVERY FROM PREVIOUS FAILURES
// Tests resilience after errors
// ============================================================================

export const RECOVERY_SCENARIOS: BenchmarkScenario[] = [
  {
    id: "edge-recovery-001",
    name: "Retry After Not Found",
    description: "Tests recovery when element not found",
    category: "simple_create",
    complexity: "simple",
    prompt: "Find 'my-element' and if it doesn't exist, create it",
    initialCanvasState: {
      elements: [],
    },
    expected: {
      shouldUseTool: true,
      expectedTools: {
        tools: ["canvas_find", "canvas_write"],
        ordered: true,
      },
      expectedCanvasChanges: {
        elementsCreated: {
          minCount: 1,
        },
      },
    },
    tags: ["edge-case", "recovery", "not-found"],
    timeout: 60000,
  },
  {
    id: "edge-recovery-002",
    name: "Alternative When Blocked",
    description: "Tests suggesting alternative when main action blocked",
    category: "modify",
    complexity: "moderate",
    prompt: "Move the locked element to position (500, 500)",
    initialCanvasState: {
      elements: [
        { id: "locked_el", type: "rectangle", x: 100, y: 100, width: 100, height: 100, locked: true },
      ],
    },
    expected: {
      shouldUseTool: true,
      expectedOutput: {
        shouldHaveUserContent: true,
        containsPatterns: ["locked|cannot|move|unlock|copy"],
      },
    },
    tags: ["edge-case", "recovery", "blocked"],
    timeout: 60000,
  },
];

// ============================================================================
// EXPORT ALL EDGE CASE SCENARIOS
// ============================================================================

export const ALL_EDGE_CASE_SCENARIOS: BenchmarkScenario[] = [
  ...INPUT_BOUNDARY_SCENARIOS,
  ...CANVAS_STATE_SCENARIOS,
  ...CONFLICTING_INSTRUCTION_SCENARIOS,
  ...RESOURCE_CONSTRAINT_SCENARIOS,
  ...LANGUAGE_EDGE_CASES,
  ...RECOVERY_SCENARIOS,
];

/**
 * Edge case scenario sets for targeted testing
 */
export const EDGE_CASE_SCENARIO_SETS = {
  inputBoundary: INPUT_BOUNDARY_SCENARIOS.map((s) => s.id),
  canvasState: CANVAS_STATE_SCENARIOS.map((s) => s.id),
  conflicting: CONFLICTING_INSTRUCTION_SCENARIOS.map((s) => s.id),
  resource: RESOURCE_CONSTRAINT_SCENARIOS.map((s) => s.id),
  language: LANGUAGE_EDGE_CASES.map((s) => s.id),
  recovery: RECOVERY_SCENARIOS.map((s) => s.id),
  all: ALL_EDGE_CASE_SCENARIOS.map((s) => s.id),
};
