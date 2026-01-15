/**
 * Alias Registry
 *
 * Manages alias definitions for resolution.
 *
 * @example
 * ```typescript
 * import { AliasRegistry, createAliasRegistry } from '@waiboard/ai-agents/aliases';
 *
 * const registry = createAliasRegistry();
 *
 * // Register custom aliases
 * registry.register({
 *   name: 'user',
 *   description: 'Current user information',
 *   hasArgs: false,
 *   examples: ['@user', 'Welcome back @user'],
 * });
 *
 * registry.register({
 *   name: 'file',
 *   description: 'File contents',
 *   hasArgs: true,
 *   argPattern: /^.+$/,
 *   argDescription: '<file-path>',
 *   examples: ['@file(README.md)'],
 * });
 * ```
 */

import type { AliasDefinition, AliasRegistry as IAliasRegistry } from "./types.js";

// ============================================================================
// DEFAULT REGISTRY IMPLEMENTATION
// ============================================================================

/**
 * Default alias registry implementation
 */
export class DefaultAliasRegistry<TContext = unknown> implements IAliasRegistry<TContext> {
  private aliases: Map<string, AliasDefinition<TContext>> = new Map();

  constructor(initialAliases: AliasDefinition<TContext>[] = []) {
    for (const alias of initialAliases) {
      this.register(alias);
    }
  }

  /**
   * Register an alias definition
   */
  register(definition: AliasDefinition<TContext>): void {
    const name = definition.name.toLowerCase();
    this.aliases.set(name, definition);
  }

  /**
   * Unregister an alias by name
   */
  unregister(name: string): boolean {
    return this.aliases.delete(name.toLowerCase());
  }

  /**
   * Get an alias definition by name
   */
  get(name: string): AliasDefinition<TContext> | undefined {
    return this.aliases.get(name.toLowerCase());
  }

  /**
   * Check if alias exists
   */
  has(name: string): boolean {
    return this.aliases.has(name.toLowerCase());
  }

  /**
   * Get all registered alias names
   */
  getNames(): string[] {
    return Array.from(this.aliases.keys()).map((name) => `@${name}`);
  }

  /**
   * Get all registered aliases
   */
  getAll(): AliasDefinition<TContext>[] {
    return Array.from(this.aliases.values());
  }

  /**
   * Get aliases by category
   */
  getByCategory(category: string): AliasDefinition<TContext>[] {
    return Array.from(this.aliases.values()).filter((a) => a.category === category);
  }

  /**
   * Get all unique categories
   */
  getCategories(): string[] {
    const categories = new Set<string>();
    for (const alias of this.aliases.values()) {
      if (alias.category) {
        categories.add(alias.category);
      }
    }
    return Array.from(categories);
  }

  /**
   * Clear all registered aliases
   */
  clear(): void {
    this.aliases.clear();
  }

  /**
   * Get count of registered aliases
   */
  get size(): number {
    return this.aliases.size;
  }

  /**
   * Generate help text for all aliases or a specific one
   */
  getHelp(aliasName?: string): string {
    if (aliasName) {
      const name = aliasName.replace(/^@/, "");
      const def = this.get(name);
      if (!def) {
        return `Unknown alias: @${name}. Available: ${this.getNames().join(", ")}`;
      }
      const args = def.hasArgs ? `(${def.argDescription})` : "";
      return [
        `@${def.name}${args}`,
        def.description,
        "",
        "Examples:",
        ...def.examples.map((e) => `  ${e}`),
      ].join("\n");
    }

    // List all aliases by category
    const byCategory = new Map<string, AliasDefinition<TContext>[]>();
    const uncategorized: AliasDefinition<TContext>[] = [];

    for (const alias of this.aliases.values()) {
      if (alias.category) {
        const list = byCategory.get(alias.category) || [];
        list.push(alias);
        byCategory.set(alias.category, list);
      } else {
        uncategorized.push(alias);
      }
    }

    const lines = ["Available aliases:", ""];

    // Output by category
    for (const [category, aliases] of byCategory) {
      lines.push(`## ${category}`);
      lines.push("");
      for (const def of aliases) {
        const args = def.hasArgs ? `(${def.argDescription})` : "";
        lines.push(`  @${def.name}${args}`);
        lines.push(`    ${def.description}`);
      }
      lines.push("");
    }

    // Output uncategorized
    if (uncategorized.length > 0) {
      if (byCategory.size > 0) {
        lines.push("## Other");
        lines.push("");
      }
      for (const def of uncategorized) {
        const args = def.hasArgs ? `(${def.argDescription})` : "";
        lines.push(`  @${def.name}${args}`);
        lines.push(`    ${def.description}`);
      }
      lines.push("");
    }

    return lines.join("\n");
  }
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Create a new alias registry
 */
export function createAliasRegistry<TContext = unknown>(
  initialAliases?: AliasDefinition<TContext>[]
): DefaultAliasRegistry<TContext> {
  return new DefaultAliasRegistry<TContext>(initialAliases);
}

// ============================================================================
// COMMON ALIAS DEFINITIONS
// ============================================================================

/**
 * Common alias definitions that can be reused
 */
export const CommonAliases = {
  /**
   * Current timestamp
   */
  timestamp: {
    name: "timestamp",
    description: "Current timestamp",
    hasArgs: false,
    examples: ["@timestamp", "Created at @timestamp"],
    category: "utility",
  } as AliasDefinition,

  /**
   * Current date
   */
  date: {
    name: "date",
    description: "Current date (YYYY-MM-DD)",
    hasArgs: false,
    examples: ["@date", "Report for @date"],
    category: "utility",
  } as AliasDefinition,

  /**
   * Current time
   */
  time: {
    name: "time",
    description: "Current time (HH:MM:SS)",
    hasArgs: false,
    examples: ["@time", "Generated at @time"],
    category: "utility",
  } as AliasDefinition,

  /**
   * Environment variable
   */
  env: {
    name: "env",
    description: "Environment variable value",
    hasArgs: true,
    argPattern: /^[A-Z_][A-Z0-9_]*$/i,
    argDescription: "<VAR_NAME>",
    examples: ["@env(NODE_ENV)", "Running in @env(NODE_ENV) mode"],
    category: "utility",
  } as AliasDefinition,

  /**
   * Random ID
   */
  uuid: {
    name: "uuid",
    description: "Generate a random UUID",
    hasArgs: false,
    examples: ["@uuid", "ID: @uuid"],
    category: "utility",
  } as AliasDefinition,

  /**
   * Previous result reference
   */
  previous: {
    name: "previous",
    description: "Reference to previous operation result",
    hasArgs: false,
    examples: ["@previous", "Use @previous and transform it"],
    category: "context",
  } as AliasDefinition,

  /**
   * Session context
   */
  session: {
    name: "session",
    description: "Current session information",
    hasArgs: false,
    examples: ["@session", "Session: @session"],
    category: "context",
  } as AliasDefinition,
};

/**
 * Create registry with common utility aliases pre-registered
 */
export function createRegistryWithCommonAliases<TContext = unknown>(
  customAliases?: AliasDefinition<TContext>[]
): DefaultAliasRegistry<TContext> {
  const registry = new DefaultAliasRegistry<TContext>();

  // Register common aliases
  for (const alias of Object.values(CommonAliases)) {
    registry.register(alias as AliasDefinition<TContext>);
  }

  // Register custom aliases
  if (customAliases) {
    for (const alias of customAliases) {
      registry.register(alias);
    }
  }

  return registry;
}

// ============================================================================
// CANVAS-SPECIFIC ALIASES
// ============================================================================

/**
 * Canvas-specific alias definitions
 */
export const CanvasAliases = {
  /**
   * Current canvas state
   */
  canvas: {
    name: "canvas",
    description: "Current canvas state and summary",
    hasArgs: false,
    examples: ["@canvas", "Based on @canvas, I will..."],
    category: "canvas",
  } as AliasDefinition,

  /**
   * Current selection
   */
  selection: {
    name: "selection",
    description: "Currently selected elements",
    hasArgs: false,
    examples: ["@selection", "The @selection consists of..."],
    category: "canvas",
  } as AliasDefinition,

  /**
   * Specific element by ID
   */
  element: {
    name: "element",
    description: "Get element by ID",
    hasArgs: true,
    argPattern: /^[a-zA-Z0-9_-]+$/,
    argDescription: "<element-id>",
    examples: ["@element(rect-1)", "The @element(header) has..."],
    category: "canvas",
  } as AliasDefinition,

  /**
   * Elements by type
   */
  type: {
    name: "type",
    description: "Get all elements of a type",
    hasArgs: true,
    argPattern: /^(rectangle|ellipse|text|arrow|frame|image|line|diamond)$/,
    argDescription: "<element-type>",
    examples: ["@type(rectangle)", "All @type(text) elements..."],
    category: "canvas",
  } as AliasDefinition,

  /**
   * Current viewport
   */
  viewport: {
    name: "viewport",
    description: "Current viewport bounds and zoom",
    hasArgs: false,
    examples: ["@viewport", "The @viewport shows..."],
    category: "canvas",
  } as AliasDefinition,

  /**
   * Frame contents
   */
  frame: {
    name: "frame",
    description: "Get frame and its children",
    hasArgs: true,
    argPattern: /^[a-zA-Z0-9_-]+$/,
    argDescription: "<frame-id>",
    examples: ["@frame(main)", "The @frame(sidebar) contains..."],
    category: "canvas",
  } as AliasDefinition,

  /**
   * Color reference
   */
  color: {
    name: "color",
    description: "Get color value by name",
    hasArgs: true,
    argPattern: /^[a-z0-9-]+$/i,
    argDescription: "<color-name>",
    examples: ["@color(primary)", "Use @color(blue-500) for..."],
    category: "design",
  } as AliasDefinition,

  /**
   * Palette colors
   */
  palette: {
    name: "palette",
    description: "Get all colors in a palette",
    hasArgs: true,
    argPattern: /^[a-z0-9-]+$/i,
    argDescription: "<palette-name>",
    examples: ["@palette(professional)", "Apply @palette(warm) to..."],
    category: "design",
  } as AliasDefinition,
};

/**
 * All built-in aliases (common + canvas)
 */
export const ALIASES: Record<string, AliasDefinition> = {
  ...CommonAliases,
  ...CanvasAliases,
};

/**
 * Create registry with all canvas aliases pre-registered
 */
export function createCanvasAliasRegistry<TContext = unknown>(
  customAliases?: AliasDefinition<TContext>[]
): DefaultAliasRegistry<TContext> {
  const registry = new DefaultAliasRegistry<TContext>();

  // Register all built-in aliases
  for (const alias of Object.values(ALIASES)) {
    registry.register(alias as AliasDefinition<TContext>);
  }

  // Register custom aliases
  if (customAliases) {
    for (const alias of customAliases) {
      registry.register(alias);
    }
  }

  return registry;
}

/**
 * Generate agent entry for Claude Code Task tool
 */
export function generateAgentEntry(alias: AliasDefinition): {
  name: string;
  description: string;
  syntax: string;
} {
  const syntax = alias.hasArgs ? `@${alias.name}(${alias.argDescription})` : `@${alias.name}`;
  return {
    name: alias.name,
    description: alias.description,
    syntax,
  };
}

/**
 * Export all aliases for Claude Code settings
 */
export function exportAliasesForSettings(): Array<{
  name: string;
  description: string;
  syntax: string;
}> {
  return Object.values(ALIASES).map((alias) => generateAgentEntry(alias));
}
