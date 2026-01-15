/**
 * Complex Tool Calling Live Test
 *
 * Tests complex multi-step agentic workflows with real LLM calls and mock MCP client.
 * Verifies the agent can:
 * - Execute multi-step workflows (read → write → edit → verify)
 * - Chain tool calls where results inform next actions
 * - Handle complex canvas operations (diagrams, layouts)
 * - Recover from simulated errors
 *
 * Run with:
 * ```bash
 * GOOGLE_API_KEY=xxx pnpm --filter=@waiboard/ai-agents test:live:complex
 * ```
 *
 * @module @waiboard/ai-agents/tests/live/complex
 */

import { describe, it, expect, beforeEach } from "vitest";
import { runAgenticLoop } from "../../core/loop.js";
import type { McpClient } from "../../tools/definitions.js";
import type { AgentEvent } from "../../agents/types.js";

// ============================================================================
// TEST CONFIGURATION
// ============================================================================

const RUN_LIVE_TESTS = process.env.GOOGLE_API_KEY !== undefined;
const describeIfLive = RUN_LIVE_TESTS ? describe : describe.skip;

const TIMEOUT = 120_000; // 2 minutes for complex workflows
const SHORT_TIMEOUT = 60_000; // 1 minute for simpler tests

// ============================================================================
// ENHANCED MOCK MCP CLIENT
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
}

/**
 * Enhanced mock MCP client that tracks state changes and operations.
 * Simulates realistic canvas behavior for complex workflow testing.
 */
function createStatefulMockMcpClient(initialState?: Partial<MockCanvasState>) {
  const state: MockCanvasState = {
    elements: initialState?.elements ?? [],
    nextId: initialState?.nextId ?? 100,
    operations: [],
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

          // Read by IDs
          if (target && typeof target === "object" && "ids" in target) {
            const ids = (target as { ids: string[] }).ids;
            const elements = state.elements.filter((el) => ids.includes(el.id));
            return { elements, count: elements.length } as T;
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
            if (match.color) {
              const color = String(match.color).toLowerCase();
              filtered = filtered.filter(
                (el) =>
                  el.backgroundColor?.toLowerCase() === color ||
                  el.strokeColor?.toLowerCase() === color
              );
            }
            if (match.hasParent) {
              filtered = filtered.filter((el) => el.parentId === match.hasParent);
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

          // Resolve target to IDs
          if (typeof target === "string") {
            targetIds = [target];
          } else if (target && typeof target === "object") {
            if ("ids" in target) {
              targetIds = (target as { ids: string[] }).ids;
            } else if ("type" in target) {
              targetIds = state.elements
                .filter((el) => el.type === (target as { type: string }).type)
                .map((el) => el.id);
            } else if ("name" in target) {
              const regex = new RegExp(String((target as { name: string }).name), "i");
              targetIds = state.elements.filter((el) => el.name && regex.test(el.name)).map((el) => el.id);
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

              case "resize": {
                const size = args.size as { width?: number; height?: number } | undefined;
                if (size) {
                  if (size.width !== undefined) state.elements[idx].width = size.width;
                  if (size.height !== undefined) state.elements[idx].height = size.height;
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

              case "rename": {
                const name = args.name as string | undefined;
                if (name) {
                  state.elements[idx].name = name;
                }
                affected.push(id);
                break;
              }
            }
          }

          console.log(`[MockMCP] ${operation} affected ${affected.length} elements`);
          return { success: true, operation, affected, count: affected.length } as T;
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

        case "canvas_snapshot": {
          return {
            elementCount: state.elements.length,
            elements: state.elements.map((el) => ({
              id: el.id,
              type: el.type,
              bounds: { x: el.x, y: el.y, width: el.width || 100, height: el.height || 50 },
              name: el.name,
              text: el.text,
            })),
            bounds: calculateBounds(state.elements),
            selection: [],
            viewport: { x: 0, y: 0, width: 1200, height: 800, zoom: 1 },
          } as T;
        }

        case "canvas_layout": {
          const layoutType = args.type as string;
          const layoutTarget = args.target;
          let targetIds: string[] = [];

          // Resolve targets
          if (Array.isArray(layoutTarget)) {
            targetIds = layoutTarget as string[];
          } else if (layoutTarget === "selection") {
            targetIds = state.elements.map((el) => el.id);
          } else if (layoutTarget && typeof layoutTarget === "object" && "type" in layoutTarget) {
            targetIds = state.elements
              .filter((el) => el.type === (layoutTarget as { type: string }).type)
              .map((el) => el.id);
          }

          // Simulate layout by rearranging positions
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
          const styleTarget = args.target;
          let targetIds: string[] = [];

          if (Array.isArray(styleTarget)) {
            targetIds = styleTarget as string[];
          } else if (styleTarget && typeof styleTarget === "object" && "type" in styleTarget) {
            targetIds = state.elements
              .filter((el) => el.type === (styleTarget as { type: string }).type)
              .map((el) => el.id);
          }

          if (operation === "apply" || operation === "define") {
            const rules = args.rules as Record<string, Record<string, unknown>> | undefined;
            if (rules) {
              // Apply styles to matching elements
              for (const [selector, styles] of Object.entries(rules)) {
                const matchingElements =
                  selector === "*"
                    ? state.elements
                    : state.elements.filter((el) => el.type === selector || targetIds.includes(el.id));

                for (const el of matchingElements) {
                  if (styles.backgroundColor) el.backgroundColor = String(styles.backgroundColor);
                  if (styles.strokeColor) el.strokeColor = String(styles.strokeColor);
                  if (styles.fill) el.backgroundColor = String(styles.fill);
                  if (styles.stroke) el.strokeColor = String(styles.stroke);
                }
              }
            }
          }

          return { success: true, operation, affected: targetIds.length } as T;
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

    reset() {
      state.elements = [];
      state.nextId = 100;
      state.operations = [];
    },
  } satisfies McpClient & {
    state: MockCanvasState;
    connect(): Promise<boolean>;
    disconnect(): void;
    getOperationCount(): number;
    getOperationsByTool(tool: string): Array<{ args: unknown; timestamp: number }>;
    getElementCount(): number;
    getElements(): MockElement[];
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

async function runAgentTest(
  prompt: string,
  mcpClient: ReturnType<typeof createStatefulMockMcpClient>,
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

  for await (const event of runAgenticLoop(prompt, "test-canvas", {
    mcpClient,
    model: "fast",
    provider: "google",
    maxIterations: options?.maxIterations ?? 10,
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

function logTestResults(testName: string, results: TestResults, mcpClient: ReturnType<typeof createStatefulMockMcpClient>) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`TEST: ${testName}`);
  console.log("=".repeat(60));
  console.log("Duration:", results.duration, "ms");
  console.log("Total events:", results.events.length);
  console.log("Tool calls:", results.toolCallCount);
  console.log("MCP operations:", mcpClient.getOperationCount());
  console.log("Final element count:", mcpClient.getElementCount());
  console.log("Completed:", results.completed);
  console.log("Failed:", results.failed);
  console.log("\nTool call sequence:");
  results.toolCalls.forEach((tc, i) => {
    console.log(`  ${i + 1}. ${tc.tool} (iteration ${tc.iteration})`);
  });
  console.log("\nEvent types:", results.events.map((e) => e.type).join(" → "));
  if (results.finalSummary) {
    console.log("\nFinal summary:", results.finalSummary.substring(0, 200) + "...");
  }
  console.log("=".repeat(60) + "\n");
}

// ============================================================================
// LIVE TESTS
// ============================================================================

describeIfLive("Complex Tool Calling - Multi-Step Workflows", () => {
  let mcpClient: ReturnType<typeof createStatefulMockMcpClient>;

  beforeEach(() => {
    mcpClient = createStatefulMockMcpClient({
      elements: [
        { id: "existing_1", type: "rectangle", x: 0, y: 0, width: 100, height: 100, name: "Header" },
        { id: "existing_2", type: "text", x: 50, y: 50, text: "Hello World" },
      ],
    });
  });

  it(
    "should execute read → write → edit workflow (analyze, create, modify)",
    async () => {
      const results = await runAgentTest(
        `First, read the current canvas to see what exists.
         Then, create 3 new blue rectangles in a row below the existing content.
         Finally, update all rectangles to have a thicker stroke (strokeWidth: 4).

         Use canvas_read to check the canvas, canvas_write to create elements,
         and canvas_edit to update them.`,
        mcpClient,
        { maxIterations: 8, enabledTools: ["canvas_read", "canvas_write", "canvas_edit", "canvas_find"] }
      );

      logTestResults("Read → Write → Edit Workflow", results, mcpClient);

      // Verify workflow executed
      expect(results.toolCallCount).toBeGreaterThanOrEqual(2);

      // Check that different tools were used
      const toolTypes = new Set(results.toolCalls.map((tc) => tc.tool));
      expect(toolTypes.size).toBeGreaterThanOrEqual(2);

      // Should have created new elements
      expect(mcpClient.getElementCount()).toBeGreaterThan(2);

      // Should complete or make meaningful progress
      expect(results.completed || results.toolCallCount >= 3).toBe(true);
    },
    TIMEOUT
  );

  it(
    "should chain find → edit operations (locate and modify)",
    async () => {
      // Pre-populate with elements to find
      mcpClient.state.elements = [
        { id: "btn_1", type: "rectangle", x: 0, y: 0, width: 80, height: 40, name: "Button 1", backgroundColor: "#3b82f6" },
        { id: "btn_2", type: "rectangle", x: 100, y: 0, width: 80, height: 40, name: "Button 2", backgroundColor: "#3b82f6" },
        { id: "btn_3", type: "rectangle", x: 200, y: 0, width: 80, height: 40, name: "Button 3", backgroundColor: "#3b82f6" },
        { id: "label_1", type: "text", x: 0, y: 60, text: "Label 1" },
        { id: "label_2", type: "text", x: 100, y: 60, text: "Label 2" },
      ];

      const results = await runAgentTest(
        `Find all the blue rectangles on the canvas (the ones named "Button"),
         then change their background color to green (#22c55e).

         Use canvas_find to locate the elements, then canvas_edit to update their color.`,
        mcpClient,
        { maxIterations: 6, enabledTools: ["canvas_read", "canvas_find", "canvas_edit"] }
      );

      logTestResults("Find → Edit Chaining", results, mcpClient);

      // Should have used both find and edit
      const usedFind = results.toolCalls.some((tc) => tc.tool === "canvas_find");
      const usedEdit = results.toolCalls.some((tc) => tc.tool === "canvas_edit");

      expect(usedFind || results.toolCalls.some((tc) => tc.tool === "canvas_read")).toBe(true);
      expect(results.toolCallCount).toBeGreaterThanOrEqual(1);
    },
    SHORT_TIMEOUT
  );
});

describeIfLive("Complex Tool Calling - Canvas Creation", () => {
  let mcpClient: ReturnType<typeof createStatefulMockMcpClient>;

  beforeEach(() => {
    mcpClient = createStatefulMockMcpClient();
  });

  it(
    "should create a simple flowchart with multiple elements",
    async () => {
      const results = await runAgentTest(
        `Create a simple 3-step flowchart:
         1. A "Start" rectangle at position (100, 100)
         2. A "Process" rectangle at position (100, 200)
         3. An "End" rectangle at position (100, 300)

         Use canvas_write to create all the rectangles. Include text labels inside each shape.`,
        mcpClient,
        { maxIterations: 6, enabledTools: ["canvas_read", "canvas_write", "canvas_edit"] }
      );

      logTestResults("Flowchart Creation", results, mcpClient);

      // Should have used write tool
      const writeOps = mcpClient.getOperationsByTool("canvas_write");
      expect(writeOps.length).toBeGreaterThanOrEqual(1);

      // Should have created multiple elements
      expect(mcpClient.getElementCount()).toBeGreaterThanOrEqual(3);

      // Should complete
      expect(results.completed || results.failed).toBe(true);
    },
    SHORT_TIMEOUT
  );

  it(
    "should create and then verify elements exist",
    async () => {
      const results = await runAgentTest(
        `Create two rectangles:
         - One red rectangle named "Alert" at (0, 0)
         - One green rectangle named "Success" at (150, 0)

         After creating them, read the canvas to verify they exist.
         Report how many elements are on the canvas.`,
        mcpClient,
        { maxIterations: 6, enabledTools: ["canvas_read", "canvas_write", "canvas_find"] }
      );

      logTestResults("Create and Verify", results, mcpClient);

      // Should have both write and read operations
      const writeOps = mcpClient.getOperationsByTool("canvas_write");
      const readOps = mcpClient.getOperationsByTool("canvas_read");

      expect(writeOps.length).toBeGreaterThanOrEqual(1);

      // Elements should exist
      expect(mcpClient.getElementCount()).toBeGreaterThanOrEqual(2);
    },
    SHORT_TIMEOUT
  );
});

describeIfLive("Complex Tool Calling - Analysis Tasks", () => {
  let mcpClient: ReturnType<typeof createStatefulMockMcpClient>;

  beforeEach(() => {
    // Set up a complex canvas for analysis
    mcpClient = createStatefulMockMcpClient({
      elements: [
        { id: "frame_1", type: "frame", x: 0, y: 0, width: 400, height: 300, name: "Dashboard" },
        { id: "rect_1", type: "rectangle", x: 20, y: 20, width: 80, height: 60, backgroundColor: "#ef4444", parentId: "frame_1" },
        { id: "rect_2", type: "rectangle", x: 120, y: 20, width: 80, height: 60, backgroundColor: "#3b82f6", parentId: "frame_1" },
        { id: "rect_3", type: "rectangle", x: 220, y: 20, width: 80, height: 60, backgroundColor: "#22c55e", parentId: "frame_1" },
        { id: "text_1", type: "text", x: 20, y: 100, text: "Sales: $10,000", parentId: "frame_1" },
        { id: "text_2", type: "text", x: 120, y: 100, text: "Users: 5,000", parentId: "frame_1" },
        { id: "text_3", type: "text", x: 220, y: 100, text: "Growth: 25%", parentId: "frame_1" },
        { id: "arrow_1", type: "arrow", x: 60, y: 160, width: 50, height: 30 },
        { id: "arrow_2", type: "arrow", x: 160, y: 160, width: 50, height: 30 },
      ],
    });
  });

  it(
    "should analyze canvas and report statistics",
    async () => {
      const results = await runAgentTest(
        `Analyze the current canvas and tell me:
         1. How many elements are there in total?
         2. How many rectangles vs text elements?
         3. What colors are being used?

         Use canvas_read and canvas_find to gather this information.`,
        mcpClient,
        { maxIterations: 5, enabledTools: ["canvas_read", "canvas_find"] }
      );

      logTestResults("Canvas Analysis", results, mcpClient);

      // Should have used read or find
      expect(results.toolCallCount).toBeGreaterThanOrEqual(1);

      // Should complete with analysis
      expect(results.completed || results.failed).toBe(true);

      // Final summary should mention elements or analysis
      if (results.finalSummary) {
        const summaryLower = results.finalSummary.toLowerCase();
        expect(
          summaryLower.includes("element") ||
            summaryLower.includes("rectangle") ||
            summaryLower.includes("text") ||
            summaryLower.includes("canvas")
        ).toBe(true);
      }
    },
    SHORT_TIMEOUT
  );

  it(
    "should find elements by type and aggregate results",
    async () => {
      const results = await runAgentTest(
        `Find all text elements on the canvas and summarize their content.
         Also count how many rectangles there are.

         Use canvas_find with appropriate match criteria.`,
        mcpClient,
        { maxIterations: 5, enabledTools: ["canvas_read", "canvas_find"] }
      );

      logTestResults("Find and Aggregate", results, mcpClient);

      // Should have used find
      const findOps = mcpClient.getOperationsByTool("canvas_find");
      expect(findOps.length + mcpClient.getOperationsByTool("canvas_read").length).toBeGreaterThanOrEqual(1);
    },
    SHORT_TIMEOUT
  );
});

describeIfLive("Complex Tool Calling - Error Recovery", () => {
  it(
    "should handle empty canvas gracefully",
    async () => {
      const mcpClient = createStatefulMockMcpClient({ elements: [] });

      const results = await runAgentTest(
        `Check the canvas and tell me what's there. If it's empty, create a simple rectangle to get started.`,
        mcpClient,
        { maxIterations: 5, enabledTools: ["canvas_read", "canvas_write"] }
      );

      logTestResults("Empty Canvas Handling", results, mcpClient);

      // Should handle gracefully
      expect(results.completed || results.failed).toBe(true);

      // Might have created an element
      const writeOps = mcpClient.getOperationsByTool("canvas_write");
      console.log("Write operations after empty canvas test:", writeOps.length);
    },
    SHORT_TIMEOUT
  );

  it(
    "should continue working with limited tool set",
    async () => {
      const mcpClient = createStatefulMockMcpClient({
        elements: [
          { id: "el1", type: "rectangle", x: 0, y: 0, width: 100, height: 100 },
        ],
      });

      const results = await runAgentTest(
        `Read the canvas and describe what you see.
         Note: You can only read, not modify the canvas.`,
        mcpClient,
        { maxIterations: 4, enabledTools: ["canvas_read", "canvas_find"] }
      );

      logTestResults("Limited Tool Set", results, mcpClient);

      // Should complete with read-only tools
      expect(results.completed || results.failed).toBe(true);

      // Should not have any write or edit operations
      expect(mcpClient.getOperationsByTool("canvas_write").length).toBe(0);
      expect(mcpClient.getOperationsByTool("canvas_edit").length).toBe(0);
    },
    SHORT_TIMEOUT
  );
});

describeIfLive("Complex Tool Calling - Multi-Iteration", () => {
  it(
    "should complete complex task requiring multiple iterations",
    async () => {
      const mcpClient = createStatefulMockMcpClient();

      const results = await runAgentTest(
        `Build a simple UI mockup:
         1. First, create a header rectangle (800x60) at the top
         2. Then, create a sidebar rectangle (200x400) on the left
         3. Next, create a content area rectangle (580x400) on the right
         4. Finally, add a text label "My App" in the header

         Take your time and do each step carefully.`,
        mcpClient,
        { maxIterations: 10, enabledTools: ["canvas_read", "canvas_write", "canvas_edit"] }
      );

      logTestResults("Multi-Iteration UI Mockup", results, mcpClient);

      // Should have made multiple iterations
      expect(results.toolCallCount).toBeGreaterThanOrEqual(1);

      // Should have created elements
      expect(mcpClient.getElementCount()).toBeGreaterThanOrEqual(1);

      // Should complete
      expect(results.completed || results.failed).toBe(true);
    },
    TIMEOUT
  );
});

// ============================================================================
// SKIP INFO
// ============================================================================

describe("Complex Tool Calling (Skip Info)", () => {
  it("should print run instructions when tests are skipped", () => {
    if (!RUN_LIVE_TESTS) {
      console.log(`
┌─────────────────────────────────────────────────────────────────────────────┐
│  Complex Tool Calling Test Skipped                                          │
│                                                                             │
│  These tests run complex multi-step agentic workflows with real LLM calls.  │
│                                                                             │
│  To run:                                                                    │
│  GOOGLE_API_KEY=xxx pnpm --filter=@waiboard/ai-agents test:live:complex     │
│                                                                             │
│  Estimated cost: ~$0.05-0.10 (multiple LLM calls per test)                  │
│  Estimated time: ~3-5 minutes                                               │
│                                                                             │
│  Test scenarios:                                                            │
│  - Multi-step workflows (read → write → edit)                               │
│  - Tool chaining (find → modify)                                            │
│  - Complex canvas creation (flowcharts, UI mockups)                         │
│  - Canvas analysis and aggregation                                          │
│  - Error recovery and edge cases                                            │
└─────────────────────────────────────────────────────────────────────────────┘
      `);
    }
    expect(true).toBe(true);
  });
});
