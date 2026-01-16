/**
 * LLM Provider Factory
 *
 * Factory for creating LLM provider instances based on provider name.
 * Enables runtime selection between Google Gemini and OpenAI.
 *
 * @module @waiboard/ai-agents/core/providers
 */

import type { LLMProvider, ProviderConfig, ProviderName } from "./base.js";
import { GoogleProvider } from "./google.js";
import { OpenAIProvider } from "./openai.js";

// ============================================================================
// PROVIDER FACTORY
// ============================================================================

/**
 * Create an LLM provider instance
 *
 * @param provider - Provider name ("google" | "openai")
 * @param config - Optional provider configuration
 * @returns LLM provider instance
 *
 * @example
 * ```typescript
 * // Create Google Gemini provider
 * const gemini = createProvider("google");
 *
 * // Create OpenAI provider with custom API key
 * const openai = createProvider("openai", { apiKey: "sk-..." });
 *
 * // Use the provider
 * const result = await gemini.generate({
 *   model: "gemini-2.5-flash",
 *   systemPrompt: "You are a helpful assistant",
 *   userMessage: "Hello!",
 * });
 * ```
 */
export function createProvider(
  provider: ProviderName,
  config?: ProviderConfig
): LLMProvider {
  switch (provider) {
    case "google":
      return new GoogleProvider(config);
    case "openai":
      return new OpenAIProvider(config);
    default:
      throw new Error(`Unknown LLM provider: ${provider}`);
  }
}

/**
 * Check if a provider is available (has API key configured)
 *
 * @param provider - Provider name
 * @returns True if the provider is available
 */
export function isProviderAvailable(provider: ProviderName): boolean {
  switch (provider) {
    case "google":
      return !!(
        process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY
      );
    case "openai":
      return !!process.env.OPENAI_API_KEY;
    default:
      return false;
  }
}

/**
 * Get the list of available providers
 *
 * @returns Array of available provider names
 */
export function getAvailableProviders(): ProviderName[] {
  const providers: ProviderName[] = [];

  if (isProviderAvailable("google")) {
    providers.push("google");
  }
  if (isProviderAvailable("openai")) {
    providers.push("openai");
  }

  return providers;
}

/**
 * Get the default provider based on availability
 *
 * Priority: google > openai
 *
 * @returns Default provider name
 * @throws Error if no providers are available
 */
export function getDefaultProvider(): ProviderName {
  if (isProviderAvailable("google")) {
    return "google";
  }
  if (isProviderAvailable("openai")) {
    return "openai";
  }
  throw new Error(
    "No LLM providers available. Set GOOGLE_API_KEY or OPENAI_API_KEY environment variable."
  );
}

/**
 * Get provider information
 */
export interface ProviderInfo {
  name: ProviderName;
  available: boolean;
  envVars: string[];
  models: {
    fast: string;
    balanced: string;
    powerful: string;
  };
}

/**
 * Get information about all providers
 *
 * @returns Array of provider information
 */
export function getProviderInfo(): ProviderInfo[] {
  return [
    {
      name: "google",
      available: isProviderAvailable("google"),
      envVars: ["GOOGLE_GENERATIVE_AI_API_KEY", "GOOGLE_API_KEY"],
      models: {
        fast: "gemini-2.5-flash-lite",
        balanced: "gemini-2.5-flash",
        powerful: "gemini-2.5-pro",
      },
    },
    {
      name: "openai",
      available: isProviderAvailable("openai"),
      envVars: ["OPENAI_API_KEY"],
      models: {
        fast: "gpt-4o-mini",
        balanced: "gpt-4o",
        powerful: "gpt-4o",
      },
    },
  ];
}
