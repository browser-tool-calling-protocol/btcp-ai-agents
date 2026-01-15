/**
 * Tool Executor
 *
 * Centralized execution of canvas tools with hooks, retry logic,
 * and error recovery following Claude Code patterns.
 */

import type {
  CanvasToolName,
  ToolResult,
  ToolContext,
  ToolHooks,
  McpClient,
  AgentResources,
} from "./definitions.js";
import { canvasReadTool, type CanvasReadOutput } from "./canvas-read.js";
import { canvasWriteTool, type CanvasWriteOutput } from "./canvas-write.js";
import { canvasEditTool, type CanvasEditOutput } from "./canvas-edit.js";
import { canvasFindTool, type CanvasFindOutput } from "./canvas-find.js";
import {
  canvasCaptureTool,
  type CanvasCaptureOutput,
} from "./canvas-capture.js";
import {
  canvasExecuteTool,
  type CanvasExecuteOutput,
} from "./canvas-execute.js";
import {
  canvasDelegateTool,
  type CanvasDelegateOutput,
} from "./canvas-delegate.js";
import {
  canvasVerifyTool,
  type CanvasVerifyOutput,
} from "./canvas-verify.js";
import {
  canvasSearchTemplatesTool,
  type DesignSpecification,
} from "./canvas-search-templates.js";
import {
  canvasClarifyTool,
  type CanvasClarifyOutput,
} from "./canvas-clarify.js";

/**
 * Tool registry - contains only implemented tools
 *
 * Note: canvas_search_templates is internal to canvas-designer subagent,
 * not available to main agent (controlled via enabledTools whitelist)
 *
 * canvas_clarify is a special "interruptible" tool that signals the loop
 * to end the stream and wait for user response.
 */
const TOOL_REGISTRY = {
  canvas_read: canvasReadTool,
  canvas_write: canvasWriteTool,
  canvas_edit: canvasEditTool,
  canvas_find: canvasFindTool,
  canvas_capture: canvasCaptureTool,
  canvas_execute: canvasExecuteTool,
  canvas_delegate: canvasDelegateTool,
  canvas_verify: canvasVerifyTool,
  canvas_search_templates: canvasSearchTemplatesTool,
  canvas_clarify: canvasClarifyTool,
} as const;

/**
 * Registered tool names (subset of CanvasToolName that are implemented)
 */
type RegisteredToolName = keyof typeof TOOL_REGISTRY;

/**
 * Tool output type mapping
 */
export type ToolOutputMap = {
  canvas_read: CanvasReadOutput;
  canvas_write: CanvasWriteOutput;
  canvas_edit: CanvasEditOutput;
  canvas_find: CanvasFindOutput;
  canvas_capture: CanvasCaptureOutput;
  canvas_execute: CanvasExecuteOutput;
  canvas_delegate: CanvasDelegateOutput;
  canvas_verify: CanvasVerifyOutput;
  canvas_search_templates: DesignSpecification;
  canvas_clarify: CanvasClarifyOutput;
};

/**
 * Executor configuration
 */
export interface ExecutorConfig {
  canvasId: string;
  sessionId?: string;
  mcp: McpClient;
  hooks?: ToolHooks;
  maxRetries?: number;
  retryDelayMs?: number;
}

/**
 * Tool Executor class
 *
 * Manages tool execution with:
 * - Pre/post hooks for observability
 * - Retry logic with exponential backoff
 * - Error recovery
 * - Resource state management
 */
export class ToolExecutor {
  private config: ExecutorConfig;
  private resources: AgentResources;

  constructor(config: ExecutorConfig) {
    this.config = {
      maxRetries: 2,
      retryDelayMs: 1000,
      ...config,
    };

    // Initialize resources
    this.resources = {
      canvas: {
        id: config.canvasId,
        version: 0,
      },
      task: {
        id: config.sessionId || crypto.randomUUID(),
        status: "pending",
        currentStep: 0,
        startedAt: Date.now(),
        errors: [],
      },
      context: {
        tokenBudget: 8000,
        tokensUsed: 0,
        strategies: [],
        skills: [],
        awareness: null,
        awarenessFetchedAt: 0,
        awarenessIsStale: true,
      },
      history: {
        operations: [],
        maxEntries: 50,
      },
    };
  }

  /**
   * Execute a tool with full lifecycle management
   */
  async execute<T extends RegisteredToolName>(
    toolName: T,
    input: Parameters<(typeof TOOL_REGISTRY)[T]["execute"]>[0]
  ): Promise<ToolResult<ToolOutputMap[T]>> {
    const tool = TOOL_REGISTRY[toolName];
    const maxRetries = this.config.maxRetries!;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Pre-execution hook
        if (this.config.hooks?.preExecute) {
          const hookResult = await this.config.hooks.preExecute(toolName, input);
          if (!hookResult.proceed) {
            return {
              success: false,
              error: {
                code: "BLOCKED_BY_HOOK",
                message: hookResult.reason || "Blocked by pre-execution hook",
                recoverable: false,
              },
              metadata: { duration: 0 },
            };
          }
        }

        // Build execution context
        const context: ToolContext = {
          canvasId: this.config.canvasId,
          sessionId: this.config.sessionId,
          resources: this.resources,
          hooks: this.config.hooks || {},
          mcp: this.config.mcp,
        };

        // Execute the tool
        const result = (await tool.execute(input as never, context)) as ToolResult<
          ToolOutputMap[T]
        >;

        // Post-execution hook
        if (this.config.hooks?.postExecute) {
          await this.config.hooks.postExecute(toolName, input, result);
        }

        // Update resources on success
        if (result.success) {
          this.resources.canvas.version++;
        }

        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if we should retry
        if (this.config.hooks?.onError) {
          const errorResult = await this.config.hooks.onError(
            toolName,
            lastError
          );
          if (!errorResult.retry) {
            break;
          }
          if (errorResult.delay) {
            await this.sleep(errorResult.delay);
            continue;
          }
        }

        // Exponential backoff
        if (attempt < maxRetries) {
          await this.sleep(
            this.config.retryDelayMs! * Math.pow(2, attempt)
          );
        }
      }
    }

    return {
      success: false,
      error: {
        code: "EXECUTION_FAILED",
        message: lastError?.message || "Unknown error after retries",
        recoverable: false,
      },
      metadata: { duration: 0 },
    };
  }

  /**
   * Execute multiple tools in sequence
   */
  async executeSequence<T extends RegisteredToolName>(
    operations: Array<{
      tool: T;
      input: Parameters<(typeof TOOL_REGISTRY)[T]["execute"]>[0];
    }>
  ): Promise<Array<ToolResult<ToolOutputMap[T]>>> {
    const results: Array<ToolResult<ToolOutputMap[T]>> = [];

    for (const op of operations) {
      const result = await this.execute(op.tool, op.input);
      results.push(result);

      // Stop on error
      if (!result.success) {
        break;
      }
    }

    return results;
  }

  /**
   * Execute multiple independent tools in parallel
   */
  async executeParallel<T extends RegisteredToolName>(
    operations: Array<{
      tool: T;
      input: Parameters<(typeof TOOL_REGISTRY)[T]["execute"]>[0];
    }>
  ): Promise<Array<ToolResult<ToolOutputMap[T]>>> {
    return Promise.all(
      operations.map((op) => this.execute(op.tool, op.input))
    );
  }

  /**
   * Get current resources state
   */
  getResources(): AgentResources {
    return { ...this.resources };
  }

  /**
   * Update resources (for external state changes)
   */
  updateResources(updates: Partial<AgentResources>): void {
    this.resources = {
      ...this.resources,
      ...updates,
      canvas: { ...this.resources.canvas, ...updates.canvas },
      task: { ...this.resources.task, ...updates.task },
      context: { ...this.resources.context, ...updates.context },
    };
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Create a tool executor with default configuration
 */
export function createToolExecutor(config: ExecutorConfig): ToolExecutor {
  return new ToolExecutor(config);
}

/**
 * Execute a single tool (convenience function)
 */
export async function executeTool<T extends RegisteredToolName>(
  toolName: T,
  input: Parameters<(typeof TOOL_REGISTRY)[T]["execute"]>[0],
  config: ExecutorConfig
): Promise<ToolResult<ToolOutputMap[T]>> {
  const executor = createToolExecutor(config);
  return executor.execute(toolName, input);
}

/**
 * Get tool definition by name
 */
export function getToolDefinition(toolName: RegisteredToolName) {
  return TOOL_REGISTRY[toolName];
}

/**
 * Get all tool definitions
 */
export function getAllToolDefinitions() {
  return Object.values(TOOL_REGISTRY);
}

/**
 * Get tool names
 */
export function getToolNames(): RegisteredToolName[] {
  return Object.keys(TOOL_REGISTRY) as RegisteredToolName[];
}
