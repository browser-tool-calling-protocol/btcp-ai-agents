/**
 * SDK Options and Configuration
 *
 * Unified configuration types compatible with Claude Agent SDK.
 *
 * @see https://platform.claude.com/docs/en/agent-sdk/typescript
 */

import type { HookConfig } from "./hooks.js";
import type { AgentsOption } from "./agents.js";
import type { ToolsOption, CanUseToolHandler } from "./tools.js";
import type { z } from "zod";

// ============================================================================
// MODEL CONFIGURATION
// ============================================================================

/**
 * Model identifiers
 */
export type ModelId =
  | "claude-sonnet-4-5-20250929"
  | "claude-opus-4-5-20250929"
  | "claude-3-5-sonnet-20241022"
  | "claude-3-5-haiku-20241022"
  | "gpt-4o-2024-11-20"
  | "gpt-4o-mini"
  | "gpt-4-turbo"
  | "gemini-2.5-pro"
  | "gemini-2.5-flash"
  | "gemini-2.5-flash-lite"
  | string;

/**
 * Model preference tiers
 */
export type ModelTier = "fast" | "balanced" | "powerful";

/**
 * Model configuration by tier
 */
export const MODEL_TIERS: Record<ModelTier, { primary: ModelId; fallback: ModelId }> = {
  fast: {
    primary: "gemini-2.5-flash-lite",
    fallback: "gpt-4o-mini",
  },
  balanced: {
    primary: "gemini-2.5-flash",
    fallback: "gpt-4o-2024-11-20",
  },
  powerful: {
    primary: "gemini-2.5-pro",
    fallback: "claude-sonnet-4-5-20250929",
  },
};

// ============================================================================
// SANDBOX CONFIGURATION
// ============================================================================

/**
 * Network configuration for sandbox
 */
export interface NetworkConfig {
  /** Allow binding to local addresses */
  allowLocalBind?: boolean;
  /** Allow Unix socket connections */
  allowUnixSockets?: boolean;
  /** Allowed domains for network access */
  allowedDomains?: string[];
  /** Proxy configuration */
  proxy?: string;
}

/**
 * Sandbox configuration for command execution
 */
export interface SandboxConfig {
  /** Enable sandbox isolation */
  enabled?: boolean;
  /** Auto-allow bash if sandboxed */
  autoAllowBashIfSandboxed?: boolean;
  /** Commands excluded from sandbox */
  excludedCommands?: string[];
  /** Network restrictions */
  network?: NetworkConfig;
}

// ============================================================================
// MCP SERVER CONFIGURATION
// ============================================================================

/**
 * MCP server connection configuration
 */
export interface McpServerConfig {
  /** Server name/identifier */
  name: string;
  /** Connection URL (http/ws) */
  url?: string;
  /** Stdio command (alternative to URL) */
  command?: string;
  /** Command arguments */
  args?: string[];
  /** Environment variables */
  env?: Record<string, string>;
  /** Connection timeout in ms */
  timeout?: number;
}

// ============================================================================
// OUTPUT FORMAT
// ============================================================================

/**
 * Structured output format using JSON Schema
 */
export interface OutputFormatSchema {
  /** Schema type (always "json_schema") */
  type: "json_schema";
  /** JSON Schema definition */
  schema: Record<string, unknown>;
  /** Whether schema is strict */
  strict?: boolean;
}

/**
 * Output format using Zod schema
 */
export interface OutputFormatZod<T extends z.ZodType> {
  /** Schema type */
  type: "zod";
  /** Zod schema */
  schema: T;
}

/**
 * Output format options
 */
export type OutputFormat = OutputFormatSchema | OutputFormatZod<z.ZodType>;

// ============================================================================
// SETTING SOURCES
// ============================================================================

/**
 * Setting source locations
 */
export type SettingSource = "user" | "project" | "local";

// ============================================================================
// SDK OPTIONS
// ============================================================================

/**
 * Claude Agent SDK-compatible options
 */
export interface SDKOptions {
  // -------------------------------------------------------------------------
  // Model & Performance
  // -------------------------------------------------------------------------

  /** Primary model to use */
  model?: ModelId;
  /** Fallback model if primary fails */
  fallbackModel?: ModelId;
  /** Model tier shorthand (fast/balanced/powerful) */
  modelTier?: ModelTier;
  /** Maximum thinking tokens for extended thinking */
  maxThinkingTokens?: number;
  /** Maximum budget in USD (stops execution if exceeded) */
  maxBudgetUsd?: number;
  /** Maximum turns/iterations */
  maxTurns?: number;

  // -------------------------------------------------------------------------
  // Execution Control
  // -------------------------------------------------------------------------

  /** Working directory for commands */
  cwd?: string;
  /** Permission mode: auto (allow all), manual (ask user) */
  permissionMode?: "auto" | "manual";
  /** Sandbox configuration */
  sandbox?: SandboxConfig;
  /** Abort signal for cancellation */
  abortSignal?: AbortSignal;

  // -------------------------------------------------------------------------
  // Tool Management
  // -------------------------------------------------------------------------

  /** Tools configuration */
  tools?: ToolsOption;
  /** Custom tool permission handler */
  canUseTool?: CanUseToolHandler;
  /** Tools that are explicitly disallowed */
  disallowedTools?: string[];

  // -------------------------------------------------------------------------
  // Sessions
  // -------------------------------------------------------------------------

  /** Continue from last session */
  continue?: boolean;
  /** Resume specific session by ID */
  resume?: string;
  /** Resume at specific message UUID */
  resumeSessionAt?: string;
  /** Fork session instead of continuing */
  forkSession?: boolean;
  /** Enable file checkpointing for rewinding */
  enableFileCheckpointing?: boolean;

  // -------------------------------------------------------------------------
  // MCP Integration
  // -------------------------------------------------------------------------

  /** MCP server configurations */
  mcpServers?: McpServerConfig[];

  // -------------------------------------------------------------------------
  // Hooks
  // -------------------------------------------------------------------------

  /** Hook configurations */
  hooks?: HookConfig[];

  // -------------------------------------------------------------------------
  // Settings
  // -------------------------------------------------------------------------

  /** Setting sources to load (user, project, local) */
  settingSources?: SettingSource[];

  // -------------------------------------------------------------------------
  // Agents
  // -------------------------------------------------------------------------

  /** Agent definitions for Task delegation */
  agents?: AgentsOption;

  // -------------------------------------------------------------------------
  // Output
  // -------------------------------------------------------------------------

  /** System prompt override */
  systemPrompt?: string;
  /** Structured output format */
  outputFormat?: OutputFormat;
  /** Include partial messages in stream */
  includePartialMessages?: boolean;
}

// ============================================================================
// CANVAS-SPECIFIC OPTIONS
// ============================================================================

/**
 * Canvas agent options extending SDK options
 */
export interface CanvasAgentOptions extends SDKOptions {
  // -------------------------------------------------------------------------
  // Canvas-Specific (Required)
  // -------------------------------------------------------------------------

  /** Canvas ID to operate on */
  canvasId: string;

  // -------------------------------------------------------------------------
  // Canvas-Specific (Optional)
  // -------------------------------------------------------------------------

  /** Canvas MCP server URL (default: http://localhost:3112) */
  mcpUrl?: string;
  /** AI provider preference */
  provider?: "google" | "openai" | "anthropic";
  /** Enable verbose logging */
  verbose?: boolean;
  /** Token budget for context management */
  tokenBudget?: number;
}

// ============================================================================
// LEGACY OPTIONS (for migration)
// ============================================================================

/**
 * Legacy agent configuration (deprecated)
 * @deprecated Use CanvasAgentOptions instead
 */
export interface LegacyAgentConfig {
  canvasId?: string;
  model?: "sonnet" | "opus" | "haiku" | "gpt-4o" | string;
  provider?: "google" | "openai";
  mcpUrl?: string;
  systemPrompt?: string;
  maxIterations?: number;
  tokenBudget?: number;
  enabledTools?: string[];
  verbose?: boolean;
  hooks?: unknown;
}

/**
 * Migrate legacy options to SDK-compatible format
 */
export function migrateFromLegacyOptions(legacy: LegacyAgentConfig): CanvasAgentOptions {
  // Map legacy model names to SDK model IDs
  const modelMapping: Record<string, ModelId> = {
    sonnet: "claude-3-5-sonnet-20241022",
    opus: "claude-opus-4-5-20250929",
    haiku: "claude-3-5-haiku-20241022",
    "gpt-4o": "gpt-4o-2024-11-20",
  };

  return {
    canvasId: legacy.canvasId || "",
    model: legacy.model ? modelMapping[legacy.model] || legacy.model : undefined,
    provider: legacy.provider,
    mcpUrl: legacy.mcpUrl,
    systemPrompt: legacy.systemPrompt,
    maxTurns: legacy.maxIterations,
    tokenBudget: legacy.tokenBudget,
    tools: legacy.enabledTools,
    verbose: legacy.verbose,
  };
}

// ============================================================================
// DEFAULTS
// ============================================================================

/**
 * Default SDK options
 */
export const DEFAULT_SDK_OPTIONS: Partial<SDKOptions> = {
  modelTier: "balanced",
  maxTurns: 20,
  maxThinkingTokens: 5000,
  permissionMode: "auto",
  includePartialMessages: true,
};

/**
 * Default canvas agent options
 */
export const DEFAULT_CANVAS_OPTIONS: Partial<CanvasAgentOptions> = {
  ...DEFAULT_SDK_OPTIONS,
  mcpUrl: "http://localhost:3112",
  provider: "google",
  tokenBudget: 100_000,
  verbose: false,
};

/**
 * Merge options with defaults
 */
export function mergeWithDefaults(options: Partial<CanvasAgentOptions>): CanvasAgentOptions {
  const merged = {
    ...DEFAULT_CANVAS_OPTIONS,
    ...options,
  };

  // Resolve model from tier if not specified
  if (!merged.model && merged.modelTier) {
    merged.model = MODEL_TIERS[merged.modelTier].primary;
    merged.fallbackModel = MODEL_TIERS[merged.modelTier].fallback;
  }

  return merged as CanvasAgentOptions;
}
