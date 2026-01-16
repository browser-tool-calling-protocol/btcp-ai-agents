/**
 * Adapters Module
 *
 * Action adapters allow the generic agent system to interact with
 * domain-specific backends through a unified interface.
 *
 * Available adapters:
 * - BTCPAdapter: For Browser Tool Calling Protocol (browser tools)
 * - MCPAdapter: For Model Context Protocol (legacy canvas-mcp)
 * - NoOpAdapter: Default when no adapter is configured
 *
 * @example
 * ```typescript
 * // Create and register a BTCP adapter
 * import { createBTCPAdapter, getAdapterRegistry } from '@btcp/ai-agents/adapters';
 *
 * const adapter = createBTCPAdapter({ serverUrl: 'http://localhost:8765' });
 * const registry = getAdapterRegistry();
 * registry.register('browser', adapter);
 * registry.setDefault('browser');
 *
 * // Use in agent loop
 * const result = await registry.getDefault().execute('click', { selector: '#btn' });
 * ```
 */

// Core types and interfaces (re-exported from agent-sdk)
export {
  type ActionAdapter,
  type ActionAdapterRegistry,
  type ActionResult,
  type ActionError,
  type ActionMetadata,
  type ActionDefinition,
  type AdapterConnectionState,
  type StateSnapshot,
  type AwarenessContext,
  type ExecuteOptions,
  type StateOptions,
  type AwarenessOptions,
  // No-op adapter
  NoOpAdapter,
  // Registry
  createActionAdapterRegistry,
  getAdapterRegistry,
  setAdapterRegistry,
  resetAdapterRegistry,
} from '../../agent-sdk/adapters/types.js';

// BTCP Adapter (primary)
export {
  BTCPAdapter,
  createBTCPAdapter,
  createBTCPAdapterFromClient,
  type BTCPAdapterConfig,
} from './btcp-adapter.js';

// MCP Adapter (legacy)
export {
  MCPAdapter,
  createMCPAdapter,
  createMCPAdapterFromClient,
  type MCPAdapterConfig,
} from './mcp-adapter.js';
