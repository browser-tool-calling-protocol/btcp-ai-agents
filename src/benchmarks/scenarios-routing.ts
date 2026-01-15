/**
 * Semantic Routing Scenarios
 *
 * Tests the <assess_clarity> phase and semantic routing logic.
 * These scenarios evaluate how well the agent categorizes and routes requests.
 *
 * Routing decisions:
 * - execute: Clear request, proceed immediately
 * - clarify: Missing information, ask questions
 * - delegate: Complex multi-section, use specialist
 * - decompose: Multi-part request, break into steps
 */

import type { BenchmarkScenario } from "./types.js";

// ============================================================================
// OUTPUT TYPE RECOGNITION
// Tests correct identification of visual output types
// ============================================================================

export const OUTPUT_TYPE_SCENARIOS: BenchmarkScenario[] = [
  {
    id: "route-type-001",
    name: "Recognize Mindmap Request",
    description: "Agent should recognize mindmap-related keywords",
    category: "delegation",
    complexity: "moderate",
    prompt: "I want to brainstorm ideas about marketing strategies",
    expected: {
      shouldUseTool: true,
      expectedClarity: {
        outputType: "mindmap",
        topicClarity: "specific",
        decision: "execute",
      },
      expectedOutput: {
        shouldHaveUserContent: true,
      },
    },
    tags: ["routing", "output-type", "mindmap"],
    timeout: 90000,
  },
  {
    id: "route-type-002",
    name: "Recognize Flowchart Request",
    description: "Agent should recognize process/flow keywords",
    category: "complex_create",
    complexity: "moderate",
    prompt: "Show me how the user registration process works",
    expected: {
      shouldUseTool: true,
      expectedClarity: {
        outputType: "flowchart",
        topicClarity: "specific",
      },
      expectedOutput: {
        shouldHaveUserContent: true,
      },
    },
    tags: ["routing", "output-type", "flowchart"],
    timeout: 90000,
  },
  {
    id: "route-type-003",
    name: "Recognize Kanban Request",
    description: "Agent should recognize task/project management keywords",
    category: "complex_create",
    complexity: "moderate",
    prompt: "I need to track my project tasks across different stages",
    expected: {
      shouldUseTool: true,
      expectedClarity: {
        outputType: "kanban",
      },
      expectedOutput: {
        shouldHaveUserContent: true,
      },
    },
    tags: ["routing", "output-type", "kanban"],
    timeout: 90000,
  },
  {
    id: "route-type-004",
    name: "Recognize Timeline Request",
    description: "Agent should recognize chronological/history keywords",
    category: "complex_create",
    complexity: "moderate",
    prompt: "Show the history of our product releases over the past year",
    expected: {
      shouldUseTool: true,
      expectedClarity: {
        outputType: "timeline",
      },
      expectedOutput: {
        shouldHaveUserContent: true,
      },
    },
    tags: ["routing", "output-type", "timeline"],
    timeout: 90000,
  },
  {
    id: "route-type-005",
    name: "Recognize Org Chart Request",
    description: "Agent should recognize organizational/hierarchy keywords",
    category: "complex_create",
    complexity: "moderate",
    prompt: "Create a chart showing our company's reporting structure",
    expected: {
      shouldUseTool: true,
      expectedClarity: {
        outputType: "orgchart",
      },
      expectedOutput: {
        shouldHaveUserContent: true,
      },
    },
    tags: ["routing", "output-type", "orgchart"],
    timeout: 90000,
  },
  {
    id: "route-type-006",
    name: "Recognize Wireframe Request",
    description: "Agent should recognize UI/design keywords",
    category: "complex_create",
    complexity: "moderate",
    prompt: "Design the layout for our mobile app's home screen",
    expected: {
      shouldUseTool: true,
      expectedClarity: {
        outputType: "wireframe",
      },
      expectedOutput: {
        shouldHaveUserContent: true,
      },
    },
    tags: ["routing", "output-type", "wireframe"],
    timeout: 90000,
  },
  {
    id: "route-type-007",
    name: "Ambiguous Type - Could Be Multiple",
    description: "Agent should clarify when request could be multiple types",
    category: "clarification",
    complexity: "simple",
    prompt: "Create a visual to explain our sales process",
    expected: {
      shouldUseTool: false,
      expectedClarity: {
        outputType: "unknown",
        decision: "clarify",
      },
      expectedOutput: {
        shouldHaveUserContent: true,
        containsPatterns: ["flowchart|diagram|what type|which"],
      },
    },
    tags: ["routing", "output-type", "ambiguous"],
    timeout: 45000,
  },
];

// ============================================================================
// TOPIC CLARITY ASSESSMENT
// Tests detection of topic specificity and completeness
// ============================================================================

export const TOPIC_CLARITY_SCENARIOS: BenchmarkScenario[] = [
  {
    id: "route-topic-001",
    name: "Specific Topic - Complete",
    description: "Clear topic with sufficient detail",
    category: "complex_create",
    complexity: "moderate",
    prompt: "Create a flowchart for e-commerce checkout: cart review, shipping, payment, confirmation",
    expected: {
      shouldUseTool: true,
      expectedClarity: {
        topicClarity: "specific",
        decision: "execute",
      },
      expectedOutput: {
        shouldHaveUserContent: true,
        notContainsPatterns: ["what|which|clarify|tell me more"],
      },
    },
    tags: ["routing", "topic", "specific"],
    timeout: 90000,
  },
  {
    id: "route-topic-002",
    name: "Vague Topic - Missing Context",
    description: "Topic mentioned but lacks actionable detail",
    category: "clarification",
    complexity: "simple",
    prompt: "Create a mindmap about technology",
    expected: {
      shouldUseTool: false,
      expectedClarity: {
        topicClarity: "vague",
        decision: "clarify",
      },
      expectedOutput: {
        shouldHaveUserContent: true,
        containsPatterns: ["aspect|specific|what kind|area|focus"],
      },
    },
    tags: ["routing", "topic", "vague"],
    timeout: 45000,
  },
  {
    id: "route-topic-003",
    name: "Missing Topic Entirely",
    description: "Type clear but no topic provided",
    category: "clarification",
    complexity: "simple",
    prompt: "Make me a kanban board",
    expected: {
      shouldUseTool: false,
      expectedClarity: {
        topicClarity: "missing",
        decision: "clarify",
      },
      expectedOutput: {
        shouldHaveUserContent: true,
        containsPatterns: ["what|project|task|tracking"],
      },
    },
    tags: ["routing", "topic", "missing"],
    timeout: 45000,
  },
  {
    id: "route-topic-004",
    name: "Topic Inferred from Context",
    description: "Topic can be inferred from existing canvas content",
    category: "complex_create",
    complexity: "moderate",
    prompt: "Add more branches to this",
    initialCanvasState: {
      elements: [
        {
          id: "center",
          type: "ellipse",
          x: 400,
          y: 300,
          width: 120,
          height: 80,
          text: "Machine Learning",
          backgroundColor: "#3b82f6",
        },
        {
          id: "branch1",
          type: "rectangle",
          x: 200,
          y: 200,
          width: 100,
          height: 60,
          text: "Supervised",
        },
      ],
    },
    expected: {
      shouldUseTool: true,
      expectedClarity: {
        topicClarity: "specific", // Inferred from canvas
      },
      expectedTools: {
        tools: ["canvas_read", "canvas_write"],
        ordered: false,
      },
    },
    tags: ["routing", "topic", "inferred"],
    timeout: 90000,
  },
  {
    id: "route-topic-005",
    name: "Implied Topic from Domain",
    description: "Topic implied by domain-specific terminology",
    category: "complex_create",
    complexity: "moderate",
    prompt: "Create a sprint backlog with story points",
    expected: {
      shouldUseTool: true,
      expectedClarity: {
        topicClarity: "specific", // Agile/Scrum context implied
        outputType: "kanban",
      },
      expectedOutput: {
        shouldHaveUserContent: true,
      },
    },
    tags: ["routing", "topic", "domain-implied"],
    timeout: 90000,
  },
];

// ============================================================================
// COMPLEXITY ROUTING
// Tests routing decisions based on request complexity
// ============================================================================

export const COMPLEXITY_ROUTING_SCENARIOS: BenchmarkScenario[] = [
  {
    id: "route-complex-001",
    name: "Single Section - Execute Directly",
    description: "Simple single-section request should execute",
    category: "simple_create",
    complexity: "simple",
    prompt: "Create a simple 3-node flowchart",
    expected: {
      shouldUseTool: true,
      expectedClarity: {
        complexity: "single",
        decision: "execute",
      },
      expectedOutput: {
        shouldHaveUserContent: true,
      },
    },
    tags: ["routing", "complexity", "single"],
    timeout: 60000,
  },
  {
    id: "route-complex-002",
    name: "Multi-Section - Delegate",
    description: "Multi-section request should trigger delegation",
    category: "delegation",
    complexity: "complex",
    prompt: "Create a comprehensive dashboard with: 1) metrics overview, 2) team status section, 3) timeline of milestones, 4) risk matrix",
    expected: {
      shouldUseTool: true,
      expectedClarity: {
        complexity: "multi-section",
        decision: "delegate",
      },
      expectedDelegation: {
        shouldDelegate: true,
      },
      expectedReasoning: {
        requiredTags: ["assess_clarity", "plan"],
      },
    },
    tags: ["routing", "complexity", "multi-section"],
    timeout: 180000,
  },
  {
    id: "route-complex-003",
    name: "Multi-Type Request - Decompose",
    description: "Request requiring multiple output types",
    category: "delegation",
    complexity: "complex",
    prompt: "I need a mindmap of our features AND a timeline showing the release schedule",
    expected: {
      shouldUseTool: true,
      expectedClarity: {
        complexity: "multi-section",
      },
      expectedReasoning: {
        requiredTags: ["analyze", "plan"],
      },
      expectedOutput: {
        shouldHaveUserContent: true,
      },
    },
    tags: ["routing", "complexity", "multi-type"],
    timeout: 180000,
  },
  {
    id: "route-complex-004",
    name: "Iterative Request",
    description: "Request that builds on existing content",
    category: "modify",
    complexity: "moderate",
    prompt: "Now add error handling branches to the flowchart",
    initialCanvasState: {
      elements: [
        { id: "start", type: "ellipse", x: 200, y: 50, width: 100, height: 60, text: "Start" },
        { id: "process", type: "rectangle", x: 175, y: 150, width: 150, height: 80, text: "Process" },
        { id: "end", type: "ellipse", x: 200, y: 280, width: 100, height: 60, text: "End" },
      ],
    },
    expected: {
      shouldUseTool: true,
      expectedClarity: {
        complexity: "single", // Adding to existing, not multi-section
      },
      expectedTools: {
        tools: ["canvas_read", "canvas_write"],
        ordered: false,
      },
    },
    tags: ["routing", "complexity", "iterative"],
    timeout: 90000,
  },
];

// ============================================================================
// ROUTING EDGE CASES
// Tests boundary conditions in routing logic
// ============================================================================

export const ROUTING_EDGE_CASES: BenchmarkScenario[] = [
  {
    id: "route-edge-001",
    name: "Mixed Intent - Create and Query",
    description: "Request combines creation and query",
    category: "complex_create",
    complexity: "moderate",
    prompt: "First tell me what's on the canvas, then add a header if there isn't one",
    initialCanvasState: {
      elements: [
        { id: "rect1", type: "rectangle", x: 100, y: 100, width: 200, height: 100 },
      ],
    },
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
    },
    tags: ["routing", "edge-case", "mixed-intent"],
    timeout: 90000,
  },
  {
    id: "route-edge-002",
    name: "Negative Intent - Don't Create",
    description: "Request explicitly says not to create",
    category: "query",
    complexity: "simple",
    prompt: "Don't create anything, just describe what's on the canvas",
    initialCanvasState: {
      elements: [
        { id: "el1", type: "text", x: 50, y: 50, text: "Hello" },
        { id: "el2", type: "rectangle", x: 100, y: 150, width: 100, height: 80 },
      ],
    },
    expected: {
      shouldUseTool: true,
      expectedTools: {
        tools: ["canvas_read"],
        maxCalls: 2,
      },
      expectedOutput: {
        shouldHaveUserContent: true,
      },
      expectedCanvasChanges: {
        elementsCreated: {
          minCount: 0,
          maxCount: 0,
        },
      },
    },
    tags: ["routing", "edge-case", "negative-intent"],
    timeout: 45000,
  },
  {
    id: "route-edge-003",
    name: "Conditional Creation",
    description: "Request with conditional logic",
    category: "query",
    complexity: "moderate",
    prompt: "If there are fewer than 5 elements, add rectangles until there are 5",
    initialCanvasState: {
      elements: [
        { id: "el1", type: "rectangle", x: 0, y: 0, width: 50, height: 50 },
        { id: "el2", type: "rectangle", x: 100, y: 0, width: 50, height: 50 },
      ],
    },
    expected: {
      shouldUseTool: true,
      expectedTools: {
        tools: ["canvas_read", "canvas_write"],
        ordered: true,
        minCalls: 2,
      },
      expectedCanvasChanges: {
        elementsCreated: {
          minCount: 3,
          maxCount: 3,
        },
      },
    },
    tags: ["routing", "edge-case", "conditional"],
    timeout: 90000,
  },
  {
    id: "route-edge-004",
    name: "Self-Referential Request",
    description: "Request references its own characteristics",
    category: "simple_create",
    complexity: "simple",
    prompt: "Create a text element that contains this exact sentence",
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
    tags: ["routing", "edge-case", "self-reference"],
    timeout: 45000,
  },
  {
    id: "route-edge-005",
    name: "Empty Request",
    description: "User sends essentially empty request",
    category: "clarification",
    complexity: "trivial",
    prompt: "...",
    expected: {
      shouldUseTool: false,
      expectedOutput: {
        shouldHaveUserContent: true,
        containsPatterns: ["help|assist|what|can"],
      },
    },
    tags: ["routing", "edge-case", "empty"],
    timeout: 15000,
  },
  {
    id: "route-edge-006",
    name: "Nonsense Request",
    description: "Request doesn't make semantic sense",
    category: "clarification",
    complexity: "simple",
    prompt: "colorful invisible rectangle triangle at everywhere",
    expected: {
      shouldUseTool: false,
      expectedOutput: {
        shouldHaveUserContent: true,
        containsPatterns: ["understand|clarify|what|mean|help"],
      },
    },
    tags: ["routing", "edge-case", "nonsense"],
    timeout: 30000,
  },
];

// ============================================================================
// CONTEXT SENSITIVITY
// Tests routing based on conversation/canvas context
// ============================================================================

export const CONTEXT_SENSITIVITY_SCENARIOS: BenchmarkScenario[] = [
  {
    id: "route-ctx-001",
    name: "Follow-up Request - Implicit Reference",
    description: "Implicit reference to previous action",
    category: "modify",
    complexity: "simple",
    prompt: "now make it bigger",
    initialCanvasState: {
      elements: [
        {
          id: "recently_created",
          type: "rectangle",
          x: 100,
          y: 100,
          width: 100,
          height: 80,
          name: "recent",
        },
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
        containsPatterns: ["resized|bigger|larger|updated"],
      },
    },
    tags: ["routing", "context", "follow-up"],
    timeout: 60000,
  },
  {
    id: "route-ctx-002",
    name: "Contextual 'This' Reference",
    description: "Request using 'this' without selection",
    category: "clarification",
    complexity: "simple",
    prompt: "delete this",
    initialCanvasState: {
      elements: [
        { id: "el1", type: "rectangle", x: 0, y: 0, width: 100, height: 100 },
        { id: "el2", type: "rectangle", x: 200, y: 0, width: 100, height: 100 },
        { id: "el3", type: "rectangle", x: 400, y: 0, width: 100, height: 100 },
      ],
    },
    expected: {
      shouldUseTool: false,
      expectedClarity: {
        decision: "clarify",
      },
      expectedOutput: {
        shouldHaveUserContent: true,
        containsPatterns: ["which|what|element|specify"],
      },
    },
    tags: ["routing", "context", "ambiguous-reference"],
    timeout: 45000,
  },
  {
    id: "route-ctx-003",
    name: "Canvas Type Detection",
    description: "Infer request type from canvas content",
    category: "modify",
    complexity: "moderate",
    prompt: "add two more items",
    initialCanvasState: {
      elements: [
        {
          id: "col1",
          type: "frame",
          x: 0,
          y: 0,
          width: 200,
          height: 400,
          name: "To Do",
        },
        {
          id: "col2",
          type: "frame",
          x: 220,
          y: 0,
          width: 200,
          height: 400,
          name: "In Progress",
        },
        {
          id: "card1",
          type: "rectangle",
          x: 10,
          y: 50,
          width: 180,
          height: 60,
          text: "Task 1",
        },
      ],
    },
    expected: {
      shouldUseTool: true,
      // Should recognize kanban structure and add cards
      expectedTools: {
        tools: ["canvas_read", "canvas_write"],
        ordered: false,
      },
      expectedCanvasChanges: {
        elementsCreated: {
          minCount: 2,
        },
      },
    },
    tags: ["routing", "context", "canvas-inference"],
    timeout: 90000,
  },
];

// ============================================================================
// EXPORT ALL ROUTING SCENARIOS
// ============================================================================

export const ALL_ROUTING_SCENARIOS: BenchmarkScenario[] = [
  ...OUTPUT_TYPE_SCENARIOS,
  ...TOPIC_CLARITY_SCENARIOS,
  ...COMPLEXITY_ROUTING_SCENARIOS,
  ...ROUTING_EDGE_CASES,
  ...CONTEXT_SENSITIVITY_SCENARIOS,
];

/**
 * Routing scenario sets for targeted testing
 */
export const ROUTING_SCENARIO_SETS = {
  outputType: OUTPUT_TYPE_SCENARIOS.map((s) => s.id),
  topicClarity: TOPIC_CLARITY_SCENARIOS.map((s) => s.id),
  complexity: COMPLEXITY_ROUTING_SCENARIOS.map((s) => s.id),
  edgeCases: ROUTING_EDGE_CASES.map((s) => s.id),
  contextSensitivity: CONTEXT_SENSITIVITY_SCENARIOS.map((s) => s.id),
  all: ALL_ROUTING_SCENARIOS.map((s) => s.id),
};
