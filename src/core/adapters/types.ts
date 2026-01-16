/**
 * Action Adapter Interface
 *
 * Provides an abstraction for domain-specific action execution.
 * Allows the generic agent system to interact with different backends
 * (browser via BTCP, canvas via MCP, APIs, etc.) through a unified interface.
 *
 * This is the core abstraction that enables the agent framework to be
 * domain-agnostic. Domain-specific packages implement this interface.
 *
 * @example
 * ```typescript
 * // Create a BTCP adapter for browser tools
 * const adapter = createBTCPAdapter({ serverUrl: 'http://localhost:8765' });
 * await adapter.connect();
 *
 * // Execute an action
 * const result = await adapter.execute('click', { selector: '#btn' });
 *
 * // Get current state
 * const state = await adapter.getState();
 * ```
 */

// ============================================================================
// CORE TYPES
// ============================================================================

/**
 * Connection state for adapters
 */
export type AdapterConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

/**
 * Action result returned by adapters
 */
export interface ActionResult<T = unknown> {
  /** Whether the action succeeded */
  success: boolean;
  /** Result data (if success) */
  data?: T;
  /** Error details (if failed) */
  error?: ActionError;
  /** Metadata about the execution */
  metadata?: ActionMetadata;
}

/**
 * Error details for failed actions
 */
export interface ActionError {
  /** Error code for programmatic handling */
  code: string;
  /** Human-readable error message */
  message: string;
  /** Whether this error is recoverable */
  recoverable: boolean;
  /** Additional error data */
  data?: unknown;
}

/**
 * Metadata about action execution
 */
export interface ActionMetadata {
  /** Execution duration in milliseconds */
  duration?: number;
  /** Number of items affected */
  itemsAffected?: number;
  /** Token usage (for context management) */
  tokensUsed?: number;
  /** Adapter-specific metadata */
  [key: string]: unknown;
}

/**
 * Tool/Action definition
 */
export interface ActionDefinition {
  /** Unique action name */
  name: string;
  /** Human-readable description */
  description: string;
  /** JSON Schema for input parameters */
  inputSchema: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
    [key: string]: unknown;
  };
  /** Category for grouping */
  category?: string;
}

/**
 * State snapshot from the adapter's domain
 */
export interface StateSnapshot {
  /** Unique snapshot ID */
  id?: string;
  /** Timestamp when snapshot was taken */
  timestamp: number;
  /** Summary of current state */
  summary: string;
  /** Version/revision number */
  version?: number;
  /** Detailed state data */
  data?: Record<string, unknown>;
  /** Token count for context management */
  tokensUsed?: number;
}

/**
 * Awareness context for the agent
 * Contains contextual information about the current domain state
 */
export interface AwarenessContext {
  /** Brief summary of current state */
  summary: string;
  /** Structured skeleton/outline of state */
  skeleton?: unknown[];
  /** Currently relevant items */
  relevant?: unknown[];
  /** Selection or focus */
  selection?: string[];
  /** Available actions/tools */
  availableActions?: string[];
  /** Token count for context management */
  tokensUsed?: number;
}

// ============================================================================
// ADAPTER INTERFACE
// ============================================================================

/**
 * Action Adapter Interface
 *
 * Core abstraction for connecting the agent framework to external systems.
 * Implementations handle the protocol-specific communication (BTCP, MCP, HTTP, etc.)
 */
export interface ActionAdapter {
  // ---------------------------------------------------------------------------
  // Identity
  // ---------------------------------------------------------------------------

  /** Unique identifier for this adapter */
  readonly id: string;

  /** Human-readable name */
  readonly name: string;

  /** Adapter type (e.g., 'btcp', 'mcp', 'http') */
  readonly type: string;

  // ---------------------------------------------------------------------------
  // Connection Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Connect to the external system
   * @returns true if connection succeeded
   */
  connect(): Promise<boolean>;

  /**
   * Disconnect from the external system
   */
  disconnect(): void;

  /**
   * Get current connection state
   */
  getConnectionState(): AdapterConnectionState;

  /**
   * Check if connected
   */
  isConnected(): boolean;

  // ---------------------------------------------------------------------------
  // Action Execution
  // ---------------------------------------------------------------------------

  /**
   * Execute an action
   * @param action - Action name to execute
   * @param params - Parameters for the action
   * @param options - Execution options
   * @returns Action result
   */
  execute<T = unknown>(
    action: string,
    params: Record<string, unknown>,
    options?: ExecuteOptions
  ): Promise<ActionResult<T>>;

  // ---------------------------------------------------------------------------
  // Action Discovery
  // ---------------------------------------------------------------------------

  /**
   * Get available actions/tools
   */
  getAvailableActions(): ActionDefinition[];

  /**
   * Check if an action is supported
   */
  supportsAction(action: string): boolean;

  /**
   * Get schema for a specific action
   */
  getActionSchema(action: string): ActionDefinition | undefined;

  // ---------------------------------------------------------------------------
  // State Management
  // ---------------------------------------------------------------------------

  /**
   * Get current state snapshot
   * @param options - Snapshot options
   */
  getState(options?: StateOptions): Promise<StateSnapshot>;

  /**
   * Get awareness context for the agent
   * Contains contextual information for LLM reasoning
   */
  getAwareness(options?: AwarenessOptions): Promise<AwarenessContext>;

  // ---------------------------------------------------------------------------
  // Optional: Event Handling
  // ---------------------------------------------------------------------------

  /**
   * Subscribe to adapter events
   * @param event - Event name
   * @param handler - Event handler
   */
  on?(event: string, handler: (...args: unknown[]) => void): void;

  /**
   * Unsubscribe from adapter events
   */
  off?(event: string, handler: (...args: unknown[]) => void): void;
}

/**
 * Options for execute()
 */
export interface ExecuteOptions {
  /** Timeout in milliseconds */
  timeout?: number;
  /** Number of retries on failure */
  retries?: number;
  /** Whether to wait for result (vs fire-and-forget) */
  waitForResult?: boolean;
  /** Signal for cancellation */
  signal?: AbortSignal;
}

/**
 * Options for getState()
 */
export interface StateOptions {
  /** Format for state output */
  format?: 'json' | 'summary' | 'tree' | 'text';
  /** Depth limit for nested data */
  depth?: number;
  /** Include specific keys only */
  keys?: string[];
  /** Whether to compress the output */
  compress?: boolean;
}

/**
 * Options for getAwareness()
 */
export interface AwarenessOptions {
  /** Include skeleton structure */
  includeSkeleton?: boolean;
  /** Include relevant items */
  includeRelevant?: boolean;
  /** Maximum tokens for output */
  maxTokens?: number;
  /** Context hint for relevance */
  contextHint?: string;
}

// ============================================================================
// ADAPTER REGISTRY
// ============================================================================

/**
 * Registry for managing multiple adapters
 */
export interface ActionAdapterRegistry {
  /**
   * Register an adapter
   */
  register(name: string, adapter: ActionAdapter): void;

  /**
   * Unregister an adapter
   */
  unregister(name: string): void;

  /**
   * Get an adapter by name
   */
  get(name: string): ActionAdapter | undefined;

  /**
   * Check if an adapter is registered
   */
  has(name: string): boolean;

  /**
   * Get the default adapter
   */
  getDefault(): ActionAdapter;

  /**
   * Set the default adapter
   */
  setDefault(name: string): void;

  /**
   * List all registered adapter names
   */
  list(): string[];

  /**
   * Get all registered adapters
   */
  getAll(): Map<string, ActionAdapter>;
}

// ============================================================================
// NO-OP ADAPTER
// ============================================================================

/**
 * No-op adapter for when no real adapter is configured
 */
export class NoOpAdapter implements ActionAdapter {
  readonly id = 'noop';
  readonly name = 'No-Op Adapter';
  readonly type = 'noop';

  private state: AdapterConnectionState = 'disconnected';

  async connect(): Promise<boolean> {
    this.state = 'connected';
    return true;
  }

  disconnect(): void {
    this.state = 'disconnected';
  }

  getConnectionState(): AdapterConnectionState {
    return this.state;
  }

  isConnected(): boolean {
    return this.state === 'connected';
  }

  async execute<T = unknown>(
    action: string,
    params: Record<string, unknown>
  ): Promise<ActionResult<T>> {
    return {
      success: false,
      error: {
        code: 'NO_ADAPTER',
        message: `No action adapter configured. Action '${action}' not executed.`,
        recoverable: false,
      },
      metadata: {
        action,
        params,
      },
    };
  }

  getAvailableActions(): ActionDefinition[] {
    return [];
  }

  supportsAction(): boolean {
    return false;
  }

  getActionSchema(): undefined {
    return undefined;
  }

  async getState(): Promise<StateSnapshot> {
    return {
      timestamp: Date.now(),
      summary: 'No adapter configured',
      data: {},
    };
  }

  async getAwareness(): Promise<AwarenessContext> {
    return {
      summary: 'No adapter configured. No domain context available.',
      availableActions: [],
    };
  }
}

// ============================================================================
// REGISTRY IMPLEMENTATION
// ============================================================================

/**
 * Creates a new action adapter registry
 */
export function createActionAdapterRegistry(): ActionAdapterRegistry {
  const adapters = new Map<string, ActionAdapter>();
  let defaultAdapterName = 'noop';

  // Register default no-op adapter
  const noopAdapter = new NoOpAdapter();
  adapters.set('noop', noopAdapter);

  return {
    register(name: string, adapter: ActionAdapter): void {
      if (adapters.has(name)) {
        console.warn(`[ActionAdapterRegistry] Overwriting adapter: ${name}`);
      }
      adapters.set(name, adapter);
    },

    unregister(name: string): void {
      if (name === 'noop') {
        throw new Error('Cannot unregister the noop adapter');
      }
      if (defaultAdapterName === name) {
        defaultAdapterName = 'noop';
      }
      adapters.delete(name);
    },

    get(name: string): ActionAdapter | undefined {
      return adapters.get(name);
    },

    has(name: string): boolean {
      return adapters.has(name);
    },

    getDefault(): ActionAdapter {
      return adapters.get(defaultAdapterName)!;
    },

    setDefault(name: string): void {
      if (!adapters.has(name)) {
        throw new Error(`Adapter "${name}" not registered. Register it first.`);
      }
      defaultAdapterName = name;
    },

    list(): string[] {
      return Array.from(adapters.keys());
    },

    getAll(): Map<string, ActionAdapter> {
      return new Map(adapters);
    },
  };
}

// ============================================================================
// GLOBAL REGISTRY
// ============================================================================

let globalAdapterRegistry: ActionAdapterRegistry | null = null;

/**
 * Get the global adapter registry
 */
export function getAdapterRegistry(): ActionAdapterRegistry {
  if (!globalAdapterRegistry) {
    globalAdapterRegistry = createActionAdapterRegistry();
  }
  return globalAdapterRegistry;
}

/**
 * Set the global adapter registry
 */
export function setAdapterRegistry(registry: ActionAdapterRegistry): void {
  globalAdapterRegistry = registry;
}

/**
 * Reset the global adapter registry (for testing)
 */
export function resetAdapterRegistry(): void {
  globalAdapterRegistry = null;
}
