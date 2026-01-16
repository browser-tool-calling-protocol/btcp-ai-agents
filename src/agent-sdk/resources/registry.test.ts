import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  // Registry
  ResourceRegistry,
  createResourceRegistry,
  defaultRegistry,
  parseAlias,
  extractAliases,
  // Providers
  colorProvider,
  timeProvider,
  configProvider,
  envProvider,
  uuidProvider,
  builtInProviders,
  registerBuiltInProviders,
  getColorNames,
  getPaletteNames,
} from "./index.js";
import type { ResourceProvider, ResourceDefinition } from "./types.js";

// =============================================================================
// Resource Registry Tests
// =============================================================================

describe("ResourceRegistry", () => {
  let registry: ResourceRegistry;

  beforeEach(() => {
    registry = new ResourceRegistry();
  });

  describe("Registration", () => {
    it("should register a provider", () => {
      registry.register(colorProvider);

      expect(registry.has("color")).toBe(true);
      expect(registry.has("palette")).toBe(true);
    });

    it("should register multiple providers", () => {
      registerBuiltInProviders(registry);

      expect(registry.has("color")).toBe(true);
      expect(registry.has("now")).toBe(true);
      expect(registry.has("config")).toBe(true);
      expect(registry.has("env")).toBe(true);
      expect(registry.has("uuid")).toBe(true);
    });

    it("should unregister a provider", () => {
      registry.register(colorProvider);
      registry.unregister("color");

      expect(registry.has("color")).toBe(false);
      expect(registry.has("palette")).toBe(false);
    });

    it("should handle unregistering non-existent provider", () => {
      registry.unregister("nonexistent"); // Should not throw
      expect(registry.size).toBe(0);
    });
  });

  describe("Resource Access", () => {
    beforeEach(() => {
      registerBuiltInProviders(registry);
    });

    it("should get a color resource", async () => {
      const result = await registry.get("color", ["red"]);

      expect(result.success).toBe(true);
      expect(result.value).toBe("#ff0000");
    });

    it("should get a palette resource", async () => {
      const result = await registry.get("palette", ["ocean"]);

      expect(result.success).toBe(true);
      expect(Array.isArray(result.value)).toBe(true);
      expect((result.value as string[]).length).toBe(5);
    });

    it("should get time resources", async () => {
      const now = await registry.get("now");
      const today = await registry.get("today");
      const time = await registry.get("time");

      expect(now.success).toBe(true);
      expect(typeof now.value).toBe("number");

      expect(today.success).toBe(true);
      expect(today.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      expect(time.success).toBe(true);
      expect(time.value).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    });

    it("should get config resource", async () => {
      const result = await registry.get("config", ["theme"]);

      expect(result.success).toBe(true);
      expect(result.value).toBe("light");
    });

    it("should get config with context override", async () => {
      const result = await registry.get("config", ["theme"], {
        config: { theme: "dark" },
      });

      expect(result.success).toBe(true);
      expect(result.value).toBe("dark");
    });

    it("should generate uuid resource", async () => {
      const result = await registry.get("uuid");

      expect(result.success).toBe(true);
      expect(result.value).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });

    it("should return error for unknown resource", async () => {
      const result = await registry.get("unknown");

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("should return error for unknown color", async () => {
      const result = await registry.get("color", ["unknowncolor"]);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Unknown color");
    });
  });

  describe("Queries", () => {
    beforeEach(() => {
      registerBuiltInProviders(registry);
    });

    it("should get resource definition", () => {
      const def = registry.getDefinition("color");

      expect(def).toBeDefined();
      expect(def?.name).toBe("color");
      expect(def?.hasArgs).toBe(true);
    });

    it("should get all resource names with @ prefix", () => {
      const names = registry.getResourceNames();

      expect(names).toContain("@color");
      expect(names).toContain("@now");
      expect(names).toContain("@uuid");
    });

    it("should get all definitions", () => {
      const definitions = registry.getDefinitions();

      expect(definitions.length).toBeGreaterThan(5);
    });

    it("should get definitions by category", () => {
      const styling = registry.getDefinitionsByCategory("styling");
      const time = registry.getDefinitionsByCategory("time");

      expect(styling.length).toBeGreaterThan(0);
      expect(time.length).toBeGreaterThan(0);
    });

    it("should get all categories", () => {
      const categories = registry.getCategories();

      expect(categories).toContain("styling");
      expect(categories).toContain("time");
      expect(categories).toContain("system");
      expect(categories).toContain("utility");
    });

    it("should return size", () => {
      expect(registry.size).toBeGreaterThan(5);
    });
  });

  describe("Validation", () => {
    beforeEach(() => {
      registerBuiltInProviders(registry);
    });

    it("should validate valid resource", () => {
      const result = registry.validate("color", ["red"]);

      expect(result.valid).toBe(true);
    });

    it("should reject unknown resource", () => {
      const result = registry.validate("unknown", []);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("Unknown resource");
    });

    it("should reject missing required args", () => {
      const result = registry.validate("color", []);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("requires arguments");
    });

    it("should reject unexpected args", () => {
      const result = registry.validate("now", ["unexpected"]);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("does not accept arguments");
    });
  });

  describe("Suggestions", () => {
    beforeEach(() => {
      registerBuiltInProviders(registry);
    });

    it("should suggest matching resources", () => {
      const suggestions = registry.suggest("@co");

      expect(suggestions).toContain("@color(<color-name|#hex>)");
      expect(suggestions).toContain("@config(<config-key>)");
    });

    it("should return empty for non-alias input", () => {
      const suggestions = registry.suggest("not an alias");

      expect(suggestions).toEqual([]);
    });

    it("should suggest all for @ only", () => {
      const suggestions = registry.suggest("@");

      expect(suggestions.length).toBeGreaterThan(5);
    });
  });

  describe("Help Generation", () => {
    beforeEach(() => {
      registerBuiltInProviders(registry);
    });

    it("should generate help for specific resource", () => {
      const help = registry.getHelp("color");

      expect(help).toContain("color");
      expect(help).toContain("Examples:");
      expect(help).toContain("@color(red)");
    });

    it("should return error for unknown resource", () => {
      const help = registry.getHelp("unknown");

      expect(help).toContain("Unknown resource");
    });

    it("should generate help for all resources", () => {
      const help = registry.getHelp();

      expect(help).toContain("Available resources");
      expect(help).toContain("styling");
      expect(help).toContain("time");
    });
  });

  describe("Alias Resolution", () => {
    beforeEach(() => {
      registerBuiltInProviders(registry);
    });

    it("should detect aliases in text", () => {
      expect(registry.containsAliases("Hello @user")).toBe(true);
      expect(registry.containsAliases("No alias here")).toBe(false);
      expect(registry.containsAliases("email@example.com")).toBe(false);
    });

    it("should resolve aliases in text", async () => {
      const result = await registry.resolveAliases(
        "Use @color(red) for the header",
        {}
      );

      expect(result.success).toBe(true);
      expect(result.text).toContain("red");
      expect(result.text).toContain("#ff0000");
      expect(result.aliases).toHaveLength(1);
    });

    it("should resolve multiple aliases", async () => {
      const result = await registry.resolveAliases(
        "@color(red) and @color(blue)",
        {}
      );

      expect(result.success).toBe(true);
      expect(result.aliases).toHaveLength(2);
    });

    it("should return original text when no aliases", async () => {
      const result = await registry.resolveAliases("No aliases here", {});

      expect(result.success).toBe(true);
      expect(result.text).toBe("No aliases here");
      expect(result.aliases).toHaveLength(0);
    });

    it("should handle errors in resolution", async () => {
      const result = await registry.resolveAliases(
        "@color(unknowncolor)",
        {}
      );

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("should continue on error by default", async () => {
      const result = await registry.resolveAliases(
        "@unknown and @color(red)",
        {},
        { continueOnError: true }
      );

      expect(result.aliases).toHaveLength(2);
    });

    it("should stop on error when configured", async () => {
      const result = await registry.resolveAliases(
        "@unknown and @color(red)",
        {},
        { continueOnError: false }
      );

      // Should stop after first error
      expect(result.aliases).toHaveLength(1);
    });

    it("should respect token budget", async () => {
      const result = await registry.resolveAliases(
        "@uuid @uuid @uuid @uuid @uuid",
        {},
        { tokenBudget: 20 }
      );

      // Should stop when budget exceeded
      expect(result.totalTokens).toBeLessThanOrEqual(30); // Some tolerance
    });
  });

  describe("Alias Validation", () => {
    beforeEach(() => {
      registerBuiltInProviders(registry);
    });

    it("should validate aliases in text", () => {
      const result = registry.validateAliases("@color(red) is valid");

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should detect invalid aliases", () => {
      const result = registry.validateAliases("@unknown is invalid");

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe("Lifecycle", () => {
    it("should clear all providers", () => {
      registerBuiltInProviders(registry);
      registry.clear();

      expect(registry.size).toBe(0);
    });
  });
});

describe("createResourceRegistry", () => {
  it("should create empty registry", () => {
    const registry = createResourceRegistry();
    expect(registry.size).toBe(0);
  });
});

describe("defaultRegistry", () => {
  it("should be a ResourceRegistry instance", () => {
    expect(defaultRegistry).toBeInstanceOf(ResourceRegistry);
  });
});

// =============================================================================
// Alias Parsing Tests
// =============================================================================

describe("parseAlias", () => {
  let definitions: Map<string, ResourceDefinition>;

  beforeEach(() => {
    definitions = new Map();
    definitions.set("color", {
      name: "color",
      description: "Color",
      hasArgs: true,
      argDescription: "<name>",
      examples: [],
    });
    definitions.set("now", {
      name: "now",
      description: "Time",
      hasArgs: false,
      examples: [],
    });
  });

  it("should parse simple alias", () => {
    const result = parseAlias("@now", definitions);

    expect(result.isValid).toBe(true);
    expect(result.name).toBe("now");
    expect(result.args).toEqual([]);
  });

  it("should parse alias with args", () => {
    const result = parseAlias("@color(red)", definitions);

    expect(result.isValid).toBe(true);
    expect(result.name).toBe("color");
    expect(result.args).toEqual(["red"]);
  });

  it("should reject unknown alias", () => {
    const result = parseAlias("@unknown", definitions);

    expect(result.isValid).toBe(false);
    expect(result.error).toContain("Unknown resource");
  });

  it("should reject missing required args", () => {
    const result = parseAlias("@color", definitions);

    expect(result.isValid).toBe(false);
    expect(result.error).toContain("requires arguments");
  });

  it("should reject unexpected args", () => {
    const result = parseAlias("@now(unexpected)", definitions);

    expect(result.isValid).toBe(false);
    expect(result.error).toContain("does not accept arguments");
  });

  it("should return invalid for non-alias", () => {
    const result = parseAlias("not an alias", definitions);

    expect(result.isValid).toBe(false);
    expect(result.error).toContain("Invalid alias format");
  });
});

describe("extractAliases", () => {
  let definitions: Map<string, ResourceDefinition>;

  beforeEach(() => {
    definitions = new Map();
    definitions.set("color", {
      name: "color",
      description: "Color",
      hasArgs: true,
      argDescription: "<name>",
      examples: [],
    });
    definitions.set("user", {
      name: "user",
      description: "User",
      hasArgs: false,
      examples: [],
    });
  });

  it("should extract multiple aliases", () => {
    const text = "Hello @user, use @color(red)";
    const aliases = extractAliases(text, definitions);

    expect(aliases).toHaveLength(2);
    expect(aliases[0].name).toBe("user");
    expect(aliases[1].name).toBe("color");
  });

  it("should not match email addresses", () => {
    const text = "Contact user@example.com";
    const aliases = extractAliases(text, definitions);

    expect(aliases).toHaveLength(0);
  });

  it("should return empty for no aliases", () => {
    const aliases = extractAliases("No aliases", definitions);

    expect(aliases).toHaveLength(0);
  });
});

// =============================================================================
// Provider Tests
// =============================================================================

describe("colorProvider", () => {
  it("should get named colors", () => {
    const result = colorProvider.get("color", ["red"], {});

    expect(result.success).toBe(true);
    expect(result.value).toBe("#ff0000");
  });

  it("should pass through hex colors", () => {
    const result = colorProvider.get("color", ["#ff5733"], {});

    expect(result.success).toBe(true);
    expect(result.value).toBe("#ff5733");
  });

  it("should get palettes", () => {
    const result = colorProvider.get("palette", ["ocean"], {});

    expect(result.success).toBe(true);
    expect(Array.isArray(result.value)).toBe(true);
  });

  it("should handle unknown colors", () => {
    const result = colorProvider.get("color", ["unknowncolor"], {});

    expect(result.success).toBe(false);
    expect(result.error).toContain("Unknown color");
  });

  it("should handle unknown palettes", () => {
    const result = colorProvider.get("palette", ["unknownpalette"], {});

    expect(result.success).toBe(false);
    expect(result.error).toContain("Unknown palette");
  });

  it("should validate colors", () => {
    expect(colorProvider.validate!("color", ["red"])).toEqual({ valid: true });
    expect(colorProvider.validate!("color", ["unknown"]).valid).toBe(false);
  });

  it("should suggest colors", () => {
    const suggestions = colorProvider.suggest!("color", "re");

    expect(suggestions).toContain("red");
  });
});

describe("timeProvider", () => {
  it("should get current timestamp", () => {
    const before = Date.now();
    const result = timeProvider.get("now", [], {});
    const after = Date.now();

    expect(result.success).toBe(true);
    expect(result.value as number).toBeGreaterThanOrEqual(before);
    expect(result.value as number).toBeLessThanOrEqual(after);
  });

  it("should get today's date", () => {
    const result = timeProvider.get("today", [], {});

    expect(result.success).toBe(true);
    expect(result.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("should get current time", () => {
    const result = timeProvider.get("time", [], {});

    expect(result.success).toBe(true);
    expect(result.value).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  it("should get datetime", () => {
    const result = timeProvider.get("datetime", [], {});

    expect(result.success).toBe(true);
    expect((result.value as string).includes("T")).toBe(true);
  });

  it("should get unix timestamp", () => {
    const result = timeProvider.get("timestamp", [], {});

    expect(result.success).toBe(true);
    expect(typeof result.value).toBe("number");
    expect(result.value as number).toBeLessThan(Date.now()); // Unix is in seconds
  });
});

describe("configProvider", () => {
  it("should get default config values", () => {
    const result = configProvider.get("config", ["theme"], {});

    expect(result.success).toBe(true);
    expect(result.value).toBe("light");
  });

  it("should use context override", () => {
    const result = configProvider.get("config", ["theme"], {
      config: { theme: "dark" },
    });

    expect(result.success).toBe(true);
    expect(result.value).toBe("dark");
  });

  it("should handle unknown config", () => {
    const result = configProvider.get("config", ["unknownkey"], {});

    expect(result.success).toBe(false);
    expect(result.error).toContain("Unknown config key");
  });
});

describe("envProvider", () => {
  it("should get environment variable", () => {
    const originalPath = process.env.PATH;
    const result = envProvider.get("env", ["PATH"], {});

    expect(result.success).toBe(true);
    expect(result.value).toBe(originalPath);
  });

  it("should handle missing env var", () => {
    const result = envProvider.get("env", ["NONEXISTENT_VAR_12345"], {});

    expect(result.success).toBe(false);
    expect(result.error).toContain("not set");
  });

  it("should redact sensitive values", () => {
    process.env.TEST_API_KEY = "secret123";
    const result = envProvider.get("env", ["TEST_API_KEY"], {});

    expect(result.success).toBe(true);
    expect(result.summary).toContain("[REDACTED]");
    expect(result.value).toBe("secret123"); // Value is still available

    delete process.env.TEST_API_KEY;
  });
});

describe("uuidProvider", () => {
  it("should generate uuid", () => {
    const result = uuidProvider.get("uuid", [], {});

    expect(result.success).toBe(true);
    expect(result.value).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });

  it("should generate short id", () => {
    const result = uuidProvider.get("id", [], {});

    expect(result.success).toBe(true);
    expect((result.value as string).length).toBe(8);
  });

  it("should generate unique values", () => {
    const uuid1 = uuidProvider.get("uuid", [], {});
    const uuid2 = uuidProvider.get("uuid", [], {});

    expect(uuid1.value).not.toBe(uuid2.value);
  });
});

// =============================================================================
// Utility Functions Tests
// =============================================================================

describe("getColorNames", () => {
  it("should return color names", () => {
    const names = getColorNames();

    expect(names).toContain("red");
    expect(names).toContain("blue");
    expect(names).toContain("green");
  });
});

describe("getPaletteNames", () => {
  it("should return palette names", () => {
    const names = getPaletteNames();

    expect(names).toContain("ocean");
    expect(names).toContain("forest");
    expect(names).toContain("sunset");
  });
});

describe("registerBuiltInProviders", () => {
  it("should register all built-in providers", () => {
    const registry = new ResourceRegistry();
    registerBuiltInProviders(registry);

    expect(registry.has("color")).toBe(true);
    expect(registry.has("now")).toBe(true);
    expect(registry.has("config")).toBe(true);
    expect(registry.has("env")).toBe(true);
    expect(registry.has("uuid")).toBe(true);
  });
});

describe("builtInProviders", () => {
  it("should include all providers", () => {
    expect(builtInProviders).toContain(colorProvider);
    expect(builtInProviders).toContain(timeProvider);
    expect(builtInProviders).toContain(configProvider);
    expect(builtInProviders).toContain(envProvider);
    expect(builtInProviders).toContain(uuidProvider);
  });
});
