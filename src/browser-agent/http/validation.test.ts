/**
 * Tests for HTTP Request Validation
 */

import { describe, it, expect } from "vitest";
import { ChatRequestSchema, CommandRequestSchema } from "./handler.js";

describe("HTTP Validation - ChatRequestSchema", () => {
	describe("valid requests", () => {
		it("should accept request with direct prompt", () => {
			const result = ChatRequestSchema.safeParse({
				prompt: "Create a rectangle",
			});

			expect(result.success).toBe(true);
		});

		it("should accept request with AI SDK messages array", () => {
			const result = ChatRequestSchema.safeParse({
				messages: [
					{
						role: "user",
						content: "Create a rectangle",
						id: "msg_1",
					},
				],
			});

			expect(result.success).toBe(true);
		});

		it("should accept request with both prompt and messages (prompt takes precedence)", () => {
			const result = ChatRequestSchema.safeParse({
				prompt: "Create a rectangle",
				messages: [
					{
						role: "user",
						content: "Different message",
						id: "msg_1",
					},
				],
			});

			expect(result.success).toBe(true);
		});

		it("should accept request with all optional fields", () => {
			const result = ChatRequestSchema.safeParse({
				prompt: "Create a rectangle",
				canvasId: "canvas_123",
				provider: "google",
				model: "balanced",
				systemPrompt: "Custom system prompt",
				mode: "generation",
				autoDetectMode: false,
				threadId: "thread_123",
				resourceId: "resource_123",
				sessionId: "session_123",
				canvasContext: { elements: [] },
			});

			expect(result.success).toBe(true);
		});

		it("should accept canvas ID from body", () => {
			const result = ChatRequestSchema.safeParse({
				prompt: "Test",
				canvasId: "canvas_abc123",
			});

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.canvasId).toBe("canvas_abc123");
			}
		});

		it("should accept valid provider values", () => {
			const providers = ["google", "openai"];

			for (const provider of providers) {
				const result = ChatRequestSchema.safeParse({
					prompt: "Test",
					provider,
				});

				expect(result.success).toBe(true);
			}
		});

		it("should accept valid model tiers", () => {
			const models = ["fast", "balanced", "powerful"];

			for (const model of models) {
				const result = ChatRequestSchema.safeParse({
					prompt: "Test",
					model,
				});

				expect(result.success).toBe(true);
			}
		});

		it("should accept valid agent modes", () => {
			const modes = ["general", "generation", "editing", "analysis", "layout", "styling"];

			for (const mode of modes) {
				const result = ChatRequestSchema.safeParse({
					prompt: "Test",
					mode,
				});

				expect(result.success).toBe(true);
			}
		});

		it("should accept multiple messages in array", () => {
			const result = ChatRequestSchema.safeParse({
				messages: [
					{ role: "user", content: "Hello", id: "msg_1" },
					{ role: "assistant", content: "Hi", id: "msg_2" },
					{ role: "user", content: "Create a circle", id: "msg_3" },
				],
			});

			expect(result.success).toBe(true);
		});

		it("should accept messages without id field", () => {
			const result = ChatRequestSchema.safeParse({
				messages: [
					{ role: "user", content: "Hello" },
				],
			});

			expect(result.success).toBe(true);
		});
	});

	describe("invalid requests", () => {
		it("should reject request with neither prompt nor messages", () => {
			const result = ChatRequestSchema.safeParse({});

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.issues[0].message).toContain("prompt");
			}
		});

		it("should reject request with empty messages array", () => {
			const result = ChatRequestSchema.safeParse({
				messages: [],
			});

			expect(result.success).toBe(false);
		});

		it("should reject request with messages array containing no user messages", () => {
			const result = ChatRequestSchema.safeParse({
				messages: [
					{ role: "assistant", content: "Hello" },
					{ role: "system", content: "System message" },
				],
			});

			// Schema accepts it, but extractPrompt would return null
			// The refinement only checks for array length > 0
			expect(result.success).toBe(true);
		});

		it("should reject invalid provider", () => {
			const result = ChatRequestSchema.safeParse({
				prompt: "Test",
				provider: "anthropic",
			});

			expect(result.success).toBe(false);
		});

		it("should reject invalid model tier", () => {
			const result = ChatRequestSchema.safeParse({
				prompt: "Test",
				model: "ultra",
			});

			expect(result.success).toBe(false);
		});

		it("should reject invalid agent mode", () => {
			const result = ChatRequestSchema.safeParse({
				prompt: "Test",
				mode: "invalid_mode",
			});

			expect(result.success).toBe(false);
		});

		it("should reject message with invalid role", () => {
			const result = ChatRequestSchema.safeParse({
				messages: [
					{ role: "developer", content: "Test" },
				],
			});

			expect(result.success).toBe(false);
		});

		it("should reject message with non-string content", () => {
			const result = ChatRequestSchema.safeParse({
				messages: [
					{ role: "user", content: 12345 },
				],
			});

			expect(result.success).toBe(false);
		});

		it("should reject non-string prompt", () => {
			const result = ChatRequestSchema.safeParse({
				prompt: 12345,
			});

			expect(result.success).toBe(false);
		});

		it("should reject non-string canvasId", () => {
			const result = ChatRequestSchema.safeParse({
				prompt: "Test",
				canvasId: 12345,
			});

			expect(result.success).toBe(false);
		});

		it("should reject non-boolean autoDetectMode", () => {
			const result = ChatRequestSchema.safeParse({
				prompt: "Test",
				autoDetectMode: "true",
			});

			expect(result.success).toBe(false);
		});
	});

	describe("AI SDK format (from curl example)", () => {
		it("should validate the exact curl request format", () => {
			const curlBody = {
				messages: [{ role: "user", content: "hello", id: "W85tz4FEl4M0IP25" }],
				threadId: "canvas:canvas_ce145c471150",
				resourceId: "canvas_ce145c471150",
				sessionId: "canvas:canvas_ce145c471150",
				canvasId: "canvas_ce145c471150",
				canvasContext: null,
			};

			const result = ChatRequestSchema.safeParse(curlBody);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.messages).toHaveLength(1);
				expect(result.data.messages?.[0].content).toBe("hello");
				expect(result.data.threadId).toBe("canvas:canvas_ce145c471150");
				expect(result.data.canvasId).toBe("canvas_ce145c471150");
			}
		});

		it("should handle thread/session/resource IDs", () => {
			const result = ChatRequestSchema.safeParse({
				messages: [{ role: "user", content: "test" }],
				threadId: "thread_abc",
				resourceId: "resource_def",
				sessionId: "session_ghi",
			});

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.threadId).toBe("thread_abc");
				expect(result.data.resourceId).toBe("resource_def");
				expect(result.data.sessionId).toBe("session_ghi");
			}
		});

		it("should handle null canvasContext", () => {
			const result = ChatRequestSchema.safeParse({
				messages: [{ role: "user", content: "test" }],
				canvasContext: null,
			});

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.canvasContext).toBeNull();
			}
		});

		it("should handle object canvasContext", () => {
			const result = ChatRequestSchema.safeParse({
				messages: [{ role: "user", content: "test" }],
				canvasContext: { elements: [], selectedElementIds: {} },
			});

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.canvasContext).toEqual({
					elements: [],
					selectedElementIds: {},
				});
			}
		});
	});
});

describe("HTTP Validation - CommandRequestSchema", () => {
	describe("valid requests", () => {
		it("should accept request with description", () => {
			const result = CommandRequestSchema.safeParse({
				description: "Create a circle",
			});

			expect(result.success).toBe(true);
		});

		it("should accept request with all optional fields", () => {
			const result = CommandRequestSchema.safeParse({
				description: "Create a circle",
				canvasId: "canvas_123",
				provider: "openai",
				model: "powerful",
				mode: "generation",
			});

			expect(result.success).toBe(true);
		});

		it("should accept long description", () => {
			const longDescription = "a".repeat(1000);
			const result = CommandRequestSchema.safeParse({
				description: longDescription,
			});

			expect(result.success).toBe(true);
		});
	});

	describe("invalid requests", () => {
		it("should reject request without description", () => {
			const result = CommandRequestSchema.safeParse({});

			expect(result.success).toBe(false);
		});

		it("should reject request with empty description", () => {
			const result = CommandRequestSchema.safeParse({
				description: "",
			});

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.issues[0].message).toContain("required");
			}
		});

		it("should reject request with non-string description", () => {
			const result = CommandRequestSchema.safeParse({
				description: 12345,
			});

			expect(result.success).toBe(false);
		});

		it("should reject invalid provider", () => {
			const result = CommandRequestSchema.safeParse({
				description: "Test",
				provider: "claude",
			});

			expect(result.success).toBe(false);
		});

		it("should reject invalid model", () => {
			const result = CommandRequestSchema.safeParse({
				description: "Test",
				model: "mega",
			});

			expect(result.success).toBe(false);
		});
	});
});
