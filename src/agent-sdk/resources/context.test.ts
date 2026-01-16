/**
 * Context Injection Tests
 *
 * Tests for alias resolution, context building, and error handling.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ContextInjector, prepareAgentContext } from "./context.js";
import { ResourceRegistry } from "./registry.js";
import { colorProvider, timeProvider, registerBuiltInProviders } from "./providers.js";
import type { ResourceProvider, ResourceContext, ResolvedResource } from "./types.js";

/**
 * Create a selection provider that uses the executor from context
 */
function createSelectionProvider(): ResourceProvider {
  return {
    name: "selection",
    definitions: [
      {
        name: "selection",
        description: "Get selected canvas elements",
        hasArgs: false,
        examples: ["@selection"],
        isAsync: true,
        category: "canvas",
      },
    ],
    handles(resourceName: string): boolean {
      return resourceName === "selection";
    },
    async get(
      _resourceName: string,
      _args: string[],
      context: ResourceContext
    ): Promise<ResolvedResource> {
      const executor = context.executor as { execute: (cmd: string) => Promise<unknown[]> } | undefined;
      if (!executor) {
        return {
          value: null,
          summary: "No executor available",
          tokenEstimate: 0,
          success: false,
          error: "No executor available for @selection",
        };
      }

      try {
        const elements = await executor.execute("getSelection");
        return {
          value: elements,
          summary: `${(elements as unknown[]).length} elements selected`,
          tokenEstimate: JSON.stringify(elements).length / 4,
          success: true,
        };
      } catch (error) {
        throw error; // Let the injector handle retries
      }
    },
  };
}

describe("ContextInjector", () => {
  let registry: ResourceRegistry;
  let injector: ContextInjector;

  beforeEach(() => {
    registry = new ResourceRegistry();
    registerBuiltInProviders(registry);
    // Register selection provider for async tests
    registry.register(createSelectionProvider());
    injector = new ContextInjector(registry);
  });

  // ==========================================================================
  // BASIC PREPARATION
  // ==========================================================================

  describe("Basic Preparation", () => {
    it("should return original prompt if no aliases", async () => {
      const result = await injector.prepare("Create a rectangle", {});

      expect(result.original).toBe("Create a rectangle");
      expect(result.enrichedPrompt).toBe("Create a rectangle");
      expect(result.resolutions).toEqual([]);
      expect(result.allResolved).toBe(true);
    });

    it("should resolve static aliases", async () => {
      const result = await injector.prepare("Use @color(red)", {});

      expect(result.allResolved).toBe(true);
      expect(result.resolutions.length).toBe(1);
      expect(result.resolutions[0].status).toBe("resolved");
      expect(result.resolutions[0].resource?.value).toBe("#ff0000");
    });

    it("should resolve multiple aliases", async () => {
      const result = await injector.prepare(
        "@color(red) and @color(blue)",
        {}
      );

      expect(result.allResolved).toBe(true);
      expect(result.resolutions.length).toBe(2);
    });

    it("should build context section", async () => {
      const result = await injector.prepare("Use @color(red)", {});

      expect(result.contextSection).toContain("@color(red)");
      expect(result.contextSection).toContain("#ff0000");
    });

    it("should build enriched prompt", async () => {
      const result = await injector.prepare("Fill with @color(red)", {});

      expect(result.enrichedPrompt).toContain("Fill with @color(red)");
      expect(result.enrichedPrompt).toContain("<context>");
      expect(result.enrichedPrompt).toContain("</context>");
    });
  });

  // ==========================================================================
  // ERROR HANDLING
  // ==========================================================================

  describe("Error Handling", () => {
    it("should mark invalid aliases as failed", async () => {
      const result = await injector.prepare("Use @unknown", {});

      expect(result.allResolved).toBe(false);
      expect(result.resolutions[0].status).toBe("failed");
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it("should stop on first error with failFast", async () => {
      const result = await injector.prepare(
        "@unknown @color(red)",
        {},
        { failFast: true }
      );

      expect(result.criticalErrors.length).toBeGreaterThan(0);
      // Should only process first alias
      expect(result.resolutions.length).toBe(1);
    });

    it("should continue after error without failFast", async () => {
      const result = await injector.prepare(
        "@unknown @color(red)",
        {},
        { failFast: false }
      );

      expect(result.resolutions.length).toBe(2);
      expect(result.resolutions[0].status).toBe("failed");
      expect(result.resolutions[1].status).toBe("resolved");
    });

    it("should use fallback when provided", async () => {
      const result = await injector.prepare(
        "@color(nonexistent)",
        {},
        {
          fallbacks: { color: "#808080" },
          onError: () => "fallback",
        }
      );

      expect(result.resolutions[0].status).toBe("fallback");
      expect(result.resolutions[0].fallback).toBe("#808080");
    });

    it("should skip aliases when requested", async () => {
      const result = await injector.prepare(
        "@color(red) @now",
        {},
        { skip: ["now"] }
      );

      expect(result.resolutions[1].status).toBe("skipped");
      expect(result.resolutions[0].status).toBe("resolved");
    });

    it("should handle custom error handler", async () => {
      const onError = vi.fn().mockReturnValue("skip");

      const result = await injector.prepare("@color(nonexistent)", {}, { onError });

      expect(onError).toHaveBeenCalled();
      expect(result.resolutions[0].status).toBe("skipped");
    });
  });

  // ==========================================================================
  // TOKEN BUDGET
  // ==========================================================================

  describe("Token Budget", () => {
    it("should respect token budget", async () => {
      // palette returns many colors, uses more tokens
      const result = await injector.prepare(
        "@palette(ocean) @palette(forest) @palette(sunset)",
        {},
        { tokenBudget: 15 }
      );

      // Should skip some aliases due to budget
      const skipped = result.resolutions.filter((r) => r.status === "skipped");
      expect(skipped.length).toBeGreaterThan(0);
      expect(result.warnings.some((w) => w.includes("Token budget"))).toBe(true);
    });

    it("should track total tokens", async () => {
      const result = await injector.prepare("@color(red) @color(blue)", {});

      expect(result.stats.totalTokens).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // ASYNC RESOURCES
  // ==========================================================================

  describe("Async Resources", () => {
    it("should resolve canvas resources with executor", async () => {
      const mockExecutor = {
        execute: vi.fn().mockResolvedValue([
          { id: "rect-1", type: "rectangle" },
        ]),
      };

      const result = await injector.prepare("Style @selection", {
        executor: mockExecutor,
      });

      expect(result.allResolved).toBe(true);
      expect(mockExecutor.execute).toHaveBeenCalled();
    });

    it("should handle executor failure", async () => {
      const mockExecutor = {
        execute: vi.fn().mockRejectedValue(new Error("Connection lost")),
      };

      const result = await injector.prepare("Style @selection", {
        executor: mockExecutor,
      });

      expect(result.allResolved).toBe(false);
      expect(result.resolutions[0].status).toBe("failed");
      expect(result.resolutions[0].error).toContain("Connection lost");
    });

    it("should retry on failure", async () => {
      const mockExecutor = {
        execute: vi
          .fn()
          .mockRejectedValueOnce(new Error("Temporary error"))
          .mockResolvedValueOnce([{ id: "rect-1" }]),
      };

      const result = await injector.prepare(
        "Style @selection",
        { executor: mockExecutor },
        { maxRetries: 1 }
      );

      expect(result.allResolved).toBe(true);
      expect(mockExecutor.execute).toHaveBeenCalledTimes(2);
    });

    it("should timeout long resolutions", async () => {
      const mockExecutor = {
        execute: vi.fn().mockImplementation(
          () => new Promise((resolve) => setTimeout(resolve, 10000))
        ),
      };

      const result = await injector.prepare(
        "Style @selection",
        { executor: mockExecutor },
        { timeout: 100 }
      );

      expect(result.allResolved).toBe(false);
      expect(result.resolutions[0].error).toContain("timeout");
    });
  });

  // ==========================================================================
  // STATS
  // ==========================================================================

  describe("Statistics", () => {
    it("should track resolution stats", async () => {
      const result = await injector.prepare(
        "@color(red) @unknown @color(blue)",
        {}
      );

      expect(result.stats.total).toBe(3);
      expect(result.stats.resolved).toBe(2);
      expect(result.stats.failed).toBe(1);
    });

    it("should track duration", async () => {
      const result = await injector.prepare("@color(red)", {});

      expect(result.stats.duration).toBeGreaterThanOrEqual(0);
      expect(result.resolutions[0].duration).toBeGreaterThanOrEqual(0);
    });
  });

  // ==========================================================================
  // UTILITY METHODS
  // ==========================================================================

  describe("Utility Methods", () => {
    it("should check if preparation needed", () => {
      expect(injector.needsPreparation("Use @color(red)")).toBe(true);
      expect(injector.needsPreparation("No aliases")).toBe(false);
    });

    it("should validate without resolving", () => {
      const valid = injector.validate("@color(red)");
      expect(valid.valid).toBe(true);

      const invalid = injector.validate("@unknown");
      expect(invalid.valid).toBe(false);
    });
  });
});

// ============================================================================
// PREPARE AGENT CONTEXT
// ============================================================================

describe("prepareAgentContext", () => {
  let registry: ResourceRegistry;

  beforeEach(() => {
    registry = new ResourceRegistry();
    registerBuiltInProviders(registry);
    registry.register(createSelectionProvider());
  });

  it("should prepare context for agent", async () => {
    const result = await prepareAgentContext(
      "Fill shape with @color(red)",
      registry,
      {}
    );

    expect(result.allResolved).toBe(true);
    expect(result.enrichedPrompt).toContain("Fill shape with @color(red)");
    expect(result.enrichedPrompt).toContain("<context>");
  });

  it("should work with canvas resources", async () => {
    const mockExecutor = {
      execute: vi.fn().mockResolvedValue([
        { id: "rect-1", type: "rectangle", x: 100, y: 50 },
      ]),
    };

    const result = await prepareAgentContext(
      "Resize @selection",
      registry,
      { executor: mockExecutor }
    );

    expect(result.allResolved).toBe(true);
    expect(result.contextSection).toContain("@selection");
  });

  it("should include warnings in enriched prompt", async () => {
    const result = await prepareAgentContext(
      "@color(invalid) @color(red)",
      registry,
      {},
      { failFast: false }
    );

    expect(result.enrichedPrompt).toContain("<warnings>");
  });
});

// ============================================================================
// INTEGRATION SCENARIOS
// ============================================================================

describe("Integration Scenarios", () => {
  let registry: ResourceRegistry;

  beforeEach(() => {
    registry = new ResourceRegistry();
    registerBuiltInProviders(registry);
    registry.register(createSelectionProvider());
  });

  it("should handle complex prompt with mixed resources", async () => {
    const mockExecutor = {
      execute: vi.fn().mockResolvedValue([
        { id: "rect-1", type: "rectangle" },
        { id: "rect-2", type: "rectangle" },
      ]),
    };

    const result = await prepareAgentContext(
      "Fill @selection with @color(red) at @now",
      registry,
      { executor: mockExecutor }
    );

    expect(result.allResolved).toBe(true);
    expect(result.resolutions.length).toBe(3);

    // Check all resolved correctly
    expect(result.resolutions[0].parsed.name).toBe("selection");
    expect(result.resolutions[1].parsed.name).toBe("color");
    expect(result.resolutions[2].parsed.name).toBe("now");
  });

  it("should provide useful context even with partial failures", async () => {
    const mockExecutor = {
      execute: vi.fn().mockRejectedValue(new Error("Canvas offline")),
    };

    const result = await prepareAgentContext(
      "Fill @selection with @color(red)",
      registry,
      { executor: mockExecutor },
      { failFast: false }
    );

    // Selection fails, color succeeds
    expect(result.stats.resolved).toBe(1);
    expect(result.stats.failed).toBe(1);

    // Context still has useful info
    expect(result.contextSection).toContain("@color(red)");
    expect(result.contextSection).toContain("#ff0000");
    expect(result.contextSection).toContain("[error]");
  });

  it("should handle all failures gracefully", async () => {
    const result = await prepareAgentContext(
      "@unknown1 @unknown2",
      registry,
      {}
    );

    expect(result.allResolved).toBe(false);
    expect(result.stats.failed).toBe(2);
    expect(result.warnings.length).toBe(2);

    // Still produces valid output
    expect(result.enrichedPrompt).toBeDefined();
  });

  it("should work with custom error recovery", async () => {
    const mockExecutor = {
      execute: vi.fn().mockRejectedValue(new Error("Not found")),
    };

    const result = await prepareAgentContext(
      "Style @selection",
      registry,
      { executor: mockExecutor },
      {
        fallbacks: { selection: [{ id: "default", type: "rectangle" }] },
        onError: (alias, error) => {
          if (error.message.includes("Not found")) return "fallback";
          return "fail";
        },
      }
    );

    expect(result.resolutions[0].status).toBe("fallback");
    expect(result.resolutions[0].fallback).toEqual([
      { id: "default", type: "rectangle" },
    ]);
  });

  it("should produce agent-friendly output format", async () => {
    const result = await prepareAgentContext(
      "Fill with @color(red) and @color(blue)",
      registry,
      {}
    );

    // Check XML structure
    expect(result.enrichedPrompt).toMatch(/<context>[\s\S]*<\/context>/);

    // Check context is informative
    expect(result.contextSection).toContain("@color(red)");
    expect(result.contextSection).toContain("@color(blue)");
    expect(result.contextSection).toContain("#ff0000");
    expect(result.contextSection).toContain("#0000ff");
  });
});
