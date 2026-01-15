/**
 * Tool Type Bridge
 *
 * Provides organizational structure and type documentation for canvas tools.
 * No longer uses AI SDK - provides direct Zod-based tool definitions.
 */

import { z } from "zod";
import type { CanvasToolName, ToolResult } from "./definitions.js";

/**
 * Tool executor function type
 */
export type ToolExecutor<TInput, TOutput> = (
  input: TInput
) => Promise<ToolResult<TOutput> | TOutput>;

/**
 * Tool definition structure
 */
export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  name: CanvasToolName;
  description: string;
  parameters: z.ZodSchema<TInput>;
  execute: ToolExecutor<TInput, TOutput>;
}

/**
 * Flexible tool set type - uses any to allow heterogeneous tools
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ToolSet = Record<string, ToolDefinition<any, any>>;

/**
 * Create a typed tool definition from a Zod schema
 *
 * The execute function receives Zod-validated input at runtime.
 */
export function createTypedTool<TSchema extends z.ZodTypeAny>(config: {
  name: CanvasToolName;
  description: string;
  parameters: TSchema;
  execute: ToolExecutor<z.infer<TSchema>, unknown>;
}): ToolDefinition<z.infer<TSchema>, unknown> {
  return {
    name: config.name,
    description: config.description,
    parameters: config.parameters,
    execute: config.execute,
  };
}

/**
 * Tool definitions with proper typing
 */
export interface TypedToolConfig<TInput = unknown, TOutput = unknown> {
  name: CanvasToolName;
  description: string;
  parameters: z.ZodSchema<TInput>;
  execute: ToolExecutor<TInput, TOutput>;
}

/**
 * Create multiple typed tools at once
 */
export function createTypedTools(configs: TypedToolConfig[]): ToolSet {
  const tools: ToolSet = {};

  for (const config of configs) {
    tools[config.name] = createTypedTool({
      name: config.name,
      description: config.description,
      parameters: config.parameters,
      execute: config.execute,
    });
  }

  return tools;
}

/**
 * Type-safe tool result wrapper
 * Ensures consistent result format across all tools
 */
export function wrapToolResult<T>(
  result: T | ToolResult<T>
): ToolResult<T> {
  // If already a ToolResult, return as-is
  if (isToolResult(result)) {
    return result;
  }

  // Wrap raw result
  return {
    success: true,
    data: result as T,
    metadata: { duration: 0 },
  };
}

/**
 * Type guard for ToolResult
 */
function isToolResult<T>(value: unknown): value is ToolResult<T> {
  return (
    typeof value === "object" &&
    value !== null &&
    "success" in value &&
    typeof (value as ToolResult<T>).success === "boolean"
  );
}

/**
 * Type-safe error result creator
 */
export function createErrorResult<T>(
  code: string,
  message: string,
  recoverable = true
): ToolResult<T> {
  return {
    success: false,
    error: { code, message, recoverable },
    metadata: { duration: 0 },
  };
}

/**
 * Type for blocked result from hooks
 */
export interface BlockedResult {
  blocked: true;
  reason?: string;
  success: false;
}

/**
 * Check if result is a blocked result
 */
export function isBlockedResult(
  result: unknown
): result is BlockedResult {
  return (
    typeof result === "object" &&
    result !== null &&
    "blocked" in result &&
    (result as BlockedResult).blocked === true
  );
}

/**
 * Convert tool set to format for Gemini
 * Returns a record of tool name to { description, parameters }
 */
export function toolSetToGeminiFormat(
  toolSet: ToolSet
): Record<string, { description: string; parameters: z.ZodTypeAny }> {
  const result: Record<string, { description: string; parameters: z.ZodTypeAny }> = {};

  for (const [name, tool] of Object.entries(toolSet)) {
    result[name] = {
      description: tool.description,
      parameters: tool.parameters,
    };
  }

  return result;
}

/**
 * Execute a tool from a tool set
 */
export async function executeTool(
  toolSet: ToolSet,
  toolName: string,
  input: unknown
): Promise<unknown> {
  const tool = toolSet[toolName];
  if (!tool) {
    // Check if this looks like a legacy MCP tool name pattern
    if (toolName.startsWith("mcp__canvas__") || toolName.includes("el_create") || toolName.includes("el_update")) {
      const availableTools = Object.keys(toolSet).join(", ");
      const errorMsg =
        `⚠️ Invalid tool name: '${toolName}'\n` +
        `Available tools: ${availableTools}\n` +
        `Note: Use simple tool names (e.g., 'canvas_write'), not prefixed names.`;
      console.error(errorMsg);
      throw new Error(errorMsg);
    }
    throw new Error(`Unknown tool: ${toolName}. Available tools: ${Object.keys(toolSet).join(", ")}`);
  }

  // Validate input with Zod schema
  const validatedInput = tool.parameters.parse(input);

  // Execute tool
  return tool.execute(validatedInput);
}
