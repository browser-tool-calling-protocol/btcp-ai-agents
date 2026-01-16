/**
 * Resource System Types
 *
 * Resources provide a unified interface for agents to access any data
 * they might need - from colors to configurations to external services.
 *
 * @example
 * ```typescript
 * // Agent accessing resources directly
 * const color = await registry.get("color", ["red"]);
 * // => { value: "#ff0000", summary: "red (#ff0000)", ... }
 *
 * // User mentioning resource via alias in prompt
 * "Use @color(red) for the header"
 * // => resolved before agent execution
 * ```
 */

// ============================================================================
// CORE TYPES
// ============================================================================

/**
 * Context passed to resource resolution
 */
export interface ResourceContext {
  /** Session ID for context tracking */
  sessionId?: string;
  /** Additional context data */
  [key: string]: unknown;
}

/**
 * Resolved resource value
 */
export interface ResolvedResource<T = unknown> {
  /** The resolved value */
  value: T;
  /** Human-readable summary */
  summary: string;
  /** Estimated token count for context injection */
  tokenEstimate: number;
  /** Whether resolution succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Resource metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Resource definition for a single resource type
 */
export interface ResourceDefinition {
  /** Resource name (e.g., "color", "time") */
  name: string;
  /** Human-readable description */
  description: string;
  /** Whether this resource accepts arguments */
  hasArgs: boolean;
  /** Regex pattern for validating arguments */
  argPattern?: RegExp;
  /** Description of expected arguments */
  argDescription?: string;
  /** Example usages */
  examples: string[];
  /** Whether resolution requires async */
  isAsync: boolean;
  /** Category for grouping */
  category?: string;
}

/**
 * Resource provider interface
 *
 * Implement this to create custom resource providers.
 *
 * @example
 * ```typescript
 * const colorProvider: ResourceProvider = {
 *   name: "color",
 *   definitions: [
 *     { name: "color", description: "Color by name or hex", hasArgs: true, ... }
 *   ],
 *   get: (name, args) => {
 *     const hex = COLORS[args[0]] || args[0];
 *     return { value: hex, summary: hex, tokenEstimate: 2, success: true };
 *   },
 *   handles: (name) => name === "color",
 * };
 * ```
 */
export interface ResourceProvider<T = unknown> {
  /** Provider name (used for namespacing) */
  name: string;

  /** Resource definitions this provider handles */
  definitions: ResourceDefinition[];

  /**
   * Get a resource value
   *
   * @param resourceName - The resource name (e.g., "color")
   * @param args - Arguments passed to the resource (e.g., ["red"] for @color(red))
   * @param context - Resolution context
   * @returns Resolved resource or promise
   */
  get(
    resourceName: string,
    args: string[],
    context: ResourceContext
  ): ResolvedResource<T> | Promise<ResolvedResource<T>>;

  /**
   * Check if this provider handles a resource
   */
  handles(resourceName: string): boolean;

  /**
   * Validate arguments for a resource
   */
  validate?(resourceName: string, args: string[]): { valid: boolean; error?: string };

  /**
   * Get suggestions for partial input
   */
  suggest?(resourceName: string, partial: string): string[];
}

// ============================================================================
// ALIAS TYPES (for prompt syntax)
// ============================================================================

/**
 * Parsed alias from prompt text
 */
export interface ParsedAlias {
  /** Full match string (e.g., "@color(red)") */
  match: string;
  /** Resource name (e.g., "color") */
  name: string;
  /** Parsed arguments */
  args: string[];
  /** Raw argument string */
  rawArgs: string;
  /** Whether the alias is valid */
  isValid: boolean;
  /** Validation error if invalid */
  error?: string;
  /** Associated resource definition */
  definition?: ResourceDefinition;
}

/**
 * Resolved alias with data
 */
export interface ResolvedAlias {
  /** The parsed alias */
  alias: ParsedAlias;
  /** Resolved resource data */
  resource: ResolvedResource;
}

/**
 * Result of resolving all aliases in text
 */
export interface AliasResolutionResult {
  /** Original text */
  original: string;
  /** Text with aliases replaced by summaries */
  text: string;
  /** Text with aliases replaced by full context */
  contextText: string;
  /** All resolved aliases */
  aliases: ResolvedAlias[];
  /** Total token estimate */
  totalTokens: number;
  /** Whether all aliases resolved successfully */
  success: boolean;
  /** Errors if any */
  errors: string[];
}

// ============================================================================
// HELPER TYPES
// ============================================================================

/**
 * Options for resource resolution
 */
export interface ResolveOptions {
  /** Maximum items to return for collection resources */
  maxItems?: number;
  /** Whether to include full data or just summaries */
  fullData?: boolean;
  /** Token budget for all resolutions */
  tokenBudget?: number;
  /** Timeout per resolution (ms) */
  timeout?: number;
  /** Continue on individual errors */
  continueOnError?: boolean;
}

/**
 * Resource get options (alias for cleaner API)
 */
export type GetOptions = ResolveOptions & ResourceContext;
