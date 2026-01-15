/**
 * Orchestration Flow Tests
 *
 * NOTE: These tests cover DEPRECATED modules that are no longer used in the main flow.
 * The current architecture uses a single agentic loop (runAgenticLoop) that handles
 * all complexity levels naturally. The LLM decides when to iterate, use tools, or respond.
 *
 * These tests are kept to ensure backwards compatibility for users who may
 * still be using these functions directly.
 *
 * @deprecated Tests for legacy modules: assessComplexity, exploreCanvas, createExecutionPlan
 * @see docs/engineering/CLAUDE_CODE_PATTERNS.md
 */

import { describe, it, expect, vi } from "vitest";
import {
  assessComplexity,
  exploreCanvas,
  createExecutionPlan,
  type ComplexityAssessment,
  type ExplorationResult,
} from "../orchestration.js";

// ============================================================================
// MOCK EXECUTOR
// ============================================================================

function createMockExecutor(canvasState?: {
  elementCount?: number;
  types?: Record<string, number>;
  frames?: string[];
}) {
  return {
    execute: vi.fn(async (tool: string, input: unknown) => {
      if (tool === "canvas_find") {
        const findInput = input as { aggregate?: { count?: boolean } };
        if (findInput.aggregate?.count) {
          return {
            count: canvasState?.elementCount ?? 0,
            countBy: canvasState?.types ?? {},
            bounds: { x: 0, y: 0, width: 800, height: 600 },
          };
        }
        return { elements: [] };
      }
      return { success: true };
    }),
  };
}

// ============================================================================
// PHASE 1: COMPLEXITY CHECK
// ============================================================================

describe("Phase 1: Complexity Check", () => {
  describe("Simple Tasks", () => {
    it("should identify simple single-element tasks", () => {
      const result = assessComplexity("Create a blue rectangle");

      expect(result.isComplex).toBe(false);
      expect(result.estimatedOperations).toBeLessThan(5);
      expect(result.needsExploration).toBe(false);
    });

    it("should identify simple modification tasks", () => {
      const result = assessComplexity("Change the color to red");

      expect(result.isComplex).toBe(false);
    });

    it("should have reasonable confidence for simple tasks", () => {
      const result = assessComplexity("Add a text label");

      expect(result.confidence).toBeGreaterThan(0);
    });
  });

  describe("Complex Tasks", () => {
    it("should identify tasks with multiple sections", () => {
      const result = assessComplexity(
        "Create an infographic with header section, statistics section, and footer section"
      );

      expect(result.isComplex).toBe(true);
      expect(result.reason).toContain("signals");
    });

    it("should identify tasks with complexity keywords", () => {
      const result = assessComplexity(
        "Create a comprehensive dashboard with detailed metrics"
      );

      expect(result.isComplex).toBe(true);
    });

    it("should identify tasks with lists", () => {
      const result = assessComplexity(
        "Create elements including: header, timeline, chart, comparison, and footer"
      );

      expect(result.isComplex).toBe(true);
    });

    it("should identify long descriptions as complex", () => {
      const result = assessComplexity(
        `Create a marketing infographic that showcases our product features,
         includes customer testimonials, displays key performance metrics,
         and provides a compelling call to action for potential customers`
      );

      expect(result.isComplex).toBe(true);
    });
  });

  describe("Exploration Needs", () => {
    it("should detect when exploration is needed for modifications", () => {
      const result = assessComplexity("Update the existing header style");

      expect(result.needsExploration).toBe(true);
      expect(result.explorationQueries).toBeDefined();
    });

    it("should detect when exploration is needed for additions", () => {
      const result = assessComplexity("Add a new section based on current layout");

      expect(result.needsExploration).toBe(true);
    });

    it("should not need exploration for fresh creation", () => {
      const result = assessComplexity("Create a new infographic from scratch");

      expect(result.needsExploration).toBe(false);
    });
  });

  describe("Operation Estimation", () => {
    it("should estimate more operations for timelines", () => {
      const simpleResult = assessComplexity("Create a rectangle");
      const timelineResult = assessComplexity("Create a timeline");

      expect(timelineResult.estimatedOperations).toBeGreaterThan(
        simpleResult.estimatedOperations
      );
    });

    it("should estimate more operations for infographics", () => {
      const simpleResult = assessComplexity("Create a shape");
      const infographicResult = assessComplexity("Create an infographic");

      expect(infographicResult.estimatedOperations).toBeGreaterThan(
        simpleResult.estimatedOperations
      );
    });

    it("should count listed items", () => {
      const result = assessComplexity(
        "Create header, timeline, chart, comparison, footer"
      );

      expect(result.estimatedOperations).toBeGreaterThan(4);
    });
  });
});

// ============================================================================
// PHASE 2: EXPLORATION
// ============================================================================

describe("Phase 2: Exploration", () => {
  it("should gather canvas state", async () => {
    const executor = createMockExecutor({
      elementCount: 10,
      types: { rectangle: 5, text: 3, arrow: 2 },
    });

    const result = await exploreCanvas("Create new section", executor);

    expect(result.canvasState.elementCount).toBe(10);
    expect(result.canvasState.elementTypes).toEqual({
      rectangle: 5,
      text: 3,
      arrow: 2,
    });
  });

  it("should identify available regions", async () => {
    const executor = createMockExecutor({ elementCount: 5 });

    const result = await exploreCanvas("Add content", executor);

    expect(result.availableRegions.length).toBeGreaterThan(0);
    expect(result.availableRegions[0].bounds).toBeDefined();
    expect(result.availableRegions[0].description).toBeDefined();
  });

  it("should detect constraints for busy canvases", async () => {
    const executor = createMockExecutor({ elementCount: 150 });

    const result = await exploreCanvas("Add more content", executor);

    expect(result.constraints.length).toBeGreaterThan(0);
    expect(result.constraints.some((c) => c.includes("many elements"))).toBe(true);
  });

  it("should handle empty canvas", async () => {
    const executor = createMockExecutor({ elementCount: 0 });

    const result = await exploreCanvas("Create infographic", executor);

    expect(result.canvasState.elementCount).toBe(0);
    expect(result.availableRegions.length).toBeGreaterThan(0);
    expect(result.availableRegions[0].description).toContain("empty");
  });

  it("should track exploration duration", async () => {
    const executor = createMockExecutor();

    const result = await exploreCanvas("Explore", executor);

    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("should use read-only operations", async () => {
    const executor = createMockExecutor();

    await exploreCanvas("Explore canvas", executor);

    // Verify only read operations were called
    const calls = executor.execute.mock.calls;
    for (const call of calls) {
      expect(call[0]).toBe("canvas_find"); // Only find operations
    }
  });
});

// ============================================================================
// PHASE 3: PLANNING
// ============================================================================

describe("Phase 3: Planning", () => {
  const mockExploration: ExplorationResult = {
    canvasState: {
      elementCount: 0,
      elementTypes: {},
      bounds: { x: 0, y: 0, width: 800, height: 600 },
      frames: [],
    },
    relevantElements: [],
    availableRegions: [
      {
        bounds: { x: 0, y: 0, width: 800, height: 600 },
        description: "Full canvas",
      },
    ],
    constraints: [],
    durationMs: 100,
  };

  const mockComplexity: ComplexityAssessment = {
    isComplex: true,
    reason: "Multiple sections detected",
    estimatedOperations: 10,
    needsExploration: false,
    confidence: 0.8,
  };

  it("should create a plan with multiple phases", () => {
    const plan = createExecutionPlan(
      "Create infographic with header, timeline, and footer",
      mockExploration,
      mockComplexity
    );

    expect(plan.phases.length).toBeGreaterThanOrEqual(2);
    expect(plan.phases[0].name).toBeDefined();
  });

  it("should detect sections from task description", () => {
    const plan = createExecutionPlan(
      "Create infographic with statistics, timeline, and comparison",
      mockExploration,
      mockComplexity
    );

    const allTasks = plan.phases.flatMap((p) => p.tasks);
    const descriptions = allTasks.map((t) => t.description.toLowerCase());

    expect(descriptions.some((d) => d.includes("statistic"))).toBe(true);
    expect(descriptions.some((d) => d.includes("timeline"))).toBe(true);
  });

  it("should assign appropriate specialists", () => {
    const plan = createExecutionPlan(
      "Create a complex flowchart diagram",
      mockExploration,
      mockComplexity
    );

    const allTasks = plan.phases.flatMap((p) => p.tasks);
    const agents = allTasks.map((t) => t.agentType);

    expect(agents).toContain("diagram-specialist");
  });

  it("should enable parallel execution for independent tasks", () => {
    const plan = createExecutionPlan(
      "Create statistics section, icon grid, and chart",
      mockExploration,
      mockComplexity
    );

    // Content phase should be parallel
    const contentPhase = plan.phases.find((p) => p.name === "Content");
    if (contentPhase && contentPhase.tasks.length >= 2) {
      expect(contentPhase.parallel).toBe(true);
    }
  });

  it("should estimate token usage", () => {
    const plan = createExecutionPlan(
      "Create detailed infographic",
      mockExploration,
      mockComplexity
    );

    expect(plan.estimatedTokens).toBeGreaterThan(0);
  });

  it("should require approval for complex plans", () => {
    const plan = createExecutionPlan(
      "Create complex dashboard with many sections",
      mockExploration,
      { ...mockComplexity, confidence: 0.9 }
    );

    expect(plan.requiresApproval).toBe(true);
  });

  it("should include warnings from exploration", () => {
    const explorationWithConstraints: ExplorationResult = {
      ...mockExploration,
      constraints: ["Canvas has many elements"],
    };

    const plan = createExecutionPlan(
      "Add more content",
      explorationWithConstraints,
      mockComplexity
    );

    expect(plan.warnings).toContain("Canvas has many elements");
  });

  it("should create sequential assembly phase", () => {
    const plan = createExecutionPlan(
      "Create infographic with header and footer",
      mockExploration,
      mockComplexity
    );

    const assemblyPhase = plan.phases.find((p) => p.name === "Assembly");
    expect(assemblyPhase).toBeDefined();
    expect(assemblyPhase!.parallel).toBe(false); // Assembly is sequential
  });
});

// ============================================================================
// FULL FLOW TESTS
// ============================================================================

describe("Full Orchestration Flow", () => {
  it("should route simple tasks to direct execution", () => {
    const complexity = assessComplexity("Create a rectangle");

    expect(complexity.isComplex).toBe(false);
    // Simple tasks skip explore → plan → execute
  });

  it("should route complex tasks through full flow", () => {
    const complexity = assessComplexity(
      "Create comprehensive infographic with timeline, statistics, and comparison"
    );

    expect(complexity.isComplex).toBe(true);
    expect(complexity.needsExploration).toBe(false); // Fresh creation
  });

  it("should require exploration for modification tasks", () => {
    const complexity = assessComplexity(
      "Update existing infographic with new sections"
    );

    expect(complexity.isComplex).toBe(true);
    expect(complexity.needsExploration).toBe(true);
  });

  it("should create end-to-end flow for complex task", async () => {
    // Step 1: Check complexity
    const complexity = assessComplexity(
      "Create infographic with header, timeline, statistics, comparison, and footer"
    );
    expect(complexity.isComplex).toBe(true);

    // Step 2: Explore
    const executor = createMockExecutor({ elementCount: 0 });
    const exploration = await exploreCanvas("Create infographic", executor);
    expect(exploration.canvasState.elementCount).toBe(0);

    // Step 3: Plan
    const plan = createExecutionPlan(
      "Create infographic with header, timeline, statistics, comparison, and footer",
      exploration,
      complexity
    );
    expect(plan.phases.length).toBeGreaterThanOrEqual(2);
    expect(plan.estimatedTokens).toBeGreaterThan(0);

    // Step 4: Execute would use the plan...
    // (tested separately in execution tests)
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe("Edge Cases", () => {
  it("should handle empty task", () => {
    const complexity = assessComplexity("");

    expect(complexity.isComplex).toBe(false);
    expect(complexity.estimatedOperations).toBeGreaterThanOrEqual(1);
  });

  it("should handle very long task descriptions", () => {
    const longTask = "Create a section with ".repeat(100);
    const complexity = assessComplexity(longTask);

    expect(complexity).toBeDefined();
    expect(complexity.estimatedOperations).toBeLessThanOrEqual(50); // Capped
  });

  it("should handle exploration errors gracefully", async () => {
    const failingExecutor = {
      execute: vi.fn(async () => {
        throw new Error("Connection failed");
      }),
    };

    const result = await exploreCanvas("Explore", failingExecutor);

    expect(result.constraints.some((c) => c.includes("error"))).toBe(true);
    expect(result.canvasState.elementCount).toBe(0); // Default fallback
  });
});
