/**
 * HTTP MCP Client
 *
 * Real HTTP client for connecting to the canvas-mcp server.
 * Replaces the mock implementation in agentic-loop.ts.
 *
 * Features:
 * - HTTP transport to canvas-mcp server
 * - Canvas ID binding via headers
 * - Health checking with exponential backoff retry
 * - Circuit breaker pattern for resilience
 * - Connection pooling ready
 */

import type { McpClient } from "../../agent-sdk/core/loop/types.js";

// ============================================================================
// Retry and Circuit Breaker Configuration
// ============================================================================

/**
 * Default retry configuration
 */
const DEFAULT_RETRY_CONFIG = {
  /** Maximum number of retry attempts */
  maxRetries: 4,
  /** Initial delay in milliseconds */
  initialDelayMs: 1000,
  /** Maximum delay in milliseconds */
  maxDelayMs: 16000,
  /** Multiplier for exponential backoff */
  backoffMultiplier: 2,
  /** Jitter factor (0-1) to add randomness */
  jitterFactor: 0.1,
} as const;

/**
 * Circuit breaker configuration
 */
const DEFAULT_CIRCUIT_BREAKER_CONFIG = {
  /** Number of failures before opening circuit */
  failureThreshold: 5,
  /** Time in ms before attempting to close circuit */
  resetTimeoutMs: 30000,
} as const;

/**
 * Retry configuration options
 */
export interface RetryConfig {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  jitterFactor?: number;
}

/**
 * Circuit breaker state
 */
type CircuitState = "closed" | "open" | "half-open";

/**
 * Configuration for HTTP MCP client
 */
export interface HttpMcpClientConfig {
  /** Base URL of canvas-mcp server (default: http://localhost:3112) */
  baseUrl?: string;
  /** Canvas ID to bind to (required) */
  canvasId: string;
  /** Request timeout in ms (default: 30000) */
  timeout?: number;
  /** Enable debug logging */
  debug?: boolean;
  /** Retry configuration */
  retry?: RetryConfig;
  /** Enable circuit breaker (default: true) */
  enableCircuitBreaker?: boolean;
}

/**
 * MCP tool result from server
 */
interface McpToolResult {
  content: Array<{ type: string; text: string }>;
  structuredContent?: Record<string, unknown>;
}

/**
 * MCP resource content from server
 */
interface McpResourceContent {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
}

/**
 * Sleep for a given duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateBackoffDelay(
  attempt: number,
  config: Required<RetryConfig>
): number {
  const exponentialDelay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt);
  const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);

  // Add jitter to prevent thundering herd
  const jitter = cappedDelay * config.jitterFactor * Math.random();
  return Math.floor(cappedDelay + jitter);
}

/**
 * HTTP MCP Client
 *
 * Connects to canvas-mcp server via HTTP for tool execution.
 * Includes exponential backoff retry and circuit breaker for resilience.
 */
export class HttpMcpClient implements McpClient {
  private baseUrl: string;
  private canvasId: string;
  private timeout: number;
  private debug: boolean;
  private connected = false;

  // Retry configuration
  private retryConfig: Required<RetryConfig>;

  // Circuit breaker state
  private enableCircuitBreaker: boolean;
  private circuitState: CircuitState = "closed";
  private failureCount = 0;
  private lastFailureTime = 0;

  constructor(config: HttpMcpClientConfig) {
    this.baseUrl = config.baseUrl || process.env.CANVAS_MCP_URL || "http://localhost:3112";
    this.canvasId = config.canvasId;
    this.timeout = config.timeout || 30000;
    this.debug = config.debug || false;
    this.enableCircuitBreaker = config.enableCircuitBreaker ?? true;

    // Merge retry config with defaults
    this.retryConfig = {
      maxRetries: config.retry?.maxRetries ?? DEFAULT_RETRY_CONFIG.maxRetries,
      initialDelayMs: config.retry?.initialDelayMs ?? DEFAULT_RETRY_CONFIG.initialDelayMs,
      maxDelayMs: config.retry?.maxDelayMs ?? DEFAULT_RETRY_CONFIG.maxDelayMs,
      backoffMultiplier: config.retry?.backoffMultiplier ?? DEFAULT_RETRY_CONFIG.backoffMultiplier,
      jitterFactor: config.retry?.jitterFactor ?? DEFAULT_RETRY_CONFIG.jitterFactor,
    };
  }

  /**
   * Check if client is connected (health check passed)
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Get current circuit breaker state
   */
  getCircuitState(): CircuitState {
    return this.circuitState;
  }

  /**
   * Check if circuit breaker allows requests
   */
  private canMakeRequest(): boolean {
    if (!this.enableCircuitBreaker) return true;

    switch (this.circuitState) {
      case "closed":
        return true;
      case "open":
        // Check if reset timeout has passed
        const timeSinceFailure = Date.now() - this.lastFailureTime;
        if (timeSinceFailure >= DEFAULT_CIRCUIT_BREAKER_CONFIG.resetTimeoutMs) {
          this.circuitState = "half-open";
          this.log("Circuit breaker: transitioning to half-open");
          return true;
        }
        return false;
      case "half-open":
        return true;
    }
  }

  /**
   * Record a successful request for circuit breaker
   */
  private recordSuccess(): void {
    if (!this.enableCircuitBreaker) return;

    if (this.circuitState === "half-open") {
      this.circuitState = "closed";
      this.failureCount = 0;
      this.log("Circuit breaker: closed (recovered)");
    }
  }

  /**
   * Record a failed request for circuit breaker
   */
  private recordFailure(): void {
    if (!this.enableCircuitBreaker) return;

    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.circuitState === "half-open") {
      this.circuitState = "open";
      this.log("Circuit breaker: opened (half-open test failed)");
    } else if (this.failureCount >= DEFAULT_CIRCUIT_BREAKER_CONFIG.failureThreshold) {
      this.circuitState = "open";
      this.log(`Circuit breaker: opened (${this.failureCount} failures)`);
    }
  }

  /**
   * Connect to the MCP server with exponential backoff retry
   */
  async connect(): Promise<boolean> {
    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        // Check circuit breaker
        if (!this.canMakeRequest()) {
          this.log("Circuit breaker is open, skipping connection attempt");
          return false;
        }

        const healthUrl = this.baseUrl.replace(/\/mcp$/, "") + "/health";
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(healthUrl, {
          signal: controller.signal,
        }).finally(() => clearTimeout(timeoutId));

        if (!response.ok) {
          this.log(`Health check failed: ${response.status}`);
          this.recordFailure();

          if (attempt < this.retryConfig.maxRetries) {
            const delay = calculateBackoffDelay(attempt, this.retryConfig);
            this.log(`Retrying in ${delay}ms (attempt ${attempt + 1}/${this.retryConfig.maxRetries})`);
            await sleep(delay);
            continue;
          }
          return false;
        }

        const data = await response.json();
        if (data.status === "ok") {
          this.connected = true;
          this.recordSuccess();
          this.log(`Connected to canvas-mcp at ${this.baseUrl}`);
          return true;
        }

        return false;
      } catch (error) {
        this.log(`Connection attempt ${attempt + 1} failed: ${error}`);
        this.recordFailure();

        if (attempt < this.retryConfig.maxRetries) {
          const delay = calculateBackoffDelay(attempt, this.retryConfig);
          this.log(`Retrying in ${delay}ms (attempt ${attempt + 1}/${this.retryConfig.maxRetries})`);
          await sleep(delay);
        }
      }
    }

    this.log(`Failed to connect after ${this.retryConfig.maxRetries + 1} attempts`);
    return false;
  }

  /**
   * Check if an error is retryable
   */
  private isRetryableError(error: unknown): boolean {
    if (error instanceof Error) {
      // Network errors are retryable
      if (error.name === "TypeError" && error.message.includes("fetch")) {
        return true;
      }
      // Timeout errors are retryable
      if (error.name === "TimeoutError" || error.name === "AbortError") {
        return true;
      }
      // Connection refused is retryable
      if (error.message.includes("ECONNREFUSED") || error.message.includes("ECONNRESET")) {
        return true;
      }
      // 5xx server errors are retryable
      if (error.message.includes("5") && /\b5\d{2}\b/.test(error.message)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Execute a canvas tool via HTTP with retry
   */
  async execute<T>(tool: string, args: Record<string, unknown>): Promise<T> {
    // Check circuit breaker
    if (!this.canMakeRequest()) {
      throw new Error(
        `Circuit breaker is open. MCP server at ${this.baseUrl} appears to be unavailable. ` +
          `Will retry automatically in ${Math.ceil(DEFAULT_CIRCUIT_BREAKER_CONFIG.resetTimeoutMs / 1000)}s.`
      );
    }

    // Auto-connect if not connected
    if (!this.connected) {
      const connected = await this.connect();
      if (!connected) {
        throw new Error(
          `Canvas MCP server not available at ${this.baseUrl}. ` +
            `Start the server with: pnpm --filter @waiboard/canvas-mcp start:http`
        );
      }
    }

    const mcpUrl = this.baseUrl.endsWith("/mcp")
      ? this.baseUrl
      : `${this.baseUrl}/mcp`;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        this.log(`Executing ${tool} (attempt ${attempt + 1}):`, args);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        const response = await fetch(mcpUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json, text/event-stream",
            "X-Canvas-Id": this.canvasId,
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: crypto.randomUUID(),
            method: "tools/call",
            params: {
              name: tool,
              arguments: args,
            },
          }),
          signal: controller.signal,
        }).finally(() => clearTimeout(timeoutId));

        if (!response.ok) {
          const errorText = await response.text();
          const error = new Error(`MCP request failed: ${response.status} - ${errorText}`);

          // 5xx errors are retryable
          if (response.status >= 500 && response.status < 600) {
            this.recordFailure();
            if (attempt < this.retryConfig.maxRetries) {
              const delay = calculateBackoffDelay(attempt, this.retryConfig);
              this.log(`Server error, retrying in ${delay}ms`);
              await sleep(delay);
              continue;
            }
          }

          throw error;
        }

        const result = await response.json();

        // Handle JSON-RPC error
        if (result.error) {
          throw new Error(`MCP error: ${result.error.message || JSON.stringify(result.error)}`);
        }

        // Success - record for circuit breaker
        this.recordSuccess();

        // Parse result content
        const mcpResult = result.result as McpToolResult;
        if (mcpResult.structuredContent) {
          return mcpResult.structuredContent as T;
        }

        // Parse text content
        if (mcpResult.content?.[0]?.text) {
          try {
            return JSON.parse(mcpResult.content[0].text) as T;
          } catch {
            return mcpResult.content[0].text as T;
          }
        }

        return result.result as T;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.recordFailure();

        // Check if error is retryable
        if (this.isRetryableError(error) && attempt < this.retryConfig.maxRetries) {
          const delay = calculateBackoffDelay(attempt, this.retryConfig);
          this.log(`Retryable error, retrying in ${delay}ms: ${lastError.message}`);
          await sleep(delay);
          continue;
        }

        // Timeout error with better message
        if (lastError.name === "TimeoutError") {
          throw new Error(`MCP request timed out after ${this.timeout}ms`);
        }

        throw lastError;
      }
    }

    // Should not reach here, but just in case
    throw lastError || new Error("Unknown error during MCP execution");
  }

  /**
   * Read an MCP resource via HTTP
   *
   * @param uri - Resource URI (e.g., resource://canvas/my-canvas/snapshot)
   * @returns Parsed resource content
   */
  async readResource<T>(uri: string): Promise<T> {
    // Check circuit breaker
    if (!this.canMakeRequest()) {
      throw new Error(
        `Circuit breaker is open. MCP server at ${this.baseUrl} appears to be unavailable.`
      );
    }

    // Auto-connect if not connected
    if (!this.connected) {
      const connected = await this.connect();
      if (!connected) {
        throw new Error(
          `Canvas MCP server not available at ${this.baseUrl}. ` +
            `Start the server with: pnpm --filter @waiboard/canvas-mcp start:http`
        );
      }
    }

    const mcpUrl = this.baseUrl.endsWith("/mcp")
      ? this.baseUrl
      : `${this.baseUrl}/mcp`;

    this.log(`Reading resource: ${uri}`);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(mcpUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-Canvas-Id": this.canvasId,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: crypto.randomUUID(),
          method: "resources/read",
          params: {
            uri,
          },
        }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutId));

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`MCP resource read failed: ${response.status} - ${errorText}`);
      }

      const result = await response.json();

      // Handle JSON-RPC error
      if (result.error) {
        throw new Error(`MCP error: ${result.error.message || JSON.stringify(result.error)}`);
      }

      // Success - record for circuit breaker
      this.recordSuccess();

      // Parse resource content
      const contents = result.result?.contents as McpResourceContent[];
      if (contents?.[0]?.text) {
        try {
          return JSON.parse(contents[0].text) as T;
        } catch {
          return contents[0].text as T;
        }
      }

      return result.result as T;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  /**
   * Disconnect from the MCP server
   */
  disconnect(): void {
    this.connected = false;
    this.log("Disconnected from canvas-mcp");
  }

  /**
   * Reset circuit breaker state (for testing or manual recovery)
   */
  resetCircuitBreaker(): void {
    this.circuitState = "closed";
    this.failureCount = 0;
    this.lastFailureTime = 0;
    this.log("Circuit breaker reset");
  }

  /**
   * Get retry statistics
   */
  getStats(): {
    connected: boolean;
    circuitState: CircuitState;
    failureCount: number;
    lastFailureTime: number;
  } {
    return {
      connected: this.connected,
      circuitState: this.circuitState,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
    };
  }

  private log(...args: unknown[]): void {
    if (this.debug) {
      console.log("[HttpMcpClient]", ...args);
    }
  }
}

/**
 * Create an HTTP MCP client
 */
export function createHttpMcpClient(config: HttpMcpClientConfig): HttpMcpClient {
  return new HttpMcpClient(config);
}

/**
 * Check if canvas MCP server is healthy
 */
export async function checkMcpHealth(
  baseUrl: string = process.env.CANVAS_MCP_URL || "http://localhost:3112"
): Promise<boolean> {
  try {
    const healthUrl = baseUrl.replace(/\/mcp$/, "") + "/health";
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(healthUrl, {
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));

    if (!response.ok) return false;

    const data = await response.json();
    return data.status === "ok";
  } catch {
    return false;
  }
}
