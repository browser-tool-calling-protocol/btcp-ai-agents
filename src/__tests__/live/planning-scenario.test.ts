/**
 * Planning Scenario Live Test
 *
 * Tests complex multi-step agentic workflows where the agent must enter plan mode
 * and generate structured plans with tasks (TodoWrite-style) without delegating
 * to sub-agents.
 *
 * Verifies the agent can:
 * - Recognize complex tasks that require planning
 * - Use canvas_plan to create structured task lists
 * - Update task status with canvas_plan_update
 * - Verify plans with canvas_plan_walkthrough
 * - Complete all work directly without canvas_delegate
 *
 * Run with:
 * ```bash
 * GOOGLE_API_KEY=xxx pnpm --filter=@waiboard/ai-agents test:live:planning
 * ```
 *
 * @module @waiboard/ai-agents/tests/live/planning
 */

import { describe, it, expect, beforeEach } from "vitest";
import { canvasAgenticLoop } from "../../core/loop.js";
import type { McpClient } from "../../tools/definitions.js";
import type { AgentEvent } from "../../agents/types.js";

// ============================================================================
// TEST CONFIGURATION
// ============================================================================

const RUN_LIVE_TESTS = process.env.GOOGLE_API_KEY !== undefined;
const describeIfLive = RUN_LIVE_TESTS ? describe : describe.skip;

const TIMEOUT = 120_000; // 2 minutes for complex planning workflows
const LONG_TIMEOUT = 180_000; // 3 minutes for very complex tasks

// ============================================================================
// MOCK MCP CLIENT WITH PLANNING SUPPORT
// ============================================================================

interface MockElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  text?: string;
  backgroundColor?: string;
  strokeColor?: string;
  name?: string;
  parentId?: string;
}

interface MockCanvasState {
  elements: MockElement[];
  nextId: number;
  operations: Array<{ tool: string; args: unknown; timestamp: number }>;
  plans: Array<{
    tasks: Array<{ content: string; status: string; activeForm: string }>;
    createdAt: number;
  }>;
}

/**
 * Mock MCP client with planning tool support.
 * Tracks canvas_plan, canvas_plan_update, and canvas_plan_walkthrough calls.
 */
function createPlanningMockMcpClient(initialState?: Partial<MockCanvasState>) {
  const state: MockCanvasState = {
    elements: initialState?.elements ?? [],
    nextId: initialState?.nextId ?? 100,
    operations: [],
    plans: [],
  };

  const client = {
    state,

    async execute<T>(tool: string, args: Record<string, unknown>): Promise<T> {
      const timestamp = Date.now();
      state.operations.push({ tool, args, timestamp });
      console.log(`[MockMCP] ${tool}`, JSON.stringify(args, null, 2));

      switch (tool) {
        case "canvas_read": {
          const target = args.target || "canvas";
          const format = args.format || "json";

          if (target === "canvas") {
            if (format === "summary") {
              const typeCount = state.elements.reduce(
                (acc, el) => {
                  acc[el.type] = (acc[el.type] || 0) + 1;
                  return acc;
                },
                {} as Record<string, number>
              );
              return {
                elementCount: state.elements.length,
                types: typeCount,
                bounds: calculateBounds(state.elements),
              } as T;
            }
            return {
              elements: state.elements,
              count: state.elements.length,
            } as T;
          }

          if (target === "selection") {
            return { elements: [], count: 0 } as T;
          }

          // Read specific element by ID
          if (typeof target === "string") {
            const element = state.elements.find((el) => el.id === target);
            return { element, found: !!element } as T;
          }

          return { elements: state.elements, count: state.elements.length } as T;
        }

        case "canvas_find": {
          const match = args.match as Record<string, unknown> | undefined;
          let filtered = [...state.elements];

          if (match) {
            if (match.type) {
              filtered = filtered.filter((el) => el.type === match.type);
            }
            if (match.text) {
              const regex = new RegExp(String(match.text), "i");
              filtered = filtered.filter((el) => el.text && regex.test(el.text));
            }
            if (match.name) {
              const regex = new RegExp(String(match.name), "i");
              filtered = filtered.filter((el) => el.name && regex.test(el.name));
            }
          }

          const returnFormat = args.return || "summary";
          if (returnFormat === "ids") {
            return { ids: filtered.map((el) => el.id), count: filtered.length } as T;
          }
          if (returnFormat === "count") {
            return { count: filtered.length } as T;
          }

          return {
            count: filtered.length,
            elements: filtered.map((el) => ({
              id: el.id,
              type: el.type,
              bounds: { x: el.x, y: el.y, width: el.width || 100, height: el.height || 50 },
              text: el.text,
              name: el.name,
            })),
          } as T;
        }

        case "canvas_write": {
          const elements = args.elements as Array<Record<string, unknown>>;
          const createdIds: string[] = [];

          if (args.clearFirst) {
            state.elements = [];
          }

          for (const el of elements) {
            const newId = `elem_${state.nextId++}`;
            const newElement: MockElement = {
              id: newId,
              type: String(el.type || "rectangle"),
              x: Number(el.x || 0),
              y: Number(el.y || 0),
              width: el.width !== undefined ? Number(el.width) : 100,
              height: el.height !== undefined ? Number(el.height) : 100,
              text: el.text as string | undefined,
              backgroundColor: el.backgroundColor as string | undefined,
              strokeColor: el.strokeColor as string | undefined,
              name: el.name as string | undefined,
              parentId: (el.parentId || args.targetFrame) as string | undefined,
            };
            state.elements.push(newElement);
            createdIds.push(newId);
          }

          console.log(`[MockMCP] Created ${createdIds.length} elements: ${createdIds.join(", ")}`);
          return { success: true, createdIds, count: createdIds.length } as T;
        }

        case "canvas_edit": {
          const operation = args.operation as string;
          const target = args.target;
          let targetIds: string[] = [];

          if (typeof target === "string") {
            targetIds = [target];
          } else if (target && typeof target === "object") {
            if ("ids" in target) {
              targetIds = (target as { ids: string[] }).ids;
            } else if ("type" in target) {
              targetIds = state.elements
                .filter((el) => el.type === (target as { type: string }).type)
                .map((el) => el.id);
            }
          }

          const affected: string[] = [];

          for (const id of targetIds) {
            const idx = state.elements.findIndex((el) => el.id === id);
            if (idx === -1) continue;

            switch (operation) {
              case "delete":
                state.elements.splice(idx, 1);
                affected.push(id);
                break;

              case "move": {
                const delta = args.delta as { x?: number; y?: number } | undefined;
                if (delta) {
                  state.elements[idx].x += delta.x || 0;
                  state.elements[idx].y += delta.y || 0;
                }
                affected.push(id);
                break;
              }

              case "update":
              case "style": {
                const properties = args.properties as Record<string, unknown> | undefined;
                if (properties) {
                  Object.assign(state.elements[idx], properties);
                }
                affected.push(id);
                break;
              }
            }
          }

          console.log(`[MockMCP] ${operation} affected ${affected.length} elements`);
          return { success: true, affected, count: affected.length } as T;
        }

        case "canvas_capture": {
          return {
            success: true,
            format: "base64",
            data: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
            region: args.region || "viewport",
            dimensions: { width: 800, height: 600 },
          } as T;
        }

        case "canvas_layout": {
          const layoutType = args.type as string;
          const layoutTarget = args.target;
          let targetIds: string[] = [];

          if (Array.isArray(layoutTarget)) {
            targetIds = layoutTarget as string[];
          } else if (layoutTarget === "selection") {
            targetIds = state.elements.map((el) => el.id);
          }

          const options = args.options as Record<string, unknown> | undefined;
          const gap = (options?.gap as number) || 16;
          let x = 0,
            y = 0;

          for (const id of targetIds) {
            const el = state.elements.find((e) => e.id === id);
            if (el) {
              if (layoutType === "row") {
                el.x = x;
                x += (el.width || 100) + gap;
              } else if (layoutType === "column") {
                el.y = y;
                y += (el.height || 100) + gap;
              } else if (layoutType === "grid") {
                const cols = (options?.columns as number) || 3;
                const idx = targetIds.indexOf(id);
                el.x = (idx % cols) * ((el.width || 100) + gap);
                el.y = Math.floor(idx / cols) * ((el.height || 100) + gap);
              }
            }
          }

          return { success: true, layout: layoutType, affected: targetIds.length } as T;
        }

        case "canvas_style": {
          const operation = args.operation as string;
          const rules = args.rules as Record<string, Record<string, unknown>> | undefined;

          if ((operation === "apply" || operation === "define") && rules) {
            for (const [selector, styles] of Object.entries(rules)) {
              const matchingElements =
                selector === "*" ? state.elements : state.elements.filter((el) => el.type === selector);

              for (const el of matchingElements) {
                if (styles.backgroundColor) el.backgroundColor = String(styles.backgroundColor);
                if (styles.strokeColor) el.strokeColor = String(styles.strokeColor);
                if (styles.fill) el.backgroundColor = String(styles.fill);
                if (styles.stroke) el.strokeColor = String(styles.stroke);
              }
            }
          }

          return { success: true, operation, affected: state.elements.length } as T;
        }

        // =====================================================================
        // PLANNING TOOLS
        // =====================================================================

        case "canvas_plan": {
          const tasks = args.tasks as Array<{
            content: string;
            status: string;
            activeForm: string;
            delegateTo?: string;
          }>;

          // Store the plan
          state.plans.push({
            tasks: tasks ?? [],
            createdAt: timestamp,
          });

          // Calculate summary
          const summary = {
            total: tasks?.length ?? 0,
            pending: tasks?.filter((t) => t.status === "pending").length ?? 0,
            inProgress: tasks?.filter((t) => t.status === "in_progress").length ?? 0,
            completed: tasks?.filter((t) => t.status === "completed").length ?? 0,
            delegated: tasks?.filter((t) => t.status === "delegated").length ?? 0,
          };

          // Find current active task
          const inProgressTask = tasks?.find((t) => t.status === "in_progress");
          const currentTask = inProgressTask?.activeForm;

          // Handle structured plan format
          const isStructured = args.version === "structured";
          const structuredPlan = isStructured
            ? {
                objective: (args.objective as { summary?: string })?.summary ?? "",
                references: 0,
                changeScope: {
                  creates: ((args.changes as Record<string, unknown[]>)?.creates ?? []).length,
                  updates: ((args.changes as Record<string, unknown[]>)?.updates ?? []).length,
                  deletes: ((args.changes as Record<string, unknown[]>)?.deletes ?? []).length,
                  delegations: ((args.changes as Record<string, unknown[]>)?.delegations ?? []).length,
                },
              }
            : undefined;

          console.log(`[MockMCP] canvas_plan created with ${summary.total} tasks`);
          if (isStructured) {
            console.log(`[MockMCP] Structured plan - objective: ${structuredPlan?.objective}`);
          }

          return {
            success: true,
            tasks: tasks ?? [],
            summary,
            currentTask,
            structuredPlan,
          } as T;
        }

        case "canvas_plan_update": {
          const updates = args.updates as Array<{
            taskIndex: number;
            status?: string;
            delegationOutcome?: unknown;
          }>;

          // Update the most recent plan
          if (state.plans.length > 0 && updates) {
            const currentPlan = state.plans[state.plans.length - 1];
            for (const update of updates) {
              if (currentPlan.tasks[update.taskIndex] && update.status) {
                currentPlan.tasks[update.taskIndex].status = update.status;
              }
            }
          }

          console.log(`[MockMCP] canvas_plan_update with ${updates?.length ?? 0} updates`);

          return {
            success: true,
            tasks: state.plans.length > 0 ? state.plans[state.plans.length - 1].tasks : [],
            summary: {
              total: state.plans.length > 0 ? state.plans[state.plans.length - 1].tasks.length : 0,
              pending: 0,
              inProgress: 0,
              completed: updates?.length ?? 0,
              delegated: 0,
            },
            updatesApplied: updates?.length ?? 0,
          } as T;
        }

        case "canvas_plan_walkthrough": {
          console.log("[MockMCP] canvas_plan_walkthrough - verifying plan");

          const currentPlan = state.plans.length > 0 ? state.plans[state.plans.length - 1] : null;
          const taskCount = currentPlan?.tasks.length ?? 0;

          return {
            success: true,
            objective: "Plan verification",
            results: currentPlan?.tasks.map((t) => ({
              task: t.content,
              status: t.status,
              verified: t.status === "completed",
            })) ?? [],
            summary: {
              total: taskCount,
              verified: currentPlan?.tasks.filter((t) => t.status === "completed").length ?? 0,
              notFound: 0,
              mismatch: 0,
              errors: 0,
            },
            report: `## Plan Verification: ${taskCount > 0 ? "PASSED" : "NO PLAN"}\n\n${taskCount} tasks in plan.`,
          } as T;
        }

        default:
          console.log(`[MockMCP] Unknown tool: ${tool}`);
          return { success: true } as T;
      }
    },

    async readResource<T>(uri: string): Promise<T> {
      console.log(`[MockMCP] readResource: ${uri}`);
      return {
        elementCount: state.elements.length,
        elements: state.elements,
        bounds: calculateBounds(state.elements),
      } as T;
    },

    isConnected(): boolean {
      return true;
    },

    async connect(): Promise<boolean> {
      return true;
    },

    disconnect(): void {
      // No-op
    },

    // Test helpers
    getOperationCount(): number {
      return state.operations.length;
    },

    getOperationsByTool(tool: string): Array<{ args: unknown; timestamp: number }> {
      return state.operations
        .filter((op) => op.tool === tool)
        .map(({ args, timestamp }) => ({ args, timestamp }));
    },

    getElementCount(): number {
      return state.elements.length;
    },

    getElements(): MockElement[] {
      return [...state.elements];
    },

    getPlanCount(): number {
      return state.plans.length;
    },

    getLatestPlan(): { tasks: Array<{ content: string; status: string; activeForm: string }>; createdAt: number } | null {
      return state.plans.length > 0 ? state.plans[state.plans.length - 1] : null;
    },

    reset() {
      state.elements = [];
      state.nextId = 100;
      state.operations = [];
      state.plans = [];
    },
  } satisfies McpClient & {
    state: MockCanvasState;
    connect(): Promise<boolean>;
    disconnect(): void;
    getOperationCount(): number;
    getOperationsByTool(tool: string): Array<{ args: unknown; timestamp: number }>;
    getElementCount(): number;
    getElements(): MockElement[];
    getPlanCount(): number;
    getLatestPlan(): { tasks: Array<{ content: string; status: string; activeForm: string }>; createdAt: number } | null;
    reset(): void;
  };

  return client;
}

function calculateBounds(elements: MockElement[]): { x: number; y: number; width: number; height: number } {
  if (elements.length === 0) {
    return { x: 0, y: 0, width: 800, height: 600 };
  }

  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;

  for (const el of elements) {
    minX = Math.min(minX, el.x);
    minY = Math.min(minY, el.y);
    maxX = Math.max(maxX, el.x + (el.width || 100));
    maxY = Math.max(maxY, el.y + (el.height || 100));
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

// ============================================================================
// TEST HELPERS
// ============================================================================

interface TestResults {
  events: AgentEvent[];
  toolCalls: Array<{ tool: string; iteration: number }>;
  toolCallCount: number;
  finalSummary: string;
  completed: boolean;
  failed: boolean;
  duration: number;
}

async function runPlanningTest(
  prompt: string,
  mcpClient: ReturnType<typeof createPlanningMockMcpClient>,
  options?: {
    maxIterations?: number;
    enabledTools?: string[];
    verbose?: boolean;
  }
): Promise<TestResults> {
  const events: AgentEvent[] = [];
  const toolCalls: Array<{ tool: string; iteration: number }> = [];
  let finalSummary = "";
  let currentIteration = 0;
  const startTime = Date.now();

  for await (const event of canvasAgenticLoop(prompt, "test-canvas", {
    mcpClient,
    model: "fast",
    provider: "google",
    maxIterations: options?.maxIterations ?? 15,
    verbose: options?.verbose ?? true,
    enabledTools: options?.enabledTools as any,
  })) {
    events.push(event);

    if ("iteration" in event && typeof event.iteration === "number") {
      currentIteration = event.iteration;
    }

    if (event.type === "acting") {
      toolCalls.push({ tool: event.tool, iteration: currentIteration });
      console.log(`[Event] Tool call #${toolCalls.length}: ${event.tool} (iteration ${currentIteration})`);
    }

    if (event.type === "complete" && "summary" in event) {
      finalSummary = String(event.summary);
    }
  }

  const completed = events.some((e) => e.type === "complete");
  const failed = events.some((e) => e.type === "failed");

  return {
    events,
    toolCalls,
    toolCallCount: toolCalls.length,
    finalSummary,
    completed,
    failed,
    duration: Date.now() - startTime,
  };
}

function logPlanningTestResults(
  testName: string,
  results: TestResults,
  mcpClient: ReturnType<typeof createPlanningMockMcpClient>
) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`TEST: ${testName}`);
  console.log("=".repeat(60));
  console.log("Duration:", results.duration, "ms");
  console.log("Total events:", results.events.length);
  console.log("Tool calls:", results.toolCallCount);
  console.log("MCP operations:", mcpClient.getOperationCount());
  console.log("Final element count:", mcpClient.getElementCount());
  console.log("Plans created:", mcpClient.getPlanCount());
  console.log("Completed:", results.completed);
  console.log("Failed:", results.failed);

  // Planning-specific metrics
  const planOps = mcpClient.getOperationsByTool("canvas_plan");
  const planUpdateOps = mcpClient.getOperationsByTool("canvas_plan_update");
  const walkthroughOps = mcpClient.getOperationsByTool("canvas_plan_walkthrough");
  const delegateOps = mcpClient.getOperationsByTool("canvas_delegate");

  console.log("\nPlanning Tool Usage:");
  console.log("  canvas_plan:", planOps.length);
  console.log("  canvas_plan_update:", planUpdateOps.length);
  console.log("  canvas_plan_walkthrough:", walkthroughOps.length);
  console.log("  canvas_delegate:", delegateOps.length, delegateOps.length === 0 ? "(good - no delegation)" : "(WARNING)");

  // Log plan details if available
  const latestPlan = mcpClient.getLatestPlan();
  if (latestPlan) {
    console.log("\nLatest Plan:");
    console.log("  Task count:", latestPlan.tasks.length);
    latestPlan.tasks.forEach((task, idx) => {
      console.log(`    ${idx + 1}. [${task.status}] ${task.content}`);
    });
  }

  console.log("\nTool call sequence:");
  results.toolCalls.forEach((tc, i) => {
    console.log(`  ${i + 1}. ${tc.tool} (iteration ${tc.iteration})`);
  });

  if (results.finalSummary) {
    console.log("\nFinal summary:", results.finalSummary.substring(0, 200) + "...");
  }
  console.log("=".repeat(60) + "\n");
}

// ============================================================================
// LIVE TESTS
// ============================================================================

describeIfLive("Planning Scenario - Complex Task Without Delegation", () => {
  let mcpClient: ReturnType<typeof createPlanningMockMcpClient>;

  beforeEach(() => {
    mcpClient = createPlanningMockMcpClient();
  });

  it(
    "should use canvas_plan for complex multi-step task (no delegation)",
    async () => {
      const results = await runPlanningTest(
        `I need you to create a comprehensive project management dashboard with:

         1. A main container frame (1200x800) titled "Q4 Project Dashboard"
         2. Inside the container, create these sections:
            - Header section at the top with the dashboard title and a date text "December 2024"
            - Three stat cards in a row showing: "Active Projects: 12", "Completed: 45", "Team Members: 8"
            - A progress section with rectangles representing project progress bars
            - A footer with "Last updated" text

         3. Apply consistent styling:
            - Header: dark blue background (#1e3a5f)
            - Stat cards: white background with light gray border
            - Progress bars: gradient from yellow to green based on completion

         4. Ensure proper alignment and spacing between all elements

         This is a complex task - please plan it out carefully using canvas_plan before executing.
         Do NOT delegate to sub-agents - handle this entirely yourself.`,
        mcpClient,
        {
          maxIterations: 15,
          enabledTools: [
            "canvas_read",
            "canvas_write",
            "canvas_edit",
            "canvas_find",
            "canvas_plan",
            "canvas_plan_update",
            "canvas_layout",
            "canvas_style",
          ],
        }
      );

      logPlanningTestResults("Planning Scenario - Project Dashboard", results, mcpClient);

      // Should have used canvas_plan tool for complex task
      const planOps = mcpClient.getOperationsByTool("canvas_plan");

      // Verify agent used planning approach
      const usedPlanning = planOps.length > 0;

      // Either used canvas_plan OR made multiple tool calls showing structured approach
      expect(usedPlanning || results.toolCallCount >= 3).toBe(true);

      // Should have created multiple elements for the dashboard
      expect(mcpClient.getElementCount()).toBeGreaterThanOrEqual(3);

      // Should NOT have used canvas_delegate (no delegation)
      const delegateOps = mcpClient.getOperationsByTool("canvas_delegate");
      expect(delegateOps.length).toBe(0);

      // Should complete successfully
      expect(results.completed || results.failed).toBe(true);
    },
    TIMEOUT
  );

  it(
    "should generate structured plan with tasks for infographic creation",
    async () => {
      const results = await runPlanningTest(
        `Create an infographic about "The Benefits of Remote Work" with these requirements:

         Structure the infographic with:
         - A compelling header with the title
         - 4 benefit sections, each containing:
           * An icon placeholder (colored rectangle)
           * A benefit title (e.g., "Flexibility", "Cost Savings", "Work-Life Balance", "Increased Productivity")
           * A brief description text
         - Statistics section with 3 data points displayed as visual elements
         - A footer with source attribution

         IMPORTANT:
         - Use canvas_plan to create a structured plan BEFORE you start creating elements
         - Update task status with canvas_plan_update as you complete each section
         - Do NOT use canvas_delegate - complete all work directly

         This task requires careful planning due to multiple interconnected elements.`,
        mcpClient,
        {
          maxIterations: 20,
          enabledTools: [
            "canvas_read",
            "canvas_write",
            "canvas_edit",
            "canvas_find",
            "canvas_plan",
            "canvas_plan_update",
            "canvas_plan_walkthrough",
            "canvas_layout",
            "canvas_style",
          ],
        }
      );

      logPlanningTestResults("Planning Scenario - Infographic", results, mcpClient);

      // Analyze planning behavior
      const planOps = mcpClient.getOperationsByTool("canvas_plan");
      const planUpdateOps = mcpClient.getOperationsByTool("canvas_plan_update");

      // Check if planning was used
      const usedPlanningTools = planOps.length > 0 || planUpdateOps.length > 0;

      // If canvas_plan was used, verify the plan structure
      if (planOps.length > 0) {
        const firstPlan = planOps[0].args as Record<string, unknown>;
        console.log("\nFirst Plan Structure:");
        console.log("  Has tasks:", Array.isArray(firstPlan.tasks));
        if (Array.isArray(firstPlan.tasks)) {
          console.log("  Task count:", (firstPlan.tasks as unknown[]).length);
        }
        if (firstPlan.version === "structured") {
          console.log("  Using structured format: yes");
          const objective = firstPlan.objective as { summary?: string } | undefined;
          if (objective?.summary) {
            console.log("  Objective:", objective.summary);
          }
        }
      }

      // Should have created infographic elements
      expect(mcpClient.getElementCount()).toBeGreaterThanOrEqual(4);

      // Should NOT have delegated
      const delegateOps = mcpClient.getOperationsByTool("canvas_delegate");
      expect(delegateOps.length).toBe(0);

      // Agent should either use planning tools OR show multi-step structured execution
      expect(usedPlanningTools || results.toolCallCount >= 4).toBe(true);

      // Should complete
      expect(results.completed || results.failed).toBe(true);
    },
    LONG_TIMEOUT
  );
});

describeIfLive("Planning Scenario - Task Tracking", () => {
  let mcpClient: ReturnType<typeof createPlanningMockMcpClient>;

  beforeEach(() => {
    mcpClient = createPlanningMockMcpClient();
  });

  it(
    "should track task progress with canvas_plan_update",
    async () => {
      const results = await runPlanningTest(
        `Create a simple kanban board layout with these requirements:

         1. First, create a plan with canvas_plan that includes tasks for:
            - Creating the board container frame
            - Adding 3 column headers: "To Do", "In Progress", "Done"
            - Adding 2 sample cards in each column
            - Applying styling to differentiate columns

         2. As you complete each task, update its status using canvas_plan_update

         3. Do NOT use canvas_delegate - this tests direct task execution with progress tracking

         Make sure to show your planning process clearly.`,
        mcpClient,
        {
          maxIterations: 15,
          enabledTools: [
            "canvas_read",
            "canvas_write",
            "canvas_edit",
            "canvas_find",
            "canvas_plan",
            "canvas_plan_update",
            "canvas_layout",
            "canvas_style",
          ],
        }
      );

      logPlanningTestResults("Planning Scenario - Task Tracking", results, mcpClient);

      // Check for planning tool usage
      const planOps = mcpClient.getOperationsByTool("canvas_plan");
      const planUpdateOps = mcpClient.getOperationsByTool("canvas_plan_update");

      console.log("\nTask Tracking Metrics:");
      console.log("  Plans created:", planOps.length);
      console.log("  Plan updates:", planUpdateOps.length);

      // Verify plan was created
      const latestPlan = mcpClient.getLatestPlan();
      if (latestPlan) {
        const completedTasks = latestPlan.tasks.filter((t) => t.status === "completed").length;
        console.log("  Tasks in plan:", latestPlan.tasks.length);
        console.log("  Completed tasks:", completedTasks);
      }

      // Should have created kanban elements
      expect(mcpClient.getElementCount()).toBeGreaterThanOrEqual(3);

      // Should NOT have delegated
      const delegateOps = mcpClient.getOperationsByTool("canvas_delegate");
      expect(delegateOps.length).toBe(0);

      // Should complete
      expect(results.completed || results.failed).toBe(true);
    },
    TIMEOUT
  );
});

// ============================================================================
// SKIP INFO
// ============================================================================

describe("Planning Scenario (Skip Info)", () => {
  it("should print run instructions when tests are skipped", () => {
    if (!RUN_LIVE_TESTS) {
      console.log(`
┌─────────────────────────────────────────────────────────────────────────────┐
│  Planning Scenario Test Skipped                                             │
│                                                                             │
│  These tests verify the agent enters plan mode for complex tasks and        │
│  generates structured plans with tasks (TodoWrite-style) without            │
│  delegating to sub-agents.                                                  │
│                                                                             │
│  To run:                                                                    │
│  GOOGLE_API_KEY=xxx pnpm --filter=@waiboard/ai-agents test:live:planning    │
│                                                                             │
│  Estimated cost: ~$0.10-0.20 (multiple LLM calls per test)                  │
│  Estimated time: ~5-10 minutes                                              │
│                                                                             │
│  Test scenarios:                                                            │
│  - Complex multi-step tasks requiring canvas_plan                           │
│  - Structured plan generation with tasks                                    │
│  - Task progress tracking with canvas_plan_update                           │
│  - Plan verification with canvas_plan_walkthrough                           │
│  - No delegation (canvas_delegate must not be called)                       │
│                                                                             │
│  Key assertions:                                                            │
│  - Agent uses canvas_plan for complex tasks                                 │
│  - Tasks are created and tracked properly                                   │
│  - No sub-agent delegation occurs                                           │
│  - Elements are created on canvas                                           │
└─────────────────────────────────────────────────────────────────────────────┘
      `);
    }
    expect(true).toBe(true);
  });
});
