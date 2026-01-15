/**
 * BTCP (Browser Tool Calling Protocol) Types
 *
 * Type definitions for the Browser Tool Calling Protocol based on:
 * https://github.com/browser-tool-calling-protocol/btcp-client
 *
 * The protocol uses JSON-RPC 2.0 over HTTP with SSE for push notifications.
 */

import { z } from "zod";

// ============================================================================
// JSON-RPC 2.0 BASE TYPES
// ============================================================================

/**
 * JSON-RPC 2.0 request
 */
export interface JsonRpcRequest<T = unknown> {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: T;
}

/**
 * JSON-RPC 2.0 response (success)
 */
export interface JsonRpcResponse<T = unknown> {
  jsonrpc: "2.0";
  id: string | number;
  result: T;
}

/**
 * JSON-RPC 2.0 error response
 */
export interface JsonRpcErrorResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/**
 * JSON-RPC 2.0 notification (no id)
 */
export interface JsonRpcNotification<T = unknown> {
  jsonrpc: "2.0";
  method: string;
  params?: T;
}

// ============================================================================
// BTCP TOOL DEFINITIONS (from browser client)
// ============================================================================

/**
 * Tool input schema (JSON Schema format)
 */
export interface BTCPToolInputSchema {
  type: "object";
  properties?: Record<string, {
    type: string;
    description?: string;
    enum?: string[];
    default?: unknown;
    items?: unknown;
    required?: string[];
  }>;
  required?: string[];
  additionalProperties?: boolean;
}

/**
 * Tool definition registered by browser client
 */
export interface BTCPToolDefinition {
  /** Unique tool name */
  name: string;
  /** Human-readable description */
  description: string;
  /** JSON Schema for input validation */
  inputSchema: BTCPToolInputSchema;
}

/**
 * Zod schema for tool definition
 */
export const BTCPToolDefinitionSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  inputSchema: z.object({
    type: z.literal("object"),
    properties: z.record(z.string(), z.any()).optional(),
    required: z.array(z.string()).optional(),
    additionalProperties: z.boolean().optional(),
  }),
});

// ============================================================================
// BTCP PROTOCOL MESSAGES
// ============================================================================

/**
 * Tools registration message (browser → server)
 */
export interface BTCPToolsRegisterParams {
  tools: BTCPToolDefinition[];
}

/**
 * Tool call message (server → browser via SSE)
 */
export interface BTCPToolCallParams {
  /** Tool name to execute */
  name: string;
  /** Tool arguments */
  arguments: Record<string, unknown>;
}

/**
 * Tool result content types
 */
export type BTCPToolResultContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string }
  | { type: "json"; data: unknown };

/**
 * Tool result (browser → server)
 */
export interface BTCPToolResult {
  content: BTCPToolResultContent[];
  isError?: boolean;
}

/**
 * Tools list response (for agent discovery)
 */
export interface BTCPToolsListResult {
  tools: BTCPToolDefinition[];
}

// ============================================================================
// BTCP CLIENT TYPES (Agent Side)
// ============================================================================

/**
 * BTCP client configuration
 */
export interface BTCPClientConfig {
  /** Server URL (e.g., http://localhost:8765) */
  serverUrl: string;
  /** Session ID for connection */
  sessionId?: string;
  /** Client type identifier */
  clientType?: "agent" | "browser";
  /** Connection timeout in ms */
  timeout?: number;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Connection state
 */
export type BTCPConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error";

/**
 * BTCP client events
 */
export type BTCPClientEvent =
  | { type: "connected"; sessionId: string }
  | { type: "disconnected"; reason?: string }
  | { type: "tools_updated"; tools: BTCPToolDefinition[] }
  | { type: "error"; error: Error };

/**
 * Tool call options
 */
export interface BTCPToolCallOptions {
  /** Timeout for this specific call */
  timeout?: number;
  /** Retry count on failure */
  retries?: number;
}

// ============================================================================
// AGENT TOOL INTERFACE (Single Browser Tool)
// ============================================================================

/**
 * Browser tool input schema
 * This is the single tool exposed to the AI agent
 */
export const BrowserToolInputSchema = z.object({
  /** Tool name to execute (from available browser tools) */
  tool: z.string().describe("Name of the browser tool to execute"),
  /** Arguments for the tool */
  arguments: z.record(z.string(), z.unknown()).describe("Tool arguments"),
});

export type BrowserToolInput = z.infer<typeof BrowserToolInputSchema>;

/**
 * Browser tool result
 */
export interface BrowserToolResult {
  success: boolean;
  content: BTCPToolResultContent[];
  error?: {
    code: string;
    message: string;
    recoverable: boolean;
  };
  metadata?: {
    toolName: string;
    duration: number;
  };
}

// ============================================================================
// SESSION TYPES
// ============================================================================

/**
 * BTCP session info
 */
export interface BTCPSession {
  /** Unique session identifier */
  sessionId: string;
  /** When the session was created */
  createdAt: number;
  /** Available tools from browser */
  tools: BTCPToolDefinition[];
  /** Browser connection state */
  browserConnected: boolean;
  /** Agent connection state */
  agentConnected: boolean;
}

/**
 * Session creation options
 */
export interface BTCPSessionOptions {
  /** Custom session ID (auto-generated if not provided) */
  sessionId?: string;
  /** Session metadata */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// ERROR CODES
// ============================================================================

/**
 * BTCP error codes
 */
export const BTCPErrorCodes = {
  // JSON-RPC standard errors
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,

  // BTCP-specific errors
  TOOL_NOT_FOUND: -32001,
  TOOL_EXECUTION_ERROR: -32002,
  BROWSER_DISCONNECTED: -32003,
  SESSION_NOT_FOUND: -32004,
  TIMEOUT: -32005,
} as const;

export type BTCPErrorCode = typeof BTCPErrorCodes[keyof typeof BTCPErrorCodes];

/**
 * BTCP error class
 */
export class BTCPError extends Error {
  constructor(
    public code: BTCPErrorCode,
    message: string,
    public data?: unknown
  ) {
    super(message);
    this.name = "BTCPError";
  }

  toJsonRpcError(): JsonRpcErrorResponse["error"] {
    return {
      code: this.code,
      message: this.message,
      data: this.data,
    };
  }
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * Generate a unique request ID
 */
export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Generate a unique session ID
 */
export function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Check if a response is an error
 */
export function isJsonRpcError(
  response: JsonRpcResponse | JsonRpcErrorResponse
): response is JsonRpcErrorResponse {
  return "error" in response;
}

/**
 * Create a JSON-RPC request
 */
export function createJsonRpcRequest<T>(
  method: string,
  params?: T,
  id?: string | number
): JsonRpcRequest<T> {
  return {
    jsonrpc: "2.0",
    id: id ?? generateRequestId(),
    method,
    params,
  };
}

/**
 * Create a JSON-RPC response
 */
export function createJsonRpcResponse<T>(
  id: string | number,
  result: T
): JsonRpcResponse<T> {
  return {
    jsonrpc: "2.0",
    id,
    result,
  };
}

/**
 * Create a JSON-RPC error response
 */
export function createJsonRpcErrorResponse(
  id: string | number | null,
  code: BTCPErrorCode,
  message: string,
  data?: unknown
): JsonRpcErrorResponse {
  return {
    jsonrpc: "2.0",
    id,
    error: { code, message, data },
  };
}
