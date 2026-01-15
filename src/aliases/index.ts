/**
 * Alias System
 *
 * Provides @alias syntax for referencing data in agent prompts.
 * Similar to Claude Code's resource references like @file, @cwd.
 *
 * @example
 * ```typescript
 * import {
 *   createAliasRegistry,
 *   createAliasResolver,
 *   parseAlias,
 *   containsAliases,
 * } from '@waiboard/ai-agents/aliases';
 *
 * // Create registry and register aliases
 * const registry = createAliasRegistry();
 *
 * registry.register({
 *   name: 'user',
 *   description: 'Current user',
 *   hasArgs: false,
 *   examples: ['@user', 'Hello @user'],
 *   resolve: async () => ({
 *     value: { name: 'John' },
 *     summary: 'John Doe',
 *     tokenEstimate: 10,
 *   }),
 * });
 *
 * // Create resolver
 * const resolver = createAliasResolver(registry);
 *
 * // Resolve aliases in text
 * const result = await resolver.resolveAll(
 *   'Hello @user, how are you?',
 *   context
 * );
 *
 * console.log(result.text);
 * // => 'Hello [John Doe], how are you?'
 * ```
 */

// =============================================================================
// Types
// =============================================================================

export type {
  AliasDefinition,
  ParsedAlias,
  AliasResolutionData,
  ResolvedAlias,
  ResolveOptions,
  ResolveResult,
  AliasRegistry,
  AliasResolver,
} from "./types.js";

// =============================================================================
// Registry
// =============================================================================

export {
  DefaultAliasRegistry,
  createAliasRegistry,
  createRegistryWithCommonAliases,
  CommonAliases,
  // Canvas-specific aliases
  CanvasAliases,
  ALIASES,
  createCanvasAliasRegistry,
  generateAgentEntry,
  exportAliasesForSettings,
} from "./definitions.js";

// =============================================================================
// Resolver
// =============================================================================

export {
  DefaultAliasResolver,
  createAliasResolver,
  // Standalone functions
  containsAliases,
  parseAlias,
  extractAliases,
  getAliasesInText,
  validateAliases,
  suggestAliases,
  estimateTokens,
} from "./resolver.js";
