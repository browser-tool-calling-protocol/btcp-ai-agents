/**
 * context_write Tool Implementation
 *
 * Write to agent context or memory.
 */

import type {
  ContextWriteInput,
  GenericToolContext,
  GenericToolResult,
} from './generic-definitions.js';

export async function executeContextWrite(
  input: ContextWriteInput,
  context: GenericToolContext
): Promise<GenericToolResult> {
  const startTime = Date.now();

  try {
    const { target, data, key, merge } = input;

    // Determine where to write
    let store: Record<string, unknown>;
    switch (target) {
      case 'memory':
      case 'context':
      case 'state':
      default:
        store = context.memory;
        break;
    }

    // Write the data
    if (key) {
      // Write to specific key
      if (merge && typeof store[key] === 'object' && typeof data === 'object') {
        // Merge objects
        store[key] = deepMerge(store[key] as Record<string, unknown>, data as Record<string, unknown>);
      } else {
        store[key] = data;
      }
    } else if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
      // Merge/replace entire store
      if (merge) {
        Object.assign(store, data);
      } else {
        // Clear and replace
        for (const k of Object.keys(store)) {
          delete store[k];
        }
        Object.assign(store, data);
      }
    } else {
      return {
        success: false,
        error: {
          code: 'INVALID_DATA',
          message: 'Data must be an object when no key is specified',
          recoverable: true,
        },
        metadata: {
          duration: Date.now() - startTime,
        },
      };
    }

    return {
      success: true,
      data: {
        written: key ?? Object.keys(data as Record<string, unknown>),
        target,
        merged: merge,
      },
      metadata: {
        duration: Date.now() - startTime,
        itemsAffected: key ? 1 : Object.keys(data as Record<string, unknown>).length,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'WRITE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to write to context',
        recoverable: true,
      },
      metadata: {
        duration: Date.now() - startTime,
      },
    };
  }
}

/**
 * Deep merge two objects
 */
function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...target };

  for (const [key, value] of Object.entries(source)) {
    if (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      typeof result[key] === 'object' &&
      result[key] !== null &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMerge(
        result[key] as Record<string, unknown>,
        value as Record<string, unknown>
      );
    } else {
      result[key] = value;
    }
  }

  return result;
}
