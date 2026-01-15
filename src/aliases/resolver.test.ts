import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  // Registry
  DefaultAliasRegistry,
  createAliasRegistry,
  CommonAliases,
  createRegistryWithCommonAliases,
  // Resolver
  DefaultAliasResolver,
  createAliasResolver,
  // Utilities
  parseAlias,
  extractAliases,
  containsAliases,
  validateAliases,
  getAliasesInText,
  suggestAliases,
  estimateTokens,
} from "./index.js";
import type { AliasDefinition, ResolvedData } from "./types.js";

// =============================================================================
// Registry Tests
// =============================================================================

describe("DefaultAliasRegistry", () => {
  let registry: DefaultAliasRegistry;

  beforeEach(() => {
    registry = new DefaultAliasRegistry();
  });

  describe("Registration", () => {
    it("should register an alias", () => {
      const alias: AliasDefinition = {
        name: "test",
        description: "Test alias",
        hasArgs: false,
        examples: ["@test"],
      };

      registry.register(alias);

      expect(registry.has("test")).toBe(true);
      expect(registry.get("test")).toEqual(alias);
    });

    it("should normalize names to lowercase", () => {
      registry.register({
        name: "TestAlias",
        description: "Test",
        hasArgs: false,
        examples: [],
      });

      expect(registry.has("testalias")).toBe(true);
      expect(registry.has("TESTALIAS")).toBe(true);
    });

    it("should unregister an alias", () => {
      registry.register({
        name: "test",
        description: "Test",
        hasArgs: false,
        examples: [],
      });

      expect(registry.unregister("test")).toBe(true);
      expect(registry.has("test")).toBe(false);
    });

    it("should return false when unregistering non-existent alias", () => {
      expect(registry.unregister("nonexistent")).toBe(false);
    });
  });

  describe("Queries", () => {
    beforeEach(() => {
      registry.register({
        name: "file",
        description: "File contents",
        hasArgs: true,
        argDescription: "<path>",
        examples: ["@file(README.md)"],
        category: "io",
      });
      registry.register({
        name: "user",
        description: "Current user",
        hasArgs: false,
        examples: ["@user"],
        category: "context",
      });
      registry.register({
        name: "debug",
        description: "Debug info",
        hasArgs: false,
        examples: ["@debug"],
      });
    });

    it("should get all names with @ prefix", () => {
      const names = registry.getNames();
      expect(names).toContain("@file");
      expect(names).toContain("@user");
      expect(names).toContain("@debug");
    });

    it("should get all aliases", () => {
      const all = registry.getAll();
      expect(all).toHaveLength(3);
    });

    it("should get aliases by category", () => {
      const io = registry.getByCategory("io");
      expect(io).toHaveLength(1);
      expect(io[0].name).toBe("file");

      const context = registry.getByCategory("context");
      expect(context).toHaveLength(1);
      expect(context[0].name).toBe("user");
    });

    it("should get all categories", () => {
      const categories = registry.getCategories();
      expect(categories).toContain("io");
      expect(categories).toContain("context");
    });

    it("should return size", () => {
      expect(registry.size).toBe(3);
    });
  });

  describe("Lifecycle", () => {
    it("should clear all aliases", () => {
      registry.register({
        name: "test",
        description: "Test",
        hasArgs: false,
        examples: [],
      });

      registry.clear();

      expect(registry.size).toBe(0);
    });

    it("should accept initial aliases", () => {
      const newRegistry = new DefaultAliasRegistry([
        { name: "a", description: "A", hasArgs: false, examples: [] },
        { name: "b", description: "B", hasArgs: false, examples: [] },
      ]);

      expect(newRegistry.size).toBe(2);
      expect(newRegistry.has("a")).toBe(true);
      expect(newRegistry.has("b")).toBe(true);
    });
  });

  describe("Help Generation", () => {
    beforeEach(() => {
      registry.register({
        name: "file",
        description: "Read file contents",
        hasArgs: true,
        argDescription: "<path>",
        examples: ["@file(README.md)", "@file(src/index.ts)"],
        category: "io",
      });
    });

    it("should generate help for specific alias", () => {
      const help = registry.getHelp("file");

      expect(help).toContain("@file");
      expect(help).toContain("<path>");
      expect(help).toContain("Read file contents");
      expect(help).toContain("Examples:");
      expect(help).toContain("@file(README.md)");
    });

    it("should return error for unknown alias", () => {
      const help = registry.getHelp("unknown");

      expect(help).toContain("Unknown alias");
      expect(help).toContain("@file");
    });

    it("should generate help for all aliases", () => {
      const help = registry.getHelp();

      expect(help).toContain("Available aliases");
      expect(help).toContain("@file");
    });
  });
});

describe("createAliasRegistry", () => {
  it("should create empty registry", () => {
    const registry = createAliasRegistry();
    expect(registry.size).toBe(0);
  });

  it("should create registry with initial aliases", () => {
    const registry = createAliasRegistry([
      { name: "test", description: "Test", hasArgs: false, examples: [] },
    ]);
    expect(registry.size).toBe(1);
  });
});

describe("createRegistryWithCommonAliases", () => {
  it("should include common aliases", () => {
    const registry = createRegistryWithCommonAliases();

    expect(registry.has("timestamp")).toBe(true);
    expect(registry.has("date")).toBe(true);
    expect(registry.has("time")).toBe(true);
    expect(registry.has("env")).toBe(true);
    expect(registry.has("uuid")).toBe(true);
  });

  it("should include custom aliases", () => {
    const registry = createRegistryWithCommonAliases([
      { name: "custom", description: "Custom", hasArgs: false, examples: [] },
    ]);

    expect(registry.has("custom")).toBe(true);
    expect(registry.has("timestamp")).toBe(true);
  });
});

describe("CommonAliases", () => {
  it("should define timestamp alias", () => {
    expect(CommonAliases.timestamp.name).toBe("timestamp");
    expect(CommonAliases.timestamp.hasArgs).toBe(false);
  });

  it("should define env alias with args", () => {
    expect(CommonAliases.env.name).toBe("env");
    expect(CommonAliases.env.hasArgs).toBe(true);
    expect(CommonAliases.env.argPattern).toBeDefined();
  });
});

// =============================================================================
// Parse Functions Tests
// =============================================================================

describe("parseAlias", () => {
  describe("Syntax Parsing (no registry)", () => {
    it("should parse simple alias", () => {
      const result = parseAlias("@user");

      expect(result.isValid).toBe(true);
      expect(result.name).toBe("user");
      expect(result.args).toEqual([]);
      expect(result.rawArgs).toBe("");
    });

    it("should parse alias with single argument", () => {
      const result = parseAlias("@file(README.md)");

      expect(result.isValid).toBe(true);
      expect(result.name).toBe("file");
      expect(result.args).toEqual(["README.md"]);
      expect(result.rawArgs).toBe("README.md");
    });

    it("should parse alias with multiple arguments", () => {
      const result = parseAlias("@search(keyword, limit)");

      expect(result.isValid).toBe(true);
      expect(result.name).toBe("search");
      expect(result.args).toEqual(["keyword", "limit"]);
    });

    it("should trim argument whitespace", () => {
      const result = parseAlias("@test(  arg1  ,  arg2  )");

      expect(result.args).toEqual(["arg1", "arg2"]);
    });

    it("should return invalid for non-alias", () => {
      const result = parseAlias("not an alias");

      expect(result.isValid).toBe(false);
      expect(result.error).toContain("Invalid alias format");
    });
  });

  describe("Validation with Registry", () => {
    let registry: DefaultAliasRegistry;

    beforeEach(() => {
      registry = createAliasRegistry([
        {
          name: "file",
          description: "File contents",
          hasArgs: true,
          argPattern: /^.+$/,
          argDescription: "<path>",
          examples: [],
        },
        {
          name: "user",
          description: "Current user",
          hasArgs: false,
          examples: [],
        },
      ]);
    });

    it("should validate known alias", () => {
      const result = parseAlias("@user", registry);

      expect(result.isValid).toBe(true);
      expect(result.definition).toBeDefined();
    });

    it("should reject unknown alias", () => {
      const result = parseAlias("@unknown", registry);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain("Unknown alias");
      expect(result.error).toContain("@file");
    });

    it("should require args when defined", () => {
      const result = parseAlias("@file", registry);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain("requires arguments");
    });

    it("should reject args when not allowed", () => {
      const result = parseAlias("@user(unexpected)", registry);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain("does not accept arguments");
    });
  });
});

describe("extractAliases", () => {
  it("should extract multiple aliases from text", () => {
    const text = "Hello @user, please check @file(README.md) and @file(package.json)";
    const aliases = extractAliases(text);

    expect(aliases).toHaveLength(3);
    expect(aliases.map((a) => a.name)).toEqual(["user", "file", "file"]);
  });

  it("should return empty array for text without aliases", () => {
    const aliases = extractAliases("No aliases here");

    expect(aliases).toEqual([]);
  });

  it("should not match email addresses", () => {
    const aliases = extractAliases("Contact user@example.com for help");

    expect(aliases).toEqual([]);
  });

  it("should handle aliases at various positions", () => {
    const text = "@start middle @end";
    const aliases = extractAliases(text);

    expect(aliases).toHaveLength(2);
  });
});

describe("containsAliases", () => {
  it("should return true for text with aliases", () => {
    expect(containsAliases("Hello @user")).toBe(true);
    expect(containsAliases("@file(test.ts)")).toBe(true);
  });

  it("should return false for text without aliases", () => {
    expect(containsAliases("No aliases")).toBe(false);
    expect(containsAliases("email@example.com")).toBe(false);
  });
});

describe("getAliasesInText", () => {
  it("should return unique alias names", () => {
    const text = "@file(a.ts) @file(b.ts) @user";
    const names = getAliasesInText(text);

    expect(names).toContain("@file");
    expect(names).toContain("@user");
    expect(names).toHaveLength(2); // Unique
  });
});

describe("validateAliases", () => {
  it("should validate all aliases in text", () => {
    const registry = createAliasRegistry([
      { name: "valid", description: "Valid", hasArgs: false, examples: [] },
    ]);

    const result = validateAliases("Use @valid and @invalid", registry);

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.aliases).toHaveLength(2);
  });

  it("should return valid for text without errors", () => {
    const registry = createAliasRegistry([
      { name: "test", description: "Test", hasArgs: false, examples: [] },
    ]);

    const result = validateAliases("Just @test", registry);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

describe("suggestAliases", () => {
  it("should suggest matching aliases", () => {
    const registry = createAliasRegistry([
      { name: "file", description: "File", hasArgs: true, argDescription: "<path>", examples: [] },
      { name: "filter", description: "Filter", hasArgs: true, argDescription: "<query>", examples: [] },
      { name: "user", description: "User", hasArgs: false, examples: [] },
    ]);

    const suggestions = suggestAliases("@fi", registry);

    expect(suggestions).toContain("@file(<path>)");
    expect(suggestions).toContain("@filter(<query>)");
    expect(suggestions).not.toContain("@user");
  });

  it("should return empty for non-alias input", () => {
    const registry = createAliasRegistry();
    const suggestions = suggestAliases("not an alias", registry);

    expect(suggestions).toEqual([]);
  });

  it("should suggest all for @ only", () => {
    const registry = createAliasRegistry([
      { name: "a", description: "A", hasArgs: false, examples: [] },
      { name: "b", description: "B", hasArgs: false, examples: [] },
    ]);

    const suggestions = suggestAliases("@", registry);

    expect(suggestions).toHaveLength(2);
  });
});

describe("estimateTokens", () => {
  it("should estimate tokens for data", () => {
    const tokens = estimateTokens({ key: "value", array: [1, 2, 3] });

    expect(tokens).toBeGreaterThan(0);
  });

  it("should estimate more tokens for larger data", () => {
    const small = estimateTokens({ a: 1 });
    const large = estimateTokens({ a: 1, b: 2, c: 3, d: "long string value" });

    expect(large).toBeGreaterThan(small);
  });
});

// =============================================================================
// Resolver Tests
// =============================================================================

describe("DefaultAliasResolver", () => {
  let registry: DefaultAliasRegistry;
  let resolver: DefaultAliasResolver;

  beforeEach(() => {
    registry = createAliasRegistry([
      {
        name: "user",
        description: "Current user",
        hasArgs: false,
        examples: [],
        resolve: async () => ({
          value: "John Doe",
          summary: "User: John Doe",
          tokenEstimate: 5,
        }),
      },
      {
        name: "file",
        description: "File contents",
        hasArgs: true,
        argDescription: "<path>",
        examples: [],
        resolve: async (args) => ({
          value: `Contents of ${args[0]}`,
          summary: `File: ${args[0]}`,
          tokenEstimate: 20,
        }),
      },
      {
        name: "slow",
        description: "Slow operation",
        hasArgs: false,
        examples: [],
        resolve: async () => {
          await new Promise((r) => setTimeout(r, 100));
          return {
            value: "done",
            summary: "Slow done",
            tokenEstimate: 2,
          };
        },
      },
      {
        name: "failing",
        description: "Always fails",
        hasArgs: false,
        examples: [],
        resolve: async () => {
          throw new Error("Resolution failed");
        },
      },
      {
        name: "noresolver",
        description: "No resolver",
        hasArgs: false,
        examples: [],
        // No resolve function
      },
    ]);

    resolver = createAliasResolver(registry);
  });

  describe("parse", () => {
    it("should parse aliases using registry", () => {
      const parsed = resolver.parse("@user");

      expect(parsed.isValid).toBe(true);
      expect(parsed.definition).toBeDefined();
    });
  });

  describe("extract", () => {
    it("should extract aliases from text", () => {
      const aliases = resolver.extract("Hello @user and @file(test.ts)");

      expect(aliases).toHaveLength(2);
    });
  });

  describe("containsAliases", () => {
    it("should check for aliases", () => {
      expect(resolver.containsAliases("@user")).toBe(true);
      expect(resolver.containsAliases("no alias")).toBe(false);
    });
  });

  describe("validate", () => {
    it("should validate text", () => {
      const result = resolver.validate("@user @unknown");

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
    });
  });

  describe("suggest", () => {
    it("should suggest aliases", () => {
      const suggestions = resolver.suggest("@us");

      expect(suggestions).toContain("@user");
    });
  });

  describe("resolve", () => {
    it("should resolve valid alias", async () => {
      const parsed = resolver.parse("@user");
      const resolved = await resolver.resolve(parsed, {});

      expect(resolved.success).toBe(true);
      expect(resolved.data?.value).toBe("John Doe");
      expect(resolved.summary).toBe("User: John Doe");
    });

    it("should resolve alias with args", async () => {
      const parsed = resolver.parse("@file(README.md)");
      const resolved = await resolver.resolve(parsed, {});

      expect(resolved.success).toBe(true);
      expect(resolved.data?.value).toBe("Contents of README.md");
    });

    it("should handle resolution errors", async () => {
      const parsed = resolver.parse("@failing");
      const resolved = await resolver.resolve(parsed, {});

      expect(resolved.success).toBe(false);
      expect(resolved.error).toContain("Resolution failed");
    });

    it("should handle missing resolver", async () => {
      const parsed = resolver.parse("@noresolver");
      const resolved = await resolver.resolve(parsed, {});

      expect(resolved.success).toBe(false);
      expect(resolved.error).toContain("no resolver configured");
    });

    it("should handle invalid alias", async () => {
      const parsed = resolver.parse("@unknown");
      const resolved = await resolver.resolve(parsed, {});

      expect(resolved.success).toBe(false);
      expect(resolved.error).toContain("Unknown alias");
    });

    it("should respect timeout option", async () => {
      const parsed = resolver.parse("@slow");
      const resolved = await resolver.resolve(parsed, {}, { timeout: 10 });

      expect(resolved.success).toBe(false);
      expect(resolved.error).toBe("Timeout");
    });
  });

  describe("resolveAll", () => {
    it("should resolve all aliases in text", async () => {
      const result = await resolver.resolveAll("Hello @user, check @file(test.ts)", {});

      expect(result.success).toBe(true);
      expect(result.aliases).toHaveLength(2);
      expect(result.totalTokens).toBeGreaterThan(0);
    });

    it("should return original text when no aliases", async () => {
      const result = await resolver.resolveAll("No aliases here", {});

      expect(result.success).toBe(true);
      expect(result.text).toBe("No aliases here");
      expect(result.aliases).toHaveLength(0);
    });

    it("should replace aliases with summaries", async () => {
      const result = await resolver.resolveAll("User is @user", {});

      expect(result.text).toContain("[User: John Doe]");
    });

    it("should continue on error by default", async () => {
      const result = await resolver.resolveAll("@failing and @user", {});

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.aliases).toHaveLength(2);
    });

    it("should stop on error when configured", async () => {
      const result = await resolver.resolveAll(
        "@failing and @user",
        {},
        { continueOnError: false }
      );

      expect(result.success).toBe(false);
      expect(result.aliases).toHaveLength(1); // Only @failing
    });

    it("should respect token budget", async () => {
      const result = await resolver.resolveAll(
        "@user @user @user @user @user",
        {},
        { tokenBudget: 10 }
      );

      // Should stop resolving when budget exceeded
      expect(result.totalTokens).toBeLessThanOrEqual(15); // Some tolerance
    });
  });
});

describe("createAliasResolver", () => {
  it("should create resolver with registry", () => {
    const registry = createAliasRegistry();
    const resolver = createAliasResolver(registry);

    expect(resolver).toBeInstanceOf(DefaultAliasResolver);
  });

  it("should accept default options", async () => {
    const registry = createAliasRegistry([
      {
        name: "slow",
        description: "Slow",
        hasArgs: false,
        examples: [],
        resolve: async () => {
          await new Promise((r) => setTimeout(r, 100));
          return { value: "done", summary: "Done", tokenEstimate: 1 };
        },
      },
    ]);

    const resolver = createAliasResolver(registry, { timeout: 10 });
    const parsed = resolver.parse("@slow");
    const result = await resolver.resolve(parsed, {});

    expect(result.success).toBe(false);
    expect(result.error).toBe("Timeout");
  });
});
