/**
 * Structured Plan Tests
 *
 * Tests for the plan-walkthrough pattern:
 * 1. Create plan with objective, references, tasks, changes
 * 2. Parse plan from LLM output
 * 3. Validate scope before execution
 * 4. Track execution and verify scope
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  // Types and Schemas
  StructuredPlanSchema,
  PlanTaskSchema,
  ChangeScopeSchema,
  CreateSpecSchema,
  UpdateSpecSchema,
  DeleteSpecSchema,

  // Helpers
  createEmptyPlan,
  generatePlanId,
  generateTaskId,
  generateTempId,
  getPlanProgress,
  getCurrentTask,
  getChangeScopeSummary,
  formatPlanForContext,
  formatPlanAsYaml,

  // Types
  type StructuredPlan,
  type PlanTask,
  type ChangeScope,
} from "../structured-plan.js";

import {
  // Validation
  validatePlanSchema,
  validatePlanPreExecution,
  ExecutionTracker,
  parsePlanFromOutput,
  formatPlanForWalkthrough,
  formatScopeValidationReport,
  type CanvasStateForValidation,
} from "../plan-validator.js";

// Import canvas-plan tools for tests
import { executeCanvasPlan, executeCanvasPlanUpdate, executeCanvasPlanWalkthrough, clearPlan, getCurrentPlan } from "../../tools/canvas-plan.js";

// ============================================================================
// SCHEMA VALIDATION TESTS
// ============================================================================

describe("Structured Plan Schema", () => {
  describe("PlanTaskSchema", () => {
    it("should validate a valid task", () => {
      const task = {
        id: "task-1",
        content: "Create header frame",
        status: "pending",
        activeForm: "Creating header frame",
      };

      const result = PlanTaskSchema.safeParse(task);
      expect(result.success).toBe(true);
    });

    it("should accept all valid status values", () => {
      const statuses = ["pending", "in_progress", "completed", "failed", "skipped"];

      for (const status of statuses) {
        const task = {
          id: "task-1",
          content: "Test task",
          status,
          activeForm: "Testing",
        };
        const result = PlanTaskSchema.safeParse(task);
        expect(result.success).toBe(true);
      }
    });

    it("should reject invalid status", () => {
      const task = {
        id: "task-1",
        content: "Test task",
        status: "invalid",
        activeForm: "Testing",
      };

      const result = PlanTaskSchema.safeParse(task);
      expect(result.success).toBe(false);
    });

    it("should accept optional fields", () => {
      const task = {
        id: "task-1",
        content: "Create header",
        status: "pending",
        activeForm: "Creating header",
        creates: ["new-header"],
        updates: ["existing-frame"],
        dependsOn: ["task-0"],
      };

      const result = PlanTaskSchema.safeParse(task);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.creates).toEqual(["new-header"]);
        expect(result.data.dependsOn).toEqual(["task-0"]);
      }
    });
  });

  describe("CreateSpecSchema", () => {
    it("should validate a valid create spec", () => {
      const spec = {
        tempId: "new-header-1",
        type: "frame",
        description: "Main header container",
      };

      const result = CreateSpecSchema.safeParse(spec);
      expect(result.success).toBe(true);
    });

    it("should accept all valid element types", () => {
      const types = ["rectangle", "ellipse", "diamond", "text", "line", "arrow", "freedraw", "image", "frame"];

      for (const type of types) {
        const spec = {
          tempId: `new-${type}-1`,
          type,
          description: `A ${type} element`,
        };
        const result = CreateSpecSchema.safeParse(spec);
        expect(result.success).toBe(true);
      }
    });

    it("should accept optional parent", () => {
      const spec = {
        tempId: "new-title",
        type: "text",
        description: "Title text",
        parent: "new-header-1",
      };

      const result = CreateSpecSchema.safeParse(spec);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.parent).toBe("new-header-1");
      }
    });
  });

  describe("ChangeScopeSchema", () => {
    it("should validate a complete change scope", () => {
      const scope = {
        creates: [
          { tempId: "new-header", type: "frame", description: "Header" },
          { tempId: "new-title", type: "text", description: "Title", parent: "new-header" },
        ],
        updates: [
          { targetId: "frame-1", changes: { backgroundColor: "#f5f5f5" } },
        ],
        deletes: [
          { targetId: "old-header", reason: "Replacing with new design" },
        ],
      };

      const result = ChangeScopeSchema.safeParse(scope);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.creates).toHaveLength(2);
        expect(result.data.updates).toHaveLength(1);
        expect(result.data.deletes).toHaveLength(1);
      }
    });

    it("should default to empty arrays", () => {
      const scope = {};

      const result = ChangeScopeSchema.safeParse(scope);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.creates).toEqual([]);
        expect(result.data.updates).toEqual([]);
        expect(result.data.deletes).toEqual([]);
      }
    });
  });

  describe("StructuredPlanSchema", () => {
    it("should validate a complete structured plan", () => {
      const plan = {
        version: "1.0",
        id: "plan-123",
        objective: {
          summary: "Create marketing infographic",
          details: "A detailed marketing infographic with header and stats",
        },
        references: {
          elements: [{ id: "frame-1", reason: "Parent container" }],
          context: [{ type: "user_input", value: "Q4 sales data" }],
        },
        tasks: [
          { id: "task-1", content: "Create header", status: "pending", activeForm: "Creating header" },
        ],
        changes: {
          creates: [{ tempId: "new-header", type: "frame", description: "Header" }],
          updates: [],
          deletes: [],
        },
      };

      const result = StructuredPlanSchema.safeParse(plan);
      expect(result.success).toBe(true);
    });

    it("should set defaults for missing optional fields", () => {
      const plan = {
        id: "plan-123",
        objective: { summary: "Test plan" },
        references: { elements: [], context: [] },
        tasks: [],
        changes: { creates: [], updates: [], deletes: [] },
      };

      const result = StructuredPlanSchema.safeParse(plan);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.version).toBe("1.0");
        expect(result.data.createdAt).toBeDefined();
      }
    });
  });
});

// ============================================================================
// HELPER FUNCTION TESTS
// ============================================================================

describe("Helper Functions", () => {
  describe("createEmptyPlan", () => {
    it("should create a valid empty plan", () => {
      const plan = createEmptyPlan("plan-test", "Test objective");

      expect(plan.id).toBe("plan-test");
      expect(plan.objective.summary).toBe("Test objective");
      expect(plan.tasks).toEqual([]);
      expect(plan.changes.creates).toEqual([]);
      expect(plan.changes.updates).toEqual([]);
      expect(plan.changes.deletes).toEqual([]);
    });
  });

  describe("generatePlanId", () => {
    it("should generate unique plan IDs", () => {
      const id1 = generatePlanId();
      const id2 = generatePlanId();

      expect(id1).toMatch(/^plan-\d+-[a-z0-9]+$/);
      expect(id1).not.toBe(id2);
    });
  });

  describe("generateTaskId", () => {
    it("should generate task IDs with default prefix", () => {
      const id = generateTaskId();
      expect(id).toMatch(/^task-[a-z0-9]+$/);
    });

    it("should generate task IDs with custom prefix", () => {
      const id = generateTaskId("step");
      expect(id).toMatch(/^step-[a-z0-9]+$/);
    });
  });

  describe("generateTempId", () => {
    it("should generate temp IDs for element types", () => {
      const id = generateTempId("frame");
      expect(id).toMatch(/^new-frame-[a-z0-9]+$/);
    });
  });

  describe("getPlanProgress", () => {
    it("should calculate progress correctly", () => {
      const plan: StructuredPlan = {
        version: "1.0",
        id: "plan-1",
        objective: { summary: "Test" },
        references: { elements: [], context: [] },
        tasks: [
          { id: "1", content: "Task 1", status: "completed", activeForm: "Task 1" },
          { id: "2", content: "Task 2", status: "completed", activeForm: "Task 2" },
          { id: "3", content: "Task 3", status: "in_progress", activeForm: "Task 3" },
          { id: "4", content: "Task 4", status: "pending", activeForm: "Task 4" },
          { id: "5", content: "Task 5", status: "failed", activeForm: "Task 5" },
        ],
        changes: { creates: [], updates: [], deletes: [] },
        createdAt: Date.now(),
      };

      const progress = getPlanProgress(plan);

      expect(progress.total).toBe(5);
      expect(progress.completed).toBe(2);
      expect(progress.inProgress).toBe(1);
      expect(progress.pending).toBe(1);
      expect(progress.failed).toBe(1);
      expect(progress.percent).toBe(40); // 2/5 = 40%
    });

    it("should handle empty task list", () => {
      const plan = createEmptyPlan("plan-1", "Test");
      const progress = getPlanProgress(plan);

      expect(progress.total).toBe(0);
      expect(progress.percent).toBe(0);
    });
  });

  describe("getCurrentTask", () => {
    it("should return the in-progress task", () => {
      const plan: StructuredPlan = {
        version: "1.0",
        id: "plan-1",
        objective: { summary: "Test" },
        references: { elements: [], context: [] },
        tasks: [
          { id: "1", content: "Task 1", status: "completed", activeForm: "Completing Task 1" },
          { id: "2", content: "Task 2", status: "in_progress", activeForm: "Working on Task 2" },
          { id: "3", content: "Task 3", status: "pending", activeForm: "Starting Task 3" },
        ],
        changes: { creates: [], updates: [], deletes: [] },
        createdAt: Date.now(),
      };

      const current = getCurrentTask(plan);

      expect(current).toBeDefined();
      expect(current?.id).toBe("2");
      expect(current?.status).toBe("in_progress");
    });

    it("should return undefined when no task is in progress", () => {
      const plan = createEmptyPlan("plan-1", "Test");
      plan.tasks = [
        { id: "1", content: "Task 1", status: "completed", activeForm: "Task 1" },
        { id: "2", content: "Task 2", status: "pending", activeForm: "Task 2" },
      ];

      const current = getCurrentTask(plan);
      expect(current).toBeUndefined();
    });
  });

  describe("getChangeScopeSummary", () => {
    it("should summarize change scope", () => {
      const scope: ChangeScope = {
        creates: [
          { tempId: "new-1", type: "frame", description: "Frame 1" },
          { tempId: "new-2", type: "text", description: "Text 1" },
        ],
        updates: [{ targetId: "elem-1", changes: { x: 100 } }],
        deletes: [],
      };

      const summary = getChangeScopeSummary(scope);
      expect(summary).toBe("+2 new, ~1 updates");
    });

    it("should return 'no changes' for empty scope", () => {
      const scope: ChangeScope = { creates: [], updates: [], deletes: [] };
      const summary = getChangeScopeSummary(scope);
      expect(summary).toBe("no changes");
    });
  });

  describe("formatPlanForContext", () => {
    it("should format plan for LLM context", () => {
      const plan: StructuredPlan = {
        version: "1.0",
        id: "plan-1",
        objective: { summary: "Create dashboard" },
        references: {
          elements: [{ id: "frame-1" }],
          context: [],
        },
        tasks: [
          { id: "1", content: "Create header", status: "completed", activeForm: "Creating header" },
          { id: "2", content: "Add stats", status: "in_progress", activeForm: "Adding stats" },
          { id: "3", content: "Style it", status: "pending", activeForm: "Styling" },
        ],
        changes: {
          creates: [{ tempId: "new-1", type: "frame", description: "Header" }],
          updates: [],
          deletes: [],
        },
        createdAt: Date.now(),
      };

      const context = formatPlanForContext(plan);

      expect(context).toContain("## Objective");
      expect(context).toContain("Create dashboard");
      expect(context).toContain("## Tasks");
      expect(context).toContain("✓ Create header");
      expect(context).toContain("→ Adding stats");
      expect(context).toContain("○ Style it");
      expect(context).toContain("+1 new");
    });
  });

  describe("formatPlanAsYaml", () => {
    it("should format plan as YAML-like block", () => {
      const plan: StructuredPlan = {
        version: "1.0",
        id: "plan-1",
        objective: { summary: "Test plan" },
        references: {
          elements: [{ id: "frame-1", reason: "Container" }],
          context: [],
        },
        tasks: [
          { id: "1", content: "Task 1", status: "pending", activeForm: "Doing Task 1" },
        ],
        changes: {
          creates: [{ tempId: "new-header", type: "frame", description: "Header frame" }],
          updates: [{ targetId: "frame-1", changes: { x: 100 } }],
          deletes: [],
        },
        createdAt: Date.now(),
      };

      const yaml = formatPlanAsYaml(plan);

      expect(yaml).toContain("```plan");
      expect(yaml).toContain("objective: Test plan");
      expect(yaml).toContain("references:");
      expect(yaml).toContain("frame-1");
      expect(yaml).toContain("tasks:");
      expect(yaml).toContain("[pending]");
      expect(yaml).toContain("changes:");
      expect(yaml).toContain("creates:");
      expect(yaml).toContain("new-header");
      expect(yaml).toContain("```");
    });
  });
});

// ============================================================================
// VALIDATION TESTS
// ============================================================================

describe("Plan Validation", () => {
  describe("validatePlanSchema", () => {
    it("should validate a correct plan", () => {
      const plan = {
        version: "1.0",
        id: "plan-1",
        objective: { summary: "Test" },
        references: { elements: [], context: [] },
        tasks: [],
        changes: { creates: [], updates: [], deletes: [] },
        createdAt: Date.now(),
      };

      const result = validatePlanSchema(plan);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should report schema errors", () => {
      const invalidPlan = {
        id: "plan-1",
        // missing objective
        tasks: [],
      };

      const result = validatePlanSchema(invalidPlan);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe("validatePlanPreExecution", () => {
    const createCanvasState = (elementIds: string[], types?: Record<string, string>): CanvasStateForValidation => ({
      elementIds: new Set(elementIds),
      elementTypes: new Map(Object.entries(types ?? {})),
    });

    it("should validate plan with existing references", () => {
      const plan: StructuredPlan = {
        version: "1.0",
        id: "plan-1",
        objective: { summary: "Test" },
        references: {
          elements: [{ id: "frame-1", reason: "Container" }],
          context: [],
        },
        tasks: [],
        changes: {
          creates: [],
          updates: [{ targetId: "frame-1", changes: { x: 100 } }],
          deletes: [],
        },
        createdAt: Date.now(),
      };

      const canvasState = createCanvasState(["frame-1", "frame-2"]);
      const result = validatePlanPreExecution(plan, canvasState);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should report missing reference", () => {
      const plan: StructuredPlan = {
        version: "1.0",
        id: "plan-1",
        objective: { summary: "Test" },
        references: {
          elements: [{ id: "nonexistent-element" }],
          context: [],
        },
        tasks: [],
        changes: { creates: [], updates: [], deletes: [] },
        createdAt: Date.now(),
      };

      const canvasState = createCanvasState(["frame-1"]);
      const result = validatePlanPreExecution(plan, canvasState);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === "REFERENCE_NOT_FOUND")).toBe(true);
    });

    it("should report missing update target", () => {
      const plan: StructuredPlan = {
        version: "1.0",
        id: "plan-1",
        objective: { summary: "Test" },
        references: { elements: [], context: [] },
        tasks: [],
        changes: {
          creates: [],
          updates: [{ targetId: "nonexistent", changes: { x: 100 } }],
          deletes: [],
        },
        createdAt: Date.now(),
      };

      const canvasState = createCanvasState(["frame-1"]);
      const result = validatePlanPreExecution(plan, canvasState);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === "UPDATE_TARGET_NOT_FOUND")).toBe(true);
    });

    it("should report missing delete target", () => {
      const plan: StructuredPlan = {
        version: "1.0",
        id: "plan-1",
        objective: { summary: "Test" },
        references: { elements: [], context: [] },
        tasks: [],
        changes: {
          creates: [],
          updates: [],
          deletes: [{ targetId: "nonexistent" }],
        },
        createdAt: Date.now(),
      };

      const canvasState = createCanvasState(["frame-1"]);
      const result = validatePlanPreExecution(plan, canvasState);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === "DELETE_TARGET_NOT_FOUND")).toBe(true);
    });

    it("should report duplicate tempIds", () => {
      const plan: StructuredPlan = {
        version: "1.0",
        id: "plan-1",
        objective: { summary: "Test" },
        references: { elements: [], context: [] },
        tasks: [],
        changes: {
          creates: [
            { tempId: "new-elem", type: "frame", description: "First" },
            { tempId: "new-elem", type: "text", description: "Duplicate!" },
          ],
          updates: [],
          deletes: [],
        },
        createdAt: Date.now(),
      };

      const canvasState = createCanvasState([]);
      const result = validatePlanPreExecution(plan, canvasState);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === "DUPLICATE_TEMP_ID")).toBe(true);
    });

    it("should detect circular dependencies", () => {
      const plan: StructuredPlan = {
        version: "1.0",
        id: "plan-1",
        objective: { summary: "Test" },
        references: { elements: [], context: [] },
        tasks: [
          { id: "task-1", content: "Task 1", status: "pending", activeForm: "T1", dependsOn: ["task-3"] },
          { id: "task-2", content: "Task 2", status: "pending", activeForm: "T2", dependsOn: ["task-1"] },
          { id: "task-3", content: "Task 3", status: "pending", activeForm: "T3", dependsOn: ["task-2"] },
        ],
        changes: { creates: [], updates: [], deletes: [] },
        createdAt: Date.now(),
      };

      const canvasState = createCanvasState([]);
      const result = validatePlanPreExecution(plan, canvasState);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === "CIRCULAR_DEPENDENCY")).toBe(true);
    });

    it("should warn on type mismatch", () => {
      const plan: StructuredPlan = {
        version: "1.0",
        id: "plan-1",
        objective: { summary: "Test" },
        references: {
          elements: [{ id: "elem-1", type: "frame" }],
          context: [],
        },
        tasks: [],
        changes: { creates: [], updates: [], deletes: [] },
        createdAt: Date.now(),
      };

      const canvasState = createCanvasState(["elem-1"], { "elem-1": "rectangle" });
      const result = validatePlanPreExecution(plan, canvasState);

      expect(result.valid).toBe(true); // Warnings don't fail validation
      expect(result.warnings.some(w => w.code === "TYPE_MISMATCH")).toBe(true);
    });
  });
});

// ============================================================================
// EXECUTION TRACKING TESTS
// ============================================================================

describe("ExecutionTracker", () => {
  let tracker: ExecutionTracker;

  beforeEach(() => {
    const scope: ChangeScope = {
      creates: [
        { tempId: "new-header", type: "frame", description: "Header" },
        { tempId: "new-title", type: "text", description: "Title" },
      ],
      updates: [{ targetId: "frame-1", changes: { x: 100 } }],
      deletes: [{ targetId: "old-elem", reason: "Cleanup" }],
    };
    tracker = new ExecutionTracker(scope);
  });

  it("should track created elements", () => {
    tracker.recordCreate("new-header", "elem-abc123");
    tracker.recordCreate("new-title", "elem-def456");

    const mapping = tracker.getTempIdMapping();
    expect(mapping.get("new-header")).toBe("elem-abc123");
    expect(mapping.get("new-title")).toBe("elem-def456");
  });

  it("should resolve tempIds to actual IDs", () => {
    tracker.recordCreate("new-header", "elem-abc123");

    expect(tracker.resolveId("new-header")).toBe("elem-abc123");
    expect(tracker.resolveId("unknown")).toBe("unknown"); // Returns as-is
  });

  it("should track updated elements", () => {
    tracker.recordUpdate("frame-1");

    const summary = tracker.getSummary();
    expect(summary.updated).toBe(1);
  });

  it("should track deleted elements", () => {
    tracker.recordDelete("old-elem");

    const summary = tracker.getSummary();
    expect(summary.deleted).toBe(1);
  });

  describe("validateScope", () => {
    it("should validate matching scope", () => {
      // Execute all expected changes
      tracker.recordCreate("new-header", "elem-1");
      tracker.recordCreate("new-title", "elem-2");
      tracker.recordUpdate("frame-1");
      tracker.recordDelete("old-elem");

      const result = tracker.validateScope();

      expect(result.valid).toBe(true);
      expect(result.unexpectedCreates).toHaveLength(0);
      expect(result.unexpectedUpdates).toHaveLength(0);
      expect(result.unexpectedDeletes).toHaveLength(0);
      expect(result.missingCreates).toHaveLength(0);
    });

    it("should report unexpected creates", () => {
      tracker.recordCreate("new-header", "elem-1");
      tracker.recordCreate("new-title", "elem-2");
      tracker.recordCreate("extra-element", "elem-3"); // Unexpected!
      tracker.recordUpdate("frame-1");
      tracker.recordDelete("old-elem");

      const result = tracker.validateScope();

      expect(result.valid).toBe(false);
      expect(result.unexpectedCreates).toContain("extra-element");
    });

    it("should report missing creates", () => {
      tracker.recordCreate("new-header", "elem-1");
      // Missing: new-title
      tracker.recordUpdate("frame-1");
      tracker.recordDelete("old-elem");

      const result = tracker.validateScope();

      expect(result.valid).toBe(false);
      expect(result.missingCreates).toContain("new-title");
    });

    it("should report unexpected updates", () => {
      tracker.recordCreate("new-header", "elem-1");
      tracker.recordCreate("new-title", "elem-2");
      tracker.recordUpdate("frame-1");
      tracker.recordUpdate("frame-2"); // Unexpected!
      tracker.recordDelete("old-elem");

      const result = tracker.validateScope();

      expect(result.unexpectedUpdates).toContain("frame-2");
    });

    it("should report unexpected deletes", () => {
      tracker.recordCreate("new-header", "elem-1");
      tracker.recordCreate("new-title", "elem-2");
      tracker.recordUpdate("frame-1");
      tracker.recordDelete("old-elem");
      tracker.recordDelete("another-elem"); // Unexpected!

      const result = tracker.validateScope();

      expect(result.unexpectedDeletes).toContain("another-elem");
    });
  });
});

// ============================================================================
// PLAN PARSING TESTS
// ============================================================================

describe("Plan Parsing", () => {
  describe("parsePlanFromOutput", () => {
    it("should parse JSON plan from LLM output", () => {
      const output = `
Here's my plan:

\`\`\`json
{
  "version": "1.0",
  "id": "plan-123",
  "objective": { "summary": "Create dashboard" },
  "references": { "elements": [], "context": [] },
  "tasks": [
    { "id": "task-1", "content": "Create header", "status": "pending", "activeForm": "Creating header" }
  ],
  "changes": {
    "creates": [{ "tempId": "new-header", "type": "frame", "description": "Header" }],
    "updates": [],
    "deletes": []
  }
}
\`\`\`

Let me know if you want changes.
      `;

      const plan = parsePlanFromOutput(output);

      expect(plan).not.toBeNull();
      expect(plan?.objective.summary).toBe("Create dashboard");
      expect(plan?.tasks).toHaveLength(1);
      expect(plan?.changes.creates).toHaveLength(1);
    });

    it("should parse YAML-like plan from LLM output", () => {
      const output = `
\`\`\`plan
objective: Create a simple dashboard
references:
  - frame-1 # Main container
tasks:
  - [pending] Create header frame
  - [pending] Add statistics section
changes:
  creates:
    - new-header: frame # Header container
    - new-stats: frame # Statistics section
  updates:
    - frame-1: backgroundColor
\`\`\`
      `;

      const plan = parsePlanFromOutput(output);

      expect(plan).not.toBeNull();
      expect(plan?.objective.summary).toBe("Create a simple dashboard");
      expect(plan?.tasks).toHaveLength(2);
      expect(plan?.changes.creates).toHaveLength(2);
    });

    it("should return null for unparseable output", () => {
      const output = "I'll create some elements for you.";

      const plan = parsePlanFromOutput(output);

      expect(plan).toBeNull();
    });
  });
});

// ============================================================================
// WALKTHROUGH FORMAT TESTS
// ============================================================================

describe("Walkthrough Formatting", () => {
  describe("formatPlanForWalkthrough", () => {
    it("should format plan for user review", () => {
      const plan: StructuredPlan = {
        version: "1.0",
        id: "plan-1",
        objective: { summary: "Create marketing infographic" },
        references: {
          elements: [{ id: "frame-1", reason: "Main container" }],
          context: [],
        },
        tasks: [
          { id: "1", content: "Create header section", status: "pending", activeForm: "Creating header", creates: ["new-header"] },
          { id: "2", content: "Add statistics", status: "pending", activeForm: "Adding stats", creates: ["new-stats"] },
        ],
        changes: {
          creates: [
            { tempId: "new-header", type: "frame", description: "Header container" },
            { tempId: "new-stats", type: "frame", description: "Statistics section" },
          ],
          updates: [{ targetId: "frame-1", changes: { backgroundColor: "#fff" } }],
          deletes: [],
        },
        createdAt: Date.now(),
      };

      const formatted = formatPlanForWalkthrough(plan);

      expect(formatted).toContain("## Plan Summary");
      expect(formatted).toContain("Create marketing infographic");
      expect(formatted).toContain("### References");
      expect(formatted).toContain("`frame-1`");
      expect(formatted).toContain("### Tasks");
      expect(formatted).toContain("1. Create header section");
      expect(formatted).toContain("2. Add statistics");
      expect(formatted).toContain("### Expected Changes");
      expect(formatted).toContain("**Creates:**");
      expect(formatted).toContain("`new-header`");
      expect(formatted).toContain("**Updates:**");
      expect(formatted).toContain("`frame-1`");
    });
  });

  describe("formatScopeValidationReport", () => {
    it("should format valid scope result", () => {
      const result = {
        valid: true,
        unexpectedCreates: [],
        unexpectedUpdates: [],
        unexpectedDeletes: [],
        missingCreates: [],
        missingUpdates: [],
        missingDeletes: [],
      };

      const report = formatScopeValidationReport(result);

      expect(report).toContain("✓ All changes match expected scope");
    });

    it("should format invalid scope result with issues", () => {
      const result = {
        valid: false,
        unexpectedCreates: ["extra-elem"],
        unexpectedUpdates: ["frame-2"],
        unexpectedDeletes: [],
        missingCreates: ["missing-header"],
        missingUpdates: [],
        missingDeletes: [],
      };

      const report = formatScopeValidationReport(result);

      expect(report).toContain("⚠ Scope validation issues found");
      expect(report).toContain("**Unexpected creates:** extra-elem");
      expect(report).toContain("**Unexpected updates:** frame-2");
      expect(report).toContain("**Missing creates:** missing-header");
    });
  });
});

// ============================================================================
// INTEGRATION TEST: FULL PLAN-WALKTHROUGH PATTERN
// ============================================================================

describe("Integration: Plan-Walkthrough Pattern", () => {
  it("should support full workflow: create → validate → execute → verify", () => {
    // 1. CREATE PLAN
    const plan: StructuredPlan = {
      version: "1.0",
      id: generatePlanId(),
      objective: {
        summary: "Create a simple dashboard with header and two stat cards",
      },
      references: {
        elements: [],
        context: [{ type: "user_input", value: "Dashboard with header and stats" }],
      },
      tasks: [
        { id: "task-1", content: "Create header frame", status: "pending", activeForm: "Creating header", creates: ["new-header"] },
        { id: "task-2", content: "Add title text", status: "pending", activeForm: "Adding title", creates: ["new-title"] },
        { id: "task-3", content: "Create stat cards", status: "pending", activeForm: "Creating stat cards", creates: ["new-card-1", "new-card-2"] },
      ],
      changes: {
        creates: [
          { tempId: "new-header", type: "frame", description: "Header frame" },
          { tempId: "new-title", type: "text", description: "Dashboard title", parent: "new-header" },
          { tempId: "new-card-1", type: "rectangle", description: "Stat card 1" },
          { tempId: "new-card-2", type: "rectangle", description: "Stat card 2" },
        ],
        updates: [],
        deletes: [],
      },
      createdAt: Date.now(),
    };

    // Verify plan is valid schema
    const schemaResult = validatePlanSchema(plan);
    expect(schemaResult.valid).toBe(true);

    // 2. VALIDATE SCOPE (pre-execution)
    const canvasState: CanvasStateForValidation = {
      elementIds: new Set(),
      elementTypes: new Map(),
    };

    const preValidation = validatePlanPreExecution(plan, canvasState);
    expect(preValidation.valid).toBe(true);

    // 3. FORMAT FOR WALKTHROUGH
    const walkthrough = formatPlanForWalkthrough(plan);
    expect(walkthrough).toContain("Create a simple dashboard");
    expect(walkthrough).toContain("new-header");
    expect(walkthrough).toContain("new-title");
    expect(walkthrough).toContain("new-card-1");
    expect(walkthrough).toContain("new-card-2"); // All 4 creates listed

    // 4. EXECUTE (simulated) with tracking
    const tracker = new ExecutionTracker(plan.changes);

    // Simulate execution: mark tasks as in_progress, create elements, mark complete
    // Task 1: Create header frame
    plan.tasks[0].status = "in_progress";
    tracker.recordCreate("new-header", "elem-header-001");
    plan.tasks[0].status = "completed";

    // Task 2: Add title text
    plan.tasks[1].status = "in_progress";
    tracker.recordCreate("new-title", "elem-title-001");
    plan.tasks[1].status = "completed";

    // Task 3: Create stat cards
    plan.tasks[2].status = "in_progress";
    tracker.recordCreate("new-card-1", "elem-card-001");
    tracker.recordCreate("new-card-2", "elem-card-002");
    plan.tasks[2].status = "completed";

    // 5. VERIFY SCOPE (post-execution)
    const scopeResult = tracker.validateScope();
    expect(scopeResult.valid).toBe(true);
    expect(scopeResult.missingCreates).toHaveLength(0);
    expect(scopeResult.unexpectedCreates).toHaveLength(0);

    // 6. CHECK PLAN PROGRESS
    const progress = getPlanProgress(plan);
    expect(progress.completed).toBe(3);
    expect(progress.percent).toBe(100);

    // 7. RESOLVE TEMP IDs
    const mapping = tracker.getTempIdMapping();
    expect(mapping.get("new-header")).toBe("elem-header-001");
    expect(mapping.get("new-title")).toBe("elem-title-001");
    expect(mapping.get("new-card-1")).toBe("elem-card-001");
    expect(mapping.get("new-card-2")).toBe("elem-card-002");

    // Generate final report
    const report = formatScopeValidationReport(scopeResult);
    expect(report).toContain("✓ All changes match expected scope");
  });

  it("should detect scope violations during execution", () => {
    const plan: StructuredPlan = {
      version: "1.0",
      id: "plan-test",
      objective: { summary: "Create header only" },
      references: { elements: [], context: [] },
      tasks: [
        { id: "task-1", content: "Create header", status: "pending", activeForm: "Creating header", creates: ["new-header"] },
      ],
      changes: {
        creates: [{ tempId: "new-header", type: "frame", description: "Header" }],
        updates: [],
        deletes: [],
      },
      createdAt: Date.now(),
    };

    const tracker = new ExecutionTracker(plan.changes);

    // Execute with scope violation: create extra element
    tracker.recordCreate("new-header", "elem-001");
    tracker.recordCreate("extra-element", "elem-002"); // NOT in plan!

    const scopeResult = tracker.validateScope();

    expect(scopeResult.valid).toBe(false);
    expect(scopeResult.unexpectedCreates).toContain("extra-element");

    const report = formatScopeValidationReport(scopeResult);
    expect(report).toContain("Unexpected creates");
  });
});

// =============================================================================
// CANVAS_PLAN TOOL WALKTHROUGH TESTS
// =============================================================================

describe("canvas_plan tool walkthrough", () => {
  const mockContext = {
    sessionId: "test-session",
    resources: {},
  };

  it("should not generate walkthrough when tasks are pending", async () => {
    const input = {
      version: "structured" as const,
      objective: { summary: "Test plan" },
      tasks: [
        { content: "Task 1", status: "completed" as const, activeForm: "Doing task 1" },
        { content: "Task 2", status: "pending" as const, activeForm: "Doing task 2" },
      ],
      changes: {
        creates: [{ tempId: "new-item", type: "rectangle" as const, description: "Test item" }],
        updates: [],
        deletes: [],
      },
    };

    const result = await executeCanvasPlan(input, mockContext);

    expect(result.success).toBe(true);
    expect(result.data?.walkthrough).toBeUndefined();
  });

  it("should not generate walkthrough when tasks are in_progress", async () => {
    const input = {
      version: "structured" as const,
      objective: { summary: "Test plan" },
      tasks: [
        { content: "Task 1", status: "completed" as const, activeForm: "Doing task 1" },
        { content: "Task 2", status: "in_progress" as const, activeForm: "Doing task 2" },
      ],
      changes: {
        creates: [{ tempId: "new-item", type: "rectangle" as const, description: "Test item" }],
        updates: [],
        deletes: [],
      },
    };

    const result = await executeCanvasPlan(input, mockContext);

    expect(result.success).toBe(true);
    expect(result.data?.walkthrough).toBeUndefined();
  });

  it("should not auto-generate walkthrough when all tasks are completed (use canvas_plan_walkthrough instead)", async () => {
    const input = {
      version: "structured" as const,
      objective: { summary: "Create dashboard" },
      tasks: [
        { content: "Create header", status: "completed" as const, activeForm: "Creating header" },
        { content: "Add cards", status: "completed" as const, activeForm: "Adding cards" },
      ],
      changes: {
        creates: [
          { tempId: "new-header", type: "frame" as const, description: "Header container" },
          { tempId: "new-card", type: "rectangle" as const, description: "Stat card" },
        ],
        updates: [
          { targetId: "frame-1", changes: { backgroundColor: "#f5f5f5" } },
        ],
        deletes: [
          { targetId: "old-element", reason: "Replacing" },
        ],
      },
    };

    const result = await executeCanvasPlan(input, mockContext);

    expect(result.success).toBe(true);
    // No auto-walkthrough - use canvas_plan_walkthrough tool instead
    expect((result.data as Record<string, unknown>)?.walkthrough).toBeUndefined();
    // Verify plan data is still stored correctly
    expect(result.data?.summary.completed).toBe(2);
    expect(result.data?.structuredPlan?.changeScope.creates).toBe(2);
    expect(result.data?.structuredPlan?.changeScope.updates).toBe(1);
    expect(result.data?.structuredPlan?.changeScope.deletes).toBe(1);
  });

  it("should store change details for later walkthrough verification", async () => {
    const input = {
      version: "structured" as const,
      objective: { summary: "Update styles" },
      tasks: [
        { content: "Update colors", status: "completed" as const, activeForm: "Updating colors" },
      ],
      changes: {
        creates: [],
        updates: [
          { targetId: "elem-1", changes: { backgroundColor: "#ff0000", fontSize: 16 } },
        ],
        deletes: [],
      },
    };

    const result = await executeCanvasPlan(input, mockContext);

    expect(result.success).toBe(true);
    // Verify change scope is tracked
    expect(result.data?.structuredPlan?.changeScope.updates).toBe(1);
  });

  it("should not generate walkthrough for empty task list", async () => {
    const input = {
      version: "structured" as const,
      objective: { summary: "Empty plan" },
      tasks: [],
      changes: {
        creates: [],
        updates: [],
        deletes: [],
      },
    };

    const result = await executeCanvasPlan(input, mockContext);

    expect(result.success).toBe(true);
    expect(result.data?.walkthrough).toBeUndefined();
  });

  it("should include delegated status in summary", async () => {
    const input = {
      version: "structured" as const,
      objective: { summary: "Test delegation" },
      tasks: [
        { content: "Create layout", status: "delegated" as const, activeForm: "Creating layout", delegateTo: "layout" },
        { content: "Add content", status: "pending" as const, activeForm: "Adding content" },
      ],
      changes: {
        creates: [],
        updates: [],
        deletes: [],
        delegations: [],
      },
    };

    const result = await executeCanvasPlan(input, mockContext);

    expect(result.success).toBe(true);
    expect(result.data?.summary.delegated).toBe(1);
    expect(result.data?.summary.pending).toBe(1);
  });

  it("should not generate walkthrough when delegated tasks have no outcome", async () => {
    const input = {
      version: "structured" as const,
      objective: { summary: "Test delegation" },
      tasks: [
        { content: "Create layout", status: "delegated" as const, activeForm: "Creating layout", delegateTo: "layout" },
      ],
      changes: {
        creates: [],
        updates: [],
        deletes: [],
        delegations: [
          { taskId: "task-1", delegateTo: "layout", expectedOutcome: "Grid layout", expectedElements: [] },
        ],
      },
    };

    const result = await executeCanvasPlan(input, mockContext);

    expect(result.success).toBe(true);
    // No walkthrough because delegation has no outcome yet
    expect(result.data?.walkthrough).toBeUndefined();
  });

  it("should store delegation outcomes for later walkthrough verification", async () => {
    const input = {
      version: "structured" as const,
      objective: { summary: "Create dashboard with delegation" },
      tasks: [
        {
          content: "Create layout",
          status: "delegated" as const,
          activeForm: "Creating layout",
          delegateTo: "layout",
          delegationOutcome: {
            success: true,
            elementIds: ["frame-layout-001", "frame-col-001"],
            summary: "Grid layout with 2 columns",
          },
        },
        { content: "Add card", status: "completed" as const, activeForm: "Adding card" },
      ],
      changes: {
        creates: [{ tempId: "new-card", type: "rectangle" as const, description: "Stat card" }],
        updates: [],
        deletes: [],
        delegations: [
          { taskId: "task-1", delegateTo: "layout", expectedOutcome: "Grid layout", expectedElements: [{ type: "frame", description: "Layout container" }] },
        ],
      },
    };

    const result = await executeCanvasPlan(input, mockContext);

    expect(result.success).toBe(true);
    // No auto-walkthrough - use canvas_plan_walkthrough tool instead
    expect((result.data as Record<string, unknown>)?.walkthrough).toBeUndefined();
    // Verify delegation data is tracked
    expect(result.data?.summary.delegated).toBe(1);
    expect(result.data?.summary.completed).toBe(1);
    expect(result.data?.structuredPlan?.changeScope.delegations).toBe(1);
    // Task delegation outcome is stored
    expect(result.data?.tasks[0].delegationOutcome?.success).toBe(true);
    expect(result.data?.tasks[0].delegationOutcome?.elementIds).toContain("frame-layout-001");
  });

  it("should store delegation errors for later walkthrough verification", async () => {
    const input = {
      version: "structured" as const,
      objective: { summary: "Test delegation error" },
      tasks: [
        {
          content: "Create layout",
          status: "delegated" as const,
          activeForm: "Creating layout",
          delegateTo: "layout",
          delegationOutcome: {
            success: false,
            error: "Layout sub-agent unavailable",
          },
        },
      ],
      changes: {
        creates: [],
        updates: [],
        deletes: [],
        delegations: [
          { taskId: "task-1", delegateTo: "layout", expectedOutcome: "Grid layout", expectedElements: [] },
        ],
      },
    };

    const result = await executeCanvasPlan(input, mockContext);

    expect(result.success).toBe(true);
    // No auto-walkthrough - use canvas_plan_walkthrough tool instead
    expect((result.data as Record<string, unknown>)?.walkthrough).toBeUndefined();
    // Verify delegation error is stored
    expect(result.data?.tasks[0].delegationOutcome?.success).toBe(false);
    expect(result.data?.tasks[0].delegationOutcome?.error).toBe("Layout sub-agent unavailable");
  });

  it("should include delegations count in changeScope", async () => {
    const input = {
      version: "structured" as const,
      objective: { summary: "Test delegation scope" },
      tasks: [
        { content: "Create layout", status: "pending" as const, activeForm: "Creating layout", delegateTo: "layout" },
        { content: "Build header", status: "pending" as const, activeForm: "Building header", delegateTo: "moodboard" },
      ],
      changes: {
        creates: [],
        updates: [],
        deletes: [],
        delegations: [
          { taskId: "task-1", delegateTo: "layout", expectedOutcome: "Grid layout", expectedElements: [] },
          { taskId: "task-2", delegateTo: "moodboard", expectedOutcome: "Header section", expectedElements: [] },
        ],
      },
    };

    const result = await executeCanvasPlan(input, mockContext);

    expect(result.success).toBe(true);
    expect(result.data?.structuredPlan?.changeScope.delegations).toBe(2);
  });
});

// =============================================================================
// CANVAS_PLAN_UPDATE TOOL TESTS
// =============================================================================

describe("canvas_plan_update tool", () => {
  const mockContext = {
    sessionId: "update-test-session",
    resources: {},
  };

  // Clear plan before each test
  beforeEach(() => {
    clearPlan("update-test-session");
  });

  it("should return error when no plan exists", async () => {
    const result = await executeCanvasPlanUpdate({
      updates: [{ taskIndex: 0, status: "in_progress" }],
    }, mockContext);

    expect(result.success).toBe(false);
    expect(result.error?.message).toContain("No plan exists");
  });

  it("should return error for invalid task index", async () => {
    // First create a plan
    await executeCanvasPlan({
      version: "structured",
      objective: { summary: "Test plan" },
      tasks: [
        { content: "Task 1", status: "pending", activeForm: "Doing task 1" },
      ],
      changes: { creates: [], updates: [], deletes: [] },
    }, mockContext);

    // Try to update non-existent task
    const result = await executeCanvasPlanUpdate({
      updates: [{ taskIndex: 5, status: "in_progress" }],
    }, mockContext);

    expect(result.success).toBe(false);
    expect(result.error?.message).toContain("Task index 5 out of range");
  });

  it("should successfully update task status", async () => {
    // Create a plan
    await executeCanvasPlan({
      version: "structured",
      objective: { summary: "Test plan" },
      tasks: [
        { content: "Task 1", status: "pending", activeForm: "Doing task 1" },
        { content: "Task 2", status: "pending", activeForm: "Doing task 2" },
      ],
      changes: { creates: [], updates: [], deletes: [] },
    }, mockContext);

    // Update first task to in_progress
    const result = await executeCanvasPlanUpdate({
      updates: [{ taskIndex: 0, status: "in_progress" }],
    }, mockContext);

    expect(result.success).toBe(true);
    expect(result.data?.tasks[0].status).toBe("in_progress");
    expect(result.data?.tasks[1].status).toBe("pending");
    expect(result.data?.summary.inProgress).toBe(1);
    expect(result.data?.currentTask).toBe("Doing task 1");
  });

  it("should update multiple tasks in one call", async () => {
    // Create a plan
    await executeCanvasPlan({
      version: "structured",
      objective: { summary: "Test plan" },
      tasks: [
        { content: "Task 1", status: "in_progress", activeForm: "Doing task 1" },
        { content: "Task 2", status: "pending", activeForm: "Doing task 2" },
        { content: "Task 3", status: "pending", activeForm: "Doing task 3" },
      ],
      changes: { creates: [], updates: [], deletes: [] },
    }, mockContext);

    // Complete task 1 and start task 2
    const result = await executeCanvasPlanUpdate({
      updates: [
        { taskIndex: 0, status: "completed" },
        { taskIndex: 1, status: "in_progress" },
      ],
    }, mockContext);

    expect(result.success).toBe(true);
    expect(result.data?.tasks[0].status).toBe("completed");
    expect(result.data?.tasks[1].status).toBe("in_progress");
    expect(result.data?.tasks[2].status).toBe("pending");
    expect(result.data?.summary.completed).toBe(1);
    expect(result.data?.summary.inProgress).toBe(1);
  });

  it("should record delegation outcome", async () => {
    // Create a plan with delegated task
    await executeCanvasPlan({
      version: "structured",
      objective: { summary: "Test delegation" },
      tasks: [
        { content: "Create layout", status: "delegated", activeForm: "Creating layout", delegateTo: "layout" },
      ],
      changes: {
        creates: [],
        updates: [],
        deletes: [],
        delegations: [
          { taskId: "task-1", delegateTo: "layout", expectedOutcome: "Grid layout", expectedElements: [] },
        ],
      },
    }, mockContext);

    // Update with delegation outcome
    const result = await executeCanvasPlanUpdate({
      updates: [{
        taskIndex: 0,
        delegationOutcome: {
          success: true,
          elementIds: ["frame-001", "frame-002"],
          summary: "Created 2-column grid layout",
        },
      }],
    }, mockContext);

    expect(result.success).toBe(true);
    expect(result.data?.tasks[0].delegationOutcome).toBeDefined();
    expect(result.data?.tasks[0].delegationOutcome?.success).toBe(true);
    expect(result.data?.tasks[0].delegationOutcome?.elementIds).toContain("frame-001");

    // No auto-walkthrough - use canvas_plan_walkthrough tool instead
  });

  it("should validate only one task in_progress", async () => {
    // Create a plan
    await executeCanvasPlan({
      version: "structured",
      objective: { summary: "Test plan" },
      tasks: [
        { content: "Task 1", status: "in_progress", activeForm: "Doing task 1" },
        { content: "Task 2", status: "pending", activeForm: "Doing task 2" },
      ],
      changes: { creates: [], updates: [], deletes: [] },
    }, mockContext);

    // Try to mark another task as in_progress
    const result = await executeCanvasPlanUpdate({
      updates: [{ taskIndex: 1, status: "in_progress" }],
    }, mockContext);

    expect(result.success).toBe(false);
    expect(result.error?.message).toContain("Only one task should be in_progress");
  });

  it("should not auto-generate walkthrough when all tasks complete", async () => {
    // Create a plan
    await executeCanvasPlan({
      version: "structured",
      objective: { summary: "Create dashboard" },
      tasks: [
        { content: "Task 1", status: "completed", activeForm: "Doing task 1" },
        { content: "Task 2", status: "in_progress", activeForm: "Doing task 2" },
      ],
      changes: {
        creates: [{ tempId: "new-card", type: "rectangle" as const, description: "Card element" }],
        updates: [],
        deletes: [],
      },
    }, mockContext);

    // Complete last task
    const result = await executeCanvasPlanUpdate({
      updates: [{ taskIndex: 1, status: "completed" }],
    }, mockContext);

    expect(result.success).toBe(true);
    expect(result.data?.summary.completed).toBe(2);
    expect(result.data?.summary.pending).toBe(0);
    expect(result.data?.summary.inProgress).toBe(0);

    // No auto-walkthrough - use canvas_plan_walkthrough tool explicitly
    expect((result.data as Record<string, unknown>)?.walkthrough).toBeUndefined();
  });

  it("should persist updates in the plan store", async () => {
    // Create a plan
    await executeCanvasPlan({
      version: "structured",
      objective: { summary: "Test persistence" },
      tasks: [
        { content: "Task 1", status: "pending", activeForm: "Doing task 1" },
      ],
      changes: { creates: [], updates: [], deletes: [] },
    }, mockContext);

    // Update task
    await executeCanvasPlanUpdate({
      updates: [{ taskIndex: 0, status: "in_progress" }],
    }, mockContext);

    // Verify stored plan is updated
    const stored = getCurrentPlan("update-test-session");
    expect(stored).toBeDefined();
    expect(stored?.input.tasks[0].status).toBe("in_progress");
  });

  it("should work with three-tool workflow pattern", async () => {
    // Step 1: Create plan
    const createResult = await executeCanvasPlan({
      version: "structured",
      objective: { summary: "Build header and content" },
      tasks: [
        { content: "Create header", status: "pending", activeForm: "Creating header", delegateTo: "moodboard" },
        { content: "Add content", status: "pending", activeForm: "Adding content" },
      ],
      changes: {
        creates: [{ tempId: "new-content", type: "frame" as const, description: "Content frame" }],
        updates: [],
        deletes: [],
        delegations: [
          { taskId: "task-1", delegateTo: "moodboard", expectedOutcome: "Header with title", expectedElements: [] },
        ],
      },
    }, mockContext);

    expect(createResult.success).toBe(true);

    // Step 2: Mark header task as delegated with outcome
    const delegateResult = await executeCanvasPlanUpdate({
      updates: [{
        taskIndex: 0,
        status: "delegated",
        delegationOutcome: {
          success: true,
          elementIds: ["header-frame-001"],
          summary: "Header created with title",
        },
      }],
    }, mockContext);

    expect(delegateResult.success).toBe(true);
    expect(delegateResult.data?.tasks[0].status).toBe("delegated");

    // Step 3: Start content task
    const startResult = await executeCanvasPlanUpdate({
      updates: [{ taskIndex: 1, status: "in_progress" }],
    }, mockContext);

    expect(startResult.success).toBe(true);
    expect(startResult.data?.currentTask).toBe("Adding content");

    // Step 4: Complete content task
    const completeResult = await executeCanvasPlanUpdate({
      updates: [{ taskIndex: 1, status: "completed" }],
    }, mockContext);

    expect(completeResult.success).toBe(true);
    expect(completeResult.data?.summary.completed).toBe(1);
    expect(completeResult.data?.summary.delegated).toBe(1);

    // Step 5: Call walkthrough explicitly to verify
    const walkthroughResult = await executeCanvasPlanWalkthrough({}, mockContext);

    expect(walkthroughResult.success).toBe(true);
    expect(walkthroughResult.data?.objective).toBe("Build header and content");
    expect(walkthroughResult.data?.results).toBeDefined();
    // Should have results for delegation
    const delegationResult = walkthroughResult.data?.results.find(r => r.type === "delegation");
    expect(delegationResult?.status).toBe("verified");
    expect(delegationResult?.details).toContain("Header created");
  });
});

// =============================================================================
// CANVAS_PLAN_WALKTHROUGH TOOL TESTS
// =============================================================================

describe("canvas_plan_walkthrough tool", () => {
  const mockContext = {
    sessionId: "walkthrough-test-session",
    resources: {},
  };

  // Clear plan before each test
  beforeEach(() => {
    clearPlan("walkthrough-test-session");
  });

  it("should return error when no plan exists", async () => {
    const result = await executeCanvasPlanWalkthrough({}, mockContext);

    expect(result.success).toBe(false);
    expect(result.error?.message).toContain("No plan exists");
  });

  it("should verify delegation outcomes", async () => {
    // Create a plan with delegation
    await executeCanvasPlan({
      version: "structured",
      objective: { summary: "Test delegation verification" },
      tasks: [
        { content: "Create layout", status: "delegated", activeForm: "Creating layout", delegateTo: "layout",
          delegationOutcome: { success: true, elementIds: ["frame-001"], summary: "Layout created" } },
      ],
      changes: {
        creates: [],
        updates: [],
        deletes: [],
        delegations: [
          { taskId: "task-1", delegateTo: "layout", expectedOutcome: "Grid layout", expectedElements: [] },
        ],
      },
    }, mockContext);

    const result = await executeCanvasPlanWalkthrough({}, mockContext);

    expect(result.success).toBe(true);
    expect(result.data?.success).toBe(true);
    expect(result.data?.results).toHaveLength(1);
    expect(result.data?.results[0].type).toBe("delegation");
    expect(result.data?.results[0].status).toBe("verified");
    expect(result.data?.summary.verified).toBe(1);
  });

  it("should report missing delegation outcomes", async () => {
    // Create a plan with delegation but no outcome
    await executeCanvasPlan({
      version: "structured",
      objective: { summary: "Test missing delegation" },
      tasks: [
        { content: "Create layout", status: "delegated", activeForm: "Creating layout", delegateTo: "layout" },
      ],
      changes: {
        creates: [],
        updates: [],
        deletes: [],
        delegations: [
          { taskId: "task-1", delegateTo: "layout", expectedOutcome: "Grid layout", expectedElements: [] },
        ],
      },
    }, mockContext);

    const result = await executeCanvasPlanWalkthrough({}, mockContext);

    expect(result.success).toBe(true);
    expect(result.data?.success).toBe(false); // Verification failed
    expect(result.data?.results[0].status).toBe("not_found");
    expect(result.data?.summary.notFound).toBe(1);
  });

  it("should report failed delegations", async () => {
    // Create a plan with failed delegation
    await executeCanvasPlan({
      version: "structured",
      objective: { summary: "Test failed delegation" },
      tasks: [
        { content: "Create layout", status: "delegated", activeForm: "Creating layout", delegateTo: "layout",
          delegationOutcome: { success: false, error: "Sub-agent failed" } },
      ],
      changes: {
        creates: [],
        updates: [],
        deletes: [],
        delegations: [
          { taskId: "task-1", delegateTo: "layout", expectedOutcome: "Grid layout", expectedElements: [] },
        ],
      },
    }, mockContext);

    const result = await executeCanvasPlanWalkthrough({}, mockContext);

    expect(result.success).toBe(true);
    expect(result.data?.success).toBe(false);
    expect(result.data?.results[0].status).toBe("error");
    expect(result.data?.results[0].details).toContain("Sub-agent failed");
    expect(result.data?.summary.errors).toBe(1);
  });

  it("should generate human-readable report", async () => {
    // Create a plan with mixed results
    await executeCanvasPlan({
      version: "structured",
      objective: { summary: "Test report generation" },
      tasks: [
        { content: "Task 1", status: "delegated", activeForm: "Doing task 1", delegateTo: "layout",
          delegationOutcome: { success: true, elementIds: ["frame-001"], summary: "Done" } },
      ],
      changes: {
        creates: [],
        updates: [],
        deletes: [],
        delegations: [
          { taskId: "task-1", delegateTo: "layout", expectedOutcome: "Layout done", expectedElements: [] },
        ],
      },
    }, mockContext);

    const result = await executeCanvasPlanWalkthrough({}, mockContext);

    expect(result.success).toBe(true);
    expect(result.data?.report).toContain("Plan Verification: PASSED");
    expect(result.data?.report).toContain("Test report generation");
    expect(result.data?.report).toContain("1/1 verified");
  });

  it("should verify creates when canvas state is available", async () => {
    // Create a plan with creates
    await executeCanvasPlan({
      version: "structured",
      objective: { summary: "Test create verification" },
      tasks: [
        { content: "Create card", status: "completed", activeForm: "Creating card" },
      ],
      changes: {
        creates: [{ tempId: "new-card", type: "rectangle" as const, description: "Card element" }],
        updates: [],
        deletes: [],
      },
    }, mockContext);

    // Provide canvas state with matching element
    const contextWithCanvas = {
      ...mockContext,
      resources: {
        canvasState: {
          elements: [
            { id: "rect-001", type: "rectangle" },
          ],
        },
      },
    };

    const result = await executeCanvasPlanWalkthrough({}, contextWithCanvas);

    expect(result.success).toBe(true);
    expect(result.data?.success).toBe(true);
    expect(result.data?.results[0].type).toBe("create");
    expect(result.data?.results[0].status).toBe("verified");
    expect(result.data?.results[0].actualId).toBe("rect-001");
  });
});
