/**
 * Type-Safe Tool Factory
 *
 * Create type-safe tool definitions compatible with Claude Agent SDK.
 * Uses Zod schemas for input validation and TypeScript inference.
 *
 * @see https://platform.claude.com/docs/en/agent-sdk/typescript
 *
 * @example
 * ```typescript
 * import { tool } from '@waiboard/ai-agents/sdk';
 * import { z } from 'zod';
 *
 * const myTool = tool({
 *   name: 'my_tool',
 *   description: 'Does something useful',
 *   inputSchema: z.object({
 *     param: z.string().describe('A parameter'),
 *     count: z.number().optional().default(1),
 *   }),
 *   handler: async (input) => {
 *     // input is fully typed
 *     return { result: input.param.repeat(input.count) };
 *   },
 * });
 * ```
 */

import { z } from "zod";
import type { ToolContext, ToolResult } from "./tools.js";

// ============================================================================
// TOOL CONFIGURATION
// ============================================================================

/**
 * Tool configuration for creating type-safe tools
 */
export interface ToolConfig<TInput extends z.ZodType, TOutput = unknown> {
  /** Unique tool name */
  name: string;
  /** Human-readable description */
  description: string;
  /** Zod schema for input validation */
  inputSchema: TInput;
  /** Zod schema for output validation (optional) */
  outputSchema?: z.ZodType<TOutput>;
  /** Handler function that executes the tool */
  handler: (
    input: z.infer<TInput>,
    context: ToolContext
  ) => Promise<TOutput> | TOutput;
  /** Whether this tool is dangerous (requires confirmation) */
  dangerous?: boolean;
  /** Tool categories for grouping */
  categories?: string[];
}

// ============================================================================
// TOOL INTERFACE
// ============================================================================

/**
 * Type-safe tool instance
 */
export interface Tool<TInput extends z.ZodType, TOutput = unknown> {
  /** Tool name */
  readonly name: string;
  /** Tool description */
  readonly description: string;
  /** Input schema */
  readonly inputSchema: TInput;
  /** Output schema (if provided) */
  readonly outputSchema?: z.ZodType<TOutput>;
  /** Whether dangerous */
  readonly dangerous: boolean;
  /** Categories */
  readonly categories: string[];

  /**
   * Execute the tool with validated input
   */
  execute(input: z.infer<TInput>, context?: ToolContext): Promise<ToolResult<TOutput>>;

  /**
   * Validate input without executing
   */
  validate(input: unknown): { success: true; data: z.infer<TInput> } | { success: false; error: string };

  /**
   * Convert to MCP tool definition
   */
  toMcpTool(): McpToolDefinition;

  /**
   * Convert to JSON Schema (for API calls)
   */
  toJsonSchema(): JsonSchemaToolDefinition;
}

/**
 * MCP tool definition format
 */
export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * JSON Schema tool definition (for Claude API)
 */
export interface JsonSchemaToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

// ============================================================================
// TOOL FACTORY
// ============================================================================

/**
 * Create a type-safe tool
 *
 * @example
 * ```typescript
 * const greetTool = tool({
 *   name: 'greet',
 *   description: 'Greets a person',
 *   inputSchema: z.object({
 *     name: z.string(),
 *     formal: z.boolean().optional(),
 *   }),
 *   handler: async (input) => {
 *     const greeting = input.formal ? 'Good day' : 'Hello';
 *     return `${greeting}, ${input.name}!`;
 *   },
 * });
 *
 * // Execute
 * const result = await greetTool.execute({ name: 'Alice' });
 * // result.data === "Hello, Alice!"
 * ```
 */
export function tool<TInput extends z.ZodType, TOutput = unknown>(
  config: ToolConfig<TInput, TOutput>
): Tool<TInput, TOutput> {
  const {
    name,
    description,
    inputSchema,
    outputSchema,
    handler,
    dangerous = false,
    categories = [],
  } = config;

  return {
    name,
    description,
    inputSchema,
    outputSchema,
    dangerous,
    categories,

    async execute(
      input: z.infer<TInput>,
      context: ToolContext = {}
    ): Promise<ToolResult<TOutput>> {
      const startTime = Date.now();

      try {
        // Validate input
        const validationResult = inputSchema.safeParse(input);
        if (!validationResult.success) {
          return {
            success: false,
            error: `Invalid input: ${validationResult.error.message}`,
            duration: Date.now() - startTime,
          };
        }

        // Execute handler
        const result = await handler(validationResult.data, context);

        // Validate output if schema provided
        if (outputSchema) {
          const outputValidation = outputSchema.safeParse(result);
          if (!outputValidation.success) {
            return {
              success: false,
              error: `Invalid output: ${outputValidation.error.message}`,
              duration: Date.now() - startTime,
            };
          }
        }

        return {
          success: true,
          data: result,
          duration: Date.now() - startTime,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
          duration: Date.now() - startTime,
        };
      }
    },

    validate(input: unknown) {
      const result = inputSchema.safeParse(input);
      if (result.success) {
        return { success: true as const, data: result.data };
      }
      return {
        success: false as const,
        error: result.error.errors
          .map((e) => `${e.path.join(".")}: ${e.message}`)
          .join(", "),
      };
    },

    toMcpTool(): McpToolDefinition {
      return {
        name,
        description,
        inputSchema: zodToJsonSchema(inputSchema),
      };
    },

    toJsonSchema(): JsonSchemaToolDefinition {
      return {
        name,
        description,
        input_schema: zodToJsonSchema(inputSchema),
      };
    },
  };
}

// ============================================================================
// ZOD TO JSON SCHEMA CONVERSION
// ============================================================================

/**
 * Convert Zod schema to JSON Schema format
 */
export function zodToJsonSchema(schema: z.ZodType): {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
} {
  // Handle ZodObject
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      const zodType = value as z.ZodType;
      properties[key] = zodTypeToJsonSchema(zodType);

      // Check if required
      if (!(zodType instanceof z.ZodOptional) && !(zodType instanceof z.ZodDefault)) {
        required.push(key);
      }
    }

    return {
      type: "object",
      properties,
      ...(required.length > 0 ? { required } : {}),
    };
  }

  // Fallback for non-object schemas
  return {
    type: "object",
    properties: {},
  };
}

/**
 * Convert a Zod type to JSON Schema type
 */
function zodTypeToJsonSchema(zodType: z.ZodType): Record<string, unknown> {
  // Unwrap optional/default
  let unwrapped = zodType;
  let description: string | undefined;

  // Get description if available
  if ("description" in zodType && typeof zodType.description === "string") {
    description = zodType.description;
  }

  // Unwrap modifiers
  while (
    unwrapped instanceof z.ZodOptional ||
    unwrapped instanceof z.ZodDefault ||
    unwrapped instanceof z.ZodNullable
  ) {
    if (unwrapped instanceof z.ZodOptional) {
      unwrapped = unwrapped.unwrap();
    } else if (unwrapped instanceof z.ZodDefault) {
      unwrapped = unwrapped._def.innerType;
    } else if (unwrapped instanceof z.ZodNullable) {
      unwrapped = unwrapped.unwrap();
    }
  }

  const base: Record<string, unknown> = {};

  if (description) {
    base.description = description;
  }

  // String
  if (unwrapped instanceof z.ZodString) {
    return { ...base, type: "string" };
  }

  // Number
  if (unwrapped instanceof z.ZodNumber) {
    return { ...base, type: "number" };
  }

  // Boolean
  if (unwrapped instanceof z.ZodBoolean) {
    return { ...base, type: "boolean" };
  }

  // Array
  if (unwrapped instanceof z.ZodArray) {
    return {
      ...base,
      type: "array",
      items: zodTypeToJsonSchema(unwrapped.element),
    };
  }

  // Enum
  if (unwrapped instanceof z.ZodEnum) {
    return {
      ...base,
      type: "string",
      enum: unwrapped.options,
    };
  }

  // Literal
  if (unwrapped instanceof z.ZodLiteral) {
    const value = unwrapped.value;
    return {
      ...base,
      type: typeof value,
      const: value,
    };
  }

  // Union
  if (unwrapped instanceof z.ZodUnion) {
    return {
      ...base,
      oneOf: (unwrapped.options as z.ZodType[]).map(zodTypeToJsonSchema),
    };
  }

  // Object
  if (unwrapped instanceof z.ZodObject) {
    const objectSchema = zodToJsonSchema(unwrapped);
    return { ...base, ...objectSchema };
  }

  // Record
  if (unwrapped instanceof z.ZodRecord) {
    return {
      ...base,
      type: "object",
      additionalProperties: zodTypeToJsonSchema(unwrapped.valueSchema),
    };
  }

  // Any/Unknown
  if (unwrapped instanceof z.ZodAny || unwrapped instanceof z.ZodUnknown) {
    return { ...base };
  }

  // Default fallback
  return { ...base, type: "string" };
}

// ============================================================================
// TOOL REGISTRY
// ============================================================================

/**
 * Tool registry for managing multiple tools
 */
export class ToolRegistry {
  private tools = new Map<string, Tool<z.ZodType, unknown>>();

  /**
   * Register a tool
   */
  register<TInput extends z.ZodType, TOutput>(tool: Tool<TInput, TOutput>): this {
    this.tools.set(tool.name, tool as Tool<z.ZodType, unknown>);
    return this;
  }

  /**
   * Get a tool by name
   */
  get(name: string): Tool<z.ZodType, unknown> | undefined {
    return this.tools.get(name);
  }

  /**
   * Check if tool exists
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get all tool names
   */
  names(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Get all tools
   */
  all(): Tool<z.ZodType, unknown>[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get tools by category
   */
  byCategory(category: string): Tool<z.ZodType, unknown>[] {
    return this.all().filter((t) => t.categories.includes(category));
  }

  /**
   * Convert all to MCP tool definitions
   */
  toMcpTools(): McpToolDefinition[] {
    return this.all().map((t) => t.toMcpTool());
  }

  /**
   * Convert all to JSON Schema definitions
   */
  toJsonSchemaTools(): JsonSchemaToolDefinition[] {
    return this.all().map((t) => t.toJsonSchema());
  }

  /**
   * Execute a tool by name
   */
  async execute(
    name: string,
    input: unknown,
    context?: ToolContext
  ): Promise<ToolResult> {
    const tool = this.get(name);
    if (!tool) {
      return {
        success: false,
        error: `Tool not found: ${name}`,
      };
    }

    return tool.execute(input, context);
  }
}

/**
 * Create a new tool registry
 */
export function createToolRegistry(): ToolRegistry {
  return new ToolRegistry();
}
