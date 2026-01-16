/**
 * MCP (Model Context Protocol) Integration
 *
 * Provides MCP client connections and utilities for
 * accessing external MCP servers.
 *
 * Context Session Security Model:
 * - Agent is bound to a single context session at system configuration level
 * - No tools to discover or switch to other context sessions
 * - contextId is passed via X-Context-Id header for server-side validation
 */

// HTTP MCP Client for direct HTTP connections
export {
  HttpMcpClient,
  createHttpMcpClient,
  checkMcpHealth,
  type HttpMcpClientConfig,
} from './http-client.js';
