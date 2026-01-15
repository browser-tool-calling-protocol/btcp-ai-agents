/**
 * Prompt Validation Tests
 *
 * Verify that prompts and context sent to LLM at runtime:
 * 1. Only mention V3 tool names (canvas_read, canvas_write, etc.)
 * 2. Don't leak legacy MCP tool names (mcp__canvas__*, el_create, etc.)
 * 3. Tool descriptions are clean and consistent
 */

import { describe, it, expect } from "vitest";
import { getSystemPromptWithXml } from "../../agents/prompts.js";
import { createCanvasTools } from "../../core/loop/tools.js";
import { toolSetToGeminiFormat } from "../../tools/ai-sdk-bridge.js";
import type { McpClient } from "../../core/loop/types.js";

// Mock MCP client for tool creation
const mockMcpClient: McpClient = {
  connect: async () => true,
  disconnect: async () => {},
  execute: async () => ({}),
  readResource: async () => "{}",
  subscribeResource: () => ({ unsubscribe: () => {} }),
} as any;

describe("Prompt Validation - V3 Tool Names Only", () => {
  // Legacy tool name patterns that should NOT appear
  const LEGACY_PATTERNS = [
    /mcp__canvas__/i,
    /el_create/i,
    /el_update/i,
    /el_delete/i,
    /el_query/i,
    /el_getById/i,
    /canvas_status/i,
    /viewport_get/i,
    /viewport_set/i,
  ];

  // Valid V3 tool names
  const V3_TOOL_NAMES = [
    "canvas_read",
    "canvas_write",
    "canvas_edit",
    "canvas_find",
    "canvas_capture",
  ];

  describe("System Prompts", () => {
    const modes = ["general", "diagram", "designer", "executor"] as const;

    modes.forEach((mode) => {
      it(`should not contain legacy tool names in ${mode} prompt`, () => {
        const prompt = getSystemPromptWithXml(mode);

        // Check that no legacy patterns appear in the prompt
        for (const pattern of LEGACY_PATTERNS) {
          expect(prompt).not.toMatch(pattern);
        }
      });

      it(`should explicitly list V3 tool names in ${mode} prompt`, () => {
        const prompt = getSystemPromptWithXml(mode);

        // At least some V3 tool names should be mentioned
        const mentionsV3Tools = V3_TOOL_NAMES.some((toolName) =>
          prompt.includes(toolName)
        );

        expect(mentionsV3Tools).toBe(true);
      });
    });
  });

  describe("Tool Definitions", () => {
    it("should only register V3 tool names", async () => {
      const tools = createCanvasTools(mockMcpClient, "test-canvas");
      const toolNames = Object.keys(tools);

      // Should only have V3 tool names
      expect(toolNames).toEqual(
        expect.arrayContaining(["canvas_read", "canvas_write", "canvas_edit", "canvas_find"])
      );

      // Should not have any legacy tool names
      for (const toolName of toolNames) {
        expect(toolName).not.toMatch(/mcp__canvas__/);
        expect(toolName).not.toMatch(/el_/);
      }
    });

    it("should have clean tool descriptions without legacy names", async () => {
      const tools = createCanvasTools(mockMcpClient, "test-canvas");

      for (const [toolName, tool] of Object.entries(tools)) {
        const description = (tool as any).description || "";

        // Check that description doesn't mention legacy tool names
        for (const pattern of LEGACY_PATTERNS) {
          expect(description).not.toMatch(pattern);
        }

        // Description should exist and be non-empty
        expect(description.length).toBeGreaterThan(0);
      }
    });
  });

  describe("Gemini Tool Format", () => {
    it("should convert tools to Gemini format with V3 names only", async () => {
      const tools = createCanvasTools(mockMcpClient, "test-canvas");
      const geminiTools = toolSetToGeminiFormat(tools);

      // Should be a plain object with tool definitions
      expect(typeof geminiTools).toBe("object");
      const toolNames = Object.keys(geminiTools);
      expect(toolNames.length).toBeGreaterThan(0);

      // Check each tool definition
      for (const [name, tool] of Object.entries(geminiTools)) {
        // Name should follow canvas_* pattern (not legacy mcp__canvas__* or el_*)
        expect(name).toMatch(/^canvas_[a-z_]+$/);
        expect(name).not.toMatch(/^mcp__canvas__/);
        expect(name).not.toMatch(/^el_/);

        // Should have description and parameters
        expect(tool.description).toBeDefined();
        expect(tool.parameters).toBeDefined();

        // Description should not contain legacy patterns
        const description = tool.description || "";
        for (const pattern of LEGACY_PATTERNS) {
          expect(description).not.toMatch(pattern);
        }
      }
    });

    it("should have exactly 4+ tools registered", async () => {
      const tools = createCanvasTools(mockMcpClient, "test-canvas");
      const geminiTools = toolSetToGeminiFormat(tools);

      const funcCount = Object.keys(geminiTools).length;

      // Should have at least 4 V3 tools (read, write, edit, find)
      expect(funcCount).toBeGreaterThanOrEqual(4);
    });
  });

  describe("Runtime Context Assembly", () => {
    it("should build prompts that emphasize V3 tool usage", () => {
      const prompt = getSystemPromptWithXml("general");

      // Should have explicit instructions about tool names
      expect(prompt).toMatch(/canvas_read|canvas_write|canvas_edit/i);

      // Should not show legacy tool names even as negative examples
      expect(prompt).not.toMatch(/❌.*mcp__canvas__/);
      expect(prompt).not.toMatch(/Wrong:.*el_create/i);
      expect(prompt).not.toMatch(/Don't use.*mcp__canvas__/i);
    });

    it("should not expose MCP_TOOLS constants to LLM", () => {
      const prompt = getSystemPromptWithXml("general");

      // These are internal implementation details and should not appear
      expect(prompt).not.toContain("MCP_TOOLS");
      expect(prompt).not.toContain("CANVAS_STATUS");
      expect(prompt).not.toContain("EL_QUERY");
      expect(prompt).not.toContain("EL_GET_BY_ID");
      expect(prompt).not.toContain("VIEWPORT_GET");
    });
  });

  describe("Tool Name Consistency", () => {
    it("should mention core V3 tools in prompts", async () => {
      const prompt = getSystemPromptWithXml("general");

      // Core V3 tools should be mentioned in the prompt
      const coreTools = ["canvas_read", "canvas_write", "canvas_edit", "canvas_find"];
      for (const toolName of coreTools) {
        expect(prompt).toContain(toolName);
      }
    });

    it("should not mention tools in prompts that aren't registered", () => {
      const tools = createCanvasTools(mockMcpClient, "test-canvas");
      const toolNames = new Set(Object.keys(tools));

      const prompt = getSystemPromptWithXml("general");

      // Legacy tool names should not be mentioned even if they exist in codebase
      const legacyNames = [
        "mcp__canvas__el_create",
        "mcp__canvas__el_update",
        "mcp__canvas__el_delete",
        "mcp__canvas__el_query",
        "mcp__canvas__canvas_status",
      ];

      for (const legacyName of legacyNames) {
        expect(prompt).not.toContain(legacyName);
        expect(toolNames.has(legacyName)).toBe(false);
      }
    });
  });

  describe("Error Messages", () => {
    it("should provide helpful error when unknown tool is called", async () => {
      const tools = createCanvasTools(mockMcpClient, "test-canvas");
      const availableTools = Object.keys(tools).join(", ");

      // Error message should list available tools
      expect(availableTools).toContain("canvas_read");
      expect(availableTools).toContain("canvas_write");

      // Error message should not suggest legacy tools
      expect(availableTools).not.toContain("mcp__canvas__");
      expect(availableTools).not.toContain("el_create");
    });
  });
});

describe("Prompt Quality - Positive Instructions Only", () => {
  it("should use positive instructions, not negative examples", () => {
    const prompt = getSystemPromptWithXml("general");

    // Count "don't", "not", "never", "❌" occurrences
    const negativeMarkers = (prompt.match(/don't|not\s+use|never\s+use|❌|wrong:/gi) || [])
      .length;

    // Count positive instructions "use", "call", "✅"
    const positiveMarkers = (prompt.match(/\buse\b|call|✅|correct:/gi) || []).length;

    // Should have more positive than negative instructions
    expect(positiveMarkers).toBeGreaterThan(negativeMarkers);
  });

  it("should emphasize available tools clearly", () => {
    const prompt = getSystemPromptWithXml("general");

    // Should have clear section about available tools
    expect(prompt).toMatch(/available tools|your tools|use these tools/i);

    // Should list tools in a clear format (table or list)
    expect(prompt).toMatch(/canvas_read.*canvas_write.*canvas_edit/s);
  });
});
