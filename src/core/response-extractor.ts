/**
 * Response Extractor
 *
 * Extracts clean user-facing response from LLM output that contains
 * reasoning XML tags. Mimics Claude Code's pattern where <thinking>
 * blocks are hidden from users.
 *
 * Our reasoning tags:
 * - <analyze>...</analyze>     - Initial task analysis
 * - <assess_clarity>...</assess_clarity> - Clarity assessment
 * - <plan>...</plan>           - Execution planning
 * - <summarize>...</summarize> - Task summary (internal)
 * - <observe>...</observe>     - Tool result observation
 * - <decide>...</decide>       - Decision reasoning
 *
 * Everything outside these tags is the user-facing response.
 *
 * @module @waiboard/ai-agents/core
 */

/**
 * XML reasoning tags used in agent prompts
 */
const REASONING_TAGS = [
  "analyze",
  "assess_clarity",
  "plan",
  "summarize",
  "observe",
  "decide",
  "thinking",
  "reasoning",
] as const;

/**
 * Extract clean user-facing response from LLM text
 *
 * Removes all reasoning XML tags and their content, leaving only
 * the text intended for the user.
 *
 * @example
 * ```typescript
 * const text = `
 * <analyze>User wants a mindmap</analyze>
 * <plan>Create nodes with canvas_write</plan>
 *
 * I've created your mindmap with 5 branches!
 *
 * <summarize>Task complete, 5 elements created</summarize>
 * `;
 *
 * extractUserResponse(text);
 * // Returns: "I've created your mindmap with 5 branches!"
 * ```
 */
export function extractUserResponse(text: string): string {
  if (!text) return "";

  let result = text;

  // Remove each reasoning tag and its content
  for (const tag of REASONING_TAGS) {
    // Match both self-closing and content tags
    // Handles: <tag>content</tag>, <tag/>, <tag />
    const pattern = new RegExp(
      `<${tag}(?:\\s[^>]*)?>(?:[\\s\\S]*?<\\/${tag}>)?|<${tag}\\s*\\/?>`,
      "gi"
    );
    result = result.replace(pattern, "");
  }

  // Clean up extra whitespace
  result = result
    // Replace multiple newlines with double newline
    .replace(/\n{3,}/g, "\n\n")
    // Trim leading/trailing whitespace
    .trim();

  return result;
}

/**
 * Check if text contains only reasoning (no user-facing content)
 *
 * Returns true if after stripping reasoning tags, there's no meaningful
 * content left. This indicates the LLM only output internal reasoning.
 */
export function isReasoningOnly(text: string): boolean {
  const userResponse = extractUserResponse(text);
  // Check if empty or only whitespace
  return userResponse.length === 0;
}

/**
 * Extract reasoning content from LLM text
 *
 * Returns object with each reasoning tag's content for debugging/logging.
 */
export function extractReasoning(text: string): Record<string, string | null> {
  const reasoning: Record<string, string | null> = {};

  for (const tag of REASONING_TAGS) {
    const pattern = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
    const match = text.match(pattern);
    reasoning[tag] = match ? match[1].trim() : null;
  }

  return reasoning;
}

/**
 * Parse LLM output into structured parts
 *
 * Separates reasoning from user-facing response for proper handling.
 */
export interface ParsedLLMOutput {
  /** Clean text for user */
  userResponse: string;
  /** Extracted reasoning by tag */
  reasoning: Record<string, string | null>;
  /** Original full text */
  rawText: string;
  /** Whether there's meaningful user content */
  hasUserContent: boolean;
}

export function parseLLMOutput(text: string): ParsedLLMOutput {
  const userResponse = extractUserResponse(text);
  const reasoning = extractReasoning(text);

  return {
    userResponse,
    reasoning,
    rawText: text,
    hasUserContent: userResponse.length > 0,
  };
}
