/**
 * context_search Tool Implementation
 *
 * Search through context, memory, and history.
 */

import type {
  ContextSearchInput,
  GenericToolContext,
  GenericToolResult,
} from './generic-definitions.js';

interface SearchResult {
  source: 'context' | 'memory' | 'history';
  path: string;
  value: unknown;
  match: string;
  score: number;
}

export async function executeContextSearch(
  input: ContextSearchInput,
  context: GenericToolContext
): Promise<GenericToolResult<SearchResult[]>> {
  const startTime = Date.now();

  try {
    const { query, target, limit, options } = input;
    const results: SearchResult[] = [];

    const ignoreCase = options?.ignoreCase ?? true;
    const useRegex = options?.regex ?? false;

    // Build search pattern
    let pattern: RegExp;
    try {
      if (useRegex) {
        pattern = new RegExp(query, ignoreCase ? 'gi' : 'g');
      } else {
        const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        pattern = new RegExp(escaped, ignoreCase ? 'gi' : 'g');
      }
    } catch {
      return {
        success: false,
        error: {
          code: 'INVALID_PATTERN',
          message: 'Invalid search pattern',
          recoverable: true,
        },
        metadata: {
          duration: Date.now() - startTime,
        },
      };
    }

    // Search in context/memory
    if (target === 'all' || target === 'context' || target === 'memory') {
      searchObject(context.memory, pattern, '', 'memory', results);
    }

    // Search in history
    if (target === 'all' || target === 'history') {
      for (let i = 0; i < context.history.length; i++) {
        const item = context.history[i];
        searchObject(item, pattern, `[${i}]`, 'history', results);
      }
    }

    // Sort by score (descending)
    results.sort((a, b) => b.score - a.score);

    // Apply limit
    const limitedResults = results.slice(0, limit);

    // Strip metadata if not requested
    const finalResults = options?.includeMetadata
      ? limitedResults
      : limitedResults.map(({ source, path, value, match }) => ({
          source,
          path,
          value,
          match,
          score: 0,
        }));

    return {
      success: true,
      data: finalResults,
      metadata: {
        duration: Date.now() - startTime,
        itemsAffected: finalResults.length,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'SEARCH_ERROR',
        message: error instanceof Error ? error.message : 'Failed to search context',
        recoverable: true,
      },
      metadata: {
        duration: Date.now() - startTime,
      },
    };
  }
}

/**
 * Recursively search an object for matches
 */
function searchObject(
  obj: unknown,
  pattern: RegExp,
  path: string,
  source: 'context' | 'memory' | 'history',
  results: SearchResult[],
  depth = 0
): void {
  // Limit recursion depth
  if (depth > 10) return;

  if (obj === null || obj === undefined) return;

  if (typeof obj === 'string') {
    const matches = obj.match(pattern);
    if (matches) {
      results.push({
        source,
        path,
        value: obj.length > 200 ? obj.slice(0, 200) + '...' : obj,
        match: matches[0],
        score: matches.length * 10 + (100 - path.split('.').length),
      });
    }
  } else if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      searchObject(obj[i], pattern, `${path}[${i}]`, source, results, depth + 1);
    }
  } else if (typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj)) {
      // Check if key matches
      if (pattern.test(key)) {
        results.push({
          source,
          path: path ? `${path}.${key}` : key,
          value: summarizeValue(value),
          match: key,
          score: 50 + (100 - path.split('.').length),
        });
      }
      // Recurse into value
      searchObject(
        value,
        pattern,
        path ? `${path}.${key}` : key,
        source,
        results,
        depth + 1
      );
    }
  } else if (typeof obj === 'number' || typeof obj === 'boolean') {
    const str = String(obj);
    if (pattern.test(str)) {
      results.push({
        source,
        path,
        value: obj,
        match: str,
        score: 20,
      });
    }
  }
}

/**
 * Summarize a value for display
 */
function summarizeValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    return value.length > 100 ? value.slice(0, 100) + '...' : value;
  }
  if (Array.isArray(value)) {
    return `[Array(${value.length})]`;
  }
  if (typeof value === 'object') {
    return `{Object(${Object.keys(value).length} keys)}`;
  }
  return value;
}
