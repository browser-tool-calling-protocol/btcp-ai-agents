/**
 * BTCP Agent Client
 *
 * Client for AI agents to communicate with browser tools via BTCP protocol.
 * Supports both local (same context) and remote (server) communication.
 *
 * In local mode, tools are registered directly and executed synchronously.
 * In remote mode, communicates via HTTP/SSE with a BTCP server.
 *
 * @see https://github.com/browser-tool-calling-protocol/btcp-client
 */

import {
  BTCPClientConfig,
  BTCPConnectionState,
  BTCPToolDefinition,
  BTCPToolCallParams,
  BTCPToolResult,
  BTCPToolResultContent,
  BTCPToolCallOptions,
  BTCPError,
  BTCPErrorCodes,
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcErrorResponse,
  createJsonRpcRequest,
  isJsonRpcError,
  generateSessionId,
  generateRequestId,
} from "./types.js";

/**
 * Tool handler function type
 */
export type ToolHandler = (
  args: Record<string, unknown>
) => Promise<BTCPToolResult> | BTCPToolResult;

/**
 * Local tool registration
 */
interface LocalTool {
  definition: BTCPToolDefinition;
  handler: ToolHandler;
}

/**
 * BTCP Agent Client
 *
 * Provides a high-level interface for AI agents to:
 * 1. Register browser tools locally (same context)
 * 2. Or connect to a remote BTCP server
 * 3. Execute tool calls and receive results
 */
export class BTCPAgentClient {
  private config: {
    serverUrl?: string;
    sessionId: string;
    clientType: "agent" | "browser";
    timeout: number;
    debug: boolean;
    mode: "local" | "remote";
  };
  private state: BTCPConnectionState = "disconnected";
  private eventSource: EventSource | null = null;

  // Local mode: tools registered directly
  private localTools: Map<string, LocalTool> = new Map();

  // Remote mode: tools discovered from server
  private remoteTools: BTCPToolDefinition[] = [];

  private pendingRequests: Map<
    string | number,
    {
      resolve: (result: BTCPToolResult) => void;
      reject: (error: Error) => void;
      timeout: ReturnType<typeof setTimeout>;
    }
  > = new Map();

  constructor(config: BTCPClientConfig = {}) {
    this.config = {
      serverUrl: config.serverUrl,
      sessionId: config.sessionId ?? generateSessionId(),
      clientType: config.clientType ?? "agent",
      timeout: config.timeout ?? 30000,
      debug: config.debug ?? false,
      // Auto-detect mode: local if no serverUrl provided
      mode: config.serverUrl ? "remote" : "local",
    };
  }

  /**
   * Get current connection state
   */
  getState(): BTCPConnectionState {
    return this.state;
  }

  /**
   * Get session ID
   */
  getSessionId(): string {
    return this.config.sessionId;
  }

  /**
   * Check if running in local mode
   */
  isLocalMode(): boolean {
    return this.config.mode === "local";
  }

  /**
   * Get available tools (from local registry or remote server)
   */
  getTools(): BTCPToolDefinition[] {
    if (this.config.mode === "local") {
      return Array.from(this.localTools.values()).map((t) => t.definition);
    }
    return [...this.remoteTools];
  }

  /**
   * Check if a tool is available
   */
  hasTool(name: string): boolean {
    if (this.config.mode === "local") {
      return this.localTools.has(name);
    }
    return this.remoteTools.some((t) => t.name === name);
  }

  // ===========================================================================
  // LOCAL MODE: Direct tool registration
  // ===========================================================================

  /**
   * Register a tool locally (for same-context communication)
   */
  registerTool(definition: BTCPToolDefinition, handler: ToolHandler): void {
    this.localTools.set(definition.name, { definition, handler });
    this.log(`Registered local tool: ${definition.name}`);
  }

  /**
   * Register multiple tools at once
   */
  registerTools(
    tools: Array<{ definition: BTCPToolDefinition; handler: ToolHandler }>
  ): void {
    for (const tool of tools) {
      this.registerTool(tool.definition, tool.handler);
    }
  }

  /**
   * Unregister a tool
   */
  unregisterTool(name: string): boolean {
    const removed = this.localTools.delete(name);
    if (removed) {
      this.log(`Unregistered local tool: ${name}`);
    }
    return removed;
  }

  /**
   * Clear all registered tools
   */
  clearTools(): void {
    this.localTools.clear();
    this.log("Cleared all local tools");
  }

  // ===========================================================================
  // CONNECTION
  // ===========================================================================

  /**
   * Connect (local mode: instant, remote mode: connects to server)
   */
  async connect(): Promise<boolean> {
    if (this.state === "connected") {
      return true;
    }

    this.state = "connecting";

    if (this.config.mode === "local") {
      // Local mode: instantly connected
      this.state = "connected";
      this.log("Connected (local mode)");
      return true;
    }

    // Remote mode: connect to server
    this.log("Connecting to BTCP server...");

    try {
      await this.refreshTools();
      await this.establishSSE();
      this.state = "connected";
      this.log("Connected to BTCP server");
      return true;
    } catch (error) {
      this.state = "error";
      this.log("Connection failed:", error);
      return false;
    }
  }

  /**
   * Disconnect
   */
  disconnect(): void {
    this.log("Disconnecting...");

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(
        new BTCPError(BTCPErrorCodes.BROWSER_DISCONNECTED, "Client disconnected")
      );
      this.pendingRequests.delete(id);
    }

    this.state = "disconnected";
    this.remoteTools = [];
    this.log("Disconnected");
  }

  /**
   * Refresh available tools (remote mode only)
   */
  async refreshTools(): Promise<BTCPToolDefinition[]> {
    if (this.config.mode === "local") {
      return this.getTools();
    }

    const response = await this.sendRequest<{ tools: BTCPToolDefinition[] }>(
      "tools/list",
      {}
    );
    this.remoteTools = response.tools;
    this.log(
      `Discovered ${this.remoteTools.length} tools:`,
      this.remoteTools.map((t) => t.name)
    );
    return this.remoteTools;
  }

  // ===========================================================================
  // TOOL EXECUTION
  // ===========================================================================

  /**
   * Execute a tool call
   */
  async callTool(
    name: string,
    args: Record<string, unknown>,
    options?: BTCPToolCallOptions
  ): Promise<BTCPToolResult> {
    if (this.state !== "connected") {
      throw new BTCPError(
        BTCPErrorCodes.BROWSER_DISCONNECTED,
        "Not connected"
      );
    }

    if (!this.hasTool(name)) {
      const available = this.getTools().map((t) => t.name);
      throw new BTCPError(
        BTCPErrorCodes.TOOL_NOT_FOUND,
        `Tool '${name}' not found. Available: ${available.join(", ")}`
      );
    }

    const timeout = options?.timeout ?? this.config.timeout;
    const retries = options?.retries ?? 0;

    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        if (this.config.mode === "local") {
          return await this.executeLocalTool(name, args, timeout);
        } else {
          return await this.executeRemoteTool(name, args, timeout);
        }
      } catch (error) {
        lastError = error as Error;
        if (attempt < retries) {
          this.log(`Tool call failed, retrying (${attempt + 1}/${retries})...`);
          await this.delay(1000 * (attempt + 1));
        }
      }
    }

    throw lastError;
  }

  /**
   * Execute a local tool directly
   */
  private async executeLocalTool(
    name: string,
    args: Record<string, unknown>,
    timeout: number
  ): Promise<BTCPToolResult> {
    const tool = this.localTools.get(name);
    if (!tool) {
      throw new BTCPError(BTCPErrorCodes.TOOL_NOT_FOUND, `Tool '${name}' not found`);
    }

    this.log(`Executing local tool: ${name}`, args);

    // Execute with timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new BTCPError(BTCPErrorCodes.TIMEOUT, `Tool '${name}' timed out`));
      }, timeout);
    });

    try {
      const result = await Promise.race([
        Promise.resolve(tool.handler(args)),
        timeoutPromise,
      ]);
      this.log(`Tool ${name} completed:`, result);
      return result;
    } catch (error) {
      if (error instanceof BTCPError) {
        throw error;
      }
      // Wrap non-BTCP errors
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: `Error: ${message}` }],
        isError: true,
      };
    }
  }

  /**
   * Execute a remote tool via server
   */
  private async executeRemoteTool(
    name: string,
    args: Record<string, unknown>,
    timeout: number
  ): Promise<BTCPToolResult> {
    const requestId = generateRequestId();
    const request = createJsonRpcRequest<BTCPToolCallParams>(
      "tools/call",
      { name, arguments: args },
      requestId
    );

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new BTCPError(BTCPErrorCodes.TIMEOUT, `Tool '${name}' timed out`));
      }, timeout);

      this.pendingRequests.set(requestId, { resolve, reject, timeout: timeoutId });

      this.sendMessage(request).catch((error) => {
        clearTimeout(timeoutId);
        this.pendingRequests.delete(requestId);
        reject(error);
      });
    });
  }

  // ===========================================================================
  // DOCUMENTATION
  // ===========================================================================

  /**
   * Generate tool documentation for AI prompt
   */
  generateToolDocs(): string {
    const tools = this.getTools();
    if (tools.length === 0) {
      return "No browser tools available.";
    }

    const docs = tools.map((tool) => {
      const props = tool.inputSchema.properties ?? {};
      const required = tool.inputSchema.required ?? [];

      const params = Object.entries(props)
        .map(([name, schema]) => {
          const isRequired = required.includes(name);
          const desc = schema.description ?? "";
          return `  - ${name}${isRequired ? " (required)" : ""}: ${desc}`;
        })
        .join("\n");

      return `### ${tool.name}\n${tool.description}\n\nParameters:\n${params || "  (none)"}`;
    });

    return `## Available Browser Tools\n\n${docs.join("\n\n")}`;
  }

  // ===========================================================================
  // REMOTE MODE: SSE & HTTP
  // ===========================================================================

  private async establishSSE(): Promise<void> {
    if (!this.config.serverUrl) {
      throw new Error("Server URL required for remote mode");
    }

    return new Promise((resolve, reject) => {
      const url = `${this.config.serverUrl}/events?sessionId=${this.config.sessionId}&clientType=${this.config.clientType}`;

      if (typeof EventSource === "undefined") {
        this.log("EventSource not available, using polling mode");
        resolve();
        return;
      }

      this.eventSource = new EventSource(url);

      this.eventSource.onopen = () => {
        this.log("SSE connection established");
        resolve();
      };

      this.eventSource.onerror = (event) => {
        this.log("SSE error:", event);
        if (this.state === "connecting") {
          reject(new Error("Failed to establish SSE connection"));
        }
      };

      this.eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleSSEMessage(data);
        } catch (error) {
          this.log("Failed to parse SSE message:", error);
        }
      };

      setTimeout(() => {
        if (this.state === "connecting") {
          reject(new Error("Connection timeout"));
        }
      }, this.config.timeout);
    });
  }

  private handleSSEMessage(message: JsonRpcResponse | JsonRpcErrorResponse): void {
    const id = message.id;
    const pending = this.pendingRequests.get(id);

    if (!pending) {
      this.log("Received response for unknown request:", id);
      return;
    }

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(id);

    if (isJsonRpcError(message)) {
      pending.reject(
        new BTCPError(
          message.error.code as BTCPErrorCodes[keyof BTCPErrorCodes],
          message.error.message,
          message.error.data
        )
      );
    } else {
      pending.resolve(message.result as BTCPToolResult);
    }
  }

  private async sendMessage(message: JsonRpcRequest): Promise<void> {
    if (!this.config.serverUrl) {
      throw new Error("Server URL required for remote mode");
    }

    const url = `${this.config.serverUrl}/message`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Session-Id": this.config.sessionId,
        "X-Client-Type": this.config.clientType,
      },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
    }
  }

  private async sendRequest<T>(method: string, params: unknown): Promise<T> {
    if (!this.config.serverUrl) {
      throw new Error("Server URL required for remote mode");
    }

    const url = `${this.config.serverUrl}/message`;
    const request = createJsonRpcRequest(method, params);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Session-Id": this.config.sessionId,
        "X-Client-Type": this.config.clientType,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as JsonRpcResponse<T> | JsonRpcErrorResponse;

    if (isJsonRpcError(data)) {
      throw new BTCPError(
        data.error.code as BTCPErrorCodes[keyof BTCPErrorCodes],
        data.error.message,
        data.error.data
      );
    }

    return data.result;
  }

  // ===========================================================================
  // UTILITIES
  // ===========================================================================

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private log(...args: unknown[]): void {
    if (this.config.debug) {
      console.log("[BTCPAgentClient]", ...args);
    }
  }
}

/**
 * Create a new BTCP agent client
 *
 * @example Local mode (same context)
 * ```typescript
 * const client = createBTCPClient(); // No serverUrl = local mode
 * client.registerTool(
 *   { name: 'click', description: 'Click element', inputSchema: {...} },
 *   async (args) => ({ content: [{ type: 'text', text: 'Clicked!' }] })
 * );
 * await client.connect();
 * const result = await client.callTool('click', { selector: '#btn' });
 * ```
 *
 * @example Remote mode (server)
 * ```typescript
 * const client = createBTCPClient({ serverUrl: 'http://localhost:8765' });
 * await client.connect();
 * const result = await client.callTool('click', { selector: '#btn' });
 * ```
 */
export function createBTCPClient(config?: BTCPClientConfig): BTCPAgentClient {
  return new BTCPAgentClient(config);
}

/**
 * Create a local BTCP client with tools pre-registered
 *
 * @example
 * ```typescript
 * const client = createLocalBTCPClient([
 *   {
 *     definition: { name: 'screenshot', description: '...', inputSchema: {...} },
 *     handler: async () => ({ content: [{ type: 'image', data: '...', mimeType: 'image/png' }] })
 *   }
 * ]);
 * await client.connect();
 * ```
 */
export function createLocalBTCPClient(
  tools: Array<{ definition: BTCPToolDefinition; handler: ToolHandler }>,
  options?: Omit<BTCPClientConfig, "serverUrl">
): BTCPAgentClient {
  const client = new BTCPAgentClient({ ...options, serverUrl: undefined });
  client.registerTools(tools);
  return client;
}
