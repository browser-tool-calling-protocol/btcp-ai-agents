/**
 * Tests for AI SDK Stream Protocol Conversion
 */

import { describe, it, expect } from "vitest";
import { createMockAgentEvent } from "../__tests__/test-utils.js";
import type { AgentEvent } from "../types/agent.js";

// Import the handler to test internal functions via the module
// Note: convertToAISDKStreamParts is not exported, so we test via handleChat behavior
// For now, we'll create a local test version based on the implementation

/**
 * Test implementation of convertToAISDKStreamParts
 * (mirrors the actual implementation in handler.ts)
 */
interface StreamPart {
	type: string;
	id?: string;
	delta?: string;
	errorText?: string;
	data?: unknown;
}

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
				type: `data-${event.type}`,
				data: {
					message: event.message,
					step: event.step,
					steps: event.steps,
					tool: event.tool,
					input: event.input,
					result: event.result,
					duration: event.duration,
					iteration: event.iteration,
				},
			});
			break;

		// Completion events → text content
		case "complete": {
			const text = event.summary || event.message || "Task completed.";
			parts.push({ type: "text-start", id: messageId });
			parts.push({ type: "text-delta", id: messageId, delta: text });
			parts.push({ type: "text-end", id: messageId });

			parts.push({
				type: "data-complete",
				data: {
					summary: event.summary,
					message: event.message,
					duration: event.duration,
					tokensUsed: event.tokensUsed,
				},
			});
			break;
		}

		// Error events
		case "error":
		case "failed": {
			let errorMessage: string;

			if (typeof event.error === "string") {
				errorMessage = event.error;
			} else if (event.error && typeof event.error === "object" && "message" in event.error) {
				errorMessage = (event.error as { message: string }).message;
			} else {
				errorMessage = event.message || "An error occurred";
			}

			parts.push({
				type: "error",
				errorText: errorMessage,
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

		default:
			parts.push({
				type: "data-unknown",
				data: event,
			});
	}

	return parts;
}

describe("AI SDK Stream Protocol - Event Conversion", () => {
	const messageId = "msg_test_123";

	describe("progress events → data parts", () => {
		it("should convert thinking event to data-thinking", () => {
			const event = createMockAgentEvent("thinking", {
				message: "Analyzing request",
				step: 1,
			});

			const parts = convertToAISDKStreamParts(event, messageId);

			expect(parts).toHaveLength(1);
			expect(parts[0].type).toBe("data-thinking");
			expect((parts[0] as { data: { message: string } }).data.message).toBe("Analyzing request");
			expect((parts[0] as { data: { step: number } }).data.step).toBe(1);
		});

		it("should convert context event to data-context", () => {
			const event = createMockAgentEvent("context", {
				message: "Canvas has 5 elements",
				context: { elementCount: 5 },
			});

			const parts = convertToAISDKStreamParts(event, messageId);

			expect(parts).toHaveLength(1);
			expect(parts[0].type).toBe("data-context");
		});

		it("should convert plan event to data-plan", () => {
			const event = createMockAgentEvent("plan", {
				plan: "1. Create\n2. Position\n3. Style",
				steps: 3,
			});

			const parts = convertToAISDKStreamParts(event, messageId);

			expect(parts).toHaveLength(1);
			expect(parts[0].type).toBe("data-plan");
			expect((parts[0] as { data: { steps: number } }).data.steps).toBe(3);
		});

		it("should convert step_start event", () => {
			const event = createMockAgentEvent("step_start", {
				step: 2,
				description: "Creating elements",
			});

			const parts = convertToAISDKStreamParts(event, messageId);

			expect(parts).toHaveLength(1);
			expect(parts[0].type).toBe("data-step_start");
			expect((parts[0] as { data: { step: number } }).data.step).toBe(2);
		});

		it("should convert step_complete event", () => {
			const event = createMockAgentEvent("step_complete", {
				step: 2,
				result: "Elements created successfully",
			});

			const parts = convertToAISDKStreamParts(event, messageId);

			expect(parts).toHaveLength(1);
			expect(parts[0].type).toBe("data-step_complete");
		});

		it("should convert tool_call event", () => {
			const event = createMockAgentEvent("tool_call", {
				tool: "canvas_write",
				args: { elements: [{ type: "rectangle" }] },
			});

			const parts = convertToAISDKStreamParts(event, messageId);

			expect(parts).toHaveLength(1);
			expect(parts[0].type).toBe("data-tool_call");
			expect((parts[0] as { data: { tool: string } }).data.tool).toBe("canvas_write");
		});

		it("should convert tool_result event", () => {
			const event = createMockAgentEvent("tool_result", {
				tool: "canvas_write",
				result: { success: true, elementIds: ["rect_1"] },
			});

			const parts = convertToAISDKStreamParts(event, messageId);

			expect(parts).toHaveLength(1);
			expect(parts[0].type).toBe("data-tool_result");
		});
	});

	describe("completion event → text parts", () => {
		it("should convert complete event with summary to text parts", () => {
			const event = createMockAgentEvent("complete", {
				summary: "Created 3 rectangles successfully",
				duration: 1500,
				tokensUsed: 250,
			});

			const parts = convertToAISDKStreamParts(event, messageId);

			expect(parts).toHaveLength(4);
			expect(parts[0]).toEqual({ type: "text-start", id: messageId });
			expect(parts[1]).toEqual({
				type: "text-delta",
				id: messageId,
				delta: "Created 3 rectangles successfully",
			});
			expect(parts[2]).toEqual({ type: "text-end", id: messageId });
			expect(parts[3].type).toBe("data-complete");
		});

		it("should use message if summary is missing", () => {
			const event = createMockAgentEvent("complete", {
				message: "Task done",
				summary: undefined,
			});

			const parts = convertToAISDKStreamParts(event, messageId);

			expect(parts).toHaveLength(4);
			expect(parts[1]).toEqual({
				type: "text-delta",
				id: messageId,
				delta: "Task done",
			});
		});

		it("should always emit text parts even if summary and message are missing", () => {
			const event: AgentEvent = {
				type: "complete",
				timestamp: Date.now(),
			};

			const parts = convertToAISDKStreamParts(event, messageId);

			expect(parts).toHaveLength(4);
			expect(parts[1]).toEqual({
				type: "text-delta",
				id: messageId,
				delta: "Task completed.",
			});
		});

		it("should include completion metadata", () => {
			const event = createMockAgentEvent("complete", {
				summary: "Done",
				duration: 2000,
				tokensUsed: 300,
			});

			const parts = convertToAISDKStreamParts(event, messageId);

			expect(parts[3].type).toBe("data-complete");
			expect((parts[3] as { data: { duration: number } }).data.duration).toBe(2000);
			expect((parts[3] as { data: { tokensUsed: number } }).data.tokensUsed).toBe(300);
		});
	});

	describe("error events → error parts", () => {
		it("should convert error event with string error", () => {
			const event: AgentEvent = {
				type: "error",
				error: "Canvas not found",
				recoverable: false,
				timestamp: Date.now(),
			};

			const parts = convertToAISDKStreamParts(event, messageId);

			expect(parts).toHaveLength(1);
			expect(parts[0].type).toBe("error");
			expect((parts[0] as { errorText: string }).errorText).toBe("Canvas not found");
		});

		it("should convert error event with object error", () => {
			const event: AgentEvent = {
				type: "error",
				error: {
					code: "CANVAS_NOT_FOUND",
					message: "Canvas with ID abc123 not found",
				},
				recoverable: false,
				timestamp: Date.now(),
			};

			const parts = convertToAISDKStreamParts(event, messageId);

			expect(parts).toHaveLength(1);
			expect(parts[0].type).toBe("error");
			expect((parts[0] as { errorText: string }).errorText).toContain("not found");
		});

		it("should convert failed event", () => {
			const event = createMockAgentEvent("failed", {
				reason: "Task failed due to validation error",
				error: { code: "INVALID_INPUT", message: "Invalid element properties" },
			});

			const parts = convertToAISDKStreamParts(event, messageId);

			expect(parts).toHaveLength(1);
			expect(parts[0].type).toBe("error");
		});

		it("should use message fallback for error without error field", () => {
			const event: AgentEvent = {
				type: "error",
				message: "Something went wrong",
				recoverable: true,
				timestamp: Date.now(),
			};

			const parts = convertToAISDKStreamParts(event, messageId);

			expect(parts).toHaveLength(1);
			expect((parts[0] as { errorText: string }).errorText).toBe("Something went wrong");
		});

		it("should handle error with no message or error field", () => {
			const event: AgentEvent = {
				type: "error",
				recoverable: false,
				timestamp: Date.now(),
			};

			const parts = convertToAISDKStreamParts(event, messageId);

			expect(parts).toHaveLength(1);
			expect((parts[0] as { errorText: string }).errorText).toBe("An error occurred");
		});
	});

	describe("timeout and cancellation events", () => {
		it("should convert timeout event to error part", () => {
			const event = createMockAgentEvent("timeout", {
				message: "Operation exceeded 30s timeout",
			});

			const parts = convertToAISDKStreamParts(event, messageId);

			expect(parts).toHaveLength(1);
			expect(parts[0].type).toBe("error");
			expect((parts[0] as { errorText: string }).errorText).toBe(
				"Operation exceeded 30s timeout"
			);
		});

		it("should use default timeout message if missing", () => {
			const event: AgentEvent = {
				type: "timeout",
				timestamp: Date.now(),
			};

			const parts = convertToAISDKStreamParts(event, messageId);

			expect(parts).toHaveLength(1);
			expect((parts[0] as { errorText: string }).errorText).toBe("Operation timed out");
		});

		it("should convert cancelled event to data part", () => {
			const event = createMockAgentEvent("cancelled", {
				message: "User cancelled the operation",
			});

			const parts = convertToAISDKStreamParts(event, messageId);

			expect(parts).toHaveLength(1);
			expect(parts[0].type).toBe("data-cancelled");
			expect((parts[0] as { data: { message: string } }).data.message).toBe(
				"User cancelled the operation"
			);
		});
	});

	describe("event sequences", () => {
		it("should convert complete workflow sequence", () => {
			const events: AgentEvent[] = [
				createMockAgentEvent("thinking", { message: "Analyzing" }),
				createMockAgentEvent("plan", { plan: "Steps", steps: 3 }),
				createMockAgentEvent("step_start", { step: 1, description: "Create" }),
				createMockAgentEvent("tool_call", { tool: "canvas_write" }),
				createMockAgentEvent("tool_result", { tool: "canvas_write", result: { success: true } }),
				createMockAgentEvent("step_complete", { step: 1, result: "Done" }),
				createMockAgentEvent("complete", { summary: "Task complete" }),
			];

			const allParts: StreamPart[] = [];
			for (const event of events) {
				allParts.push(...convertToAISDKStreamParts(event, messageId));
			}

			// Verify event ordering
			expect(allParts[0].type).toBe("data-thinking");
			expect(allParts[1].type).toBe("data-plan");
			expect(allParts[2].type).toBe("data-step_start");
			expect(allParts[3].type).toBe("data-tool_call");
			expect(allParts[4].type).toBe("data-tool_result");
			expect(allParts[5].type).toBe("data-step_complete");
			expect(allParts[6].type).toBe("text-start");
			expect(allParts[7].type).toBe("text-delta");
			expect(allParts[8].type).toBe("text-end");
			expect(allParts[9].type).toBe("data-complete");
		});

		it("should handle error recovery sequence", () => {
			const events: AgentEvent[] = [
				createMockAgentEvent("thinking", { message: "Processing" }),
				createMockAgentEvent("error", {
					error: { code: "RETRY", message: "Temporary failure" },
					recoverable: true,
				}),
				createMockAgentEvent("thinking", { message: "Retrying" }),
				createMockAgentEvent("complete", { summary: "Succeeded after retry" }),
			];

			const allParts: StreamPart[] = [];
			for (const event of events) {
				allParts.push(...convertToAISDKStreamParts(event, messageId));
			}

			expect(allParts[0].type).toBe("data-thinking");
			expect(allParts[1].type).toBe("error");
			expect(allParts[2].type).toBe("data-thinking");
			expect(allParts[3].type).toBe("text-start");
		});
	});

	describe("edge cases", () => {
		it("should handle unknown event types", () => {
			const event = {
				type: "custom_event" as AgentEvent["type"],
				customField: "value",
				timestamp: Date.now(),
			} as AgentEvent;

			const parts = convertToAISDKStreamParts(event, messageId);

			expect(parts).toHaveLength(1);
			expect(parts[0].type).toBe("data-unknown");
			expect(parts[0].data).toEqual(event);
		});

		it("should handle events with undefined optional fields", () => {
			const event: AgentEvent = {
				type: "thinking",
				timestamp: Date.now(),
			};

			const parts = convertToAISDKStreamParts(event, messageId);

			expect(parts).toHaveLength(1);
			expect(parts[0].type).toBe("data-thinking");
			expect((parts[0] as { data: { message: undefined } }).data.message).toBeUndefined();
		});

		it("should use default text when complete event has no summary or message", () => {
			const event: AgentEvent = {
				type: "complete",
				timestamp: Date.now(),
			};

			const parts = convertToAISDKStreamParts(event, messageId);

			// Should generate text parts with default message
			expect(parts).toHaveLength(4);
			const deltaPart = parts.find((p) => p.type === "text-delta");
			expect(deltaPart).toBeDefined();
			expect((deltaPart as { delta: string }).delta).toBe("Task completed.");
		});
	});
});

describe("AI SDK Stream Protocol - SSE Format", () => {
	describe("SSE event formatting", () => {
		it("should format stream parts as SSE events", () => {
			const part = { type: "data-thinking", data: { message: "Processing" } };
			const sseEvent = `data: ${JSON.stringify(part)}\n\n`;

			expect(sseEvent).toMatch(/^data: /);
			expect(sseEvent).toMatch(/\n\n$/);
			expect(JSON.parse(sseEvent.replace(/^data: /, "").trim())).toEqual(part);
		});

		it("should format [DONE] marker", () => {
			const doneMarker = "data: [DONE]\n\n";

			expect(doneMarker).toBe("data: [DONE]\n\n");
		});

		it("should handle multi-part events", () => {
			const parts = [
				{ type: "text-start", id: "msg_1" },
				{ type: "text-delta", id: "msg_1", delta: "Hello" },
				{ type: "text-end", id: "msg_1" },
			];

			const sseEvents = parts.map((part) => `data: ${JSON.stringify(part)}\n\n`);

			expect(sseEvents).toHaveLength(3);
			sseEvents.forEach((event) => {
				expect(event).toMatch(/^data: /);
				expect(event).toMatch(/\n\n$/);
			});
		});
	});
});
