/**
 * BTCP Action Adapter
 *
 * Implements ActionAdapter for Browser Tool Calling Protocol (BTCP).
 * Wraps BTCPAgentClient to provide the unified adapter interface.
 *
 * @example
 * ```typescript
 * // Create adapter with server URL
 * const adapter = createBTCPAdapter({
 *   serverUrl: 'http://localhost:8765',
 *   sessionId: 'my-session',
 * });
 *
 * // Connect and execute
 * await adapter.connect();
 * const result = await adapter.execute('click', { selector: '#btn' });
 * ```
 *
 * @example
 * ```typescript
 * // Create local adapter (same-context)
 * const adapter = createBTCPAdapter();
 * adapter.registerLocalTool(
 *   { name: 'screenshot', description: '...', inputSchema: {...} },
 *   async () => ({ content: [{ type: 'text', text: 'Done!' }] })
 * );
 * await adapter.connect();
 * ```
 */

import {
  BTCPAgentClient,
  createBTCPClient,
  type ToolHandler,
} from '../btcp/client.js';
import type {
  BTCPToolDefinition,
  BTCPToolResult,
  BTCPClientConfig,
} from '../btcp/types.js';
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
// BTCP ADAPTER CONFIG
// ============================================================================

/**
 * Configuration for BTCP adapter
 */
export interface BTCPAdapterConfig {
  /** BTCP server URL (omit for local mode) */
  serverUrl?: string;
  /** Session ID */
  sessionId?: string;
  /** Request timeout in ms */
  timeout?: number;
  /** Enable debug logging */
  debug?: boolean;
  /** Existing BTCP client to wrap */
  client?: BTCPAgentClient;
}

// ============================================================================
// BTCP ADAPTER IMPLEMENTATION
// ============================================================================

/**
 * BTCP Action Adapter
 *
 * Adapts BTCPAgentClient to the ActionAdapter interface.
 */
export class BTCPAdapter implements ActionAdapter {
  readonly id: string;
  readonly name = 'BTCP Browser Adapter';
  readonly type = 'btcp';

  private client: BTCPAgentClient;
  private config: BTCPAdapterConfig;
  private stateCache: StateSnapshot | null = null;
  private stateCacheTime = 0;
  private readonly stateCacheTTL = 1000; // 1 second

  constructor(config: BTCPAdapterConfig = {}) {
    this.config = config;
    this.id = `btcp-${config.sessionId || 'default'}`;

    // Use provided client or create new one
    if (config.client) {
      this.client = config.client;
    } else {
      const clientConfig: BTCPClientConfig = {
        serverUrl: config.serverUrl,
        sessionId: config.sessionId,
        timeout: config.timeout,
        debug: config.debug,
        clientType: 'agent',
      };
      this.client = createBTCPClient(clientConfig);
    }
  }

  // ---------------------------------------------------------------------------
  // Connection Lifecycle
  // ---------------------------------------------------------------------------

  async connect(): Promise<boolean> {
    return this.client.connect();
  }

  disconnect(): void {
    this.client.disconnect();
    this.stateCache = null;
  }

  getConnectionState(): AdapterConnectionState {
    return this.client.getState();
  }

  isConnected(): boolean {
    return this.client.getState() === 'connected';
  }

  // ---------------------------------------------------------------------------
  // Action Execution
  // ---------------------------------------------------------------------------

  async execute<T = unknown>(
    action: string,
    params: Record<string, unknown>,
    options?: ExecuteOptions
  ): Promise<ActionResult<T>> {
    const startTime = Date.now();

    try {
      const result = await this.client.callTool(action, params, {
        timeout: options?.timeout,
        retries: options?.retries,
      });

      // Invalidate state cache after mutation
      this.stateCache = null;

      return this.convertBTCPResult<T>(result, startTime);
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'BTCP_ERROR',
          message: error instanceof Error ? error.message : String(error),
          recoverable: true,
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
    const btcpTools = this.client.getTools();
    return btcpTools.map((tool) => this.convertToolDefinition(tool));
  }

  supportsAction(action: string): boolean {
    return this.client.hasTool(action);
  }

  getActionSchema(action: string): ActionDefinition | undefined {
    const tools = this.client.getTools();
    const tool = tools.find((t) => t.name === action);
    return tool ? this.convertToolDefinition(tool) : undefined;
  }

  // ---------------------------------------------------------------------------
  // State Management
  // ---------------------------------------------------------------------------

  async getState(options?: StateOptions): Promise<StateSnapshot> {
    // Return cached state if fresh
    const now = Date.now();
    if (this.stateCache && now - this.stateCacheTime < this.stateCacheTTL) {
      return this.stateCache;
    }

    // Try to get state from browser via BTCP
    // This assumes a 'get_state' or 'snapshot' tool is available
    const stateTools = ['get_state', 'state_snapshot', 'snapshot', 'get_context'];
    let stateData: Record<string, unknown> | null = null;

    for (const toolName of stateTools) {
      if (this.client.hasTool(toolName)) {
        try {
          const result = await this.client.callTool(toolName, {
            format: options?.format || 'json',
            depth: options?.depth,
            keys: options?.keys,
          });

          if (!result.isError && result.content) {
            // Parse content
            const textContent = result.content.find((c) => c.type === 'text');
            if (textContent && 'text' in textContent) {
              try {
                stateData = JSON.parse(textContent.text);
              } catch {
                stateData = { raw: textContent.text };
              }
            }
          }
          break;
        } catch {
          // Try next tool
        }
      }
    }

    const snapshot: StateSnapshot = {
      id: `state-${now}`,
      timestamp: now,
      summary: this.generateStateSummary(stateData),
      version: stateData?.version as number | undefined,
      data: stateData || {},
      tokensUsed: this.estimateTokens(stateData),
    };

    this.stateCache = snapshot;
    this.stateCacheTime = now;

    return snapshot;
  }

  async getAwareness(options?: AwarenessOptions): Promise<AwarenessContext> {
    const tools = this.getAvailableActions();
    const state = await this.getState();

    // Build awareness context
    const awareness: AwarenessContext = {
      summary: state.summary,
      availableActions: tools.map((t) => t.name),
      tokensUsed: state.tokensUsed,
    };

    if (options?.includeSkeleton && state.data) {
      awareness.skeleton = this.extractSkeleton(state.data);
    }

    if (options?.includeRelevant && state.data) {
      awareness.relevant = this.extractRelevant(state.data, options.contextHint);
    }

    return awareness;
  }

  // ---------------------------------------------------------------------------
  // Local Mode: Tool Registration
  // ---------------------------------------------------------------------------

  /**
   * Register a local tool (for same-context communication)
   * Only works when adapter is in local mode (no serverUrl)
   */
  registerLocalTool(definition: BTCPToolDefinition, handler: ToolHandler): void {
    this.client.registerTool(definition, handler);
  }

  /**
   * Register multiple local tools
   */
  registerLocalTools(
    tools: Array<{ definition: BTCPToolDefinition; handler: ToolHandler }>
  ): void {
    this.client.registerTools(tools);
  }

  /**
   * Unregister a local tool
   */
  unregisterLocalTool(name: string): boolean {
    return this.client.unregisterTool(name);
  }

  /**
   * Check if running in local mode
   */
  isLocalMode(): boolean {
    return this.client.isLocalMode();
  }

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------

  /**
   * Get the underlying BTCP client
   */
  getClient(): BTCPAgentClient {
    return this.client;
  }

  /**
   * Generate tool documentation for prompts
   */
  generateToolDocs(): string {
    return this.client.generateToolDocs();
  }

  // ---------------------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------------------

  private convertBTCPResult<T>(
    result: BTCPToolResult,
    startTime: number
  ): ActionResult<T> {
    if (result.isError) {
      // Extract error message from content
      const errorText = result.content
        .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
        .map((c) => c.text)
        .join('\n');

      return {
        success: false,
        error: {
          code: 'TOOL_ERROR',
          message: errorText || 'Tool execution failed',
          recoverable: true,
        },
        metadata: {
          duration: Date.now() - startTime,
        },
      };
    }

    // Extract data from content
    let data: T | undefined;
    const textContent = result.content.find((c) => c.type === 'text');
    if (textContent && 'text' in textContent) {
      try {
        data = JSON.parse(textContent.text) as T;
      } catch {
        data = textContent.text as T;
      }
    }

    // Handle image/resource content
    const imageContent = result.content.find((c) => c.type === 'image');
    if (imageContent && !data) {
      data = imageContent as T;
    }

    return {
      success: true,
      data,
      metadata: {
        duration: Date.now() - startTime,
        ...result.metadata,
      },
    };
  }

  private convertToolDefinition(tool: BTCPToolDefinition): ActionDefinition {
    return {
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema as ActionDefinition['inputSchema'],
      category: 'browser',
    };
  }

  private generateStateSummary(data: Record<string, unknown> | null): string {
    if (!data) {
      return 'No state available from browser';
    }

    const parts: string[] = [];

    // Common state fields
    if (typeof data.elementCount === 'number') {
      parts.push(`${data.elementCount} elements`);
    }
    if (Array.isArray(data.selection) && data.selection.length > 0) {
      parts.push(`${data.selection.length} selected`);
    }
    if (typeof data.url === 'string') {
      parts.push(`on ${new URL(data.url).hostname}`);
    }
    if (typeof data.title === 'string') {
      parts.push(`"${data.title}"`);
    }

    return parts.length > 0 ? parts.join(', ') : 'Browser state available';
  }

  private extractSkeleton(data: Record<string, unknown>): unknown[] {
    // Extract structural information from state
    const skeleton: unknown[] = [];

    if (Array.isArray(data.elements)) {
      // Return summarized element list
      skeleton.push(
        ...data.elements.slice(0, 20).map((el: unknown) => {
          if (typeof el === 'object' && el !== null) {
            const e = el as Record<string, unknown>;
            return {
              id: e.id,
              type: e.type || e.tagName,
              name: e.name || e.text?.toString().slice(0, 50),
            };
          }
          return el;
        })
      );
    }

    if (Array.isArray(data.frames)) {
      skeleton.push(...data.frames);
    }

    return skeleton;
  }

  private extractRelevant(
    data: Record<string, unknown>,
    hint?: string
  ): unknown[] {
    const relevant: unknown[] = [];

    // Add selected items
    if (Array.isArray(data.selection)) {
      relevant.push(...data.selection);
    }

    // Add visible items
    if (Array.isArray(data.visible)) {
      relevant.push(...data.visible.slice(0, 10));
    }

    // If hint provided, filter by relevance
    if (hint && Array.isArray(data.elements)) {
      const hintLower = hint.toLowerCase();
      const matches = (data.elements as Array<Record<string, unknown>>)
        .filter((el) => {
          const text = JSON.stringify(el).toLowerCase();
          return text.includes(hintLower);
        })
        .slice(0, 5);
      relevant.push(...matches);
    }

    return relevant;
  }

  private estimateTokens(data: unknown): number {
    if (!data) return 0;
    // Rough estimate: ~4 characters per token
    const json = JSON.stringify(data);
    return Math.ceil(json.length / 4);
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a BTCP adapter
 *
 * @example
 * ```typescript
 * // Remote mode (connects to BTCP server)
 * const adapter = createBTCPAdapter({
 *   serverUrl: 'http://localhost:8765',
 *   sessionId: 'my-session',
 * });
 *
 * // Local mode (tools registered directly)
 * const adapter = createBTCPAdapter();
 * ```
 */
export function createBTCPAdapter(config?: BTCPAdapterConfig): BTCPAdapter {
  return new BTCPAdapter(config);
}

/**
 * Create a BTCP adapter from an existing client
 *
 * @example
 * ```typescript
 * const client = createBTCPClient({ serverUrl: '...' });
 * const adapter = createBTCPAdapterFromClient(client);
 * ```
 */
export function createBTCPAdapterFromClient(
  client: BTCPAgentClient,
  config?: Omit<BTCPAdapterConfig, 'client'>
): BTCPAdapter {
  return new BTCPAdapter({ ...config, client });
}
