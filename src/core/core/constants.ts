/**
 * SDK Constants
 *
 * Native configuration defaults and limits for the SDK.
 * Single source of truth for model IDs and configuration.
 *
 * @module @waiboard/ai-agents/core
 *
 * @example
 * ```typescript
 * import { DEFAULTS, LIMITS, MODELS, MODEL_IDS } from '@waiboard/ai-agents/core';
 *
 * console.log(DEFAULTS.maxIterations); // 20
 * console.log(LIMITS.maxErrors); // 3
 * console.log(MODELS.google.balanced); // 'gemini-2.5-flash'
 * ```
 */

import type { ModelPreference, ModelProvider } from "../types/index.js";

// ============================================================================
// MODEL CONFIGURATION
// ============================================================================

/**
 * Model IDs by provider and preference tier
 *
 * Models mapped by preference tier:
 * - fast: Optimized for speed and cost
 * - balanced: Good balance of speed and capability
 * - powerful: Most capable model
 *
 * Google Gemini: gemini-2.5-flash-lite (fast), gemini-2.5-flash (balanced), gemini-2.5-pro (powerful)
 * OpenAI: gpt-4o-mini (fast), gpt-4o (balanced/powerful)
 */
export const MODEL_IDS_BY_PROVIDER: Readonly<
  Record<ModelProvider, Record<ModelPreference, string>>
> = {
  google: {
    fast: "gemini-2.5-flash-lite",
    balanced: "gemini-2.5-flash",
    powerful: "gemini-2.5-pro",
  },
  openai: {
    fast: "gpt-4o-mini",
    balanced: "gpt-4o",
    powerful: "gpt-4o",
  },
} as const;

/**
 * Legacy MODEL_IDS - maps to default provider (Google Gemini)
 * @deprecated Use MODEL_IDS_BY_PROVIDER with explicit provider instead
 */
export const MODEL_IDS: Readonly<Record<ModelPreference, string>> =
  MODEL_IDS_BY_PROVIDER.google;

/**
 * Default model configuration
 */
export const MODEL_DEFAULTS = {
  provider: "google" as const satisfies ModelProvider,
  model: "balanced" as const satisfies ModelPreference,
  maxTokens: 8192,
  temperature: 0.7,
} as const;

// ============================================================================
// AGENT LOOP DEFAULTS
// ============================================================================

/**
 * Default configuration values for the agentic loop
 */
export const LOOP_DEFAULTS = {
  /** Default model preference */
  model: "balanced" as const satisfies ModelPreference,
  /** Maximum iterations before timeout */
  maxIterations: 20,
  /** Token budget for context */
  tokenBudget: 200_000,
  /** Auto-detect agent mode from task */
  autoDetectMode: true,
  /** Enable @alias resolution */
  enableAliasResolution: true,
  /** Save checkpoint every N iterations */
  checkpointInterval: 5,
  /** Enable parallel delegation */
  enableParallelDelegation: true,
  /** Maximum entries in operation history */
  maxHistoryEntries: 50,
} as const;

// ============================================================================
// ERROR LIMITS
// ============================================================================

/**
 * Error handling configuration
 */
export const ERROR_LIMITS = {
  /** Maximum errors before failing */
  maxErrors: 3,
  /** Maximum retries for transient failures */
  maxRetries: 3,
} as const;

// ============================================================================
// SDK-ALIGNED CONSTANTS
// ============================================================================

/**
 * Model configuration by provider
 */
export const MODELS = MODEL_IDS_BY_PROVIDER;

/**
 * Default configuration values
 */
export const DEFAULTS = {
  /** Model configuration */
  model: MODEL_DEFAULTS,
  /** Agentic loop settings */
  loop: LOOP_DEFAULTS,
} as const;

/**
 * Error and retry limits
 */
export const LIMITS = ERROR_LIMITS;

/**
 * Sub-agent configuration
 */
export const SUBAGENT_CONFIG = {
  /** Maximum iterations for sub-agents */
  maxIterations: 10,
  /** Token budget for sub-agents */
  tokenBudget: 50_000,
  /** Average tokens per tool result (for metrics) */
  avgTokensPerToolResult: 800,
} as const;

/**
 * Token budgets by use case
 */
export const TOKEN_BUDGETS = {
  /** Standard query */
  standard: 200_000,
  /** Sub-agent execution */
  subagent: 50_000,
  /** Context window for analysis */
  analysis: 100_000,
} as const;
