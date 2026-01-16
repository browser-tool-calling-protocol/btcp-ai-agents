/**
 * Context Compressor
 *
 * Provides multiple strategies for reducing context size while preserving meaning:
 * - NONE: No compression
 * - TRUNCATE: Simple truncation (fastest, most lossy)
 * - MINIFY: Remove redundant whitespace/formatting
 * - EXTRACT: Extract key information (semi-lossy)
 * - SUMMARIZE: AI-powered summarization (lossy but semantic)
 * - HIERARCHICAL: Multi-level summarization for very long contexts
 * - TOOL_AWARE: Uses domain-specific compressors for tool outputs (NEW)
 *
 * The TOOL_AWARE strategy is a hybrid approach that:
 * 1. Identifies tool results by metadata
 * 2. Applies tool-specific compression (preserves semantics)
 * 3. Falls back to general strategies for non-tool content
 *
 * This beats pure strategy-based compression by understanding tool output formats.
 */

import {
  CompressionStrategy,
  type ContextMessage,
  type ContextCompressor,
  type CompressionOptions,
  type CompressionResult,
  type TokenEstimator,
  type TokenBudget,
} from "./types.js";
import { ClaudeTokenEstimator } from "./tokens.js";
import { createMessage } from "./memory.js";
import {
  compressToolResult,
  hasToolCompressor,
  type ToolCompressorResult,
} from "./tool-compressors.js";

// =============================================================================
// Compression Implementation
// =============================================================================

/**
 * Default context compressor with multiple strategies.
 */
export class DefaultContextCompressor implements ContextCompressor {
  private estimator: TokenEstimator;
  private summarizer?: SummarizerFn;

  constructor(estimator?: TokenEstimator, summarizer?: SummarizerFn) {
    this.estimator = estimator ?? new ClaudeTokenEstimator();
    this.summarizer = summarizer;
  }

  /**
   * Compress messages using the specified strategy.
   */
  async compress(
    messages: ContextMessage[],
    options: CompressionOptions
  ): Promise<CompressionResult> {
    const originalTokens = this.countTokens(messages);

    // Determine target tokens
    const targetTokens = options.targetTokens ??
      (options.targetRatio !== undefined
        ? Math.ceil(originalTokens * options.targetRatio)
        : Math.ceil(originalTokens * 0.5));

    // If already under target, no compression needed
    if (originalTokens <= targetTokens) {
      return {
        original: messages,
        compressed: messages,
        originalTokens,
        compressedTokens: originalTokens,
        ratio: 1,
        strategy: CompressionStrategy.NONE,
        lossiness: "none",
      };
    }

    // Apply strategy
    let compressed: ContextMessage[];
    let lossiness: CompressionResult["lossiness"];

    switch (options.strategy) {
      case CompressionStrategy.NONE:
        compressed = messages;
        lossiness = "none";
        break;

      case CompressionStrategy.TRUNCATE:
        compressed = this.truncate(messages, targetTokens);
        lossiness = "high";
        break;

      case CompressionStrategy.MINIFY:
        compressed = this.minify(messages, options.preservePatterns);
        lossiness = "minimal";
        break;

      case CompressionStrategy.EXTRACT:
        compressed = this.extract(messages, targetTokens, options.preservePatterns);
        lossiness = "moderate";
        break;

      case CompressionStrategy.SUMMARIZE:
        if (!this.summarizer) {
          throw new Error("Summarizer not configured");
        }
        compressed = await this.summarize(
          messages,
          targetTokens,
          options.summaryPrompt
        );
        lossiness = "moderate";
        break;

      case CompressionStrategy.HIERARCHICAL:
        if (!this.summarizer) {
          throw new Error("Summarizer not configured");
        }
        compressed = await this.hierarchicalSummarize(messages, targetTokens);
        lossiness = "moderate";
        break;

      case CompressionStrategy.TOOL_AWARE:
        compressed = this.toolAwareCompress(messages, targetTokens);
        lossiness = "moderate";
        break;

      default:
        compressed = messages;
        lossiness = "none";
    }

    const compressedTokens = this.countTokens(compressed);

    return {
      original: messages,
      compressed,
      originalTokens,
      compressedTokens,
      ratio: compressedTokens / originalTokens,
      strategy: options.strategy,
      lossiness,
    };
  }

  /**
   * Estimate compression result without actually compressing.
   */
  async estimate(
    messages: ContextMessage[],
    options: CompressionOptions
  ): Promise<{ estimatedTokens: number; estimatedRatio: number }> {
    const originalTokens = this.countTokens(messages);

    // Estimate based on strategy
    let estimatedRatio: number;

    switch (options.strategy) {
      case CompressionStrategy.NONE:
        estimatedRatio = 1;
        break;

      case CompressionStrategy.TRUNCATE:
        estimatedRatio = options.targetRatio ?? 0.5;
        break;

      case CompressionStrategy.MINIFY:
        estimatedRatio = 0.85; // Typically saves ~15%
        break;

      case CompressionStrategy.EXTRACT:
        estimatedRatio = 0.4; // Typically saves ~60%
        break;

      case CompressionStrategy.SUMMARIZE:
        estimatedRatio = options.targetRatio ?? 0.3;
        break;

      case CompressionStrategy.HIERARCHICAL:
        estimatedRatio = 0.2; // Most aggressive
        break;

      case CompressionStrategy.TOOL_AWARE:
        estimatedRatio = 0.35; // Tool-specific compression is efficient
        break;

      default:
        estimatedRatio = 1;
    }

    const estimatedTokens = Math.ceil(originalTokens * estimatedRatio);

    return { estimatedTokens, estimatedRatio };
  }

  /**
   * Check if compression is recommended.
   */
  shouldCompress(messages: ContextMessage[], budget: TokenBudget): boolean {
    const currentTokens = this.countTokens(messages);
    const utilizationRatio = currentTokens / budget.maxTokens;

    // Compress if over 70% utilization
    return utilizationRatio > 0.7;
  }

  // ===========================================================================
  // Compression Strategies
  // ===========================================================================

  /**
   * Simple truncation - keeps newest messages.
   */
  private truncate(messages: ContextMessage[], targetTokens: number): ContextMessage[] {
    // Sort by timestamp descending (newest first)
    const sorted = [...messages].sort((a, b) => b.timestamp - a.timestamp);

    const result: ContextMessage[] = [];
    let totalTokens = 0;

    for (const message of sorted) {
      const msgTokens = message.tokens ?? this.estimator.estimateMessage(message);

      if (totalTokens + msgTokens <= targetTokens) {
        result.unshift(message); // Add to front to maintain order
        totalTokens += msgTokens;
      }
    }

    return result;
  }

  /**
   * Minify - remove redundant whitespace and formatting.
   */
  private minify(
    messages: ContextMessage[],
    preservePatterns?: RegExp[]
  ): ContextMessage[] {
    return messages.map((message) => {
      if (typeof message.content !== "string") {
        return message;
      }

      let content = message.content;

      // Preserve specific patterns
      const preservations: Array<{ placeholder: string; original: string }> = [];
      if (preservePatterns) {
        for (const pattern of preservePatterns) {
          const matches = content.match(pattern) ?? [];
          for (const match of matches) {
            const placeholder = `__PRESERVE_${preservations.length}__`;
            preservations.push({ placeholder, original: match });
            content = content.replace(match, placeholder);
          }
        }
      }

      // Minify
      content = content
        // Collapse multiple spaces
        .replace(/  +/g, " ")
        // Collapse multiple newlines
        .replace(/\n\n+/g, "\n")
        // Remove leading/trailing whitespace from lines
        .replace(/^ +| +$/gm, "")
        // Remove empty lines
        .replace(/^\s*[\r\n]/gm, "")
        .trim();

      // Restore preserved patterns
      for (const { placeholder, original } of preservations) {
        content = content.replace(placeholder, original);
      }

      return {
        ...message,
        content,
        tokens: undefined, // Recompute
      };
    });
  }

  /**
   * Extract key information from messages.
   */
  private extract(
    messages: ContextMessage[],
    targetTokens: number,
    preservePatterns?: RegExp[]
  ): ContextMessage[] {
    const result: ContextMessage[] = [];
    let totalTokens = 0;

    // Calculate tokens per message budget
    const avgTokensPerMessage = targetTokens / messages.length;

    for (const message of messages) {
      if (typeof message.content !== "string") {
        result.push(message);
        totalTokens += message.tokens ?? this.estimator.estimateMessage(message);
        continue;
      }

      const extracted = this.extractKeyContent(
        message.content,
        avgTokensPerMessage,
        preservePatterns
      );

      const newMessage = {
        ...message,
        content: extracted,
        tokens: undefined, // Recompute
      };

      result.push(newMessage);
      totalTokens += this.estimator.estimateMessage(newMessage);
    }

    return result;
  }

  /**
   * Extract key content from text.
   */
  private extractKeyContent(
    text: string,
    targetTokens: number,
    preservePatterns?: RegExp[]
  ): string {
    const lines = text.split("\n");
    const scoredLines: Array<{ line: string; score: number }> = [];

    for (const line of lines) {
      let score = 0;

      // Score based on patterns
      if (/^#+ /.test(line)) score += 10; // Headers
      if (/^[-*] /.test(line)) score += 5; // List items
      if (/\b(error|warning|important|note|todo)\b/i.test(line)) score += 8;
      if (/\b(function|class|const|let|var)\b/.test(line)) score += 6;
      if (/^\s*$/.test(line)) score -= 5; // Empty lines

      // Preserve patterns get high score
      if (preservePatterns?.some((p) => p.test(line))) {
        score += 20;
      }

      // Shorter lines are often more important (headings, etc.)
      if (line.length < 80) score += 2;

      scoredLines.push({ line, score });
    }

    // Sort by score descending
    scoredLines.sort((a, b) => b.score - a.score);

    // Take lines until we hit target tokens
    const result: string[] = [];
    let totalTokens = 0;
    const targetChars = targetTokens * 3.5; // Approximate

    for (const { line } of scoredLines) {
      if (totalTokens + line.length / 3.5 > targetTokens) {
        break;
      }
      result.push(line);
      totalTokens += line.length / 3.5;
    }

    // Re-sort by original order
    const lineIndices = new Map(lines.map((l, i) => [l, i]));
    result.sort((a, b) => (lineIndices.get(a) ?? 0) - (lineIndices.get(b) ?? 0));

    return result.join("\n");
  }

  /**
   * AI-powered summarization.
   */
  private async summarize(
    messages: ContextMessage[],
    targetTokens: number,
    customPrompt?: string
  ): Promise<ContextMessage[]> {
    if (!this.summarizer) {
      throw new Error("Summarizer not configured");
    }

    // Group messages into conversation chunks
    const conversationText = messages
      .map((m) => {
        const content =
          typeof m.content === "string" ? m.content : JSON.stringify(m.content);
        return `[${m.role}]: ${content}`;
      })
      .join("\n\n");

    const prompt =
      customPrompt ??
      `Summarize this conversation, preserving key decisions, important context, and actionable items. Be concise but comprehensive. Target length: ~${targetTokens} tokens.`;

    const summary = await this.summarizer(conversationText, prompt, targetTokens);

    // Create a single summary message
    const summaryMessage = createMessage("assistant", summary, {
      id: `summary_${Date.now()}`,
      priority: 50, // Normal priority
      compressible: false, // Don't re-compress summaries
      summarizedFrom: messages.map((m) => m.id),
    });

    summaryMessage.tokens = this.estimator.estimateMessage(summaryMessage);

    return [summaryMessage];
  }

  /**
   * Hierarchical summarization for very long contexts.
   */
  private async hierarchicalSummarize(
    messages: ContextMessage[],
    targetTokens: number
  ): Promise<ContextMessage[]> {
    if (!this.summarizer) {
      throw new Error("Summarizer not configured");
    }

    const CHUNK_SIZE = 20; // Messages per chunk
    const chunks: ContextMessage[][] = [];

    for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
      chunks.push(messages.slice(i, i + CHUNK_SIZE));
    }

    // First level: summarize each chunk
    const chunkSummaries: ContextMessage[] = [];
    const tokensPerChunk = Math.ceil(targetTokens / chunks.length);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const [summary] = await this.summarize(
        chunk,
        tokensPerChunk,
        `Summarize this section of conversation (part ${i + 1} of ${chunks.length}). Preserve key details.`
      );
      chunkSummaries.push(summary);
    }

    // If still over target, summarize the summaries
    const currentTokens = this.countTokens(chunkSummaries);
    if (currentTokens > targetTokens * 1.2) {
      return this.summarize(
        chunkSummaries,
        targetTokens,
        "Combine these conversation summaries into a single coherent summary. Preserve the most important information."
      );
    }

    return chunkSummaries;
  }

  // ===========================================================================
  // Tool-Aware Compression
  // ===========================================================================

  /**
   * Tool-aware compression - hybrid approach.
   *
   * This is the key innovation that beats pure strategy-based compression:
   * 1. Identify tool results by role or metadata
   * 2. Apply tool-specific compressors that understand output format
   * 3. Fall back to EXTRACT for non-tool content
   *
   * Tool compressors preserve semantically important information:
   * - Read: file structure, imports, exports, signatures
   * - Grep: match counts, file distribution, samples
   * - Bash: exit code, errors prioritized over stdout
   * - Canvas: element IDs, types, bounds
   */
  private toolAwareCompress(
    messages: ContextMessage[],
    targetTokens: number
  ): ContextMessage[] {
    const result: ContextMessage[] = [];
    let tokensUsed = 0;

    // Calculate per-message budget
    const avgBudget = targetTokens / messages.length;

    for (const message of messages) {
      // Check if this is a tool result
      const toolName = this.getToolName(message);
      const messageTokens = message.tokens ?? this.estimator.estimateMessage(message);
      const messageBudget = Math.floor(avgBudget * 1.2); // Allow slight overflow per message

      if (toolName && hasToolCompressor(toolName)) {
        // Tool result - use tool-specific compressor
        const content = typeof message.content === "string"
          ? message.content
          : JSON.stringify(message.content);

        const compressed = compressToolResult(toolName, content, {
          budget: messageBudget,
          level: this.getCompressionLevel(messageTokens, messageBudget),
        });

        const newMessage: ContextMessage = {
          ...message,
          content: compressed.content,
          tokens: compressed.compressedTokens,
          metadata: {
            ...message.metadata,
            compressed: true,
            compressionRatio: compressed.ratio,
            compressionSummary: compressed.summary,
          },
        };

        result.push(newMessage);
        tokensUsed += compressed.compressedTokens;
      } else if (messageTokens <= messageBudget) {
        // Fits in budget - keep as is
        result.push(message);
        tokensUsed += messageTokens;
      } else {
        // Non-tool content that needs compression - use EXTRACT
        const extracted = this.extractKeyContent(
          typeof message.content === "string"
            ? message.content
            : JSON.stringify(message.content),
          messageBudget,
          undefined
        );

        const newMessage: ContextMessage = {
          ...message,
          content: extracted,
          tokens: undefined, // Recompute
          metadata: {
            ...message.metadata,
            compressed: true,
          },
        };

        result.push(newMessage);
        tokensUsed += this.estimator.estimateMessage(newMessage);
      }
    }

    return result;
  }

  /**
   * Get tool name from message metadata.
   */
  private getToolName(message: ContextMessage): string | undefined {
    // Check metadata
    if (message.metadata?.toolName) {
      return message.metadata.toolName as string;
    }

    // Check role
    if (message.role === "tool") {
      // Try to infer from content
      const content = typeof message.content === "string"
        ? message.content
        : JSON.stringify(message.content);

      // Common tool output patterns
      if (content.startsWith("Exit code:") || content.includes("stdout:")) {
        return "Bash";
      }
      if (content.includes("matches") && content.includes("files")) {
        return "Grep";
      }
      if (content.startsWith("[") || content.startsWith("{")) {
        // Could be canvas_read or other JSON output
        try {
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed) && parsed[0]?.type) {
            return "canvas_read";
          }
        } catch {
          // Not JSON
        }
      }
    }

    return undefined;
  }

  /**
   * Determine compression level based on ratio needed.
   */
  private getCompressionLevel(
    currentTokens: number,
    budget: number
  ): "light" | "moderate" | "aggressive" {
    const ratio = budget / currentTokens;
    if (ratio >= 0.7) return "light";
    if (ratio >= 0.4) return "moderate";
    return "aggressive";
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  private countTokens(messages: ContextMessage[]): number {
    return messages.reduce((sum, m) => {
      return sum + (m.tokens ?? this.estimator.estimateMessage(m));
    }, 0);
  }
}

// =============================================================================
// Types
// =============================================================================

/**
 * Summarizer function type.
 * Takes text to summarize, a prompt, and target tokens.
 * Returns the summary.
 */
export type SummarizerFn = (
  text: string,
  prompt: string,
  targetTokens: number
) => Promise<string>;

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a compressor with optional AI summarization.
 */
export function createCompressor(
  estimator?: TokenEstimator,
  summarizer?: SummarizerFn
): ContextCompressor {
  return new DefaultContextCompressor(estimator, summarizer);
}

/**
 * Create a simple compressor without AI summarization.
 */
export function createSimpleCompressor(estimator?: TokenEstimator): ContextCompressor {
  return new DefaultContextCompressor(estimator);
}

/**
 * Create a compressor with LLM-based summarization.
 *
 * @example
 * ```typescript
 * import { generateText } from 'ai';
 * import { google } from '@ai-sdk/google';
 *
 * const compressor = createLLMCompressor(async (text, prompt, targetTokens) => {
 *   const { text: summary } = await generateText({
 *     model: google('gemini-2.5-flash'),
 *     prompt: `${prompt}\n\n---\n\n${text}`,
 *     maxTokens: targetTokens,
 *   });
 *   return summary;
 * });
 * ```
 */
export function createLLMCompressor(summarizer: SummarizerFn): ContextCompressor {
  return new DefaultContextCompressor(undefined, summarizer);
}

/**
 * @deprecated Use createLLMCompressor instead
 */
export const createClaudeCompressor = createLLMCompressor;

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Quick compression with default settings.
 */
export async function quickCompress(
  messages: ContextMessage[],
  targetRatio: number = 0.5
): Promise<CompressionResult> {
  const compressor = createSimpleCompressor();
  return compressor.compress(messages, {
    strategy: CompressionStrategy.EXTRACT,
    targetRatio,
  });
}

/**
 * Get recommended strategy based on compression target.
 *
 * @param currentTokens - Current token count
 * @param targetTokens - Target token budget
 * @param hasSummarizer - Whether AI summarization is available
 * @param hasToolContent - Whether content includes tool results (enables TOOL_AWARE)
 */
export function getRecommendedStrategy(
  currentTokens: number,
  targetTokens: number,
  hasSummarizer: boolean,
  hasToolContent: boolean = false
): CompressionStrategy {
  const ratio = targetTokens / currentTokens;

  if (ratio >= 1) {
    return CompressionStrategy.NONE;
  }

  if (ratio >= 0.8) {
    return CompressionStrategy.MINIFY;
  }

  // TOOL_AWARE is preferred for ratios 0.3-0.7 when tool content is present
  // It's more semantic than EXTRACT and doesn't require AI like SUMMARIZE
  if (hasToolContent && ratio >= 0.3 && ratio < 0.8) {
    return CompressionStrategy.TOOL_AWARE;
  }

  if (ratio >= 0.5) {
    return CompressionStrategy.EXTRACT;
  }

  if (hasSummarizer) {
    if (ratio >= 0.2) {
      return CompressionStrategy.SUMMARIZE;
    }
    return CompressionStrategy.HIERARCHICAL;
  }

  // For aggressive compression without summarizer, TOOL_AWARE beats TRUNCATE
  if (hasToolContent) {
    return CompressionStrategy.TOOL_AWARE;
  }

  return CompressionStrategy.TRUNCATE;
}

// Re-export CompressionStrategy for convenience
export { CompressionStrategy } from "./types.js";
