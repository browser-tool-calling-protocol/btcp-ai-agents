/**
 * Mock AI SDK response payloads for testing
 */

import type { ReasoningResult } from "../../core/ai-sdk-client.js";

/**
 * Simple successful response
 */
export const simpleSuccessResponse: ReasoningResult = {
	thinking: "User wants to create a rectangle",
	summary: "Created a red rectangle at position (100, 100)",
	toolCalls: [
		{
			toolName: "canvas_write",
			toolCallId: "call_1",
			args: {
				elements: [
					{
						type: "rectangle",
						x: 100,
						y: 100,
						width: 200,
						height: 150,
						backgroundColor: "#ff0000",
					},
				],
			},
		},
	],
	reasoning: "The user requested a rectangle, so I'll create one with the specified properties",
	completion: true,
	tokensUsed: 250,
};

/**
 * Response requiring multiple tool calls
 */
export const multipleToolCallsResponse: ReasoningResult = {
	thinking: "Creating a flowchart with connected nodes",
	summary: "Created flowchart with 3 nodes and 2 connections",
	toolCalls: [
		{
			toolName: "canvas_write",
			toolCallId: "call_1",
			args: {
				elements: [
					{ type: "rectangle", id: "node1", x: 100, y: 100 },
					{ type: "rectangle", id: "node2", x: 400, y: 100 },
					{ type: "rectangle", id: "node3", x: 700, y: 100 },
				],
			},
		},
		{
			toolName: "canvas_write",
			toolCallId: "call_2",
			args: {
				elements: [
					{
						type: "arrow",
						startBinding: { elementId: "node1" },
						endBinding: { elementId: "node2" },
					},
					{
						type: "arrow",
						startBinding: { elementId: "node2" },
						endBinding: { elementId: "node3" },
					},
				],
			},
		},
	],
	reasoning: "First create the nodes, then connect them with arrows",
	completion: true,
	tokensUsed: 450,
};

/**
 * Response with incomplete task
 */
export const incompleteResponse: ReasoningResult = {
	thinking: "Analyzing the canvas to determine next steps",
	summary: "Need more information to complete the task",
	toolCalls: [
		{
			toolName: "canvas_read",
			toolCallId: "call_1",
			args: {},
		},
	],
	reasoning: "I need to read the current canvas state before proceeding",
	completion: false,
	tokensUsed: 150,
};

/**
 * Response with no tool calls (pure reasoning)
 */
export const noToolCallsResponse: ReasoningResult = {
	thinking: "User is asking for explanation",
	summary: "Explained the canvas elements and their relationships",
	toolCalls: [],
	reasoning: "This is a question that doesn't require canvas manipulation",
	completion: true,
	tokensUsed: 200,
};

/**
 * Response with XML thinking tags
 */
export const xmlThinkingResponse: ReasoningResult = {
	thinking: `<analyze>
The user wants a circle with specific properties.
- Color: blue (#0000ff)
- Size: 150x150
- Position: center of canvas
</analyze>

<plan>
1. Calculate center position
2. Create ellipse element
3. Set blue background
</plan>`,
	summary: "Created a blue circle in the center of the canvas",
	toolCalls: [
		{
			toolName: "canvas_write",
			toolCallId: "call_1",
			args: {
				elements: [
					{
						type: "ellipse",
						x: 400,
						y: 300,
						width: 150,
						height: 150,
						backgroundColor: "#0000ff",
					},
				],
			},
		},
	],
	reasoning: "Calculated center position and created the circle",
	completion: true,
	tokensUsed: 300,
};

/**
 * Response indicating error condition
 */
export const errorResponse: ReasoningResult = {
	thinking: "Attempted to execute user request but encountered an issue",
	summary: "Cannot complete task: invalid element configuration",
	toolCalls: [],
	reasoning: "The requested element properties are invalid",
	completion: false,
	tokensUsed: 100,
};

/**
 * Response for canvas analysis
 */
export const analysisResponse: ReasoningResult = {
	thinking: `<analyze>
Canvas contains:
- 5 rectangles
- 3 ellipses
- 2 arrows connecting elements
- 1 text element

Layout: Elements are arranged in a grid pattern
Colors: Primarily blue and red theme
</analyze>`,
	summary: "Canvas contains 11 elements arranged in a grid with blue/red color scheme",
	toolCalls: [],
	reasoning: "Analyzed the canvas structure and layout",
	completion: true,
	tokensUsed: 350,
};

/**
 * Response for editing existing elements
 */
export const editResponse: ReasoningResult = {
	thinking: "User wants to change the color of selected rectangles",
	summary: "Updated 3 rectangles to green color",
	toolCalls: [
		{
			toolName: "canvas_update",
			toolCallId: "call_1",
			args: {
				elementIds: ["rect_1", "rect_2", "rect_3"],
				properties: {
					backgroundColor: "#00ff00",
				},
			},
		},
	],
	reasoning: "Changed background color of selected elements",
	completion: true,
	tokensUsed: 180,
};

/**
 * Response for deletion
 */
export const deleteResponse: ReasoningResult = {
	thinking: "User wants to remove the selected elements",
	summary: "Deleted 2 elements from canvas",
	toolCalls: [
		{
			toolName: "canvas_delete",
			toolCallId: "call_1",
			args: {
				elementIds: ["rect_1", "ellipse_1"],
			},
		},
	],
	reasoning: "Removed the specified elements as requested",
	completion: true,
	tokensUsed: 120,
};
