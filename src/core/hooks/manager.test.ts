import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  HooksManager,
  CommonHooks,
  hooksManager,
  createHooksManager,
  createHooksManagerWithDefaults,
} from "./manager.js";
import type { HookContext } from "./types.js";

describe("HooksManager", () => {
  let hooks: HooksManager;

  beforeEach(() => {
    hooks = new HooksManager();
  });

  describe("Hook Registration", () => {
    it("should register and trigger hooks", async () => {
      const handler = vi.fn();
      hooks.register("pre-tool-use", handler);

      await hooks.trigger("pre-tool-use", { tool: "read" });

      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          hookType: "pre-tool-use",
          tool: "read",
        })
      );
    });

    it("should return unregister function", async () => {
      const handler = vi.fn();
      const unregister = hooks.register("pre-tool-use", handler);

      await hooks.trigger("pre-tool-use", {});
      expect(handler).toHaveBeenCalledOnce();

      unregister();

      await hooks.trigger("pre-tool-use", {});
      expect(handler).toHaveBeenCalledOnce(); // Still only once
    });

    it("should handle multiple handlers", async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      hooks.register("post-tool-use", handler1);
      hooks.register("post-tool-use", handler2);

      await hooks.trigger("post-tool-use", {});

      expect(handler1).toHaveBeenCalledOnce();
      expect(handler2).toHaveBeenCalledOnce();
    });
  });

  describe("Convenience Methods", () => {
    it("should register via onPreToolUse", async () => {
      const handler = vi.fn();
      hooks.onPreToolUse(handler);

      await hooks.trigger("pre-tool-use", {});
      expect(handler).toHaveBeenCalled();
    });

    it("should register via onPostToolUse", async () => {
      const handler = vi.fn();
      hooks.onPostToolUse(handler);

      await hooks.trigger("post-tool-use", {});
      expect(handler).toHaveBeenCalled();
    });

    it("should register via onPreStep", async () => {
      const handler = vi.fn();
      hooks.onPreStep(handler);

      await hooks.trigger("pre-step", {});
      expect(handler).toHaveBeenCalled();
    });

    it("should register via onPostStep", async () => {
      const handler = vi.fn();
      hooks.onPostStep(handler);

      await hooks.trigger("post-step", {});
      expect(handler).toHaveBeenCalled();
    });

    it("should register via onContextChange", async () => {
      const handler = vi.fn();
      hooks.onContextChange(handler);

      await hooks.trigger("context-change", {});
      expect(handler).toHaveBeenCalled();
    });

    it("should register via onError", async () => {
      const handler = vi.fn();
      hooks.onError(handler);

      await hooks.trigger("error", {});
      expect(handler).toHaveBeenCalled();
    });

    it("should register via onCheckpoint", async () => {
      const handler = vi.fn();
      hooks.onCheckpoint(handler);

      await hooks.trigger("checkpoint", {});
      expect(handler).toHaveBeenCalled();
    });

    it("should register via onSessionStart and onSessionEnd", async () => {
      const startHandler = vi.fn();
      const endHandler = vi.fn();

      hooks.onSessionStart(startHandler);
      hooks.onSessionEnd(endHandler);

      await hooks.trigger("session-start", {});
      await hooks.trigger("session-end", {});

      expect(startHandler).toHaveBeenCalled();
      expect(endHandler).toHaveBeenCalled();
    });
  });

  describe("Blocking Hooks", () => {
    it("should block operation when handler returns proceed: false", async () => {
      hooks.onPreToolUse(() => ({
        proceed: false,
        reason: "Blocked for testing",
      }));

      const result = await hooks.trigger("pre-tool-use", {});

      expect(result.blocked).toBe(true);
      expect(result.message).toBe("Blocked for testing");
    });

    it("should not block when handler returns proceed: true", async () => {
      hooks.onPreToolUse(() => ({ proceed: true }));

      const result = await hooks.trigger("pre-tool-use", {});

      expect(result.blocked).toBe(false);
    });

    it("should not block when handler returns void", async () => {
      hooks.onPreToolUse(() => {});

      const result = await hooks.trigger("pre-tool-use", {});

      expect(result.blocked).toBe(false);
    });

    it("should support modifiedInput in hook result", async () => {
      hooks.onPreToolUse(() => ({
        proceed: true,
        modifiedInput: { modified: true },
      }));

      const result = await hooks.trigger("pre-tool-use", { toolInput: { original: true } });

      expect(result.blocked).toBe(false);
      expect(result.modifiedInput).toEqual({ modified: true });
    });
  });

  describe("Metrics Collection", () => {
    it("should track tool call counts", async () => {
      await hooks.trigger("pre-tool-use", { tool: "read" });
      await hooks.trigger("pre-tool-use", { tool: "read" });
      await hooks.trigger("pre-tool-use", { tool: "write" });

      const metrics = hooks.getMetrics();

      expect(metrics["read"]?.calls).toBe(2);
      expect(metrics["write"]?.calls).toBe(1);
    });

    it("should track durations", async () => {
      // Must call pre-tool-use first to create the metrics entry
      await hooks.trigger("pre-tool-use", { tool: "read" });
      await hooks.trigger("pre-tool-use", { tool: "read" });
      // Then post-tool-use with durations
      await hooks.trigger("post-tool-use", { tool: "read", duration: 100 });
      await hooks.trigger("post-tool-use", { tool: "read", duration: 200 });

      const metrics = hooks.getMetrics();

      expect(metrics["read"]?.avgDuration).toBe(150);
    });

    it("should track errors", async () => {
      // Must call pre-tool-use first to create the metrics entry
      await hooks.trigger("pre-tool-use", { tool: "write" });
      await hooks.trigger("pre-tool-use", { tool: "write" });
      // Then errors
      await hooks.trigger("error", { tool: "write" });
      await hooks.trigger("error", { tool: "write" });

      const metrics = hooks.getMetrics();

      expect(metrics["write"]?.errors).toBe(2);
    });

    it("should get metrics for specific tool", async () => {
      await hooks.trigger("pre-tool-use", { tool: "read" });
      await hooks.trigger("post-tool-use", { tool: "read", duration: 50 });

      const toolMetrics = hooks.getToolMetrics("read");

      expect(toolMetrics).not.toBeNull();
      expect(toolMetrics?.calls).toBe(1);
      expect(toolMetrics?.avgDuration).toBe(50);
    });

    it("should return null for unknown tool", () => {
      const toolMetrics = hooks.getToolMetrics("unknown");
      expect(toolMetrics).toBeNull();
    });

    it("should reset metrics", async () => {
      await hooks.trigger("pre-tool-use", { tool: "read" });
      hooks.resetMetrics();

      const metrics = hooks.getMetrics();
      expect(Object.keys(metrics)).toHaveLength(0);
    });
  });

  describe("Management", () => {
    it("should clear handlers for type", () => {
      hooks.onPreToolUse(vi.fn());
      hooks.onPreToolUse(vi.fn());

      expect(hooks.handlerCount("pre-tool-use")).toBe(2);

      hooks.clearHandlers("pre-tool-use");

      expect(hooks.handlerCount("pre-tool-use")).toBe(0);
    });

    it("should clear all handlers", () => {
      hooks.onPreToolUse(vi.fn());
      hooks.onPostToolUse(vi.fn());
      hooks.onError(vi.fn());

      hooks.clearAll();

      expect(hooks.handlerCount("pre-tool-use")).toBe(0);
      expect(hooks.handlerCount("post-tool-use")).toBe(0);
      expect(hooks.handlerCount("error")).toBe(0);
    });

    it("should get registered types", () => {
      hooks.onPreToolUse(vi.fn());
      hooks.onPostToolUse(vi.fn());

      const types = hooks.getRegisteredTypes();

      expect(types).toContain("pre-tool-use");
      expect(types).toContain("post-tool-use");
    });

    it("should check if hook type has handlers", () => {
      hooks.onPreToolUse(vi.fn());

      expect(hooks.hasHandlers("pre-tool-use")).toBe(true);
      expect(hooks.hasHandlers("post-tool-use")).toBe(false);
    });
  });

  describe("Configuration", () => {
    it("should accept initial hooks configuration", async () => {
      const handler = vi.fn();
      const configured = new HooksManager({
        hooks: [
          { type: "pre-tool-use", handler, enabled: true },
        ],
      });

      await configured.trigger("pre-tool-use", {});
      expect(handler).toHaveBeenCalled();
    });

    it("should skip disabled hooks", async () => {
      const handler = vi.fn();
      const configured = new HooksManager({
        hooks: [
          { type: "pre-tool-use", handler, enabled: false },
        ],
      });

      await configured.trigger("pre-tool-use", {});
      expect(handler).not.toHaveBeenCalled();
    });

    it("should disable metrics tracking when configured", async () => {
      const noMetrics = new HooksManager({ trackMetrics: false });

      await noMetrics.trigger("pre-tool-use", { tool: "read" });

      const metrics = noMetrics.getMetrics();
      expect(Object.keys(metrics)).toHaveLength(0);
    });
  });

  describe("Default Instance", () => {
    it("should export default hooksManager instance", () => {
      expect(hooksManager).toBeInstanceOf(HooksManager);
    });
  });
});

describe("CommonHooks", () => {
  let hooks: HooksManager;

  beforeEach(() => {
    hooks = new HooksManager();
  });

  describe("logOperations", () => {
    it("should log operations", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      hooks.register("post-tool-use", CommonHooks.logOperations());
      await hooks.trigger("post-tool-use", { tool: "read", duration: 50 });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("read")
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("50ms")
      );

      consoleSpy.mockRestore();
    });

    it("should log unknown tool when no tool specified", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      hooks.register("post-tool-use", CommonHooks.logOperations());
      await hooks.trigger("post-tool-use", {});

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("unknown")
      );

      consoleSpy.mockRestore();
    });
  });

  describe("rateLimit", () => {
    it("should allow operations within limit", async () => {
      const rateLimitHook = CommonHooks.rateLimit(3, 1000);
      hooks.register("pre-tool-use", rateLimitHook);

      const result1 = await hooks.trigger("pre-tool-use", {});
      const result2 = await hooks.trigger("pre-tool-use", {});
      const result3 = await hooks.trigger("pre-tool-use", {});

      expect(result1.blocked).toBe(false);
      expect(result2.blocked).toBe(false);
      expect(result3.blocked).toBe(false);
    });

    it("should block when rate limit exceeded", async () => {
      const rateLimitHook = CommonHooks.rateLimit(2, 1000);
      hooks.register("pre-tool-use", rateLimitHook);

      await hooks.trigger("pre-tool-use", {});
      await hooks.trigger("pre-tool-use", {});
      const result = await hooks.trigger("pre-tool-use", {});

      expect(result.blocked).toBe(true);
      expect(result.message).toContain("Rate limit");
    });

    it("should not block non-pre-tool-use hooks", async () => {
      const rateLimitHook = CommonHooks.rateLimit(1, 1000);
      hooks.register("post-tool-use", rateLimitHook);

      const result1 = await hooks.trigger("post-tool-use", {});
      const result2 = await hooks.trigger("post-tool-use", {});

      expect(result1.blocked).toBe(false);
      expect(result2.blocked).toBe(false);
    });
  });

  describe("blockTools", () => {
    it("should block specified tools", async () => {
      const blockHook = CommonHooks.blockTools(["dangerous", "risky"]);
      hooks.register("pre-tool-use", blockHook);

      const result = await hooks.trigger("pre-tool-use", { tool: "dangerous" });

      expect(result.blocked).toBe(true);
      expect(result.message).toContain("dangerous");
    });

    it("should allow non-blocked tools", async () => {
      const blockHook = CommonHooks.blockTools(["dangerous"]);
      hooks.register("pre-tool-use", blockHook);

      const result = await hooks.trigger("pre-tool-use", { tool: "safe" });

      expect(result.blocked).toBe(false);
    });

    it("should use custom reason when provided", async () => {
      const blockHook = CommonHooks.blockTools(["dangerous"], "Custom block reason");
      hooks.register("pre-tool-use", blockHook);

      const result = await hooks.trigger("pre-tool-use", { tool: "dangerous" });

      expect(result.message).toBe("Custom block reason");
    });
  });

  describe("allowOnlyTools", () => {
    it("should allow specified tools", async () => {
      const allowHook = CommonHooks.allowOnlyTools(["read", "search"]);
      hooks.register("pre-tool-use", allowHook);

      const result = await hooks.trigger("pre-tool-use", { tool: "read" });

      expect(result.blocked).toBe(false);
    });

    it("should block non-allowed tools", async () => {
      const allowHook = CommonHooks.allowOnlyTools(["read", "search"]);
      hooks.register("pre-tool-use", allowHook);

      const result = await hooks.trigger("pre-tool-use", { tool: "write" });

      expect(result.blocked).toBe(true);
      expect(result.message).toContain("write");
    });
  });

  describe("trackCalls", () => {
    it("should track tool calls", async () => {
      const tracker = CommonHooks.trackCalls();
      hooks.register("post-tool-use", tracker.handler);

      await hooks.trigger("post-tool-use", { tool: "read" });
      await hooks.trigger("post-tool-use", { tool: "write" });

      const calls = tracker.getCalls();
      expect(calls).toHaveLength(2);
      expect(calls[0].tool).toBe("read");
      expect(calls[1].tool).toBe("write");
    });

    it("should clear tracked calls", async () => {
      const tracker = CommonHooks.trackCalls();
      hooks.register("post-tool-use", tracker.handler);

      await hooks.trigger("post-tool-use", { tool: "read" });
      tracker.clear();

      expect(tracker.getCalls()).toHaveLength(0);
    });

    it("should include timestamps", async () => {
      const tracker = CommonHooks.trackCalls();
      hooks.register("post-tool-use", tracker.handler);

      const before = Date.now();
      await hooks.trigger("post-tool-use", { tool: "read" });
      const after = Date.now();

      const calls = tracker.getCalls();
      expect(calls[0].timestamp).toBeGreaterThanOrEqual(before);
      expect(calls[0].timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe("timeout", () => {
    it("should warn when duration exceeds timeout", async () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const timeoutHook = CommonHooks.timeout(100);
      hooks.register("post-tool-use", timeoutHook);

      await hooks.trigger("post-tool-use", { tool: "slow", duration: 200 });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("exceeded timeout")
      );

      consoleSpy.mockRestore();
    });

    it("should not warn when within timeout", async () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const timeoutHook = CommonHooks.timeout(100);
      hooks.register("post-tool-use", timeoutHook);

      await hooks.trigger("post-tool-use", { tool: "fast", duration: 50 });

      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe("validateInput", () => {
    it("should allow valid input", async () => {
      const validateHook = CommonHooks.validateInput((tool, input) => true);
      hooks.register("pre-tool-use", validateHook);

      const result = await hooks.trigger("pre-tool-use", {
        tool: "test",
        toolInput: { data: "valid" },
      });

      expect(result.blocked).toBe(false);
    });

    it("should block invalid input with default message", async () => {
      const validateHook = CommonHooks.validateInput((tool, input) => false);
      hooks.register("pre-tool-use", validateHook);

      const result = await hooks.trigger("pre-tool-use", {
        tool: "test",
        toolInput: { data: "invalid" },
      });

      expect(result.blocked).toBe(true);
      expect(result.message).toBe("Input validation failed");
    });

    it("should block with custom error message", async () => {
      const validateHook = CommonHooks.validateInput((tool, input) => {
        return "Custom validation error";
      });
      hooks.register("pre-tool-use", validateHook);

      const result = await hooks.trigger("pre-tool-use", {
        tool: "test",
        toolInput: {},
      });

      expect(result.blocked).toBe(true);
      expect(result.message).toBe("Custom validation error");
    });
  });

  describe("transformInput", () => {
    it("should transform input", async () => {
      const transformHook = CommonHooks.transformInput((tool, input) => ({
        ...input as object,
        transformed: true,
      }));
      hooks.register("pre-tool-use", transformHook);

      const result = await hooks.trigger("pre-tool-use", {
        tool: "test",
        toolInput: { original: true },
      });

      expect(result.blocked).toBe(false);
      expect(result.modifiedInput).toEqual({
        original: true,
        transformed: true,
      });
    });

    it("should not modify if transformer returns same value", async () => {
      const transformHook = CommonHooks.transformInput((tool, input) => input);
      hooks.register("pre-tool-use", transformHook);

      const input = { original: true };
      const result = await hooks.trigger("pre-tool-use", {
        tool: "test",
        toolInput: input,
      });

      expect(result.modifiedInput).toBeUndefined();
    });
  });
});

describe("Factory Functions", () => {
  describe("createHooksManager", () => {
    it("should create hooks manager", () => {
      const hooks = createHooksManager();
      expect(hooks).toBeInstanceOf(HooksManager);
    });

    it("should create typed hooks manager", () => {
      type MyTools = "read" | "write";
      const hooks = createHooksManager<MyTools>();
      expect(hooks).toBeInstanceOf(HooksManager);
    });
  });

  describe("createHooksManagerWithDefaults", () => {
    it("should create with logging enabled", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const { manager } = createHooksManagerWithDefaults({ logging: true });
      await manager.trigger("post-tool-use", { tool: "test" });

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it("should create with rate limiting", async () => {
      const { manager } = createHooksManagerWithDefaults({
        rateLimit: { maxOps: 1, windowMs: 1000 },
      });

      await manager.trigger("pre-tool-use", {});
      const result = await manager.trigger("pre-tool-use", {});

      expect(result.blocked).toBe(true);
    });

    it("should create with call tracking", async () => {
      const { manager, getCallHistory } = createHooksManagerWithDefaults({
        trackCalls: true,
      });

      await manager.trigger("post-tool-use", { tool: "test" });

      expect(getCallHistory?.()).toHaveLength(1);
    });
  });
});
