/**
 * Benchmark Scenarios
 *
 * Comprehensive test scenarios for evaluating AI agent reasoning quality.
 * Each scenario defines expected behavior and scoring criteria.
 *
 * Categories:
 * - chat: Pure conversation, no tools
 * - query: Canvas exploration
 * - simple_create: 1-2 tool calls
 * - complex_create: Multi-step creation
 * - modify: Edit existing elements
 * - layout: Arrangement/layout
 * - style: Styling operations
 * - diagram: Diagram creation
 * - delegation: Sub-agent delegation
 * - clarification: Ambiguous requests
 * - error_recovery: Error handling
 */

import type { BenchmarkScenario, CanvasState } from "./types.js";
import { ALL_REASONING_SCENARIOS } from "./scenarios-reasoning.js";
import { ALL_ROUTING_SCENARIOS } from "./scenarios-routing.js";
import { ALL_EDGE_CASE_SCENARIOS } from "./scenarios-edge-cases.js";
import { ALL_REGRESSION_SCENARIOS } from "./scenarios-regression.js";
import { ALL_COMPARISON_SCENARIOS } from "./scenarios-prompt-comparison.js";

// ============================================================================
// HELPER: Canvas States
// ============================================================================

const EMPTY_CANVAS: CanvasState = { elements: [] };

const CANVAS_WITH_RECTANGLES: CanvasState = {
  elements: [
    { id: "rect_1", type: "rectangle", x: 100, y: 100, width: 200, height: 100, name: "box1", backgroundColor: "#3b82f6" },
    { id: "rect_2", type: "rectangle", x: 350, y: 100, width: 200, height: 100, name: "box2", backgroundColor: "#ef4444" },
    { id: "rect_3", type: "rectangle", x: 600, y: 100, width: 200, height: 100, name: "box3", backgroundColor: "#22c55e" },
  ],
};

const CANVAS_WITH_FLOWCHART: CanvasState = {
  elements: [
    { id: "start_node", type: "ellipse", x: 200, y: 50, width: 120, height: 60, text: "Start", backgroundColor: "#22c55e" },
    { id: "process_1", type: "rectangle", x: 175, y: 150, width: 150, height: 80, text: "Process A" },
    { id: "decision_1", type: "diamond", x: 190, y: 280, width: 120, height: 120, text: "Decision?" },
    { id: "end_node", type: "ellipse", x: 200, y: 450, width: 120, height: 60, text: "End", backgroundColor: "#ef4444" },
  ],
};

const CANVAS_WITH_MIXED_ELEMENTS: CanvasState = {
  elements: [
    { id: "frame_1", type: "frame", x: 50, y: 50, width: 400, height: 300, name: "Main Frame" },
    { id: "text_1", type: "text", x: 70, y: 70, text: "Title Text", name: "header" },
    { id: "rect_1", type: "rectangle", x: 70, y: 120, width: 150, height: 100, name: "card1" },
    { id: "rect_2", type: "rectangle", x: 250, y: 120, width: 150, height: 100, name: "card2" },
    { id: "ellipse_1", type: "ellipse", x: 100, y: 250, width: 80, height: 80 },
  ],
};

// ============================================================================
// CHAT SCENARIOS (No Tools Expected)
// ============================================================================

export const CHAT_SCENARIOS: BenchmarkScenario[] = [
  {
    id: "chat-001",
    name: "Simple Greeting",
    description: "User says hello - agent should respond conversationally without tools",
    category: "chat",
    complexity: "trivial",
    prompt: "hello",
    expected: {
      shouldUseTool: false,
      expectedOutput: {
        shouldHaveUserContent: true,
        containsPatterns: ["help|canvas|create|assist"],
        notContainsPatterns: ["error|fail|cannot"],
      },
    },
    tags: ["greeting", "no-tools"],
    timeout: 15000,
  },
  {
    id: "chat-002",
    name: "Thank You Response",
    description: "User thanks the agent - agent should respond politely without tools",
    category: "chat",
    complexity: "trivial",
    prompt: "thanks for your help!",
    expected: {
      shouldUseTool: false,
      expectedOutput: {
        shouldHaveUserContent: true,
        containsPatterns: ["welcome|glad|happy|help"],
      },
    },
    tags: ["thanks", "no-tools"],
    timeout: 15000,
  },
  {
    id: "chat-003",
    name: "Capability Question",
    description: "User asks what the agent can do",
    category: "chat",
    complexity: "trivial",
    prompt: "what can you help me with?",
    expected: {
      shouldUseTool: false,
      expectedOutput: {
        shouldHaveUserContent: true,
        containsPatterns: ["canvas|create|diagram|visual|design|help"],
      },
    },
    tags: ["capabilities", "no-tools"],
    timeout: 20000,
  },
  {
    id: "chat-004",
    name: "Casual Conversation",
    description: "User makes small talk",
    category: "chat",
    complexity: "trivial",
    prompt: "how are you doing today?",
    expected: {
      shouldUseTool: false,
      expectedOutput: {
        shouldHaveUserContent: true,
      },
    },
    tags: ["smalltalk", "no-tools"],
    timeout: 15000,
  },
];

// ============================================================================
// QUERY SCENARIOS (Read-Only Exploration)
// ============================================================================

export const QUERY_SCENARIOS: BenchmarkScenario[] = [
  {
    id: "query-001",
    name: "Canvas State Query (Empty)",
    description: "User asks what's on an empty canvas",
    category: "query",
    complexity: "simple",
    prompt: "what's on the canvas?",
    initialCanvasState: EMPTY_CANVAS,
    expected: {
      shouldUseTool: true,
      expectedTools: {
        tools: ["canvas_read"],
        minCalls: 1,
        maxCalls: 2,
      },
      // Optimal: 1 canvas_read call, ~800 tokens for query response
      expectedEfficiency: {
        optimalSteps: 1,
        optimalTokens: 800,
        allowedStepOverhead: 2.0,
        allowedTokenOverhead: 1.5,
      },
      expectedReasoning: {
        optionalTags: ["analyze"],
      },
      expectedOutput: {
        shouldHaveUserContent: true,
        containsPatterns: ["empty|nothing|no element"],
      },
    },
    tags: ["query", "empty-canvas"],
    timeout: 30000,
  },
  {
    id: "query-002",
    name: "Canvas State Query (With Elements)",
    description: "User asks what's on a canvas with elements",
    category: "query",
    complexity: "simple",
    prompt: "what's currently on the canvas?",
    initialCanvasState: CANVAS_WITH_RECTANGLES,
    expected: {
      shouldUseTool: true,
      expectedTools: {
        tools: ["canvas_read"],
        minCalls: 1,
        maxCalls: 2,
      },
      expectedOutput: {
        shouldHaveUserContent: true,
        containsPatterns: ["rectangle|3|three|element"],
      },
    },
    tags: ["query", "with-elements"],
    timeout: 30000,
  },
  {
    id: "query-003",
    name: "Find Specific Element Type",
    description: "User searches for specific element types",
    category: "query",
    complexity: "simple",
    prompt: "find all rectangles on the canvas",
    initialCanvasState: CANVAS_WITH_MIXED_ELEMENTS,
    expected: {
      shouldUseTool: true,
      expectedTools: {
        tools: ["canvas_find"],
        minCalls: 1,
        maxCalls: 2,
      },
      expectedOutput: {
        shouldHaveUserContent: true,
        containsPatterns: ["rectangle|2|two|found"],
      },
    },
    tags: ["query", "find"],
    timeout: 30000,
  },
  {
    id: "query-004",
    name: "Find by Name Pattern",
    description: "User searches for elements by name",
    category: "query",
    complexity: "simple",
    prompt: "find elements named 'card'",
    initialCanvasState: CANVAS_WITH_MIXED_ELEMENTS,
    expected: {
      shouldUseTool: true,
      expectedTools: {
        tools: ["canvas_find"],
        minCalls: 1,
        maxCalls: 2,
      },
      expectedOutput: {
        shouldHaveUserContent: true,
        containsPatterns: ["card|found|2"],
      },
    },
    tags: ["query", "find-by-name"],
    timeout: 30000,
  },
];

// ============================================================================
// SIMPLE CREATE SCENARIOS (1-2 Tool Calls)
// ============================================================================

export const SIMPLE_CREATE_SCENARIOS: BenchmarkScenario[] = [
  {
    id: "simple-001",
    name: "Create Single Rectangle",
    description: "Create a single rectangle with specific properties",
    category: "simple_create",
    complexity: "simple",
    prompt: "add a blue rectangle at position 100,100",
    initialCanvasState: EMPTY_CANVAS,
    expected: {
      shouldUseTool: true,
      expectedTools: {
        tools: ["canvas_write"],
        minCalls: 1,
        maxCalls: 2,
      },
      expectedReasoning: {
        optionalTags: ["analyze", "plan"],
      },
      expectedOutput: {
        shouldHaveUserContent: true,
        containsPatterns: ["created|added|rectangle"],
        mentionsCreatedElements: true,
      },
      expectedCanvasChanges: {
        elementsCreated: {
          minCount: 1,
          maxCount: 1,
          types: ["rectangle"],
        },
      },
      // Optimal: 1 canvas_write call, ~1000 tokens for simple creation
      expectedEfficiency: {
        optimalSteps: 1,
        optimalTokens: 1000,
        allowedStepOverhead: 2.0,
        allowedTokenOverhead: 1.5,
      },
    },
    tags: ["create", "rectangle", "efficiency-baseline"],
    timeout: 45000,
  },
  {
    id: "simple-002",
    name: "Create Text Element",
    description: "Create a text element with content",
    category: "simple_create",
    complexity: "simple",
    prompt: "add a text element that says 'Hello World' at the center of the canvas",
    initialCanvasState: EMPTY_CANVAS,
    expected: {
      shouldUseTool: true,
      expectedTools: {
        tools: ["canvas_write"],
        minCalls: 1,
        maxCalls: 3,
      },
      expectedOutput: {
        shouldHaveUserContent: true,
        containsPatterns: ["created|added|text|Hello World"],
      },
      expectedCanvasChanges: {
        elementsCreated: {
          minCount: 1,
          types: ["text"],
        },
      },
    },
    tags: ["create", "text"],
    timeout: 45000,
  },
  {
    id: "simple-003",
    name: "Create Multiple Similar Elements",
    description: "Create multiple elements in a single request",
    category: "simple_create",
    complexity: "simple",
    prompt: "create 3 rectangles in a row: red, green, blue",
    initialCanvasState: EMPTY_CANVAS,
    expected: {
      shouldUseTool: true,
      expectedTools: {
        tools: ["canvas_write"],
        minCalls: 1,
        maxCalls: 3, // Should batch, but allow multiple
      },
      expectedOutput: {
        shouldHaveUserContent: true,
        containsPatterns: ["created|3|three|rectangle"],
      },
      expectedCanvasChanges: {
        elementsCreated: {
          minCount: 3,
          maxCount: 3,
          types: ["rectangle"],
        },
      },
    },
    tags: ["create", "batch", "efficiency"],
    timeout: 45000,
  },
  {
    id: "simple-004",
    name: "Create Frame with Content",
    description: "Create a frame containing other elements",
    category: "simple_create",
    complexity: "simple",
    prompt: "create a frame named 'My Frame' with a title text inside",
    initialCanvasState: EMPTY_CANVAS,
    expected: {
      shouldUseTool: true,
      expectedTools: {
        tools: ["canvas_write"],
        minCalls: 1,
        maxCalls: 3,
      },
      expectedOutput: {
        shouldHaveUserContent: true,
        containsPatterns: ["created|frame"],
      },
      expectedCanvasChanges: {
        elementsCreated: {
          minCount: 2,
          types: ["frame", "text"],
        },
      },
    },
    tags: ["create", "frame", "hierarchy"],
    timeout: 45000,
  },
];

// ============================================================================
// MODIFICATION SCENARIOS
// ============================================================================

export const MODIFY_SCENARIOS: BenchmarkScenario[] = [
  {
    id: "modify-001",
    name: "Move Element",
    description: "Move an existing element",
    category: "modify",
    complexity: "simple",
    prompt: "move box1 to the right by 100 pixels",
    initialCanvasState: CANVAS_WITH_RECTANGLES,
    expected: {
      shouldUseTool: true,
      expectedTools: {
        tools: ["canvas_edit"],
        minCalls: 1,
        maxCalls: 3,
      },
      expectedOutput: {
        shouldHaveUserContent: true,
        containsPatterns: ["moved|updated|box1"],
      },
    },
    tags: ["modify", "move"],
    timeout: 45000,
  },
  {
    id: "modify-002",
    name: "Delete Element",
    description: "Delete an existing element",
    category: "modify",
    complexity: "simple",
    prompt: "delete the element named 'box2'",
    initialCanvasState: CANVAS_WITH_RECTANGLES,
    expected: {
      shouldUseTool: true,
      expectedTools: {
        tools: ["canvas_find", "canvas_edit"],
        ordered: false,
        minCalls: 1,
        maxCalls: 3,
      },
      expectedOutput: {
        shouldHaveUserContent: true,
        containsPatterns: ["deleted|removed|box2"],
      },
      expectedCanvasChanges: {
        elementsDeleted: 1,
      },
    },
    tags: ["modify", "delete"],
    timeout: 45000,
  },
  {
    id: "modify-003",
    name: "Change Element Color",
    description: "Update the color of an element",
    category: "modify",
    complexity: "simple",
    prompt: "change the color of box1 to yellow",
    initialCanvasState: CANVAS_WITH_RECTANGLES,
    expected: {
      shouldUseTool: true,
      expectedTools: {
        tools: ["canvas_edit"],
        minCalls: 1,
        maxCalls: 3,
      },
      expectedOutput: {
        shouldHaveUserContent: true,
        containsPatterns: ["changed|updated|color|yellow|box1"],
      },
    },
    tags: ["modify", "style", "color"],
    timeout: 45000,
  },
  {
    id: "modify-004",
    name: "Resize Element",
    description: "Resize an existing element",
    category: "modify",
    complexity: "simple",
    prompt: "make box1 twice as wide",
    initialCanvasState: CANVAS_WITH_RECTANGLES,
    expected: {
      shouldUseTool: true,
      expectedTools: {
        tools: ["canvas_read", "canvas_edit"],
        ordered: false,
        minCalls: 1,
        maxCalls: 4,
      },
      expectedOutput: {
        shouldHaveUserContent: true,
        containsPatterns: ["resized|updated|wider|box1"],
      },
    },
    tags: ["modify", "resize"],
    timeout: 45000,
  },
];

// ============================================================================
// COMPLEX CREATE SCENARIOS (Multi-step)
// ============================================================================

export const COMPLEX_CREATE_SCENARIOS: BenchmarkScenario[] = [
  {
    id: "complex-001",
    name: "Simple Flowchart",
    description: "Create a basic flowchart with multiple connected nodes",
    category: "complex_create",
    complexity: "moderate",
    prompt: "create a simple flowchart: Start → Process → End",
    initialCanvasState: EMPTY_CANVAS,
    expected: {
      shouldUseTool: true,
      expectedTools: {
        tools: ["canvas_write"],
        minCalls: 1,
        maxCalls: 5,
      },
      expectedReasoning: {
        requiredTags: ["analyze", "plan"],
        optionalTags: ["summarize"],
      },
      expectedOutput: {
        shouldHaveUserContent: true,
        containsPatterns: ["flowchart|created|start|process|end"],
      },
      expectedCanvasChanges: {
        elementsCreated: {
          minCount: 3,
          types: ["rectangle", "ellipse", "arrow"],
        },
      },
    },
    tags: ["complex", "flowchart", "diagram"],
    timeout: 90000,
  },
  {
    id: "complex-002",
    name: "Grid Layout Creation",
    description: "Create a grid of elements",
    category: "complex_create",
    complexity: "moderate",
    prompt: "create a 2x2 grid of colored rectangles with 10px spacing",
    initialCanvasState: EMPTY_CANVAS,
    expected: {
      shouldUseTool: true,
      expectedTools: {
        tools: ["canvas_write"],
        minCalls: 1,
        maxCalls: 4,
      },
      expectedReasoning: {
        requiredTags: ["plan"],
      },
      expectedOutput: {
        shouldHaveUserContent: true,
        containsPatterns: ["grid|4|four|rectangle|created"],
      },
      expectedCanvasChanges: {
        elementsCreated: {
          minCount: 4,
          maxCount: 5, // Allow frame container
          types: ["rectangle"],
        },
      },
    },
    tags: ["complex", "grid", "layout"],
    timeout: 90000,
  },
  {
    id: "complex-003",
    name: "Card Layout",
    description: "Create a card-based layout",
    category: "complex_create",
    complexity: "moderate",
    prompt: "create 3 cards with titles and descriptions, arranged horizontally",
    initialCanvasState: EMPTY_CANVAS,
    expected: {
      shouldUseTool: true,
      expectedTools: {
        tools: ["canvas_write"],
        minCalls: 1,
        maxCalls: 6,
      },
      expectedReasoning: {
        requiredTags: ["analyze", "plan"],
      },
      expectedOutput: {
        shouldHaveUserContent: true,
        containsPatterns: ["card|3|three|created"],
      },
      expectedCanvasChanges: {
        elementsCreated: {
          minCount: 3,
        },
      },
    },
    tags: ["complex", "cards", "layout"],
    timeout: 90000,
  },
];

// ============================================================================
// CLARIFICATION SCENARIOS (Ambiguous Requests)
// ============================================================================

export const CLARIFICATION_SCENARIOS: BenchmarkScenario[] = [
  {
    id: "clarify-001",
    name: "Vague Visualization Request",
    description: "User asks for visualization without specifying type",
    category: "clarification",
    complexity: "simple",
    prompt: "help me visualize something",
    initialCanvasState: EMPTY_CANVAS,
    expected: {
      shouldUseTool: false, // Should ask clarifying questions, not use tools
      expectedClarity: {
        outputType: "unknown",
        topicClarity: "missing",
        decision: "clarify",
      },
      expectedReasoning: {
        requiredTags: ["assess_clarity"],
      },
      expectedOutput: {
        shouldHaveUserContent: true,
        containsPatterns: ["what|type|which|kind|help|clarif"],
      },
    },
    tags: ["clarification", "vague"],
    timeout: 45000,
  },
  {
    id: "clarify-002",
    name: "Missing Topic",
    description: "User specifies type but not topic",
    category: "clarification",
    complexity: "simple",
    prompt: "create a diagram",
    initialCanvasState: EMPTY_CANVAS,
    expected: {
      shouldUseTool: false,
      expectedClarity: {
        topicClarity: "missing",
        decision: "clarify",
      },
      expectedReasoning: {
        requiredTags: ["assess_clarity"],
      },
      expectedOutput: {
        shouldHaveUserContent: true,
        containsPatterns: ["what|about|topic|kind|type"],
      },
    },
    tags: ["clarification", "missing-topic"],
    timeout: 45000,
  },
  {
    id: "clarify-003",
    name: "Clear Request (No Clarification)",
    description: "Clear request should NOT trigger clarification",
    category: "clarification",
    complexity: "simple",
    prompt: "create a mindmap about machine learning with 4 branches",
    initialCanvasState: EMPTY_CANVAS,
    expected: {
      shouldUseTool: true, // Should proceed with tools
      expectedClarity: {
        outputType: "mindmap",
        topicClarity: "specific",
        decision: "execute",
      },
      expectedTools: {
        tools: ["canvas_write", "canvas_delegate"],
        ordered: false,
        minCalls: 1,
      },
      expectedOutput: {
        shouldHaveUserContent: true,
        notContainsPatterns: ["what would you like|what type|clarify"],
      },
    },
    tags: ["clarification", "clear-request"],
    timeout: 90000,
  },
];

// ============================================================================
// DELEGATION SCENARIOS
// ============================================================================

export const DELEGATION_SCENARIOS: BenchmarkScenario[] = [
  {
    id: "delegate-001",
    name: "Complex Mindmap Delegation",
    description: "Complex mindmap should be delegated to specialist",
    category: "delegation",
    complexity: "complex",
    prompt: "create a detailed mindmap about artificial intelligence with branches for ML, NLP, Computer Vision, and Robotics, each with 3-4 sub-topics",
    initialCanvasState: EMPTY_CANVAS,
    expected: {
      shouldUseTool: true,
      expectedDelegation: {
        shouldDelegate: true,
        skill: "mindmap",
      },
      expectedTools: {
        tools: ["canvas_delegate"],
        minCalls: 1,
      },
      expectedReasoning: {
        requiredTags: ["analyze", "assess_clarity"],
        optionalTags: ["plan"],
      },
      expectedOutput: {
        shouldHaveUserContent: true,
        containsPatterns: ["mindmap|created|AI|artificial intelligence"],
      },
    },
    tags: ["delegation", "mindmap"],
    timeout: 120000,
  },
  {
    id: "delegate-002",
    name: "Infographic Delegation",
    description: "Complex infographic should use planning then execution",
    category: "delegation",
    complexity: "expert",
    prompt: "create a professional infographic about climate change with timeline, statistics section, and call-to-action",
    initialCanvasState: EMPTY_CANVAS,
    expected: {
      shouldUseTool: true,
      expectedDelegation: {
        shouldDelegate: true,
      },
      expectedReasoning: {
        requiredTags: ["analyze", "assess_clarity", "plan"],
      },
      expectedClarity: {
        complexity: "multi-section",
      },
      expectedOutput: {
        shouldHaveUserContent: true,
        containsPatterns: ["infographic|created|climate"],
      },
    },
    tags: ["delegation", "infographic", "multi-section"],
    timeout: 180000,
  },
];

// ============================================================================
// ERROR RECOVERY SCENARIOS
// ============================================================================

export const ERROR_RECOVERY_SCENARIOS: BenchmarkScenario[] = [
  {
    id: "error-001",
    name: "Non-existent Element Reference",
    description: "Handle request for non-existent element gracefully",
    category: "error_recovery",
    complexity: "simple",
    prompt: "delete the element with id 'nonexistent-element-12345'",
    initialCanvasState: CANVAS_WITH_RECTANGLES,
    expected: {
      shouldUseTool: true,
      expectedTools: {
        tools: ["canvas_edit", "canvas_find"],
        ordered: false,
      },
      expectedOutput: {
        shouldHaveUserContent: true,
        containsPatterns: ["not found|doesn't exist|could not|no element"],
      },
    },
    tags: ["error", "not-found"],
    timeout: 45000,
  },
  {
    id: "error-002",
    name: "Empty Search Results",
    description: "Handle empty search results gracefully",
    category: "error_recovery",
    complexity: "simple",
    prompt: "find all purple unicorns on the canvas",
    initialCanvasState: CANVAS_WITH_RECTANGLES,
    expected: {
      shouldUseTool: true,
      expectedTools: {
        tools: ["canvas_find"],
      },
      expectedOutput: {
        shouldHaveUserContent: true,
        containsPatterns: ["no |none|not found|couldn't find|0|empty"],
      },
    },
    tags: ["error", "empty-results"],
    timeout: 45000,
  },
];

// ============================================================================
// EFFICIENCY SCENARIOS
// ============================================================================

export const EFFICIENCY_SCENARIOS: BenchmarkScenario[] = [
  {
    id: "efficiency-001",
    name: "Batch vs Multiple Calls",
    description: "Should use batch operations for multiple similar elements",
    category: "simple_create",
    complexity: "simple",
    prompt: "create 4 rectangles: red at (0,0), green at (100,0), blue at (200,0), yellow at (300,0)",
    initialCanvasState: EMPTY_CANVAS,
    expected: {
      shouldUseTool: true,
      expectedTools: {
        tools: ["canvas_write"],
        minCalls: 1,
        maxCalls: 2, // Should batch ideally in 1 call
      },
      expectedOutput: {
        shouldHaveUserContent: true,
        containsPatterns: ["4|four|rectangle|created"],
      },
      expectedCanvasChanges: {
        elementsCreated: {
          minCount: 4,
          maxCount: 4,
        },
      },
    },
    tags: ["efficiency", "batch"],
    timeout: 45000,
  },
  {
    id: "efficiency-002",
    name: "Unnecessary Read Avoidance",
    description: "Should not read canvas for simple direct operations",
    category: "simple_create",
    complexity: "trivial",
    prompt: "add a rectangle at 0,0 with width 100 and height 50",
    initialCanvasState: EMPTY_CANVAS,
    expected: {
      shouldUseTool: true,
      expectedTools: {
        tools: ["canvas_write"],
        minCalls: 1,
        maxCalls: 1, // Should not read first for simple create
      },
      expectedOutput: {
        shouldHaveUserContent: true,
        containsPatterns: ["created|added|rectangle"],
      },
    },
    tags: ["efficiency", "minimal-tools"],
    timeout: 30000,
  },
];

// ============================================================================
// CONDITIONAL LOGIC SCENARIOS
// ============================================================================

export const CONDITIONAL_SCENARIOS: BenchmarkScenario[] = [
  {
    id: "conditional-001",
    name: "Empty Canvas Conditional",
    description: "Conditional behavior based on empty canvas",
    category: "query",
    complexity: "moderate",
    prompt: "if the canvas is empty, create a welcome message. Otherwise, list what's there.",
    initialCanvasState: EMPTY_CANVAS,
    expected: {
      shouldUseTool: true,
      expectedTools: {
        tools: ["canvas_read", "canvas_write"],
        ordered: true,
        minCalls: 2,
      },
      expectedReasoning: {
        requiredTags: ["analyze"],
      },
      expectedOutput: {
        shouldHaveUserContent: true,
        containsPatterns: ["welcome|empty|created"],
      },
      expectedCanvasChanges: {
        elementsCreated: {
          minCount: 1,
        },
      },
    },
    tags: ["conditional", "empty-canvas"],
    timeout: 60000,
  },
  {
    id: "conditional-002",
    name: "Non-Empty Canvas Conditional",
    description: "Conditional behavior based on populated canvas",
    category: "query",
    complexity: "moderate",
    prompt: "if the canvas is empty, create a welcome message. Otherwise, list what's there.",
    initialCanvasState: CANVAS_WITH_RECTANGLES,
    expected: {
      shouldUseTool: true,
      expectedTools: {
        tools: ["canvas_read"],
        minCalls: 1,
        maxCalls: 2,
      },
      expectedOutput: {
        shouldHaveUserContent: true,
        containsPatterns: ["rectangle|3|three|box"],
      },
    },
    tags: ["conditional", "with-elements"],
    timeout: 60000,
  },
];

// ============================================================================
// ALL SCENARIOS COMBINED
// ============================================================================

export const ALL_SCENARIOS: BenchmarkScenario[] = [
  ...CHAT_SCENARIOS,
  ...QUERY_SCENARIOS,
  ...SIMPLE_CREATE_SCENARIOS,
  ...MODIFY_SCENARIOS,
  ...COMPLEX_CREATE_SCENARIOS,
  ...CLARIFICATION_SCENARIOS,
  ...DELEGATION_SCENARIOS,
  ...ERROR_RECOVERY_SCENARIOS,
  ...EFFICIENCY_SCENARIOS,
  ...CONDITIONAL_SCENARIOS,
  // Specialized scenario suites
  ...ALL_REASONING_SCENARIOS,
  ...ALL_ROUTING_SCENARIOS,
  ...ALL_EDGE_CASE_SCENARIOS,
  ...ALL_REGRESSION_SCENARIOS,
  ...ALL_COMPARISON_SCENARIOS,
];

// ============================================================================
// SCENARIO HELPERS
// ============================================================================

/**
 * Get scenarios by category
 */
export function getScenariosByCategory(category: string): BenchmarkScenario[] {
  return ALL_SCENARIOS.filter((s) => s.category === category);
}

/**
 * Get scenarios by complexity
 */
export function getScenariosByComplexity(complexity: string): BenchmarkScenario[] {
  return ALL_SCENARIOS.filter((s) => s.complexity === complexity);
}

/**
 * Get scenarios by tags
 */
export function getScenariosByTags(tags: string[]): BenchmarkScenario[] {
  return ALL_SCENARIOS.filter((s) =>
    tags.some((tag) => s.tags?.includes(tag))
  );
}

/**
 * Get scenario by ID
 */
export function getScenarioById(id: string): BenchmarkScenario | undefined {
  return ALL_SCENARIOS.find((s) => s.id === id);
}

/**
 * Quick scenario sets for common testing patterns
 */
export const SCENARIO_SETS = {
  /** Minimal smoke test */
  smoke: ["chat-001", "query-001", "simple-001"],

  /** Core functionality */
  core: [
    "chat-001",
    "chat-003",
    "query-001",
    "query-002",
    "simple-001",
    "simple-002",
    "modify-001",
    "complex-001",
  ],

  /** Reasoning quality */
  reasoning: [
    "complex-001",
    "complex-002",
    "clarify-001",
    "clarify-002",
    "clarify-003",
    "delegate-001",
  ],

  /** Tool usage efficiency */
  efficiency: [
    "efficiency-001",
    "efficiency-002",
    "simple-003",
  ],

  /** Error handling */
  errors: [
    "error-001",
    "error-002",
  ],

  /** Full suite */
  full: ALL_SCENARIOS.map((s) => s.id),
};
