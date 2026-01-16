/**
 * Direct Google Generative AI Client
 *
 * Primary implementation using @google/genai library.
 * Replaces AI SDK for simpler, more direct Google AI integration.
 */

import { GoogleGenAI, type Content, type Part, type Tool, type FunctionDeclaration, type Schema, Type } from "@google/genai";
import { z } from "zod";
import type { AgentToolName } from "../tools/generic-definitions.js";
import { GENERIC_TOOL_SCHEMAS } from "../tools/generic-definitions.js";

// Simple zodToJsonSchema stub - converts Zod schema to JSON schema
function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  // Basic conversion - in production, use the full zod-to-json-schema package
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

// ============================================================================
// TYPES
// ============================================================================

export interface DirectGenerateResult {
  text: string | null;
  toolCalls: Array<{
    name: string;
    args: Record<string, unknown>;
  }>;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason: string;
}

export interface GenerateOptions {
  apiKey?: string;
  model: string;
  systemPrompt: string;
  userMessage: string;
  tools?: CanvasTool[] | CanvasToolName[];
  toolSet?: Record<string, { description: string; parameters: z.ZodTypeAny }>;
  maxTokens?: number;
  temperature?: number;
  history?: Array<{ role: "user" | "model"; content: string }>;
  /**
   * Raw Gemini Content[] history with proper functionCall/functionResponse parts.
   * Takes precedence over `history` if provided.
   * Required for multi-turn tool use to work correctly.
   */
  rawContents?: Content[];
}

export interface StreamGenerateOptions extends GenerateOptions {
  onChunk?: (chunk: string) => void;
}

// ============================================================================
// SINGLETON CLIENT
// ============================================================================

let genaiClient: GoogleGenAI | null = null;

/**
 * Get or create the Google GenAI client
 */
function getClient(apiKey?: string): GoogleGenAI {
  const key = apiKey || process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY;

  if (!key) {
    throw new Error("Google API key is missing. Set GOOGLE_GENERATIVE_AI_API_KEY or GOOGLE_API_KEY environment variable.");
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
    for (const [key, value] of Object.entries(prop.properties as Record<string, unknown>)) {
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
      const schema = (TOOL_SCHEMAS as Record<string, { name: string; description: string; inputSchema: z.ZodTypeAny }>)[name];
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
// DIRECT API CLIENT
// ============================================================================

/**
 * Generate text using Google Generative AI
 */
export async function generateWithGemini(options: GenerateOptions): Promise<DirectGenerateResult> {
  const {
    apiKey,
    model,
    systemPrompt,
    userMessage,
    tools,
    toolSet,
    maxTokens = 8192,
    temperature = 0.7,
    history = [],
    rawContents,
  } = options;

  const client = getClient(apiKey);

  // Build function declarations from tools or toolSet
  let functionDeclarations: FunctionDeclaration[] = [];
  if (tools && tools.length > 0) {
    functionDeclarations = toolsToGeminiDeclarations(tools);
  } else if (toolSet && Object.keys(toolSet).length > 0) {
    functionDeclarations = toolSetToGeminiDeclarations(toolSet);
  }

  // Build tools array for Gemini
  const geminiTools: Tool[] = functionDeclarations.length > 0
    ? [{ functionDeclarations }]
    : [];

  // Build conversation contents
  let contents: Content[];

  if (rawContents && rawContents.length > 0) {
    // Use raw Gemini Content[] if provided (preserves functionCall/functionResponse parts)
    // This is CRITICAL for multi-turn tool conversations
    contents = [...rawContents];

    // Only add user message if it's not empty and different from the last message
    if (userMessage && userMessage.trim()) {
      const lastContent = contents[contents.length - 1];
      const lastIsUserText = lastContent?.role === "user" &&
        lastContent?.parts?.some(p => (p as { text?: string }).text === userMessage);

      if (!lastIsUserText) {
        contents.push({
          role: "user",
          parts: [{ text: userMessage }],
        });
      }
    }
  } else {
    // Build from text history (legacy behavior)
    contents = [];

    // Add history
    for (const msg of history) {
      contents.push({
        role: msg.role,
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
      systemInstruction: systemPrompt,
      maxOutputTokens: maxTokens,
      temperature,
      tools: geminiTools.length > 0 ? geminiTools : undefined,
    },
  });

  // Parse response
  const candidate = response.candidates?.[0];
  if (!candidate) {
    // Log full response for debugging
    console.error("[Gemini API] Empty candidates array. Full response:", JSON.stringify(response, null, 2));

    // Check for prompt feedback (safety filters, etc.)
    const feedback = (response as any).promptFeedback;
    if (feedback) {
      console.error("[Gemini API] Prompt feedback:", JSON.stringify(feedback, null, 2));

      if (feedback.blockReason) {
        throw new Error(`Gemini blocked response: ${feedback.blockReason}. Ratings: ${JSON.stringify(feedback.safetyRatings || [])}`);
      }
    }

    throw new Error(`No response from Gemini. Response had ${response.candidates?.length || 0} candidates. Model: ${model}`);
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
    finishReason: candidate.finishReason || "stop",
  };
}

/**
 * Generate text with streaming support
 */
export async function* streamWithGemini(options: StreamGenerateOptions): AsyncGenerator<{
  type: "text" | "tool_call" | "done";
  text?: string;
  toolCall?: { name: string; args: Record<string, unknown> };
  usage?: DirectGenerateResult["usage"];
}> {
  const {
    apiKey,
    model,
    systemPrompt,
    userMessage,
    tools,
    toolSet,
    maxTokens = 8192,
    temperature = 0.7,
    history = [],
  } = options;

  const client = getClient(apiKey);

  // Build function declarations
  let functionDeclarations: FunctionDeclaration[] = [];
  if (tools && tools.length > 0) {
    functionDeclarations = toolsToGeminiDeclarations(tools);
  } else if (toolSet && Object.keys(toolSet).length > 0) {
    functionDeclarations = toolSetToGeminiDeclarations(toolSet);
  }

  const geminiTools: Tool[] = functionDeclarations.length > 0
    ? [{ functionDeclarations }]
    : [];

  // Build contents
  const contents: Content[] = [];
  for (const msg of history) {
    contents.push({
      role: msg.role,
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
      systemInstruction: systemPrompt,
      maxOutputTokens: maxTokens,
      temperature,
      tools: geminiTools.length > 0 ? geminiTools : undefined,
    },
  });

  let totalText = "";
  const toolCalls: Array<{ name: string; args: Record<string, unknown> }> = [];

  for await (const chunk of stream) {
    const parts = chunk.candidates?.[0]?.content?.parts || [];

    for (const part of parts) {
      if (part.text) {
        totalText += part.text;
        yield { type: "text", text: part.text };
      }
      if (part.functionCall) {
        const call = {
          name: part.functionCall.name || "",
          args: (part.functionCall.args || {}) as Record<string, unknown>,
        };
        toolCalls.push(call);
        yield { type: "tool_call", toolCall: call };
      }
    }
  }

  // Yield done event with estimated usage
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
 * Continue conversation with tool results
 */
export async function continueWithToolResult(options: {
  apiKey?: string;
  model: string;
  systemPrompt: string;
  history: Content[];
  toolName: string;
  toolResult: unknown;
  tools?: CanvasTool[] | CanvasToolName[];
  toolSet?: Record<string, { description: string; parameters: z.ZodTypeAny }>;
  maxTokens?: number;
  temperature?: number;
}): Promise<DirectGenerateResult> {
  const {
    apiKey,
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

  const client = getClient(apiKey);

  // Build function declarations
  let functionDeclarations: FunctionDeclaration[] = [];
  if (tools && tools.length > 0) {
    functionDeclarations = toolsToGeminiDeclarations(tools);
  } else if (toolSet && Object.keys(toolSet).length > 0) {
    functionDeclarations = toolSetToGeminiDeclarations(toolSet);
  }

  const geminiTools: Tool[] = functionDeclarations.length > 0
    ? [{ functionDeclarations }]
    : [];

  // Add tool result to history
  const contents: Content[] = [
    ...history,
    {
      role: "user",
      parts: [{
        functionResponse: {
          name: toolName,
          response: typeof toolResult === "string"
            ? { result: toolResult }
            : toolResult as Record<string, unknown>,
        },
      }],
    },
  ];

  const response = await client.models.generateContent({
    model,
    contents,
    config: {
      systemInstruction: systemPrompt,
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
    finishReason: candidate.finishReason || "stop",
  };
}

// Re-export Content type for use in other modules
export type { Content };
