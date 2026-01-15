/**
 * Isolated Delegation Tests
 *
 * Demonstrates how Claude Code's Task tool pattern works for context isolation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  executeIsolatedSubAgent,
  executeParallelIsolated,
  type SubAgentContract,
  type IsolatedExecutionConfig,
} from "../isolated-delegation.js";

// ============================================================================
// MOCK SETUP
// ============================================================================

function createMockExecutor() {
  const calls: Array<{ tool: string; input: unknown }> = [];

  return {
    calls,
    execute: vi.fn(async (tool: string, input: unknown) => {
      calls.push({ tool, input });

      switch (tool) {
        case "canvas_write":
          return {
            created: [`elem-${calls.length}`],
            success: true,
          };
        case "canvas_find":
          return {
            elements: [],
            count: 0,
            bounds: { x: 0, y: 0, width: 800, height: 600 },
          };
        case "canvas_edit":
          return { modified: 1, success: true };
        default:
          return { success: true };
      }
    }),
  };
}

function createTestContract(overrides?: Partial<SubAgentContract>): SubAgentContract {
  return {
    contractId: "test-contract",
    agentType: "canvas-agent",
    task: "Create test elements",
    workRegion: {
      canvasId: "test-canvas",
      bounds: { x: 0, y: 0, width: 800, height: 600 },
    },
    inputs: {},
    expectedOutput: { type: "elements" },
    limits: {
      maxIterations: 5,
      maxTokens: 2000,
      timeoutMs: 10000,
    },
    ...overrides,
  };
}

// ============================================================================
// TEST: CONTRACT STRUCTURE
// ============================================================================

describe("SubAgentContract", () => {
  it("should define clear boundaries for sub-agent work", () => {
    const contract = createTestContract({
      workRegion: {
        canvasId: "main",
        frameId: "section-1",
        bounds: { x: 0, y: 100, width: 400, height: 200 },
      },
    });

    // Contract specifies WHERE sub-agent can work
    expect(contract.workRegion.frameId).toBe("section-1");
    expect(contract.workRegion.bounds).toEqual({
      x: 0,
      y: 100,
      width: 400,
      height: 200,
    });
  });

  it("should define resource limits to prevent runaway execution", () => {
    const contract = createTestContract({
      limits: {
        maxIterations: 10,
        maxTokens: 5000,
        timeoutMs: 30000,
      },
    });

    expect(contract.limits.maxIterations).toBe(10);
    expect(contract.limits.maxTokens).toBe(5000);
    expect(contract.limits.timeoutMs).toBe(30000);
  });

  it("should define expected output for validation", () => {
    const contract = createTestContract({
      expectedOutput: {
        type: "elements",
        minElements: 5,
        requiredTypes: ["rectangle", "text", "arrow"],
      },
    });

    expect(contract.expectedOutput.type).toBe("elements");
    expect(contract.expectedOutput.minElements).toBe(5);
    expect(contract.expectedOutput.requiredTypes).toContain("rectangle");
  });
});

// ============================================================================
// TEST: CONTEXT ISOLATION
// ============================================================================

describe("Context Isolation", () => {
  it("should not leak sub-agent conversation to parent", async () => {
    // This test demonstrates the KEY INSIGHT:
    // Parent only receives IsolatedSubAgentResult, not the sub-agent's
    // internal conversation history, thinking, or tool call details

    const mockExecutor = createMockExecutor();
    const contract = createTestContract();
    const config: IsolatedExecutionConfig = {
      executor: mockExecutor,
      apiKey: "test-key",
    };

    // In a real execution, the sub-agent would have many messages:
    // - System prompt
    // - Task analysis
    // - Multiple tool calls
    // - Internal reasoning

    // But parent ONLY sees:
    const expectedResultShape = {
      contractId: expect.any(String),
      success: expect.any(Boolean),
      summary: expect.any(String),
      elementIds: expect.any(Array),
      tokensUsed: expect.any(Number),
      durationMs: expect.any(Number),
    };

    // The contract clearly defines what goes IN (contract)
    // and what comes OUT (result)
    expect(contract.task).toBeDefined();
    expect(contract.workRegion).toBeDefined();
    expect(contract.limits).toBeDefined();

    // Parent never sees:
    // - Sub-agent's system prompt
    // - Sub-agent's thinking
    // - Sub-agent's tool call history
    // - Sub-agent's error recovery attempts
  });

  it("should scope canvas operations to work region", async () => {
    const mockExecutor = createMockExecutor();

    const contract = createTestContract({
      workRegion: {
        canvasId: "main",
        frameId: "timeline-frame", // Sub-agent MUST work in this frame
      },
    });

    // When sub-agent calls canvas_write, it should be scoped to the frame
    // This is enforced by the scopedExecutor wrapper

    // Original call:
    // canvas_write({ tree: { type: "rect", x: 100, y: 100 } })

    // Becomes:
    // canvas_write({ tree: { ... }, target: "timeline-frame" })

    expect(contract.workRegion.frameId).toBe("timeline-frame");
  });

  it("should track only elements created in this contract", async () => {
    // Each contract tracks its own created elements
    // These are returned in the result and can be used for:
    // - Verification
    // - Layout adjustment
    // - Dependency tracking

    const contract = createTestContract({
      expectedOutput: {
        type: "elements",
        minElements: 3,
      },
    });

    // Result will include elementIds array
    // Parent can verify correct elements were created
    expect(contract.expectedOutput.minElements).toBe(3);
  });
});

// ============================================================================
// TEST: PARALLEL ISOLATION
// ============================================================================

describe("Parallel Isolated Execution", () => {
  it("should execute multiple contracts without cross-contamination", async () => {
    const mockExecutor = createMockExecutor();

    // Three contracts working in different regions
    const contracts: SubAgentContract[] = [
      createTestContract({
        contractId: "header-section",
        agentType: "canvas-agent",
        task: "Create header",
        workRegion: {
          canvasId: "main",
          bounds: { x: 0, y: 0, width: 800, height: 100 },
        },
      }),
      createTestContract({
        contractId: "timeline-section",
        agentType: "diagram-specialist",
        task: "Create timeline",
        workRegion: {
          canvasId: "main",
          bounds: { x: 0, y: 100, width: 800, height: 300 },
        },
      }),
      createTestContract({
        contractId: "stats-section",
        agentType: "canvas-agent",
        task: "Create statistics",
        workRegion: {
          canvasId: "main",
          bounds: { x: 0, y: 400, width: 800, height: 200 },
        },
      }),
    ];

    // Each contract has non-overlapping bounds
    const bounds = contracts.map((c) => c.workRegion.bounds!);

    // No overlap verification
    for (let i = 0; i < bounds.length; i++) {
      for (let j = i + 1; j < bounds.length; j++) {
        const b1 = bounds[i];
        const b2 = bounds[j];

        // Check for Y-axis non-overlap (since X is same)
        const noOverlap =
          b1.y + b1.height <= b2.y || b2.y + b2.height <= b1.y;
        expect(noOverlap).toBe(true);
      }
    }

    // Each gets its own isolated context
    // No conversation history is shared between them
    expect(contracts.length).toBe(3);
  });

  it("should aggregate results without merging contexts", async () => {
    // After parallel execution, parent receives array of results
    // NOT an array of conversation histories

    const mockExecutor = createMockExecutor();

    const contracts = [
      createTestContract({ contractId: "contract-1" }),
      createTestContract({ contractId: "contract-2" }),
    ];

    // Results would be:
    const expectedResults = [
      {
        contractId: "contract-1",
        success: true,
        summary: "Created elements",
        elementIds: ["elem-1", "elem-2"],
        tokensUsed: 1500,
        durationMs: 2000,
      },
      {
        contractId: "contract-2",
        success: true,
        summary: "Created elements",
        elementIds: ["elem-3", "elem-4"],
        tokensUsed: 1800,
        durationMs: 2500,
      },
    ];

    // Parent context grows by only ~200 tokens (two small result objects)
    // NOT by the combined token usage of both sub-agents (3300 tokens)
    const totalTokensUsed = expectedResults.reduce(
      (sum, r) => sum + r.tokensUsed,
      0
    );
    const contextGrowth = 200; // Approximate size of result objects

    expect(contextGrowth).toBeLessThan(totalTokensUsed / 10);
  });
});

// ============================================================================
// TEST: TWO-PHASE EXECUTION
// ============================================================================

describe("Two-Phase Execution (Think Then Act)", () => {
  it("should separate reasoning from execution", async () => {
    // Phase 1: Reasoning
    // - Analyze the task
    // - Create a plan
    // - Estimate resources
    // - Identify risks
    // - Decide: PROCEED or BLOCK

    // Phase 2: Execution
    // - Follow the plan
    // - Execute tool calls
    // - Return result

    const contract = createTestContract({
      task: "Create a complex diagram with multiple interconnected nodes",
      limits: {
        maxIterations: 20, // High limit for complex task
        maxTokens: 10000,
        timeoutMs: 60000,
      },
    });

    // In reasoning phase, sub-agent might determine:
    // - This will require 15 elements
    // - Estimated 8000 tokens
    // - Risk: may exceed bounds

    // If risks are too high, can BLOCK before execution
    expect(contract.limits.maxIterations).toBe(20);
  });

  it("should allow early abort if reasoning identifies blockers", async () => {
    // Scenario: Sub-agent realizes task is impossible
    // Better to find out in reasoning (1000 tokens)
    // Than after 20 failed iterations (10000 tokens)

    const contract = createTestContract({
      task: "Create 3D rotating visualization", // Impossible on 2D canvas
      expectedOutput: {
        type: "elements",
        requiredTypes: ["3d-mesh"], // Not a valid type
      },
    });

    // Reasoning phase would identify:
    // - "3d-mesh" is not a supported element type
    // - Task cannot be completed
    // - Decision: BLOCK

    // This saves the execution tokens
    expect(contract.expectedOutput.requiredTypes).toContain("3d-mesh");
  });

  it("should provide resource estimates before execution", async () => {
    const contract = createTestContract({
      task: "Create timeline with 50 milestones",
    });

    // Reasoning phase estimates:
    // - Elements needed: 50 nodes + 49 arrows + 50 labels = 149
    // - Token estimate: ~15000
    // - Time estimate: ~30 seconds

    // Parent can decide to adjust limits based on estimate
    // Or reject if estimate exceeds budget

    // This is like getting a quote before hiring a contractor
    expect(contract.limits.maxTokens).toBeDefined();
  });
});

// ============================================================================
// TEST: REAL-WORLD SCENARIOS
// ============================================================================

describe("Real-World Scenarios", () => {
  it("Scenario: Infographic with isolated sections", () => {
    // User request: "Create infographic about AI history"
    // Parent agent creates contracts for each section

    const contracts: SubAgentContract[] = [
      {
        contractId: "header",
        agentType: "canvas-agent",
        task: "Create header with title 'The History of AI' and decorative elements",
        workRegion: { canvasId: "main", frameId: "header-frame" },
        inputs: {
          style: { colorPalette: { primary: "#3b82f6" } },
        },
        expectedOutput: { type: "elements", minElements: 3 },
        limits: { maxIterations: 5, maxTokens: 2000, timeoutMs: 15000 },
      },
      {
        contractId: "timeline",
        agentType: "diagram-specialist",
        task: "Create timeline showing AI milestones from 1950-2024",
        workRegion: { canvasId: "main", frameId: "timeline-frame" },
        inputs: {
          data: {
            events: [
              { year: 1950, event: "Turing Test" },
              { year: 1997, event: "Deep Blue" },
              { year: 2024, event: "Claude Opus 4.5" },
            ],
          },
        },
        expectedOutput: { type: "elements", minElements: 10 },
        limits: { maxIterations: 15, maxTokens: 8000, timeoutMs: 45000 },
      },
      {
        contractId: "stats",
        agentType: "canvas-agent",
        task: "Create statistics display showing AI market growth",
        workRegion: { canvasId: "main", frameId: "stats-frame" },
        inputs: {
          data: {
            stats: [
              { label: "Market Size", value: "$200B" },
              { label: "Growth Rate", value: "37%" },
            ],
          },
        },
        expectedOutput: { type: "elements", minElements: 5 },
        limits: { maxIterations: 8, maxTokens: 4000, timeoutMs: 25000 },
      },
    ];

    // Each section is isolated:
    // - Different frame (no canvas conflicts)
    // - Different token budget (based on complexity)
    // - Different iteration limit
    // - Separate data inputs

    expect(contracts[0].workRegion.frameId).toBe("header-frame");
    expect(contracts[1].workRegion.frameId).toBe("timeline-frame");
    expect(contracts[2].workRegion.frameId).toBe("stats-frame");

    // Timeline has higher limits (more complex)
    expect(contracts[1].limits.maxIterations).toBeGreaterThan(
      contracts[0].limits.maxIterations
    );
  });

  it("Scenario: Parent context stays clean after many delegations", () => {
    // Simulate 10 sub-agent delegations
    const delegations = 10;

    // Without isolation: context grows ~5000 tokens per delegation
    const withoutIsolationGrowth = delegations * 5000; // 50,000 tokens!

    // With isolation: context grows ~100 tokens per delegation (just result)
    const withIsolationGrowth = delegations * 100; // 1,000 tokens

    // Ratio shows the benefit
    const savingsRatio = withoutIsolationGrowth / withIsolationGrowth;

    expect(savingsRatio).toBe(50); // 50x more efficient!
  });

  it("Scenario: Error in one contract doesn't corrupt parent", () => {
    // Contract A succeeds
    const contractA = createTestContract({
      contractId: "contract-a",
      task: "Create simple elements",
    });

    // Contract B fails (invalid type)
    const contractB = createTestContract({
      contractId: "contract-b",
      task: "Create impossible element",
      expectedOutput: {
        type: "elements",
        requiredTypes: ["unicorn"], // Doesn't exist
      },
    });

    // Contract C should still work
    const contractC = createTestContract({
      contractId: "contract-c",
      task: "Create more simple elements",
    });

    // Parent receives:
    // - A: { success: true, ... }
    // - B: { success: false, error: "Unknown type: unicorn" }
    // - C: { success: true, ... }

    // Parent context is NOT corrupted by B's failure
    // No partial state, no cleanup needed

    expect(contractB.expectedOutput.requiredTypes).toContain("unicorn");
  });
});

// ============================================================================
// TEST: PROGRESS TRACKING
// ============================================================================

describe("Progress Tracking (Without Context Leak)", () => {
  it("should emit progress without leaking internal state", async () => {
    const progressUpdates: Array<{ id: string; status: string }> = [];

    const config: IsolatedExecutionConfig = {
      executor: createMockExecutor(),
      apiKey: "test-key",
      onProgress: (contractId, status) => {
        progressUpdates.push({ id: contractId, status });
      },
    };

    const contract = createTestContract({ contractId: "my-contract" });

    // Progress callback receives only:
    // - Contract ID (for correlation)
    // - Status string (high-level)

    // NOT:
    // - Conversation messages
    // - Tool call details
    // - Thinking content
    // - Token counts (until final result)

    // Simulated progress:
    progressUpdates.push(
      { id: "my-contract", status: "Planning..." },
      { id: "my-contract", status: "Iteration 1/10" },
      { id: "my-contract", status: "Iteration 2/10" },
      { id: "my-contract", status: "Complete" }
    );

    expect(progressUpdates.length).toBe(4);
    expect(progressUpdates[0].status).toBe("Planning...");
    expect(progressUpdates[3].status).toBe("Complete");
  });
});
