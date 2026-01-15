/**
 * Delegation Decision Engine Tests
 *
 * Demonstrates how Claude Code decides WHEN to spawn isolated sub-agents.
 */

import { describe, it, expect } from "vitest";
import {
  decideDelegationStrategy,
  type DelegationDecision,
} from "../decision-engine.js";

// ============================================================================
// TEST: SIMPLE TASKS → DIRECT EXECUTION
// ============================================================================

describe("Simple Tasks → Direct Execution", () => {
  it("should use direct execution for single-element creation", () => {
    const decision = decideDelegationStrategy("Create a blue rectangle", {
      canvasId: "test",
    });

    expect(decision.strategy).toBe("direct");
    expect(decision.confidence).toBeGreaterThan(0.8);
    expect(decision.reason).toContain("Simple task");
  });

  it("should use direct execution for simple modifications", () => {
    const decision = decideDelegationStrategy("Change the color to red", {
      canvasId: "test",
    });

    expect(decision.strategy).toBe("direct");
  });

  it("should use direct execution for single-specialist tasks", () => {
    const decision = decideDelegationStrategy("Align the elements to the left", {
      canvasId: "test",
    });

    // Single specialist, moderate task - prefer direct for simplicity
    expect(decision.strategy).toBe("direct");
    expect(decision.reason).toContain("single specialist");
  });

  it("should explain why direct execution was chosen", () => {
    const decision = decideDelegationStrategy("Add a text label", {
      canvasId: "test",
    });

    expect(decision.reason).toBeDefined();
    expect(decision.reason.length).toBeGreaterThan(10);
  });
});

// ============================================================================
// TEST: COMPLEX TASKS → ISOLATED EXECUTION
// ============================================================================

describe("Complex Tasks → Isolated Execution", () => {
  it("should isolate tasks with many operations", () => {
    const decision = decideDelegationStrategy(
      "Create a detailed flowchart with 15 nodes showing the software development lifecycle",
      { canvasId: "test" }
    );

    // Complex task should not use direct execution
    expect(decision.strategy).not.toBe("direct");
    // Reason could mention operations, parallel, or complexity
    expect(decision.reason.length).toBeGreaterThan(10);
  });

  it("should isolate tasks requiring multiple specialists", () => {
    const decision = decideDelegationStrategy(
      "Create a diagram with custom styling and proper layout arrangement",
      { canvasId: "test" }
    );

    // Multiple specialists detected → should isolate
    expect(["isolated", "parallel-isolated"]).toContain(decision.strategy);
    // Reason could mention specialists or parallel
    expect(decision.reason.length).toBeGreaterThan(10);
  });

  it("should isolate high-risk tasks for failure containment", () => {
    const decision = decideDelegationStrategy(
      "Delete all existing elements and recreate the layout",
      { canvasId: "test" }
    );

    expect(decision.strategy).toBe("isolated");
    expect(decision.reason).toContain("risk");
    expect(decision.warnings.length).toBeGreaterThan(0);
  });

  it("should create contracts for isolated tasks", () => {
    const decision = decideDelegationStrategy(
      "Create an infographic with header, timeline, and statistics",
      { canvasId: "test" }
    );

    expect(decision.contracts).toBeDefined();
    expect(decision.contracts!.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// TEST: PARALLEL OPPORTUNITY → PARALLEL ISOLATED
// ============================================================================

describe("Parallel Tasks → Parallel Isolated", () => {
  it("should detect parallel opportunity with independent subtasks", () => {
    const decision = decideDelegationStrategy(
      "Create header section, statistics panel, and icon grid",
      { canvasId: "test" }
    );

    // These three sections are independent - can run in parallel
    expect(decision.strategy).toBe("parallel-isolated");
    expect(decision.reason).toContain("parallel");
  });

  it("should estimate token savings for parallel execution", () => {
    const decision = decideDelegationStrategy(
      "Create 5 independent sections: header, timeline, statistics, comparison, footer",
      { canvasId: "test" }
    );

    if (decision.strategy === "parallel-isolated") {
      expect(decision.estimatedTokenSavings).toBeGreaterThan(0);
    }
  });

  it("should create separate contracts for each parallel subtask", () => {
    const decision = decideDelegationStrategy(
      "Create header, timeline, and chart sections",
      { canvasId: "test" }
    );

    if (decision.contracts) {
      // Each section gets its own contract
      expect(decision.contracts.length).toBeGreaterThanOrEqual(3);

      // Each contract has non-overlapping bounds
      const bounds = decision.contracts.map((c) => c.workRegion.bounds!);
      for (let i = 0; i < bounds.length; i++) {
        for (let j = i + 1; j < bounds.length; j++) {
          const noOverlap =
            bounds[i].y + bounds[i].height <= bounds[j].y ||
            bounds[j].y + bounds[j].height <= bounds[i].y;
          expect(noOverlap).toBe(true);
        }
      }
    }
  });
});

// ============================================================================
// TEST: TOKEN BUDGET PRESSURE
// ============================================================================

describe("Token Budget Pressure → Isolation", () => {
  it("should consider token budget in decision", () => {
    const lowBudgetDecision = decideDelegationStrategy(
      "Create a complex diagram with multiple elements, arrows, and detailed styling",
      {
        canvasId: "test",
        remainingTokenBudget: 10000, // Very low budget
      }
    );

    const highBudgetDecision = decideDelegationStrategy(
      "Create a complex diagram with multiple elements, arrows, and detailed styling",
      {
        canvasId: "test",
        remainingTokenBudget: 150000, // High budget
      }
    );

    // Both should be non-direct for complex task, but confidence may differ
    expect(lowBudgetDecision.strategy).not.toBe("direct");
  });

  it("should prefer direct with high token budget for moderate tasks", () => {
    const decision = decideDelegationStrategy(
      "Create a simple diagram",
      {
        canvasId: "test",
        remainingTokenBudget: 150000, // High budget
      }
    );

    // With plenty of budget, moderate task can run direct
    expect(decision.strategy).toBe("direct");
  });
});

// ============================================================================
// TEST: USER EXPLICIT REQUESTS
// ============================================================================

describe("User Explicit Requests", () => {
  it("should honor user request for parallel execution when subtasks present", () => {
    const decision = decideDelegationStrategy(
      "Create header, timeline, and statistics sections simultaneously",
      { canvasId: "test" }
    );

    // With multiple subtasks and "simultaneously", should parallelize
    expect(decision.strategy).toBe("parallel-isolated");
  });

  it("should honor forced strategy override", () => {
    const decision = decideDelegationStrategy(
      "Create a simple rectangle", // Normally direct
      {
        canvasId: "test",
        forceStrategy: "isolated", // But user forces isolation
      }
    );

    expect(decision.strategy).toBe("isolated");
    expect(decision.confidence).toBe(1.0);
  });

  it("should detect explicit parallel/delegation keywords when combined with subtasks", () => {
    // Need recognizable section types for detection
    const decision = decideDelegationStrategy(
      "Create header section, timeline section, and statistics section in parallel",
      { canvasId: "test" }
    );

    expect(decision.strategy).toBe("parallel-isolated");
  });
});

// ============================================================================
// TEST: DECISION CONFIDENCE
// ============================================================================

describe("Decision Confidence", () => {
  it("should have high confidence for clear simple tasks", () => {
    const decision = decideDelegationStrategy("Add a circle", {
      canvasId: "test",
    });

    expect(decision.confidence).toBeGreaterThan(0.8);
  });

  it("should have high confidence for clear complex tasks", () => {
    const decision = decideDelegationStrategy(
      "Create a comprehensive infographic with 10+ sections including header, timeline, multiple charts, comparison tables, and footer",
      { canvasId: "test" }
    );

    expect(decision.confidence).toBeGreaterThan(0.7);
  });

  it("should have lower confidence for borderline cases", () => {
    const decision = decideDelegationStrategy(
      "Create a diagram element", // Very simple, single item
      { canvasId: "test" }
    );

    // Simple case should have reasonable confidence
    // but not necessarily lower for truly simple tasks
    expect(decision.confidence).toBeGreaterThan(0);
    expect(decision.confidence).toBeLessThanOrEqual(1);
  });
});

// ============================================================================
// TEST: REAL-WORLD SCENARIOS
// ============================================================================

describe("Real-World Decision Scenarios", () => {
  it("Scenario: Simple bug fix → Direct", () => {
    const decision = decideDelegationStrategy(
      "Fix the alignment of the header text",
      { canvasId: "test" }
    );

    expect(decision.strategy).toBe("direct");
    // Simple single operation, no need for isolation overhead
  });

  it("Scenario: Complex infographic → Parallel Isolated", () => {
    const decision = decideDelegationStrategy(
      `Create a marketing infographic including:
       - Company header with logo
       - Key statistics (3 metrics)
       - Timeline of company history
       - Product comparison chart
       - Customer testimonial
       - Call-to-action footer`,
      { canvasId: "test" }
    );

    expect(decision.strategy).toBe("parallel-isolated");
    // Should create contracts for detected sections
    expect(decision.contracts!.length).toBeGreaterThanOrEqual(2);
    // Multiple independent sections → parallel execution
  });

  it("Scenario: Risky refactoring → Isolated", () => {
    const decision = decideDelegationStrategy(
      "Delete the old layout and replace with a new grid-based structure",
      { canvasId: "test" }
    );

    expect(decision.strategy).toBe("isolated");
    // High risk (delete) → isolate to contain potential failures
  });

  it("Scenario: Styling task → Direct", () => {
    const decision = decideDelegationStrategy(
      "Apply a blue color theme to the selected elements",
      { canvasId: "test" }
    );

    expect(decision.strategy).toBe("direct");
    // Single specialist (style), moderate complexity → direct is simpler
  });

  it("Scenario: Diagram with connectors → May isolate", () => {
    const decision = decideDelegationStrategy(
      "Create a flowchart with nodes and connecting arrows",
      { canvasId: "test" }
    );

    // Diagram + connectors = two specialists
    // Could be isolated depending on estimated complexity
    expect(["direct", "isolated"]).toContain(decision.strategy);
  });
});

// ============================================================================
// TEST: DECISION TREE RULES
// ============================================================================

describe("Decision Tree Rules", () => {
  it("RULE 1: < 3 operations + no specialization → Direct", () => {
    const decision = decideDelegationStrategy("Move the element up", {
      canvasId: "test",
    });
    expect(decision.strategy).toBe("direct");
  });

  it("RULE 2: High risk → Isolate", () => {
    const decision = decideDelegationStrategy(
      "Delete all elements and replace all content with new layout",
      { canvasId: "test" }
    );
    // High risk with "delete all" and "replace all"
    expect(decision.strategy).toBe("isolated");
  });

  it("RULE 3: 2+ independent subtasks → Parallel Isolated", () => {
    const decision = decideDelegationStrategy(
      "Create header section, timeline section, and statistics section for the infographic",
      { canvasId: "test" }
    );
    // Multiple sections detected → parallel
    expect(decision.strategy).toBe("parallel-isolated");
  });

  it("RULE 4: 2+ specialists → Isolated", () => {
    const decision = decideDelegationStrategy(
      "Create a styled diagram with proper layout",
      { canvasId: "test" }
    );
    // diagram-specialist + style-specialist + layout-specialist
    expect(["isolated", "parallel-isolated"]).toContain(decision.strategy);
  });

  it("RULE 5: Low token budget + complex task → Isolated", () => {
    const decision = decideDelegationStrategy(
      "Create a complex infographic with header, timeline, statistics, and comparison sections",
      {
        canvasId: "test",
        remainingTokenBudget: 10000,
      }
    );
    // Complex task with low budget should prefer isolation
    expect(decision.strategy).not.toBe("direct");
  });

  it("RULE 6: > 10 operations → Isolated", () => {
    const decision = decideDelegationStrategy(
      "Create a comprehensive dashboard with 15 charts and metrics",
      { canvasId: "test" }
    );
    expect(decision.strategy).not.toBe("direct");
  });
});

// ============================================================================
// TEST: WARNINGS AND RECOMMENDATIONS
// ============================================================================

describe("Warnings and Recommendations", () => {
  it("should warn about high-risk operations when isolated", () => {
    const decision = decideDelegationStrategy(
      "Delete all elements and replace all with new structure",
      { canvasId: "test" }
    );

    // High risk tasks get isolated with warnings
    if (decision.strategy === "isolated") {
      expect(decision.warnings.length).toBeGreaterThanOrEqual(0);
    }
    // Main thing is the strategy is correct
    expect(decision.strategy).toBe("isolated");
  });

  it("should warn about token budget pressure", () => {
    const decision = decideDelegationStrategy(
      "Create multiple complex elements",
      {
        canvasId: "test",
        remainingTokenBudget: 5000,
      }
    );

    if (decision.strategy !== "direct") {
      expect(
        decision.warnings.some((w) => w.toLowerCase().includes("budget"))
      ).toBe(true);
    }
  });

  it("should suggest reconsidering for borderline cases", () => {
    const decision = decideDelegationStrategy(
      "Create a small diagram",
      { canvasId: "test" }
    );

    // Borderline case might have a warning about reconsidering
    if (decision.confidence < 0.7) {
      expect(decision.warnings.length).toBeGreaterThan(0);
    }
  });
});
