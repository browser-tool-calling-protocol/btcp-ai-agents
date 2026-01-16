/**
 * Standardized Error Codes
 *
 * Centralized error codes for consistent error handling across all tools.
 * Each error code has a unique identifier and category.
 *
 * Categories:
 * - TOOL_*: Tool execution errors
 * - MCP_*: MCP communication errors
 * - HOOK_*: Hook-related errors
 * - AGENT_*: Agent/loop errors
 * - VALIDATION_*: Input validation errors
 */

/**
 * Tool execution error codes
 */
export const TOOL_ERROR_CODES = {
  // Read operations
  READ_FAILED: "TOOL_READ_FAILED",
  READ_TIMEOUT: "TOOL_READ_TIMEOUT",

  // Write operations
  WRITE_FAILED: "TOOL_WRITE_FAILED",
  WRITE_PARTIAL: "TOOL_WRITE_PARTIAL",

  // Edit operations
  EDIT_FAILED: "TOOL_EDIT_FAILED",
  EDIT_NO_TARGET: "TOOL_EDIT_NO_TARGET",
  EDIT_CONFLICT: "TOOL_EDIT_CONFLICT",

  // Find operations
  FIND_FAILED: "TOOL_FIND_FAILED",
  FIND_TIMEOUT: "TOOL_FIND_TIMEOUT",

  // Capture operations
  CAPTURE_FAILED: "TOOL_CAPTURE_FAILED",
  CAPTURE_REGION_INVALID: "TOOL_CAPTURE_REGION_INVALID",

  // Execute operations (BTCP)
  EXECUTE_FAILED: "TOOL_EXECUTE_FAILED",
  EXECUTE_TIMEOUT: "TOOL_EXECUTE_TIMEOUT",
  EXECUTE_SYNTAX_ERROR: "TOOL_EXECUTE_SYNTAX_ERROR",
  EXECUTE_SECURITY_ERROR: "TOOL_EXECUTE_SECURITY_ERROR",
  EXECUTE_LIMIT_EXCEEDED: "TOOL_EXECUTE_LIMIT_EXCEEDED",

  // Delegate operations
  DELEGATE_FAILED: "TOOL_DELEGATE_FAILED",
  DELEGATE_TIMEOUT: "TOOL_DELEGATE_TIMEOUT",
  DELEGATE_SUBAGENT_ERROR: "TOOL_DELEGATE_SUBAGENT_ERROR",

  // Verify operations
  VERIFY_FAILED: "TOOL_VERIFY_FAILED",
  VERIFY_CONSTRAINT_INVALID: "TOOL_VERIFY_CONSTRAINT_INVALID",

  // Layout operations
  LAYOUT_FAILED: "TOOL_LAYOUT_FAILED",
  LAYOUT_INVALID_ALGORITHM: "TOOL_LAYOUT_INVALID_ALGORITHM",

  // Style operations
  STYLE_FAILED: "TOOL_STYLE_FAILED",
  STYLE_INVALID_VALUE: "TOOL_STYLE_INVALID_VALUE",

  // Plan operations
  PLAN_FAILED: "TOOL_PLAN_FAILED",
  VALIDATION_FAILED: "TOOL_VALIDATION_FAILED",

  // Generic
  UNKNOWN_ERROR: "TOOL_UNKNOWN_ERROR",
} as const;

/**
 * MCP communication error codes
 */
export const MCP_ERROR_CODES = {
  CONNECTION_FAILED: "MCP_CONNECTION_FAILED",
  CONNECTION_TIMEOUT: "MCP_CONNECTION_TIMEOUT",
  EXECUTION_FAILED: "MCP_EXECUTION_FAILED",
  INVALID_RESPONSE: "MCP_INVALID_RESPONSE",
  SERVER_ERROR: "MCP_SERVER_ERROR",
} as const;

/**
 * Hook error codes
 */
export const HOOK_ERROR_CODES = {
  BLOCKED: "HOOK_BLOCKED",
  PRE_HOOK_FAILED: "HOOK_PRE_FAILED",
  POST_HOOK_FAILED: "HOOK_POST_FAILED",
  VALIDATION_FAILED: "HOOK_VALIDATION_FAILED",
} as const;

/**
 * Agent/loop error codes
 */
export const AGENT_ERROR_CODES = {
  GENERATION_FAILED: "AGENT_GENERATION_FAILED",
  EXECUTION_FAILED: "AGENT_EXECUTION_FAILED",
  MAX_ITERATIONS: "AGENT_MAX_ITERATIONS",
  TIMEOUT: "AGENT_TIMEOUT",
  CANCELLED: "AGENT_CANCELLED",
  STREAM_ERROR: "AGENT_STREAM_ERROR",
  API_KEY_MISSING: "AGENT_API_KEY_MISSING",
} as const;

/**
 * Validation error codes
 */
export const VALIDATION_ERROR_CODES = {
  MISSING_FIELD: "VALIDATION_MISSING_FIELD",
  INVALID_TYPE: "VALIDATION_INVALID_TYPE",
  INVALID_FORMAT: "VALIDATION_INVALID_FORMAT",
  OUT_OF_RANGE: "VALIDATION_OUT_OF_RANGE",
} as const;

/**
 * All error codes combined
 */
export const ERROR_CODES = {
  ...TOOL_ERROR_CODES,
  ...MCP_ERROR_CODES,
  ...HOOK_ERROR_CODES,
  ...AGENT_ERROR_CODES,
  ...VALIDATION_ERROR_CODES,
} as const;

/**
 * Type for all error codes
 */
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/**
 * Type for tool error codes
 */
export type ToolErrorCode = (typeof TOOL_ERROR_CODES)[keyof typeof TOOL_ERROR_CODES];

/**
 * Type for MCP error codes
 */
export type McpErrorCode = (typeof MCP_ERROR_CODES)[keyof typeof MCP_ERROR_CODES];

/**
 * Determine if an error is recoverable based on code
 */
export function isRecoverableError(code: ErrorCode): boolean {
  const recoverableCodes: ErrorCode[] = [
    ERROR_CODES.READ_TIMEOUT,
    ERROR_CODES.FIND_TIMEOUT,
    ERROR_CODES.CONNECTION_TIMEOUT,
    ERROR_CODES.DELEGATE_TIMEOUT,
    ERROR_CODES.EXECUTE_TIMEOUT,
    ERROR_CODES.EDIT_CONFLICT,
    ERROR_CODES.WRITE_PARTIAL,
  ];
  return recoverableCodes.includes(code);
}

/**
 * Get error category from code
 */
export function getErrorCategory(code: ErrorCode): string {
  if (code.startsWith("TOOL_")) return "tool";
  if (code.startsWith("MCP_")) return "mcp";
  if (code.startsWith("HOOK_")) return "hook";
  if (code.startsWith("AGENT_")) return "agent";
  if (code.startsWith("VALIDATION_")) return "validation";
  return "unknown";
}

/**
 * User-friendly error messages
 *
 * Maps error codes to human-readable messages that can be shown to end users.
 * Technical details should be logged separately for debugging.
 */
export const USER_FRIENDLY_MESSAGES: Record<string, string> = {
  // MCP errors
  [MCP_ERROR_CODES.CONNECTION_FAILED]:
    "The AI canvas service is currently unavailable. Please try again in a moment.",
  [MCP_ERROR_CODES.CONNECTION_TIMEOUT]:
    "The request took too long. Please try again.",
  [MCP_ERROR_CODES.EXECUTION_FAILED]:
    "Something went wrong while processing your request. Please try again.",
  [MCP_ERROR_CODES.INVALID_RESPONSE]:
    "Received an unexpected response. Please try again.",
  [MCP_ERROR_CODES.SERVER_ERROR]:
    "The AI service encountered an error. Please try again later.",

  // Agent errors
  [AGENT_ERROR_CODES.GENERATION_FAILED]:
    "I had trouble generating a response. Please try rephrasing your request.",
  [AGENT_ERROR_CODES.EXECUTION_FAILED]:
    "Something went wrong while working on your request. Please try again.",
  [AGENT_ERROR_CODES.MAX_ITERATIONS]:
    "This task is taking longer than expected. Try breaking it into smaller steps.",
  [AGENT_ERROR_CODES.TIMEOUT]:
    "The operation timed out. Please try a simpler request.",
  [AGENT_ERROR_CODES.CANCELLED]:
    "The operation was cancelled.",
  [AGENT_ERROR_CODES.STREAM_ERROR]:
    "Connection interrupted. Please try again.",
  [AGENT_ERROR_CODES.API_KEY_MISSING]:
    "AI service not configured. Please set the GOOGLE_GENERATIVE_AI_API_KEY environment variable.",

  // Tool errors
  [TOOL_ERROR_CODES.READ_FAILED]:
    "Couldn't read from the canvas. Please try again.",
  [TOOL_ERROR_CODES.READ_TIMEOUT]:
    "Reading the canvas took too long. Please try again.",
  [TOOL_ERROR_CODES.WRITE_FAILED]:
    "Couldn't update the canvas. Please try again.",
  [TOOL_ERROR_CODES.WRITE_PARTIAL]:
    "Some changes couldn't be saved. Please review and try again.",
  [TOOL_ERROR_CODES.EDIT_FAILED]:
    "Couldn't complete the edit. Please try again.",
  [TOOL_ERROR_CODES.EDIT_NO_TARGET]:
    "Couldn't find the element to edit. It may have been moved or deleted.",
  [TOOL_ERROR_CODES.EDIT_CONFLICT]:
    "Another change was made. Please refresh and try again.",
  [TOOL_ERROR_CODES.FIND_FAILED]:
    "Couldn't search the canvas. Please try again.",
  [TOOL_ERROR_CODES.FIND_TIMEOUT]:
    "Search took too long. Try a more specific query.",
  [TOOL_ERROR_CODES.CAPTURE_FAILED]:
    "Couldn't capture the canvas. Please try again.",
  [TOOL_ERROR_CODES.CAPTURE_REGION_INVALID]:
    "The selected area is invalid. Please select a different region.",
  [TOOL_ERROR_CODES.EXECUTE_FAILED]:
    "The script couldn't be executed. Please check your code and try again.",
  [TOOL_ERROR_CODES.EXECUTE_TIMEOUT]:
    "The script took too long to run. Please simplify your code.",
  [TOOL_ERROR_CODES.EXECUTE_SYNTAX_ERROR]:
    "There's a syntax error in the script. Please check your code.",
  [TOOL_ERROR_CODES.EXECUTE_SECURITY_ERROR]:
    "The script contains unsafe operations. Please use only allowed APIs.",
  [TOOL_ERROR_CODES.EXECUTE_LIMIT_EXCEEDED]:
    "The script exceeded its operation limit. Please break it into smaller steps.",
  [TOOL_ERROR_CODES.DELEGATE_FAILED]:
    "The AI assistant encountered an issue. Please try again.",
  [TOOL_ERROR_CODES.DELEGATE_TIMEOUT]:
    "The operation took too long. Try a simpler request.",
  [TOOL_ERROR_CODES.DELEGATE_SUBAGENT_ERROR]:
    "A helper process failed. Please try again.",
  [TOOL_ERROR_CODES.LAYOUT_FAILED]:
    "Couldn't arrange the elements. Please try again.",
  [TOOL_ERROR_CODES.LAYOUT_INVALID_ALGORITHM]:
    "That layout option isn't available. Please choose a different arrangement.",
  [TOOL_ERROR_CODES.STYLE_FAILED]:
    "Couldn't apply the style. Please try again.",
  [TOOL_ERROR_CODES.STYLE_INVALID_VALUE]:
    "That style value isn't valid. Please try a different value.",

  // Validation errors
  [VALIDATION_ERROR_CODES.MISSING_FIELD]:
    "Some required information is missing. Please provide more details.",
  [VALIDATION_ERROR_CODES.INVALID_TYPE]:
    "The input format is incorrect. Please check and try again.",
  [VALIDATION_ERROR_CODES.INVALID_FORMAT]:
    "The format isn't recognized. Please check and try again.",
  [VALIDATION_ERROR_CODES.OUT_OF_RANGE]:
    "A value is outside the allowed range. Please adjust and try again.",

  // Hook errors
  [HOOK_ERROR_CODES.BLOCKED]:
    "This action isn't allowed. Please try something else.",
  [HOOK_ERROR_CODES.PRE_HOOK_FAILED]:
    "Preparation failed. Please try again.",
  [HOOK_ERROR_CODES.POST_HOOK_FAILED]:
    "Follow-up processing failed, but changes may have been saved.",
  [HOOK_ERROR_CODES.VALIDATION_FAILED]:
    "The request couldn't be validated. Please check your input.",
};

/**
 * Get user-friendly message for an error code
 *
 * @param code - Error code or technical message
 * @returns User-friendly message suitable for display
 */
export function getUserFriendlyMessage(code: string): string {
  // Check if it's a known error code
  if (code in USER_FRIENDLY_MESSAGES) {
    return USER_FRIENDLY_MESSAGES[code];
  }

  // Check if the message contains an error code
  for (const [errorCode, friendlyMessage] of Object.entries(USER_FRIENDLY_MESSAGES)) {
    if (code.includes(errorCode)) {
      return friendlyMessage;
    }
  }

  // Default fallback for unknown errors
  return "Something went wrong. Please try again.";
}
