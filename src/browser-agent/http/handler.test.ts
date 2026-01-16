/**
 * HTTP Handler Tests
 *
 * Tests for Express-compatible HTTP handlers.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import type { Request, Response } from "express";
import { handleChat, handleChatSync, handleCommand, handleHealth } from "./handler.js";

// Mock the session module
vi.mock("../core/session.js", () => ({
  createSession: vi.fn(),
}));

// Mock the skills module
vi.mock("../skills/index.js", () => ({
  injectRelevantSkills: vi.fn((_prompt: string, systemPrompt: string) => systemPrompt),
}));

// Mock the mode detection
vi.mock("../agents/mode-detection.js", () => ({
  detectAgentMode: vi.fn(() => "general"),
}));

// Mock the prompts module
vi.mock("../agents/prompts.js", () => ({
  getSystemPromptWithXml: vi.fn((mode: string) => `System prompt for ${mode}`),
  getSystemPrompt: vi.fn((agentType: string) => `System prompt for ${agentType}`),
}));

import { createSession } from "../core/session.js";
import { detectAgentMode } from "../agents/mode-detection.js";

// Helper to create mock Session object
function createMockSession(streamEvents: Array<Record<string, unknown>> = []) {
  return {
    send: vi.fn().mockResolvedValue(undefined),
    stream: vi.fn().mockImplementation(async function* () {
      for (const event of streamEvents) {
        yield event;
      }
    }),
    close: vi.fn().mockResolvedValue(undefined),
    getSessionId: vi.fn().mockReturnValue("session_test123"),
    isActive: vi.fn().mockReturnValue(true),
    getHistory: vi.fn().mockReturnValue([]),
    clearHistory: vi.fn(),
    updateConfig: vi.fn(),
    getConfig: vi.fn().mockReturnValue({}),
    interrupt: vi.fn(),
    fork: vi.fn(),
  };
}

// =============================================================================
// Mock Helpers
// =============================================================================

function createMockRequest(body: Record<string, unknown> = {}, headers: Record<string, string> = {}): Partial<Request> {
  return {
    body,
    headers,
  };
}

function createMockResponse(): {
  res: Partial<Response>;
  status: Mock;
  json: Mock;
  setHeader: Mock;
  write: Mock;
  end: Mock;
  once: Mock;
  headersSent: boolean;
} {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const setHeader = vi.fn();
  const write = vi.fn().mockReturnValue(true); // Return true to indicate write succeeded (no backpressure)
  const end = vi.fn();
  const once = vi.fn(); // Mock for backpressure drain event

  return {
    res: {
      status,
      json,
      setHeader,
      write,
      end,
      once,
      headersSent: false,
    },
    status,
    json,
    setHeader,
    write,
    end,
    once,
    headersSent: false,
  };
}

// =============================================================================
// handleHealth Tests
// =============================================================================

describe("handleHealth", () => {
  it("should return health status", () => {
    const req = createMockRequest();
    const { res, json } = createMockResponse();

    handleHealth(req as Request, res as Response);

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "ok",
        engine: "multi-provider",
        version: "3.1.0",
        providers: ["google", "openai"],
        defaultProvider: "google",
      })
    );
  });

  it("should include timestamp in ISO format", () => {
    const req = createMockRequest();
    const { res, json } = createMockResponse();

    handleHealth(req as Request, res as Response);

    expect(json).toHaveBeenCalledTimes(1);
    const response = json.mock.calls[0][0];
    expect(response.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});

// =============================================================================
// handleChat Tests
// =============================================================================

describe("handleChat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 400 when prompt is missing", async () => {
    const req = createMockRequest({});
    const { res, status, json } = createMockResponse();

    await handleChat(req as Request, res as Response);

    expect(status).toHaveBeenCalledWith(400);
    // Zod validation returns detailed error with issues array
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Invalid request body" })
    );
  });

  it("should set SSE headers for streaming response", async () => {
    const req = createMockRequest({ prompt: "Test prompt" });
    const { res, setHeader, write, end } = createMockResponse();

    // Mock Session API
    const mockSession = createMockSession([]);
    (createSession as Mock).mockResolvedValue(mockSession);

    await handleChat(req as Request, res as Response);

    expect(setHeader).toHaveBeenCalledWith("Content-Type", "text/event-stream");
    expect(setHeader).toHaveBeenCalledWith("Cache-Control", "no-cache");
    expect(setHeader).toHaveBeenCalledWith("Connection", "keep-alive");
    expect(setHeader).toHaveBeenCalledWith("X-Accel-Buffering", "no");
  });

  it("should stream events as AI SDK format", async () => {
    const req = createMockRequest({ prompt: "Test prompt" });
    const { res, write, end } = createMockResponse();

    // Simulate SDK messages - these will be converted to AI SDK stream format
    const sdkMessages = [
      { type: "partial", eventType: "thinking_delta", thinking: "Processing...", timestamp: Date.now() },
      { type: "result", success: true, summary: "Task completed", usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }, durationMs: 1000, turns: 1, toolCalls: 0, timestamp: Date.now() },
    ];

    const mockSession = createMockSession(sdkMessages);
    (createSession as Mock).mockResolvedValue(mockSession);

    await handleChat(req as Request, res as Response);

    // Should write "thinking" event as data-thinking (AI SDK custom data format)
    expect(write).toHaveBeenCalledWith(
      expect.stringContaining('"type":"data-thinking"')
    );

    // Should write completion as text-start/text-delta/text-end (AI SDK text format)
    expect(write).toHaveBeenCalledWith(
      expect.stringContaining('"type":"text-start"')
    );
    expect(write).toHaveBeenCalledWith(
      expect.stringContaining('"type":"text-delta"')
    );
    expect(write).toHaveBeenCalledWith(
      expect.stringContaining('"type":"text-end"')
    );

    // Should write [DONE] marker
    expect(write).toHaveBeenCalledWith("data: [DONE]\n\n");
    expect(end).toHaveBeenCalled();
  });

  it("should use canvasId from body or header", async () => {
    const reqWithBody = createMockRequest({ prompt: "Test", canvasId: "canvas-1" });
    const reqWithHeader = createMockRequest({ prompt: "Test" }, { "x-canvas-id": "canvas-2" });
    const reqWithDefault = createMockRequest({ prompt: "Test" });

    const mock = createMockResponse();
    const mockSession = createMockSession([]);
    (createSession as Mock).mockResolvedValue(mockSession);

    await handleChat(reqWithBody as Request, mock.res as Response);
    expect(createSession).toHaveBeenLastCalledWith(
      expect.objectContaining({ canvasId: "canvas-1" })
    );

    await handleChat(reqWithHeader as Request, mock.res as Response);
    expect(createSession).toHaveBeenLastCalledWith(
      expect.objectContaining({ canvasId: "canvas-2" })
    );

    await handleChat(reqWithDefault as Request, mock.res as Response);
    expect(createSession).toHaveBeenLastCalledWith(
      expect.objectContaining({ canvasId: "default" })
    );
  });

  it("should use default model when not specified", async () => {
    const req = createMockRequest({ prompt: "Test" });
    const mock = createMockResponse();
    const mockSession = createMockSession([]);
    (createSession as Mock).mockResolvedValue(mockSession);

    await handleChat(req as Request, mock.res as Response);

    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({ model: "balanced" })
    );
  });

  it("should handle errors after headers sent", async () => {
    const req = createMockRequest({ prompt: "Test" });
    const { res, write, end } = createMockResponse();
    // Simulate headers already sent
    (res as { headersSent: boolean }).headersSent = true;

    const error = new Error("Streaming error");
    // Create a mock session that throws an error during streaming
    const mockSession = {
      ...createMockSession([]),
      stream: vi.fn().mockImplementation(async function* () {
        throw error;
      }),
    };
    (createSession as Mock).mockResolvedValue(mockSession);

    await handleChat(req as Request, res as Response);

    // Error should be in AI SDK format with errorText field
    expect(write).toHaveBeenCalledWith(
      expect.stringContaining('"type":"error"')
    );
    expect(write).toHaveBeenCalledWith(
      expect.stringContaining('"errorText":"Streaming error"')
    );
    expect(end).toHaveBeenCalled();
  });
});

// =============================================================================
// handleChatSync Tests
// =============================================================================

describe("handleChatSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 400 when prompt is missing", async () => {
    const req = createMockRequest({});
    const { res, status, json } = createMockResponse();

    await handleChatSync(req as Request, res as Response);

    expect(status).toHaveBeenCalledWith(400);
    // Zod validation returns detailed error with issues array
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Invalid request body" })
    );
  });

  it("should return JSON response with result", async () => {
    const req = createMockRequest({ prompt: "Test prompt" });
    const { res, json } = createMockResponse();

    // Mock session that yields a successful result
    const sdkMessages = [
      { type: "result", success: true, summary: "Task completed", error: undefined, usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }, durationMs: 1000, turns: 1, toolCalls: 0, timestamp: Date.now() },
    ];
    const mockSession = createMockSession(sdkMessages);
    (createSession as Mock).mockResolvedValue(mockSession);

    await handleChatSync(req as Request, res as Response);

    // Handler returns only these specific fields
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        summary: "Task completed",
      })
    );
  });

  it("should handle errors and return 500", async () => {
    const req = createMockRequest({ prompt: "Test" });
    const { res, status, json } = createMockResponse();

    // Mock session that throws an error
    (createSession as Mock).mockRejectedValue(new Error("Test error"));

    await handleChatSync(req as Request, res as Response);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      error: "Internal server error",
      message: "Test error",
    });
  });
});

// =============================================================================
// handleCommand Tests
// =============================================================================

describe("handleCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 400 when description is missing", async () => {
    const req = createMockRequest({});
    const { res, status, json } = createMockResponse();

    await handleCommand(req as Request, res as Response);

    expect(status).toHaveBeenCalledWith(400);
    // Zod validation returns detailed error with issues array
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Invalid request body" })
    );
  });

  it("should auto-detect mode when not specified", async () => {
    const req = createMockRequest({ description: "Create a flowchart" });
    const { res, write } = createMockResponse();

    (detectAgentMode as Mock).mockReturnValue("generation");
    const mockSession = createMockSession([]);
    (createSession as Mock).mockResolvedValue(mockSession);

    await handleCommand(req as Request, res as Response);

    expect(detectAgentMode).toHaveBeenCalledWith("Create a flowchart");
    // Should emit mode detection event in AI SDK data format
    expect(write).toHaveBeenCalledWith(
      `data: ${JSON.stringify({ type: "data-mode", data: { mode: "generation" } })}\n\n`
    );
  });

  it("should use explicit mode when provided", async () => {
    const req = createMockRequest({ description: "Test", mode: "editing" });
    const { res, write } = createMockResponse();

    const mockSession = createMockSession([]);
    (createSession as Mock).mockResolvedValue(mockSession);

    await handleCommand(req as Request, res as Response);

    // Should emit mode event with explicit mode in AI SDK format
    expect(write).toHaveBeenCalledWith(
      `data: ${JSON.stringify({ type: "data-mode", data: { mode: "editing" } })}\n\n`
    );
    // Mode detection should not be called
    expect(detectAgentMode).not.toHaveBeenCalled();
  });

  it("should stream events in AI SDK format", async () => {
    const req = createMockRequest({ description: "Create diagram" });
    const { res, write, end } = createMockResponse();

    // Simulate SDK messages
    const sdkMessages = [
      { type: "partial", eventType: "thinking_delta", thinking: "Creating...", timestamp: Date.now() },
      { type: "result", success: true, summary: "Diagram created", usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }, durationMs: 1000, turns: 1, toolCalls: 0, timestamp: Date.now() },
    ];
    const mockSession = createMockSession(sdkMessages);
    (createSession as Mock).mockResolvedValue(mockSession);

    await handleCommand(req as Request, res as Response);

    // Streaming events in AI SDK format (text-start comes first now)
    expect(write).toHaveBeenCalledWith(
      expect.stringContaining('"type":"text-start"')
    );
    // Then converted events in AI SDK format
    expect(write).toHaveBeenCalledWith(
      expect.stringContaining('"type":"data-thinking"')
    );
    // Then [DONE]
    expect(write).toHaveBeenCalledWith("data: [DONE]\n\n");
    expect(end).toHaveBeenCalled();
  });
});
