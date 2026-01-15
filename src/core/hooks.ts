/**
 * SDK Hook Types
 *
 * Claude Agent SDK-compatible hook system for lifecycle events.
 * Hooks enable observability, validation, and behavior modification.
 *
 * @see https://platform.claude.com/docs/en/agent-sdk/typescript
 */

// ============================================================================
// HOOK EVENT TYPES (SDK-Compatible)
// ============================================================================

/**
 * Hook event types aligned with Claude Agent SDK
 */
export type HookEventType =
  // Tool lifecycle
  | "PreToolUse"          // Before tool execution
  | "PostToolUse"         // After successful tool execution
  | "PostToolUseFailure"  // After failed tool execution

  // User interaction
  | "Notification"        // System notifications
  | "UserPromptSubmit"    // User submits a prompt

  // Session lifecycle
  | "SessionStart"        // Session begins
  | "SessionEnd"          // Session ends
  | "Stop"                // Agent stops (user interrupt or completion)

  // Sub-agent lifecycle
  | "SubagentStart"       // Sub-agent spawned
  | "SubagentStop"        // Sub-agent completed

  // Context management
  | "PreCompact"          // Before context compaction

  // Permissions
  | "PermissionRequest";  // Tool permission requested

/**
 * Legacy hook type aliases (deprecated)
 * @deprecated Use PascalCase HookEventType instead
 */
export type LegacyHookType =
  | "pre-tool-use"
  | "post-tool-use"
  | "pre-step"
  | "post-step"
  | "context-change"
  | "error"
  | "checkpoint"
  | "session-start"
  | "session-end";

/**
 * All hook types (SDK + legacy)
 */
export type HookType = HookEventType | LegacyHookType;

// ============================================================================
// HOOK INPUT TYPES
// ============================================================================

/**
 * Base hook input
 */
export interface HookInputBase {
  /** Event type */
  type: HookType;
  /** Session ID */
  sessionId?: string;
  /** Event timestamp */
  timestamp: number;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Tool hook input
 */
export interface ToolHookInput extends HookInputBase {
  type: "PreToolUse" | "PostToolUse" | "PostToolUseFailure" | "pre-tool-use" | "post-tool-use";
  /** Tool name */
  tool: string;
  /** Tool input parameters */
  toolInput: unknown;
  /** Tool result (for post hooks) */
  toolResult?: unknown;
  /** Error (for failure hooks) */
  error?: Error;
  /** Execution duration in ms (for post hooks) */
  duration?: number;
}

/**
 * Session hook input
 */
export interface SessionHookInput extends HookInputBase {
  type: "SessionStart" | "SessionEnd" | "session-start" | "session-end";
  /** Session ID */
  sessionId: string;
  /** Session configuration */
  config?: Record<string, unknown>;
  /** Final result (for SessionEnd) */
  result?: unknown;
}

/**
 * Sub-agent hook input
 */
export interface SubagentHookInput extends HookInputBase {
  type: "SubagentStart" | "SubagentStop";
  /** Sub-agent ID */
  subagentId: string;
  /** Sub-agent type */
  subagentType: string;
  /** Task delegated to sub-agent */
  task: string;
  /** Result (for SubagentStop) */
  result?: unknown;
  /** Duration (for SubagentStop) */
  duration?: number;
}

/**
 * Permission request input
 */
export interface PermissionRequestInput extends HookInputBase {
  type: "PermissionRequest";
  /** Tool requesting permission */
  tool: string;
  /** Tool input */
  toolInput: unknown;
  /** Reason for the request */
  reason?: string;
}

/**
 * User prompt input
 */
export interface UserPromptInput extends HookInputBase {
  type: "UserPromptSubmit";
  /** User's prompt */
  prompt: string;
  /** Previous context */
  context?: unknown;
}

/**
 * Notification input
 */
export interface NotificationInput extends HookInputBase {
  type: "Notification";
  /** Notification level */
  level: "info" | "warning" | "error";
  /** Notification message */
  message: string;
}

/**
 * Context compaction input
 */
export interface CompactInput extends HookInputBase {
  type: "PreCompact";
  /** Current token count */
  tokenCount: number;
  /** Target token count */
  targetTokens: number;
  /** Messages to be compacted */
  messageCount: number;
}

/**
 * Stop input
 */
export interface StopInput extends HookInputBase {
  type: "Stop";
  /** Stop reason */
  reason: "user_interrupt" | "max_turns" | "max_budget" | "completion" | "error";
  /** Final state summary */
  summary?: string;
}

/**
 * Union of all hook inputs
 */
export type HookInput =
  | ToolHookInput
  | SessionHookInput
  | SubagentHookInput
  | PermissionRequestInput
  | UserPromptInput
  | NotificationInput
  | CompactInput
  | StopInput
  | HookInputBase;

// ============================================================================
// HOOK OUTPUT TYPES
// ============================================================================

/**
 * Hook output for controlling execution
 */
export interface HookOutput {
  /** Whether to proceed with the operation */
  proceed?: boolean;
  /** Reason for blocking (if proceed is false) */
  reason?: string;
  /** Modified input (for PreToolUse hooks) */
  modifiedInput?: unknown;
  /** System message to inject */
  systemMessage?: string;
  /** Custom data to pass through */
  data?: Record<string, unknown>;
}

/**
 * Permission approval output
 */
export interface PermissionOutput extends HookOutput {
  /** Whether permission is granted */
  allowed: boolean;
  /** Expiration for this approval (ms) */
  expiresIn?: number;
  /** Remember this decision */
  remember?: boolean;
}

// ============================================================================
// HOOK HANDLER TYPES
// ============================================================================

/**
 * Synchronous hook handler
 */
export type SyncHookHandler = (input: HookInput) => HookOutput | void;

/**
 * Asynchronous hook handler
 */
export type AsyncHookHandler = (input: HookInput) => Promise<HookOutput | void>;

/**
 * Hook handler (sync or async)
 */
export type HookHandler = SyncHookHandler | AsyncHookHandler;

// ============================================================================
// HOOK CONFIGURATION
// ============================================================================

/**
 * Hook event matchers
 */
export interface HookMatcher {
  /** Match specific tools */
  tools?: string[];
  /** Match specific sub-agent types */
  subagentTypes?: string[];
  /** Custom matcher function */
  match?: (input: HookInput) => boolean;
}

/**
 * Hook configuration
 */
export interface HookConfig {
  /** Hook event type(s) to listen for */
  type: HookType | HookType[];
  /** Handler function */
  handler: HookHandler;
  /** Optional matchers to filter events */
  matcher?: HookMatcher;
  /** Hook priority (lower runs first) */
  priority?: number;
  /** Whether hook is enabled */
  enabled?: boolean;
  /** Hook name (for debugging) */
  name?: string;
}

// ============================================================================
// HOOK UTILITIES
// ============================================================================

/**
 * Normalize legacy hook type to SDK format
 */
export function normalizeHookType(type: HookType): HookEventType {
  const mapping: Record<LegacyHookType, HookEventType> = {
    "pre-tool-use": "PreToolUse",
    "post-tool-use": "PostToolUse",
    "pre-step": "PreToolUse",
    "post-step": "PostToolUse",
    "context-change": "PreCompact",
    "error": "PostToolUseFailure",
    "checkpoint": "PreCompact",
    "session-start": "SessionStart",
    "session-end": "SessionEnd",
  };

  return mapping[type as LegacyHookType] || (type as HookEventType);
}

/**
 * Check if a hook matches the given input
 */
export function matchesHook(config: HookConfig, input: HookInput): boolean {
  // Check type match
  const types = Array.isArray(config.type) ? config.type : [config.type];
  const normalizedInputType = normalizeHookType(input.type);
  const typeMatch = types.some(
    (t) => normalizeHookType(t) === normalizedInputType
  );

  if (!typeMatch) return false;

  // Check enabled
  if (config.enabled === false) return false;

  // Check matcher
  if (config.matcher) {
    // Tool matcher
    if (config.matcher.tools && "tool" in input) {
      if (!config.matcher.tools.includes(input.tool)) return false;
    }

    // Sub-agent matcher
    if (config.matcher.subagentTypes && "subagentType" in input) {
      if (!config.matcher.subagentTypes.includes(input.subagentType)) return false;
    }

    // Custom matcher
    if (config.matcher.match && !config.matcher.match(input)) return false;
  }

  return true;
}

/**
 * Sort hooks by priority
 */
export function sortHooksByPriority(hooks: HookConfig[]): HookConfig[] {
  return [...hooks].sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
}

// ============================================================================
// HOOK PRESETS
// ============================================================================

/**
 * Logging hook preset
 */
export function createLoggingHook(
  logger: (message: string, data?: unknown) => void
): HookConfig {
  return {
    type: ["PreToolUse", "PostToolUse", "SessionStart", "SessionEnd"],
    name: "logging",
    priority: 1000, // Run last
    handler: (input) => {
      const type = normalizeHookType(input.type);
      const data = { ...input };
      delete data.metadata;
      logger(`[${type}]`, data);
    },
  };
}

/**
 * Tool timing hook preset
 */
export function createTimingHook(
  onTiming: (tool: string, duration: number) => void
): HookConfig {
  const startTimes = new Map<string, number>();

  return {
    type: ["PreToolUse", "PostToolUse"],
    name: "timing",
    priority: 0, // Run first
    handler: (input) => {
      if (input.type === "PreToolUse" && "tool" in input) {
        startTimes.set(input.tool, Date.now());
      } else if (input.type === "PostToolUse" && "tool" in input) {
        const start = startTimes.get(input.tool);
        if (start) {
          onTiming(input.tool, Date.now() - start);
          startTimes.delete(input.tool);
        }
      }
    },
  };
}

/**
 * Tool blocklist hook preset
 */
export function createBlocklistHook(blockedTools: string[]): HookConfig {
  return {
    type: "PreToolUse",
    name: "blocklist",
    priority: 0,
    handler: (input) => {
      if ("tool" in input && blockedTools.includes(input.tool)) {
        return {
          proceed: false,
          reason: `Tool ${input.tool} is blocked`,
        };
      }
    },
  };
}

/**
 * Rate limiting hook preset
 */
export function createRateLimitHook(
  maxCallsPerMinute: number
): HookConfig {
  const calls: number[] = [];

  return {
    type: "PreToolUse",
    name: "rate-limit",
    priority: 1,
    handler: () => {
      const now = Date.now();
      const oneMinuteAgo = now - 60_000;

      // Remove old calls
      while (calls.length > 0 && calls[0] < oneMinuteAgo) {
        calls.shift();
      }

      if (calls.length >= maxCallsPerMinute) {
        return {
          proceed: false,
          reason: `Rate limit exceeded (${maxCallsPerMinute} calls/minute)`,
        };
      }

      calls.push(now);
    },
  };
}
