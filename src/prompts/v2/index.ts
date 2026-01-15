/**
 * V2 Prompt System - Generic Agent Prompts
 *
 * Modular, lean prompts following Claude Code's approach:
 * - Minimal instructions
 * - Dynamic loading (only load what's needed)
 * - Explicit constraints (STRICTLY PROHIBITED blocks)
 * - Config-driven composition
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ============================================================================
// PROMPT LOADER
// ============================================================================

const promptCache = new Map<string, string>();

/**
 * Load a markdown prompt file
 */
function loadPrompt(category: string, name: string): string {
  const key = `${category}/${name}`;

  if (promptCache.has(key)) {
    return promptCache.get(key)!;
  }

  const filePath = join(__dirname, category, `${name}.md`);
  try {
    const content = readFileSync(filePath, "utf-8");
    promptCache.set(key, content);
    return content;
  } catch {
    console.warn(`Prompt not found: ${key}`);
    return "";
  }
}

/**
 * Clear prompt cache (for hot reloading in development)
 */
export function clearPromptCache(): void {
  promptCache.clear();
}

// ============================================================================
// CORE PROMPTS
// ============================================================================

export function loadCorePrompt(name: string): string {
  return loadPrompt("core", name);
}

export const CorePrompts = {
  system: () => loadCorePrompt("system"),
  responseStyle: () => loadCorePrompt("response-style"),
  chatHandling: () => loadCorePrompt("chat-handling"),
} as const;

// ============================================================================
// CONSTRAINT PROMPTS
// ============================================================================

export function loadConstraint(name: string): string {
  return loadPrompt("constraints", name);
}

export const Constraints = {
  readOnly: () => loadConstraint("read-only"),
  planningOnly: () => loadConstraint("planning-only"),
  security: () => loadConstraint("security"),
  behavioral: () => loadConstraint("behavioral"),
} as const;

// ============================================================================
// TOKEN ESTIMATION
// ============================================================================

/**
 * Rough token count estimation (4 chars ≈ 1 token)
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default { CorePrompts, Constraints };
