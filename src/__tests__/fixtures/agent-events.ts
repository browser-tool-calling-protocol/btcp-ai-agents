/**
 * Sample agent event sequences for testing
 */

import type { AgentEvent } from "../../types/agent.js";

/**
 * Simple successful completion flow
 */
export const simpleSuccessFlow: AgentEvent[] = [
	{
		type: "thinking",
		message: "Analyzing user request",
		timestamp: Date.now(),
	},
	{
		type: "plan",
		plan: "1. Create rectangle\n2. Set color\n3. Position element",
		steps: 3,
		timestamp: Date.now(),
	},
	{
		type: "step_start",
		step: 1,
		description: "Creating rectangle element",
		timestamp: Date.now(),
	},
	{
		type: "tool_call",
		tool: "canvas_write",
		args: {
			elements: [
				{
					type: "rectangle",
					x: 100,
					y: 100,
					width: 200,
					height: 150,
				},
			],
		},
		timestamp: Date.now(),
	},
	{
		type: "tool_result",
		tool: "canvas_write",
		result: { success: true, elementIds: ["rect_1"] },
		timestamp: Date.now(),
	},
	{
		type: "step_complete",
		step: 1,
		result: "Rectangle created successfully",
		timestamp: Date.now(),
	},
	{
		type: "complete",
		summary: "Created a red rectangle at position (100, 100)",
		result: { elementIds: ["rect_1"] },
		duration: 1500,
		tokensUsed: 250,
		timestamp: Date.now(),
	},
];

/**
 * Error recovery flow
 */
export const errorRecoveryFlow: AgentEvent[] = [
	{
		type: "thinking",
		message: "Processing request",
		timestamp: Date.now(),
	},
	{
		type: "tool_call",
		tool: "canvas_read",
		args: { canvasId: "invalid_id" },
		timestamp: Date.now(),
	},
	{
		type: "error",
		error: {
			code: "CANVAS_NOT_FOUND",
			message: "Canvas with ID invalid_id not found",
		},
		recoverable: true,
		timestamp: Date.now(),
	},
	{
		type: "thinking",
		message: "Retrying with default canvas",
		timestamp: Date.now(),
	},
	{
		type: "tool_call",
		tool: "canvas_read",
		args: {},
		timestamp: Date.now(),
	},
	{
		type: "tool_result",
		tool: "canvas_read",
		result: { elements: [] },
		timestamp: Date.now(),
	},
	{
		type: "complete",
		summary: "Successfully recovered and read canvas",
		result: {},
		duration: 2000,
		tokensUsed: 300,
		timestamp: Date.now(),
	},
];

/**
 * Multi-step tool execution flow
 */
export const multiStepToolFlow: AgentEvent[] = [
	{
		type: "thinking",
		message: "Creating a flowchart",
		timestamp: Date.now(),
	},
	{
		type: "plan",
		plan: "1. Create nodes\n2. Connect with arrows\n3. Add labels",
		steps: 3,
		timestamp: Date.now(),
	},
	{
		type: "step_start",
		step: 1,
		description: "Creating flowchart nodes",
		timestamp: Date.now(),
	},
	{
		type: "tool_call",
		tool: "canvas_write",
		args: {
			elements: [
				{ type: "rectangle", id: "node1", x: 100, y: 100 },
				{ type: "rectangle", id: "node2", x: 400, y: 100 },
			],
		},
		timestamp: Date.now(),
	},
	{
		type: "tool_result",
		tool: "canvas_write",
		result: { success: true, elementIds: ["node1", "node2"] },
		timestamp: Date.now(),
	},
	{
		type: "step_complete",
		step: 1,
		result: "Nodes created",
		timestamp: Date.now(),
	},
	{
		type: "step_start",
		step: 2,
		description: "Connecting nodes with arrows",
		timestamp: Date.now(),
	},
	{
		type: "tool_call",
		tool: "canvas_write",
		args: {
			elements: [
				{
					type: "arrow",
					startBinding: { elementId: "node1" },
					endBinding: { elementId: "node2" },
				},
			],
		},
		timestamp: Date.now(),
	},
	{
		type: "tool_result",
		tool: "canvas_write",
		result: { success: true, elementIds: ["arrow1"] },
		timestamp: Date.now(),
	},
	{
		type: "step_complete",
		step: 2,
		result: "Arrows connected",
		timestamp: Date.now(),
	},
	{
		type: "complete",
		summary: "Flowchart created with 2 nodes and 1 connection",
		result: { elementIds: ["node1", "node2", "arrow1"] },
		duration: 3000,
		tokensUsed: 450,
		timestamp: Date.now(),
	},
];

/**
 * Failed task flow
 */
export const failedTaskFlow: AgentEvent[] = [
	{
		type: "thinking",
		message: "Attempting to execute task",
		timestamp: Date.now(),
	},
	{
		type: "tool_call",
		tool: "canvas_write",
		args: { elements: [] },
		timestamp: Date.now(),
	},
	{
		type: "error",
		error: {
			code: "INVALID_ELEMENTS",
			message: "Elements array cannot be empty",
		},
		recoverable: false,
		timestamp: Date.now(),
	},
	{
		type: "failed",
		reason: "Cannot create elements: invalid input",
		error: {
			code: "INVALID_ELEMENTS",
			message: "Elements array cannot be empty",
		},
		timestamp: Date.now(),
	},
];

/**
 * Timeout flow
 */
export const timeoutFlow: AgentEvent[] = [
	{
		type: "thinking",
		message: "Starting long-running operation",
		timestamp: Date.now(),
	},
	{
		type: "step_start",
		step: 1,
		description: "Processing complex request",
		timestamp: Date.now(),
	},
	{
		type: "timeout",
		message: "Operation exceeded maximum allowed time (30s)",
		timestamp: Date.now(),
	},
];

/**
 * Cancelled operation flow
 */
export const cancelledFlow: AgentEvent[] = [
	{
		type: "thinking",
		message: "Starting operation",
		timestamp: Date.now(),
	},
	{
		type: "plan",
		plan: "1. Step one\n2. Step two\n3. Step three",
		steps: 3,
		timestamp: Date.now(),
	},
	{
		type: "step_start",
		step: 1,
		description: "Executing step one",
		timestamp: Date.now(),
	},
	{
		type: "cancelled",
		message: "Operation cancelled by user",
		timestamp: Date.now(),
	},
];
