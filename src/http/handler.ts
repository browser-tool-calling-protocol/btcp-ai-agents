/**
 * Chat HTTP Endpoint - Claude Code Patterns Integration
 *
 * Express-compatible HTTP handler for canvas agent chat.
 * Uses the new patterns-based architecture for streaming responses.
 *
 * Streams responses in AI SDK Data Stream Protocol format for compatibility
 * with @ai-sdk/react's useChat hook.
 *
 * @see https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol
 */

import type { Request, Response } from "express";
import { z } from "zod";
import { createSession, type Session } from "../core/session.js";
import type {
  SDKMessage,
  SDKResultMessage,
  SDKPartialMessage,
  SDKSystemMessage,
  SDKAssistantMessage,
  SDKPermissionDenialMessage,
} from "../core/messages.js";
import type { AgentMode } from "../agents/types.js";
import type { AgentEvent } from "../types/index.js";
import type { SDKMessageUnion } from "../core/messages.js";
import { getSystemPrompt } from "../agents/prompts.js";
import { detectAgentMode } from "../agents/mode-detection.js";
import { getSkillRegistry } from "../skills/index.js";

// Legacy alias
const getSystemPromptWithXml = getSystemPrompt;

// Helper function for skill injection
function injectRelevantSkills(task: string, systemPrompt: string): string {
  const registry = getSkillRegistry();
  const result = registry.injectSkills(task, systemPrompt);
  return result.injectedPrompt;
}
import { getUserFriendlyMessage } from "../tools/error-codes.js";

// ============================================================================
// AI SDK Stream Protocol Conversion
// ============================================================================

/**
 * Generate a unique ID for stream parts
 */
function generateId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * AI SDK stream part types
 * @see https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol
 */
interface TextStartPart {
  type: "text-start";
  id: string;
}

interface TextDeltaPart {
  type: "text-delta";
  id: string;
  delta: string;
}

interface TextEndPart {
  type: "text-end";
  id: string;
}

interface ErrorPart {
  type: "error";
  errorText: string;
}

interface DataPart {
  type: `data-${string}`;
  data: unknown;
}

type StreamPart = TextStartPart | TextDeltaPart | TextEndPart | ErrorPart | DataPart;

/**
 * Convert AgentEvent to AI SDK stream parts
 *
 * Maps our internal event types to the AI SDK Data Stream Protocol:
 * - thinking, context, plan, step_* → data-<type> parts (custom data)
 * - complete with summary → text-start/delta/end (message content)
 * - error, failed → error part
 */
function convertToAISDKStreamParts(event: AgentEvent, messageId: string): StreamPart[] {
  const parts: StreamPart[] = [];

  switch (event.type) {
    // Progress/status events → custom data parts
    case "thinking":
    case "context":
    case "alias_resolving":
    case "alias_resolved":
    case "plan":
    case "step_start":
    case "step_complete":
    case "tool_call":
    case "tool_result":
    case "reasoning":
    case "warning":
    case "blocked":
      parts.push({
        type: `data-${event.type}` as `data-${string}`,
        data: {
          message: event.message,
          step: event.step,
          steps: event.steps,
          tool: event.tool,
          input: event.input,
          result: event.result,
          duration: event.duration,
          iteration: event.iteration,
          // Context-specific fields
          summary: event.summary,
          tokensUsed: event.tokensUsed,
          // Alias-specific fields
          aliases: event.aliases,
          aliasCount: event.aliasCount,
          resolvedTask: event.resolvedTask,
          stats: event.stats,
          warnings: event.warnings,
          allResolved: event.allResolved,
        },
      });
      break;

    // Completion events → text content (shown as assistant message)
    case "complete":
      if (event.summary || event.message) {
        const text = event.summary || event.message || "Task completed.";
        parts.push({ type: "text-start", id: messageId });
        parts.push({ type: "text-delta", id: messageId, delta: text });
        parts.push({ type: "text-end", id: messageId });

        // Also emit completion data for workflow tracking
        parts.push({
          type: "data-complete",
          data: {
            summary: event.summary,
            message: event.message,
            duration: event.duration,
            tokensUsed: event.tokensUsed,
          },
        });
      }
      break;

    // Error events
    case "error":
    case "failed": {
      // Handle both string errors and object errors (with code/message/recoverable)
      // Extract error code and message for user-friendly conversion
      let errorCode: string | undefined;
      let technicalMessage: string;

      if (typeof event.error === "string") {
        technicalMessage = event.error;
        // Check if the string itself is an error code
        errorCode = event.error;
      } else if (event.error && typeof event.error === "object" && "code" in event.error) {
        const errorObj = event.error as { code: string; message: string };
        errorCode = errorObj.code;
        technicalMessage = errorObj.message;
      } else {
        technicalMessage = event.message || "An error occurred";
      }

      // Convert to user-friendly message
      const userFriendlyMessage = errorCode
        ? getUserFriendlyMessage(errorCode)
        : getUserFriendlyMessage(technicalMessage);

      parts.push({
        type: "error",
        errorText: userFriendlyMessage,
      });
      break;
    }

    // Timeout events
    case "timeout":
      parts.push({
        type: "error",
        errorText: event.message || "Operation timed out",
      });
      break;

    // Cancellation events
    case "cancelled":
      parts.push({
        type: "data-cancelled",
        data: { message: event.message || "Operation was cancelled" },
      });
      break;

    // Clarification events (from canvas_clarify tool)
    case "clarification_needed": {
      // Format questions as text for display
      const questions = event.questions || [];
      const reason = event.reason || "I need some clarification";
      const formattedText = questions.length > 0
        ? `${reason}\n\n${questions.map((q: string, i: number) => `${i + 1}. ${q}`).join("\n")}`
        : reason;

      // Emit as text content (shown as assistant message)
      parts.push({ type: "text-start", id: messageId });
      parts.push({ type: "text-delta", id: messageId, delta: formattedText });
      parts.push({ type: "text-end", id: messageId });

      // Also emit structured data for UI to render input controls
      parts.push({
        type: "data-clarification_needed" as `data-${string}`,
        data: {
          clarificationId: event.clarificationId,
          questions: event.questions,
          options: event.options,
          reason: event.reason,
          context: event.context,
        },
      });
      break;
    }

    default:
      // Unknown events → pass through as data
      parts.push({
        type: "data-unknown",
        data: event,
      });
  }

  return parts;
}

/**
 * Convert SDKMessage to AI SDK stream parts
 *
 * Maps SDK message types to the AI SDK Data Stream Protocol:
 * - system → data-system (custom data)
 * - partial → data-<eventType> or text-delta (for thinking)
 * - result → text-start/delta/end (for summary) or error (for errors)
 * - assistant → text-start/delta/end (for content)
 * - permission_denial → error
 */
function convertSDKMessageToAISDKStreamParts(msg: SDKMessage, messageId: string): StreamPart[] {
  const parts: StreamPart[] = [];

  switch (msg.type) {
    case "system": {
      const systemMsg = msg as SDKSystemMessage;
      parts.push({
        type: "data-system" as `data-${string}`,
        data: {
          tools: systemMsg.tools,
          model: systemMsg.model,
          sessionId: systemMsg.sessionId,
          cwd: systemMsg.cwd,
          agents: systemMsg.agents,
        },
      });
      break;
    }

    case "partial": {
      const partialMsg = msg as SDKPartialMessage;

      switch (partialMsg.eventType) {
        case "thinking_delta":
        case "thinking_start":
        case "thinking_end":
          parts.push({
            type: "data-thinking" as `data-${string}`,
            data: {
              eventType: partialMsg.eventType,
              thinking: partialMsg.thinking,
            },
          });
          break;

        case "tool_use_start":
          parts.push({
            type: "data-tool_call" as `data-${string}`,
            data: {
              tool: partialMsg.toolName,
              input: partialMsg.toolInput,
            },
          });
          break;

        case "tool_result":
          parts.push({
            type: "data-tool_result" as `data-${string}`,
            data: {
              result: partialMsg.toolResult,
            },
          });
          break;

        case "text_delta":
          if (partialMsg.delta) {
            parts.push({
              type: "text-delta",
              id: messageId,
              delta: partialMsg.delta,
            });
          }
          break;

        case "content_block_start":
          parts.push({
            type: "data-step_start" as `data-${string}`,
            data: { index: partialMsg.index },
          });
          break;

        case "content_block_end":
          parts.push({
            type: "data-step_complete" as `data-${string}`,
            data: { index: partialMsg.index },
          });
          break;

        default:
          parts.push({
            type: `data-${partialMsg.eventType}` as `data-${string}`,
            data: {
              delta: partialMsg.delta,
              index: partialMsg.index,
            },
          });
      }
      break;
    }

    case "result": {
      const resultMsg = msg as SDKResultMessage;

      if (resultMsg.success) {
        // Emit completion as text content
        if (resultMsg.summary) {
          parts.push({ type: "text-delta", id: messageId, delta: resultMsg.summary });
          parts.push({ type: "text-end", id: messageId });
        }

        // Also emit completion data for workflow tracking
        parts.push({
          type: "data-complete" as `data-${string}`,
          data: {
            summary: resultMsg.summary,
            duration: resultMsg.durationMs,
            tokensUsed: resultMsg.usage.totalTokens,
            turns: resultMsg.turns,
            toolCalls: resultMsg.toolCalls,
          },
        });
      } else {
        // Convert to user-friendly error message
        const userFriendlyMessage = resultMsg.error
          ? getUserFriendlyMessage(resultMsg.error)
          : "An error occurred";

        parts.push({
          type: "error",
          errorText: userFriendlyMessage,
        });
      }
      break;
    }

    case "assistant": {
      const assistantMsg = msg as SDKAssistantMessage;

      // Extract text content from blocks
      const textContent = assistantMsg.content
        .filter((block): block is { type: "text"; text: string } => block.type === "text")
        .map((block) => block.text)
        .join("");

      if (textContent) {
        parts.push({ type: "text-delta", id: messageId, delta: textContent });
      }

      // Emit tool use blocks as data events
      for (const block of assistantMsg.content) {
        if (block.type === "tool_use") {
          parts.push({
            type: "data-tool_call" as `data-${string}`,
            data: {
              id: block.id,
              tool: block.name,
              input: block.input,
            },
          });
        } else if (block.type === "thinking") {
          parts.push({
            type: "data-thinking" as `data-${string}`,
            data: {
              thinking: block.thinking,
            },
          });
        }
      }
      break;
    }

    case "permission_denial": {
      const denialMsg = msg as SDKPermissionDenialMessage;
      parts.push({
        type: "error",
        errorText: `Permission denied for ${denialMsg.tool}: ${denialMsg.reason}`,
      });
      break;
    }

    default:
      // Unknown message type → pass through as data
      parts.push({
        type: "data-unknown" as `data-${string}`,
        data: msg,
      });
  }

  return parts;
}

/**
 * Run a session synchronously and extract the final result
 *
 * Collects all stream messages and extracts the result message.
 */
async function runSessionSync(
  message: string,
  options: {
    canvasId: string;
    model: "fast" | "balanced" | "powerful";
    systemPrompt?: string;
  }
): Promise<{
  success: boolean;
  summary?: string;
  error?: string;
  duration?: number;
}> {
  const session = await createSession(options);
  const startTime = Date.now();

  try {
    await session.send(message);

    let result: SDKResultMessage | undefined;

    for await (const msg of session.stream()) {
      if (msg.type === "result") {
        result = msg as SDKResultMessage;
      }
    }

    await session.close();

    if (result) {
      return {
        success: result.success,
        summary: result.summary,
        error: result.error,
        duration: result.durationMs || (Date.now() - startTime),
      };
    }

    return {
      success: false,
      error: "No result received from session",
      duration: Date.now() - startTime,
    };
  } catch (error) {
    await session.close();
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime,
    };
  }
}

// ============================================================================
// Request Validation Schemas
// ============================================================================

/**
 * Agent mode schema
 */
const AgentModeSchema = z.enum([
  "general",
  "generation",
  "editing",
  "analysis",
  "layout",
  "styling",
]);

/**
 * Model provider schema - supports Google Gemini and OpenAI
 */
const ModelProviderSchema = z.enum(["google", "openai"]);

/**
 * Model tier schema
 */
const ModelTierSchema = z.enum(["fast", "balanced", "powerful"]);

/**
 * AI SDK message format
 */
const AIMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
  id: z.string().optional(),
});

/**
 * Chat request validation schema - supports both direct prompt and AI SDK messages format
 */
export const ChatRequestSchema = z.object({
  /** The user's prompt/message (direct format) */
  prompt: z.string().optional(),
  /** Messages array (AI SDK format) */
  messages: z.array(AIMessageSchema).optional(),
  /** Canvas ID to bind the agent to */
  canvasId: z.string().optional(),
  /** Model provider (google) - default: google */
  provider: ModelProviderSchema.optional(),
  /** Model tier to use (fast, balanced, powerful) - default: balanced */
  model: ModelTierSchema.optional(),
  /** Custom system prompt (overrides mode) */
  systemPrompt: z.string().optional(),
  /** Explicit agent mode */
  mode: AgentModeSchema.optional(),
  /** Auto-detect mode from prompt (default: true) */
  autoDetectMode: z.boolean().optional(),
  /** Thread ID for conversation memory (AI SDK) */
  threadId: z.string().optional(),
  /** Resource ID for context isolation (AI SDK) */
  resourceId: z.string().optional(),
  /** Session ID (AI SDK) */
  sessionId: z.string().optional(),
  /** Canvas context data (AI SDK) */
  canvasContext: z.unknown().optional(),
}).refine(
  (data) => data.prompt || (data.messages && data.messages.length > 0),
  { message: "Either 'prompt' or 'messages' array with user messages is required" }
);

/**
 * Command request validation schema
 */
export const CommandRequestSchema = z.object({
  /** The command description */
  description: z.string().min(1, "Description is required"),
  /** Canvas ID to bind the agent to */
  canvasId: z.string().optional(),
  /** Model provider (google) - default: google */
  provider: ModelProviderSchema.optional(),
  /** Model tier to use (fast, balanced, powerful) - default: balanced */
  model: ModelTierSchema.optional(),
  /** Explicit agent mode */
  mode: AgentModeSchema.optional(),
});

/**
 * Chat request body (inferred from schema)
 */
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

/**
 * Command request body (inferred from schema)
 */
export type CommandRequest = z.infer<typeof CommandRequestSchema>;

/**
 * Validation error response
 */
interface ValidationError {
  error: string;
  issues: z.ZodIssue[];
}

/**
 * Extract prompt from request - supports both direct prompt and AI SDK messages format
 */
function extractPrompt(body: ChatRequest): string | null {
  // Direct prompt takes precedence
  if (body.prompt) {
    return body.prompt;
  }

  // Extract from AI SDK messages array - get last user message
  if (body.messages && Array.isArray(body.messages)) {
    const userMessages = body.messages.filter((m) => m.role === "user");
    if (userMessages.length > 0) {
      const lastUserMessage = userMessages[userMessages.length - 1];
      return lastUserMessage.content;
    }
  }

  return null;
}

/**
 * Resolve system prompt based on request parameters
 */
function resolveSystemPrompt(req: ChatRequest, userPrompt: string): string {
  let systemPrompt: string;

  if (req.systemPrompt) {
    systemPrompt = req.systemPrompt;
  } else if (req.mode) {
    systemPrompt = getSystemPromptWithXml(req.mode);
  } else if (req.autoDetectMode !== false) {
    const detectedMode = detectAgentMode(userPrompt);
    systemPrompt = getSystemPromptWithXml(detectedMode);
  } else {
    systemPrompt = getSystemPromptWithXml("general");
  }

  // Inject relevant skills
  return injectRelevantSkills(userPrompt, systemPrompt);
}

/**
 * Write data to response with backpressure handling
 *
 * Waits for drain event if write buffer is full to prevent memory bloat.
 */
async function writeWithBackpressure(
  res: Response,
  data: string
): Promise<boolean> {
  return new Promise((resolve) => {
    const canContinue = res.write(data);
    if (canContinue) {
      resolve(true);
    } else {
      // Buffer is full, wait for drain
      res.once("drain", () => resolve(true));
    }
  });
}

/**
 * Handle chat request with streaming response
 *
 * Returns Server-Sent Events (SSE) stream.
 *
 * @example
 * ```typescript
 * import express from 'express';
 * import { handleChat } from '@waiboard/ai-agents/handlers';
 *
 * const app = express();
 * app.use(express.json());
 * app.post('/chat', handleChat);
 * app.listen(4111);
 * ```
 */
export async function handleChat(req: Request, res: Response): Promise<void> {
  // Validate request body with Zod
  const parseResult = ChatRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    const validationError: ValidationError = {
      error: "Invalid request body",
      issues: parseResult.error.issues,
    };
    res.status(400).json(validationError);
    return;
  }

  const body = parseResult.data;

  try {
    const { canvasId, provider = "google", model = "balanced" } = body;

    // Extract prompt from either direct field or messages array
    const prompt = extractPrompt(body);

    // This shouldn't happen due to Zod refinement, but TypeScript needs it
    if (!prompt) {
      res.status(400).json({
        error: "Missing required field: prompt or messages",
        hint: "Provide either 'prompt' string or 'messages' array with user messages",
      });
      return;
    }

    // Get canvas ID from body or header
    const resolvedCanvasId =
      canvasId || (req.headers["x-canvas-id"] as string) || "default";

    // Set up SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    // Create session with resolved options
    const session = await createSession({
      canvasId: resolvedCanvasId,
      model: model as "fast" | "balanced" | "powerful",
      systemPrompt: resolveSystemPrompt(body, prompt),
    });

    // Generate a unique message ID for this response
    const messageId = generateId();
    let hasEmittedText = false;

    // Emit text-start immediately to create the message container
    // This prevents the AI SDK from creating multiple messages when we send data-* events first
    await writeWithBackpressure(res, `data: ${JSON.stringify({ type: "text-start", id: messageId })}\n\n`);
    hasEmittedText = true;

    // Send message and stream responses using Session API
    await session.send(prompt);
    for await (const msg of session.stream()) {
      // Convert SDKMessage to AI SDK stream parts
      const parts = convertSDKMessageToAISDKStreamParts(msg, messageId);

      for (const part of parts) {
        // Skip text-start since we already emitted it
        if (part.type === "text-start") {
          continue;
        }
        if (part.type === "text-delta" || part.type === "text-end") {
          hasEmittedText = true;
        }
        const data = JSON.stringify(part);
        await writeWithBackpressure(res, `data: ${data}\n\n`);
      }
    }

    // Close the session
    await session.close();

    // If no text was emitted (e.g., simple task with no completion message),
    // emit a minimal text response so the AI SDK doesn't error
    if (!hasEmittedText) {
      await writeWithBackpressure(res, `data: ${JSON.stringify({ type: "text-start", id: messageId })}\n\n`);
      await writeWithBackpressure(res, `data: ${JSON.stringify({ type: "text-delta", id: messageId, delta: "Done." })}\n\n`);
      await writeWithBackpressure(res, `data: ${JSON.stringify({ type: "text-end", id: messageId })}\n\n`);
    }

    // Signal completion
    await writeWithBackpressure(res, "data: [DONE]\n\n");
    res.end();
  } catch (error) {
    console.error("[Chat] Error:", error);

    // If headers not sent, respond with error
    if (!res.headersSent) {
      res.status(500).json({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    } else {
      // If streaming, send AI SDK error event
      await writeWithBackpressure(
        res,
        `data: ${JSON.stringify({ type: "error", errorText: error instanceof Error ? error.message : String(error) })}\n\n`
      );
      res.end();
    }
  }
}

/**
 * Handle non-streaming chat request
 *
 * Returns JSON response with result.
 */
export async function handleChatSync(
  req: Request,
  res: Response
): Promise<void> {
  // Validate request body with Zod
  const parseResult = ChatRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    const validationError: ValidationError = {
      error: "Invalid request body",
      issues: parseResult.error.issues,
    };
    res.status(400).json(validationError);
    return;
  }

  const body = parseResult.data;

  try {
    const { canvasId, provider = "google", model = "balanced" } = body;

    // Extract prompt from either direct field or messages array
    const prompt = extractPrompt(body);

    // This shouldn't happen due to Zod refinement, but TypeScript needs it
    if (!prompt) {
      res.status(400).json({
        error: "Missing required field: prompt or messages",
        hint: "Provide either 'prompt' string or 'messages' array with user messages",
      });
      return;
    }

    const resolvedCanvasId =
      canvasId || (req.headers["x-canvas-id"] as string) || "default";

    // Run session synchronously using Session API
    const result = await runSessionSync(prompt, {
      canvasId: resolvedCanvasId,
      model: model as "fast" | "balanced" | "powerful",
      systemPrompt: resolveSystemPrompt(body, prompt),
    });

    res.json({
      success: result.success,
      summary: result.summary,
      error: result.error,
      duration: result.duration,
    });
  } catch (error) {
    console.error("[ChatSync] Error:", error);
    res.status(500).json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Handle canvas command request
 *
 * Dedicated endpoint for canvas commands with mode detection.
 * Supports: generation, editing, analysis, and other canvas operations.
 */
export async function handleCommand(
  req: Request,
  res: Response
): Promise<void> {
  // Validate request body with Zod
  const parseResult = CommandRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    const validationError: ValidationError = {
      error: "Invalid request body",
      issues: parseResult.error.issues,
    };
    res.status(400).json(validationError);
    return;
  }

  const body = parseResult.data;

  try {
    const { description, canvasId, provider = "google", model = "balanced", mode } = body;

    const resolvedCanvasId =
      canvasId || (req.headers["x-canvas-id"] as string) || "default";

    // Auto-detect mode if not specified
    const resolvedMode = mode || detectAgentMode(description);

    // Set up SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    // Generate a unique message ID for this response
    const messageId = generateId();
    let hasEmittedText = false;

    // Emit text-start immediately to create the message container
    // This prevents the AI SDK from creating multiple messages when we send data-* events first
    await writeWithBackpressure(res, `data: ${JSON.stringify({ type: "text-start", id: messageId })}\n\n`);
    hasEmittedText = true;

    // Send mode detection event in AI SDK format
    await writeWithBackpressure(
      res,
      `data: ${JSON.stringify({ type: "data-mode", data: { mode: resolvedMode } })}\n\n`
    );

    // Create session with resolved options
    const session = await createSession({
      canvasId: resolvedCanvasId,
      model: model as "fast" | "balanced" | "powerful",
    });

    // Send message and stream responses using Session API
    await session.send(description);
    for await (const msg of session.stream()) {
      // Convert SDKMessage to AI SDK stream parts
      const parts = convertSDKMessageToAISDKStreamParts(msg, messageId);

      for (const part of parts) {
        // Skip text-start since we already emitted it
        if (part.type === "text-start") {
          continue;
        }
        if (part.type === "text-delta" || part.type === "text-end") {
          hasEmittedText = true;
        }
        const data = JSON.stringify(part);
        await writeWithBackpressure(res, `data: ${data}\n\n`);
      }
    }

    // Close the session
    await session.close();

    // If no text was emitted, emit a minimal text response
    if (!hasEmittedText) {
      await writeWithBackpressure(res, `data: ${JSON.stringify({ type: "text-start", id: messageId })}\n\n`);
      await writeWithBackpressure(res, `data: ${JSON.stringify({ type: "text-delta", id: messageId, delta: "Done." })}\n\n`);
      await writeWithBackpressure(res, `data: ${JSON.stringify({ type: "text-end", id: messageId })}\n\n`);
    }

    await writeWithBackpressure(res, "data: [DONE]\n\n");
    res.end();
  } catch (error) {
    console.error("[Command] Error:", error);

    if (!res.headersSent) {
      res.status(500).json({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    } else {
      await writeWithBackpressure(
        res,
        `data: ${JSON.stringify({ type: "error", errorText: error instanceof Error ? error.message : String(error) })}\n\n`
      );
      res.end();
    }
  }
}

/**
 * Handle non-streaming canvas command request
 *
 * Returns JSON response with command result.
 */
export async function handleCommandSync(
  req: Request,
  res: Response
): Promise<void> {
  // Validate request body with Zod
  const parseResult = CommandRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    const validationError: ValidationError = {
      error: "Invalid request body",
      issues: parseResult.error.issues,
    };
    res.status(400).json(validationError);
    return;
  }

  const body = parseResult.data;

  try {
    const { description, canvasId, provider = "google", model = "balanced", mode } = body;

    const resolvedCanvasId =
      canvasId || (req.headers["x-canvas-id"] as string) || "default";

    // Auto-detect mode if not specified
    const resolvedMode = mode || detectAgentMode(description);

    // Run session synchronously using Session API
    const result = await runSessionSync(description, {
      canvasId: resolvedCanvasId,
      model: model as "fast" | "balanced" | "powerful",
    });

    res.json({
      success: result.success,
      mode: resolvedMode,
      summary: result.summary,
      error: result.error,
      duration: result.duration,
    });
  } catch (error) {
    console.error("[CommandSync] Error:", error);
    res.status(500).json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Health check handler
 */
export function handleHealth(_req: Request, res: Response): void {
  res.json({
    status: "ok",
    engine: "multi-provider",
    version: "3.1.0",
    providers: ["google", "openai"],
    defaultProvider: "google",
    timestamp: new Date().toISOString(),
  });
}

/**
 * Create Express router with canvas AI endpoints
 *
 * @example
 * ```typescript
 * import express from 'express';
 * import { createChatRouter } from '@waiboard/ai-agents/handlers';
 *
 * const app = express();
 * app.use('/api', await createChatRouter());
 * // Routes:
 * // - GET  /api/health - Health check
 * // - POST /api/chat - Streaming chat for conversations
 * // - POST /api/chat/sync - Non-streaming chat (JSON response)
 * // - POST /api/command - Canvas commands streaming (generate, edit, analyze)
 * // - POST /api/command/sync - Canvas commands non-streaming (JSON response)
 * ```
 */
export async function createChatRouter(): Promise<import("express").Router> {
  const { Router } = await import("express");
  const router = Router();

  router.get("/health", handleHealth);
  router.post("/chat", handleChat);
  router.post("/chat/sync", handleChatSync);
  router.post("/command", handleCommand);
  router.post("/command/sync", handleCommandSync);

  return router;
}
