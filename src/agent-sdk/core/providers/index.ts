/**
 * LLM Providers Module
 *
 * Native implementation of unified LLM provider interface for
 * Google Gemini and OpenAI models.
 *
 * @module @waiboard/ai-agents/core/providers
 *
 * @example
 * ```typescript
 * import { createProvider, type LLMProvider } from "@waiboard/ai-agents/core/providers";
 *
 * // Create provider based on availability
 * const provider = createProvider("google");
 *
 * // Generate response
 * const result = await provider.generate({
 *   model: "gemini-2.5-flash",
 *   systemPrompt: "You are a helpful assistant",
 *   userMessage: "Hello!",
 * });
 *
 * // Stream response
 * for await (const chunk of provider.stream(options)) {
 *   if (chunk.type === "text") {
 *     process.stdout.write(chunk.text);
 *   }
 * }
 * ```
 */

// Base types and interfaces
export type {
  LLMProvider,
  GenerateOptions,
  GenerateResult,
  StreamChunk,
  ContinueWithToolResultOptions,
  ProviderConfig,
  ProviderName,
  ModelPreference,
  ProviderFactory,
  ToolCall,
  TokenUsage,
  ConversationMessage,
} from "./base.js";

// Provider implementations
export {
  GoogleProvider,
  zodToGeminiDeclaration,
  toolsToGeminiDeclarations,
  toolSetToGeminiDeclarations,
  type Content,
} from "./google.js";

export {
  OpenAIProvider,
  toolsToOpenAIFormat,
  toolSetToOpenAIFormat,
  generateWithOpenAI,
  streamWithOpenAI,
} from "./openai.js";

// Factory
export {
  createProvider,
  isProviderAvailable,
  getAvailableProviders,
  getDefaultProvider,
  getProviderInfo,
  type ProviderInfo,
} from "./factory.js";
