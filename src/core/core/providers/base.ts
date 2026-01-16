/**
 * Unified LLM Provider Interface
 *
 * Abstract interface for LLM providers (Google Gemini, OpenAI).
 * Enables dual-provider support with a single abstraction layer.
 *
 * @module @waiboard/ai-agents/core/providers
 */

import type { z } from "zod";
import type { AgentToolName, AgentTool } from "../../tools/generic-definitions.js";

// Legacy type aliases
type CanvasTool = AgentTool;
type CanvasToolName = AgentToolName;

// ============================================================================
// TYPES
// ============================================================================

/**
 * Tool call returned by the LLM
 */
export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

/**
 * Token usage information
 */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * Result from a generation request
 */
export interface GenerateResult {
  /** Text response from the model */
  text: string | null;
  /** Tool calls requested by the model */
  toolCalls: ToolCall[];
  /** Token usage statistics */
  usage: TokenUsage;
  /**
   * Finish reason (normalized to lowercase).
   * Common values: "stop" (natural end), "tool_calls" (model wants to call tools),
   * "length" (max tokens reached), "safety" (content blocked).
   * Providers MUST normalize to lowercase for consistent decision logic.
   */
  finishReason: string;
}

/**
 * Tool choice options for forcing tool usage
 */
export type ToolChoice =
  | "auto"      // Let the model decide (default)
  | "none"      // Disable tool usage
  | "required"  // Force the model to use a tool
  | { type: "function"; function: { name: string } };  // Force a specific tool

/**
 * Options for text generation
 */
export interface GenerateOptions {
  /** Model ID to use */
  model: string;
  /** System prompt/instructions */
  systemPrompt: string;
  /** User message content */
  userMessage: string;
  /** Canvas tools to enable (using tool names) */
  tools?: CanvasTool[] | CanvasToolName[];
  /** Custom tool set with Zod schemas */
  toolSet?: Record<string, { description: string; parameters: z.ZodTypeAny }>;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Temperature for sampling */
  temperature?: number;
  /** Conversation history */
  history?: ConversationMessage[];
  /** Tool choice strategy (OpenAI-specific, defaults to "auto") */
  toolChoice?: ToolChoice;
}

/**
 * Conversation message format (provider-agnostic)
 */
export interface ConversationMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/**
 * Options for continuing with tool results
 */
export interface ContinueWithToolResultOptions {
  /** Model ID to use */
  model: string;
  /** System prompt/instructions */
  systemPrompt: string;
  /** Conversation history in provider-specific format */
  history: unknown[];
  /** Name of the tool that was called */
  toolName: string;
  /** Result from the tool execution */
  toolResult: unknown;
  /** Canvas tools to enable */
  tools?: CanvasTool[] | CanvasToolName[];
  /** Custom tool set with Zod schemas */
  toolSet?: Record<string, { description: string; parameters: z.ZodTypeAny }>;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Temperature for sampling */
  temperature?: number;
}

/**
 * Streaming chunk types
 */
export interface StreamChunk {
  type: "text" | "tool_call" | "done";
  text?: string;
  toolCall?: ToolCall;
  usage?: TokenUsage;
}

/**
 * Provider configuration
 */
export interface ProviderConfig {
  /** API key (overrides environment variable) */
  apiKey?: string;
  /** Base URL for API (optional) */
  baseUrl?: string;
  /** Additional provider-specific options */
  options?: Record<string, unknown>;
}

// ============================================================================
// ABSTRACT PROVIDER INTERFACE
// ============================================================================

/**
 * Abstract LLM Provider Interface
 *
 * All LLM providers (Google, OpenAI) must implement this interface.
 * Enables provider-agnostic code in the agentic loop.
 */
export interface LLMProvider {
  /** Provider name for identification */
  readonly name: string;

  /**
   * Generate a response from the LLM
   *
   * @param options - Generation options
   * @returns Promise with generation result
   */
  generate(options: GenerateOptions): Promise<GenerateResult>;

  /**
   * Generate with streaming support
   *
   * @param options - Generation options
   * @returns Async generator yielding stream chunks
   */
  stream(options: GenerateOptions): AsyncGenerator<StreamChunk>;

  /**
   * Continue conversation with tool result
   *
   * @param options - Options including tool name and result
   * @returns Promise with generation result
   */
  continueWithToolResult(options: ContinueWithToolResultOptions): Promise<GenerateResult>;

  /**
   * Get the provider-specific conversation history format
   *
   * @returns The history array in provider-specific format
   */
  getHistoryFormat(): unknown[];

  /**
   * Add a message to the provider-specific history
   *
   * @param role - Message role
   * @param content - Message content
   */
  addToHistory(role: "user" | "assistant" | "model", content: string): void;

  /**
   * Add a tool call to history (for multi-turn tool use)
   *
   * @param toolName - Name of the tool
   * @param args - Tool arguments
   */
  addToolCallToHistory(toolName: string, args: Record<string, unknown>): void;

  /**
   * Add a tool result to history (for multi-turn tool use)
   *
   * @param toolName - Name of the tool
   * @param result - Tool execution result
   */
  addToolResultToHistory(toolName: string, result: unknown): void;

  /**
   * Clear the conversation history
   */
  clearHistory(): void;
}

// ============================================================================
// PROVIDER TYPES
// ============================================================================

/**
 * Supported LLM providers
 */
export type ProviderName = "google" | "openai";

/**
 * Model preference tiers
 */
export type ModelPreference = "fast" | "balanced" | "powerful";

/**
 * Provider factory function type
 */
export type ProviderFactory = (config?: ProviderConfig) => LLMProvider;
