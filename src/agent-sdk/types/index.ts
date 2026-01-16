/**
 * Type definitions for AI agents using Claude Code patterns
 *
 * Generic agent framework types - domain agnostic.
 */

import { z } from "zod";
import type { GenericAgentType } from "../agents/generic-definitions.js";
import type { AgentToolName } from "../tools/generic-definitions.js";

// ============================================================================
// AGENT TYPES
// ============================================================================

/**
 * Agent type enumeration - maps to Claude Code subagent_type
 *
 * Capability-based agents (WHAT they do):
 * - generic-agent: General purpose agent
 * - planner-agent: Plans complex tasks, breaks down work
 * - executor-agent: Executes tasks through action adapters
 * - analyzer-agent: Analyzes data and provides insights
 * - explorer-agent: Explores and discovers context
 */
export const AgentType = z.enum([
  "generic-agent",
  "planner-agent",
  "executor-agent",
  "analyzer-agent",
  "explorer-agent",
]);

export type AgentType = z.infer<typeof AgentType>;

/**
 * Model provider - which LLM provider to use
 * Supports Google Gemini and OpenAI
 */
export const ModelProvider = z.enum(["google", "openai"]);
export type ModelProvider = z.infer<typeof ModelProvider>;

/**
 * Model preference for agents - tier-based selection
 * - fast: Optimized for speed and cost (e.g., Gemini Flash, GPT-4o-mini)
 * - balanced: Good balance of speed and capability (e.g., Gemini Flash, GPT-4o)
 * - powerful: Most capable model (e.g., Gemini Pro, GPT-4o)
 */
export const ModelPreference = z.enum(["fast", "balanced", "powerful"]);
export type ModelPreference = z.infer<typeof ModelPreference>;

// ============================================================================
// AGENT DEFINITION
// ============================================================================

/**
 * Agent capabilities - controls what the agent can do
 * Following Claude Code's config-driven approach
 */
export interface AgentCapabilities {
  /** Can write to context */
  canWrite?: boolean;
  /** Can execute tasks through adapters */
  canExecute?: boolean;
  /** Can only read/analyze (no modifications) */
  readOnly?: boolean;
  /** Can delegate to sub-agents */
  canDelegate?: boolean;
  /** Can ask user for clarification */
  canClarify?: boolean;
  /** Can track multi-step progress */
  canPlan?: boolean;
}

/**
 * Agent prompt options - controls which constraints/behaviors to include
 */
export interface AgentPromptOptions {
  /** Include security constraints */
  includeSecurity?: boolean;
  /** Include behavioral guidelines (anti-over-engineering, etc.) */
  includeBehavioral?: boolean;
  /** Additional constraints to include */
  constraints?: ("read-only" | "planning-only" | "security" | "behavioral")[];
  /** Tool documentation to include in prompt */
  includeToolDocs?: AgentToolName[];
}

/**
 * Agent definition schema
 */
export interface AgentDefinition {
  /** Unique identifier (maps to subagent_type) */
  id: AgentType;
  /** Display name */
  name: string;
  /** Brief description for Task tool */
  description: string;
  /** System prompt for the agent */
  systemPrompt: string;
  /** Tools this agent can use */
  allowedTools: AgentToolName[];
  /** Keywords that trigger this agent */
  triggers: {
    keywords: string[];
    patterns?: RegExp[];
  };
  /** Preferred model */
  model?: ModelPreference;
  /** Max tokens for response */
  maxTokens?: number;
  /** Agent capabilities - what it can do */
  capabilities?: AgentCapabilities;
  /** Prompt composition options */
  promptOptions?: AgentPromptOptions;
}

// ============================================================================
// GENERIC TOOLS
// ============================================================================

/**
 * Generic agent tools
 */
export const AgentTool = z.enum([
  "context_read",
  "context_write",
  "context_search",
  "task_execute",
  "state_snapshot",
  "agent_delegate",
  "agent_plan",
  "agent_clarify",
]);

export type AgentTool = z.infer<typeof AgentTool>;

/**
 * Tool definition for generic agents
 */
export interface ToolDefinition {
  /** Tool name */
  name: AgentTool;
  /** Description */
  description: string;
  /** Category */
  category: "read" | "write" | "search" | "meta";
  /** Example usage */
  examples: string[];
}

// ============================================================================
// RESOURCES (Stateless Pattern)
// ============================================================================

/**
 * Resolved alias information
 */
export interface ResolvedAliasContext {
  /** Original task with aliases */
  originalTask: string;
  /** Task with aliases replaced by summaries */
  resolvedTask: string;
  /** Task with aliases replaced by full context */
  contextTask: string;
  /** Aliases found in the task */
  aliases: string[];
  /** Total tokens used for alias resolution */
  tokenCost: number;
}

/**
 * Agent resources - all state lives here (Pattern 4: Stateless Systems)
 */
export interface AgentResources {
  /** Session state */
  session: {
    id: string;
    startTime: number;
  };

  /** Task state */
  task: {
    id: string;
    status: TaskStatus;
    currentStep: number;
    checkpoint: Checkpoint | null;
  };

  /** Context budget */
  context: {
    tokenBudget: number;
    tokensUsed: number;
    strategies: ContextStrategy[];
  };

  /** Resolved alias context (populated if task contains @aliases) */
  aliasContext: ResolvedAliasContext | null;

  /** Operation history */
  history: OperationRecord[];

  /** Accumulated errors */
  errors: ErrorRecord[];
}

export type TaskStatus = "pending" | "running" | "paused" | "completed" | "failed";

export type ContextStrategy = "lazy-load" | "semantic-chunk" | "compression";

export interface Checkpoint {
  resources: AgentResources;
  timestamp: number;
  description: string;
}

export interface OperationRecord {
  tool: AgentTool;
  input: unknown;
  result: unknown;
  timestamp: number;
  duration: number;
}

export interface ErrorRecord {
  type: "transient" | "validation" | "conflict" | "not_found" | "unknown";
  message: string;
  tool?: AgentTool;
  timestamp: number;
  recoverable: boolean;
}

// ============================================================================
// STREAMING EVENTS (Pattern 2: Streaming-First)
// ============================================================================

/**
 * Agent event types for streaming
 */
export type AgentEventType =
  | "thinking"
  | "context"
  | "alias_resolving"
  | "alias_resolved"
  | "plan"
  | "step_start"
  | "step_complete"
  | "tool_call"
  | "tool_result"
  | "reasoning"
  | "error"
  | "warning"
  | "blocked"
  | "acting"
  | "observing"
  | "complete"
  | "failed"
  | "cancelled"
  | "timeout"
  | "clarification_needed"
  | "recovery"
  | "checkpoint"
  | "delegating"
  | "delegation_complete"
  | "task_update"
  | "context_injected"
  | "correction";

/**
 * Agent event - yielded by async generator
 */
export interface AgentEvent {
  type: AgentEventType;
  iteration?: number;
  message?: string;
  tool?: AgentTool;
  input?: unknown;
  result?: unknown;
  error?: string;
  summary?: string;
  steps?: string[];
  step?: string;
  duration?: number;
  tokensUsed?: number;
  resources?: Partial<AgentResources>;

  // Alias resolution event properties
  /** Aliases found in task (alias_resolving event) */
  aliases?: string[];
  /** Number of aliases resolved */
  aliasCount?: number;
  /** Task with aliases resolved to summaries */
  resolvedTask?: string;
  /** Resolution statistics (alias_resolved event) */
  stats?: {
    total: number;
    resolved: number;
    failed: number;
    skipped: number;
    fallback: number;
    totalTokens: number;
    duration: number;
  };
  /** Warnings from alias resolution */
  warnings?: string[];
  /** Whether all aliases resolved successfully */
  allResolved?: boolean;

  // Clarification event properties (human-in-the-loop)
  /** Unique ID for this clarification request */
  clarificationId?: string;
  /** Questions to ask the user */
  questions?: string[];
  /** Multiple choice options (if applicable) */
  options?: Array<{ label: string; description?: string; value: string }>;
  /** Reason clarification is needed */
  reason?: string;
  /** Context about what we know so far */
  context?: Record<string, unknown>;
}

// ============================================================================
// HOOKS (Pattern 5: Pre/Post Hooks)
// ============================================================================

/**
 * Hook types for agent events
 */
export const HookType = z.enum([
  "pre-tool-use",
  "post-tool-use",
  "pre-step",
  "post-step",
  "context-change",
  "error",
  "checkpoint",
  "session-start",
  "session-end",
]);

export type HookType = z.infer<typeof HookType>;

/**
 * Hook context passed to handlers
 */
export interface HookContext {
  hookType: HookType;
  tool?: AgentTool;
  toolInput?: unknown;
  toolResult?: unknown;
  step?: string;
  stepIndex?: number;
  sessionId?: string;
  timestamp: number;
  duration?: number;
  resources?: AgentResources;
  metadata?: Record<string, unknown>;
}

/**
 * Hook result - can block operations
 */
export interface HookResult {
  proceed: boolean;
  blocked?: boolean;
  reason?: string;
  message?: string;
  modifiedInput?: unknown;
}

/**
 * Hook handler function
 */
export type HookHandler = (context: HookContext) => Promise<HookResult | void> | HookResult | void;

// ============================================================================
// SKILLS (Pattern 6: Skills as Compressed Context)
// ============================================================================

/**
 * Skill definition - expert knowledge module
 */
export interface SkillDefinition {
  /** Skill name */
  name: string;
  /** Trigger keywords */
  triggers: string[];
  /** Skill content (compressed expert knowledge) */
  content: string;
  /** Description for Claude Code */
  description: string;
  /** Related agents */
  relatedAgents?: AgentType[];
}

// ============================================================================
// SUB-AGENT DELEGATION (Pattern 7)
// ============================================================================

/**
 * Sub-agent request
 */
export interface SubAgentRequest {
  agentType: AgentType;
  task: string;
  context?: string;
  maxTokens?: number;
}

/**
 * Sub-agent result
 */
export interface SubAgentResult {
  success: boolean;
  output: string;
  operations?: OperationRecord[];
  error?: string;
  tokensUsed: number;
}

// ============================================================================
// COMMAND DEFINITION
// ============================================================================

/**
 * Command template for slash commands
 */
export interface CommandDefinition {
  /** Command name (without /) */
  name: string;
  /** Category for organization */
  category?: string;
  /** Description shown in /help */
  description: string;
  /** Argument hint (e.g., "<element-type>") */
  argumentHint?: string;
  /** Tools the command uses */
  allowedTools: AgentTool[];
  /** Command body/prompt template */
  body: string;
}

// ============================================================================
// CHAT TYPES (for backward compatibility)
// ============================================================================

/**
 * Chat message schema
 */
export const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
  id: z.string().optional(),
  createdAt: z.date().optional(),
});

export type ChatMessage = z.infer<typeof chatMessageSchema>;

/**
 * Chat request schema
 */
export const chatRequestSchema = z.object({
  messages: z.array(chatMessageSchema),
  modelConfig: z
    .object({
      provider: ModelProvider.optional(),
      model: ModelPreference.optional(),
      temperature: z.number().optional(),
      maxTokens: z.number().optional(),
    })
    .optional(),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

/**
 * Handler configuration
 */
export interface ChatHandlerConfig {
  /** System prompt for chat */
  systemPrompt?: string;
  /** Default model configuration */
  defaultModelConfig?: {
    provider: ModelProvider;
    model: ModelPreference;
    temperature?: number;
    maxTokens?: number;
  };
}

// ============================================================================
// LEGACY TYPE ALIASES (for backward compatibility)
// ============================================================================

/**
 * @deprecated Use AgentTool instead
 */
export type CanvasTool = AgentTool;
