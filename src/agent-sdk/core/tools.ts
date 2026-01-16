/**
 * SDK Tool Configuration
 *
 * Tool management, presets, and permission handling
 * compatible with Claude Agent SDK.
 */

import { z } from "zod";
import { AGENT_TOOL_NAMES, type AgentToolName } from "../tools/generic-definitions.js";

// ============================================================================
// GENERIC AGENT TOOL NAMES
// ============================================================================

/**
 * Core agent tools (generic - domain agnostic)
 */
export const CORE_AGENT_TOOLS = [
  "context_read",
  "context_write",
  "context_search",
  "task_execute",
  "state_snapshot",
] as const;

/**
 * Extended agent tools (meta-level operations)
 */
export const EXTENDED_AGENT_TOOLS = [
  "agent_delegate",
  "agent_plan",
  "agent_clarify",
] as const;

/**
 * All agent tools
 */
export const ALL_AGENT_TOOLS = [
  ...CORE_AGENT_TOOLS,
  ...EXTENDED_AGENT_TOOLS,
] as const;

/**
 * Agent tool name type
 */
export type GenericToolName = (typeof ALL_AGENT_TOOLS)[number];

/**
 * SDK-compatible tool name (includes Task)
 */
export type SDKToolName = GenericToolName | "Task";

// ============================================================================
// TOOL CONFIGURATION OPTIONS
// ============================================================================

/**
 * Tool preset names
 */
export type ToolPreset =
  | "agent_full"       // All tools
  | "agent_read_only"  // Read-only tools
  | "agent_write"      // Read + write
  | "agent_minimal";   // Core tools only

/**
 * Tools option - allowlist or preset
 */
export type ToolsOption =
  | string[]                                    // Allowlist of tool names
  | { type: "preset"; preset: ToolPreset }     // Use a preset
  | { type: "all" }                             // All tools
  | { type: "none" };                           // No tools

/**
 * Tool presets mapping
 */
export const TOOL_PRESETS: Record<ToolPreset, readonly string[]> = {
  agent_full: ALL_AGENT_TOOLS,
  agent_read_only: ["context_read", "context_search", "state_snapshot"],
  agent_write: ["context_read", "context_write", "context_search"],
  agent_minimal: CORE_AGENT_TOOLS,
};

/**
 * Resolve tools option to list of tool names
 */
export function resolveTools(option: ToolsOption): string[] {
  if (Array.isArray(option)) {
    return option;
  }

  switch (option.type) {
    case "preset":
      return [...TOOL_PRESETS[option.preset]];
    case "all":
      return [...ALL_AGENT_TOOLS, "Task"];
    case "none":
      return [];
    default:
      return [...CORE_AGENT_TOOLS];
  }
}

// ============================================================================
// TOOL PERMISSION HANDLING
// ============================================================================

/**
 * Tool permission request
 */
export interface ToolPermissionRequest {
  /** Tool name */
  tool: string;
  /** Tool input parameters */
  input: unknown;
  /** Session ID */
  sessionId?: string;
  /** Request context */
  context?: {
    /** Number of times this tool has been called */
    callCount: number;
    /** Previous approval status */
    previouslyApproved?: boolean;
  };
}

/**
 * Tool permission result
 */
export interface ToolPermissionResult {
  /** Whether the tool is allowed */
  allowed: boolean;
  /** Reason for the decision */
  reason?: string;
  /** Modified input (if transforming) */
  modifiedInput?: unknown;
  /** Remember this decision for future calls */
  remember?: boolean;
}

/**
 * Tool permission handler type
 */
export type CanUseToolHandler = (
  request: ToolPermissionRequest
) => Promise<ToolPermissionResult> | ToolPermissionResult;

/**
 * Create an auto-approve handler (allows all tools)
 */
export function createAutoApproveHandler(): CanUseToolHandler {
  return () => ({ allowed: true });
}

/**
 * Create a blocklist handler
 */
export function createBlocklistHandler(
  blockedTools: string[]
): CanUseToolHandler {
  return (request) => {
    if (blockedTools.includes(request.tool)) {
      return {
        allowed: false,
        reason: `Tool ${request.tool} is blocked`,
      };
    }
    return { allowed: true };
  };
}

/**
 * Create an allowlist handler
 */
export function createAllowlistHandler(
  allowedTools: string[]
): CanUseToolHandler {
  return (request) => {
    if (!allowedTools.includes(request.tool)) {
      return {
        allowed: false,
        reason: `Tool ${request.tool} is not in allowlist`,
      };
    }
    return { allowed: true };
  };
}

/**
 * Create a confirmation handler (always requires approval)
 */
export function createConfirmationHandler(
  onConfirm: (request: ToolPermissionRequest) => Promise<boolean>
): CanUseToolHandler {
  return async (request) => {
    const approved = await onConfirm(request);
    return {
      allowed: approved,
      reason: approved ? undefined : "User denied permission",
    };
  };
}

/**
 * Combine multiple permission handlers (all must approve)
 */
export function combineHandlers(
  ...handlers: CanUseToolHandler[]
): CanUseToolHandler {
  return async (request) => {
    for (const handler of handlers) {
      const result = await handler(request);
      if (!result.allowed) {
        return result;
      }
      // Pass modified input to next handler
      if (result.modifiedInput !== undefined) {
        request = { ...request, input: result.modifiedInput };
      }
    }
    return { allowed: true };
  };
}

// ============================================================================
// TOOL DEFINITION TYPES
// ============================================================================

/**
 * Tool definition schema
 */
export interface ToolDefinition<T extends z.ZodType = z.ZodType> {
  /** Tool name */
  name: string;
  /** Tool description */
  description: string;
  /** Input schema (Zod) */
  inputSchema: T;
  /** Output schema (optional) */
  outputSchema?: z.ZodType;
  /** Whether this tool is dangerous */
  dangerous?: boolean;
  /** Categories/tags for grouping */
  categories?: string[];
}

/**
 * Tool execution context
 */
export interface ToolContext {
  /** Session ID */
  sessionId?: string;
  /** Abort signal for cancellation */
  abortSignal?: AbortSignal;
  /** Loop options (for sub-agent delegation) */
  loopOptions?: unknown;
}

/**
 * Tool execution result
 */
export interface ToolResult<T = unknown> {
  /** Whether execution succeeded */
  success: boolean;
  /** Result data */
  data?: T;
  /** Error message if failed */
  error?: string;
  /** Execution duration in ms */
  duration?: number;
}

// ============================================================================
// TOOL CATEGORIES
// ============================================================================

/**
 * Tool categories for organization
 */
export const TOOL_CATEGORIES = {
  read: ["context_read", "context_search", "state_snapshot"],
  write: ["context_write"],
  meta: ["agent_plan", "agent_delegate", "agent_clarify", "task_execute", "Task"],
} as const;

/**
 * Get tools by category
 */
export function getToolsByCategory(category: keyof typeof TOOL_CATEGORIES): string[] {
  return [...TOOL_CATEGORIES[category]];
}

/**
 * Check if tool is in category
 */
export function isToolInCategory(
  tool: string,
  category: keyof typeof TOOL_CATEGORIES
): boolean {
  return TOOL_CATEGORIES[category].includes(tool as never);
}

/**
 * Get category for tool
 */
export function getToolCategory(tool: string): keyof typeof TOOL_CATEGORIES | undefined {
  for (const [category, tools] of Object.entries(TOOL_CATEGORIES)) {
    if (tools.includes(tool as never)) {
      return category as keyof typeof TOOL_CATEGORIES;
    }
  }
  return undefined;
}

// ============================================================================
// TOOL VALIDATION
// ============================================================================

/**
 * Validate tool input against schema
 */
export function validateToolInput<T extends z.ZodType>(
  definition: ToolDefinition<T>,
  input: unknown
): { success: true; data: z.infer<T> } | { success: false; error: string } {
  const result = definition.inputSchema.safeParse(input);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return {
    success: false,
    error: result.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", "),
  };
}

/**
 * Check if tool exists
 */
export function isValidTool(name: string): name is SDKToolName {
  return ALL_AGENT_TOOLS.includes(name as GenericToolName) || name === "Task";
}

// ============================================================================
// TOOL DOCUMENTATION
// ============================================================================

/**
 * Tool documentation
 */
export const TOOL_DOCS: Record<string, { summary: string; examples: string[] }> = {
  context_read: {
    summary: "Read context, memory, or history",
    examples: [
      'context_read({ scope: "session" })',
      'context_read({ key: "user_preferences" })',
    ],
  },
  context_write: {
    summary: "Write to context or memory",
    examples: [
      'context_write({ key: "result", value: { status: "complete" } })',
    ],
  },
  context_search: {
    summary: "Search through context by pattern or query",
    examples: [
      'context_search({ query: "error messages" })',
    ],
  },
  task_execute: {
    summary: "Execute an action through the registered adapter",
    examples: [
      'task_execute({ action: "create_item", params: { name: "test" } })',
    ],
  },
  state_snapshot: {
    summary: "Capture a state checkpoint",
    examples: [
      'state_snapshot({ name: "before_changes", description: "State before modifications" })',
    ],
  },
  agent_delegate: {
    summary: "Delegate a subtask to a specialized agent",
    examples: [
      'agent_delegate({ agent: "analyzer-agent", task: "Analyze the current state" })',
    ],
  },
  agent_plan: {
    summary: "Create or update an execution plan",
    examples: [
      'agent_plan({ goal: "Implement feature X", steps: [...] })',
    ],
  },
  agent_clarify: {
    summary: "Request clarification from the user",
    examples: [
      'agent_clarify({ question: "Which format do you prefer?", options: ["JSON", "XML"] })',
    ],
  },
  Task: {
    summary: "Delegate complex tasks to specialized sub-agents",
    examples: [
      'Task({ description: "Analyze data", prompt: "...", subagent_type: "analyzer-agent" })',
    ],
  },
};

/**
 * Get tool documentation
 */
export function getToolDocs(tool: string): { summary: string; examples: string[] } | undefined {
  return TOOL_DOCS[tool];
}
