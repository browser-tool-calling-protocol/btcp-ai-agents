import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  // Registry
  DefaultCommandRegistry,
  createCommandRegistry,
  // Executor
  DefaultCommandExecutor,
  createCommandExecutor,
  createSimpleExecutor,
  // Utilities
  isCommand,
  getCommandName,
  getCommandArgs,
} from "./index.js";
import type { CommandDefinition, CommandHandler, CommandEvent } from "./index.js";

// =============================================================================
// Registry Tests
// =============================================================================

describe("DefaultCommandRegistry", () => {
  let registry: DefaultCommandRegistry;

  beforeEach(() => {
    registry = new DefaultCommandRegistry();
  });

  describe("Registration", () => {
    it("should register a command", () => {
      const command: CommandDefinition = {
        name: "help",
        description: "Show help",
        allowedTools: [],
        body: "Display help information",
      };

      registry.register(command);

      expect(registry.has("help")).toBe(true);
      expect(registry.get("help")).toEqual(command);
    });

    it("should normalize names to lowercase", () => {
      registry.register({
        name: "TestCommand",
        description: "Test",
        allowedTools: [],
        body: "Test body",
      });

      expect(registry.has("testcommand")).toBe(true);
      expect(registry.has("TESTCOMMAND")).toBe(true);
    });

    it("should unregister a command", () => {
      registry.register({
        name: "help",
        description: "Help",
        allowedTools: [],
        body: "Help",
      });

      expect(registry.unregister("help")).toBe(true);
      expect(registry.has("help")).toBe(false);
    });

    it("should return false when unregistering non-existent command", () => {
      expect(registry.unregister("nonexistent")).toBe(false);
    });
  });

  describe("Queries", () => {
    beforeEach(() => {
      registry.register({
        name: "help",
        description: "Show help",
        allowedTools: [],
        body: "Help",
        category: "system",
      });
      registry.register({
        name: "analyze",
        description: "Analyze input",
        allowedTools: ["read", "search"],
        body: "Analyze: $ARGUMENTS",
        category: "analysis",
        requiresArgs: true,
        argumentHint: "<query>",
      });
      registry.register({
        name: "debug",
        description: "Debug info",
        allowedTools: [],
        body: "Debug",
      });
    });

    it("should get all names with / prefix", () => {
      const names = registry.getNames();

      expect(names).toContain("/help");
      expect(names).toContain("/analyze");
      expect(names).toContain("/debug");
    });

    it("should get all commands", () => {
      const all = registry.getAll();

      expect(all).toHaveLength(3);
    });

    it("should get commands by category", () => {
      const system = registry.getByCategory("system");
      const analysis = registry.getByCategory("analysis");

      expect(system).toHaveLength(1);
      expect(system[0].name).toBe("help");

      expect(analysis).toHaveLength(1);
      expect(analysis[0].name).toBe("analyze");
    });

    it("should get all categories", () => {
      const categories = registry.getCategories();

      expect(categories).toContain("system");
      expect(categories).toContain("analysis");
    });

    it("should return size", () => {
      expect(registry.size).toBe(3);
    });
  });

  describe("Lifecycle", () => {
    it("should clear all commands", () => {
      registry.register({
        name: "test",
        description: "Test",
        allowedTools: [],
        body: "Test",
      });

      registry.clear();

      expect(registry.size).toBe(0);
    });

    it("should accept initial commands", () => {
      const newRegistry = new DefaultCommandRegistry([
        { name: "a", description: "A", allowedTools: [], body: "A" },
        { name: "b", description: "B", allowedTools: [], body: "B" },
      ]);

      expect(newRegistry.size).toBe(2);
      expect(newRegistry.has("a")).toBe(true);
      expect(newRegistry.has("b")).toBe(true);
    });
  });

  describe("Help Generation", () => {
    beforeEach(() => {
      registry.register({
        name: "help",
        description: "Show help information",
        allowedTools: [],
        body: "Display help",
        category: "system",
        examples: ["/help", "/help analyze"],
      });
      registry.register({
        name: "analyze",
        description: "Analyze the input",
        allowedTools: ["read"],
        body: "Analyze",
        argumentHint: "<query>",
        requiresArgs: true,
      });
    });

    it("should generate help for specific command", () => {
      const help = registry.getHelp("help");

      expect(help).toContain("/help");
      expect(help).toContain("Show help information");
      expect(help).toContain("Allowed tools:");
      expect(help).toContain("Examples:");
    });

    it("should return error for unknown command", () => {
      const help = registry.getHelp("unknown");

      expect(help).toContain("Unknown command");
    });

    it("should generate help for all commands", () => {
      const help = registry.getHelp();

      expect(help).toContain("Available commands");
      expect(help).toContain("/help");
      expect(help).toContain("/analyze");
    });

    it("should strip leading slash from command name", () => {
      const help = registry.getHelp("/help");

      expect(help).toContain("Show help information");
    });
  });

  describe("Markdown Export", () => {
    it("should generate .md content for command", () => {
      const command: CommandDefinition = {
        name: "test",
        description: "Test command",
        allowedTools: [],
        body: "Test body content",
        argumentHint: "<arg>",
      };

      const md = registry.generateCommandMd(command);

      expect(md).toContain("# /test <arg>");
      expect(md).toContain("Test command");
      expect(md).toContain("Test body content");
    });

    it("should export all commands", () => {
      registry.register({
        name: "help",
        description: "Help",
        allowedTools: [],
        body: "Help body",
      });

      const exports = registry.exportCommands();

      expect(exports).toHaveLength(1);
      expect(exports[0].path).toBe(".claude/commands/help.md");
      expect(exports[0].content).toContain("/help");
    });
  });
});

describe("createCommandRegistry", () => {
  it("should create empty registry", () => {
    const registry = createCommandRegistry();
    expect(registry.size).toBe(0);
  });

  it("should create registry with initial commands", () => {
    const registry = createCommandRegistry([
      { name: "test", description: "Test", allowedTools: [], body: "Test" },
    ]);
    expect(registry.size).toBe(1);
  });
});

// =============================================================================
// Executor Tests
// =============================================================================

describe("DefaultCommandExecutor", () => {
  let registry: DefaultCommandRegistry;
  let executor: DefaultCommandExecutor;
  let handler: CommandHandler;

  beforeEach(() => {
    registry = createCommandRegistry([
      {
        name: "help",
        description: "Show help",
        allowedTools: [],
        body: "Display help information",
      },
      {
        name: "analyze",
        description: "Analyze input",
        allowedTools: ["read", "search"],
        body: "Analyze: $ARGUMENTS",
        requiresArgs: true,
        argumentHint: "<query>",
      },
      {
        name: "pattern",
        description: "Test pattern",
        allowedTools: [],
        body: "Pattern test",
        requiresArgs: true,
        argPattern: /^\d+$/,
        argumentHint: "<number>",
      },
    ]);

    handler = async function* (task, command, options) {
      yield {
        type: "thinking",
        command: command.name,
        message: `Processing: ${task}`,
        timestamp: Date.now(),
      };
      yield {
        type: "complete",
        command: command.name,
        summary: `Completed ${command.name}`,
        timestamp: Date.now(),
      };
    };

    executor = createCommandExecutor(registry, handler);
  });

  describe("parse", () => {
    it("should parse valid command without args", () => {
      const parsed = executor.parse("/help");

      expect(parsed.isValid).toBe(true);
      expect(parsed.command).toBe("help");
      expect(parsed.args).toBe("");
      expect(parsed.definition).toBeDefined();
    });

    it("should parse command with args", () => {
      const parsed = executor.parse("/analyze the data");

      expect(parsed.isValid).toBe(true);
      expect(parsed.command).toBe("analyze");
      expect(parsed.args).toBe("the data");
    });

    it("should trim args whitespace", () => {
      const parsed = executor.parse("/analyze   lots of space   ");

      expect(parsed.args).toBe("lots of space");
    });

    it("should reject non-command input", () => {
      const parsed = executor.parse("not a command");

      expect(parsed.isValid).toBe(false);
      expect(parsed.error).toContain("Commands must start with /");
    });

    it("should reject unknown command", () => {
      const parsed = executor.parse("/unknown");

      expect(parsed.isValid).toBe(false);
      expect(parsed.error).toContain("Unknown command");
      expect(parsed.error).toContain("/help");
    });

    it("should reject missing required args", () => {
      const parsed = executor.parse("/analyze");

      expect(parsed.isValid).toBe(false);
      expect(parsed.error).toContain("requires arguments");
      expect(parsed.error).toContain("<query>");
    });

    it("should reject invalid arg pattern", () => {
      const parsed = executor.parse("/pattern abc");

      expect(parsed.isValid).toBe(false);
      expect(parsed.error).toContain("Invalid arguments");
    });

    it("should accept valid arg pattern", () => {
      const parsed = executor.parse("/pattern 123");

      expect(parsed.isValid).toBe(true);
    });
  });

  describe("execute", () => {
    it("should execute valid command", async () => {
      const events: CommandEvent[] = [];

      for await (const event of executor.execute("/help", { context: {} })) {
        events.push(event);
      }

      expect(events.length).toBeGreaterThan(0);
      expect(events[0].type).toBe("start");
      expect(events[events.length - 1].type).toBe("complete");
    });

    it("should emit start event with command info", async () => {
      const events: CommandEvent[] = [];

      for await (const event of executor.execute("/help", { context: {} })) {
        events.push(event);
      }

      const startEvent = events.find((e) => e.type === "start");
      expect(startEvent).toBeDefined();
      expect(startEvent?.command).toBe("help");
      expect(startEvent?.message).toContain("/help");
    });

    it("should include args in start event", async () => {
      const events: CommandEvent[] = [];

      for await (const event of executor.execute("/analyze test query", { context: {} })) {
        events.push(event);
      }

      const startEvent = events.find((e) => e.type === "start");
      expect(startEvent?.message).toContain("test query");
    });

    it("should emit failed event for invalid command", async () => {
      const events: CommandEvent[] = [];

      for await (const event of executor.execute("/unknown", { context: {} })) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("failed");
      expect(events[0].error).toContain("Unknown command");
    });

    it("should handle handler errors", async () => {
      const errorHandler: CommandHandler = async function* () {
        throw new Error("Handler error");
      };

      const errorExecutor = createCommandExecutor(registry, errorHandler);
      const events: CommandEvent[] = [];

      for await (const event of errorExecutor.execute("/help", { context: {} })) {
        events.push(event);
      }

      const failedEvent = events.find((e) => e.type === "failed");
      expect(failedEvent).toBeDefined();
      expect(failedEvent?.error).toContain("Handler error");
    });
  });

  describe("run", () => {
    it("should run command and return result", async () => {
      const result = await executor.run("/help", { context: {} });

      expect(result.success).toBe(true);
      expect(result.command).toBe("help");
      expect(result.args).toBe("");
      expect(result.summary).toBe("Completed help");
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it("should run command with args", async () => {
      const result = await executor.run("/analyze test", { context: {} });

      expect(result.success).toBe(true);
      expect(result.command).toBe("analyze");
      expect(result.args).toBe("test");
    });

    it("should return failure for invalid command", async () => {
      const result = await executor.run("/unknown", { context: {} });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Unknown command");
    });
  });

  describe("isCommand", () => {
    it("should recognize commands", () => {
      expect(executor.isCommand("/help")).toBe(true);
      expect(executor.isCommand("/analyze test")).toBe(true);
      expect(executor.isCommand("  /help  ")).toBe(true);
    });

    it("should reject non-commands", () => {
      expect(executor.isCommand("not a command")).toBe(false);
      expect(executor.isCommand("hello /help")).toBe(false);
    });
  });

  describe("suggest", () => {
    it("should suggest commands for partial input", () => {
      const suggestions = executor.suggest("/he");

      expect(suggestions).toContain("/help");
    });

    it("should return all commands for /", () => {
      const suggestions = executor.suggest("/");

      expect(suggestions).toContain("/help");
      expect(suggestions).toContain("/analyze");
    });

    it("should return all command names for empty input", () => {
      const suggestions = executor.suggest("");

      expect(suggestions.length).toBe(3);
    });
  });
});

describe("createSimpleExecutor", () => {
  it("should create executor with default handler", async () => {
    const registry = createCommandRegistry([
      { name: "test", description: "Test", allowedTools: [], body: "Test body" },
    ]);

    const executor = createSimpleExecutor(registry);
    const result = await executor.run("/test", { context: {} });

    expect(result.success).toBe(true);
    expect(result.summary).toBe("Command /test executed");
  });
});

// =============================================================================
// Utility Functions Tests
// =============================================================================

describe("isCommand", () => {
  it("should recognize commands", () => {
    expect(isCommand("/help")).toBe(true);
    expect(isCommand("/analyze test")).toBe(true);
    expect(isCommand("  /command  ")).toBe(true);
  });

  it("should reject non-commands", () => {
    expect(isCommand("not a command")).toBe(false);
    expect(isCommand("hello /world")).toBe(false);
    expect(isCommand("")).toBe(false);
  });
});

describe("getCommandName", () => {
  it("should extract command name", () => {
    expect(getCommandName("/help")).toBe("help");
    expect(getCommandName("/analyze test")).toBe("analyze");
    expect(getCommandName("  /command  ")).toBe("command");
  });

  it("should return null for non-commands", () => {
    expect(getCommandName("not a command")).toBe(null);
    expect(getCommandName("")).toBe(null);
  });
});

describe("getCommandArgs", () => {
  it("should extract command args", () => {
    expect(getCommandArgs("/help")).toBe("");
    expect(getCommandArgs("/analyze test query")).toBe("test query");
    expect(getCommandArgs("/cmd   multiple   spaces  ")).toBe("multiple   spaces");
  });

  it("should return empty for non-commands", () => {
    expect(getCommandArgs("not a command")).toBe("");
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe("Command System Integration", () => {
  it("should support full workflow", async () => {
    // Create registry with commands
    const registry = createCommandRegistry([
      {
        name: "greet",
        description: "Greet the user",
        allowedTools: [],
        body: "Say hello to $ARGUMENTS",
        requiresArgs: true,
        argumentHint: "<name>",
        category: "social",
      },
      {
        name: "status",
        description: "Show status",
        allowedTools: ["read"],
        body: "Display current status",
        category: "system",
      },
    ]);

    // Create handler that tracks tool usage
    const toolCalls: string[] = [];
    const handler: CommandHandler = async function* (task, command, options) {
      yield {
        type: "thinking",
        command: command.name,
        message: "Processing...",
        timestamp: Date.now(),
      };

      // Simulate tool calls based on allowed tools
      for (const tool of command.allowedTools) {
        toolCalls.push(tool);
        yield {
          type: "tool_call",
          command: command.name,
          tool,
          message: `Calling ${tool}`,
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

    // Execute greet command
    const greetResult = await executor.run("/greet World", { context: {} });
    expect(greetResult.success).toBe(true);

    // Execute status command
    const statusResult = await executor.run("/status", { context: {} });
    expect(statusResult.success).toBe(true);
    expect(toolCalls).toContain("read");

    // Get help
    const help = registry.getHelp();
    expect(help).toContain("social");
    expect(help).toContain("system");
  });

  it("should handle typed tool names", async () => {
    type MyTools = "read" | "write" | "search";

    const registry = createCommandRegistry<MyTools>([
      {
        name: "analyze",
        description: "Analyze",
        allowedTools: ["read", "search"],
        body: "Analyze",
      },
    ]);

    const handler: CommandHandler<unknown, MyTools> = async function* (task, command) {
      // Type-safe access to allowed tools
      for (const tool of command.allowedTools) {
        yield {
          type: "tool_call",
          command: command.name,
          tool, // Type is MyTools
          timestamp: Date.now(),
        };
      }
      yield {
        type: "complete",
        command: command.name,
        summary: "Done",
        timestamp: Date.now(),
      };
    };

    const executor = createCommandExecutor(registry, handler);
    const result = await executor.run("/analyze", { context: {} });

    expect(result.success).toBe(true);
  });
});
