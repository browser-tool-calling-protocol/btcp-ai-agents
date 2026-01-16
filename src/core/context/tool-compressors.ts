/**
 * Tool-Specific Compressors
 *
 * Domain-aware compression for tool outputs. These understand the semantics
 * of each tool's output and preserve the most important information.
 *
 * This is a HYBRID approach that beats both:
 * 1. Pure strategy pattern (loses tool semantics)
 * 2. Pure tool rules (inflexible, hard to extend)
 *
 * How it works:
 * - Tool compressors preprocess outputs with domain knowledge
 * - Then feed into the general compression pipeline
 * - Result: tool-specific intelligence + flexible strategies
 *
 * @example
 * ```typescript
 * import { compressToolResult, registerToolCompressor } from './tool-compressors';
 *
 * // Compress a Read result
 * const compressed = compressToolResult('Read', fileContent, { budget: 500 });
 *
 * // Register a custom compressor for canvas tools
 * registerToolCompressor('canvas_read', canvasReadCompressor);
 * ```
 */

import { estimateTokens } from "./tokens.js";

// =============================================================================
// Types
// =============================================================================

export interface ToolCompressorOptions {
  /** Target token budget */
  budget: number;

  /** Preserve these patterns even when compressing */
  preservePatterns?: RegExp[];

  /** Compression level: 'light' | 'moderate' | 'aggressive' */
  level?: "light" | "moderate" | "aggressive";

  /** Tool-specific metadata */
  metadata?: Record<string, unknown>;
}

export interface ToolCompressorResult {
  /** Compressed content */
  content: string;

  /** Original token count */
  originalTokens: number;

  /** Compressed token count */
  compressedTokens: number;

  /** Compression ratio (0-1) */
  ratio: number;

  /** What was preserved */
  preserved: string[];

  /** What was dropped */
  dropped: string[];

  /** Summary of changes */
  summary: string;
}

export type ToolCompressor = (
  content: string,
  options: ToolCompressorOptions
) => ToolCompressorResult;

// =============================================================================
// Tool Compressor Registry
// =============================================================================

const toolCompressors = new Map<string, ToolCompressor>();

/**
 * Register a tool-specific compressor.
 */
export function registerToolCompressor(
  toolName: string,
  compressor: ToolCompressor
): void {
  toolCompressors.set(toolName.toLowerCase(), compressor);
}

/**
 * Get a tool compressor by name.
 */
export function getToolCompressor(toolName: string): ToolCompressor | undefined {
  return toolCompressors.get(toolName.toLowerCase());
}

/**
 * Check if a tool has a specific compressor.
 */
export function hasToolCompressor(toolName: string): boolean {
  return toolCompressors.has(toolName.toLowerCase());
}

// =============================================================================
// Read Tool Compressor
// =============================================================================

/**
 * Compressor for Read tool output (file contents).
 *
 * Strategy:
 * - Keep file structure visible (imports, exports, class/function signatures)
 * - Preserve first and last lines (context boundaries)
 * - Sample middle sections with clear markers
 * - Prioritize: errors > exports > imports > signatures > body
 */
const readCompressor: ToolCompressor = (content, options) => {
  const originalTokens = estimateTokens(content);

  if (originalTokens <= options.budget) {
    return {
      content,
      originalTokens,
      compressedTokens: originalTokens,
      ratio: 1,
      preserved: ["full content"],
      dropped: [],
      summary: "No compression needed",
    };
  }

  const lines = content.split("\n");
  const preserved: string[] = [];
  const dropped: string[] = [];

  // Calculate line budgets based on compression level
  const levelMultipliers = {
    light: { first: 0.35, last: 0.35, middle: 0.3 },
    moderate: { first: 0.3, last: 0.3, middle: 0.2 },
    aggressive: { first: 0.25, last: 0.25, middle: 0.1 },
  };
  const multipliers = levelMultipliers[options.level ?? "moderate"];

  const avgTokensPerLine = originalTokens / lines.length;
  const firstLineCount = Math.floor(
    (options.budget * multipliers.first) / avgTokensPerLine
  );
  const lastLineCount = Math.floor(
    (options.budget * multipliers.last) / avgTokensPerLine
  );

  // Extract important lines
  const importantPatterns = [
    /^import\s/,
    /^export\s/,
    /^(async\s+)?function\s+\w+/,
    /^(export\s+)?(class|interface|type|enum)\s+\w+/,
    /^const\s+\w+\s*=/,
    /error|Error|ERROR/i,
    /TODO|FIXME|HACK|XXX/i,
  ];

  const importantLines: Array<{ index: number; line: string; reason: string }> = [];

  for (let i = 0; i < lines.length; i++) {
    for (const pattern of importantPatterns) {
      if (pattern.test(lines[i])) {
        importantLines.push({
          index: i,
          line: lines[i],
          reason: pattern.source,
        });
        break;
      }
    }
  }

  // Also check preserve patterns from options
  if (options.preservePatterns) {
    for (let i = 0; i < lines.length; i++) {
      for (const pattern of options.preservePatterns) {
        if (pattern.test(lines[i])) {
          if (!importantLines.find((l) => l.index === i)) {
            importantLines.push({
              index: i,
              line: lines[i],
              reason: "user pattern",
            });
          }
          break;
        }
      }
    }
  }

  // Build compressed output
  const result: string[] = [];
  let tokensUsed = 0;

  // First N lines
  const firstLines = lines.slice(0, firstLineCount);
  result.push(...firstLines);
  tokensUsed += estimateTokens(firstLines.join("\n"));
  preserved.push(`first ${firstLineCount} lines`);

  // Important lines from middle
  const middleImportant = importantLines.filter(
    (l) => l.index >= firstLineCount && l.index < lines.length - lastLineCount
  );

  if (middleImportant.length > 0) {
    const middleBudget = options.budget * multipliers.middle;
    let middleTokens = 0;

    result.push(`\n... (${lines.length - firstLineCount - lastLineCount} lines) ...\n`);
    result.push("// Key signatures and exports:");

    for (const { line, reason } of middleImportant) {
      const lineTokens = estimateTokens(line);
      if (middleTokens + lineTokens <= middleBudget) {
        result.push(line);
        middleTokens += lineTokens;
        preserved.push(reason);
      }
    }

    tokensUsed += middleTokens + 20; // 20 for markers
  } else {
    result.push(
      `\n... (${lines.length - firstLineCount - lastLineCount} lines omitted) ...\n`
    );
    dropped.push("middle section (no important patterns found)");
  }

  // Last N lines
  const lastLines = lines.slice(-lastLineCount);
  result.push(...lastLines);
  tokensUsed += estimateTokens(lastLines.join("\n"));
  preserved.push(`last ${lastLineCount} lines`);

  const compressed = result.join("\n");
  const compressedTokens = estimateTokens(compressed);

  return {
    content: compressed,
    originalTokens,
    compressedTokens,
    ratio: compressedTokens / originalTokens,
    preserved,
    dropped,
    summary: `Kept ${firstLineCount + lastLineCount} boundary lines + ${middleImportant.length} signatures`,
  };
};

// =============================================================================
// Grep Tool Compressor
// =============================================================================

interface GrepMatch {
  file: string;
  line: number;
  content: string;
  context?: string[];
}

/**
 * Compressor for Grep tool output (search results).
 *
 * Strategy:
 * - Always show total count and file distribution
 * - Sample matches across different files (not just first N)
 * - Preserve matches with higher relevance (exact vs partial)
 * - Group by file for readability
 */
const grepCompressor: ToolCompressor = (content, options) => {
  const originalTokens = estimateTokens(content);

  if (originalTokens <= options.budget) {
    return {
      content,
      originalTokens,
      compressedTokens: originalTokens,
      ratio: 1,
      preserved: ["full results"],
      dropped: [],
      summary: "No compression needed",
    };
  }

  // Try to parse as JSON (structured grep output)
  let matches: GrepMatch[] = [];
  let isStructured = false;

  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      matches = parsed;
      isStructured = true;
    }
  } catch {
    // Plain text grep output - parse line by line
    const lines = content.split("\n").filter((l) => l.trim());
    matches = lines.map((line) => {
      const match = line.match(/^([^:]+):(\d+):(.*)$/);
      if (match) {
        return { file: match[1], line: parseInt(match[2]), content: match[3] };
      }
      return { file: "unknown", line: 0, content: line };
    });
  }

  const totalMatches = matches.length;
  const preserved: string[] = [];
  const dropped: string[] = [];

  // Group by file
  const byFile = new Map<string, GrepMatch[]>();
  for (const match of matches) {
    const existing = byFile.get(match.file) ?? [];
    existing.push(match);
    byFile.set(match.file, existing);
  }

  const fileCount = byFile.size;

  // Calculate how many samples to show
  const headerTokens = 50; // For summary header
  const matchBudget = options.budget - headerTokens;
  const tokensPerMatch = isStructured ? 30 : 15;
  const maxSamples = Math.floor(matchBudget / tokensPerMatch);

  // Distribute samples across files
  const samplesPerFile = Math.max(1, Math.floor(maxSamples / fileCount));
  const sampleMatches: GrepMatch[] = [];

  for (const [file, fileMatches] of byFile.entries()) {
    // Take first, middle, and last from each file
    const indices = [
      0,
      Math.floor(fileMatches.length / 2),
      fileMatches.length - 1,
    ];
    const uniqueIndices = [...new Set(indices)].slice(0, samplesPerFile);

    for (const idx of uniqueIndices) {
      if (fileMatches[idx]) {
        sampleMatches.push(fileMatches[idx]);
      }
    }

    if (fileMatches.length > samplesPerFile) {
      dropped.push(`${fileMatches.length - samplesPerFile} matches from ${file}`);
    }
  }

  preserved.push(`${sampleMatches.length} sample matches across ${fileCount} files`);

  // Build output
  const result: string[] = [];

  result.push(`Found ${totalMatches} matches across ${fileCount} files.`);
  result.push("");

  if (isStructured) {
    // JSON-style output
    result.push("Sample matches:");
    result.push(JSON.stringify(sampleMatches, null, 2));
  } else {
    // Text-style output
    result.push("Sample matches:");
    for (const match of sampleMatches) {
      result.push(`${match.file}:${match.line}: ${match.content}`);
    }
  }

  if (totalMatches > sampleMatches.length) {
    result.push("");
    result.push(`... and ${totalMatches - sampleMatches.length} more matches`);
  }

  const compressed = result.join("\n");
  const compressedTokens = estimateTokens(compressed);

  return {
    content: compressed,
    originalTokens,
    compressedTokens,
    ratio: compressedTokens / originalTokens,
    preserved,
    dropped,
    summary: `Sampled ${sampleMatches.length}/${totalMatches} matches from ${fileCount} files`,
  };
};

// =============================================================================
// Bash Tool Compressor
// =============================================================================

interface BashResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  command?: string;
  duration?: number;
}

/**
 * Compressor for Bash tool output.
 *
 * Strategy:
 * - Always preserve exit code (critical for success/failure)
 * - Prioritize stderr over stdout (errors are more important)
 * - For successful commands: truncate stdout intelligently
 * - For failed commands: preserve as much error context as possible
 * - Keep first/last lines of output (often most informative)
 */
const bashCompressor: ToolCompressor = (content, options) => {
  const originalTokens = estimateTokens(content);

  if (originalTokens <= options.budget) {
    return {
      content,
      originalTokens,
      compressedTokens: originalTokens,
      ratio: 1,
      preserved: ["full output"],
      dropped: [],
      summary: "No compression needed",
    };
  }

  // Try to parse as structured result
  let result: BashResult;
  try {
    result = JSON.parse(content);
  } catch {
    // Plain text - assume it's stdout
    result = {
      exitCode: 0,
      stdout: content,
      stderr: "",
    };
  }

  const preserved: string[] = [];
  const dropped: string[] = [];
  const output: string[] = [];

  // Always include exit code
  output.push(`Exit code: ${result.exitCode}`);
  preserved.push("exit code");

  // Include command if available
  if (result.command) {
    output.push(`Command: ${result.command}`);
    preserved.push("command");
  }

  const headerTokens = estimateTokens(output.join("\n"));
  const contentBudget = options.budget - headerTokens - 10;

  // Failed command: prioritize stderr
  if (result.exitCode !== 0) {
    const stderrTokens = estimateTokens(result.stderr);
    const stdoutTokens = estimateTokens(result.stdout);

    if (stderrTokens <= contentBudget) {
      // Full stderr fits
      output.push("\nstderr:");
      output.push(result.stderr);
      preserved.push("full stderr");

      // Add stdout if space remains
      const remaining = contentBudget - stderrTokens;
      if (remaining > 50 && result.stdout) {
        const truncatedStdout = truncateWithMarker(
          result.stdout,
          remaining,
          "stdout"
        );
        output.push("\nstdout (truncated):");
        output.push(truncatedStdout);
        preserved.push("partial stdout");
      } else if (result.stdout) {
        dropped.push(`stdout (${stdoutTokens} tokens)`);
      }
    } else {
      // Truncate stderr
      const truncatedStderr = truncateWithMarker(
        result.stderr,
        contentBudget,
        "stderr"
      );
      output.push("\nstderr (truncated):");
      output.push(truncatedStderr);
      preserved.push("truncated stderr");
      if (result.stdout) {
        dropped.push(`stdout (${stdoutTokens} tokens)`);
      }
    }
  } else {
    // Successful command: balance stdout/stderr
    const stderrTokens = estimateTokens(result.stderr);
    const stdoutTokens = estimateTokens(result.stdout);

    // Give 70% to stdout, 30% to stderr for successful commands
    const stderrBudget = result.stderr
      ? Math.min(stderrTokens, contentBudget * 0.3)
      : 0;
    const stdoutBudget = contentBudget - stderrBudget;

    if (result.stdout) {
      if (stdoutTokens <= stdoutBudget) {
        output.push("\nstdout:");
        output.push(result.stdout);
        preserved.push("full stdout");
      } else {
        const truncated = truncateWithMarker(result.stdout, stdoutBudget, "stdout");
        output.push("\nstdout (truncated):");
        output.push(truncated);
        preserved.push("truncated stdout");
        dropped.push(`${stdoutTokens - stdoutBudget} tokens from stdout`);
      }
    }

    if (result.stderr) {
      if (stderrTokens <= stderrBudget) {
        output.push("\nstderr:");
        output.push(result.stderr);
        preserved.push("full stderr");
      } else {
        const truncated = truncateWithMarker(result.stderr, stderrBudget, "stderr");
        output.push("\nstderr (truncated):");
        output.push(truncated);
        preserved.push("truncated stderr");
      }
    }
  }

  const compressed = output.join("\n");
  const compressedTokens = estimateTokens(compressed);

  return {
    content: compressed,
    originalTokens,
    compressedTokens,
    ratio: compressedTokens / originalTokens,
    preserved,
    dropped,
    summary: result.exitCode !== 0
      ? `Failed (exit ${result.exitCode}), preserved error context`
      : `Success, truncated output`,
  };
};

// =============================================================================
// Glob Tool Compressor
// =============================================================================

/**
 * Compressor for Glob tool output (file lists).
 *
 * Strategy:
 * - Always show total count
 * - Group by directory
 * - Show directory structure with file counts
 * - Sample actual filenames
 */
const globCompressor: ToolCompressor = (content, options) => {
  const originalTokens = estimateTokens(content);

  if (originalTokens <= options.budget) {
    return {
      content,
      originalTokens,
      compressedTokens: originalTokens,
      ratio: 1,
      preserved: ["full file list"],
      dropped: [],
      summary: "No compression needed",
    };
  }

  // Parse file list
  let files: string[];
  try {
    files = JSON.parse(content);
  } catch {
    files = content.split("\n").filter((f) => f.trim());
  }

  const totalFiles = files.length;
  const preserved: string[] = [];
  const dropped: string[] = [];

  // Group by directory
  const byDir = new Map<string, string[]>();
  for (const file of files) {
    const parts = file.split("/");
    const dir = parts.slice(0, -1).join("/") || ".";
    const existing = byDir.get(dir) ?? [];
    existing.push(parts[parts.length - 1]);
    byDir.set(dir, existing);
  }

  // Build compressed output
  const output: string[] = [];
  output.push(`Found ${totalFiles} files in ${byDir.size} directories:`);
  output.push("");

  const headerTokens = estimateTokens(output.join("\n"));
  const dirBudget = (options.budget - headerTokens) / byDir.size;
  const filesPerDir = Math.max(2, Math.floor(dirBudget / 5)); // ~5 tokens per filename

  for (const [dir, dirFiles] of byDir.entries()) {
    output.push(`${dir}/ (${dirFiles.length} files)`);

    const samples = dirFiles.slice(0, filesPerDir);
    for (const file of samples) {
      output.push(`  ${file}`);
    }

    if (dirFiles.length > filesPerDir) {
      output.push(`  ... and ${dirFiles.length - filesPerDir} more`);
      dropped.push(`${dirFiles.length - filesPerDir} files from ${dir}`);
    }

    preserved.push(`${Math.min(filesPerDir, dirFiles.length)} files from ${dir}`);
  }

  const compressed = output.join("\n");
  const compressedTokens = estimateTokens(compressed);

  return {
    content: compressed,
    originalTokens,
    compressedTokens,
    ratio: compressedTokens / originalTokens,
    preserved,
    dropped,
    summary: `Sampled ${filesPerDir} files per directory from ${byDir.size} directories`,
  };
};

// =============================================================================
// Canvas Tools Compressors
// =============================================================================

/**
 * Compressor for canvas_read tool output (element JSON).
 *
 * Strategy:
 * - Preserve IDs and types (always needed for operations)
 * - Preserve bounds (position/size critical for spatial reasoning)
 * - Compress style properties (keep key ones like fill, stroke)
 * - Summarize children instead of full expansion
 */
const canvasReadCompressor: ToolCompressor = (content, options) => {
  const originalTokens = estimateTokens(content);

  if (originalTokens <= options.budget) {
    return {
      content,
      originalTokens,
      compressedTokens: originalTokens,
      ratio: 1,
      preserved: ["full element data"],
      dropped: [],
      summary: "No compression needed",
    };
  }

  let elements: unknown[];
  try {
    const parsed = JSON.parse(content);
    elements = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    // Not JSON, use generic compression
    return genericCompressor(content, options);
  }

  const preserved: string[] = [];
  const dropped: string[] = [];

  // Compress each element
  const compressElement = (el: Record<string, unknown>, depth: number): Record<string, unknown> => {
    const result: Record<string, unknown> = {};

    // Always preserve these
    const essentialKeys = ["id", "type", "x", "y", "width", "height", "name"];
    for (const key of essentialKeys) {
      if (el[key] !== undefined) {
        result[key] = el[key];
      }
    }

    // Preserve key style properties
    const styleKeys = ["fill", "stroke", "strokeWidth", "opacity", "fontSize"];
    for (const key of styleKeys) {
      if (el[key] !== undefined) {
        result[key] = el[key];
      }
    }
    preserved.push("essential properties");

    // Handle children - summarize if deep
    if (Array.isArray(el.children)) {
      if (depth < 2 && el.children.length <= 5) {
        result.children = el.children.map((c: Record<string, unknown>) =>
          compressElement(c, depth + 1)
        );
        preserved.push(`${el.children.length} children`);
      } else {
        result.childCount = el.children.length;
        result.childTypes = [...new Set(el.children.map((c: Record<string, unknown>) => c.type))];
        dropped.push(`${el.children.length} child details`);
      }
    }

    // Drop verbose properties
    const dropKeys = [
      "metadata",
      "customData",
      "history",
      "animations",
      "constraints",
    ];
    for (const key of dropKeys) {
      if (el[key] !== undefined) {
        dropped.push(key);
      }
    }

    return result;
  };

  const compressed = elements.map((el) =>
    compressElement(el as Record<string, unknown>, 0)
  );
  const compressedContent = JSON.stringify(compressed, null, 2);
  const compressedTokens = estimateTokens(compressedContent);

  return {
    content: compressedContent,
    originalTokens,
    compressedTokens,
    ratio: compressedTokens / originalTokens,
    preserved,
    dropped: [...new Set(dropped)],
    summary: `Compressed ${elements.length} elements, kept essentials`,
  };
};

// =============================================================================
// Generic Compressor (Fallback)
// =============================================================================

/**
 * Generic compressor for unknown tool outputs.
 * Uses smart truncation with structure preservation.
 */
const genericCompressor: ToolCompressor = (content, options) => {
  const originalTokens = estimateTokens(content);

  if (originalTokens <= options.budget) {
    return {
      content,
      originalTokens,
      compressedTokens: originalTokens,
      ratio: 1,
      preserved: ["full content"],
      dropped: [],
      summary: "No compression needed",
    };
  }

  const compressed = truncateWithMarker(content, options.budget, "content");
  const compressedTokens = estimateTokens(compressed);

  return {
    content: compressed,
    originalTokens,
    compressedTokens,
    ratio: compressedTokens / originalTokens,
    preserved: ["truncated content"],
    dropped: ["middle section"],
    summary: `Truncated to ${options.budget} tokens`,
  };
};

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Truncate content with first/last preservation and marker.
 */
function truncateWithMarker(
  content: string,
  budget: number,
  label: string
): string {
  const lines = content.split("\n");
  const totalTokens = estimateTokens(content);

  if (totalTokens <= budget) {
    return content;
  }

  const avgTokensPerLine = totalTokens / lines.length;
  const keepLines = Math.floor(budget / avgTokensPerLine);

  if (keepLines <= 2) {
    // Very tight budget - just show start
    const chars = budget * 3.5; // Approximate chars per token
    return content.slice(0, chars) + `\n... (${label} truncated)`;
  }

  const firstCount = Math.floor(keepLines * 0.4);
  const lastCount = Math.floor(keepLines * 0.4);
  const omitted = lines.length - firstCount - lastCount;

  return [
    ...lines.slice(0, firstCount),
    `\n... (${omitted} lines omitted from ${label}) ...\n`,
    ...lines.slice(-lastCount),
  ].join("\n");
}

// =============================================================================
// Main API
// =============================================================================

/**
 * Compress a tool result using the appropriate compressor.
 *
 * @example
 * ```typescript
 * const compressed = compressToolResult('Read', fileContent, { budget: 500 });
 * console.log(compressed.content);
 * console.log(`Ratio: ${compressed.ratio}`);
 * ```
 */
export function compressToolResult(
  toolName: string,
  content: string,
  options: ToolCompressorOptions
): ToolCompressorResult {
  const compressor = toolCompressors.get(toolName.toLowerCase()) ?? genericCompressor;
  return compressor(content, options);
}

/**
 * Compress multiple tool results.
 */
export function compressToolResults(
  results: Array<{ toolName: string; content: string }>,
  totalBudget: number
): Array<{ toolName: string; result: ToolCompressorResult }> {
  // Distribute budget proportionally
  const totalTokens = results.reduce(
    (sum, r) => sum + estimateTokens(r.content),
    0
  );

  return results.map(({ toolName, content }) => {
    const contentTokens = estimateTokens(content);
    const budget = Math.floor((contentTokens / totalTokens) * totalBudget);

    return {
      toolName,
      result: compressToolResult(toolName, content, { budget }),
    };
  });
}

/**
 * Get compression recommendation for a tool result.
 */
export function getCompressionRecommendation(
  toolName: string,
  content: string,
  budget: number
): {
  needsCompression: boolean;
  currentTokens: number;
  budgetTokens: number;
  recommendedLevel: "light" | "moderate" | "aggressive";
} {
  const currentTokens = estimateTokens(content);
  const ratio = budget / currentTokens;

  let recommendedLevel: "light" | "moderate" | "aggressive";
  if (ratio >= 0.7) {
    recommendedLevel = "light";
  } else if (ratio >= 0.4) {
    recommendedLevel = "moderate";
  } else {
    recommendedLevel = "aggressive";
  }

  return {
    needsCompression: currentTokens > budget,
    currentTokens,
    budgetTokens: budget,
    recommendedLevel,
  };
}

// =============================================================================
// Register Default Compressors
// =============================================================================

// File operations
registerToolCompressor("Read", readCompressor);
registerToolCompressor("read", readCompressor);

// Search operations
registerToolCompressor("Grep", grepCompressor);
registerToolCompressor("grep", grepCompressor);

// Shell operations
registerToolCompressor("Bash", bashCompressor);
registerToolCompressor("bash", bashCompressor);

// File listing
registerToolCompressor("Glob", globCompressor);
registerToolCompressor("glob", globCompressor);

// Canvas operations
registerToolCompressor("canvas_read", canvasReadCompressor);
registerToolCompressor("canvasRead", canvasReadCompressor);

// Export generic for custom tools
export { genericCompressor };
