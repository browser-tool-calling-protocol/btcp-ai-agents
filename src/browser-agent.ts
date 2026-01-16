/**
 * @btcp/browser-agent - Browser Agent Integration
 *
 * Browser-specific integration for the agent framework.
 * Built on top of @btcp/agent-sdk with BTCP (Browser Tool Calling Protocol).
 *
 * ## Architecture
 *
 * This module provides:
 * - BTCPAdapter for browser tool execution
 * - MCPAdapter (deprecated) for legacy canvas-mcp
 * - Platform-specific utilities
 * - HTTP handler for agent servers
 *
 * ## Usage
 *
 * ```typescript
 * import { runAgenticLoop } from '@btcp/ai-agents/agent-sdk';
 * import { createBTCPAdapter } from '@btcp/ai-agents/browser-agent';
 *
 * // Create BTCP adapter
 * const adapter = createBTCPAdapter({
 *   serverUrl: 'http://localhost:8765',
 *   sessionId: 'my-session',
 * });
 *
 * // Run agent with browser tools
 * for await (const event of runAgenticLoop("Click the button", "session", {
 *   adapter,
 * })) {
 *   console.log(event);
 * }
 * ```
 *
 * ## Local Mode (Same-Context)
 *
 * For browser-based agents running in the same context:
 *
 * ```typescript
 * const adapter = createBTCPAdapter(); // No serverUrl = local mode
 *
 * // Register tools directly
 * adapter.registerLocalTool(
 *   { name: 'screenshot', description: 'Take screenshot', inputSchema: {...} },
 *   async (args) => ({ content: [{ type: 'image', data: '...' }] })
 * );
 * ```
 *
 * @module browser-agent
 */

// =============================================================================
// BTCP ADAPTER (Primary)
// =============================================================================

export {
  BTCPAdapter,
  createBTCPAdapter,
  createBTCPAdapterFromClient,
  type BTCPAdapterConfig,
} from './adapters/btcp-adapter.js';

// =============================================================================
// MCP ADAPTER (Legacy)
// =============================================================================

export {
  MCPAdapter,
  createMCPAdapter,
  createMCPAdapterFromClient,
  type MCPAdapterConfig,
} from './adapters/mcp-adapter.js';

// =============================================================================
// BTCP CLIENT
// =============================================================================

export {
  BTCPAgentClient,
  createBTCPClient,
  type ToolHandler,
} from './btcp/client.js';

export type {
  BTCPClientConfig,
  BTCPToolDefinition,
  BTCPToolResult,
  BTCPToolContent,
  BTCPRequest,
  BTCPResponse,
  BTCPError,
  BTCPSession,
} from './btcp/types.js';

// =============================================================================
// MCP CLIENT (Legacy)
// =============================================================================

export {
  HttpMcpClient,
  createHttpMcpClient,
  checkMcpHealth,
  type HttpMcpClientConfig,
  type RetryConfig,
} from './mcp/http-client.js';

// =============================================================================
// BROWSER TOOL FACTORY
// =============================================================================

export {
  createBrowserTool,
  wrapBTCPAsGenericTool,
} from './btcp/browser-tool.js';

// =============================================================================
// HTTP HANDLER
// =============================================================================

export {
  createAgentHttpHandler,
  type AgentHttpRequest,
  type AgentHttpResponse,
} from './http/handler.js';

// =============================================================================
// RE-EXPORT CORE SDK
// =============================================================================

// Re-export essential types from agent-sdk for convenience
export {
  runAgenticLoop,
  type AgentEvent,
  type AgentConfig,
  type LoopOptions,
  type ActionAdapter,
} from './agent-sdk.js';
