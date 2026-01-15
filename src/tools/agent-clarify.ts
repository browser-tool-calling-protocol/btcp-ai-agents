/**
 * agent_clarify Tool Implementation
 *
 * Request clarification from the user.
 */

import type {
  AgentClarifyInput,
  GenericToolContext,
  GenericToolResult,
} from './generic-definitions.js';

interface ClarificationRequest {
  id: string;
  question: string;
  options?: string[];
  context?: string;
  type: 'question' | 'choice' | 'confirm' | 'input';
  status: 'pending' | 'answered' | 'timeout' | 'skipped';
  response?: string;
  timestamp: string;
}

// Pending clarification requests
const pendingClarifications = new Map<string, ClarificationRequest>();

export async function executeAgentClarify(
  input: AgentClarifyInput,
  context: GenericToolContext
): Promise<GenericToolResult<ClarificationRequest>> {
  const startTime = Date.now();

  try {
    const { question, options, context: questionContext, type, allowFreeform } = input;

    // Generate request ID
    const requestId = `clarify_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Create clarification request
    const request: ClarificationRequest = {
      id: requestId,
      question,
      options,
      context: questionContext,
      type,
      status: 'pending',
      timestamp: new Date().toISOString(),
    };

    // Store the request
    pendingClarifications.set(requestId, request);

    // If we have a clarification handler, use it
    if (context.onClarify) {
      try {
        const response = await context.onClarify(question, options);
        request.status = 'answered';
        request.response = response;

        // Validate response against options if not allowing freeform
        if (options && !allowFreeform && !options.includes(response)) {
          return {
            success: false,
            data: request,
            error: {
              code: 'INVALID_RESPONSE',
              message: `Response "${response}" not in allowed options`,
              recoverable: true,
            },
            metadata: {
              duration: Date.now() - startTime,
            },
          };
        }

        return {
          success: true,
          data: request,
          metadata: {
            duration: Date.now() - startTime,
          },
        };
      } catch (error) {
        request.status = 'timeout';

        return {
          success: false,
          data: request,
          error: {
            code: 'CLARIFICATION_FAILED',
            message: error instanceof Error ? error.message : 'Failed to get clarification',
            recoverable: true,
          },
          metadata: {
            duration: Date.now() - startTime,
          },
        };
      }
    }

    // No handler - return pending request
    // The calling code should handle getting the response
    return {
      success: true,
      data: request,
      metadata: {
        duration: Date.now() - startTime,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'CLARIFY_ERROR',
        message: error instanceof Error ? error.message : 'Failed to request clarification',
        recoverable: true,
      },
      metadata: {
        duration: Date.now() - startTime,
      },
    };
  }
}

/**
 * Get a pending clarification request
 */
export function getClarification(id: string): ClarificationRequest | undefined {
  return pendingClarifications.get(id);
}

/**
 * Answer a pending clarification request
 */
export function answerClarification(id: string, response: string): boolean {
  const request = pendingClarifications.get(id);
  if (!request || request.status !== 'pending') {
    return false;
  }

  request.status = 'answered';
  request.response = response;
  return true;
}

/**
 * Skip a pending clarification request
 */
export function skipClarification(id: string): boolean {
  const request = pendingClarifications.get(id);
  if (!request || request.status !== 'pending') {
    return false;
  }

  request.status = 'skipped';
  return true;
}

/**
 * List all pending clarifications
 */
export function listPendingClarifications(): ClarificationRequest[] {
  return Array.from(pendingClarifications.values()).filter(
    (r) => r.status === 'pending'
  );
}

/**
 * Clear old clarifications
 */
export function clearOldClarifications(maxAgeMs = 3600000): number {
  let cleared = 0;
  const now = Date.now();

  for (const [id, request] of pendingClarifications) {
    const age = now - new Date(request.timestamp).getTime();
    if (age > maxAgeMs && request.status !== 'pending') {
      pendingClarifications.delete(id);
      cleared++;
    }
  }

  return cleared;
}

/**
 * Format a clarification request for display
 */
export function formatClarification(request: ClarificationRequest): string {
  let formatted = `Question: ${request.question}`;

  if (request.context) {
    formatted += `\n\nContext: ${request.context}`;
  }

  if (request.options && request.options.length > 0) {
    formatted += '\n\nOptions:';
    for (let i = 0; i < request.options.length; i++) {
      formatted += `\n  ${i + 1}. ${request.options[i]}`;
    }
  }

  if (request.type === 'confirm') {
    formatted += '\n\n(yes/no)';
  }

  return formatted;
}
