/**
 * Live Hello Smoke Test
 *
 * Simple smoke test to verify we can make a basic prompt call to the LLM.
 * This is the simplest live test - just checks if the API is working.
 *
 * Run with:
 * ```bash
 * GOOGLE_API_KEY=xxx pnpm --filter=@waiboard/ai-agents test:live:hello
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
// LIVE HELLO TEST
// ============================================================================

describeIfLive("Live Hello Smoke Test", () => {
  it(
    "should get a response from the LLM for a simple hello prompt",
    async () => {
      const provider = new GoogleProvider();

      const result = await provider.generate({
        model: "gemini-2.5-flash",
        systemPrompt: "You are a helpful assistant. Respond briefly.",
        userMessage: "Hello! Please respond with a short greeting.",
        maxTokens: 100,
        temperature: 0.7,
      });

      // Verify we got a response
      expect(result).toBeDefined();
      expect(result.text).toBeDefined();
      expect(result.text).not.toBeNull();
      expect(typeof result.text).toBe("string");
      expect(result.text!.length).toBeGreaterThan(0);

      // Verify token usage is tracked
      expect(result.usage).toBeDefined();
      expect(result.usage.totalTokens).toBeGreaterThan(0);

      // Log for visibility
      console.log("\n=== Hello Smoke Test Result ===");
      console.log("Response:", result.text);
      console.log("Tokens used:", result.usage.totalTokens);
      console.log("================================\n");
    },
    TIMEOUT
  );
});

// ============================================================================
// SKIP INFO
// ============================================================================

describe("Live Hello Smoke Test (Skip Info)", () => {
  it("should print run instructions when tests are skipped", () => {
    if (!RUN_LIVE_TESTS) {
      console.log(`
┌─────────────────────────────────────────────────────────────────────────────┐
│  Live Hello Smoke Test Skipped                                              │
│                                                                             │
│  This test verifies basic LLM connectivity with a simple hello prompt.      │
│                                                                             │
│  To run:                                                                    │
│  GOOGLE_API_KEY=xxx pnpm --filter=@waiboard/ai-agents test:live:hello       │
│                                                                             │
│  Estimated cost: ~$0.001                                                    │
└─────────────────────────────────────────────────────────────────────────────┘
      `);
    }
    expect(true).toBe(true);
  });
});
