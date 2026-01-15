/**
 * Alias System Types
 *
 * Generic types for @alias syntax that can be used to reference
 * any data source in agent prompts.
 */

// ============================================================================
// ALIAS DEFINITION
// ============================================================================

/**
 * Alias definition - describes an available alias
 *
 * @example
 * ```typescript
 * const fileAlias: AliasDefinition = {
 *   name: 'file',
 *   description: 'Reference a file by path',
 *   hasArgs: true,
 *   argPattern: /^.+$/,
 *   argDescription: '<file-path>',
 *   examples: ['@file(src/index.ts)', 'Read @file(README.md)'],
 * };
 * ```
 */
export interface AliasDefinition<TContext = unknown> {
  /** Alias name (without @) */
  name: string;
  /** Description of what this alias resolves to */
  description: string;
  /** Whether it accepts arguments */
  hasArgs: boolean;
  /** Regex pattern for validating arguments */
  argPattern?: RegExp;
  /** Human-readable argument description */
  argDescription?: string;
  /** Example usages */
  examples: string[];
  /** Category for grouping */
  category?: string;
  /** Resolver function */
  resolve?: (args: string[], context: TContext) => Promise<AliasResolutionData>;
}

/**
 * Parsed alias from text
 */
export interface ParsedAlias {
  /** Full match including @ and args */
  match: string;
  /** Alias name (without @) */
  name: string;
  /** Parsed arguments array */
  args: string[];
  /** Raw argument string */
  rawArgs: string;
  /** Whether alias is syntactically valid */
  isValid: boolean;
  /** Error message if invalid */
  error?: string;
  /** Matching definition if found */
  definition?: AliasDefinition;
}

/**
 * Resolved alias data
 */
export interface AliasResolutionData {
  /** The resolved data value */
  value: unknown;
  /** Human-readable summary */
  summary: string;
  /** Token count estimate */
  tokenEstimate: number;
  /** Metadata about resolution */
  metadata?: Record<string, unknown>;
}

/**
 * Result of resolving an alias
 */
export interface ResolvedAlias {
  /** Original parsed alias */
  alias: ParsedAlias;
  /** Resolved data (null if failed) */
  data: AliasResolutionData | null;
  /** Human-readable summary */
  summary: string;
  /** Token count estimate */
  tokenEstimate: number;
  /** Whether resolution succeeded */
  success: boolean;
  /** Error if failed */
  error?: string;
}

// ============================================================================
// RESOLUTION OPTIONS & RESULTS
// ============================================================================

/**
 * Options for alias resolution
 */
export interface ResolveOptions {
  /** Maximum items to return per alias */
  maxItems?: number;
  /** Whether to include full data or just summaries */
  fullData?: boolean;
  /** Token budget for all aliases */
  tokenBudget?: number;
  /** Timeout per alias (ms) */
  timeout?: number;
  /** Continue on individual alias errors */
  continueOnError?: boolean;
}

/**
 * Result of resolving all aliases in text
 */
export interface ResolveResult {
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
// REGISTRY TYPES
// ============================================================================

/**
 * Alias registry interface
 */
export interface AliasRegistry<TContext = unknown> {
  /** Register an alias definition */
  register(definition: AliasDefinition<TContext>): void;
  /** Unregister an alias by name */
  unregister(name: string): boolean;
  /** Get an alias definition by name */
  get(name: string): AliasDefinition<TContext> | undefined;
  /** Check if alias exists */
  has(name: string): boolean;
  /** Get all registered alias names */
  getNames(): string[];
  /** Get all registered aliases */
  getAll(): AliasDefinition<TContext>[];
}

/**
 * Alias resolver interface
 */
export interface AliasResolver<TContext = unknown> {
  /** Parse a single alias string */
  parse(aliasStr: string): ParsedAlias;
  /** Extract all aliases from text */
  extract(text: string): ParsedAlias[];
  /** Resolve a single alias */
  resolve(alias: ParsedAlias, context: TContext, options?: ResolveOptions): Promise<ResolvedAlias>;
  /** Resolve all aliases in text */
  resolveAll(text: string, context: TContext, options?: ResolveOptions): Promise<ResolveResult>;
  /** Check if text contains aliases */
  containsAliases(text: string): boolean;
  /** Validate aliases without resolving */
  validate(text: string): { valid: boolean; errors: string[]; aliases: ParsedAlias[] };
  /** Suggest aliases based on partial input */
  suggest(partial: string): string[];
}
