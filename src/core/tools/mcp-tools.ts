/**
 * MCP Tool Name Constants
 *
 * @deprecated This file is deprecated. Tools now pass through directly to MCP
 * using high-level tool names (canvas_read, canvas_write, canvas_edit, canvas_find,
 * canvas_capture, canvas_verify). Low-level MCP tool names are no longer used
 * by the ai-agents package.
 *
 * @see packages/canvas-mcp/src/tools.ts for tool implementations
 */

/**
 * Canvas MCP tool names
 */
export const MCP_TOOLS = {
  // Canvas state
  CANVAS_STATUS: "mcp__canvas__canvas_status",

  // Element operations
  EL_QUERY: "mcp__canvas__el_query",
  EL_GET_BY_ID: "mcp__canvas__el_getById",
  EL_CREATE: "mcp__canvas__el_create",
  EL_UPDATE: "mcp__canvas__el_update",
  EL_DELETE: "mcp__canvas__el_delete",

  // Viewport operations
  VIEWPORT_GET: "mcp__canvas__viewport_get",

  // Selection operations
  SELECTION_GET: "mcp__canvas__selection_get",

  // Capture operations
  CAPTURE: "mcp__canvas__capture",
} as const;

/**
 * Type for MCP tool names
 */
export type McpToolName = (typeof MCP_TOOLS)[keyof typeof MCP_TOOLS];
