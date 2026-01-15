/**
 * Action Adapter Interface
 *
 * Provides an abstraction for domain-specific action execution.
 * Allows the generic agent system to interact with different backends
 * (canvas, databases, APIs, etc.) through a unified interface.
 */

export interface ActionAdapter {
  /** Unique identifier for this adapter */
  readonly id: string;

  /** Execute a domain-specific action */
  execute(action: string, params: Record<string, unknown>): Promise<unknown>;

  /** List available actions */
  listActions(): string[];

  /** Get action schema for validation */
  getActionSchema?(action: string): unknown;

  /** Check if an action is supported */
  supportsAction?(action: string): boolean;
}

export interface ActionAdapterRegistry {
  register(name: string, adapter: ActionAdapter): void;
  unregister(name: string): void;
  get(name: string): ActionAdapter | undefined;
  has(name: string): boolean;
  getDefault(): ActionAdapter;
  setDefault(name: string): void;
  list(): string[];
}

/**
 * Creates a new action adapter registry with a default no-op adapter.
 */
export function createActionAdapterRegistry(): ActionAdapterRegistry {
  const adapters = new Map<string, ActionAdapter>();
  let defaultAdapterName = 'noop';

  // Register default no-op adapter
  const noopAdapter: ActionAdapter = {
    id: 'noop',
    execute: async (action, params) => ({
      status: 'no-op',
      action,
      params,
      message: 'No action adapter configured',
    }),
    listActions: () => [],
    supportsAction: () => false,
  };
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
  };
}

// Global adapter registry instance
let globalAdapterRegistry: ActionAdapterRegistry | null = null;

export function getAdapterRegistry(): ActionAdapterRegistry {
  if (!globalAdapterRegistry) {
    globalAdapterRegistry = createActionAdapterRegistry();
  }
  return globalAdapterRegistry;
}

export function setAdapterRegistry(registry: ActionAdapterRegistry): void {
  globalAdapterRegistry = registry;
}
