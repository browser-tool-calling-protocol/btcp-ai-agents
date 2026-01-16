/**
 * Mock MCP Client for Benchmarks
 *
 * A mock implementation of the MCP client that simulates canvas operations
 * without requiring an actual MCP server. This allows benchmarks to test
 * the LLM's tool calling decisions without network dependencies.
 */

import type { McpClient } from "../agent-sdk/core/loop/types.js";

/**
 * Canvas state for mock operations
 */
interface MockCanvasState {
  elements: Array<{
    id: string;
    type: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    text?: string;
    backgroundColor?: string;
    [key: string]: unknown;
  }>;
  lastCreatedId: number;
}

/**
 * Mock MCP Client for benchmark testing
 */
export class MockMcpClient implements McpClient {
  private connected = false;
  private state: MockCanvasState = {
    elements: [],
    lastCreatedId: 0,
  };

  /**
   * Set the initial canvas state for the benchmark scenario
   */
  setInitialState(elements: MockCanvasState["elements"]): void {
    this.state = {
      elements: [...elements],
      lastCreatedId: elements.length,
    };
  }

  /**
   * Simulate connection - always succeeds
   */
  async connect(): Promise<boolean> {
    this.connected = true;
    return true;
  }

  /**
   * Disconnect
   */
  disconnect(): void {
    this.connected = false;
  }

  /**
   * Execute a tool (simulated)
   */
  async execute<T = unknown>(
    toolName: string,
    input: Record<string, unknown>
  ): Promise<T> {
    if (!this.connected) {
      throw new Error("Not connected to MCP server");
    }

    switch (toolName) {
      case "canvas_read":
        return this.handleCanvasRead(input) as T;
      case "canvas_write":
        return this.handleCanvasWrite(input) as T;
      case "canvas_edit":
        return this.handleCanvasEdit(input) as T;
      case "canvas_find":
        return this.handleCanvasFind(input) as T;
      case "canvas_capture":
        return this.handleCanvasCapture() as T;
      case "canvas_snapshot":
        return this.handleCanvasSnapshot() as T;
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  /**
   * Read resource (simulated)
   */
  async readResource<T = unknown>(uri: string): Promise<T> {
    if (!this.connected) {
      throw new Error("Not connected to MCP server");
    }

    // Parse the URI to determine what to return
    if (uri.includes("/snapshot")) {
      return this.handleCanvasSnapshot() as T;
    }

    return {
      summary: "Mock resource",
      content: {},
    } as T;
  }

  // =========================================================================
  // Tool Handlers
  // =========================================================================

  private handleCanvasRead(_input: Record<string, unknown>): {
    elements: typeof this.state.elements;
    summary: string;
  } {
    return {
      elements: this.state.elements,
      summary:
        this.state.elements.length === 0
          ? "The canvas is empty. No elements found."
          : `Canvas contains ${this.state.elements.length} element(s): ${this.state.elements.map((e) => e.type).join(", ")}`,
    };
  }

  private handleCanvasWrite(input: Record<string, unknown>): {
    created: Array<{ id: string; type: string }>;
    summary: string;
  } {
    const elements = (input.elements as Array<Record<string, unknown>>) || [];
    const created: Array<{ id: string; type: string }> = [];

    for (const el of elements) {
      const id = `mock_${++this.state.lastCreatedId}`;
      const newElement = {
        id,
        type: (el.type as string) || "rectangle",
        x: (el.x as number) || 0,
        y: (el.y as number) || 0,
        width: (el.width as number) || 100,
        height: (el.height as number) || 100,
        ...el,
      };
      this.state.elements.push(newElement);
      created.push({ id, type: newElement.type });
    }

    return {
      created,
      summary: `Created ${created.length} element(s): ${created.map((c) => `${c.type} (${c.id})`).join(", ")}`,
    };
  }

  private handleCanvasEdit(input: Record<string, unknown>): {
    modified: number;
    summary: string;
  } {
    const operations = (input.operations as Array<Record<string, unknown>>) || [];
    let modified = 0;

    for (const op of operations) {
      const target = op.target as Record<string, unknown> | undefined;
      if (!target) continue;

      // Find matching elements
      let matchingElements = this.state.elements;
      if (target.id) {
        matchingElements = matchingElements.filter(
          (e) => e.id === target.id
        );
      }
      if (target.type) {
        matchingElements = matchingElements.filter(
          (e) => e.type === target.type
        );
      }

      // Apply changes
      if (op.set) {
        for (const el of matchingElements) {
          Object.assign(el, op.set);
          modified++;
        }
      }

      // Handle delete
      if (op.delete) {
        this.state.elements = this.state.elements.filter(
          (e) => !matchingElements.includes(e)
        );
        modified += matchingElements.length;
      }
    }

    return {
      modified,
      summary: `Modified ${modified} element(s)`,
    };
  }

  private handleCanvasFind(input: Record<string, unknown>): {
    elements: typeof this.state.elements;
    count: number;
  } {
    const match = input.match as Record<string, unknown> | undefined;
    let results = this.state.elements;

    if (match) {
      if (match.type) {
        results = results.filter((e) => e.type === match.type);
      }
      if (match.text) {
        const textPattern = new RegExp(match.text as string, "i");
        results = results.filter((e) => e.text && textPattern.test(e.text));
      }
    }

    return {
      elements: results,
      count: results.length,
    };
  }

  private handleCanvasCapture(): {
    imageUrl: string;
    format: string;
  } {
    return {
      imageUrl: "data:image/png;base64,mock_image_data",
      format: "png",
    };
  }

  private handleCanvasSnapshot(): {
    elementCount: number;
    typeCounts: Record<string, number>;
    summary: string;
    selection: string[];
    viewport: { x: number; y: number; zoom: number };
  } {
    const typeCounts: Record<string, number> = {};
    for (const el of this.state.elements) {
      typeCounts[el.type] = (typeCounts[el.type] || 0) + 1;
    }

    return {
      elementCount: this.state.elements.length,
      typeCounts,
      summary:
        this.state.elements.length === 0
          ? "Empty canvas"
          : `${this.state.elements.length} elements`,
      selection: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    };
  }

  /**
   * Get current canvas state (for testing assertions)
   */
  getState(): MockCanvasState {
    return { ...this.state };
  }

  /**
   * Reset state
   */
  reset(): void {
    this.state = {
      elements: [],
      lastCreatedId: 0,
    };
  }
}
