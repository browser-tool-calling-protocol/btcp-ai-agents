/**
 * agent_delegate Tool Implementation
 *
 * Delegate tasks to specialized sub-agents.
 */

import type {
  AgentDelegateInput,
  GenericToolContext,
  GenericToolResult,
} from './generic-definitions.js';

interface DelegationResult {
  agentType: string;
  task: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: unknown;
  error?: string;
  delegationId: string;
}

// Registry of pending delegations
const pendingDelegations = new Map<string, DelegationResult>();

// Agent executor function (to be set by the core system)
let agentExecutor: ((
  agentType: string,
  task: string,
  context: Record<string, unknown>,
  options?: { maxTurns?: number; timeout?: number; skills?: string[] }
) => Promise<unknown>) | null = null;

/**
 * Set the agent executor function
 * This should be called during initialization
 */
export function setAgentExecutor(
  executor: (
    agentType: string,
    task: string,
    context: Record<string, unknown>,
    options?: { maxTurns?: number; timeout?: number; skills?: string[] }
  ) => Promise<unknown>
): void {
  agentExecutor = executor;
}

export async function executeAgentDelegate(
  input: AgentDelegateInput,
  context: GenericToolContext
): Promise<GenericToolResult<DelegationResult>> {
  const startTime = Date.now();

  try {
    const { agentType, task, context: delegateContext, waitForResult, options } = input;

    // Generate delegation ID
    const delegationId = `del_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Create delegation record
    const delegation: DelegationResult = {
      agentType,
      task,
      status: 'pending',
      delegationId,
    };

    pendingDelegations.set(delegationId, delegation);

    // If no executor is set, return a stub result
    if (!agentExecutor) {
      delegation.status = 'completed';
      delegation.result = {
        message: 'Agent delegation simulated (no executor configured)',
        agentType,
        task,
        context: delegateContext,
      };

      return {
        success: true,
        data: delegation,
        metadata: {
          duration: Date.now() - startTime,
        },
      };
    }

    // Build context for sub-agent
    const subAgentContext: Record<string, unknown> = {
      ...delegateContext,
      parentSessionId: context.sessionId,
      parentAgentId: context.agentId,
      delegationId,
    };

    // Execute delegation
    if (!waitForResult) {
      // Async execution
      delegation.status = 'running';

      agentExecutor(agentType, task, subAgentContext, options)
        .then((result) => {
          delegation.status = 'completed';
          delegation.result = result;
        })
        .catch((error) => {
          delegation.status = 'failed';
          delegation.error = error instanceof Error ? error.message : 'Delegation failed';
        });

      return {
        success: true,
        data: delegation,
        metadata: {
          duration: Date.now() - startTime,
        },
      };
    }

    // Synchronous execution with timeout
    const timeout = options?.timeout ?? 60000;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error(`Delegation timed out after ${timeout}ms`)),
        timeout
      );
    });

    try {
      delegation.status = 'running';

      const result = await Promise.race([
        agentExecutor(agentType, task, subAgentContext, options),
        timeoutPromise,
      ]);

      if (timeoutId) clearTimeout(timeoutId);

      delegation.status = 'completed';
      delegation.result = result;

      return {
        success: true,
        data: delegation,
        metadata: {
          duration: Date.now() - startTime,
        },
      };
    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId);

      delegation.status = 'failed';
      delegation.error = error instanceof Error ? error.message : 'Delegation failed';

      return {
        success: false,
        data: delegation,
        error: {
          code: 'DELEGATION_FAILED',
          message: delegation.error,
          recoverable: true,
        },
        metadata: {
          duration: Date.now() - startTime,
        },
      };
    }
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'DELEGATION_ERROR',
        message: error instanceof Error ? error.message : 'Failed to delegate task',
        recoverable: true,
      },
      metadata: {
        duration: Date.now() - startTime,
      },
    };
  }
}

/**
 * Get a pending delegation by ID
 */
export function getDelegation(id: string): DelegationResult | undefined {
  return pendingDelegations.get(id);
}

/**
 * List all pending delegations
 */
export function listDelegations(): DelegationResult[] {
  return Array.from(pendingDelegations.values());
}

/**
 * Clear completed delegations
 */
export function clearCompletedDelegations(): number {
  let cleared = 0;
  for (const [id, delegation] of pendingDelegations) {
    if (delegation.status === 'completed' || delegation.status === 'failed') {
      pendingDelegations.delete(id);
      cleared++;
    }
  }
  return cleared;
}
