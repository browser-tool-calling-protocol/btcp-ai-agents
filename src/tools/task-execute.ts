/**
 * task_execute Tool Implementation
 *
 * Execute actions through the action adapter.
 */

import type {
  TaskExecuteInput,
  GenericToolContext,
  GenericToolResult,
} from './generic-definitions.js';

export async function executeTaskExecute(
  input: TaskExecuteInput,
  context: GenericToolContext
): Promise<GenericToolResult> {
  const startTime = Date.now();

  try {
    const { action, params = {}, adapter: adapterName, async: isAsync, options } = input;

    // Get the appropriate adapter
    const adapter = adapterName
      ? context.adapters.get(adapterName)
      : context.adapters.getDefault();

    if (!adapter) {
      return {
        success: false,
        error: {
          code: 'ADAPTER_NOT_FOUND',
          message: adapterName
            ? `Adapter "${adapterName}" not found`
            : 'No default adapter configured',
          recoverable: true,
        },
        metadata: {
          duration: Date.now() - startTime,
        },
      };
    }

    // Set up timeout if specified
    const timeout = options?.timeout ?? 30000;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error(`Action timed out after ${timeout}ms`)),
        timeout
      );
    });

    // Execute the action
    const executeWithRetry = async (retriesLeft: number): Promise<unknown> => {
      try {
        const result = await Promise.race([
          adapter.execute(action, params),
          timeoutPromise,
        ]);
        return result;
      } catch (error) {
        if (retriesLeft > 0) {
          // Wait before retry (exponential backoff)
          const delay = Math.min(1000 * Math.pow(2, (options?.retries ?? 0) - retriesLeft), 10000);
          await new Promise((resolve) => setTimeout(resolve, delay));
          return executeWithRetry(retriesLeft - 1);
        }
        throw error;
      }
    };

    // For async execution, don't wait
    if (isAsync) {
      executeWithRetry(options?.retries ?? 0).catch((error) => {
        console.error(`[task_execute] Async action "${action}" failed:`, error);
      });

      if (timeoutId) clearTimeout(timeoutId);

      return {
        success: true,
        data: {
          status: 'submitted',
          action,
          message: 'Action submitted for async execution',
        },
        metadata: {
          duration: Date.now() - startTime,
        },
      };
    }

    // Execute synchronously
    const result = await executeWithRetry(options?.retries ?? 0);

    if (timeoutId) clearTimeout(timeoutId);

    return {
      success: true,
      data: result,
      metadata: {
        duration: Date.now() - startTime,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Action execution failed';
    const isTimeout = errorMessage.includes('timed out');

    return {
      success: false,
      error: {
        code: isTimeout ? 'TIMEOUT' : 'EXECUTION_ERROR',
        message: errorMessage,
        recoverable: !isTimeout,
      },
      metadata: {
        duration: Date.now() - startTime,
      },
    };
  }
}
