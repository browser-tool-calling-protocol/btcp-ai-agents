/**
 * BTCP Agent Client
 *
 * Client for AI agents to communicate with browser tools via BTCP protocol.
 * Connects to a BTCP server and provides a simple interface for tool execution.
 *
 * @see https://github.com/browser-tool-calling-protocol/btcp-client
 */

import {
  BTCPClientConfig,
  BTCPConnectionState,
  BTCPToolDefinition,
  BTCPToolCallParams,
  BTCPToolResult,
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
 * BTCP Agent Client
 *
 * Provides a high-level interface for AI agents to:
 * 1. Connect to BTCP server
 * 2. Discover available browser tools
 * 3. Execute tool calls and receive results
 */
export class BTCPAgentClient {
  private config: Required<BTCPClientConfig>;
  private state: BTCPConnectionState = "disconnected";
  private eventSource: EventSource | null = null;
  private tools: BTCPToolDefinition[] = [];
  private pendingRequests: Map<
    string | number,
    {
      resolve: (result: BTCPToolResult) => void;
      reject: (error: Error) => void;
      timeout: NodeJS.Timeout;
    }
  > = new Map();

  constructor(config: BTCPClientConfig) {
    this.config = {
      serverUrl: config.serverUrl,
      sessionId: config.sessionId ?? generateSessionId(),
      clientType: config.clientType ?? "agent",
      timeout: config.timeout ?? 30000,
      debug: config.debug ?? false,
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
   * Get available tools from browser
   */
  getTools(): BTCPToolDefinition[] {
    return [...this.tools];
  }

  /**
   * Check if a tool is available
   */
  hasTool(name: string): boolean {
    return this.tools.some((t) => t.name === name);
  }

  /**
   * Connect to BTCP server
   */
  async connect(): Promise<boolean> {
    if (this.state === "connected") {
      return true;
    }

    this.state = "connecting";
    this.log("Connecting to BTCP server...");

    try {
      // First, fetch available tools
      await this.refreshTools();

      // Then establish SSE connection for receiving tool results
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
   * Disconnect from server
   */
  disconnect(): void {
    this.log("Disconnecting...");

    // Close SSE connection
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    // Reject all pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new BTCPError(BTCPErrorCodes.BROWSER_DISCONNECTED, "Client disconnected"));
      this.pendingRequests.delete(id);
    }

    this.state = "disconnected";
    this.tools = [];
    this.log("Disconnected");
  }

  /**
   * Refresh available tools from server
   */
  async refreshTools(): Promise<BTCPToolDefinition[]> {
    const response = await this.sendRequest<{ tools: BTCPToolDefinition[] }>(
      "tools/list",
      {}
    );
    this.tools = response.tools;
    this.log(`Discovered ${this.tools.length} tools:`, this.tools.map((t) => t.name));
    return this.tools;
  }

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
        "Not connected to BTCP server"
      );
    }

    if (!this.hasTool(name)) {
      throw new BTCPError(
        BTCPErrorCodes.TOOL_NOT_FOUND,
        `Tool '${name}' not found. Available tools: ${this.tools.map((t) => t.name).join(", ")}`
      );
    }

    const timeout = options?.timeout ?? this.config.timeout;
    const retries = options?.retries ?? 0;

    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await this.executeToolCall(name, args, timeout);
      } catch (error) {
        lastError = error as Error;
        if (attempt < retries) {
          this.log(`Tool call failed, retrying (${attempt + 1}/${retries})...`);
          await this.delay(1000 * (attempt + 1)); // Exponential backoff
        }
      }
    }

    throw lastError;
  }

  /**
   * Generate tool documentation for AI prompt
   */
  generateToolDocs(): string {
    if (this.tools.length === 0) {
      return "No browser tools available.";
    }

    const docs = this.tools.map((tool) => {
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
  // PRIVATE METHODS
  // ===========================================================================

  private async establishSSE(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = `${this.config.serverUrl}/events?sessionId=${this.config.sessionId}&clientType=${this.config.clientType}`;

      // In Node.js environment, we might need to use a polyfill
      // For now, we'll use fetch-based polling as fallback
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

      // Timeout for connection
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
          message.error.code as any,
          message.error.message,
          message.error.data
        )
      );
    } else {
      pending.resolve(message.result as BTCPToolResult);
    }
  }

  private async executeToolCall(
    name: string,
    args: Record<string, unknown>,
    timeout: number
  ): Promise<BTCPToolResult> {
    const requestId = generateRequestId();
    const request = createJsonRpcRequest<BTCPToolCallParams>("tools/call", {
      name,
      arguments: args,
    }, requestId);

    return new Promise((resolve, reject) => {
      // Set timeout
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new BTCPError(BTCPErrorCodes.TIMEOUT, `Tool call '${name}' timed out`));
      }, timeout);

      // Store pending request
      this.pendingRequests.set(requestId, { resolve, reject, timeout: timeoutId });

      // Send request
      this.sendMessage(request).catch((error) => {
        clearTimeout(timeoutId);
        this.pendingRequests.delete(requestId);
        reject(error);
      });
    });
  }

  private async sendMessage(message: JsonRpcRequest): Promise<void> {
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

    const data = await response.json() as JsonRpcResponse<T> | JsonRpcErrorResponse;

    if (isJsonRpcError(data)) {
      throw new BTCPError(
        data.error.code as any,
        data.error.message,
        data.error.data
      );
    }

    return data.result;
  }

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
 */
export function createBTCPClient(config: BTCPClientConfig): BTCPAgentClient {
  return new BTCPAgentClient(config);
}
