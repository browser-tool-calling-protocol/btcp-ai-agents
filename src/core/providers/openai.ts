/**
 * OpenAI LLM Provider
 *
 * Native implementation of the LLMProvider interface for OpenAI models.
 * Uses the official OpenAI SDK for API calls.
 *
 * @module @waiboard/ai-agents/core/providers
 * @see https://platform.openai.com/docs/api-reference
 */

// Note: openai and zod-to-json-schema may need to be installed
import { z } from "zod";
import type { AgentToolName, AgentTool } from "../../tools/generic-definitions.js";
import { GENERIC_TOOL_SCHEMAS } from "../../tools/generic-definitions.js";

// Legacy type aliases
type CanvasTool = AgentTool;
type CanvasToolName = AgentToolName;
const TOOL_SCHEMAS = GENERIC_TOOL_SCHEMAS;

// OpenAI types (dynamic import to handle missing module)
type OpenAI = {
  chat: {
    completions: {
      create: (params: unknown) => Promise<unknown>;
    };
  };
};
type ChatCompletionMessageParam = unknown;
type ChatCompletionTool = unknown;
import type {
  LLMProvider,
  GenerateOptions,
  GenerateResult,
  StreamChunk,
  ContinueWithToolResultOptions,
  ProviderConfig,
  ToolCall,
} from "./base.js";

// ============================================================================
// SINGLETON CLIENT
// ============================================================================

let openaiClient: OpenAI | null = null;

/**
 * Get or create the OpenAI client
 */
function getClient(apiKey?: string): OpenAI {
  const key = apiKey || process.env.OPENAI_API_KEY;

  if (!key) {
    throw new Error(
      "OpenAI API key is missing. Set OPENAI_API_KEY environment variable."
    );
  }

  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: key });
  }

  return openaiClient;
}

// ============================================================================
// SCHEMA CONVERSION (Zod → OpenAI JSON Schema)
// ============================================================================

/**
 * Convert Zod schema to OpenAI function parameters
 */
function zodToOpenAISchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const jsonSchema = zodToJsonSchema(schema, { target: "openApi3" });
  // Remove $schema and other non-JSON-schema properties
  // biome-ignore lint/performance/noDelete: need to remove $schema
  delete (jsonSchema as Record<string, unknown>).$schema;
  return jsonSchema as Record<string, unknown>;
}

/**
 * Convert canvas tool names to OpenAI function declarations
 */
export function toolsToOpenAIFormat(
  toolNames: (CanvasTool | CanvasToolName)[]
): ChatCompletionTool[] {
  return toolNames
    .filter((name) => {
      const schema = (TOOL_SCHEMAS as Record<string, unknown>)[name];
      return !!schema;
    })
    .map((name) => {
      const schema = (
        TOOL_SCHEMAS as Record<
          string,
          { name: string; description: string; inputSchema: z.ZodTypeAny }
        >
      )[name];
      return {
        type: "function" as const,
        function: {
          name,
          description: schema.description,
          parameters: zodToOpenAISchema(schema.inputSchema),
        },
      };
    });
}

/**
 * Convert a generic tool set to OpenAI function declarations
 */
export function toolSetToOpenAIFormat(
  toolSet: Record<string, { description: string; parameters: z.ZodTypeAny }>
): ChatCompletionTool[] {
  return Object.entries(toolSet).map(([name, tool]) => ({
    type: "function" as const,
    function: {
      name,
      description: tool.description,
      parameters: zodToOpenAISchema(tool.parameters),
    },
  }));
}

// ============================================================================
// OPENAI PROVIDER CLASS
// ============================================================================

/**
 * OpenAI Provider Implementation
 *
 * Native implementation of the LLMProvider interface for OpenAI models.
 */
export class OpenAIProvider implements LLMProvider {
  readonly name = "openai";
  private client: OpenAI;
  private history: ChatCompletionMessageParam[] = [];

  constructor(config?: ProviderConfig) {
    this.client = getClient(config?.apiKey);
  }

  /**
   * Generate a response using OpenAI
   */
  async generate(options: GenerateOptions): Promise<GenerateResult> {
    const {
      model,
      systemPrompt,
      userMessage,
      tools,
      toolSet,
      maxTokens = 4096,
      temperature = 0.7,
      history = [],
      toolChoice,
    } = options;

    // Build tools array
    let openaiTools: ChatCompletionTool[] = [];
    if (tools && tools.length > 0) {
      openaiTools = toolsToOpenAIFormat(tools);
    } else if (toolSet && Object.keys(toolSet).length > 0) {
      openaiTools = toolSetToOpenAIFormat(toolSet);
    }

    // Build messages array
    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
    ];

    // Use internal history if available (preserves tool_calls format)
    // This is CRITICAL for multi-turn tool conversations
    if (this.history.length > 0) {
      messages.push(...this.history);

      // Only add user message if it's not empty and different from the last message
      if (userMessage && userMessage.trim()) {
        const lastMessage = this.history[this.history.length - 1];
        const lastIsUserText =
          lastMessage?.role === "user" &&
          lastMessage?.content === userMessage;

        if (!lastIsUserText) {
          messages.push({ role: "user", content: userMessage });
        }
      }
    } else {
      // Build from text history (initial conversation)
      for (const msg of history) {
        messages.push({
          role: msg.role === "assistant" ? "assistant" : "user",
          content: msg.content,
        });
      }

      // Add current user message (always add, even if empty, for backwards compatibility)
      messages.push({ role: "user", content: userMessage });
    }

    // Convert toolChoice to OpenAI format
    let openaiToolChoice: "auto" | "none" | "required" | { type: "function"; function: { name: string } } | undefined;
    if (toolChoice && openaiTools.length > 0) {
      openaiToolChoice = toolChoice;
    }

    // Generate response
    const response = await this.client.chat.completions.create({
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
      tools: openaiTools.length > 0 ? openaiTools : undefined,
      tool_choice: openaiToolChoice,
    });

    // Parse response
    const choice = response.choices[0];
    if (!choice) {
      throw new Error("No response from OpenAI");
    }

    const message = choice.message;

    // Extract tool calls
    const toolCalls: ToolCall[] = [];
    if (message.tool_calls) {
      for (const toolCall of message.tool_calls) {
        if (toolCall.type === "function") {
          try {
            toolCalls.push({
              name: toolCall.function.name,
              args: JSON.parse(toolCall.function.arguments),
            });
          } catch {
            // Handle JSON parse error
            toolCalls.push({
              name: toolCall.function.name,
              args: {},
            });
          }
        }
      }
    }

    return {
      text: message.content,
      toolCalls,
      usage: {
        promptTokens: response.usage?.prompt_tokens || 0,
        completionTokens: response.usage?.completion_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0,
      },
      // OpenAI already returns lowercase, but normalize for safety
      finishReason: (choice.finish_reason || "stop").toLowerCase(),
    };
  }

  /**
   * Generate with streaming support
   */
  async *stream(options: GenerateOptions): AsyncGenerator<StreamChunk> {
    const {
      model,
      systemPrompt,
      userMessage,
      tools,
      toolSet,
      maxTokens = 4096,
      temperature = 0.7,
      history = [],
    } = options;

    // Build tools array
    let openaiTools: ChatCompletionTool[] = [];
    if (tools && tools.length > 0) {
      openaiTools = toolsToOpenAIFormat(tools);
    } else if (toolSet && Object.keys(toolSet).length > 0) {
      openaiTools = toolSetToOpenAIFormat(toolSet);
    }

    // Build messages array
    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
    ];

    for (const msg of history) {
      messages.push({
        role: msg.role === "assistant" ? "assistant" : "user",
        content: msg.content,
      });
    }

    messages.push({ role: "user", content: userMessage });

    // Stream response
    const stream = await this.client.chat.completions.create({
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
      tools: openaiTools.length > 0 ? openaiTools : undefined,
      stream: true,
    });

    // Track accumulated tool calls during streaming
    const accumulatedToolCalls: Map<
      number,
      { name: string; arguments: string }
    > = new Map();

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;

      if (delta?.content) {
        yield { type: "text", text: delta.content };
      }

      if (delta?.tool_calls) {
        for (const toolCall of delta.tool_calls) {
          const index = toolCall.index;
          const existing = accumulatedToolCalls.get(index) || {
            name: "",
            arguments: "",
          };

          if (toolCall.function?.name) {
            existing.name = toolCall.function.name;
          }
          if (toolCall.function?.arguments) {
            existing.arguments += toolCall.function.arguments;
          }

          accumulatedToolCalls.set(index, existing);
        }
      }
    }

    // Emit completed tool calls
    for (const call of Array.from(accumulatedToolCalls.values())) {
      if (call.name) {
        try {
          yield {
            type: "tool_call",
            toolCall: {
              name: call.name,
              args: JSON.parse(call.arguments || "{}"),
            },
          };
        } catch {
          yield {
            type: "tool_call",
            toolCall: { name: call.name, args: {} },
          };
        }
      }
    }

    // Emit done
    yield {
      type: "done",
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      },
    };
  }

  /**
   * Continue conversation with tool result
   */
  async continueWithToolResult(
    options: ContinueWithToolResultOptions
  ): Promise<GenerateResult> {
    const {
      model,
      systemPrompt,
      history,
      toolName,
      toolResult,
      tools,
      toolSet,
      maxTokens = 4096,
      temperature = 0.7,
    } = options;

    // Build tools array
    let openaiTools: ChatCompletionTool[] = [];
    if (tools && tools.length > 0) {
      openaiTools = toolsToOpenAIFormat(tools);
    } else if (toolSet && Object.keys(toolSet).length > 0) {
      openaiTools = toolSetToOpenAIFormat(toolSet);
    }

    // Build messages with tool result
    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...(history as ChatCompletionMessageParam[]),
    ];

    // Find the last assistant message with tool_calls to get the tool_call_id
    let toolCallId = `call_${Date.now()}`;
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === "assistant" && "tool_calls" in msg && msg.tool_calls) {
        const foundCall = msg.tool_calls.find(
          (tc) => tc.type === "function" && tc.function.name === toolName
        );
        if (foundCall) {
          toolCallId = foundCall.id;
          break;
        }
      }
    }

    // Add tool result
    messages.push({
      role: "tool",
      tool_call_id: toolCallId,
      content:
        typeof toolResult === "string"
          ? toolResult
          : JSON.stringify(toolResult),
    });

    const response = await this.client.chat.completions.create({
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
      tools: openaiTools.length > 0 ? openaiTools : undefined,
    });

    const choice = response.choices[0];
    if (!choice) {
      throw new Error("No response from OpenAI");
    }

    const message = choice.message;
    const toolCalls: ToolCall[] = [];

    if (message.tool_calls) {
      for (const toolCall of message.tool_calls) {
        if (toolCall.type === "function") {
          try {
            toolCalls.push({
              name: toolCall.function.name,
              args: JSON.parse(toolCall.function.arguments),
            });
          } catch {
            toolCalls.push({
              name: toolCall.function.name,
              args: {},
            });
          }
        }
      }
    }

    return {
      text: message.content,
      toolCalls,
      usage: {
        promptTokens: response.usage?.prompt_tokens || 0,
        completionTokens: response.usage?.completion_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0,
      },
      // OpenAI already returns lowercase, but normalize for safety
      finishReason: (choice.finish_reason || "stop").toLowerCase(),
    };
  }

  /**
   * Get the provider-specific history format
   */
  getHistoryFormat(): ChatCompletionMessageParam[] {
    return this.history;
  }

  /**
   * Add a message to history
   */
  addToHistory(role: "user" | "assistant" | "model", content: string): void {
    const openaiRole = role === "model" ? "assistant" : role;
    this.history.push({
      role: openaiRole,
      content,
    });
  }

  /**
   * Add a tool call to history
   */
  addToolCallToHistory(toolName: string, args: Record<string, unknown>): void {
    this.history.push({
      role: "assistant",
      content: null,
      tool_calls: [
        {
          id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          type: "function",
          function: {
            name: toolName,
            arguments: JSON.stringify(args),
          },
        },
      ],
    });
  }

  /**
   * Add a tool result to history
   */
  addToolResultToHistory(toolName: string, result: unknown): void {
    // Find the last tool call to get the ID
    let toolCallId = "";
    for (let i = this.history.length - 1; i >= 0; i--) {
      const msg = this.history[i];
      if (msg.role === "assistant" && "tool_calls" in msg && msg.tool_calls) {
        const foundCall = msg.tool_calls.find(
          (tc) => tc.type === "function" && tc.function.name === toolName
        );
        if (foundCall) {
          toolCallId = foundCall.id;
          break;
        }
      }
    }

    this.history.push({
      role: "tool",
      tool_call_id: toolCallId || `call_${Date.now()}`,
      content: typeof result === "string" ? result : JSON.stringify(result),
    });
  }

  /**
   * Clear the conversation history
   */
  clearHistory(): void {
    this.history = [];
  }
}

// ============================================================================
// STANDALONE FUNCTIONS (for backwards compatibility)
// ============================================================================

/**
 * Generate text using OpenAI
 * @deprecated Use OpenAIProvider class instead
 */
export async function generateWithOpenAI(
  options: GenerateOptions & { apiKey?: string }
): Promise<GenerateResult> {
  const provider = new OpenAIProvider({ apiKey: options.apiKey });
  return provider.generate(options);
}

/**
 * Generate text with streaming support
 * @deprecated Use OpenAIProvider class instead
 */
export async function* streamWithOpenAI(
  options: GenerateOptions & { apiKey?: string }
): AsyncGenerator<StreamChunk> {
  const provider = new OpenAIProvider({ apiKey: options.apiKey });
  yield* provider.stream(options);
}
