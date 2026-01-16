/**
 * MCP Action Adapter
 *
 * Implements ActionAdapter for Model Context Protocol (MCP).
 * Wraps HttpMcpClient to provide the unified adapter interface.
 *
 * @deprecated Use BTCPAdapter for new implementations. MCP adapter is
 * provided for backward compatibility during migration.
 *
 * @example
 * ```typescript
 * const adapter = createMCPAdapter({
 *   baseUrl: 'http://localhost:3112',
 *   canvasId: 'my-canvas',
 * });
 *
 * await adapter.connect();
 * const result = await adapter.execute('canvas_create', { type: 'rectangle' });
 * ```
 */

import { HttpMcpClient, type HttpMcpClientConfig } from '../mcp/http-client.js';
import type {
  ActionAdapter,
  ActionResult,
  ActionDefinition,
  AdapterConnectionState,
  StateSnapshot,
  AwarenessContext,
  ExecuteOptions,
  StateOptions,
  AwarenessOptions,
} from './types.js';

// ============================================================================
// MCP ADAPTER CONFIG
// ============================================================================

/**
 * Configuration for MCP adapter
 */
export interface MCPAdapterConfig extends HttpMcpClientConfig {
  /** Pre-existing MCP client to wrap */
  client?: HttpMcpClient;
}

// ============================================================================
// MCP ADAPTER IMPLEMENTATION
// ============================================================================

/**
 * MCP Action Adapter
 *
 * Adapts HttpMcpClient to the ActionAdapter interface.
 *
 * @deprecated Use BTCPAdapter instead
 */
export class MCPAdapter implements ActionAdapter {
  readonly id: string;
  readonly name = 'MCP Canvas Adapter';
  readonly type = 'mcp';

  private client: HttpMcpClient;
  private connectionState: AdapterConnectionState = 'disconnected';

  // Known MCP tools (canvas-mcp specific)
  private static readonly KNOWN_TOOLS: ActionDefinition[] = [
    {
      name: 'canvas_create',
      description: 'Create a new canvas element',
      inputSchema: {
        type: 'object',
        properties: {
          type: { type: 'string', description: 'Element type' },
          x: { type: 'number' },
          y: { type: 'number' },
          width: { type: 'number' },
          height: { type: 'number' },
        },
        required: ['type'],
      },
      category: 'canvas',
    },
    {
      name: 'canvas_update',
      description: 'Update an existing canvas element',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Element ID' },
          properties: { type: 'object', description: 'Properties to update' },
        },
        required: ['id'],
      },
      category: 'canvas',
    },
    {
      name: 'canvas_delete',
      description: 'Delete a canvas element',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Element ID to delete' },
        },
        required: ['id'],
      },
      category: 'canvas',
    },
    {
      name: 'canvas_snapshot',
      description: 'Get current canvas state snapshot',
      inputSchema: {
        type: 'object',
        properties: {
          format: { type: 'string', enum: ['json', 'summary', 'tree'] },
          depth: { type: 'number' },
        },
      },
      category: 'canvas',
    },
    {
      name: 'canvas_select',
      description: 'Select canvas elements',
      inputSchema: {
        type: 'object',
        properties: {
          ids: { type: 'array', items: { type: 'string' } },
        },
        required: ['ids'],
      },
      category: 'canvas',
    },
  ];

  constructor(config: MCPAdapterConfig) {
    this.id = `mcp-${config.canvasId}`;

    // Use provided client or create new one
    if (config.client) {
      this.client = config.client;
    } else {
      this.client = new HttpMcpClient(config);
    }
  }

  // ---------------------------------------------------------------------------
  // Connection Lifecycle
  // ---------------------------------------------------------------------------

  async connect(): Promise<boolean> {
    this.connectionState = 'connecting';

    try {
      const connected = await this.client.connect();
      this.connectionState = connected ? 'connected' : 'error';
      return connected;
    } catch (error) {
      this.connectionState = 'error';
      return false;
    }
  }

  disconnect(): void {
    this.client.disconnect();
    this.connectionState = 'disconnected';
  }

  getConnectionState(): AdapterConnectionState {
    // Map MCP client state to adapter state
    if (this.client.isConnected()) {
      return 'connected';
    }

    const circuitState = this.client.getCircuitState();
    if (circuitState === 'open') {
      return 'error';
    }

    return this.connectionState;
  }

  isConnected(): boolean {
    return this.client.isConnected();
  }

  // ---------------------------------------------------------------------------
  // Action Execution
  // ---------------------------------------------------------------------------

  async execute<T = unknown>(
    action: string,
    params: Record<string, unknown>,
    _options?: ExecuteOptions
  ): Promise<ActionResult<T>> {
    const startTime = Date.now();

    try {
      const result = await this.client.execute<T>(action, params);

      return {
        success: true,
        data: result,
        metadata: {
          duration: Date.now() - startTime,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isCircuitOpen = message.includes('Circuit breaker is open');

      return {
        success: false,
        error: {
          code: isCircuitOpen ? 'CIRCUIT_OPEN' : 'MCP_ERROR',
          message,
          recoverable: isCircuitOpen || message.includes('timeout'),
        },
        metadata: {
          duration: Date.now() - startTime,
        },
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Action Discovery
  // ---------------------------------------------------------------------------

  getAvailableActions(): ActionDefinition[] {
    // Return known MCP tools
    // In a full implementation, this would query the MCP server
    return [...MCPAdapter.KNOWN_TOOLS];
  }

  supportsAction(action: string): boolean {
    return MCPAdapter.KNOWN_TOOLS.some((t) => t.name === action);
  }

  getActionSchema(action: string): ActionDefinition | undefined {
    return MCPAdapter.KNOWN_TOOLS.find((t) => t.name === action);
  }

  // ---------------------------------------------------------------------------
  // State Management
  // ---------------------------------------------------------------------------

  async getState(options?: StateOptions): Promise<StateSnapshot> {
    const startTime = Date.now();

    try {
      // Use canvas_snapshot tool to get state
      const result = await this.client.execute<{
        elements?: unknown[];
        selection?: string[];
        viewport?: unknown;
        elementCount?: number;
      }>('canvas_snapshot', {
        format: options?.format || 'json',
        depth: options?.depth,
      });

      return {
        id: `snapshot-${startTime}`,
        timestamp: startTime,
        summary: this.generateSummary(result),
        data: result as Record<string, unknown>,
        tokensUsed: this.estimateTokens(result),
      };
    } catch (error) {
      return {
        timestamp: startTime,
        summary: `Error getting state: ${error instanceof Error ? error.message : String(error)}`,
        data: {},
      };
    }
  }

  async getAwareness(options?: AwarenessOptions): Promise<AwarenessContext> {
    const state = await this.getState();
    const tools = this.getAvailableActions();

    const awareness: AwarenessContext = {
      summary: state.summary,
      availableActions: tools.map((t) => t.name),
      tokensUsed: state.tokensUsed,
    };

    if (options?.includeSkeleton && state.data?.elements) {
      awareness.skeleton = (state.data.elements as unknown[]).slice(0, 20);
    }

    if (state.data?.selection) {
      awareness.selection = state.data.selection as string[];
    }

    return awareness;
  }

  // ---------------------------------------------------------------------------
  // MCP-Specific Methods
  // ---------------------------------------------------------------------------

  /**
   * Read an MCP resource directly
   */
  async readResource<T>(uri: string): Promise<T> {
    return this.client.readResource<T>(uri);
  }

  /**
   * Get MCP client stats
   */
  getStats(): {
    connected: boolean;
    circuitState: string;
    failureCount: number;
  } {
    return this.client.getStats();
  }

  /**
   * Reset circuit breaker
   */
  resetCircuitBreaker(): void {
    this.client.resetCircuitBreaker();
  }

  /**
   * Get the underlying MCP client
   */
  getClient(): HttpMcpClient {
    return this.client;
  }

  // ---------------------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------------------

  private generateSummary(data: unknown): string {
    if (!data || typeof data !== 'object') {
      return 'Canvas state unavailable';
    }

    const state = data as Record<string, unknown>;
    const parts: string[] = [];

    if (typeof state.elementCount === 'number') {
      parts.push(`${state.elementCount} elements`);
    } else if (Array.isArray(state.elements)) {
      parts.push(`${state.elements.length} elements`);
    }

    if (Array.isArray(state.selection) && state.selection.length > 0) {
      parts.push(`${state.selection.length} selected`);
    }

    return parts.length > 0 ? parts.join(', ') : 'Canvas state loaded';
  }

  private estimateTokens(data: unknown): number {
    if (!data) return 0;
    const json = JSON.stringify(data);
    return Math.ceil(json.length / 4);
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create an MCP adapter
 *
 * @deprecated Use createBTCPAdapter instead for new implementations
 *
 * @example
 * ```typescript
 * const adapter = createMCPAdapter({
 *   baseUrl: 'http://localhost:3112',
 *   canvasId: 'my-canvas',
 * });
 * ```
 */
export function createMCPAdapter(config: MCPAdapterConfig): MCPAdapter {
  return new MCPAdapter(config);
}

/**
 * Create an MCP adapter from an existing client
 *
 * @deprecated Use BTCPAdapter instead
 */
export function createMCPAdapterFromClient(
  client: HttpMcpClient,
  config: Omit<MCPAdapterConfig, 'client'>
): MCPAdapter {
  return new MCPAdapter({ ...config, client });
}
