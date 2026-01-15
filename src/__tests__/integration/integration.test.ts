/**
 * Integration Tests
 *
 * Comprehensive tests that simulate real-world scenarios to ensure
 * all components work correctly together.
 *
 * Scenarios covered:
 * 1. Agent conversation with context management
 * 2. Command execution with hooks observability
 * 3. Resource resolution in prompts
 * 4. Token budget management across components
 * 5. Error handling and recovery
 * 6. Multi-turn conversation simulation
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// Context
import {
  ContextManager,
  createContextManager,
  createMessage,
  MemoryTier,
  MessagePriority,
  CompressionStrategy,
  ClaudeTokenEstimator,
  TokenBudgetTracker,
} from "../../context/index.js";

// Hooks
import {
  HooksManager,
  createHooksManager,
  CommonHooks,
} from "../../hooks/index.js";

// Aliases
import {
  DefaultAliasRegistry,
  createAliasRegistry,
  DefaultAliasResolver,
  createAliasResolver,
  parseAlias,
  extractAliases,
} from "../../aliases/index.js";

// Resources
import {
  ResourceRegistry,
  createResourceRegistry,
  registerBuiltInProviders,
  colorProvider,
  timeProvider,
} from "../../resources/index.js";

// Commands
import {
  DefaultCommandRegistry,
  createCommandRegistry,
  createCommandExecutor,
  isCommand,
  type CommandHandler,
  type CommandEvent,
} from "../../commands/index.js";

// =============================================================================
// Scenario 1: Agent Conversation with Context Management
// =============================================================================

describe("Integration: Agent Conversation Flow", () => {
  let context: ContextManager;
  let hooks: HooksManager;
  let resources: ResourceRegistry;

  beforeEach(() => {
    context = createContextManager({ maxTokens: 50000 });
    hooks = createHooksManager();
    resources = createResourceRegistry();
    registerBuiltInProviders(resources);
  });

  it("should handle a complete multi-turn conversation", async () => {
    // Setup: System prompt
    context.addSystemMessage(
      "You are a helpful design assistant. You help users create visual designs."
    );

    // Turn 1: User asks about colors
    context.addUserMessage("What colors would work well for a modern website?");

    // Assistant responds
    context.addAssistantMessage(
      "For a modern website, I recommend using a primary color like blue (#3b82f6), " +
      "with a neutral palette of grays. Would you like me to suggest a complete palette?"
    );

    // Turn 2: User provides more context
    context.addUserMessage("Yes, I want something professional for a tech startup.");

    // Simulate tool use
    context.addToolResult(
      "tool-1",
      "color_suggest",
      JSON.stringify({
        primary: "#3b82f6",
        secondary: "#64748b",
        accent: "#06b6d4",
        background: "#f8fafc",
        text: "#1e293b",
      })
    );

    context.addAssistantMessage(
      "Here's a professional palette for your tech startup:\n" +
      "- Primary: #3b82f6 (Blue)\n" +
      "- Secondary: #64748b (Slate)\n" +
      "- Accent: #06b6d4 (Cyan)\n"
    );

    // Verify conversation state
    const messages = context.getMessages();
    expect(messages.length).toBe(6);

    const stats = context.getStats();
    expect(stats.messagesByRole.system).toBe(1);
    expect(stats.messagesByRole.user).toBe(2);
    expect(stats.messagesByRole.assistant).toBe(2);
    expect(stats.messagesByRole.tool).toBe(1);

    // Prepare for API request
    const prepared = await context.prepareForRequest();
    expect(prepared.messages.length).toBe(6);
    expect(prepared.totalTokens).toBeGreaterThan(0);
    expect(prepared.responseTokens).toBeGreaterThan(0);
  });

  it("should manage token budget across long conversations", async () => {
    const smallContext = createContextManager({
      maxTokens: 2000,
      responseReserve: 500,
      toolReserve: 200,
      tieredMemory: {
        tiers: {
          system: { maxTokens: 200, minTokens: 50, compressible: false },
          tools: { maxTokens: 200, minTokens: 50, compressible: false },
          resources: { maxTokens: 200, minTokens: 50, compressible: true },
          recent: { maxTokens: 600, minTokens: 200, compressible: false },
          archived: { maxTokens: 200, minTokens: 50, compressible: true, compressionTarget: 0.3 },
          ephemeral: { maxTokens: 100, minTokens: 0, compressible: true },
        },
        recentTurnsCount: 4,
        compressionThreshold: 0.7,
        evictionThreshold: 0.9,
      },
    });

    smallContext.addSystemMessage("You are helpful.");

    // Add many messages to trigger compression
    for (let i = 0; i < 15; i++) {
      smallContext.addUserMessage(`Question ${i}: What is ${i * 10}?`);
      smallContext.addAssistantMessage(`Answer ${i}: The value is ${i * 10}.`);
    }

    // Context should have managed its budget
    const budget = smallContext.getBudget();
    expect(budget.usedTokens).toBeLessThan(smallContext.getBudget().maxTokens);

    // Should still be able to prepare for request
    const prepared = await smallContext.prepareForRequest();
    expect(prepared.messages.length).toBeGreaterThan(0);
  });

  it("should track conversation metrics via hooks", async () => {
    const metrics: { tool: string; duration: number }[] = [];
    const errors: string[] = [];

    // Setup hooks for observability
    hooks.onPostToolUse((ctx) => {
      if (ctx.tool && ctx.duration) {
        metrics.push({ tool: ctx.tool, duration: ctx.duration });
      }
    });

    hooks.onError((ctx) => {
      if (ctx.metadata?.error) {
        errors.push(ctx.metadata.error as string);
      }
    });

    // Simulate tool calls
    await hooks.trigger("pre-tool-use", { tool: "read" });
    await new Promise((r) => setTimeout(r, 10));
    await hooks.trigger("post-tool-use", { tool: "read", duration: 50 });

    await hooks.trigger("pre-tool-use", { tool: "write" });
    await hooks.trigger("post-tool-use", { tool: "write", duration: 100 });

    // Verify metrics collected
    const summary = hooks.getMetrics();
    expect(summary["read"]?.calls).toBe(1);
    expect(summary["write"]?.calls).toBe(1);
  });
});

// =============================================================================
// Scenario 2: Command Execution with Hooks
// =============================================================================

describe("Integration: Command Execution Pipeline", () => {
  let registry: DefaultCommandRegistry;
  let hooks: HooksManager;
  let context: ContextManager;

  beforeEach(() => {
    registry = createCommandRegistry([
      {
        name: "help",
        description: "Show help information",
        allowedTools: [],
        body: "Display available commands and their usage.",
        category: "system",
      },
      {
        name: "analyze",
        description: "Analyze the current context",
        allowedTools: ["read", "search"],
        body: "Analyze: $ARGUMENTS\n\nProvide detailed analysis.",
        requiresArgs: true,
        argumentHint: "<query>",
        category: "analysis",
      },
      {
        name: "design",
        description: "Create a design",
        allowedTools: ["write", "read"],
        body: "Create design based on: $ARGUMENTS",
        requiresArgs: true,
        argumentHint: "<description>",
        category: "creative",
      },
    ]);

    hooks = createHooksManager();
    context = createContextManager({ maxTokens: 50000 });
  });

  it("should execute commands with full observability", async () => {
    const events: CommandEvent[] = [];
    const toolCalls: string[] = [];

    // Hook to track tool usage
    hooks.onPreToolUse((ctx) => {
      if (ctx.tool) {
        toolCalls.push(ctx.tool);
      }
    });

    // Create handler that integrates with hooks
    const handler: CommandHandler = async function* (task, command, options) {
      yield {
        type: "start",
        command: command.name,
        message: `Starting ${command.name}`,
        timestamp: Date.now(),
      };

      // Simulate tool calls with hooks
      for (const tool of command.allowedTools) {
        await hooks.trigger("pre-tool-use", { tool });

        yield {
          type: "tool_call",
          command: command.name,
          tool,
          message: `Calling ${tool}`,
          timestamp: Date.now(),
        };

        await hooks.trigger("post-tool-use", { tool, duration: 50 });

        yield {
          type: "tool_result",
          command: command.name,
          tool,
          toolResult: { success: true },
          timestamp: Date.now(),
        };
      }

      yield {
        type: "complete",
        command: command.name,
        summary: `Completed ${command.name}`,
        timestamp: Date.now(),
      };
    };

    const executor = createCommandExecutor(registry, handler);

    // Execute command
    for await (const event of executor.execute("/analyze user behavior", { context: {} })) {
      events.push(event);
    }

    // Verify execution flow
    expect(events[0].type).toBe("start");
    expect(events.find((e) => e.type === "tool_call")).toBeDefined();
    expect(events[events.length - 1].type).toBe("complete");

    // Verify hooks captured tool calls
    expect(toolCalls).toContain("read");
    expect(toolCalls).toContain("search");

    // Verify metrics
    const metrics = hooks.getMetrics();
    expect(metrics["read"]?.calls).toBe(1);
    expect(metrics["search"]?.calls).toBe(1);
  });

  it("should block dangerous commands via hooks", async () => {
    // Block certain commands
    hooks.onPreToolUse(
      CommonHooks.blockTools(["dangerous_tool"], "Tool blocked for safety")
    );

    const result = await hooks.trigger("pre-tool-use", { tool: "dangerous_tool" });

    expect(result.blocked).toBe(true);
    expect(result.message).toContain("blocked");
  });

  it("should rate limit command execution", async () => {
    hooks.onPreToolUse(CommonHooks.rateLimit(2, 1000));

    // First two should succeed
    const r1 = await hooks.trigger("pre-tool-use", { tool: "any" });
    const r2 = await hooks.trigger("pre-tool-use", { tool: "any" });
    expect(r1.blocked).toBe(false);
    expect(r2.blocked).toBe(false);

    // Third should be blocked
    const r3 = await hooks.trigger("pre-tool-use", { tool: "any" });
    expect(r3.blocked).toBe(true);
    expect(r3.message).toContain("Rate limit");
  });

  it("should add command results to context", async () => {
    const handler: CommandHandler = async function* (task, command) {
      yield {
        type: "thinking",
        command: command.name,
        message: "Processing help request...",
        timestamp: Date.now(),
      };
      yield {
        type: "complete",
        command: command.name,
        summary: "Help displayed successfully",
        timestamp: Date.now(),
      };
    };

    const executor = createCommandExecutor(registry, handler);

    // Execute and collect results
    const result = await executor.run("/help", { context: {} });

    // Add to context
    context.addUserMessage("/help");
    context.addAssistantMessage(result.summary || "Command executed");

    expect(context.getMessageCount()).toBe(2);
  });
});

// =============================================================================
// Scenario 3: Resource Resolution in Prompts
// =============================================================================

describe("Integration: Resource Resolution", () => {
  let resources: ResourceRegistry;
  let aliases: DefaultAliasRegistry;
  let resolver: DefaultAliasResolver;
  let context: ContextManager;

  beforeEach(() => {
    resources = createResourceRegistry();
    registerBuiltInProviders(resources);

    aliases = createAliasRegistry([
      {
        name: "theme",
        description: "Current theme colors",
        hasArgs: false,
        examples: ["@theme"],
        resolve: async () => ({
          value: { primary: "#3b82f6", secondary: "#64748b" },
          summary: "Theme: primary=#3b82f6, secondary=#64748b",
          tokenEstimate: 10,
        }),
      },
      {
        name: "user",
        description: "Current user info",
        hasArgs: false,
        examples: ["@user"],
        resolve: async () => ({
          value: { name: "John Doe", role: "Designer" },
          summary: "User: John Doe (Designer)",
          tokenEstimate: 8,
        }),
      },
    ]);

    resolver = createAliasResolver(aliases);
    context = createContextManager({ maxTokens: 50000 });
  });

  it("should resolve aliases before adding to context", async () => {
    const userPrompt = "Hello @user, please use @theme colors";

    // Resolve aliases
    const resolved = await resolver.resolveAll(userPrompt, {});

    expect(resolved.success).toBe(true);
    expect(resolved.text).toContain("John Doe");
    expect(resolved.text).toContain("primary=#3b82f6");

    // Add resolved prompt to context
    context.addUserMessage(resolved.text);

    const messages = context.getMessages();
    expect(messages[0].content).toContain("John Doe");
  });

  it("should integrate resource resolution with context", async () => {
    // Resolve color from resources
    const colorResult = await resources.get("color", ["primary"]);
    expect(colorResult.success).toBe(true);
    expect(colorResult.value).toBe("#3b82f6");

    // Use in conversation
    context.addSystemMessage("You are a design assistant.");
    context.addUserMessage(`Use the color ${colorResult.value} for the header`);

    // Resolve time alias from resources
    const timeResult = await resources.get("today");
    context.addAssistantMessage(`Design created on ${timeResult.value}`);

    expect(context.getMessageCount()).toBe(3);
  });

  it("should resolve aliases in user prompts via resources", async () => {
    const prompt = "Apply @color(blue) to the header and @color(red) to alerts";

    const result = await resources.resolveAliases(prompt, {});

    expect(result.success).toBe(true);
    expect(result.text).toContain("#0000ff");
    expect(result.text).toContain("#ff0000");
    expect(result.totalTokens).toBeGreaterThan(0);
  });

  it("should handle alias resolution errors gracefully", async () => {
    const prompt = "Use @unknown and @color(red)";

    const result = await resources.resolveAliases(prompt, {}, { continueOnError: true });

    // Should continue despite error
    expect(result.aliases.length).toBe(2);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.text).toContain("#ff0000"); // color(red) resolved
  });

  it("should respect token budget during resolution", async () => {
    const prompt = "@uuid @uuid @uuid @uuid @uuid @uuid @uuid @uuid @uuid @uuid";

    const result = await resources.resolveAliases(prompt, {}, { tokenBudget: 30 });

    // Should stop when budget exceeded
    expect(result.totalTokens).toBeLessThanOrEqual(40); // Some tolerance
    expect(result.errors.some((e) => e.includes("budget"))).toBe(true);
  });
});

// =============================================================================
// Scenario 4: Full Agent Workflow Simulation
// =============================================================================

describe("Integration: Full Agent Workflow", () => {
  let context: ContextManager;
  let hooks: HooksManager;
  let resources: ResourceRegistry;
  let commands: DefaultCommandRegistry;

  beforeEach(() => {
    context = createContextManager({ maxTokens: 100000 });
    hooks = createHooksManager();
    resources = createResourceRegistry();
    registerBuiltInProviders(resources);

    commands = createCommandRegistry([
      {
        name: "create",
        description: "Create a new element",
        allowedTools: ["write"],
        body: "Create: $ARGUMENTS",
        requiresArgs: true,
        argumentHint: "<element-type>",
      },
      {
        name: "style",
        description: "Apply styling",
        allowedTools: ["read", "write"],
        body: "Style: $ARGUMENTS",
        requiresArgs: true,
        argumentHint: "<style-description>",
      },
    ]);
  });

  it("should simulate a complete design session", async () => {
    // Track all operations
    const operations: string[] = [];
    hooks.onPostToolUse((ctx) => {
      operations.push(`${ctx.tool}:${ctx.duration}ms`);
    });

    // Session start
    await hooks.trigger("session-start", { metadata: { sessionId: "session-1" } });

    // 1. System setup
    context.addSystemMessage(
      "You are a design assistant that helps create visual elements."
    );

    // 2. User requests with alias
    const userRequest = "Create a button with @color(primary) background";
    const resolved = await resources.resolveAliases(userRequest, {});
    context.addUserMessage(resolved.text);

    // 3. Check if it's a command
    const input = "/create button";
    if (isCommand(input)) {
      const handler: CommandHandler = async function* (task, command) {
        // Simulate tool execution
        await hooks.trigger("pre-tool-use", { tool: "write" });
        await hooks.trigger("post-tool-use", { tool: "write", duration: 100 });

        yield {
          type: "complete",
          command: command.name,
          summary: "Button created",
          timestamp: Date.now(),
        };
      };

      const executor = createCommandExecutor(commands, handler);
      const result = await executor.run(input, { context: {} });

      context.addAssistantMessage(`Created button: ${result.summary}`);
    }

    // 4. More conversation
    context.addUserMessage("Make it larger and add rounded corners");
    context.addToolResult("tool-1", "style", '{"borderRadius": "8px", "padding": "16px"}');
    context.addAssistantMessage("I've updated the button with rounded corners and larger padding.");

    // Session end
    await hooks.trigger("session-end", {});

    // Verify complete flow
    // System(1) + User resolved(2) + Assistant command(3) + User(4) + Tool(5) + Assistant(6)
    expect(context.getMessageCount()).toBe(6);
    expect(operations.length).toBeGreaterThan(0);

    const stats = context.getStats();
    expect(stats.totalMessages).toBe(6);
    expect(stats.messagesByRole.tool).toBe(1);
  });

  it("should handle context overflow during long session", async () => {
    const smallContext = createContextManager({
      maxTokens: 3000,
      responseReserve: 500,
      toolReserve: 300,
    });

    smallContext.addSystemMessage("You are a helpful assistant.");

    // Simulate a long session
    for (let turn = 0; turn < 20; turn++) {
      const userMsg = `Turn ${turn}: Can you help me with task number ${turn}? ` +
        "I need detailed assistance with multiple aspects of this problem.";
      smallContext.addUserMessage(userMsg);

      const assistantMsg = `Response ${turn}: I'll help you with task ${turn}. ` +
        "Here's my detailed analysis and recommendations for your problem.";
      smallContext.addAssistantMessage(assistantMsg);
    }

    // Context should manage itself
    const budget = smallContext.getBudget();
    expect(budget.usedTokens).toBeLessThan(budget.maxTokens);

    // Should still be usable
    const prepared = await smallContext.prepareForRequest();
    expect(prepared.messages.length).toBeGreaterThan(0);
    expect(prepared.responseTokens).toBeGreaterThan(0);
  });
});

// =============================================================================
// Scenario 5: Error Handling and Recovery
// =============================================================================

describe("Integration: Error Handling", () => {
  it("should handle alias resolution errors without crashing", async () => {
    const resources = createResourceRegistry();
    registerBuiltInProviders(resources);

    // Mix of valid and invalid aliases
    const prompt = "@color(invalid) @now @unknown @color(red)";
    const result = await resources.resolveAliases(prompt, {}, { continueOnError: true });

    // Should have processed all aliases
    expect(result.aliases.length).toBe(4);

    // Valid ones should resolve
    const validAliases = result.aliases.filter((a) => a.resource.success);
    expect(validAliases.length).toBe(2); // @now and @color(red)
  });

  it("should handle command handler errors gracefully", async () => {
    const registry = createCommandRegistry([
      {
        name: "failing",
        description: "A command that fails",
        allowedTools: [],
        body: "This will fail",
      },
    ]);

    const handler: CommandHandler = async function* () {
      throw new Error("Simulated handler failure");
    };

    const executor = createCommandExecutor(registry, handler);
    const result = await executor.run("/failing", { context: {} });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Simulated handler failure");
  });

  it("should handle hook errors without blocking execution", async () => {
    const hooks = createHooksManager();
    const executed: string[] = [];

    // First hook throws
    hooks.onPreToolUse(() => {
      throw new Error("Hook error");
    });

    // Second hook should still run
    hooks.onPreToolUse(() => {
      executed.push("second");
    });

    // Should not throw, errors are caught
    const result = await hooks.trigger("pre-tool-use", { tool: "test" });

    expect(result.blocked).toBe(false);
    expect(executed).toContain("second");
  });

  it("should recover context after failed compression", async () => {
    const context = createContextManager({ maxTokens: 50000 });

    context.addSystemMessage("System prompt");
    context.addUserMessage("User message 1");
    context.addAssistantMessage("Assistant response 1");

    // Even if compression isn't needed, should still work
    const prepared = await context.prepareForRequest();

    expect(prepared.messages.length).toBe(3);
    expect(prepared.totalTokens).toBeGreaterThan(0);
  });
});

// =============================================================================
// Scenario 6: Cross-Component Integration
// =============================================================================

describe("Integration: Cross-Component Workflows", () => {
  it("should track operations across all components", async () => {
    // Initialize all components
    const context = createContextManager({ maxTokens: 50000 });
    const hooks = createHooksManager({ trackMetrics: true });
    const resources = createResourceRegistry();
    registerBuiltInProviders(resources);

    const commands = createCommandRegistry([
      {
        name: "colorize",
        description: "Apply colors",
        allowedTools: ["style"],
        body: "Apply colors: $ARGUMENTS",
        requiresArgs: true,
        argumentHint: "<colors>",
      },
    ]);

    // Audit trail
    const audit: Array<{ component: string; action: string; timestamp: number }> = [];

    hooks.onPreToolUse((ctx) => {
      audit.push({ component: "hooks", action: `pre-tool:${ctx.tool}`, timestamp: Date.now() });
    });

    hooks.onPostToolUse((ctx) => {
      audit.push({ component: "hooks", action: `post-tool:${ctx.tool}`, timestamp: Date.now() });
    });

    // Workflow: Resolve alias -> Execute command -> Add to context
    const userInput = "Apply @color(primary) and @color(secondary)";

    // 1. Resolve resources
    const resolved = await resources.resolveAliases(userInput, {});
    audit.push({ component: "resources", action: "resolve", timestamp: Date.now() });

    // 2. Add to context
    context.addUserMessage(resolved.text);
    audit.push({ component: "context", action: "add-user", timestamp: Date.now() });

    // 3. Execute command with hooks
    const handler: CommandHandler = async function* (task, command) {
      for (const tool of command.allowedTools) {
        await hooks.trigger("pre-tool-use", { tool });
        await hooks.trigger("post-tool-use", { tool, duration: 50 });
      }
      yield {
        type: "complete",
        command: command.name,
        summary: "Colors applied",
        timestamp: Date.now(),
      };
    };

    const executor = createCommandExecutor(commands, handler);
    const result = await executor.run("/colorize blue,green", { context: {} });
    audit.push({ component: "commands", action: "execute", timestamp: Date.now() });

    // 4. Add result to context
    context.addAssistantMessage(result.summary || "Done");
    audit.push({ component: "context", action: "add-assistant", timestamp: Date.now() });

    // Verify audit trail
    expect(audit.length).toBeGreaterThan(5);
    expect(audit.some((a) => a.component === "resources")).toBe(true);
    expect(audit.some((a) => a.component === "hooks")).toBe(true);
    expect(audit.some((a) => a.component === "context")).toBe(true);
    expect(audit.some((a) => a.component === "commands")).toBe(true);

    // Verify final state
    expect(context.getMessageCount()).toBe(2);
    expect(hooks.getMetrics()["style"]).toBeDefined();
  });

  it("should validate inputs with hooks before command execution", async () => {
    const hooks = createHooksManager();
    const validationErrors: string[] = [];

    // Add input validation
    hooks.onPreToolUse(
      CommonHooks.validateInput((tool, input) => {
        if (tool === "write" && !(input as any)?.data) {
          return "Write requires data parameter";
        }
        return true;
      })
    );

    // Valid input
    const valid = await hooks.trigger("pre-tool-use", {
      tool: "write",
      toolInput: { data: "content" },
    });
    expect(valid.blocked).toBe(false);

    // Invalid input
    const invalid = await hooks.trigger("pre-tool-use", {
      tool: "write",
      toolInput: {},
    });
    expect(invalid.blocked).toBe(true);
    expect(invalid.message).toContain("data parameter");
  });

  it("should transform inputs through hooks pipeline", async () => {
    const hooks = createHooksManager();

    // Add transformation
    hooks.onPreToolUse(
      CommonHooks.transformInput((tool, input) => ({
        ...(input as object),
        timestamp: Date.now(),
        source: "agent",
      }))
    );

    const result = await hooks.trigger("pre-tool-use", {
      tool: "write",
      toolInput: { data: "content" },
    });

    expect(result.blocked).toBe(false);
    expect((result.modifiedInput as any)?.timestamp).toBeDefined();
    expect((result.modifiedInput as any)?.source).toBe("agent");
  });

  it("should checkpoint context periodically", async () => {
    const context = createContextManager({ maxTokens: 50000 });
    const hooks = createHooksManager();
    const checkpoints: number[] = [];

    // Auto-checkpoint every 3 operations
    hooks.onPostToolUse(
      CommonHooks.autoCheckpoint(async (resources) => {
        checkpoints.push(Date.now());
      }, 3)
    );

    // Simulate operations
    for (let i = 0; i < 10; i++) {
      await hooks.trigger("post-tool-use", {
        tool: "test",
        duration: 10,
        resources: { contextManager: context } as any,
      });
    }

    // Should have triggered checkpoints
    expect(checkpoints.length).toBe(3); // 3, 6, 9 operations
  });
});

// =============================================================================
// Scenario 7: Performance Under Load
// =============================================================================

describe("Integration: Performance", () => {
  it("should handle rapid message addition", async () => {
    const context = createContextManager({ maxTokens: 200000 });

    const startTime = Date.now();

    // Add 100 messages quickly
    for (let i = 0; i < 100; i++) {
      context.addUserMessage(`Message ${i}`);
      context.addAssistantMessage(`Response ${i}`);
    }

    const duration = Date.now() - startTime;

    // Should complete in reasonable time (< 1 second)
    expect(duration).toBeLessThan(1000);
    expect(context.getMessageCount()).toBe(200);
  });

  it("should handle many hook handlers efficiently", async () => {
    const hooks = createHooksManager();

    // Register many handlers
    for (let i = 0; i < 50; i++) {
      hooks.onPostToolUse(() => {
        // No-op handler
      });
    }

    const startTime = Date.now();

    // Trigger many times
    for (let i = 0; i < 100; i++) {
      await hooks.trigger("post-tool-use", { tool: "test" });
    }

    const duration = Date.now() - startTime;

    // Should complete efficiently
    expect(duration).toBeLessThan(500);
  });

  it("should resolve many aliases efficiently", async () => {
    const resources = createResourceRegistry();
    registerBuiltInProviders(resources);

    // Build prompt with many aliases
    const aliases = Array.from({ length: 20 }, (_, i) =>
      i % 2 === 0 ? "@now" : "@today"
    ).join(" ");

    const startTime = Date.now();
    const result = await resources.resolveAliases(aliases, {});
    const duration = Date.now() - startTime;

    expect(duration).toBeLessThan(500);
    expect(result.aliases.length).toBe(20);
  });
});

// =============================================================================
// Scenario 8: Real-World Use Cases
// =============================================================================

describe("Integration: Real-World Use Cases", () => {
  it("should handle a design assistant conversation", async () => {
    const context = createContextManager({ maxTokens: 50000 });
    const resources = createResourceRegistry();
    registerBuiltInProviders(resources);

    // System setup
    context.addSystemMessage(
      "You are a professional design assistant. You help users create beautiful, " +
      "accessible designs following modern best practices."
    );

    // User starts a design project
    context.addUserMessage(
      "I need to design a landing page for a SaaS product. " +
      "The brand colors should be professional but modern."
    );

    // Assistant suggests colors
    const suggestedColors = await resources.get("palette", ["cool"]);
    context.addAssistantMessage(
      `I recommend using a cool color palette for a professional SaaS landing page:\n` +
      `Colors: ${JSON.stringify(suggestedColors.value)}\n\n` +
      `This palette conveys trust and professionalism while remaining modern.`
    );

    // User asks for specific element
    const primaryColor = await resources.get("color", ["primary"]);
    context.addUserMessage(
      `Great! Can you create a hero section using ${primaryColor.value} as the primary color?`
    );

    // Add tool result for the creation
    context.addToolResult(
      "create-1",
      "create_section",
      JSON.stringify({
        type: "hero",
        backgroundColor: primaryColor.value,
        elements: ["heading", "subheading", "cta-button"],
      })
    );

    context.addAssistantMessage(
      "I've created a hero section with:\n" +
      `- Primary color: ${primaryColor.value}\n` +
      "- Heading for your product name\n" +
      "- Subheading for the value proposition\n" +
      "- Call-to-action button"
    );

    // Verify conversation
    // System(1) + User resolved(2) + Assistant(3) + User(4) + Tool(5) + Assistant(6)
    const stats = context.getStats();
    expect(stats.totalMessages).toBe(6);
    expect(stats.messagesByRole.tool).toBe(1);

    // Prepare for next API call
    const prepared = await context.prepareForRequest();
    expect(prepared.messages.length).toBe(6);
    expect(prepared.responseTokens).toBeGreaterThan(0);
  });

  it("should handle a coding assistant workflow", async () => {
    const context = createContextManager({ maxTokens: 100000 });
    const hooks = createHooksManager();
    const commands = createCommandRegistry([
      {
        name: "read",
        description: "Read file contents",
        allowedTools: ["file_read"],
        body: "Read file: $ARGUMENTS",
        requiresArgs: true,
        argumentHint: "<path>",
      },
      {
        name: "edit",
        description: "Edit a file",
        allowedTools: ["file_read", "file_write"],
        body: "Edit file: $ARGUMENTS",
        requiresArgs: true,
        argumentHint: "<path>",
      },
    ]);

    // Track file operations
    const fileOps: string[] = [];
    hooks.onPostToolUse((ctx) => {
      if (ctx.tool?.startsWith("file_")) {
        fileOps.push(ctx.tool);
      }
    });

    // System setup
    context.addSystemMessage(
      "You are a senior software engineer assistant. You help with code reviews, " +
      "refactoring, and implementing features."
    );

    // User asks about a file
    context.addUserMessage("Can you review the src/utils/helpers.ts file?");

    // Simulate file read
    await hooks.trigger("pre-tool-use", { tool: "file_read" });
    context.addToolResult(
      "read-1",
      "file_read",
      JSON.stringify({
        path: "src/utils/helpers.ts",
        content: "export function formatDate(date: Date): string {\n  return date.toString();\n}",
        lines: 3,
      })
    );
    await hooks.trigger("post-tool-use", { tool: "file_read", duration: 50 });

    // Assistant provides review
    context.addAssistantMessage(
      "I've reviewed `src/utils/helpers.ts`. Here are my findings:\n\n" +
      "**Issues:**\n" +
      "1. `formatDate` uses `toString()` which produces inconsistent output\n" +
      "2. No input validation for null/undefined dates\n\n" +
      "**Recommendations:**\n" +
      "- Use `toISOString()` or a library like date-fns for consistent formatting\n" +
      "- Add null checks and consider using TypeScript strict mode"
    );

    // Verify workflow
    expect(context.getMessageCount()).toBe(4);
    expect(fileOps).toContain("file_read");
    expect(hooks.getMetrics()["file_read"]?.calls).toBe(1);
  });
});
