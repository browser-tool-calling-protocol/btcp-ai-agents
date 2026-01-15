/**
 * Resource System
 *
 * Provides a unified interface for agents to access any data they need.
 * Resources can be accessed directly by agents or referenced via @alias
 * syntax in user prompts.
 *
 * @example
 * ```typescript
 * import {
 *   ResourceRegistry,
 *   registerBuiltInProviders,
 *   colorProvider,
 *   timeProvider,
 * } from '@waiboard/ai-agents/resources';
 *
 * // Create registry with built-in providers
 * const registry = new ResourceRegistry();
 * registerBuiltInProviders(registry);
 *
 * // Agent accessing resources directly
 * const color = await registry.get("color", ["red"]);
 * const time = await registry.get("now");
 *
 * // Resolve aliases in user prompt
 * const result = await registry.resolveAliases(
 *   "Use @color(red) for the element",
 *   context
 * );
 * ```
 */

// =============================================================================
// Types
// =============================================================================

export type {
  ResourceContext,
  ResolvedResource,
  ResourceDefinition,
  ResourceProvider,
  ParsedAlias,
  ResolvedAlias,
  AliasResolutionResult,
  ResolveOptions,
  GetOptions,
} from "./types.js";

// =============================================================================
// Registry
// =============================================================================

export {
  ResourceRegistry,
  defaultRegistry,
  createResourceRegistry,
  parseAlias,
  extractAliases,
} from "./registry.js";

// =============================================================================
// Providers
// =============================================================================

export {
  colorProvider,
  timeProvider,
  configProvider,
  envProvider,
  uuidProvider,
  builtInProviders,
  registerBuiltInProviders,
  getColorNames,
  getPaletteNames,
} from "./providers.js";

// =============================================================================
// Context Injector
// =============================================================================

export {
  ContextInjector,
  createContextInjector,
  type PrepareOptions,
  type AliasResolution,
  type PreparedContext,
  type ValidationResult,
} from "./context.js";
