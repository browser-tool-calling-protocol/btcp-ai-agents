/**
 * Hooks System - Observability & Control
 *
 * Pattern 5: Pre/Post Hooks for Observability
 * Complete audit trail, UI updates, security enforcement, metrics.
 *
 * @example
 * ```typescript
 * import {
 *   HooksManager,
 *   hooksManager,
 *   CommonHooks,
 *   createHooksManager,
 * } from '@waiboard/ai-agents/hooks';
 *
 * // Use default instance
 * hooksManager.onPostToolUse(CommonHooks.logOperations);
 * hooksManager.onPreToolUse(CommonHooks.rateLimit(10, 1000)); // 10 ops per second
 *
 * // Or create custom instance
 * const hooks = createHooksManager();
 *
 * // Block specific tools
 * hooks.onPreToolUse(CommonHooks.blockTools(['dangerous_tool']));
 *
 * // Track calls
 * const tracker = CommonHooks.trackCalls();
 * hooks.onPostToolUse(tracker.handler);
 * console.log(tracker.getCalls());
 *
 * // Get metrics
 * console.log(hooks.getMetrics());
 * // => { read: { calls: 5, errors: 0, avgDuration: 120, p95Duration: 200 } }
 * ```
 */

// =============================================================================
// Types
// =============================================================================

export type {
  HookType,
  HookContext,
  HookHandler,
  HookResult,
  AgentResources,
  TaskStatus,
  OperationRecord,
  ErrorRecord,
  OperationMetrics,
  OperationMetricsSummary,
  HookConfig,
  HooksManagerConfig,
} from "./types.js";

// =============================================================================
// Manager
// =============================================================================

export {
  HooksManager,
  hooksManager,
  CommonHooks,
  createHooksManager,
  createHooksManagerWithDefaults,
} from "./manager.js";

// =============================================================================
// Agent Hooks (Pattern 5)
// =============================================================================

// Note: Canvas-specific hooks have been removed in favor of generic hooks
// The HooksManager provides equivalent functionality for any agent type
