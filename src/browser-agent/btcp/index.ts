/**
 * BTCP (Browser Tool Calling Protocol) Module
 *
 * Provides integration with browser tools via the BTCP protocol.
 *
 * @see https://github.com/browser-tool-calling-protocol/btcp-client
 */

// Types
export {
  // JSON-RPC types
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcErrorResponse,
  JsonRpcNotification,

  // Tool definitions
  BTCPToolDefinition,
  BTCPToolInputSchema,
  BTCPToolDefinitionSchema,

  // Protocol messages
  BTCPToolsRegisterParams,
  BTCPToolCallParams,
  BTCPToolResult,
  BTCPToolResultContent,
  BTCPToolsListResult,

  // Client types
  BTCPClientConfig,
  BTCPConnectionState,
  BTCPClientEvent,
  BTCPToolCallOptions,

  // Session types
  BTCPSession,
  BTCPSessionOptions,

  // Browser tool (for AI agents)
  BrowserToolInputSchema,
  BrowserToolInput,
  BrowserToolResult,

  // Errors
  BTCPError,
  BTCPErrorCodes,
  BTCPErrorCode,

  // Utilities
  generateRequestId,
  generateSessionId,
  isJsonRpcError,
  createJsonRpcRequest,
  createJsonRpcResponse,
  createJsonRpcErrorResponse,
} from "./types.js";

// Client
export {
  BTCPAgentClient,
  createBTCPClient,
  createLocalBTCPClient,
  type ToolHandler,
} from "./client.js";

// Browser tool factory
export { createBrowserTool, type BrowserToolOptions } from "./browser-tool.js";
