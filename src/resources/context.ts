/**
 * Context Injector
 *
 * Sophisticated context preparation with fallbacks and error handling.
 * Wraps ResourceRegistry for production-ready alias resolution.
 */

import type { ResourceContext, ParsedAlias } from "./types.js";
import { ResourceRegistry, defaultRegistry, extractAliases } from "./registry.js";

// ============================================================================
// TYPES
// ============================================================================

/**
 * Error action options
 */
export type ErrorAction = "skip" | "fallback" | "fail";

/**
 * Options for context preparation
 */
export interface PrepareOptions {
  /** Token budget for context (default: 4000) */
  tokenBudget?: number;
  /** Fail fast on first error (default: false) */
  failFast?: boolean;
  /** Fallback values for failed resolutions (keyed by alias name) */
  fallbacks?: Record<string, unknown>;
  /** Aliases to skip */
  skip?: string[];
  /** Error handler - returns action to take */
  onError?: (alias: string, error: Error) => ErrorAction;
  /** Maximum retries for transient errors */
  maxRetries?: number;
  /** Timeout for each resolution (ms) */
  timeout?: number;
}

/**
 * Resolution status
 */
export type ResolutionStatus = "resolved" | "failed" | "skipped" | "fallback";

/**
 * Resolution result for a single alias
 */
export interface AliasResolution {
  /** Original alias string */
  alias: string;
  /** Parsed alias information */
  parsed: ParsedAlias;
  /** Resolution status */
  status: ResolutionStatus;
  /** Resolved resource (if successful) */
  resource?: {
    value: unknown;
    summary: string;
    tokenEstimate: number;
  };
  /** Fallback value used (if status is 'fallback') */
  fallback?: unknown;
  /** Error message if failed */
  error?: string;
  /** Duration of resolution in ms */
  duration: number;
}

/**
 * Prepared context result
 */
export interface PreparedContext {
  /** Original prompt */
  original: string;
  /** Prompt with context section prepended */
  enrichedPrompt: string;
  /** Full context section */
  contextSection: string;
  /** Individual resolutions */
  resolutions: AliasResolution[];
  /** Statistics */
  stats: {
    total: number;
    resolved: number;
    failed: number;
    skipped: number;
    fallback: number;
    totalTokens: number;
    duration: number;
  };
  /** Warnings (non-fatal issues) */
  warnings: string[];
  /** Critical errors that should stop processing */
  criticalErrors: string[];
  /** Whether all aliases resolved successfully */
  allResolved: boolean;
}

/**
 * Validation result
 */
export interface ValidationResult {
  /** Whether all aliases are valid */
  valid: boolean;
  /** Aliases found in text */
  aliases: string[];
  /** Invalid aliases */
  invalid: string[];
  /** Error messages */
  errors: string[];
}

// ============================================================================
// CONTEXT INJECTOR
// ============================================================================

/**
 * ContextInjector - Production-ready context preparation
 *
 * Provides sophisticated alias resolution with:
 * - Fallback strategies for failed resolutions
 * - Token budget management
 * - Error handling and retries
 * - Statistics tracking
 *
 * @example
 * ```typescript
 * const injector = new ContextInjector(registry);
 *
 * // Check if preparation is needed
 * if (injector.needsPreparation(task)) {
 *   const prepared = await injector.prepare(task, context, {
 *     tokenBudget: 4000,
 *     failFast: false,
 *   });
 *
 *   // Use enriched prompt
 *   console.log(prepared.enrichedPrompt);
 * }
 * ```
 */
export class ContextInjector {
  constructor(private registry: ResourceRegistry = defaultRegistry) {}

  /**
   * Check if text needs preparation (contains aliases)
   */
  needsPreparation(text: string): boolean {
    return this.registry.containsAliases(text);
  }

  /**
   * Validate aliases in text without resolving
   */
  validate(text: string): ValidationResult {
    if (!this.needsPreparation(text)) {
      return {
        valid: true,
        aliases: [],
        invalid: [],
        errors: [],
      };
    }

    const validation = this.registry.validateAliases(text);
    const aliases = validation.aliases.map((a) => a.match);
    const invalid = validation.aliases.filter((a) => !a.isValid).map((a) => a.match);

    return {
      valid: validation.valid,
      aliases,
      invalid,
      errors: validation.errors,
    };
  }

  /**
   * Prepare context by resolving all aliases
   */
  async prepare(
    text: string,
    context: ResourceContext,
    options: PrepareOptions = {}
  ): Promise<PreparedContext> {
    const startTime = Date.now();
    const {
      tokenBudget = 4000,
      failFast = false,
      fallbacks = {},
      skip = [],
      onError,
      maxRetries = 2,
      timeout = 5000,
    } = options;

    // Initialize result
    const result: PreparedContext = {
      original: text,
      enrichedPrompt: text,
      contextSection: "",
      resolutions: [],
      stats: {
        total: 0,
        resolved: 0,
        failed: 0,
        skipped: 0,
        fallback: 0,
        totalTokens: 0,
        duration: 0,
      },
      warnings: [],
      criticalErrors: [],
      allResolved: true,
    };

    // Early return if no aliases
    if (!this.needsPreparation(text)) {
      result.stats.duration = Date.now() - startTime;
      return result;
    }

    // Extract aliases
    const definitions = (this.registry as any).definitions as Map<string, any>;
    const parsedAliases = extractAliases(text, definitions);
    result.stats.total = parsedAliases.length;

    // Process each alias
    let tokensUsed = 0;
    const contextParts: string[] = [];

    for (const parsed of parsedAliases) {
      const resolutionStart = Date.now();

      // Check if skipped
      if (skip.includes(parsed.name)) {
        result.stats.skipped++;
        result.resolutions.push({
          alias: parsed.match,
          parsed,
          status: "skipped",
          duration: Date.now() - resolutionStart,
        });
        continue;
      }

      // Check token budget
      if (tokensUsed >= tokenBudget) {
        result.warnings.push(
          `Token budget exceeded (${tokenBudget}), skipping remaining aliases`
        );
        // Add remaining aliases as skipped (including current one)
        const currentIndex = parsedAliases.indexOf(parsed);
        const remaining = parsedAliases.slice(currentIndex);
        for (const skippedParsed of remaining) {
          result.stats.skipped++;
          result.resolutions.push({
            alias: skippedParsed.match,
            parsed: skippedParsed,
            status: "skipped",
            error: "Token budget exceeded",
            duration: 0,
          });
        }
        break;
      }

      // Resolve alias
      const resolution = await this.resolveWithRetry(
        parsed,
        context,
        maxRetries,
        timeout,
        fallbacks,
        onError,
        resolutionStart
      );

      result.resolutions.push(resolution);

      if (resolution.status === "resolved" || resolution.status === "fallback") {
        result.stats.resolved++;
        if (resolution.status === "fallback") {
          result.stats.fallback++;
        }
        const tokens = resolution.resource?.tokenEstimate || 0;
        tokensUsed += tokens;

        // Add to context section
        if (tokens > 0 && resolution.resource) {
          const value = resolution.status === "fallback"
            ? resolution.fallback
            : resolution.resource.value;
          contextParts.push(
            `${parsed.match}: ${this.formatValue(value)}`
          );
        }
      } else if (resolution.status === "failed") {
        result.stats.failed++;
        result.allResolved = false;

        if (resolution.error) {
          // Determine if error is critical
          if (failFast || this.isCriticalError(resolution.error)) {
            result.criticalErrors.push(resolution.error);
            break;
          } else {
            result.warnings.push(`Failed to resolve ${parsed.match}: ${resolution.error}`);
            // Add error indication to context
            contextParts.push(`${parsed.match}: [error] ${resolution.error}`);
          }
        }
      } else if (resolution.status === "skipped") {
        result.stats.skipped++;
      }
    }

    // Build context section
    if (contextParts.length > 0) {
      result.contextSection = contextParts.join("\n");
    }

    // Build enriched prompt (original prompt + context section + warnings)
    result.enrichedPrompt = this.buildEnrichedPrompt(text, result.contextSection, result.warnings);

    // Update stats
    result.stats.totalTokens = tokensUsed;
    result.stats.duration = Date.now() - startTime;

    return result;
  }

  /**
   * Resolve a single alias with retry logic
   */
  private async resolveWithRetry(
    parsed: ParsedAlias,
    context: ResourceContext,
    maxRetries: number,
    timeout: number,
    fallbacks: Record<string, unknown>,
    onError: PrepareOptions["onError"],
    resolutionStart: number
  ): Promise<AliasResolution> {
    // Invalid alias
    if (!parsed.isValid) {
      const error = parsed.error || "Unknown alias";
      const action = onError?.(parsed.match, new Error(error));

      if (action === "skip") {
        return {
          alias: parsed.match,
          parsed,
          status: "skipped",
          error,
          duration: Date.now() - resolutionStart,
        };
      }

      return {
        alias: parsed.match,
        parsed,
        status: "failed",
        error,
        duration: Date.now() - resolutionStart,
      };
    }

    // Try resolution with retries
    let lastError: string | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const resource = await Promise.race([
          this.registry.get(parsed.name, parsed.args, context),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("timeout")), timeout)
          ),
        ]);

        if (resource.success) {
          return {
            alias: parsed.match,
            parsed,
            status: "resolved",
            resource: {
              value: resource.value,
              summary: resource.summary,
              tokenEstimate: resource.tokenEstimate,
            },
            duration: Date.now() - resolutionStart,
          };
        }

        lastError = resource.error;

        // Don't retry validation errors
        if (this.isValidationError(lastError)) {
          break;
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);

        // Don't retry timeouts
        if (lastError.toLowerCase().includes("timeout")) {
          break;
        }
      }

      // Wait before retry (exponential backoff)
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 100 * Math.pow(2, attempt)));
      }
    }

    // Determine action on error
    const errorObj = new Error(lastError || "Resolution failed");
    const action = onError?.(parsed.match, errorObj);

    // Try fallback if action is fallback or if fallback is available and action is not specified
    const fallbackValue = fallbacks[parsed.name];
    if (action === "fallback" && fallbackValue !== undefined) {
      return {
        alias: parsed.match,
        parsed,
        status: "fallback",
        fallback: fallbackValue,
        resource: {
          value: fallbackValue,
          summary: `[fallback]`,
          tokenEstimate: Math.ceil(String(fallbackValue).length / 4),
        },
        duration: Date.now() - resolutionStart,
      };
    }

    // Skip if requested
    if (action === "skip") {
      return {
        alias: parsed.match,
        parsed,
        status: "skipped",
        error: lastError,
        duration: Date.now() - resolutionStart,
      };
    }

    // Return failure
    return {
      alias: parsed.match,
      parsed,
      status: "failed",
      error: lastError,
      duration: Date.now() - resolutionStart,
    };
  }

  /**
   * Build enriched prompt with context section prepended
   */
  private buildEnrichedPrompt(
    originalPrompt: string,
    contextSection: string,
    warnings: string[]
  ): string {
    const parts: string[] = [];

    // Add context section if present
    if (contextSection) {
      parts.push(`<context>\n${contextSection}\n</context>`);
    }

    // Add warnings section if present
    if (warnings.length > 0) {
      parts.push(`<warnings>\n${warnings.join("\n")}\n</warnings>`);
    }

    // Add original prompt (keeping aliases intact)
    parts.push(originalPrompt);

    return parts.join("\n\n");
  }

  /**
   * Format a value for context output
   */
  private formatValue(value: unknown): string {
    if (value === null || value === undefined) {
      return "null";
    }
    if (typeof value === "string") {
      return value;
    }
    return JSON.stringify(value);
  }

  /**
   * Check if error is a validation error (don't retry)
   */
  private isValidationError(error?: string): boolean {
    if (!error) return false;
    const lower = error.toLowerCase();
    return (
      lower.includes("invalid") ||
      lower.includes("not found") ||
      lower.includes("unknown") ||
      lower.includes("required")
    );
  }

  /**
   * Check if error is critical (should stop processing)
   */
  private isCriticalError(error: string): boolean {
    const lower = error.toLowerCase();
    return (
      lower.includes("authentication") ||
      lower.includes("authorization") ||
      lower.includes("forbidden") ||
      lower.includes("api key")
    );
  }
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create a context injector with the default registry
 */
export function createContextInjector(
  registry: ResourceRegistry = defaultRegistry
): ContextInjector {
  return new ContextInjector(registry);
}

/**
 * Convenience function for one-shot context preparation
 *
 * @example
 * ```typescript
 * const prepared = await prepareAgentContext(
 *   "Apply @color(red) to @selection",
 *   registry,
 *   { executor, canvasId: "canvas-1" }
 * );
 * const response = await callAgent(prepared.enrichedPrompt);
 * ```
 */
export async function prepareAgentContext(
  task: string,
  registry: ResourceRegistry,
  context: ResourceContext,
  options?: PrepareOptions
): Promise<PreparedContext> {
  const injector = new ContextInjector(registry);
  return injector.prepare(task, context, options);
}
