/**
 * Sample canvas state fixtures for testing
 */

import type { ExcalidrawElement } from "@waiboard/canvas-core";

export const emptyCanvasState = {
	elements: [],
	appState: {
		viewBackgroundColor: "#ffffff",
	},
	selectedElementIds: {},
};

export const singleRectangleState = {
	elements: [
		{
			id: "rect_1",
			type: "rectangle",
			x: 100,
			y: 100,
			width: 200,
			height: 150,
			backgroundColor: "#ff0000",
			strokeColor: "#000000",
			fillStyle: "solid",
			strokeWidth: 2,
			roughness: 1,
			opacity: 100,
			angle: 0,
			locked: false,
			isDeleted: false,
		},
	] as ExcalidrawElement[],
	appState: {
		viewBackgroundColor: "#ffffff",
	},
	selectedElementIds: { rect_1: true },
};

export const multipleElementsState = {
	elements: [
		{
			id: "rect_1",
			type: "rectangle",
			x: 100,
			y: 100,
			width: 200,
			height: 150,
			backgroundColor: "#ff0000",
		},
		{
			id: "ellipse_1",
			type: "ellipse",
			x: 400,
			y: 100,
			width: 150,
			height: 150,
			backgroundColor: "#00ff00",
		},
		{
			id: "text_1",
			type: "text",
			x: 100,
			y: 300,
			width: 200,
			height: 50,
			text: "Hello World",
			fontSize: 20,
			fontFamily: 1,
		},
	] as ExcalidrawElement[],
	appState: {
		viewBackgroundColor: "#ffffff",
	},
	selectedElementIds: {},
};

export const arrowBindingState = {
	elements: [
		{
			id: "rect_1",
			type: "rectangle",
			x: 100,
			y: 100,
			width: 200,
			height: 150,
		},
		{
			id: "rect_2",
			type: "rectangle",
			x: 500,
			y: 100,
			width: 200,
			height: 150,
		},
		{
			id: "arrow_1",
			type: "arrow",
			x: 300,
			y: 175,
			width: 200,
			height: 0,
			startBinding: {
				elementId: "rect_1",
				focus: 0,
				gap: 0,
			},
			endBinding: {
				elementId: "rect_2",
				focus: 0,
				gap: 0,
			},
		},
	] as ExcalidrawElement[],
	appState: {
		viewBackgroundColor: "#ffffff",
	},
	selectedElementIds: {},
};

export const frameWithElementsState = {
	elements: [
		{
			id: "frame_1",
			type: "frame",
			x: 50,
			y: 50,
			width: 600,
			height: 400,
			name: "Main Frame",
		},
		{
			id: "rect_1",
			type: "rectangle",
			x: 100,
			y: 100,
			width: 200,
			height: 150,
			frameId: "frame_1",
		},
		{
			id: "ellipse_1",
			type: "ellipse",
			x: 400,
			y: 100,
			width: 150,
			height: 150,
			frameId: "frame_1",
		},
	] as ExcalidrawElement[],
	appState: {
		viewBackgroundColor: "#ffffff",
	},
	selectedElementIds: {},
};
