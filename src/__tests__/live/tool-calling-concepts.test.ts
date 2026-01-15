/**
 * Live Tool Calling Test
 *
 * Verifies LLM makes correct tool calls for canvas queries.
 * This test checks that the model uses tools appropriately when asked questions.
 *
 * Run with:
 * ```bash
 * GOOGLE_API_KEY=xxx pnpm --filter=@waiboard/ai-agents test:live:tool
 * ```
 *
 * @module @waiboard/ai-agents/tests/live
 */

import { describe, it, expect } from "vitest";
import { GoogleProvider } from "../../core/providers/google.js";

// ============================================================================
// TEST CONFIGURATION
// ============================================================================

const RUN_LIVE_TESTS = process.env.GOOGLE_API_KEY !== undefined;
const describeIfLive = RUN_LIVE_TESTS ? describe : describe.skip;

const TIMEOUT = 30_000; // 30 seconds

// ============================================================================
// LIVE TOOL CALLING TEST
// ============================================================================

describeIfLive("Live Tool Calling", () => {
  it(
    "should make exactly 1 tool call and return final response",
    async () => {
      const provider = new GoogleProvider();
      const systemPrompt = "You are a canvas assistant. Use tools to answer questions about the canvas. Be concise.";
      const model = "gemini-2.0-flash-exp";

      // Step 1: Initial request - should trigger tool call
      const toolCallResult = await provider.generate({
        model,
        systemPrompt,
        userMessage: "How many elements are in the canvas?",
        tools: ["canvas_read"],
        maxTokens: 500,
        temperature: 0,
      });

      // Verify exactly 1 tool call
      expect(toolCallResult.toolCalls).toHaveLength(1);
      expect(toolCallResult.toolCalls[0].name).toBe("canvas_read");

      // Step 2: Build history with tool call
      provider.addToHistory("user", "How many elements are in the canvas?");
      provider.addToolCallToHistory(
        toolCallResult.toolCalls[0].name,
        toolCallResult.toolCalls[0].args
      );

      // Step 3: Continue with mock tool result
      const mockCanvasResult = {
        elementCount: 5,
        elements: [
          { id: "1", type: "rectangle" },
          { id: "2", type: "text" },
          { id: "3", type: "ellipse" },
          { id: "4", type: "arrow" },
          { id: "5", type: "frame" },
        ],
      };

      const finalResult = await provider.continueWithToolResult({
        model,
        systemPrompt,
        history: provider.getHistoryFormat(),
        toolName: toolCallResult.toolCalls[0].name,
        toolResult: mockCanvasResult,
        tools: ["canvas_read"],
        maxTokens: 500,
        temperature: 0,
      });

      // Verify final response has text (not another tool call)
      expect(finalResult.text).toBeTruthy();
      expect(finalResult.toolCalls).toHaveLength(0);

      // Log for visibility
      console.log("\n=== Tool Calling Test Result ===");
      console.log("Step 1 - Tool calls:", toolCallResult.toolCalls.length);
      console.log("Tool name:", toolCallResult.toolCalls[0].name);
      console.log("Tool args:", JSON.stringify(toolCallResult.toolCalls[0].args, null, 2));
      console.log("\nStep 2 - Final response:");
      console.log("Text:", finalResult.text);
      console.log("Total tokens:", toolCallResult.usage.totalTokens + finalResult.usage.totalTokens);
      console.log("================================\n");
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
│  This test verifies LLM makes correct tool calls for canvas queries.        │
│                                                                             │
│  To run:                                                                    │
│  GOOGLE_API_KEY=xxx pnpm --filter=@waiboard/ai-agents test:live:tool        │
│                                                                             │
│  Estimated cost: ~$0.001                                                    │
└─────────────────────────────────────────────────────────────────────────────┘
      `);
    }
    expect(true).toBe(true);
  });
});
