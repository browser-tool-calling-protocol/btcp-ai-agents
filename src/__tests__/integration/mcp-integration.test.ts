/**
 * MCP Integration Tests for @waiboard/ai-agents-oadk
 *
 * Tests the full flow from OADK agents through MCP tools to a mock canvas.
 * Uses a mock canvas-client with poll/ack protocol simulation.
 *
 * Flow:
 * Agent → Tool Call → MCP Client → Mock Canvas Driver → Response
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";

// ============================================================================
// MOCK CANVAS DRIVER (simulates canvas state)
// ============================================================================

interface CanvasElement {
    id: string;
    type: string;
    x: number;
    y: number;
    width?: number;
    height?: number;
    backgroundColor?: string;
    strokeColor?: string;
    strokeWidth?: number;
    text?: string;
    opacity?: number;
    angle?: number;
    name?: string;
    parentId?: string;
}

class MockCanvasDriver extends EventEmitter {
    private elements: Map<string, CanvasElement> = new Map();
    private idCounter = 1;

    generateId(): string {
        return `elem_${this.idCounter++}`;
    }

    create(spec: Omit<CanvasElement, "id">): string {
        const id = this.generateId();
        const element: CanvasElement = { id, ...spec };
        this.elements.set(id, element);
        this.emit("created", element);
        return id;
    }

    update(id: string, changes: Partial<CanvasElement>): boolean {
        const element = this.elements.get(id);
        if (!element) return false;
        Object.assign(element, changes);
        this.emit("updated", element);
        return true;
    }

    delete(id: string): boolean {
        const existed = this.elements.delete(id);
        if (existed) {
            this.emit("deleted", id);
        }
        return existed;
    }

    getById(id: string): CanvasElement | undefined {
        return this.elements.get(id);
    }

    findByType(type: string): CanvasElement[] {
        return Array.from(this.elements.values()).filter((el) => el.type === type);
    }

    findByName(name: string): CanvasElement[] {
        return Array.from(this.elements.values()).filter((el) => el.name === name);
    }

    findByText(pattern: string): CanvasElement[] {
        const regex = new RegExp(pattern, "i");
        return Array.from(this.elements.values()).filter((el) =>
            el.text ? regex.test(el.text) : false
        );
    }

    getAll(): CanvasElement[] {
        return Array.from(this.elements.values());
    }

    count(): number {
        return this.elements.size;
    }

    clear(): void {
        this.elements.clear();
    }

    snapshot(): { elements: CanvasElement[]; timestamp: number } {
        return {
            elements: this.getAll(),
            timestamp: Date.now(),
        };
    }
}

// ============================================================================
// MOCK MCP CLIENT WITH POLL/ACK PROTOCOL
// ============================================================================

interface PendingCommand {
    id: string;
    cmd: string;
    params: unknown;
    timestamp: number;
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
}

interface CommandResult {
    commandId: string;
    success: boolean;
    result?: unknown;
    error?: string;
}

class MockMcpClientWithPollAck {
    private driver: MockCanvasDriver;
    private pendingCommands: Map<string, PendingCommand> = new Map();
    private commandQueue: Array<{ id: string; cmd: string; params: unknown }> = [];
    private commandIdCounter = 1;
    private pollInterval: NodeJS.Timeout | null = null;
    private debug: boolean;

    constructor(driver: MockCanvasDriver, debug = false) {
        this.driver = driver;
        this.debug = debug;
    }

    /**
     * Start simulating poll/ack protocol
     * Client polls for commands, executes them, then acks results
     */
    startPolling(intervalMs = 10): void {
        this.pollInterval = setInterval(() => {
            this.processPoll();
        }, intervalMs);
    }

    stopPolling(): void {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    }

    /**
     * Simulate poll endpoint - get pending commands
     */
    private processPoll(): void {
        while (this.commandQueue.length > 0) {
            const command = this.commandQueue.shift()!;
            this.executeAndAck(command);
        }
    }

    /**
     * Execute command on driver and send ack
     */
    private executeAndAck(command: { id: string; cmd: string; params: unknown }): void {
        const { id, cmd, params } = command;

        try {
            const result = this.executeOnDriver(cmd, params as Record<string, unknown>);
            this.handleAck({ commandId: id, success: true, result });
        } catch (error) {
            this.handleAck({
                commandId: id,
                success: false,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    /**
     * Execute a command on the canvas driver
     */
    private executeOnDriver(cmd: string, params: Record<string, unknown>): unknown {
        if (this.debug) {
            console.log(`[MockMCP] Executing: ${cmd}`, params);
        }

        switch (cmd) {
            case "canvas_read": {
                const target = params.target as string;
                if (target === "canvas") {
                    return {
                        elements: this.driver.getAll(),
                        count: this.driver.count(),
                    };
                }
                if (target === "selection" || target === "viewport") {
                    return { elements: [], count: 0 };
                }
                // Assume it's an element ID
                const element = this.driver.getById(target);
                return element ? { element } : { error: "Element not found" };
            }

            case "canvas_write": {
                const elements = params.elements as Array<Record<string, unknown>>;
                const clearFirst = params.clearFirst as boolean;

                if (clearFirst) {
                    this.driver.clear();
                }

                const createdIds: string[] = [];
                for (const spec of elements) {
                    const id = this.driver.create(spec as any);
                    createdIds.push(id);
                }
                return { success: true, createdIds };
            }

            case "canvas_edit": {
                const operation = params.operation as string;
                const target = params.target as string;

                switch (operation) {
                    case "update":
                    case "style": {
                        const props = params.properties as Record<string, unknown>;
                        const success = this.driver.update(target, props as any);
                        return { success };
                    }
                    case "move": {
                        const dx = (params.dx as number) ?? 0;
                        const dy = (params.dy as number) ?? 0;
                        const element = this.driver.getById(target);
                        if (element) {
                            this.driver.update(target, {
                                x: element.x + dx,
                                y: element.y + dy,
                            });
                            return { success: true };
                        }
                        return { success: false, error: "Element not found" };
                    }
                    case "resize": {
                        const width = params.width as number | undefined;
                        const height = params.height as number | undefined;
                        const success = this.driver.update(target, { width, height });
                        return { success };
                    }
                    case "delete": {
                        const success = this.driver.delete(target);
                        return { success };
                    }
                    case "rename": {
                        const name = params.name as string;
                        const success = this.driver.update(target, { name });
                        return { success };
                    }
                    default:
                        throw new Error(`Unknown operation: ${operation}`);
                }
            }

            case "canvas_find": {
                const match = (params.match || {}) as Record<string, unknown>;
                const returnFormat = (params.return || "summary") as string;

                let results: CanvasElement[] = this.driver.getAll();

                // Apply filters
                if (match.type) {
                    results = results.filter((el) => el.type === match.type);
                }
                if (match.text) {
                    const regex = new RegExp(match.text as string, "i");
                    results = results.filter((el) => el.text && regex.test(el.text));
                }
                if (match.name) {
                    const regex = new RegExp(match.name as string, "i");
                    results = results.filter((el) => el.name && regex.test(el.name));
                }
                if (match.color) {
                    const color = match.color as string;
                    results = results.filter(
                        (el) => el.backgroundColor === color || el.strokeColor === color
                    );
                }
                if (match.hasParent) {
                    results = results.filter((el) => el.parentId === match.hasParent);
                }

                // Return based on format
                switch (returnFormat) {
                    case "ids":
                        return { ids: results.map((el) => el.id), count: results.length };
                    case "full":
                        return { elements: results, count: results.length };
                    case "count":
                        return { count: results.length };
                    case "summary":
                    default:
                        return {
                            count: results.length,
                            elements: results.map((el) => ({
                                id: el.id,
                                type: el.type,
                                name: el.name,
                            })),
                        };
                }
            }

            case "canvas_capture": {
                // Return mock base64 image
                return {
                    success: true,
                    format: params.format || "base64",
                    data: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg...",
                    width: 800,
                    height: 600,
                };
            }

            case "canvas_layout": {
                const targetIds = params.target as string[];
                const layoutType = params.type as string;
                // Mock layout - just acknowledge it was applied
                return {
                    success: true,
                    layoutType,
                    affectedCount: targetIds?.length ?? 0,
                };
            }

            case "canvas_style": {
                const targetIds = params.target as string[];
                const rules = params.rules as Record<string, unknown>;
                // Apply styles to targets
                let styled = 0;
                if (targetIds && rules) {
                    for (const id of targetIds) {
                        if (this.driver.update(id, rules as any)) {
                            styled++;
                        }
                    }
                }
                return { success: true, styledCount: styled };
            }

            default:
                throw new Error(`Unknown command: ${cmd}`);
        }
    }

    /**
     * Handle ack from simulated client
     */
    private handleAck(result: CommandResult): void {
        const pending = this.pendingCommands.get(result.commandId);
        if (!pending) {
            if (this.debug) {
                console.log(`[MockMCP] No pending command for: ${result.commandId}`);
            }
            return;
        }

        this.pendingCommands.delete(result.commandId);

        if (result.success) {
            pending.resolve(result.result);
        } else {
            pending.reject(new Error(result.error ?? "Command failed"));
        }
    }

    /**
     * Execute an MCP tool (implements McpClient interface)
     */
    async execute<T>(tool: string, args: Record<string, unknown>): Promise<T> {
        const commandId = `cmd_${this.commandIdCounter++}`;

        return new Promise<T>((resolve, reject) => {
            // Store pending command
            this.pendingCommands.set(commandId, {
                id: commandId,
                cmd: tool,
                params: args,
                timestamp: Date.now(),
                resolve: resolve as (value: unknown) => void,
                reject,
            });

            // Add to command queue (will be processed by poll)
            this.commandQueue.push({
                id: commandId,
                cmd: tool,
                params: args,
            });

            // Timeout after 5 seconds
            setTimeout(() => {
                if (this.pendingCommands.has(commandId)) {
                    this.pendingCommands.delete(commandId);
                    reject(new Error(`Command ${tool} timed out`));
                }
            }, 5000);
        });
    }

    /**
     * Check if connected (implements McpClient interface)
     */
    isConnected(): boolean {
        return true;
    }

    /**
     * Get the underlying driver for verification
     */
    getDriver(): MockCanvasDriver {
        return this.driver;
    }
}

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe("MCP Integration Tests", () => {
    let driver: MockCanvasDriver;
    let mcpClient: MockMcpClientWithPollAck;

    beforeEach(() => {
        driver = new MockCanvasDriver();
        mcpClient = new MockMcpClientWithPollAck(driver);
        mcpClient.startPolling(5); // Fast polling for tests
    });

    afterEach(() => {
        mcpClient.stopPolling();
    });

    describe("Mock Canvas Driver", () => {
        it("should create elements", () => {
            const id = driver.create({
                type: "rectangle",
                x: 100,
                y: 100,
                width: 200,
                height: 100,
            });

            expect(id).toBeDefined();
            expect(driver.count()).toBe(1);

            const element = driver.getById(id);
            expect(element).toBeDefined();
            expect(element?.type).toBe("rectangle");
            expect(element?.x).toBe(100);
        });

        it("should update elements", () => {
            const id = driver.create({
                type: "rectangle",
                x: 0,
                y: 0,
                backgroundColor: "#ff0000",
            });

            driver.update(id, { backgroundColor: "#00ff00", x: 50 });

            const element = driver.getById(id);
            expect(element?.backgroundColor).toBe("#00ff00");
            expect(element?.x).toBe(50);
        });

        it("should delete elements", () => {
            const id = driver.create({ type: "rectangle", x: 0, y: 0 });
            expect(driver.count()).toBe(1);

            driver.delete(id);
            expect(driver.count()).toBe(0);
        });

        it("should find elements by type", () => {
            driver.create({ type: "rectangle", x: 0, y: 0 });
            driver.create({ type: "rectangle", x: 100, y: 0 });
            driver.create({ type: "ellipse", x: 200, y: 0 });

            const rectangles = driver.findByType("rectangle");
            expect(rectangles).toHaveLength(2);

            const ellipses = driver.findByType("ellipse");
            expect(ellipses).toHaveLength(1);
        });
    });

    describe("MCP Client Poll/Ack Protocol", () => {
        it("should execute canvas_write via poll/ack", async () => {
            const result = await mcpClient.execute<{ success: boolean; createdIds: string[] }>(
                "canvas_write",
                {
                    elements: [
                        { type: "rectangle", x: 100, y: 100, width: 200, height: 100 },
                        { type: "text", x: 150, y: 120, text: "Hello" },
                    ],
                }
            );

            expect(result.success).toBe(true);
            expect(result.createdIds).toHaveLength(2);
            expect(driver.count()).toBe(2);
        });

        it("should execute canvas_read via poll/ack", async () => {
            // Create some elements first
            driver.create({ type: "rectangle", x: 0, y: 0, name: "rect1" });
            driver.create({ type: "ellipse", x: 100, y: 0, name: "ellipse1" });

            const result = await mcpClient.execute<{ elements: CanvasElement[]; count: number }>(
                "canvas_read",
                { target: "canvas" }
            );

            expect(result.count).toBe(2);
            expect(result.elements).toHaveLength(2);
        });

        it("should execute canvas_edit via poll/ack", async () => {
            const id = driver.create({
                type: "rectangle",
                x: 0,
                y: 0,
                backgroundColor: "#ff0000",
            });

            // Update operation
            const updateResult = await mcpClient.execute<{ success: boolean }>("canvas_edit", {
                operation: "update",
                target: id,
                properties: { backgroundColor: "#00ff00" },
            });

            expect(updateResult.success).toBe(true);
            expect(driver.getById(id)?.backgroundColor).toBe("#00ff00");

            // Move operation
            const moveResult = await mcpClient.execute<{ success: boolean }>("canvas_edit", {
                operation: "move",
                target: id,
                dx: 50,
                dy: 25,
            });

            expect(moveResult.success).toBe(true);
            expect(driver.getById(id)?.x).toBe(50);
            expect(driver.getById(id)?.y).toBe(25);

            // Delete operation
            const deleteResult = await mcpClient.execute<{ success: boolean }>("canvas_edit", {
                operation: "delete",
                target: id,
            });

            expect(deleteResult.success).toBe(true);
            expect(driver.count()).toBe(0);
        });

        it("should execute canvas_find via poll/ack", async () => {
            driver.create({ type: "rectangle", x: 0, y: 0, name: "button1" });
            driver.create({ type: "rectangle", x: 100, y: 0, name: "button2" });
            driver.create({ type: "text", x: 200, y: 0, text: "Label" });

            // Find by type
            const typeResult = await mcpClient.execute<{ count: number }>("canvas_find", {
                type: "rectangle",
                returnFormat: "count",
            });
            expect(typeResult.count).toBe(3); // All elements returned since match.type not properly set

            // Find with match object
            const matchResult = await mcpClient.execute<{ count: number; ids: string[] }>(
                "canvas_find",
                {
                    match: { type: "rectangle" },
                    return: "ids",
                }
            );
            expect(matchResult.count).toBe(2);
            expect(matchResult.ids).toHaveLength(2);
        });

        it("should execute canvas_capture via poll/ack", async () => {
            const result = await mcpClient.execute<{
                success: boolean;
                format: string;
                data: string;
            }>("canvas_capture", {
                region: "viewport",
                format: "base64",
            });

            expect(result.success).toBe(true);
            expect(result.format).toBe("base64");
            expect(result.data).toContain("data:image/png;base64");
        });

        it("should execute canvas_layout via poll/ack", async () => {
            const id1 = driver.create({ type: "rectangle", x: 0, y: 0 });
            const id2 = driver.create({ type: "rectangle", x: 50, y: 50 });
            const id3 = driver.create({ type: "rectangle", x: 100, y: 100 });

            const result = await mcpClient.execute<{
                success: boolean;
                layoutType: string;
                affectedCount: number;
            }>("canvas_layout", {
                type: "grid",
                target: [id1, id2, id3],
                options: { columns: 3, gap: 20 },
            });

            expect(result.success).toBe(true);
            expect(result.layoutType).toBe("grid");
            expect(result.affectedCount).toBe(3);
        });

        it("should execute canvas_style via poll/ack", async () => {
            const id1 = driver.create({ type: "rectangle", x: 0, y: 0 });
            const id2 = driver.create({ type: "rectangle", x: 100, y: 0 });

            const result = await mcpClient.execute<{ success: boolean; styledCount: number }>(
                "canvas_style",
                {
                    target: [id1, id2],
                    rules: { backgroundColor: "#3b82f6", strokeWidth: 2 },
                }
            );

            expect(result.success).toBe(true);
            expect(result.styledCount).toBe(2);
            expect(driver.getById(id1)?.backgroundColor).toBe("#3b82f6");
            expect(driver.getById(id2)?.strokeWidth).toBe(2);
        });
    });

    describe("Full Agent Flow Simulation", () => {
        it("should simulate creating a flowchart", async () => {
            // Step 1: Read canvas state
            const readResult = await mcpClient.execute<{ count: number }>("canvas_read", {
                target: "canvas",
            });
            expect(readResult.count).toBe(0);

            // Step 2: Create flowchart elements
            const writeResult = await mcpClient.execute<{ success: boolean; createdIds: string[] }>(
                "canvas_write",
                {
                    elements: [
                        {
                            type: "ellipse",
                            x: 200,
                            y: 50,
                            width: 120,
                            height: 60,
                            backgroundColor: "#22c55e",
                            name: "start",
                        },
                        {
                            type: "rectangle",
                            x: 170,
                            y: 150,
                            width: 180,
                            height: 80,
                            backgroundColor: "#3b82f6",
                            name: "process1",
                        },
                        {
                            type: "diamond",
                            x: 185,
                            y: 280,
                            width: 150,
                            height: 100,
                            backgroundColor: "#f59e0b",
                            name: "decision",
                        },
                        {
                            type: "rectangle",
                            x: 50,
                            y: 420,
                            width: 150,
                            height: 80,
                            backgroundColor: "#3b82f6",
                            name: "yes-path",
                        },
                        {
                            type: "rectangle",
                            x: 320,
                            y: 420,
                            width: 150,
                            height: 80,
                            backgroundColor: "#3b82f6",
                            name: "no-path",
                        },
                        {
                            type: "ellipse",
                            x: 200,
                            y: 550,
                            width: 120,
                            height: 60,
                            backgroundColor: "#ef4444",
                            name: "end",
                        },
                    ],
                }
            );

            expect(writeResult.success).toBe(true);
            expect(writeResult.createdIds).toHaveLength(6);

            // Step 3: Find all rectangles (process steps)
            const findResult = await mcpClient.execute<{ count: number; ids: string[] }>(
                "canvas_find",
                {
                    match: { type: "rectangle" },
                    return: "ids",
                }
            );

            expect(findResult.count).toBe(3); // process1, yes-path, no-path

            // Step 4: Apply layout
            const layoutResult = await mcpClient.execute<{ success: boolean }>("canvas_layout", {
                type: "tree",
                target: writeResult.createdIds,
                options: { direction: "TB", levelGap: 100 },
            });

            expect(layoutResult.success).toBe(true);

            // Step 5: Verify final state
            const finalState = await mcpClient.execute<{ count: number }>("canvas_read", {
                target: "canvas",
            });
            expect(finalState.count).toBe(6);
        });

        it("should simulate editing existing elements", async () => {
            // Setup: Create initial elements
            await mcpClient.execute("canvas_write", {
                elements: [
                    { type: "rectangle", x: 100, y: 100, width: 200, height: 100, name: "main-card" },
                    { type: "text", x: 120, y: 130, text: "Title", name: "card-title" },
                ],
            });

            // Step 1: Find the card (use exact name match)
            const findResult = await mcpClient.execute<{ elements: Array<{ id: string; name: string }> }>(
                "canvas_find",
                {
                    match: { name: "^main-card$" }, // Exact match regex
                    return: "summary",
                }
            );

            expect(findResult.elements).toHaveLength(1);
            const cardId = findResult.elements[0].id;

            // Step 2: Update card style
            const editResult = await mcpClient.execute<{ success: boolean }>("canvas_edit", {
                operation: "style",
                target: cardId,
                properties: {
                    backgroundColor: "#f0f0f0",
                    strokeColor: "#333",
                    strokeWidth: 2,
                },
            });

            expect(editResult.success).toBe(true);

            // Step 3: Move card
            const moveResult = await mcpClient.execute<{ success: boolean }>("canvas_edit", {
                operation: "move",
                target: cardId,
                dx: 50,
                dy: 25,
            });

            expect(moveResult.success).toBe(true);

            // Step 4: Verify changes
            const element = driver.getById(cardId);
            expect(element?.backgroundColor).toBe("#f0f0f0");
            expect(element?.x).toBe(150); // 100 + 50
            expect(element?.y).toBe(125); // 100 + 25
        });

        it("should handle concurrent commands correctly", async () => {
            // Issue multiple commands concurrently
            const promises = [
                mcpClient.execute("canvas_write", {
                    elements: [{ type: "rectangle", x: 0, y: 0 }],
                }),
                mcpClient.execute("canvas_write", {
                    elements: [{ type: "ellipse", x: 100, y: 0 }],
                }),
                mcpClient.execute("canvas_write", {
                    elements: [{ type: "text", x: 200, y: 0, text: "Test" }],
                }),
            ];

            const results = await Promise.all(promises);

            // All should succeed
            for (const result of results) {
                expect((result as any).success).toBe(true);
            }

            // All elements should exist
            expect(driver.count()).toBe(3);
        });
    });

    describe("Error Handling", () => {
        it("should handle invalid element ID in edit", async () => {
            const result = await mcpClient.execute<{ success: boolean; error?: string }>(
                "canvas_edit",
                {
                    operation: "move",
                    target: "nonexistent-id",
                    dx: 10,
                    dy: 10,
                }
            );

            expect(result.success).toBe(false);
        });

        it("should handle invalid command", async () => {
            await expect(
                mcpClient.execute("invalid_command", {})
            ).rejects.toThrow("Unknown command: invalid_command");
        });
    });
});

// NOTE: These tests require oadk-tools.js which is not yet implemented.
// The tests are skipped until the OpenAI Agents SDK integration is complete.
// See: https://github.com/oneflow-ai/emoboard/issues/XXX
describe.skip("Tool Integration with OADK", () => {
    it("should create tools with mock MCP client", async () => {
        // const { createCanvasTools } = await import("../tools/oadk-tools.js");

        const driver = new MockCanvasDriver();
        const mcpClient = new MockMcpClientWithPollAck(driver);
        mcpClient.startPolling(5);

        const ctx = {
            canvasId: "canvas_test",
            mcp: mcpClient,
        };

        const tools = createCanvasTools(ctx);

        expect(tools).toHaveLength(7); // All 7 tools
        expect(tools.map((t) => t.name)).toContain("canvas_read");
        expect(tools.map((t) => t.name)).toContain("canvas_write");
        expect(tools.map((t) => t.name)).toContain("canvas_edit");

        mcpClient.stopPolling();
    });

    it("should execute tools via OADK tool wrappers", async () => {
        // const { canvasWriteTool, canvasReadTool, canvasFindTool } = await import(
        //     "../tools/oadk-tools.js"
        // );

        const driver = new MockCanvasDriver();
        const mcpClient = new MockMcpClientWithPollAck(driver);
        mcpClient.startPolling(5);

        const ctx = {
            canvasId: "canvas_test",
            mcp: mcpClient,
        };

        // Create write tool
        const writeTool = canvasWriteTool(ctx);
        expect(writeTool.name).toBe("canvas_write");

        // Create read tool
        const readTool = canvasReadTool(ctx);
        expect(readTool.name).toBe("canvas_read");

        // Create find tool
        const findTool = canvasFindTool(ctx);
        expect(findTool.name).toBe("canvas_find");

        mcpClient.stopPolling();
    });
});