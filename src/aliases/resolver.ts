/**
 * Alias Resolver
 *
 * Parses and resolves @alias syntax to actual data.
 *
 * @example
 * ```typescript
 * import {
 *   createAliasResolver,
 *   parseAlias,
 *   containsAliases
 * } from '@waiboard/ai-agents/aliases';
 *
 * const resolver = createAliasResolver(registry);
 *
 * // Parse a single alias
 * const alias = parseAlias('@file(src/index.ts)');
 * // => { name: 'file', args: ['src/index.ts'], isValid: true }
 *
 * // Resolve all aliases in text
 * const result = await resolver.resolveAll(
 *   'Read @file(README.md) and @file(package.json)',
 *   context
 * );
 * ```
 */

import type {
  AliasDefinition,
  AliasResolver as IAliasResolver,
  ParsedAlias,
  ResolvedAlias,
  ResolveOptions,
  ResolveResult,
  AliasRegistry,
} from "./types.js";

// ============================================================================
// REGEX PATTERNS
// ============================================================================

/**
 * Regex to match aliases: @name or @name(args)
 * Uses negative lookbehind to avoid matching email addresses
 */
const ALIAS_REGEX = /(?<![a-zA-Z0-9_])@(\w+)(?:\(([^)]*)\))?/g;

/**
 * Regex to test if text contains aliases
 */
const ALIAS_TEST_REGEX = /(?<![a-zA-Z0-9_])@\w+(?:\([^)]*\))?/;

// ============================================================================
// STANDALONE FUNCTIONS
// ============================================================================

/**
 * Check if text contains any aliases
 */
export function containsAliases(text: string): boolean {
  return ALIAS_TEST_REGEX.test(text);
}

/**
 * Parse a single alias string
 *
 * @example
 * ```typescript
 * parseAlias('@file(src/index.ts)');
 * // => { name: 'file', args: ['src/index.ts'], isValid: true }
 *
 * parseAlias('@user');
 * // => { name: 'user', args: [], isValid: true }
 *
 * parseAlias('not-an-alias');
 * // => { name: '', args: [], isValid: false, error: '...' }
 * ```
 */
export function parseAlias<TContext = unknown>(aliasStr: string, registry?: AliasRegistry<TContext>): ParsedAlias {
  const match = aliasStr.match(/@(\w+)(?:\(([^)]*)\))?/);

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
  const definition = registry?.get(name);

  // Parse arguments
  const args = rawArgs ? rawArgs.split(",").map((a) => a.trim()) : [];

  // If no registry provided, just parse syntactically
  if (!registry) {
    return {
      match: fullMatch,
      name,
      args,
      rawArgs,
      isValid: true,
    };
  }

  // Validate against registry
  if (!definition) {
    const availableNames = registry.getNames().slice(0, 10).join(", ");
    const suffix = registry.getNames().length > 10 ? "..." : "";
    return {
      match: fullMatch,
      name,
      args,
      rawArgs,
      isValid: false,
      error: `Unknown alias: @${name}. Available: ${availableNames}${suffix}`,
    };
  }

  // Validate arguments
  if (definition.hasArgs && !rawArgs) {
    return {
      match: fullMatch,
      name,
      args,
      rawArgs,
      isValid: false,
      definition: definition as AliasDefinition,
      error: `Alias @${name} requires arguments: @${name}(${definition.argDescription})`,
    };
  }

  if (!definition.hasArgs && rawArgs) {
    return {
      match: fullMatch,
      name,
      args,
      rawArgs,
      isValid: false,
      definition: definition as AliasDefinition,
      error: `Alias @${name} does not accept arguments`,
    };
  }

  if (definition.hasArgs && definition.argPattern && !definition.argPattern.test(rawArgs)) {
    return {
      match: fullMatch,
      name,
      args,
      rawArgs,
      isValid: false,
      definition: definition as AliasDefinition,
      error: `Invalid arguments for @${name}. Expected: ${definition.argDescription}`,
    };
  }

  return {
    match: fullMatch,
    name,
    args,
    rawArgs,
    isValid: true,
    definition: definition as AliasDefinition,
  };
}

/**
 * Extract all aliases from text
 */
export function extractAliases<TContext = unknown>(text: string, registry?: AliasRegistry<TContext>): ParsedAlias[] {
  const aliases: ParsedAlias[] = [];
  const regex = new RegExp(ALIAS_REGEX.source, "g");
  let match;

  while ((match = regex.exec(text)) !== null) {
    aliases.push(parseAlias(match[0], registry));
  }

  return aliases;
}

/**
 * Get all unique alias names from text
 */
export function getAliasesInText(text: string): string[] {
  const aliases = extractAliases(text);
  const names = new Set(aliases.map((a) => `@${a.name}`));
  return Array.from(names);
}

/**
 * Validate all aliases in text without resolving
 */
export function validateAliases<TContext = unknown>(
  text: string,
  registry?: AliasRegistry<TContext>
): {
  valid: boolean;
  errors: string[];
  aliases: ParsedAlias[];
} {
  const aliases = extractAliases(text, registry);
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
 * Suggest aliases based on partial input
 */
export function suggestAliases<TContext = unknown>(partial: string, registry: AliasRegistry<TContext>): string[] {
  const match = partial.match(/@(\w*)$/);
  if (!match) return [];

  const search = match[1].toLowerCase();
  return registry
    .getAll()
    .filter((def) => def.name.toLowerCase().startsWith(search))
    .map((def) => (def.hasArgs ? `@${def.name}(${def.argDescription})` : `@${def.name}`));
}

/**
 * Estimate token count for data
 */
export function estimateTokens(data: unknown): number {
  const json = JSON.stringify(data);
  // Rough estimate: ~4 chars per token
  return Math.ceil(json.length / 4);
}

// ============================================================================
// ALIAS RESOLVER CLASS
// ============================================================================

/**
 * Alias resolver implementation
 */
export class DefaultAliasResolver<TContext = unknown> implements IAliasResolver<TContext> {
  constructor(
    private registry: AliasRegistry<TContext>,
    private defaultOptions: ResolveOptions = {}
  ) {}

  /**
   * Parse a single alias string
   */
  parse(aliasStr: string): ParsedAlias {
    return parseAlias(aliasStr, this.registry);
  }

  /**
   * Extract all aliases from text
   */
  extract(text: string): ParsedAlias[] {
    return extractAliases(text, this.registry);
  }

  /**
   * Check if text contains aliases
   */
  containsAliases(text: string): boolean {
    return containsAliases(text);
  }

  /**
   * Validate aliases without resolving
   */
  validate(text: string): { valid: boolean; errors: string[]; aliases: ParsedAlias[] } {
    return validateAliases(text, this.registry);
  }

  /**
   * Suggest aliases based on partial input
   */
  suggest(partial: string): string[] {
    return suggestAliases(partial, this.registry);
  }

  /**
   * Resolve a single alias
   */
  async resolve(
    alias: ParsedAlias,
    context: TContext,
    options: ResolveOptions = {}
  ): Promise<ResolvedAlias> {
    const opts = { ...this.defaultOptions, ...options };

    if (!alias.isValid) {
      return {
        alias,
        data: null,
        summary: alias.error || "Invalid alias",
        tokenEstimate: 0,
        success: false,
        error: alias.error,
      };
    }

    const definition = alias.definition || this.registry.get(alias.name);
    if (!definition) {
      return {
        alias,
        data: null,
        summary: `Unknown alias: @${alias.name}`,
        tokenEstimate: 0,
        success: false,
        error: `Unknown alias: @${alias.name}`,
      };
    }

    if (!definition.resolve) {
      return {
        alias,
        data: null,
        summary: `No resolver for @${alias.name}`,
        tokenEstimate: 0,
        success: false,
        error: `Alias @${alias.name} has no resolver configured`,
      };
    }

    try {
      // Apply timeout if specified
      const resolvePromise = definition.resolve(alias.args, context);
      const result = opts.timeout
        ? await withTimeout(resolvePromise, opts.timeout)
        : await resolvePromise;

      return {
        alias,
        data: result,
        summary: result.summary,
        tokenEstimate: result.tokenEstimate,
        success: true,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        alias,
        data: null,
        summary: `Failed to resolve @${alias.name}`,
        tokenEstimate: 0,
        success: false,
        error: message,
      };
    }
  }

  /**
   * Resolve all aliases in text
   */
  async resolveAll(
    text: string,
    context: TContext,
    options: ResolveOptions = {}
  ): Promise<ResolveResult> {
    const opts = { ...this.defaultOptions, ...options };
    const { tokenBudget = 4000, continueOnError = true } = opts;

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
    const parsedAliases = this.extract(text);
    const resolvedAliases: ResolvedAlias[] = [];
    const errors: string[] = [];
    let totalTokens = 0;

    for (const parsed of parsedAliases) {
      // Check token budget
      if (totalTokens >= tokenBudget) {
        errors.push(`Token budget exceeded (${tokenBudget}), skipping remaining aliases`);
        break;
      }

      const resolved = await this.resolve(parsed, context, opts);
      resolvedAliases.push(resolved);

      if (!resolved.success && resolved.error) {
        errors.push(resolved.error);
        if (!continueOnError) {
          break;
        }
      }

      totalTokens += resolved.tokenEstimate;
    }

    // Replace aliases in text
    let summaryText = text;
    let contextText = text;

    for (const resolved of resolvedAliases) {
      const placeholder = resolved.alias.match;

      // Summary replacement (short)
      const summary = resolved.success
        ? `[${resolved.summary}]`
        : `[Error: ${resolved.error}]`;
      summaryText = summaryText.replace(placeholder, summary);

      // Context replacement (detailed)
      const context = resolved.success
        ? this.formatContext(resolved)
        : `[Error: ${resolved.error}]`;
      contextText = contextText.replace(placeholder, context);
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
   * Format resolved data for context injection
   */
  private formatContext(resolved: ResolvedAlias): string {
    const { alias, data, summary } = resolved;

    // For simple summaries, just use brackets
    if (resolved.tokenEstimate < 50) {
      return `[${summary}]`;
    }

    // For larger data, create a context block
    const dataStr = JSON.stringify(data?.value ?? data, null, 2);
    const truncated = dataStr.length > 500 ? dataStr.slice(0, 500) + "..." : dataStr;

    return `[Context @${alias.name}: ${summary}\n${truncated}]`;
  }
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Promise with timeout
 */
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("Timeout")), ms)),
  ]);
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Create an alias resolver
 */
export function createAliasResolver<TContext = unknown>(
  registry: AliasRegistry<TContext>,
  defaultOptions?: ResolveOptions
): DefaultAliasResolver<TContext> {
  return new DefaultAliasResolver(registry, defaultOptions);
}
