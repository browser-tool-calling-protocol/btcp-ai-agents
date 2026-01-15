/**
 * Google Gemini LLM Provider
 *
 * Native implementation of the LLMProvider interface for Google Gemini models.
 * Includes direct Google GenAI client integration.
 *
 * @module @waiboard/ai-agents/core/providers
 * @see https://ai.google.dev/gemini-api/docs
 */

import {
  GoogleGenAI,
  type Content,
  type Tool,
  type FunctionDeclaration,
  type Schema,
  Type,
} from "@google/genai";
import { z } from "zod";
import type { AgentToolName } from "../../tools/generic-definitions.js";
import { GENERIC_TOOL_SCHEMAS } from "../../tools/generic-definitions.js";

// Simple zodToJsonSchema stub - converts Zod schema to JSON schema
function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const jsonSchema: Record<string, unknown> = { type: "object" };
  if (schema._def?.typeName === "ZodObject") {
    const shape = schema._def.shape?.();
    if (shape) {
      const properties: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(shape)) {
        const subSchema = value as z.ZodTypeAny;
        properties[key] = { type: getZodType(subSchema) };
        if (subSchema._def?.description) {
          (properties[key] as Record<string, unknown>).description = subSchema._def.description;
        }
      }
      jsonSchema.properties = properties;
    }
  }
  return jsonSchema;
}

function getZodType(schema: z.ZodTypeAny): string {
  const typeName = schema._def?.typeName;
  switch (typeName) {
    case "ZodString": return "string";
    case "ZodNumber": return "number";
    case "ZodBoolean": return "boolean";
    case "ZodArray": return "array";
    case "ZodObject": return "object";
    default: return "string";
  }
}

// Legacy type aliases
type CanvasToolName = AgentToolName;
const TOOL_SCHEMAS = GENERIC_TOOL_SCHEMAS;
import type {
  LLMProvider,
  GenerateOptions,
  GenerateResult,
  StreamChunk,
  ContinueWithToolResultOptions,
  ProviderConfig,
} from "./base.js";

// ============================================================================
// SINGLETON CLIENT
// ============================================================================

let genaiClient: GoogleGenAI | null = null;

/**
 * Get or create the Google GenAI client
 */
function getClient(apiKey?: string): GoogleGenAI {
  const key =
    apiKey ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    process.env.GOOGLE_API_KEY;

  if (!key) {
    throw new Error(
      "Google API key is missing. Set GOOGLE_GENERATIVE_AI_API_KEY or GOOGLE_API_KEY environment variable."
    );
  }

  if (!genaiClient) {
    genaiClient = new GoogleGenAI({ apiKey: key });
  }

  return genaiClient;
}

// ============================================================================
// SCHEMA CONVERSION (Zod → Gemini)
// ============================================================================

/**
 * Convert JSON Schema type to Gemini Type enum
 */
function toGeminiType(jsonType: string): Type {
  const typeMap: Record<string, Type> = {
    string: Type.STRING,
    number: Type.NUMBER,
    integer: Type.INTEGER,
    boolean: Type.BOOLEAN,
    array: Type.ARRAY,
    object: Type.OBJECT,
  };
  return typeMap[jsonType] || Type.STRING;
}

/**
 * Convert JSON Schema property to Gemini Schema
 */
function toGeminiSchema(prop: Record<string, unknown>): Schema {
  const result: Schema = {
    type: toGeminiType(prop.type as string),
  };

  if (prop.description) {
    result.description = prop.description as string;
  }

  if (prop.enum) {
    result.enum = prop.enum as string[];
  }

  if (prop.items && result.type === Type.ARRAY) {
    result.items = toGeminiSchema(prop.items as Record<string, unknown>);
  }

  if (prop.properties && result.type === Type.OBJECT) {
    result.properties = {};
    for (const [key, value] of Object.entries(
      prop.properties as Record<string, unknown>
    )) {
      result.properties[key] = toGeminiSchema(value as Record<string, unknown>);
    }
  }

  if (prop.required && Array.isArray(prop.required)) {
    result.required = prop.required as string[];
  }

  return result;
}

/**
 * Convert Zod schema to Gemini function declaration
 */
export function zodToGeminiDeclaration(
  name: string,
  description: string,
  schema: z.ZodTypeAny
): FunctionDeclaration {
  const jsonSchema = zodToJsonSchema(schema) as {
    type: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };

  const properties: Record<string, Schema> = {};

  if (jsonSchema.properties) {
    for (const [key, value] of Object.entries(jsonSchema.properties)) {
      properties[key] = toGeminiSchema(value as Record<string, unknown>);
    }
  }

  return {
    name,
    description,
    parameters: {
      type: Type.OBJECT,
      properties,
      required: jsonSchema.required || [],
    },
  };
}

/**
 * Convert canvas tool names to Gemini function declarations
 */
export function toolsToGeminiDeclarations(
  toolNames: (CanvasTool | CanvasToolName)[]
): FunctionDeclaration[] {
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
      return zodToGeminiDeclaration(name, schema.description, schema.inputSchema);
    });
}

/**
 * Convert a generic tool set to Gemini function declarations
 */
export function toolSetToGeminiDeclarations(
  toolSet: Record<string, { description: string; parameters: z.ZodTypeAny }>
): FunctionDeclaration[] {
  return Object.entries(toolSet).map(([name, tool]) =>
    zodToGeminiDeclaration(name, tool.description, tool.parameters)
  );
}

// ============================================================================
// GOOGLE PROVIDER CLASS
// ============================================================================

/**
 * Google Gemini Provider Implementation
 *
 * Native implementation of the LLMProvider interface for Google Gemini models.
 */
export class GoogleProvider implements LLMProvider {
  readonly name = "google";
  private apiKey?: string;
  private history: Content[] = [];

  constructor(config?: ProviderConfig) {
    this.apiKey = config?.apiKey;
  }

  /**
   * Generate a response using Google Gemini
   */
  async generate(options: GenerateOptions): Promise<GenerateResult> {
    const {
      model,
      systemPrompt,
      userMessage,
      tools,
      toolSet,
      maxTokens = 8192,
      temperature = 0.7,
      history = [],
    } = options;

    const client = getClient(this.apiKey);

    // Build function declarations from tools or toolSet
    let functionDeclarations: FunctionDeclaration[] = [];
    if (tools && tools.length > 0) {
      functionDeclarations = toolsToGeminiDeclarations(tools);
    } else if (toolSet && Object.keys(toolSet).length > 0) {
      functionDeclarations = toolSetToGeminiDeclarations(toolSet);
    }

    // Build tools array for Gemini
    const geminiTools: Tool[] =
      functionDeclarations.length > 0 ? [{ functionDeclarations }] : [];

    // Build conversation contents
    let contents: Content[];

    if (this.history.length > 0) {
      // Use raw Gemini Content[] if available (preserves functionCall/functionResponse parts)
      // This is CRITICAL for multi-turn tool conversations
      contents = [...this.history];

      // Only add user message if it's not empty and different from the last message
      if (userMessage && userMessage.trim()) {
        const lastContent = contents[contents.length - 1];
        const lastIsUserText =
          lastContent?.role === "user" &&
          lastContent?.parts?.some(
            (p) => (p as { text?: string }).text === userMessage
          );

        if (!lastIsUserText) {
          contents.push({
            role: "user",
            parts: [{ text: userMessage }],
          });
        }
      }
    } else {
      // Build from text history (initial conversation)
      contents = [];

      // Add history
      for (const msg of history) {
        contents.push({
          role: msg.role === "assistant" ? "model" : "user",
          parts: [{ text: msg.content }],
        });
      }

      // Add current user message
      if (userMessage && userMessage.trim()) {
        contents.push({
          role: "user",
          parts: [{ text: userMessage }],
        });
      }
    }

    // Generate response
    const response = await client.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction: systemPrompt || undefined,
        maxOutputTokens: maxTokens,
        temperature,
        tools: geminiTools.length > 0 ? geminiTools : undefined,
      },
    });

    // Parse response
    const candidate = response.candidates?.[0];
    if (!candidate) {
      throw new Error("No response from Gemini");
    }

    const parts = candidate.content?.parts || [];

    // Extract text and function calls
    let text: string | null = null;
    const toolCalls: Array<{ name: string; args: Record<string, unknown> }> = [];

    for (const part of parts) {
      if (part.text) {
        text = (text || "") + part.text;
      }
      if (part.functionCall) {
        toolCalls.push({
          name: part.functionCall.name || "",
          args: (part.functionCall.args || {}) as Record<string, unknown>,
        });
      }
    }

    return {
      text,
      toolCalls,
      usage: {
        promptTokens: response.usageMetadata?.promptTokenCount || 0,
        completionTokens: response.usageMetadata?.candidatesTokenCount || 0,
        totalTokens: response.usageMetadata?.totalTokenCount || 0,
      },
      // Normalize to lowercase for consistency with decision logic (checkCompletion checks for "stop")
      finishReason: (candidate.finishReason || "stop").toLowerCase(),
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
      maxTokens = 8192,
      temperature = 0.7,
      history = [],
    } = options;

    const client = getClient(this.apiKey);

    // Build function declarations
    let functionDeclarations: FunctionDeclaration[] = [];
    if (tools && tools.length > 0) {
      functionDeclarations = toolsToGeminiDeclarations(tools);
    } else if (toolSet && Object.keys(toolSet).length > 0) {
      functionDeclarations = toolSetToGeminiDeclarations(toolSet);
    }

    const geminiTools: Tool[] =
      functionDeclarations.length > 0 ? [{ functionDeclarations }] : [];

    // Build contents
    const contents: Content[] = [];
    for (const msg of history) {
      contents.push({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }],
      });
    }
    contents.push({
      role: "user",
      parts: [{ text: userMessage }],
    });

    // Stream response
    const stream = await client.models.generateContentStream({
      model,
      contents,
      config: {
        systemInstruction: systemPrompt || undefined,
        maxOutputTokens: maxTokens,
        temperature,
        tools: geminiTools.length > 0 ? geminiTools : undefined,
      },
    });

    for await (const chunk of stream) {
      const parts = chunk.candidates?.[0]?.content?.parts || [];

      for (const part of parts) {
        if (part.text) {
          yield { type: "text", text: part.text };
        }
        if (part.functionCall) {
          const call = {
            name: part.functionCall.name || "",
            args: (part.functionCall.args || {}) as Record<string, unknown>,
          };
          yield { type: "tool_call", toolCall: call };
        }
      }
    }

    // Yield done event
    yield {
      type: "done",
      usage: {
        promptTokens: 0, // Usage not available in streaming mode
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
      maxTokens = 8192,
      temperature = 0.7,
    } = options;

    const client = getClient(this.apiKey);

    // Build function declarations
    let functionDeclarations: FunctionDeclaration[] = [];
    if (tools && tools.length > 0) {
      functionDeclarations = toolsToGeminiDeclarations(tools);
    } else if (toolSet && Object.keys(toolSet).length > 0) {
      functionDeclarations = toolSetToGeminiDeclarations(toolSet);
    }

    const geminiTools: Tool[] =
      functionDeclarations.length > 0 ? [{ functionDeclarations }] : [];

    // Add tool result to history
    const contents: Content[] = [
      ...(history as Content[]),
      {
        role: "user",
        parts: [
          {
            functionResponse: {
              name: toolName,
              response:
                typeof toolResult === "string"
                  ? { result: toolResult }
                  : (toolResult as Record<string, unknown>),
            },
          },
        ],
      },
    ];

    const response = await client.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction: systemPrompt || undefined,
        maxOutputTokens: maxTokens,
        temperature,
        tools: geminiTools.length > 0 ? geminiTools : undefined,
      },
    });

    const candidate = response.candidates?.[0];
    if (!candidate) {
      throw new Error("No response from Gemini");
    }

    const parts = candidate.content?.parts || [];
    let text: string | null = null;
    const toolCalls: Array<{ name: string; args: Record<string, unknown> }> = [];

    for (const part of parts) {
      if (part.text) {
        text = (text || "") + part.text;
      }
      if (part.functionCall) {
        toolCalls.push({
          name: part.functionCall.name || "",
          args: (part.functionCall.args || {}) as Record<string, unknown>,
        });
      }
    }

    return {
      text,
      toolCalls,
      usage: {
        promptTokens: response.usageMetadata?.promptTokenCount || 0,
        completionTokens: response.usageMetadata?.candidatesTokenCount || 0,
        totalTokens: response.usageMetadata?.totalTokenCount || 0,
      },
      // Normalize to lowercase for consistency with decision logic (checkCompletion checks for "stop")
      finishReason: (candidate.finishReason || "stop").toLowerCase(),
    };
  }

  /**
   * Get the provider-specific history format
   */
  getHistoryFormat(): Content[] {
    return this.history;
  }

  /**
   * Add a message to history
   */
  addToHistory(role: "user" | "assistant" | "model", content: string): void {
    const geminiRole = role === "assistant" ? "model" : role;
    this.history.push({
      role: geminiRole,
      parts: [{ text: content }],
    });
  }

  /**
   * Add a tool call to history
   */
  addToolCallToHistory(toolName: string, args: Record<string, unknown>): void {
    this.history.push({
      role: "model",
      parts: [
        {
          functionCall: {
            name: toolName,
            args,
          },
        },
      ],
    });
  }

  /**
   * Add a tool result to history
   */
  addToolResultToHistory(toolName: string, result: unknown): void {
    this.history.push({
      role: "user",
      parts: [
        {
          functionResponse: {
            name: toolName,
            response:
              typeof result === "string"
                ? { result }
                : (result as Record<string, unknown>),
          },
        },
      ],
    });
  }

  /**
   * Clear the conversation history
   */
  clearHistory(): void {
    this.history = [];
  }
}

// Re-export Content type for use in other modules
export type { Content };
