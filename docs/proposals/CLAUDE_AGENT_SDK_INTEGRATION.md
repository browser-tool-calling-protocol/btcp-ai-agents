# Claude Agent SDK Integration

> **Goal**: Use Claude Agent SDK as the AI agent engine for canvas operations.

## Why Claude Agent SDK

The [Claude Agent SDK](https://platform.claude.com/docs/en/agent-sdk/overview) provides production-grade agent capabilities that Anthropic built and maintains:

- **Agent loop** - Think → Act → Observe cycle, optimized
- **Context compaction** - Automatic summarization when limits approach
- **Subagents** - Spawn parallel agents via Task tool
- **MCP integration** - Native Model Context Protocol support
- **Session persistence** - Resume conversations with retained context
- **Hooks** - PreToolUse, PostToolUse, SessionStart/End lifecycle

You don't reimplement this. You use it.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    @waiboard/ai-agents                               │
├─────────────────────────────────────────────────────────────────────┤
│  Agent Engine: Claude Agent SDK                                      │
│  Model: Claude Sonnet 4.5 / Opus 4.5                                │
│  Canvas Tools: Canvas MCP (via mcpServers config)                   │
├─────────────────────────────────────────────────────────────────────┤
│  Image Services: Direct AI SDK calls                                │
│  - @ai-sdk/google for Gemini image generation                       │
│  - sharp for image processing                                        │
└─────────────────────────────────────────────────────────────────────┘
```

Image generation is not an agent task. It's a single API call:

```typescript
import { google } from "@ai-sdk/google";
import { generateImage } from "ai";

export async function generateCanvasImage(prompt: string) {
  return generateImage({ model: google("gemini-2.0-flash-exp"), prompt });
}
```

---

## Installation

```bash
pnpm add @anthropic-ai/claude-agent-sdk --filter=@waiboard/ai-agents
```

**Requirements:**
- Node.js 18+
- `ANTHROPIC_API_KEY` environment variable

---

## Implementation

### Canvas Agent

```typescript
// packages/ai-agents/src/claude/canvas-agent.ts
import { query, type ClaudeAgentOptions } from "@anthropic-ai/claude-agent-sdk";

interface CanvasAgentConfig {
  canvasId: string;
  model?: "sonnet" | "opus";
}

export async function* canvasAgent(prompt: string, config: CanvasAgentConfig) {
  const options: ClaudeAgentOptions = {
    model: config.model === "opus"
      ? "claude-opus-4-5-20251101"
      : "claude-sonnet-4-5-20250514",

    systemPrompt: CANVAS_SYSTEM_PROMPT,

    mcpServers: {
      canvas: {
        command: "node",
        args: ["./packages/canvas-mcp/dist/stdio.js"],
        env: { CANVAS_ID: config.canvasId }
      }
    },

    allowedTools: [
      "mcp__canvas__el_create",
      "mcp__canvas__el_update",
      "mcp__canvas__el_delete",
      "mcp__canvas__el_query",
      "mcp__canvas__el_getById",
      "mcp__canvas__viewport_set",
      "mcp__canvas__canvas_status"
    ],

    hooks: {
      postToolUse: async (tool, result) => {
        if (tool.startsWith("mcp__canvas__")) {
          emitCanvasUpdate(config.canvasId, result);
        }
      }
    }
  };

  for await (const message of query({ prompt, options })) {
    yield message;
  }
}
```

### System Prompt

```typescript
// packages/ai-agents/src/claude/prompts.ts
export const CANVAS_SYSTEM_PROMPT = `
You are a canvas operations specialist for Waiboard.

## Tools
Canvas MCP tools (mcp__canvas__*):
- el_create: Create elements (rectangle, ellipse, text, arrow, frame, image)
- el_update: Modify element properties
- el_delete: Remove elements
- el_query: Query elements with filters
- el_getById: Get element by ID
- viewport_set: Control pan/zoom
- canvas_status: Check connection

## Workflow
1. <understanding> Analyze request and canvas state
2. <plan> Plan operations
3. <execute> Run canvas tools
4. <verify> Confirm results

## Rules
- Check canvas_status first
- Query existing elements before creating
- Report element IDs in responses
- Retry on transient errors
`;
```

### HTTP Endpoint

```typescript
// packages/ai-agents/src/routes/chat.ts
import { query } from "@anthropic-ai/claude-agent-sdk";

export async function handleChat(req: Request) {
  const { prompt, canvasId } = await req.json();

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      for await (const msg of query({
        prompt,
        options: {
          systemPrompt: CANVAS_SYSTEM_PROMPT,
          mcpServers: { canvas: createCanvasMcp(canvasId) },
          allowedTools: CANVAS_TOOLS
        }
      })) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(msg)}\n\n`));
      }

      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    }
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream" }
  });
}
```

### Hooks

```typescript
// packages/ai-agents/src/claude/hooks.ts
export const canvasHooks = {
  preToolUse: async (tool: string, input: unknown) => {
    console.log(`[Canvas] ${tool}`, input);
    return { proceed: true };
  },

  postToolUse: async (tool: string, result: unknown) => {
    if (tool.startsWith("mcp__canvas__")) {
      eventEmitter.emit("canvas:update", { tool, result });
    }
  },

  stop: async (reason: string) => {
    console.log(`[Agent] Stopped: ${reason}`);
  }
};
```

---

## Subagents for Parallel Operations

For complex layouts, spawn subagents:

```typescript
// The SDK handles this via the Task tool
// In your system prompt, you can instruct:

`For complex diagrams with many elements, use the Task tool to spawn
subagents that work in parallel. Each subagent handles one section.`
```

The agent will automatically use subagents when appropriate.

---

## Migration from Mastra

| Mastra Component | Action |
|------------------|--------|
| `canvasAgent` | Replace with Claude Agent SDK |
| `plannerAgent` | Remove (SDK handles planning) |
| `orchestratorAgent` | Remove (SDK handles orchestration) |
| `canvasNetworkAgent` | Remove (SDK is the network) |
| Image workflows | Keep as direct AI SDK calls |
| HTTP server | Keep Express, swap handler |

### Before (Mastra)

```typescript
const mastra = new Mastra({
  agents: { canvasAgent, plannerAgent, orchestrator },
  server: { port: 4111 }
});
```

### After (Claude Agent SDK)

```typescript
import express from "express";
import { handleChat } from "./routes/chat.js";

const app = express();
app.post("/chat", handleChat);
app.listen(4111);
```

---

## File Structure

```
packages/ai-agents/src/
├── claude/
│   ├── canvas-agent.ts      # Main agent wrapper
│   ├── prompts.ts           # System prompts
│   ├── hooks.ts             # Lifecycle hooks
│   └── mcp-config.ts        # Canvas MCP configuration
├── services/
│   └── image.ts             # Gemini image generation (not an agent)
├── routes/
│   └── chat.ts              # HTTP endpoint
└── index.ts                 # Exports
```

---

## Configuration

```typescript
// packages/ai-agents/src/claude/mcp-config.ts
export function createCanvasMcp(canvasId: string) {
  return {
    command: process.env.CANVAS_MCP_COMMAND || "node",
    args: ["./packages/canvas-mcp/dist/stdio.js"],
    env: {
      CANVAS_ID: canvasId,
      TRANSPORT: "stdio"
    }
  };
}

export const CANVAS_TOOLS = [
  "mcp__canvas__el_create",
  "mcp__canvas__el_update",
  "mcp__canvas__el_delete",
  "mcp__canvas__el_query",
  "mcp__canvas__el_getById",
  "mcp__canvas__viewport_set",
  "mcp__canvas__canvas_status"
];
```

---

## Cost

| Model | Input | Output | Use For |
|-------|-------|--------|---------|
| Sonnet 4.5 | $3/M | $15/M | Default operations |
| Opus 4.5 | $15/M | $75/M | Complex multi-step only |

Use Sonnet for 95% of requests.

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Operation accuracy | ≥ 95% |
| Context overflow | None in 30+ turn sessions |
| Error rate | < 5% |

---

## References

- [Claude Agent SDK Overview](https://platform.claude.com/docs/en/agent-sdk/overview)
- [TypeScript Reference](https://platform.claude.com/docs/en/agent-sdk/typescript)
- [Building Agents](https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk)
- [SDK Demos](https://github.com/anthropics/claude-agent-sdk-demos)
- [NPM Package](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk)
