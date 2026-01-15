/**
 * SDK Message Types
 *
 * Claude Agent SDK-compatible message types for streaming responses.
 * These types align with the official SDK while adding canvas-specific extensions.
 *
 * @see https://platform.claude.com/docs/en/agent-sdk/typescript
 */

// ============================================================================
// BASE MESSAGE TYPE
// ============================================================================

/**
 * SDK message types
 */
export type SDKMessageType =
  | "assistant"
  | "user"
  | "result"
  | "system"
  | "partial"
  | "permission_denial";

/**
 * Base SDK message interface
 */
export interface SDKMessage {
  type: SDKMessageType;
  sessionId?: string;
  timestamp: number;
}

// ============================================================================
// CONTENT BLOCKS
// ============================================================================

/**
 * Text content block
 */
export interface TextBlock {
  type: "text";
  text: string;
}

/**
 * Tool use content block
 */
export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
}

/**
 * Tool result content block
 */
export interface ToolResultBlock {
  type: "tool_result";
  toolUseId: string;
  content: unknown;
  isError?: boolean;
}

/**
 * Thinking content block (extended thinking)
 */
export interface ThinkingBlock {
  type: "thinking";
  thinking: string;
}

/**
 * All content block types
 */
export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock | ThinkingBlock;

// ============================================================================
// SDK MESSAGE TYPES
// ============================================================================

/**
 * Assistant message - Model responses with UUIDs and session tracking
 */
export interface SDKAssistantMessage extends SDKMessage {
  type: "assistant";
  /** Unique identifier for this message (for replay/resume) */
  uuid: string;
  /** Content blocks in the message */
  content: ContentBlock[];
  /** Tool use blocks (extracted for convenience) */
  toolUse?: ToolUseBlock[];
  /** Model that generated this response */
  model?: string;
  /** Stop reason */
  stopReason?: "end_turn" | "tool_use" | "max_tokens" | "stop_sequence";
}

/**
 * User message - User inputs, optionally with UUIDs for replay
 */
export interface SDKUserMessage extends SDKMessage {
  type: "user";
  /** Optional UUID for replay */
  uuid?: string;
  /** User message content */
  content: string;
}

/**
 * Result message - Final results with token usage and costs
 */
export interface SDKResultMessage extends SDKMessage {
  type: "result";
  /** Whether the agent completed successfully */
  success: boolean;
  /** Summary of what was accomplished */
  summary?: string;
  /** Token usage and cost information */
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    totalCost?: number;
  };
  /** Structured output (if outputFormat was specified) */
  structuredOutput?: unknown;
  /** Error message if failed */
  error?: string;
  /** Duration in milliseconds */
  durationMs: number;
  /** Number of turns/iterations */
  turns: number;
  /** Tool calls made */
  toolCalls: number;
}

/**
 * System message - Initialization data including tools and models
 */
export interface SDKSystemMessage extends SDKMessage {
  type: "system";
  /** Available tools */
  tools: string[];
  /** Model being used */
  model: string;
  /** Session identifier */
  sessionId: string;
  /** Working directory */
  cwd?: string;
  /** Available agents for delegation */
  agents?: string[];
}

/**
 * Partial event types for streaming
 */
export type PartialEventType =
  | "text_delta"
  | "text_start"
  | "text_end"
  | "tool_use_start"
  | "tool_use_delta"
  | "tool_use_end"
  | "tool_result"
  | "thinking_start"
  | "thinking_delta"
  | "thinking_end"
  | "content_block_start"
  | "content_block_end";

/**
 * Partial assistant message - Streaming events
 */
export interface SDKPartialMessage extends SDKMessage {
  type: "partial";
  /** Type of partial event */
  eventType: PartialEventType;
  /** Text delta (for text_delta events) */
  delta?: string;
  /** Tool name (for tool_use events) */
  toolName?: string;
  /** Tool input (for tool_use events) */
  toolInput?: unknown;
  /** Tool result (for tool_result events) */
  toolResult?: unknown;
  /** Thinking content (for thinking events) */
  thinking?: string;
  /** Content block index */
  index?: number;
}

/**
 * Permission denial message - Rejected tool attempts with details
 */
export interface SDKPermissionDenialMessage extends SDKMessage {
  type: "permission_denial";
  /** Tool that was denied */
  tool: string;
  /** Input that was attempted */
  input: unknown;
  /** Reason for denial */
  reason: string;
  /** Whether the user can approve */
  canApprove?: boolean;
}

// ============================================================================
// UNION TYPE
// ============================================================================

/**
 * All SDK message types
 */
export type SDKMessageUnion =
  | SDKAssistantMessage
  | SDKUserMessage
  | SDKResultMessage
  | SDKSystemMessage
  | SDKPartialMessage
  | SDKPermissionDenialMessage;

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Check if message is an assistant message
 */
export function isAssistantMessage(msg: SDKMessage): msg is SDKAssistantMessage {
  return msg.type === "assistant";
}

/**
 * Check if message is a user message
 */
export function isUserMessage(msg: SDKMessage): msg is SDKUserMessage {
  return msg.type === "user";
}

/**
 * Check if message is a result message
 */
export function isResultMessage(msg: SDKMessage): msg is SDKResultMessage {
  return msg.type === "result";
}

/**
 * Check if message is a system message
 */
export function isSystemMessage(msg: SDKMessage): msg is SDKSystemMessage {
  return msg.type === "system";
}

/**
 * Check if message is a partial message
 */
export function isPartialMessage(msg: SDKMessage): msg is SDKPartialMessage {
  return msg.type === "partial";
}

/**
 * Check if message is a permission denial
 */
export function isPermissionDenial(msg: SDKMessage): msg is SDKPermissionDenialMessage {
  return msg.type === "permission_denial";
}

// ============================================================================
// CONTENT EXTRACTION HELPERS
// ============================================================================

/**
 * Extract text content from a message
 */
export function extractText(msg: SDKAssistantMessage): string {
  return msg.content
    .filter((block): block is TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
}

/**
 * Extract tool use blocks from a message
 */
export function extractToolUse(msg: SDKAssistantMessage): ToolUseBlock[] {
  return msg.content.filter((block): block is ToolUseBlock => block.type === "tool_use");
}

/**
 * Extract thinking from a message
 */
export function extractThinking(msg: SDKAssistantMessage): string | undefined {
  const thinkingBlock = msg.content.find(
    (block): block is ThinkingBlock => block.type === "thinking"
  );
  return thinkingBlock?.thinking;
}

// ============================================================================
// ADAPTER: AgentEvent → SDKMessage
// ============================================================================

// Import from types/index.ts which is what orchestrate() returns
import type { AgentEvent } from "../types/index.js";

/**
 * Convert internal AgentEvent to SDK-compatible message
 *
 * This adapter allows existing code using AgentEvent to interoperate
 * with the new SDK message format.
 *
 * AgentEvent types mapped to SDK messages (types/index.ts event names):
 * - thinking → partial (thinking_delta)
 * - context → partial (content_block_start)
 * - plan → partial (thinking_delta)
 * - step_start → partial (content_block_start)
 * - step_complete → partial (content_block_end)
 * - tool_call → partial (tool_use_start)
 * - tool_result → partial (tool_result)
 * - complete → result (success: true)
 * - failed/error → result (success: false)
 */
export function agentEventToSDKMessage(
  event: AgentEvent,
  sessionId?: string
): SDKMessageUnion {
  const timestamp = Date.now();

  switch (event.type) {
    case "thinking":
      return {
        type: "partial",
        eventType: "thinking_delta",
        thinking: "message" in event ? String(event.message) : undefined,
        sessionId,
        timestamp,
      };

    case "context":
      return {
        type: "partial",
        eventType: "content_block_start",
        sessionId,
        timestamp,
      };

    case "reasoning":
      return {
        type: "partial",
        eventType: "thinking_delta",
        thinking: "content" in event ? String(event.content) : undefined,
        sessionId,
        timestamp,
      };

    case "plan":
      return {
        type: "partial",
        eventType: "thinking_delta",
        thinking: "steps" in event ? JSON.stringify(event.steps) : undefined,
        sessionId,
        timestamp,
      };

    case "step_start":
      return {
        type: "partial",
        eventType: "content_block_start",
        index: "iteration" in event && typeof event.iteration === "number" ? event.iteration : undefined,
        sessionId,
        timestamp,
      };

    case "step_complete":
      return {
        type: "partial",
        eventType: "content_block_end",
        index: "iteration" in event && typeof event.iteration === "number" ? event.iteration : undefined,
        sessionId,
        timestamp,
      };

    // "tool_call" is the tool execution event in types/index.ts AgentEvent
    case "tool_call":
      return {
        type: "partial",
        eventType: "tool_use_start",
        toolName: event.tool ? String(event.tool) : undefined,
        toolInput: event.input,
        sessionId,
        timestamp,
      };

    // "acting" is the tool execution event in agents/types.ts AgentEvent
    // (same semantics as "tool_call" but different naming convention)
    case "acting":
      return {
        type: "partial",
        eventType: "tool_use_start",
        toolName: event.tool ? String(event.tool) : undefined,
        toolInput: event.input,
        sessionId,
        timestamp,
      };

    // "tool_result" is the tool result event in types/index.ts AgentEvent
    case "tool_result":
      return {
        type: "partial",
        eventType: "tool_result",
        toolResult: event.result,
        sessionId,
        timestamp,
      };

    // "observing" is the tool result event in agents/types.ts AgentEvent
    // (same semantics as "tool_result" but different naming convention)
    case "observing":
      return {
        type: "partial",
        eventType: "tool_result",
        toolResult: event.result,
        sessionId,
        timestamp,
      };

    case "complete":
      return {
        type: "result",
        success: true,
        summary: "summary" in event ? String(event.summary) : undefined,
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
        },
        durationMs: "totalDuration" in event ? Number(event.totalDuration) || 0 : 0,
        turns: "iteration" in event ? Number(event.iteration) || 1 : 1,
        toolCalls: "elementsAffected" in event ? Number(event.elementsAffected) || 0 : 0,
        sessionId,
        timestamp,
      };

    case "error":
      return {
        type: "result",
        success: false,
        error: event.error ? String(event.error) : "Unknown error",
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
        },
        durationMs: 0,
        turns: 0,
        toolCalls: 0,
        sessionId,
        timestamp,
      };

    case "failed":
      return {
        type: "result",
        success: false,
        error: event.message || "Unknown error",
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
        },
        durationMs: 0,
        turns: 0,
        toolCalls: 0,
        sessionId,
        timestamp,
      };

    case "blocked":
      return {
        type: "permission_denial",
        tool: event.tool ? String(event.tool) : "unknown",
        input: {},
        reason: event.message || "Operation blocked",
        sessionId,
        timestamp,
      };

    case "clarification_needed":
      return {
        type: "partial",
        eventType: "content_block_start",
        sessionId,
        timestamp,
      };

    default:
      // Unknown event type, return as partial
      return {
        type: "partial",
        eventType: "content_block_start",
        sessionId,
        timestamp,
      };
  }
}

/**
 * Convert SDK message to AgentEvent (reverse adapter)
 *
 * Note: AgentEvent from types/index.ts uses:
 * - tool_call / tool_result (not acting/observing)
 * - error as string (not object)
 * - No timestamp property
 */
export function sdkMessageToAgentEvent(msg: SDKMessageUnion): AgentEvent {
  switch (msg.type) {
    case "partial":
      if (msg.eventType === "thinking_delta") {
        return {
          type: "thinking",
          message: msg.thinking,
        };
      }
      if (msg.eventType === "tool_use_start") {
        return {
          type: "tool_call",
          tool: msg.toolName as AgentEvent["tool"],
          input: msg.toolInput,
        };
      }
      if (msg.eventType === "tool_result") {
        return {
          type: "tool_result",
          result: msg.toolResult,
        };
      }
      return {
        type: "context",
        message: "",
        tokensUsed: 0,
      };

    case "result":
      if (msg.success) {
        return {
          type: "complete",
          summary: msg.summary || "",
          duration: msg.durationMs,
        };
      }
      return {
        type: "failed",
        message: msg.error || "Unknown error",
        error: msg.error || "Unknown error",
      };

    case "permission_denial":
      return {
        type: "error",
        error: `Permission denied for ${msg.tool}: ${msg.reason}`,
      };

    default:
      return {
        type: "context",
        message: "",
        tokensUsed: 0,
      };
  }
}
