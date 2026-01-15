/**
 * Adapters Module
 *
 * Action adapters allow the generic agent system to interact with
 * domain-specific backends through a unified interface.
 */

export {
  type ActionAdapter,
  type ActionAdapterRegistry,
  createActionAdapterRegistry,
  getAdapterRegistry,
  setAdapterRegistry,
} from './types.js';
