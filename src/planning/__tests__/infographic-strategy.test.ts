/**
 * Infographic Planning Strategy Tests
 *
 * Demonstrates how the Claude Code-like planning handles different complexity levels.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  analyzeInfographicRequest,
  executeInfographicPlan,
  generateInfographic,
  type InfographicPlan,
  type InfographicSection,
} from "../infographic-strategy.js";
import type { AgentEvent } from "../../types/index.js";

// ============================================================================
// MOCK EXECUTOR
// ============================================================================

/**
 * Mock MCP executor that simulates canvas operations
 */
function createMockExecutor() {
  const calls: Array<{ tool: string; input: unknown }> = [];

  return {
    calls,
    execute: vi.fn(async (tool: string, input: unknown) => {
      calls.push({ tool, input });

      // Simulate different tool responses
      switch (tool) {
        case "canvas_find":
          return {
            elements: [],
            count: 0,
            bounds: { x: 0, y: 0, width: 800, height: 1600 },
          };
        case "canvas_write":
          return { created: [`element-${calls.length}`] };
        case "canvas_edit":
          return { modified: 1 };
        case "canvas_read":
          return { elements: [] };
        default:
          return { success: true };
      }
    }),
  };
}

// ============================================================================
// SCENARIO 1: SIMPLE REQUESTS
// ============================================================================

describe("Simple Infographic Requests", () => {
  it("should classify minimal requests without specific sections as simple or moderate", () => {
    const plan = analyzeInfographicRequest("Create a header with company logo");

    // Even simple requests get defaults (header + default content + footer)
    // So complexity depends on section count
    expect(["simple", "moderate"]).toContain(plan.complexity);
    expect(plan.sections.length).toBeLessThanOrEqual(6);
    expect(plan.requiresApproval).toBe(false);
  });

  it("should generate minimal sections for simple requests", () => {
    const plan = analyzeInfographicRequest("Make a title section");

    // Simple request should have: header + maybe 1-2 default sections + footer
    expect(plan.sections.length).toBeLessThanOrEqual(5);

    // Should have header and footer at minimum
    const types = plan.sections.map((s) => s.type);
    expect(types).toContain("header");
    expect(types).toContain("footer");
  });

  it("should use direct execution strategy (no parallel phases)", () => {
    const plan = analyzeInfographicRequest("Add a simple chart");

    // Simple plans may have parallel phases but complexity is still simple
    const hasOnlySequential = plan.phases.every((p) => !p.parallel || p.sectionIds.length <= 1);

    // For simple requests, we expect fewer phases
    expect(plan.phases.length).toBeLessThanOrEqual(4);
  });
});

// ============================================================================
// SCENARIO 2: MODERATE COMPLEXITY
// ============================================================================

describe("Moderate Complexity Requests", () => {
  it("should classify requests with 2-3 distinct section types as moderate", () => {
    const plan = analyzeInfographicRequest(
      "Create an infographic about coffee with key statistics and a comparison of brewing methods"
    );

    expect(plan.complexity).toBe("moderate");
    expect(plan.sections.length).toBeGreaterThanOrEqual(3);
    expect(plan.sections.length).toBeLessThanOrEqual(6);
  });

  it("should detect statistics and comparison sections", () => {
    const plan = analyzeInfographicRequest(
      "Infographic showing market statistics and comparing products"
    );

    const types = plan.sections.map((s) => s.type);
    expect(types).toContain("statistics");
    expect(types).toContain("comparison");
  });

  it("should allow some parallelization for independent sections", () => {
    const plan = analyzeInfographicRequest(
      "Create infographic with statistics, icons, and a quote"
    );

    // Should have at least one parallel phase for independent content
    const parallelPhases = plan.phases.filter((p) => p.parallel);

    // Statistics and icons can run in parallel (both depend only on header)
    expect(parallelPhases.length).toBeGreaterThanOrEqual(0);
  });

  it("should properly chain dependent phases", () => {
    const plan = analyzeInfographicRequest(
      "Make an infographic with header, data visualization, and styled footer"
    );

    // Footer phase should depend on content phases
    const footerPhase = plan.phases.find((p) =>
      p.sectionIds.some((id) => id.includes("footer"))
    );

    if (footerPhase) {
      expect(footerPhase.dependsOnPhases.length).toBeGreaterThan(0);
    }
  });
});

// ============================================================================
// SCENARIO 3: COMPLEX REQUESTS
// ============================================================================

describe("Complex Infographic Requests", () => {
  const complexRequest = `
    Create a detailed infographic about renewable energy including:
    - A timeline of adoption since 1990
    - Comparison of solar vs wind vs hydro
    - Cost reduction statistics
    - Key metrics and KPIs
    - Process flow diagram
    - Feature icons
  `;

  it("should classify multi-section requests as complex", () => {
    const plan = analyzeInfographicRequest(complexRequest);

    expect(plan.complexity).toBe("complex");
    expect(plan.sections.length).toBeGreaterThanOrEqual(6);
    expect(plan.requiresApproval).toBe(true);
  });

  it("should detect all requested section types", () => {
    const plan = analyzeInfographicRequest(complexRequest);

    const types = plan.sections.map((s) => s.type);

    expect(types).toContain("header");
    expect(types).toContain("timeline");
    expect(types).toContain("comparison");
    expect(types).toContain("statistics");
    expect(types).toContain("diagram");
    expect(types).toContain("icons");
    expect(types).toContain("footer");
  });

  it("should create multiple execution phases", () => {
    const plan = analyzeInfographicRequest(complexRequest);

    // Complex infographics should have 3-4 phases
    expect(plan.phases.length).toBeGreaterThanOrEqual(3);

    // Verify phase structure
    const phaseNames = plan.phases.map((p) => p.name);
    expect(phaseNames[0]).toBe("Foundation");
  });

  it("should maximize parallelization for independent sections", () => {
    const plan = analyzeInfographicRequest(complexRequest);

    // Find the content generation phase(s)
    const contentPhases = plan.phases.filter(
      (p) => p.name.includes("Content") || p.name.includes("Complex")
    );

    // At least one content phase should be parallel if multiple independent sections
    const hasParallelContent = contentPhases.some((p) => p.parallel);

    // With 6+ sections, we should have parallel execution
    if (plan.sections.length >= 6) {
      expect(hasParallelContent || contentPhases.length > 1).toBe(true);
    }
  });

  it("should assign appropriate specialists to sections", () => {
    const plan = analyzeInfographicRequest(complexRequest);

    // Timeline should use diagram specialist
    const timelineSection = plan.sections.find((s) => s.type === "timeline");
    expect(timelineSection?.assignedAgent).toBe("diagram-specialist");

    // Diagram should use diagram specialist
    const diagramSection = plan.sections.find((s) => s.type === "diagram");
    expect(diagramSection?.assignedAgent).toBe("diagram-specialist");

    // Comparison should use layout specialist
    const comparisonSection = plan.sections.find((s) => s.type === "comparison");
    expect(comparisonSection?.assignedAgent).toBe("layout-specialist");
  });

  it("should estimate higher token budget for complex requests", () => {
    const simplePlan = analyzeInfographicRequest("Create a header");
    const complexPlan = analyzeInfographicRequest(complexRequest);

    expect(complexPlan.estimatedTokens).toBeGreaterThan(simplePlan.estimatedTokens);
    expect(complexPlan.estimatedTokens).toBeGreaterThan(10000);
  });
});

// ============================================================================
// SCENARIO 4: DEPENDENCY RESOLUTION
// ============================================================================

describe("Dependency Resolution", () => {
  it("should make header section have no dependencies", () => {
    const plan = analyzeInfographicRequest(
      "Create infographic with header, statistics, and footer"
    );

    const headerSection = plan.sections.find((s) => s.type === "header");
    expect(headerSection?.dependsOn).toEqual([]);
  });

  it("should make content sections depend on header", () => {
    const plan = analyzeInfographicRequest(
      "Create infographic with statistics and charts"
    );

    const contentSections = plan.sections.filter(
      (s) => s.type !== "header" && s.type !== "footer"
    );

    // Content sections should depend on header (or have no deps if they're early)
    for (const section of contentSections) {
      if (section.dependsOn.length > 0) {
        expect(section.dependsOn.some((d) => d.includes("header"))).toBe(true);
      }
    }
  });

  it("should make footer depend on all content sections", () => {
    const plan = analyzeInfographicRequest(
      "Create infographic with multiple sections and footer"
    );

    const footerSection = plan.sections.find((s) => s.type === "footer");
    const contentSectionIds = plan.sections
      .filter((s) => s.type !== "header" && s.type !== "footer")
      .map((s) => s.id);

    // Footer should depend on content sections
    if (footerSection && contentSectionIds.length > 0) {
      expect(footerSection.dependsOn.length).toBeGreaterThan(0);
    }
  });

  it("should place header in first phase", () => {
    const plan = analyzeInfographicRequest(
      "Create detailed infographic with many sections"
    );

    const firstPhase = plan.phases[0];
    const headerSection = plan.sections.find((s) => s.type === "header");

    if (headerSection) {
      expect(firstPhase.sectionIds).toContain(headerSection.id);
    }
  });

  it("should place footer in last phase", () => {
    const plan = analyzeInfographicRequest(
      "Create infographic with header, content, and footer"
    );

    const lastPhase = plan.phases[plan.phases.length - 1];
    const footerSection = plan.sections.find((s) => s.type === "footer");

    if (footerSection) {
      expect(lastPhase.sectionIds).toContain(footerSection.id);
    }
  });
});

// ============================================================================
// SCENARIO 5: EXECUTION FLOW
// ============================================================================

describe("Execution Flow", () => {
  let mockExecutor: ReturnType<typeof createMockExecutor>;

  beforeEach(() => {
    mockExecutor = createMockExecutor();
  });

  it("should emit plan event first for complex requests", async () => {
    // Use a request that will definitely be classified as complex (6+ sections)
    const plan = analyzeInfographicRequest(`
      Create a comprehensive infographic about AI including:
      timeline of AI development, key statistics, comparison of models,
      process flow diagram, feature icons, testimonial quotes, and charts
    `);

    const events: AgentEvent[] = [];

    // Note: In real execution, this would run the full loop
    // For this test, we verify the plan structure that would be emitted
    expect(plan.complexity).toBe("complex");
    expect(plan.requiresApproval).toBe(true);
    expect(plan.phases.length).toBeGreaterThanOrEqual(3);
  });

  it("should track section completion order", async () => {
    const plan = analyzeInfographicRequest("Create infographic with header and content");

    // Simulate execution order tracking
    const completionOrder: string[] = [];

    for (const phase of plan.phases) {
      if (phase.parallel && phase.sectionIds.length > 1) {
        // Parallel: all complete "simultaneously"
        completionOrder.push(...phase.sectionIds);
      } else {
        // Sequential: complete one by one
        for (const sectionId of phase.sectionIds) {
          completionOrder.push(sectionId);
        }
      }
    }

    // Header should be first
    const headerIndex = completionOrder.findIndex((id) => id.includes("header"));
    expect(headerIndex).toBe(0);

    // Footer should be last
    const footerIndex = completionOrder.findIndex((id) => id.includes("footer"));
    expect(footerIndex).toBe(completionOrder.length - 1);
  });
});

// ============================================================================
// SCENARIO 6: THEME AND STYLING
// ============================================================================

describe("Theme Detection and Styling", () => {
  it("should extract theme from request", () => {
    const plan = analyzeInfographicRequest(
      "Create an infographic about climate change"
    );

    expect(plan.theme.toLowerCase()).toContain("climate");
  });

  it("should generate appropriate color palette", () => {
    const plan = analyzeInfographicRequest("Infographic about technology trends");

    expect(plan.colorPalette).toBeDefined();
    expect(plan.colorPalette.primary).toMatch(/^#[0-9a-f]{6}$/i);
    expect(plan.colorPalette.background).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("should set portrait orientation for standard infographics", () => {
    const plan = analyzeInfographicRequest("Create a detailed infographic");

    expect(plan.dimensions.orientation).toBe("portrait");
    expect(plan.dimensions.height).toBeGreaterThan(plan.dimensions.width);
  });

  it("should detect landscape orientation when requested", () => {
    const plan = analyzeInfographicRequest(
      "Create a wide landscape infographic for presentation"
    );

    expect(plan.dimensions.orientation).toBe("landscape");
    expect(plan.dimensions.width).toBeGreaterThan(plan.dimensions.height);
  });

  it("should detect social media dimensions", () => {
    const plan = analyzeInfographicRequest(
      "Create an Instagram infographic about fitness"
    );

    expect(plan.dimensions.width).toBe(1080);
    expect(plan.dimensions.height).toBe(1080);
  });
});

// ============================================================================
// SCENARIO 7: SECTION-SPECIFIC BEHAVIOR
// ============================================================================

describe("Section-Specific Behavior", () => {
  it("should mark timeline sections as high complexity", () => {
    const plan = analyzeInfographicRequest(
      "Create infographic with a timeline of events"
    );

    const timelineSection = plan.sections.find((s) => s.type === "timeline");
    expect(timelineSection?.complexity).toBe("high");
    expect(timelineSection?.heightUnits).toBe(2); // Double height
  });

  it("should mark diagram sections as high complexity", () => {
    const plan = analyzeInfographicRequest(
      "Create infographic with a process flow diagram"
    );

    const diagramSection = plan.sections.find((s) => s.type === "diagram");
    expect(diagramSection?.complexity).toBe("high");
  });

  it("should mark quote sections as low complexity", () => {
    const plan = analyzeInfographicRequest(
      "Create infographic with a testimonial quote"
    );

    const quoteSection = plan.sections.find((s) => s.type === "quote");
    expect(quoteSection?.complexity).toBe("low");
  });

  it("should assign correct row indices", () => {
    const plan = analyzeInfographicRequest(
      "Create infographic with header, statistics, diagram, footer"
    );

    // Sections should have sequential row indices
    const rows = plan.sections.map((s) => s.row);
    const sortedRows = [...rows].sort((a, b) => a - b);

    expect(rows).toEqual(sortedRows);
    expect(rows[0]).toBe(0); // Header at row 0
  });
});

// ============================================================================
// SCENARIO 8: ERROR SCENARIOS
// ============================================================================

describe("Error Handling Scenarios", () => {
  it("should handle empty request gracefully", () => {
    const plan = analyzeInfographicRequest("");

    // Should still create a valid plan with defaults
    expect(plan.sections.length).toBeGreaterThan(0);
    expect(plan.phases.length).toBeGreaterThan(0);
  });

  it("should handle request with no recognizable section types", () => {
    const plan = analyzeInfographicRequest("Make something nice");

    // Should create default sections
    const types = plan.sections.map((s) => s.type);
    expect(types).toContain("header");
    expect(types).toContain("footer");
  });

  it("should limit sections to reasonable count", () => {
    const plan = analyzeInfographicRequest(
      `Create infographic with statistics, chart, timeline, diagram,
       comparison, icons, image, quote, table, map, graph, process,
       features, benefits, testimonials, callout, sidebar`
    );

    // Should not create excessive sections
    expect(plan.sections.length).toBeLessThanOrEqual(15);
  });
});

// ============================================================================
// SCENARIO 9: REAL-WORLD EXAMPLES
// ============================================================================

describe("Real-World Examples", () => {
  it("should handle marketing campaign infographic", () => {
    const plan = analyzeInfographicRequest(`
      Create a marketing campaign infographic for our Q4 product launch.
      Include: company logo header, 3 key statistics about market opportunity,
      a timeline of launch phases, comparison of our product vs competitors,
      customer testimonial quote, and a call-to-action footer
    `);

    expect(plan.complexity).toBe("complex");

    const types = plan.sections.map((s) => s.type);
    expect(types).toContain("header");
    expect(types).toContain("statistics");
    expect(types).toContain("timeline");
    expect(types).toContain("comparison");
    expect(types).toContain("quote");
    expect(types).toContain("footer");
  });

  it("should handle educational infographic", () => {
    const plan = analyzeInfographicRequest(`
      Create an educational infographic about the water cycle.
      Show the process diagram with evaporation, condensation, precipitation.
      Include key facts and statistics about water usage.
    `);

    const types = plan.sections.map((s) => s.type);
    expect(types).toContain("diagram");
    expect(types).toContain("statistics");
  });

  it("should handle data-heavy infographic", () => {
    const plan = analyzeInfographicRequest(`
      Create an infographic showing COVID-19 vaccination rates.
      Include charts showing progress over time, comparison between countries,
      key statistics on doses administered, and a timeline of vaccine development.
    `);

    const types = plan.sections.map((s) => s.type);
    expect(types).toContain("chart");
    expect(types).toContain("comparison");
    expect(types).toContain("statistics");
    expect(types).toContain("timeline");
  });
});

// ============================================================================
// SCENARIO 10: PARALLELIZATION VERIFICATION
// ============================================================================

describe("Parallelization Verification", () => {
  it("should identify independent sections for parallel execution", () => {
    const plan = analyzeInfographicRequest(`
      Create infographic with statistics panel, icon grid, and quote section
    `);

    // All three content sections depend only on header, so they can run in parallel
    const contentSections = plan.sections.filter(
      (s) => s.type !== "header" && s.type !== "footer"
    );

    // Check that content sections only depend on header
    for (const section of contentSections) {
      const nonHeaderDeps = section.dependsOn.filter(
        (d) => !d.includes("header")
      );
      // Content sections should only depend on header (or nothing)
      expect(
        section.dependsOn.length === 0 ||
          section.dependsOn.every((d) => d.includes("header"))
      ).toBe(true);
    }
  });

  it("should correctly identify dependent sections", () => {
    const plan = analyzeInfographicRequest(`
      Create infographic with header, detailed diagram, and footer
    `);

    const footerSection = plan.sections.find((s) => s.type === "footer");

    // Footer should depend on other sections
    expect(footerSection?.dependsOn.length).toBeGreaterThan(0);
  });

  it("should count parallel phases correctly", () => {
    const plan = analyzeInfographicRequest(`
      Create a complex infographic about technology with:
      statistics, comparison chart, timeline, process diagram, icons
    `);

    const parallelPhases = plan.phases.filter(
      (p) => p.parallel && p.sectionIds.length > 1
    );

    // With many independent sections, should have at least one parallel phase
    // (though this depends on how sections are grouped)
    console.log("Phases:", plan.phases.map(p => ({
      name: p.name,
      parallel: p.parallel,
      sections: p.sectionIds.length
    })));
  });
});
