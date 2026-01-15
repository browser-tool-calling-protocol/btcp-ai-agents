/**
 * context_read Tool Implementation
 *
 * Read from agent context, memory, or history.
 */

import type {
  ContextReadInput,
  GenericToolContext,
  GenericToolResult,
} from './generic-definitions.js';

export async function executeContextRead(
  input: ContextReadInput,
  context: GenericToolContext
): Promise<GenericToolResult> {
  const startTime = Date.now();

  try {
    let data: unknown;

    switch (input.target) {
      case 'context':
        data = context.memory;
        break;
      case 'memory':
        data = context.memory;
        break;
      case 'history':
        data = context.history;
        break;
      case 'state':
        data = {
          memory: context.memory,
          historyLength: context.history.length,
          sessionId: context.sessionId,
          agentId: context.agentId,
        };
        break;
      default:
        // Custom key lookup
        data = context.memory[input.target as string];
    }

    // Filter by keys if specified
    if (input.keys && typeof data === 'object' && data !== null) {
      const filtered: Record<string, unknown> = {};
      for (const key of input.keys) {
        if (key in (data as Record<string, unknown>)) {
          filtered[key] = (data as Record<string, unknown>)[key];
        }
      }
      data = filtered;
    }

    // Apply depth limit for nested structures
    if (input.depth && typeof data === 'object' && data !== null) {
      data = limitDepth(data, input.depth);
    }

    // Format output
    let output: unknown;
    switch (input.format) {
      case 'summary':
        output = generateSummary(data);
        break;
      case 'tree':
        output = generateTree(data);
        break;
      case 'text':
        output = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
        break;
      case 'json':
      default:
        output = data;
    }

    return {
      success: true,
      data: output,
      metadata: {
        duration: Date.now() - startTime,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'READ_ERROR',
        message: error instanceof Error ? error.message : 'Failed to read context',
        recoverable: true,
      },
      metadata: {
        duration: Date.now() - startTime,
      },
    };
  }
}

/**
 * Limit the depth of nested objects
 */
function limitDepth(obj: unknown, maxDepth: number, currentDepth = 0): unknown {
  if (currentDepth >= maxDepth) {
    if (Array.isArray(obj)) {
      return `[Array(${obj.length})]`;
    }
    if (typeof obj === 'object' && obj !== null) {
      return `{Object(${Object.keys(obj).length} keys)}`;
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => limitDepth(item, maxDepth, currentDepth + 1));
  }

  if (typeof obj === 'object' && obj !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = limitDepth(value, maxDepth, currentDepth + 1);
    }
    return result;
  }

  return obj;
}

/**
 * Generate a summary of the data
 */
function generateSummary(data: unknown): string {
  if (data === null || data === undefined) {
    return 'No data';
  }

  if (Array.isArray(data)) {
    return `Array with ${data.length} items`;
  }

  if (typeof data === 'object') {
    const keys = Object.keys(data);
    return `Object with ${keys.length} keys: ${keys.slice(0, 5).join(', ')}${keys.length > 5 ? '...' : ''}`;
  }

  return String(data).slice(0, 100);
}

/**
 * Generate a tree representation
 */
function generateTree(data: unknown, indent = ''): string {
  if (data === null || data === undefined) {
    return `${indent}(empty)`;
  }

  if (Array.isArray(data)) {
    if (data.length === 0) return `${indent}[]`;
    const lines = [`${indent}[`];
    for (let i = 0; i < Math.min(data.length, 10); i++) {
      lines.push(generateTree(data[i], indent + '  '));
    }
    if (data.length > 10) {
      lines.push(`${indent}  ... (${data.length - 10} more)`);
    }
    lines.push(`${indent}]`);
    return lines.join('\n');
  }

  if (typeof data === 'object') {
    const entries = Object.entries(data);
    if (entries.length === 0) return `${indent}{}`;
    const lines = [`${indent}{`];
    for (const [key, value] of entries.slice(0, 10)) {
      if (typeof value === 'object' && value !== null) {
        lines.push(`${indent}  ${key}:`);
        lines.push(generateTree(value, indent + '    '));
      } else {
        lines.push(`${indent}  ${key}: ${JSON.stringify(value)}`);
      }
    }
    if (entries.length > 10) {
      lines.push(`${indent}  ... (${entries.length - 10} more)`);
    }
    lines.push(`${indent}}`);
    return lines.join('\n');
  }

  return `${indent}${JSON.stringify(data)}`;
}
