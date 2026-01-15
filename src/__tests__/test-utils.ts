/**
 * Test utilities for ai-agents package
 */

import type { AgentEvent } from "../types/agent.js";
import type { ReasoningResult } from "../core/client.js";
import type { ExcalidrawElement } from "@waiboard/canvas-core";

/**
 * Create a mock AI SDK reasoning result
 */
export function createMockAISDKResponse(
	partial?: Partial<ReasoningResult>,
): ReasoningResult {
	return {
		thinking: partial?.thinking ?? "Processing request",
		summary: partial?.summary ?? "Task completed successfully",
		toolCalls: partial?.toolCalls ?? [],
		reasoning: partial?.reasoning ?? "",
		completion: partial?.completion ?? true,
		tokensUsed: partial?.tokensUsed ?? 100,
		...partial,
	};
}

/**
 * Create a mock canvas state
 */
export function createMockCanvasState(elements?: ExcalidrawElement[]) {
	return {
		elements: elements ?? [],
		appState: {
			viewBackgroundColor: "#ffffff",
			currentItemFontFamily: 1,
			currentItemFontSize: 20,
		},
		selectedElementIds: {},
	};
}

/**
 * Create a mock agent event
 */
export function createMockAgentEvent(
	type: AgentEvent["type"],
	data?: Partial<AgentEvent>,
): AgentEvent {
	const baseEvent = { type, timestamp: Date.now() };

	switch (type) {
		case "thinking":
			return {
				...baseEvent,
				type: "thinking",
				message: data?.message ?? "Processing...",
				step: data?.step,
				...data,
			} as AgentEvent;

		case "context":
			return {
				...baseEvent,
				type: "context",
				message: data?.message ?? "Analyzing context",
				context: data?.context ?? {},
				...data,
			} as AgentEvent;

		case "plan":
			return {
				...baseEvent,
				type: "plan",
				plan: data?.plan ?? "1. Analyze 2. Execute 3. Complete",
				steps: data?.steps ?? 3,
				...data,
			} as AgentEvent;

		case "step_start":
			return {
				...baseEvent,
				type: "step_start",
				step: data?.step ?? 1,
				description: data?.description ?? "Starting step",
				...data,
			} as AgentEvent;

		case "step_complete":
			return {
				...baseEvent,
				type: "step_complete",
				step: data?.step ?? 1,
				result: data?.result ?? "Step completed",
				...data,
			} as AgentEvent;

		case "tool_call":
			return {
				...baseEvent,
				type: "tool_call",
				tool: data?.tool ?? "canvas_write",
				args: data?.args ?? {},
				...data,
			} as AgentEvent;

		case "tool_result":
			return {
				...baseEvent,
				type: "tool_result",
				tool: data?.tool ?? "canvas_write",
				result: data?.result ?? { success: true },
				...data,
			} as AgentEvent;

		case "complete":
			return {
				...baseEvent,
				type: "complete",
				summary: data?.summary ?? "Task completed",
				result: data?.result ?? {},
				duration: data?.duration ?? 1000,
				tokensUsed: data?.tokensUsed ?? 100,
				...data,
			} as AgentEvent;

		case "error":
			return {
				...baseEvent,
				type: "error",
				error: data?.error ?? {
					code: "UNKNOWN_ERROR",
					message: "An error occurred",
				},
				recoverable: data?.recoverable ?? false,
				...data,
			} as AgentEvent;

		case "failed":
			return {
				...baseEvent,
				type: "failed",
				reason: data?.reason ?? "Task failed",
				error: data?.error,
				...data,
			} as AgentEvent;

		case "timeout":
			return {
				...baseEvent,
				type: "timeout",
				message: data?.message ?? "Operation timed out",
				...data,
			} as AgentEvent;

		case "cancelled":
			return {
				...baseEvent,
				type: "cancelled",
				message: data?.message ?? "Operation cancelled",
				...data,
			} as AgentEvent;

		default:
			return baseEvent as AgentEvent;
	}
}

/**
 * Create a mock async generator from event array
 */
export async function* createMockStreamGenerator(
	events: AgentEvent[],
): AsyncGenerator<AgentEvent> {
	for (const event of events) {
		yield event;
	}
}

/**
 * Wait for stream to complete and collect all events
 */
export async function waitForStreamComplete(
	stream: AsyncGenerator<AgentEvent>,
): Promise<AgentEvent[]> {
	const events: AgentEvent[] = [];
	for await (const event of stream) {
		events.push(event);
	}
	return events;
}

/**
 * Create a mock Express request object
 */
export function createMockRequest(options: {
	body?: Record<string, unknown>;
	headers?: Record<string, string>;
	method?: string;
	url?: string;
}) {
	return {
		body: options.body ?? {},
		headers: options.headers ?? {},
		method: options.method ?? "POST",
		url: options.url ?? "/chat",
		get: (name: string) => options.headers?.[name.toLowerCase()],
	};
}

/**
 * Create a mock Express response object for testing
 */
export function createMockResponse() {
	const headers: Record<string, string> = {};
	const chunks: string[] = [];
	let statusCode = 200;
	let headersSent = false;

	return {
		status: (code: number) => {
			statusCode = code;
			return {
				json: (data: unknown) => {
					headersSent = true;
					return { statusCode, data };
				},
			};
		},
		setHeader: (name: string, value: string) => {
			headers[name] = value;
		},
		write: (chunk: string) => {
			headersSent = true;
			chunks.push(chunk);
		},
		end: () => {
			headersSent = true;
		},
		headersSent,
		getHeaders: () => headers,
		getChunks: () => chunks,
		getStatusCode: () => statusCode,
	};
}

/**
 * Parse SSE stream chunks into events
 */
export function parseSSEChunks(chunks: string[]): Array<{
	type: string;
	data?: unknown;
}> {
	const events: Array<{ type: string; data?: unknown }> = [];

	for (const chunk of chunks) {
		// SSE format: "data: {json}\n\n"
		const match = chunk.match(/^data: (.+)$/m);
		if (match) {
			const dataStr = match[1].trim();
			if (dataStr === "[DONE]") {
				events.push({ type: "DONE" });
			} else {
				try {
					const parsed = JSON.parse(dataStr);
					events.push(parsed);
				} catch {
					// Invalid JSON, skip
				}
			}
		}
	}

	return events;
}
