/**
 * Context Integration
 *
 * Integrates the ContextInjector (for alias/resource resolution) with
 * the ContextManager (for token budget and tiered memory).
 *
 * This allows seamless handling of @alias syntax while maintaining
 * optimal token usage across the context window.
 *
 * @example
 * ```typescript
 * import { createIntegratedContext } from '@waiboard/ai-agents/context';
 *
 * const ctx = createIntegratedContext({
 *   maxTokens: 200_000,
 *   registry: resourceRegistry,
 * });
 *
 * // Add system prompt
 * ctx.addSystemMessage('You are a helpful canvas assistant.');
 *
 * // User message with aliases - automatically resolved
 * await ctx.addUserMessageWithAliases(
 *   'Fill @selection with @color(red)',
 *   { executor, canvasId: 'canvas-1' }
 * );
 *
 * // Prepare for API call
 * const prepared = await ctx.prepareForRequest();
 * // Messages include resolved alias context
 * ```
 */

import { ContextManager, createContextManager } from "./manager.js";
import { createMessage } from "./memory.js";
import {
  MessagePriority,
  type ContextManagerConfig,
  type ContextMessage,
  type PreparedRequest,
  type MemoryTier,
} from "./types.js";
import {
  ContextInjector,
  prepareAgentContext,
  type PrepareOptions as InjectorOptions,
  type PreparedContext,
} from "../resources/context.js";
import { ResourceRegistry, defaultRegistry } from "../resources/registry.js";
import type { ResourceContext } from "../resources/types.js";

// =============================================================================
// Types
// =============================================================================

export interface IntegratedContextConfig extends Partial<ContextManagerConfig> {
  /** Resource registry for alias resolution */
  registry?: ResourceRegistry;

  /** Default resource context (executor, canvasId) */
  defaultResourceContext?: ResourceContext;

  /** Token budget allocation for resources (percentage of total) */
  resourceBudgetRatio?: number;
}

export interface AddWithAliasesOptions extends Partial<InjectorOptions> {
  /** Override resource context for this message */
  resourceContext?: ResourceContext;

  /** Include context section in message */
  includeContextSection?: boolean;

  /** Add as separate resource message instead of enriching original */
  separateResourceMessage?: boolean;
}

// =============================================================================
// Integrated Context Manager
// =============================================================================

/**
 * Context manager with integrated alias resolution.
 */
export class IntegratedContextManager {
  private manager: ContextManager;
  private injector: ContextInjector;
  private defaultResourceContext: ResourceContext;
  private resourceBudgetRatio: number;

  constructor(config: IntegratedContextConfig = {}) {
    // Create context manager
    this.manager = createContextManager({
      maxTokens: config.maxTokens,
      tieredMemory: config.tieredMemory,
      responseReserve: config.responseReserve,
      toolReserve: config.toolReserve,
      enableCaching: config.enableCaching,
      onCompression: config.onCompression,
      onEviction: config.onEviction,
    });

    // Create injector
    const registry = config.registry ?? defaultRegistry;
    this.injector = new ContextInjector(registry);

    // Defaults
    this.defaultResourceContext = config.defaultResourceContext ?? {};
    this.resourceBudgetRatio = config.resourceBudgetRatio ?? 0.1;
  }

  // ===========================================================================
  // Message Methods (delegate to manager)
  // ===========================================================================

  addSystemMessage(content: string): ContextMessage {
    return this.manager.addSystemMessage(content);
  }

  addAssistantMessage(content: string, metadata?: Record<string, unknown>): ContextMessage {
    return this.manager.addAssistantMessage(content, metadata);
  }

  addToolResult(
    toolUseId: string,
    toolName: string,
    content: string,
    isError?: boolean
  ): ContextMessage {
    return this.manager.addToolResult(toolUseId, toolName, content, isError);
  }

  addMessage(message: ContextMessage, options?: { tier?: MemoryTier }): void {
    this.manager.addMessage(message, options);
  }

  // ===========================================================================
  // Alias-Aware Methods
  // ===========================================================================

  /**
   * Add a user message, resolving any aliases.
   */
  async addUserMessageWithAliases(
    content: string,
    options: AddWithAliasesOptions = {}
  ): Promise<{ message: ContextMessage; context?: PreparedContext }> {
    const resourceContext = {
      ...this.defaultResourceContext,
      ...options.resourceContext,
    };

    // Check if message needs alias resolution
    if (!this.injector.needsPreparation(content)) {
      const message = this.manager.addUserMessage(content);
      return { message };
    }

    // Calculate token budget for resources
    const resourceBudget = Math.floor(
      this.manager.getBudget().remainingTokens * this.resourceBudgetRatio
    );

    // Prepare context with alias resolution
    const prepared = await this.injector.prepare(content, resourceContext, {
      tokenBudget: options.tokenBudget ?? resourceBudget,
      failFast: options.failFast,
      fallbacks: options.fallbacks,
      skip: options.skip,
      onError: options.onError,
      maxRetries: options.maxRetries,
      timeout: options.timeout,
    });

    // Add the message(s)
    if (options.separateResourceMessage && prepared.contextSection) {
      // Add resource context as separate message
      const resourceMsg = createMessage("user", prepared.contextSection, {
        metadata: {
          type: "resource_context",
          aliases: prepared.resolutions.map((r) => r.alias),
        },
        priority: MessagePriority.HIGH, // Higher than normal user messages
      });
      this.manager.addMessage(resourceMsg, { tier: "resources" as MemoryTier });

      // Add original message
      const userMsg = this.manager.addUserMessage(content);
      return { message: userMsg, context: prepared };
    } else {
      // Add enriched message
      const messageContent = options.includeContextSection !== false
        ? prepared.enrichedPrompt
        : content;

      const userMsg = createMessage("user", messageContent, {
        metadata: {
          hasAliases: true,
          aliasCount: prepared.stats.total,
          resolvedCount: prepared.stats.resolved,
        },
      });
      this.manager.addMessage(userMsg);
      return { message: userMsg, context: prepared };
    }
  }

  /**
   * Simple add user message without alias resolution.
   */
  addUserMessage(content: string, metadata?: Record<string, unknown>): ContextMessage {
    return this.manager.addUserMessage(content, metadata);
  }

  // ===========================================================================
  // Preparation Methods
  // ===========================================================================

  /**
   * Prepare context for API request.
   */
  async prepareForRequest(
    options?: Parameters<ContextManager["prepareForRequest"]>[0]
  ): Promise<PreparedRequest> {
    return this.manager.prepareForRequest(options);
  }

  /**
   * Convert to API format.
   */
  toApiFormat(): Array<{ role: string; content: string }> {
    return this.manager.toApiFormat();
  }

  // ===========================================================================
  // Introspection
  // ===========================================================================

  /**
   * Get the underlying context manager.
   */
  getManager(): ContextManager {
    return this.manager;
  }

  /**
   * Get the underlying injector.
   */
  getInjector(): ContextInjector {
    return this.injector;
  }

  /**
   * Get all messages.
   */
  getMessages(): ContextMessage[] {
    return this.manager.getMessages();
  }

  /**
   * Get budget breakdown.
   */
  getBudgetBreakdown() {
    return this.manager.getBudgetBreakdown();
  }

  /**
   * Get statistics.
   */
  getStats() {
    return this.manager.getStats();
  }

  /**
   * Clear all context.
   */
  clear(): void {
    this.manager.clear();
  }

  /**
   * Update default resource context.
   */
  setDefaultResourceContext(context: ResourceContext): void {
    this.defaultResourceContext = context;
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create an integrated context manager.
 */
export function createIntegratedContext(
  config?: IntegratedContextConfig
): IntegratedContextManager {
  return new IntegratedContextManager(config);
}

/**
 * Quick function to prepare a prompt with alias resolution.
 *
 * @example
 * ```typescript
 * const result = await preparePromptWithAliases(
 *   'Fill @selection with @color(red)',
 *   resourceContext,
 *   { tokenBudget: 1000 }
 * );
 * console.log(result.enrichedPrompt);
 * ```
 */
export async function preparePromptWithAliases(
  prompt: string,
  resourceContext: ResourceContext,
  options?: Partial<InjectorOptions>,
  registry?: ResourceRegistry
): Promise<PreparedContext> {
  return prepareAgentContext(prompt, registry ?? defaultRegistry, resourceContext, options);
}

// =============================================================================
// Re-exports for convenience
// =============================================================================

export type { PreparedContext, InjectorOptions };
