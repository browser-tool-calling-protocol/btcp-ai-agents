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
} from './browser-agent/adapters/btcp-adapter.js';

// =============================================================================
// MCP ADAPTER (Legacy)
// =============================================================================

export {
  MCPAdapter,
  createMCPAdapter,
  createMCPAdapterFromClient,
  type MCPAdapterConfig,
} from './browser-agent/adapters/mcp-adapter.js';

// =============================================================================
// BTCP CLIENT
// =============================================================================

export {
  BTCPAgentClient,
  createBTCPClient,
  type ToolHandler,
} from './browser-agent/btcp/client.js';

export {
  BTCPError,
  BTCPErrorCodes,
  generateRequestId,
  generateSessionId,
  type BTCPClientConfig,
  type BTCPToolDefinition,
  type BTCPToolResult,
  type BTCPToolResultContent,
  type BTCPConnectionState,
  type BTCPSession,
  type BrowserToolInput,
  type BrowserToolResult,
} from './browser-agent/btcp/types.js';

// =============================================================================
// MCP CLIENT (Legacy)
// =============================================================================

export {
  HttpMcpClient,
  createHttpMcpClient,
  checkMcpHealth,
  type HttpMcpClientConfig,
  type RetryConfig,
} from './browser-agent/mcp/http-client.js';

// =============================================================================
// BROWSER TOOL FACTORY
// =============================================================================

export {
  createBrowserTool,
  createBrowserToolSet,
  formatBrowserToolsForPrompt,
  type BrowserToolOptions,
} from './browser-agent/btcp/browser-tool.js';

// =============================================================================
// HTTP HANDLER
// =============================================================================

export {
  handleChat,
  handleChatSync,
  handleCommand,
  handleCommandSync,
  handleHealth,
  createChatRouter,
  type ChatRequest,
  type CommandRequest,
} from './browser-agent/http/handler.js';

// =============================================================================
// RE-EXPORT CORE SDK
// =============================================================================

// Re-export session API from agent-sdk (primary interface)
export {
  // Session API (Primary)
  AgentSession,
  createAgentSession,
  createCancellationToken,
  runTask,
  streamTask,
  type AgentSessionConfig,
  type TaskResult,
  type SessionState,
  type SessionStats,
  // Low-level loop (deprecated)
  runAgenticLoop,
  type AgentEvent,
  type AgentConfig,
  type LoopOptions,
  type ActionAdapter,
} from './core.js';
