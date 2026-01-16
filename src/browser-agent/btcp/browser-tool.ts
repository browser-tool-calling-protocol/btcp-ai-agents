/**
 * Browser Tool Factory
 *
 * Creates a single "browser" tool for AI agents that proxies tool calls
 * to the browser via BTCP protocol.
 *
 * This replaces the hardcoded canvas tools with a dynamic tool interface
 * where the browser defines what tools are available.
 */

import { z } from "zod";
import { BTCPAgentClient } from "./client.js";
import {
  BrowserToolInput,
  BrowserToolInputSchema,
  BrowserToolResult,
  BTCPToolDefinition,
  BTCPError,
  BTCPErrorCodes,
} from "./types.js";

/**
 * Browser tool options
 */
export interface BrowserToolOptions {
  /** BTCP client instance */
  client: BTCPAgentClient;
  /** Enable debug logging */
  debug?: boolean;
  /** Hook called before tool execution */
  onBeforeCall?: (toolName: string, args: Record<string, unknown>) => Promise<void> | void;
  /** Hook called after tool execution */
  onAfterCall?: (toolName: string, result: BrowserToolResult, duration: number) => Promise<void> | void;
}

/**
 * AI SDK tool interface
 */
export interface AISDKTool {
  description: string;
  parameters: z.ZodType<any>;
  execute: (input: any) => Promise<any>;
}

/**
 * Create the browser tool for AI agents
 *
 * This creates a single tool that:
 * 1. Accepts a tool name and arguments
 * 2. Validates the tool exists in the browser
 * 3. Executes via BTCP protocol
 * 4. Returns structured results
 *
 * @example
 * ```typescript
 * const client = createBTCPClient({ serverUrl: "http://localhost:8765" });
 * await client.connect();
 *
 * const browserTool = createBrowserTool({ client });
 *
 * // Use in AI SDK
 * const tools = { browser: browserTool };
 * ```
 */
export function createBrowserTool(options: BrowserToolOptions): AISDKTool {
  const { client, debug = false, onBeforeCall, onAfterCall } = options;

  const log = (...args: unknown[]) => {
    if (debug) {
      console.log("[BrowserTool]", ...args);
    }
  };

  /**
   * Build dynamic description including available tools
   */
  const buildDescription = (): string => {
    const tools = client.getTools();

    if (tools.length === 0) {
      return `Execute browser tools via BTCP protocol.

No tools currently available. The browser may not be connected.

Input:
- tool: Name of the browser tool to execute
- arguments: Object containing tool-specific arguments`;
    }

    const toolList = tools
      .map((t) => `  - ${t.name}: ${t.description}`)
      .join("\n");

    return `Execute browser tools via BTCP protocol.

Available browser tools:
${toolList}

Input:
- tool: Name of the browser tool to execute (one of the above)
- arguments: Object containing tool-specific arguments (see tool descriptions)

Example:
browser({ tool: "click", arguments: { selector: "#submit-button" } })`;
  };

  /**
   * Execute a browser tool call
   */
  const execute = async (input: BrowserToolInput): Promise<BrowserToolResult> => {
    const startTime = Date.now();
    log(`Executing tool: ${input.tool}`, input.arguments);

    try {
      // Validate connection
      if (client.getState() !== "connected") {
        return {
          success: false,
          content: [{ type: "text", text: "Browser not connected" }],
          error: {
            code: "BROWSER_DISCONNECTED",
            message: "The browser is not connected to the BTCP server",
            recoverable: true,
          },
        };
      }

      // Validate tool exists
      if (!client.hasTool(input.tool)) {
        const available = client.getTools().map((t) => t.name);
        return {
          success: false,
          content: [
            {
              type: "text",
              text: `Tool '${input.tool}' not found. Available tools: ${available.join(", ")}`,
            },
          ],
          error: {
            code: "TOOL_NOT_FOUND",
            message: `Tool '${input.tool}' is not available`,
            recoverable: false,
          },
        };
      }

      // Pre-call hook
      if (onBeforeCall) {
        await onBeforeCall(input.tool, input.arguments);
      }

      // Execute via BTCP
      const result = await client.callTool(input.tool, input.arguments);
      const duration = Date.now() - startTime;

      log(`Tool completed in ${duration}ms:`, result);

      const browserResult: BrowserToolResult = {
        success: !result.isError,
        content: result.content,
        metadata: {
          toolName: input.tool,
          duration,
        },
      };

      if (result.isError) {
        browserResult.error = {
          code: "TOOL_EXECUTION_ERROR",
          message: result.content
            .filter((c) => c.type === "text")
            .map((c) => (c as { type: "text"; text: string }).text)
            .join("\n"),
          recoverable: true,
        };
      }

      // Post-call hook
      if (onAfterCall) {
        await onAfterCall(input.tool, browserResult, duration);
      }

      return browserResult;
    } catch (error) {
      const duration = Date.now() - startTime;
      log(`Tool failed after ${duration}ms:`, error);

      const browserResult: BrowserToolResult = {
        success: false,
        content: [
          {
            type: "text",
            text: error instanceof Error ? error.message : "Unknown error",
          },
        ],
        error: {
          code: error instanceof BTCPError ? String(error.code) : "UNKNOWN_ERROR",
          message: error instanceof Error ? error.message : "Unknown error",
          recoverable: error instanceof BTCPError && error.code !== BTCPErrorCodes.TOOL_NOT_FOUND,
        },
        metadata: {
          toolName: input.tool,
          duration,
        },
      };

      if (onAfterCall) {
        await onAfterCall(input.tool, browserResult, duration);
      }

      return browserResult;
    }
  };

  return {
    description: buildDescription(),
    parameters: BrowserToolInputSchema,
    execute,
  };
}

/**
 * Create a tool set with just the browser tool
 *
 * @example
 * ```typescript
 * const client = createBTCPClient({ serverUrl: "http://localhost:8765" });
 * await client.connect();
 *
 * const tools = createBrowserToolSet(client);
 * // tools = { browser: <AISDKTool> }
 * ```
 */
export function createBrowserToolSet(
  client: BTCPAgentClient,
  options?: Omit<BrowserToolOptions, "client">
): Record<string, AISDKTool> {
  return {
    browser: createBrowserTool({ client, ...options }),
  };
}

/**
 * Format browser tools for system prompt injection
 *
 * Generates documentation that can be included in the AI's system prompt
 * to help it understand available browser tools.
 */
export function formatBrowserToolsForPrompt(client: BTCPAgentClient): string {
  const tools = client.getTools();

  if (tools.length === 0) {
    return `## Browser Tools

No browser tools are currently available. The browser may need to connect first.`;
  }

  const formatTool = (tool: BTCPToolDefinition): string => {
    const props = tool.inputSchema.properties ?? {};
    const required = tool.inputSchema.required ?? [];

    const params = Object.entries(props)
      .map(([name, schema]) => {
        const isReq = required.includes(name);
        const desc = schema.description || schema.type;
        return `    - ${name}${isReq ? " (required)" : ""}: ${desc}`;
      })
      .join("\n");

    return `### ${tool.name}
${tool.description}

Parameters:
${params || "    (none)"}`;
  };

  return `## Browser Tools

You can interact with the browser using the \`browser\` tool. Pass the tool name and arguments:

\`\`\`
browser({ tool: "<tool-name>", arguments: { ... } })
\`\`\`

### Available Tools

${tools.map(formatTool).join("\n\n")}`;
}
