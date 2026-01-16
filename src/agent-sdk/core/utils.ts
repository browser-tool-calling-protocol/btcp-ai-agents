/**
 * SDK Utilities
 *
 * Helper functions for parsing LLM responses and extracting data.
 *
 * @example
 * ```typescript
 * import { extractJson, extractCodeBlock, parseStructured } from '@waiboard/ai-agents/sdk';
 *
 * const json = extractJson(response);
 * const code = extractCodeBlock(response, 'typescript');
 * const parsed = parseStructured(response);
 * ```
 */

// ============================================================================
// JSON EXTRACTION
// ============================================================================

/**
 * Extract JSON from an LLM response
 *
 * Handles multiple formats:
 * - Pure JSON response
 * - JSON inside markdown code blocks
 * - JSON mixed with text
 *
 * @example
 * ```typescript
 * const response = '```json\n{"name": "test"}\n```';
 * const data = extractJson(response);
 * // Returns: { name: "test" }
 * ```
 */
export function extractJson<T = unknown>(response: string): T | null {
  // Try markdown code block first
  const jsonMatch = response.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1].trim()) as T;
    } catch {
      // Continue to other methods
    }
  }

  // Try to find JSON object
  const objectMatch = response.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    try {
      return JSON.parse(objectMatch[0]) as T;
    } catch {
      // Continue to other methods
    }
  }

  // Try to find JSON array
  const arrayMatch = response.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try {
      return JSON.parse(arrayMatch[0]) as T;
    } catch {
      // Fall through to return null
    }
  }

  // Try entire response as JSON
  try {
    return JSON.parse(response.trim()) as T;
  } catch {
    return null;
  }
}

/**
 * Extract multiple JSON objects from a response
 */
export function extractAllJson(response: string): unknown[] {
  const results: unknown[] = [];

  // Extract from code blocks
  const codeBlockRegex = /```(?:json)?\s*\n?([\s\S]*?)\n?```/g;
  let match;
  while ((match = codeBlockRegex.exec(response)) !== null) {
    try {
      results.push(JSON.parse(match[1].trim()));
    } catch {
      // Skip invalid JSON
    }
  }

  return results;
}

// ============================================================================
// CODE BLOCK EXTRACTION
// ============================================================================

/**
 * Extract code from a markdown code block
 *
 * @example
 * ```typescript
 * const response = '```python\nprint("hello")\n```';
 * const code = extractCodeBlock(response, 'python');
 * // Returns: 'print("hello")'
 * ```
 */
export function extractCodeBlock(
  response: string,
  language?: string
): string | null {
  const pattern = language
    ? new RegExp(`\`\`\`${language}\\s*\\n?([\\s\\S]*?)\\n?\`\`\``, "i")
    : /```(?:\w+)?\s*\n?([\s\S]*?)\n?```/;

  const match = response.match(pattern);
  return match ? match[1].trim() : null;
}

/**
 * Extract all code blocks from a response
 */
export function extractAllCodeBlocks(
  response: string
): Array<{ language: string | null; code: string }> {
  const results: Array<{ language: string | null; code: string }> = [];
  const regex = /```(\w+)?\s*\n?([\s\S]*?)\n?```/g;

  let match;
  while ((match = regex.exec(response)) !== null) {
    results.push({
      language: match[1] || null,
      code: match[2].trim(),
    });
  }

  return results;
}

// ============================================================================
// STRUCTURED RESPONSE PARSING
// ============================================================================

/**
 * Parsed structured response
 */
export interface ParsedResponse {
  /** Plain text content (outside code blocks) */
  text: string;
  /** Extracted JSON data */
  json: unknown | null;
  /** Code blocks by language */
  codeBlocks: Array<{ language: string | null; code: string }>;
  /** Element IDs mentioned in the response */
  elementIds: string[];
  /** Whether the response indicates success */
  success: boolean;
  /** Error message if present */
  error: string | null;
}

/**
 * Parse a structured LLM response
 *
 * Extracts text, JSON, code blocks, and element IDs from a response.
 *
 * @example
 * ```typescript
 * const response = `
 * I created the following elements:
 * - rect_abc123
 * - text_def456
 *
 * \`\`\`json
 * {"success": true, "elementIds": ["rect_abc123", "text_def456"]}
 * \`\`\`
 * `;
 *
 * const parsed = parseStructured(response);
 * // Returns:
 * // {
 * //   text: "I created the following elements: - rect_abc123 - text_def456",
 * //   json: { success: true, elementIds: [...] },
 * //   elementIds: ["rect_abc123", "text_def456"],
 * //   success: true,
 * //   error: null
 * // }
 * ```
 */
export function parseStructured(response: string): ParsedResponse {
  // Extract code blocks
  const codeBlocks = extractAllCodeBlocks(response);

  // Extract JSON
  const json = extractJson(response);

  // Extract text (remove code blocks)
  let text = response.replace(/```[\s\S]*?```/g, "").trim();
  text = text.replace(/\n{3,}/g, "\n\n"); // Normalize multiple newlines

  // Extract element IDs (common patterns)
  const elementIds: string[] = [];
  const idPatterns = [
    /\b([a-z]+_[a-zA-Z0-9]{6,})\b/g, // type_hash format
    /\bid[=:]["']?([a-zA-Z0-9_-]+)["']?/gi, // id="..." or id:...
    /element[s]?:\s*\[([^\]]+)\]/gi, // elements: [...]
  ];

  for (const pattern of idPatterns) {
    let match;
    while ((match = pattern.exec(response)) !== null) {
      const id = match[1];
      if (id && !elementIds.includes(id)) {
        elementIds.push(id);
      }
    }
  }

  // Also extract from JSON
  if (json && typeof json === "object") {
    const jsonObj = json as Record<string, unknown>;
    if (Array.isArray(jsonObj.elementIds)) {
      for (const id of jsonObj.elementIds) {
        if (typeof id === "string" && !elementIds.includes(id)) {
          elementIds.push(id);
        }
      }
    }
    if (Array.isArray(jsonObj.createdIds)) {
      for (const id of jsonObj.createdIds) {
        if (typeof id === "string" && !elementIds.includes(id)) {
          elementIds.push(id);
        }
      }
    }
  }

  // Determine success
  let success = true;
  let error: string | null = null;

  // Check for error indicators
  const errorPatterns = [
    /error[:\s]+(.+)/i,
    /failed[:\s]+(.+)/i,
    /could not[:\s]+(.+)/i,
    /unable to[:\s]+(.+)/i,
  ];

  for (const pattern of errorPatterns) {
    const match = response.match(pattern);
    if (match) {
      success = false;
      error = match[1].trim();
      break;
    }
  }

  // Check JSON for success/error
  if (json && typeof json === "object") {
    const jsonObj = json as Record<string, unknown>;
    if ("success" in jsonObj) {
      success = Boolean(jsonObj.success);
    }
    if ("error" in jsonObj && typeof jsonObj.error === "string") {
      error = jsonObj.error;
      success = false;
    }
  }

  return {
    text,
    json,
    codeBlocks,
    elementIds,
    success,
    error,
  };
}

// ============================================================================
// ELEMENT ID UTILITIES
// ============================================================================

/**
 * Extract element IDs from text
 */
export function extractElementIds(text: string): string[] {
  const ids: string[] = [];
  const patterns = [
    /\b([a-z]+_[a-zA-Z0-9]{6,})\b/g, // type_hash format (e.g., rect_abc123)
    /\belement[_-]?([a-zA-Z0-9]{6,})\b/gi, // element-id format
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const id = match[1];
      if (id && !ids.includes(id)) {
        ids.push(id);
      }
    }
  }

  return ids;
}

/**
 * Check if a string looks like an element ID
 */
export function isElementId(str: string): boolean {
  return /^[a-z]+_[a-zA-Z0-9]{6,}$/.test(str) || /^element[_-]?[a-zA-Z0-9]{6,}$/i.test(str);
}

// ============================================================================
// XML TAG EXTRACTION (for reasoning tags)
// ============================================================================

/**
 * Extract content from XML-style tags
 *
 * @example
 * ```typescript
 * const response = '<thinking>I need to analyze...</thinking>';
 * const thinking = extractTag(response, 'thinking');
 * // Returns: 'I need to analyze...'
 * ```
 */
export function extractTag(response: string, tagName: string): string | null {
  const pattern = new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`, "i");
  const match = response.match(pattern);
  return match ? match[1].trim() : null;
}

/**
 * Extract all instances of a tag
 */
export function extractAllTags(response: string, tagName: string): string[] {
  const results: string[] = [];
  const pattern = new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`, "gi");

  let match;
  while ((match = pattern.exec(response)) !== null) {
    results.push(match[1].trim());
  }

  return results;
}

/**
 * Common tag names used in agent responses
 */
export const COMMON_TAGS = {
  THINKING: "thinking",
  REASONING: "reasoning",
  PLAN: "plan",
  OBSERVATION: "observation",
  ACTION: "action",
  RESULT: "result",
  SUMMARY: "summary",
} as const;
