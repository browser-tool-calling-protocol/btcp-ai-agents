/**
 * state_snapshot Tool Implementation
 *
 * Capture state checkpoints for debugging and rollback.
 */

import type {
  StateSnapshotInput,
  GenericToolContext,
  GenericToolResult,
} from './generic-definitions.js';

interface Snapshot {
  id: string;
  label?: string;
  timestamp: string;
  sessionId: string;
  agentId?: string;
  memory?: Record<string, unknown>;
  historyLength: number;
  history?: unknown[];
  metadata?: Record<string, unknown>;
}

// In-memory snapshot storage (can be replaced with persistent storage)
const snapshots = new Map<string, Snapshot>();

export async function executeStateSnapshot(
  input: StateSnapshotInput,
  context: GenericToolContext
): Promise<GenericToolResult<Snapshot>> {
  const startTime = Date.now();

  try {
    const { label, includeMemory, includeHistory, metadata, options } = input;

    // Generate unique snapshot ID
    const snapshotId = `snap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Build snapshot
    const snapshot: Snapshot = {
      id: snapshotId,
      label,
      timestamp: new Date().toISOString(),
      sessionId: context.sessionId,
      agentId: context.agentId,
      historyLength: context.history.length,
    };

    // Include memory if requested
    if (includeMemory) {
      snapshot.memory = options?.compress
        ? compressData(context.memory)
        : deepClone(context.memory);
    }

    // Include history if requested
    if (includeHistory) {
      snapshot.history = options?.compress
        ? compressData(context.history) as unknown[]
        : deepClone(context.history);
    }

    // Attach custom metadata
    if (metadata) {
      snapshot.metadata = metadata;
    }

    // Store snapshot
    if (options?.persistent) {
      // For persistent storage, we'd use the platform storage adapter
      // For now, store in memory with a longer retention
      snapshots.set(snapshotId, snapshot);
    } else {
      // Store in memory (will be lost on process restart)
      snapshots.set(snapshotId, snapshot);

      // Clean up old snapshots (keep last 100)
      if (snapshots.size > 100) {
        const toDelete = Array.from(snapshots.keys()).slice(0, snapshots.size - 100);
        for (const id of toDelete) {
          snapshots.delete(id);
        }
      }
    }

    return {
      success: true,
      data: snapshot,
      metadata: {
        duration: Date.now() - startTime,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'SNAPSHOT_ERROR',
        message: error instanceof Error ? error.message : 'Failed to create snapshot',
        recoverable: true,
      },
      metadata: {
        duration: Date.now() - startTime,
      },
    };
  }
}

/**
 * Get a snapshot by ID
 */
export function getSnapshot(id: string): Snapshot | undefined {
  return snapshots.get(id);
}

/**
 * List all snapshots
 */
export function listSnapshots(): Snapshot[] {
  return Array.from(snapshots.values()).sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}

/**
 * Delete a snapshot
 */
export function deleteSnapshot(id: string): boolean {
  return snapshots.delete(id);
}

/**
 * Deep clone an object
 */
function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => deepClone(item)) as T;
  }

  const cloned = {} as T;
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    (cloned as Record<string, unknown>)[key] = deepClone(value);
  }
  return cloned;
}

/**
 * Compress data by removing verbose fields and limiting depth
 */
function compressData<T>(data: T, depth = 0): T {
  if (depth > 5 || data === null || typeof data !== 'object') {
    return data;
  }

  if (Array.isArray(data)) {
    // Limit array length in compressed form
    if (data.length > 20) {
      return [
        ...data.slice(0, 10).map((item) => compressData(item, depth + 1)),
        { _truncated: data.length - 10 },
      ] as T;
    }
    return data.map((item) => compressData(item, depth + 1)) as T;
  }

  const compressed = {} as Record<string, unknown>;
  const entries = Object.entries(data as Record<string, unknown>);

  for (const [key, value] of entries) {
    // Skip verbose keys
    if (key.startsWith('_') || key === 'raw' || key === 'verbose') {
      continue;
    }

    // Truncate long strings
    if (typeof value === 'string' && value.length > 200) {
      compressed[key] = value.slice(0, 200) + '...';
    } else {
      compressed[key] = compressData(value, depth + 1);
    }
  }

  return compressed as T;
}
