/**
 * Resource Registry
 *
 * Central registry for all resource providers. Provides a unified
 * interface for agents to access any data they need.
 *
 * @example
 * ```typescript
 * const registry = new ResourceRegistry();
 *
 * // Register providers
 * registry.register(colorProvider);
 * registry.register(timeProvider);
 *
 * // Get resources (agent usage)
 * const color = await registry.get("color", ["red"]);
 * const time = await registry.get("now");
 *
 * // Resolve aliases in prompt (user usage)
 * const result = await registry.resolveAliases(
 *   "Use @color(red) for the element",
 *   context
 * );
 * ```
 */

import type {
  ResourceProvider,
  ResourceDefinition,
  ResourceContext,
  ResolvedResource,
  ParsedAlias,
  ResolvedAlias,
  AliasResolutionResult,
  ResolveOptions,
} from "./types.js";

// ============================================================================
// ALIAS PARSING
// ============================================================================

/**
 * Regex to match aliases: @name or @name(args)
 * Uses negative lookbehind to avoid matching emails
 */
const ALIAS_REGEX = /(?<![a-zA-Z0-9_])@(\w+)(?:\(([^)]*)\))?/g;

/**
 * Parse a single alias string
 */
export function parseAlias(
  aliasStr: string,
  definitions: Map<string, ResourceDefinition>
): ParsedAlias {
  const match = aliasStr.match(/(?<![a-zA-Z0-9_])@(\w+)(?:\(([^)]*)\))?/);

  if (!match) {
    return {
      match: aliasStr,
      name: "",
      args: [],
      rawArgs: "",
      isValid: false,
      error: "Invalid alias format. Use @name or @name(args)",
    };
  }

  const [fullMatch, name, rawArgs = ""] = match;
  const definition = definitions.get(name.toLowerCase());

  if (!definition) {
    const available = Array.from(definitions.keys())
      .slice(0, 10)
      .map((n) => `@${n}`)
      .join(", ");
    const suffix = definitions.size > 10 ? "..." : "";
    return {
      match: fullMatch,
      name,
      args: [],
      rawArgs,
      isValid: false,
      error: `Unknown resource: @${name}. Available: ${available}${suffix}`,
    };
  }

  // Parse arguments
  const args = rawArgs ? rawArgs.split(",").map((a) => a.trim()) : [];

  // Validate arguments
  if (definition.hasArgs && !rawArgs) {
    return {
      match: fullMatch,
      name,
      args,
      rawArgs,
      isValid: false,
      definition,
      error: `Resource @${name} requires arguments: @${name}(${definition.argDescription})`,
    };
  }

  if (!definition.hasArgs && rawArgs) {
    return {
      match: fullMatch,
      name,
      args,
      rawArgs,
      isValid: false,
      definition,
      error: `Resource @${name} does not accept arguments`,
    };
  }

  if (definition.hasArgs && definition.argPattern && !definition.argPattern.test(rawArgs)) {
    return {
      match: fullMatch,
      name,
      args,
      rawArgs,
      isValid: false,
      definition,
      error: `Invalid arguments for @${name}. Expected: ${definition.argDescription}`,
    };
  }

  return {
    match: fullMatch,
    name,
    args,
    rawArgs,
    isValid: true,
    definition,
  };
}

/**
 * Extract all aliases from text
 */
export function extractAliases(
  text: string,
  definitions: Map<string, ResourceDefinition>
): ParsedAlias[] {
  const aliases: ParsedAlias[] = [];
  const regex = new RegExp(ALIAS_REGEX.source, "g");
  let match;

  while ((match = regex.exec(text)) !== null) {
    aliases.push(parseAlias(match[0], definitions));
  }

  return aliases;
}

// ============================================================================
// RESOURCE REGISTRY
// ============================================================================

/**
 * Central registry for resource providers
 */
export class ResourceRegistry {
  private providers: Map<string, ResourceProvider> = new Map();
  private definitions: Map<string, ResourceDefinition> = new Map();
  private resourceToProvider: Map<string, string> = new Map();

  /**
   * Register a resource provider
   */
  register(provider: ResourceProvider): void {
    this.providers.set(provider.name, provider);

    for (const def of provider.definitions) {
      const key = def.name.toLowerCase();
      this.definitions.set(key, def);
      this.resourceToProvider.set(key, provider.name);
    }
  }

  /**
   * Unregister a provider
   */
  unregister(providerName: string): void {
    const provider = this.providers.get(providerName);
    if (!provider) return;

    for (const def of provider.definitions) {
      const key = def.name.toLowerCase();
      this.definitions.delete(key);
      this.resourceToProvider.delete(key);
    }

    this.providers.delete(providerName);
  }

  /**
   * Get a resource value
   *
   * This is the main API for agents to access resources directly.
   *
   * @example
   * ```typescript
   * // Get a color
   * const color = await registry.get("color", ["red"]);
   *
   * // Get current time
   * const time = await registry.get("now");
   * ```
   */
  async get(
    resourceName: string,
    args: string[] = [],
    context: ResourceContext = {}
  ): Promise<ResolvedResource> {
    const key = resourceName.toLowerCase();
    const providerName = this.resourceToProvider.get(key);

    if (!providerName) {
      return {
        value: null,
        summary: `Unknown resource: ${resourceName}`,
        tokenEstimate: 0,
        success: false,
        error: `Resource "${resourceName}" not found`,
      };
    }

    const provider = this.providers.get(providerName);
    if (!provider) {
      return {
        value: null,
        summary: `Provider not found`,
        tokenEstimate: 0,
        success: false,
        error: `Provider "${providerName}" not found`,
      };
    }

    try {
      return await provider.get(resourceName, args, context);
    } catch (error) {
      return {
        value: null,
        summary: `Failed to get ${resourceName}`,
        tokenEstimate: 0,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Check if a resource exists
   */
  has(resourceName: string): boolean {
    return this.definitions.has(resourceName.toLowerCase());
  }

  /**
   * Get resource definition
   */
  getDefinition(resourceName: string): ResourceDefinition | undefined {
    return this.definitions.get(resourceName.toLowerCase());
  }

  /**
   * Get all resource names
   */
  getResourceNames(): string[] {
    return Array.from(this.definitions.keys()).map((n) => `@${n}`);
  }

  /**
   * Get all definitions
   */
  getDefinitions(): ResourceDefinition[] {
    return Array.from(this.definitions.values());
  }

  /**
   * Get definitions by category
   */
  getDefinitionsByCategory(category: string): ResourceDefinition[] {
    return Array.from(this.definitions.values()).filter((d) => d.category === category);
  }

  /**
   * Get all categories
   */
  getCategories(): string[] {
    const categories = new Set<string>();
    for (const def of this.definitions.values()) {
      if (def.category) {
        categories.add(def.category);
      }
    }
    return Array.from(categories);
  }

  /**
   * Validate a resource reference
   */
  validate(resourceName: string, args: string[]): { valid: boolean; error?: string } {
    const key = resourceName.toLowerCase();
    const def = this.definitions.get(key);

    if (!def) {
      return { valid: false, error: `Unknown resource: ${resourceName}` };
    }

    if (def.hasArgs && args.length === 0) {
      return {
        valid: false,
        error: `Resource @${resourceName} requires arguments`,
      };
    }

    if (!def.hasArgs && args.length > 0) {
      return {
        valid: false,
        error: `Resource @${resourceName} does not accept arguments`,
      };
    }

    const providerName = this.resourceToProvider.get(key);
    const provider = providerName ? this.providers.get(providerName) : undefined;

    if (provider?.validate) {
      return provider.validate(resourceName, args);
    }

    return { valid: true };
  }

  /**
   * Get suggestions for partial input
   */
  suggest(partial: string): string[] {
    const match = partial.match(/@(\w*)$/);
    if (!match) return [];

    const search = match[1].toLowerCase();
    return Array.from(this.definitions.entries())
      .filter(([name]) => name.startsWith(search))
      .map(([name, def]) => {
        return def.hasArgs ? `@${name}(${def.argDescription})` : `@${name}`;
      });
  }

  /**
   * Get help text for a resource
   */
  getHelp(resourceName?: string): string {
    if (!resourceName) {
      // List all resources by category
      const byCategory = new Map<string, ResourceDefinition[]>();
      const uncategorized: ResourceDefinition[] = [];

      for (const def of this.definitions.values()) {
        if (def.category) {
          const list = byCategory.get(def.category) || [];
          list.push(def);
          byCategory.set(def.category, list);
        } else {
          uncategorized.push(def);
        }
      }

      const lines = ["Available resources:", ""];

      for (const [category, defs] of byCategory) {
        lines.push(`## ${category}`);
        lines.push("");
        for (const def of defs) {
          const syntax = def.hasArgs
            ? `@${def.name}(${def.argDescription})`
            : `@${def.name}`;
          lines.push(`  ${syntax}`);
          lines.push(`    ${def.description}`);
        }
        lines.push("");
      }

      if (uncategorized.length > 0) {
        if (byCategory.size > 0) {
          lines.push("## Other");
          lines.push("");
        }
        for (const def of uncategorized) {
          const syntax = def.hasArgs
            ? `@${def.name}(${def.argDescription})`
            : `@${def.name}`;
          lines.push(`  ${syntax}`);
          lines.push(`    ${def.description}`);
        }
        lines.push("");
      }

      return lines.join("\n");
    }

    const name = resourceName.replace(/^@/, "").toLowerCase();
    const def = this.definitions.get(name);

    if (!def) {
      return `Unknown resource: @${name}`;
    }

    const syntax = def.hasArgs
      ? `@${def.name}(${def.argDescription})`
      : `@${def.name}`;

    const lines = [
      `Resource: ${syntax}`,
      "",
      def.description,
      "",
      "Examples:",
      ...def.examples.map((ex) => `  ${ex}`),
    ];

    return lines.join("\n");
  }

  // ==========================================================================
  // ALIAS RESOLUTION
  // ==========================================================================

  /**
   * Check if text contains any aliases
   */
  containsAliases(text: string): boolean {
    return /(?<![a-zA-Z0-9_])@\w+(?:\([^)]*\))?/.test(text);
  }

  /**
   * Resolve all aliases in text
   *
   * @example
   * ```typescript
   * const result = await registry.resolveAliases(
   *   "Use @color(red) for the header",
   *   context
   * );
   *
   * console.log(result.text);
   * // "Use [red (#ff0000)] for the header"
   * ```
   */
  async resolveAliases(
    text: string,
    context: ResourceContext,
    options: ResolveOptions = {}
  ): Promise<AliasResolutionResult> {
    const { tokenBudget = 4000, continueOnError = true } = options;

    // Early return if no aliases
    if (!this.containsAliases(text)) {
      return {
        original: text,
        text,
        contextText: text,
        aliases: [],
        totalTokens: 0,
        success: true,
        errors: [],
      };
    }

    // Extract and resolve all aliases
    const parsedAliases = extractAliases(text, this.definitions);
    const resolvedAliases: ResolvedAlias[] = [];
    const errors: string[] = [];
    let totalTokens = 0;

    for (const parsed of parsedAliases) {
      // Check token budget
      if (totalTokens >= tokenBudget) {
        errors.push(`Token budget exceeded (${tokenBudget}), skipping remaining aliases`);
        break;
      }

      if (!parsed.isValid) {
        resolvedAliases.push({
          alias: parsed,
          resource: {
            value: null,
            summary: parsed.error || "Invalid alias",
            tokenEstimate: 0,
            success: false,
            error: parsed.error,
          },
        });
        if (parsed.error) errors.push(parsed.error);
        if (!continueOnError) break;
        continue;
      }

      const resource = await this.get(parsed.name, parsed.args, {
        ...context,
        maxItems: options.maxItems,
        fullData: options.fullData,
      });

      resolvedAliases.push({ alias: parsed, resource });

      if (!resource.success && resource.error) {
        errors.push(resource.error);
        if (!continueOnError) break;
      }

      totalTokens += resource.tokenEstimate;
    }

    // Replace aliases in text
    let summaryText = text;
    let contextText = text;

    for (const { alias, resource } of resolvedAliases) {
      const placeholder = alias.match;

      // Summary replacement (short)
      const summary = resource.success
        ? `[${resource.summary}]`
        : `[Error: ${resource.error}]`;
      summaryText = summaryText.replace(placeholder, summary);

      // Context replacement (detailed)
      const ctx = resource.success
        ? this.formatContext(resource)
        : `[Error: ${resource.error}]`;
      contextText = contextText.replace(placeholder, ctx);
    }

    return {
      original: text,
      text: summaryText,
      contextText,
      aliases: resolvedAliases,
      totalTokens,
      success: errors.length === 0,
      errors,
    };
  }

  /**
   * Format resolved resource for context injection
   */
  private formatContext(resource: ResolvedResource): string {
    // For small data, just use summary
    if (resource.tokenEstimate < 50) {
      return `[${resource.summary}]`;
    }

    // For larger data, include value
    const dataStr = JSON.stringify(resource.value, null, 2);
    const truncated = dataStr.length > 500 ? dataStr.slice(0, 500) + "..." : dataStr;

    return `[${resource.summary}\n${truncated}]`;
  }

  /**
   * Validate all aliases in text without resolving
   */
  validateAliases(text: string): {
    valid: boolean;
    errors: string[];
    aliases: ParsedAlias[];
  } {
    const aliases = extractAliases(text, this.definitions);
    const errors = aliases
      .filter((a) => !a.isValid)
      .map((a) => a.error || `Invalid alias: ${a.match}`);

    return {
      valid: errors.length === 0,
      errors,
      aliases,
    };
  }

  /**
   * Get count of registered resources
   */
  get size(): number {
    return this.definitions.size;
  }

  /**
   * Clear all registered providers
   */
  clear(): void {
    this.providers.clear();
    this.definitions.clear();
    this.resourceToProvider.clear();
  }
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Create a new resource registry
 */
export function createResourceRegistry(): ResourceRegistry {
  return new ResourceRegistry();
}

/**
 * Default resource registry instance
 */
export const defaultRegistry = new ResourceRegistry();
