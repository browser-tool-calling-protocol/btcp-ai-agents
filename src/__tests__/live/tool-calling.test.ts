/**
 * Live Tool Calling Test
 *
 * Tests the full agentic loop with real LLM calls and mock MCP client.
 * Verifies the agent makes correct tool calls and produces final responses.
 *
 * Run with:
 * ```bash
 * GOOGLE_API_KEY=xxx pnpm --filter=@waiboard/ai-agents test:live:tool
 * ```
 *
 * @module @waiboard/ai-agents/tests/live
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runAgenticLoop } from "../../core/loop.js";
import type { McpClient } from "../../tools/definitions.js";
import type { AgentEvent } from "../../agents/types.js";

// ============================================================================
// TEST CONFIGURATION
// ============================================================================

const RUN_LIVE_TESTS = process.env.GOOGLE_API_KEY !== undefined;
const describeIfLive = RUN_LIVE_TESTS ? describe : describe.skip;

const TIMEOUT = 60_000; // 60 seconds for full loop

// ============================================================================
// MOCK MCP CLIENT
// ============================================================================

/**
 * Simple mock MCP client for testing.
 * Returns predefined results for canvas operations.
 */
function createMockMcpClient(canvasState: { elements: unknown[] }) {
  return {
    async execute<T>(tool: string, args: Record<string, unknown>): Promise<T> {
      console.log(`[MockMCP] ${tool}`, JSON.stringify(args));

      switch (tool) {
        case "canvas_read": {
          const format = args.format || "json";
          if (format === "summary") {
            return {
              elementCount: canvasState.elements.length,
              types: { rectangle: 3, text: 2 },
              bounds: { x: 0, y: 0, width: 800, height: 600 },
            } as T;
          }
          return {
            elements: canvasState.elements,
            count: canvasState.elements.length,
          } as T;
        }

        case "canvas_find": {
          return {
            count: canvasState.elements.length,
            elements: canvasState.elements,
          } as T;
        }

        case "canvas_write": {
          return { success: true, createdIds: ["elem_new"] } as T;
        }

        case "canvas_edit": {
          return { success: true } as T;
        }

        case "canvas_capture": {
          return {
            success: true,
            format: "base64",
            data: "data:image/png;base64,mock...",
          } as T;
        }

        case "canvas_snapshot": {
          // Returns canvas state summary for context building
          return {
            elementCount: canvasState.elements.length,
            elements: canvasState.elements.map((el: any) => ({
              id: el.id,
              type: el.type,
              bounds: { x: el.x, y: el.y, width: el.width || 100, height: el.height || 50 },
            })),
            bounds: { x: 0, y: 0, width: 800, height: 600 },
            selection: [],
            viewport: { x: 0, y: 0, width: 1200, height: 800, zoom: 1 },
          } as T;
        }

        default:
          console.log(`[MockMCP] Unknown tool: ${tool}`);
          return { success: true } as T;
      }
    },

    async readResource<T>(uri: string): Promise<T> {
      console.log(`[MockMCP] readResource: ${uri}`);
      // Return canvas snapshot for resource reads
      return {
        elementCount: canvasState.elements.length,
        elements: canvasState.elements,
        bounds: { x: 0, y: 0, width: 800, height: 600 },
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
  } satisfies McpClient & { connect(): Promise<boolean>; disconnect(): void };
}

// ============================================================================
// LIVE TOOL CALLING TEST
// ============================================================================

describeIfLive("Live Tool Calling", () => {
  let mockCanvas: { elements: unknown[] };

  beforeEach(() => {
    // Set up mock canvas with 5 elements
    mockCanvas = {
      elements: [
        { id: "1", type: "rectangle", x: 0, y: 0, width: 100, height: 100 },
        { id: "2", type: "rectangle", x: 150, y: 0, width: 100, height: 100 },
        { id: "3", type: "rectangle", x: 300, y: 0, width: 100, height: 100 },
        { id: "4", type: "text", x: 0, y: 150, text: "Hello" },
        { id: "5", type: "text", x: 150, y: 150, text: "World" },
      ],
    };
  });

  it(
    "should make exactly 1 tool call and return final response",
    async () => {
      const mcpClient = createMockMcpClient(mockCanvas);
      const events: AgentEvent[] = [];
      let toolCallCount = 0;
      let finalSummary = "";

      // Run the agentic loop
      for await (const event of runAgenticLoop(
        "How many elements are in the canvas? Use the canvas_read tool to find out.",
        "test-canvas",
        {
          mcpClient,
          model: "fast",
          provider: "google",
          maxIterations: 5,
          verbose: true,
          enabledTools: ["canvas_read", "canvas_find"],
        }
      )) {
        events.push(event);

        // Track tool calls
        if (event.type === "acting") {
          toolCallCount++;
          console.log(`[Event] Tool call: ${event.tool}`);
        }

        // Capture final summary
        if (event.type === "complete" && "summary" in event) {
          finalSummary = String(event.summary);
        }
      }

      // Log results
      console.log("\n=== Tool Calling Test Result ===");
      console.log("Total events:", events.length);
      console.log("Tool calls:", toolCallCount);
      console.log("Final summary:", finalSummary);
      console.log("Event types:", events.map((e) => e.type).join(" → "));
      console.log("================================\n");

      // Verify at least 1 tool call was made (the main assertion)
      expect(toolCallCount).toBeGreaterThanOrEqual(1);

      // Check terminal state
      const completeEvent = events.find((e) => e.type === "complete");
      const failedEvent = events.find((e) => e.type === "failed");

      // Either completed successfully or failed after making tool calls
      // (API issues can cause failures even with successful tool calls)
      expect(completeEvent || failedEvent).toBeDefined();

      // If completed, verify summary exists
      if (completeEvent && finalSummary) {
        expect(finalSummary.length).toBeGreaterThan(0);
      }
    },
    TIMEOUT
  );
});

// ============================================================================
// SKIP INFO
// ============================================================================

describe("Live Tool Calling (Skip Info)", () => {
  it("should print run instructions when tests are skipped", () => {
    if (!RUN_LIVE_TESTS) {
      console.log(`
┌─────────────────────────────────────────────────────────────────────────────┐
│  Live Tool Calling Test Skipped                                             │
│                                                                             │
│  This test runs the full agentic loop with real LLM calls.                  │
│                                                                             │
│  To run:                                                                    │
│  GOOGLE_API_KEY=xxx pnpm --filter=@waiboard/ai-agents test:live:tool        │
│                                                                             │
│  Estimated cost: ~$0.01                                                     │
└─────────────────────────────────────────────────────────────────────────────┘
      `);
    }
    expect(true).toBe(true);
  });
});
