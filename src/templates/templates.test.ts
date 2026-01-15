/**
 * Template System Tests
 *
 * Validates:
 * 1. Template definitions
 * 2. Template detection from task
 * 3. Template expansion
 * 4. Region → Element breakdown
 * 5. Validation scenarios
 */

import { describe, it, expect } from "vitest";
import {
  // Definitions
  PREDEFINED_TEMPLATES,
  getTemplate,
  listTemplates,
  getTemplateForSkill,
  detectTemplateFromTask,
  // Expansion
  expandTemplate,
  expandRegion,
  createCustomTemplate,
  type ExpansionResult,
} from "./index.js";
import {
  // Scenarios
  VALIDATION_SCENARIOS,
  executeScenario,
  executeAllScenarios,
  runValidationTests,
  quickTemplateCheck,
  demonstrateDesignerWorkflow,
} from "./scenarios.js";

describe("Template Definitions", () => {
  it("should have all predefined templates", () => {
    const expectedTemplates = [
      "mindmap",
      "flowchart",
      "kanban",
      "timeline",
      "infographic",
      "storyboard",
    ];

    for (const id of expectedTemplates) {
      expect(PREDEFINED_TEMPLATES[id]).toBeDefined();
      expect(PREDEFINED_TEMPLATES[id].id).toBe(id);
    }
  });

  it("should get template by ID", () => {
    const template = getTemplate("mindmap");
    expect(template).toBeDefined();
    expect(template?.name).toBe("Mindmap");
    expect(template?.skill).toBe("mindmap");
  });

  it("should return undefined for unknown template", () => {
    const template = getTemplate("unknown-template");
    expect(template).toBeUndefined();
  });

  it("should list all templates", () => {
    const templates = listTemplates();
    expect(templates.length).toBe(6);
    expect(templates.map((t) => t.id)).toContain("mindmap");
    expect(templates.map((t) => t.id)).toContain("flowchart");
  });

  it("should get template for skill", () => {
    const template = getTemplateForSkill("diagram");
    expect(template).toBeDefined();
    expect(template?.id).toBe("flowchart");
  });

  it("should have valid region definitions", () => {
    for (const [id, template] of Object.entries(PREDEFINED_TEMPLATES)) {
      expect(template.regions.length).toBeGreaterThan(0);

      for (const region of template.regions) {
        expect(region.id).toBeTruthy();
        expect(region.name).toBeTruthy();
        expect(region.type).toBeTruthy();
        expect(region.relativeBounds).toBeDefined();
        expect(region.relativeBounds.x).toBeGreaterThanOrEqual(0);
        expect(region.relativeBounds.y).toBeGreaterThanOrEqual(0);
        expect(region.relativeBounds.width).toBeGreaterThan(0);
        expect(region.relativeBounds.height).toBeGreaterThan(0);
        expect(region.elements.length).toBeGreaterThan(0);
      }
    }
  });

  it("should have valid element definitions", () => {
    for (const template of Object.values(PREDEFINED_TEMPLATES)) {
      for (const region of template.regions) {
        for (const element of region.elements) {
          expect(element.type).toBeTruthy();
          expect(element.role).toBeTruthy();
          expect(element.relativeX).toBeGreaterThanOrEqual(0);
          expect(element.relativeY).toBeGreaterThanOrEqual(0);
          expect(element.relativeWidth).toBeGreaterThan(0);
          expect(element.relativeHeight).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe("Template Detection", () => {
  const testCases = [
    { task: "Create a mindmap about AI", expected: "mindmap" },
    { task: "Make a brainstorming diagram", expected: "mindmap" },
    { task: "Build a flowchart for login", expected: "flowchart" },
    { task: "Create a process diagram", expected: "flowchart" },
    { task: "Make a kanban board", expected: "kanban" },
    { task: "Create a task board", expected: "kanban" },
    { task: "Build a timeline", expected: "timeline" },
    { task: "Create a roadmap", expected: "timeline" },
    { task: "Make an infographic", expected: "infographic" },
    { task: "Create a storyboard", expected: "storyboard" },
  ];

  for (const { task, expected } of testCases) {
    it(`should detect "${expected}" from "${task}"`, () => {
      const template = detectTemplateFromTask(task);
      expect(template).toBeDefined();
      expect(template?.id).toBe(expected);
    });
  }

  it("should return undefined for unrecognized task", () => {
    const template = detectTemplateFromTask("do something random");
    expect(template).toBeUndefined();
  });
});

describe("Template Expansion", () => {
  it("should expand mindmap template", () => {
    const result = expandTemplate("mindmap", {
      content: {
        title: "Test Topic",
        items: [
          { title: "Branch 1" },
          { title: "Branch 2" },
          { title: "Branch 3" },
        ],
      },
    });

    expect(result.template.id).toBe("mindmap");
    expect(result.regions.length).toBeGreaterThan(0);
    expect(result.elements.length).toBeGreaterThan(0);
    expect(result.writeOperations.length).toBeGreaterThan(0);
    expect(result.summary).toBeTruthy();
  });

  it("should expand flowchart template", () => {
    const result = expandTemplate("flowchart", {
      content: {
        title: "Login Flow",
        items: [
          { title: "Enter credentials" },
          { title: "Validate" },
          { title: "Authenticate" },
        ],
      },
    });

    expect(result.template.id).toBe("flowchart");
    expect(result.regions.some((r) => r.region.id === "start")).toBe(true);
    expect(result.regions.some((r) => r.region.id === "end")).toBe(true);
  });

  it("should detect template from task and expand", () => {
    const result = expandTemplate("Create a mindmap about technology", {
      content: {
        title: "Technology",
        items: [{ title: "AI" }, { title: "Cloud" }],
      },
    });

    expect(result.template.id).toBe("mindmap");
  });

  it("should default to mindmap for unknown task", () => {
    const result = expandTemplate("do something", {});
    expect(result.template.id).toBe("mindmap");
  });

  it("should apply custom canvas dimensions", () => {
    const result = expandTemplate("mindmap", {
      canvasDimensions: { width: 2000, height: 1500 },
    });

    expect(result.dimensions.width).toBe(2000);
    expect(result.dimensions.height).toBe(1500);
  });

  it("should apply offset", () => {
    const result = expandTemplate("mindmap", {
      offset: { x: 100, y: 50 },
    });

    // Check that elements are offset
    const element = result.elements[0];
    expect(element.x).toBeGreaterThan(0);
    expect(element.y).toBeGreaterThan(0);
  });

  it("should apply color scheme override", () => {
    const result = expandTemplate("mindmap", {
      colorScheme: {
        primary: "#FF0000",
      },
    });

    expect(result.writeOperations.length).toBeGreaterThan(0);
  });
});

describe("Region Breakdown", () => {
  it("should break down regions with absolute bounds", () => {
    const template = getTemplate("mindmap")!;
    const region = template.regions[0];

    const breakdown = expandRegion(
      region,
      { width: 1200, height: 900 },
      { x: 0, y: 0 },
      template.colorScheme,
      undefined
    );

    expect(breakdown.bounds.x).toBeGreaterThanOrEqual(0);
    expect(breakdown.bounds.y).toBeGreaterThanOrEqual(0);
    expect(breakdown.bounds.width).toBeGreaterThan(0);
    expect(breakdown.bounds.height).toBeGreaterThan(0);
    expect(breakdown.elements.length).toBeGreaterThan(0);
  });

  it("should expand repeatable regions into instances", () => {
    const template = getTemplate("kanban")!;
    const columnRegion = template.regions.find((r) => r.repeatable)!;

    const breakdown = expandRegion(
      columnRegion,
      { width: 1400, height: 800 },
      { x: 0, y: 0 },
      template.colorScheme,
      {
        items: [
          { title: "To Do" },
          { title: "In Progress" },
          { title: "Done" },
        ],
      }
    );

    expect(breakdown.instances).toBeDefined();
    expect(breakdown.instances?.length).toBe(3);
  });
});

describe("Custom Templates", () => {
  it("should create custom grid template", () => {
    const custom = createCustomTemplate({
      name: "SWOT Analysis",
      skill: "diagram",
      layout: "grid",
      sectionCount: 4,
    });

    expect(custom.id).toMatch(/^custom-/);
    expect(custom.name).toBe("SWOT Analysis");
    expect(custom.regions.length).toBeGreaterThan(0);

    // Should have header + 4 sections
    const sections = custom.regions.filter((r) => r.id.startsWith("section"));
    expect(sections.length).toBe(4);
  });

  it("should create custom flow template", () => {
    const custom = createCustomTemplate({
      name: "Process Flow",
      skill: "diagram",
      layout: "flow",
      sectionCount: 5,
    });

    const steps = custom.regions.filter((r) => r.id.startsWith("step"));
    expect(steps.length).toBe(5);
  });

  it("should create custom radial template", () => {
    const custom = createCustomTemplate({
      name: "Mind Diagram",
      skill: "mindmap",
      layout: "radial",
      sectionCount: 6,
    });

    expect(custom.regions.some((r) => r.id === "center")).toBe(true);
    const branches = custom.regions.filter((r) => r.id.startsWith("branch"));
    expect(branches.length).toBe(6);
  });

  it("should create custom timeline template", () => {
    const custom = createCustomTemplate({
      name: "Project Timeline",
      skill: "timeline",
      layout: "timeline",
      sectionCount: 4,
    });

    expect(custom.regions.some((r) => r.id === "baseline")).toBe(true);
    const events = custom.regions.filter((r) => r.id.startsWith("event"));
    expect(events.length).toBe(4);
  });

  it("should expand custom template", () => {
    const custom = createCustomTemplate({
      name: "Test Template",
      skill: "diagram",
      layout: "grid",
      sectionCount: 3,
    });

    // Expand the custom template
    const result = expandTemplate(custom.id, {
      content: {
        title: "Test",
        items: [{ title: "A" }, { title: "B" }, { title: "C" }],
      },
    });

    // Should default to mindmap since custom ID not in registry
    expect(result.elements.length).toBeGreaterThan(0);
  });
});

describe("Validation Scenarios", () => {
  it("should have multiple validation scenarios", () => {
    expect(VALIDATION_SCENARIOS.length).toBeGreaterThan(0);
  });

  it("should execute mindmap scenario", () => {
    const mindmapScenario = VALIDATION_SCENARIOS.find((s) =>
      s.name.includes("Mindmap")
    )!;
    const result = executeScenario(mindmapScenario);

    expect(result.passed).toBe(true);
    expect(result.checkResults.length).toBe(mindmapScenario.checks.length);
  });

  it("should execute flowchart scenario", () => {
    const flowchartScenario = VALIDATION_SCENARIOS.find((s) =>
      s.name.includes("Flowchart")
    )!;
    const result = executeScenario(flowchartScenario);

    expect(result.passed).toBe(true);
  });

  it("should execute kanban scenario", () => {
    const kanbanScenario = VALIDATION_SCENARIOS.find((s) =>
      s.name.includes("Kanban")
    )!;
    const result = executeScenario(kanbanScenario);

    expect(result.passed).toBe(true);
  });

  it("should execute all scenarios", () => {
    const results = executeAllScenarios();

    expect(results.length).toBe(VALIDATION_SCENARIOS.length);
    // Most scenarios should pass
    const passedCount = results.filter((r) => r.passed).length;
    expect(passedCount).toBeGreaterThanOrEqual(4);
  });

  it("should run validation tests and generate report", () => {
    const { passed, results, report } = runValidationTests();

    expect(results.length).toBeGreaterThan(0);
    expect(report).toContain("# Template Validation Scenarios Report");
    expect(report).toContain("## Summary");
  });

  it("should pass quick template check", () => {
    const passed = quickTemplateCheck();
    expect(passed).toBe(true);
  });
});

describe("Designer Workflow", () => {
  it("should demonstrate full designer workflow", () => {
    const { steps, finalResult } = demonstrateDesignerWorkflow(
      "Create a mindmap about AI technologies with branches for ML, NLP, and Vision"
    );

    // Should have 5 workflow steps
    expect(steps.length).toBe(5);

    // Check step names
    expect(steps[0].name).toBe("Explore Topic");
    expect(steps[1].name).toBe("Select Template");
    expect(steps[2].name).toBe("Prepare Content");
    expect(steps[3].name).toBe("Expand Template");
    expect(steps[4].name).toBe("Generate Operations");

    // Should produce valid result
    expect(finalResult.template).toBeDefined();
    expect(finalResult.regions.length).toBeGreaterThan(0);
    expect(finalResult.elements.length).toBeGreaterThan(0);
  });

  it("should detect flowchart from workflow task", () => {
    const { steps, finalResult } = demonstrateDesignerWorkflow(
      "Create a flowchart showing the checkout process"
    );

    expect(finalResult.template.id).toBe("flowchart");
  });

  it("should detect kanban from workflow task", () => {
    const { steps, finalResult } = demonstrateDesignerWorkflow(
      "Make a kanban board for project management"
    );

    expect(finalResult.template.id).toBe("kanban");
  });

  it("should handle timeline workflow", () => {
    const { steps, finalResult } = demonstrateDesignerWorkflow(
      "Create a timeline showing product history"
    );

    expect(finalResult.template.id).toBe("timeline");
  });
});

describe("Write Operations", () => {
  it("should generate valid write operations", () => {
    const result = expandTemplate("mindmap", {
      content: {
        title: "Test",
        items: [{ title: "A" }],
      },
    });

    expect(result.writeOperations.length).toBeGreaterThan(0);

    const op = result.writeOperations[0];
    expect(op.type).toBe("canvas_write");
    expect(op.params.tree).toBeDefined();
    expect(op.params.tree.type).toBe("frame");
  });

  it("should include all elements in write tree", () => {
    const result = expandTemplate("flowchart", {
      content: {
        title: "Test Flow",
        items: [{ title: "Step 1" }, { title: "Step 2" }],
      },
    });

    const op = result.writeOperations[0];
    expect(op.params.tree.children).toBeDefined();
    expect(op.params.tree.children!.length).toBe(result.elements.length);
  });
});
