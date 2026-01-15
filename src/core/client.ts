/**
 * AI Client
 *
 * Native unified LLM client supporting multiple providers (Google Gemini, OpenAI).
 * Uses the provider abstraction for runtime provider selection.
 *
 * @module @waiboard/ai-agents/core
 */

import type { ModelPreference, ModelProvider } from "../types/index.js";
import type { AgentTool, AgentToolName } from "../tools/generic-definitions.js";

// Legacy type aliases
type CanvasTool = AgentTool;
type CanvasCoreTool = AgentTool;
import {
  MODEL_IDS_BY_PROVIDER,
  MODEL_DEFAULTS,
} from "./constants.js";
import {
  createProvider,
  type LLMProvider,
  type GenerateResult,
} from "./providers/index.js";

// ============================================================================
// PROVIDER FACTORY
// ============================================================================

/**
 * Get the model ID string for a given provider and preference
 *
 * @param model - Model preference tier (fast, balanced, powerful)
 * @param provider - LLM provider (google, openai) - defaults to google
 * @returns Model ID string for the provider
 */
export function getModelId(
  model: ModelPreference = MODEL_DEFAULTS.model,
  provider: ModelProvider = MODEL_DEFAULTS.provider
): string {
  return MODEL_IDS_BY_PROVIDER[provider][model];
}

/**
 * Get model for provider - returns model ID string
 */
export function getModelForProvider(
  provider: ModelProvider = MODEL_DEFAULTS.provider,
  model: ModelPreference = MODEL_DEFAULTS.model
): string {
  return getModelId(model, provider);
}

// ============================================================================
// CLIENT CONFIGURATION
// ============================================================================

/**
 * AI client configuration
 */
export interface AIClientConfig {
  /** LLM provider (google, openai) - default: google */
  provider?: ModelProvider;
  /** Model preference (fast, balanced, powerful) - default: balanced */
  model?: ModelPreference;
  /** Maximum tokens for response */
  maxTokens?: number;
  /** Temperature for generation */
  temperature?: number;
  /** API key override (uses env vars if not provided) */
  apiKey?: string;
}

/**
 * Reasoning result from AI model
 */
export interface ReasoningResult {
  /** Thinking/reasoning text from model */
  thinking: string | null;
  /** Main response text */
  response: string;
  /** Tool call if present */
  tool: CanvasTool | null;
  /** Tool input if tool call */
  input: unknown;
  /** Decision: continue with tool or complete */
  decision: "tool_use" | "complete";
  /** Summary if completing */
  summary: string | null;
  /** Token usage */
  tokensUsed: {
    input: number;
    output: number;
  };
  /** Raw response for debugging */
  raw?: unknown;
}

// ============================================================================
// AI CLIENT
// ============================================================================

/**
 * Create AI client for canvas agents
 * Supports multiple LLM providers (Google Gemini, OpenAI)
 *
 * @example
 * ```typescript
 * // Use default provider (Google)
 * const client = createAISDKClient({ model: "balanced" });
 *
 * // Use OpenAI
 * const openaiClient = createAISDKClient({
 *   provider: "openai",
 *   model: "balanced",
 * });
 * ```
 */
export function createAISDKClient(config: AIClientConfig = {}) {
  const {
    provider = MODEL_DEFAULTS.provider,
    model = MODEL_DEFAULTS.model,
    maxTokens = MODEL_DEFAULTS.maxTokens,
    temperature = MODEL_DEFAULTS.temperature,
    apiKey,
  } = config;

  const modelId = getModelId(model, provider);
  const llmProvider = createProvider(provider, { apiKey });

  return {
    /**
     * Generate reasoning with optional tool use
     */
    async generateReasoning(
      task: string,
      systemPrompt: string,
      canvasContext: string,
      tools: CanvasCoreTool[]
    ): Promise<ReasoningResult> {
      const userMessage = `Task: ${task}\n\n## Current Canvas State\n${canvasContext}\n\nFollow the reasoning structure in your system prompt. Use canvas tools to accomplish the task. When finished, indicate completion.`;

      const result = await llmProvider.generate({
        model: modelId,
        systemPrompt,
        userMessage,
        tools: tools as CanvasTool[],
        maxTokens,
        temperature,
      });

      return parseProviderResult(result);
    },

    /**
     * Continue conversation with tool results
     */
    async continueWithToolResults(
      messages: Array<{ role: "user" | "assistant"; content: string | unknown }>,
      systemPrompt: string,
      tools: CanvasCoreTool[]
    ): Promise<ReasoningResult> {
      // Build history from messages
      const history: Array<{ role: "user" | "assistant"; content: string }> = [];
      let lastMessage = "";

      for (const msg of messages.slice(0, -1)) {
        history.push({
          role: msg.role,
          content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content),
        });
      }

      // Last message is the current prompt
      const lastMsg = messages[messages.length - 1];
      lastMessage = typeof lastMsg.content === "string" ? lastMsg.content : JSON.stringify(lastMsg.content);

      const result = await llmProvider.generate({
        model: modelId,
        systemPrompt,
        userMessage: lastMessage,
        tools: tools as CanvasTool[],
        maxTokens,
        temperature,
        history,
      });

      return parseProviderResult(result);
    },

    /**
     * Get the underlying LLM provider
     */
    getProvider(): LLMProvider {
      return llmProvider;
    },

    /**
     * Get model info
     */
    getModelInfo() {
      return {
        provider,
        model,
        modelId,
        maxTokens,
        temperature,
      };
    },
  };
}

// ============================================================================
// RESULT PARSING
// ============================================================================

/**
 * Parse provider result into ReasoningResult
 * Works with any provider's GenerateResult format
 */
function parseProviderResult(result: GenerateResult): ReasoningResult {
  const tokensUsed = {
    input: result.usage.promptTokens,
    output: result.usage.completionTokens,
  };

  // Check for tool calls
  if (result.toolCalls && result.toolCalls.length > 0) {
    const toolCall = result.toolCalls[0];
    return {
      thinking: extractThinking(result.text || ""),
      response: result.text || "",
      tool: toolCall.name as CanvasTool,
      input: toolCall.args,
      decision: "tool_use",
      summary: null,
      tokensUsed,
      raw: result,
    };
  }

  // No tool call - check if task is complete
  const text = result.text || "";
  const isComplete = detectCompletion(text);

  return {
    thinking: extractThinking(text),
    response: text,
    tool: null,
    input: null,
    decision: isComplete ? "complete" : "tool_use",
    summary: isComplete ? extractSummary(text) : null,
    tokensUsed,
    raw: result,
  };
}

/**
 * Extract thinking from XML-structured response
 */
function extractThinking(text: string): string | null {
  const analyzeMatch = text.match(/<analyze>([\s\S]*?)<\/analyze>/);
  const planMatch = text.match(/<plan>([\s\S]*?)<\/plan>/);

  if (analyzeMatch || planMatch) {
    const parts: string[] = [];
    if (analyzeMatch) parts.push(`Analysis: ${analyzeMatch[1].trim()}`);
    if (planMatch) parts.push(`Plan: ${planMatch[1].trim()}`);
    return parts.join("\n\n");
  }

  return null;
}

/**
 * Extract summary from response
 */
function extractSummary(text: string): string | null {
  const summarizeMatch = text.match(/<summarize>([\s\S]*?)<\/summarize>/);
  if (summarizeMatch) {
    return summarizeMatch[1].trim();
  }

  // Look for completion indicators
  const completionPatterns = [
    /(?:task|operation|request)\s+(?:is\s+)?complete/i,
    /(?:finished|done|completed)/i,
    /(?:all|everything)\s+(?:has been|is)\s+(?:created|done|complete)/i,
  ];

  for (const pattern of completionPatterns) {
    if (pattern.test(text)) {
      // Return last paragraph as summary
      const paragraphs = text.split(/\n\n+/).filter((p) => p.trim());
      return paragraphs[paragraphs.length - 1] || text;
    }
  }

  return text.substring(0, 200);
}

/**
 * Detect if task is complete based on response text
 */
function detectCompletion(text: string): boolean {
  const lower = text.toLowerCase();

  // Explicit completion markers
  const completionMarkers = [
    "task complete",
    "task is complete",
    "operation complete",
    "finished",
    "all done",
    "completed successfully",
    "i have completed",
    "the canvas now",
  ];

  for (const marker of completionMarkers) {
    if (lower.includes(marker)) {
      return true;
    }
  }

  // Check for summarize tag
  if (text.includes("<summarize>") && text.includes("</summarize>")) {
    return true;
  }

  return false;
}

// ============================================================================
// MESSAGE BUILDING HELPERS
// ============================================================================

/**
 * Create tool result message for conversation
 */
export function createToolResultMessage(
  toolUseId: string,
  result: unknown,
  isError: boolean = false
): { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean } {
  const content = typeof result === "string" ? result : JSON.stringify(result, null, 2);

  return {
    type: "tool_result",
    tool_use_id: toolUseId,
    content,
    ...(isError && { is_error: true }),
  };
}

/**
 * Build messages array for AI
 */
export function buildMessages(
  task: string,
  context: string,
  history: Array<{
    assistantContent: unknown[];
    toolResults: unknown[];
  }>
): Array<{ role: "user" | "assistant"; content: unknown }> {
  const messages: Array<{ role: "user" | "assistant"; content: unknown }> = [
    {
      role: "user",
      content: `Task: ${task}\n\n## Current Canvas State\n${context}`,
    },
  ];

  for (const turn of history) {
    messages.push({
      role: "assistant",
      content: turn.assistantContent,
    });
    messages.push({
      role: "user",
      content: turn.toolResults,
    });
  }

  return messages;
}

// Re-export for convenience
export { MODEL_IDS_BY_PROVIDER, MODEL_DEFAULTS };
