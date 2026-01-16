# Agent Framework Architecture

This document describes the architecture of the `@btcp/ai-agents` package, which provides a Claude Code-level agentic framework with clean separation between core agent functionality and domain-specific integrations.

## Package Structure

```
@btcp/ai-agents
├── agent-sdk       # Core domain-agnostic framework
│   ├── core/loop   # TOAD (Think-Act-Observe-Decide) loop
│   ├── providers   # LLM providers (Google, OpenAI)
│   ├── context     # Memory management (6-tier)
│   ├── hooks       # Pre/post execution hooks
│   ├── resources   # @alias resolution
│   ├── skills      # Knowledge injection
│   └── tools       # Generic tool definitions
│
└── browser-agent   # Browser-specific integration
    ├── btcp        # Browser Tool Calling Protocol
    ├── adapters    # BTCP/MCP adapters
    └── http        # HTTP handler for servers
```

## Core Concepts

### 1. ActionAdapter Interface

The `ActionAdapter` is the primary abstraction that enables domain-agnostic operation. Any backend (browser, canvas, database, API) implements this interface.

```typescript
interface ActionAdapter {
  // Identity
  readonly id: string;
  readonly name: string;
  readonly type: string;

  // Lifecycle
  connect(): Promise<boolean>;
  disconnect(): void;
  getConnectionState(): AdapterConnectionState;

  // Execution
  execute<T>(action: string, params: Record<string, unknown>): Promise<ActionResult<T>>;
  getAvailableActions(): ActionDefinition[];
  supportsAction(action: string): boolean;

  // State
  getState(): Promise<StateSnapshot>;
  getAwareness(): Promise<AwarenessContext>;
}
```

### 2. TOAD Loop

The agentic loop follows the Think-Act-Observe-Decide pattern:

```
┌─────────────────────────────────────────────────────────┐
│                    AGENTIC LOOP                          │
│                                                          │
│   ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
│   │  THINK  │───▶│   ACT   │───▶│ OBSERVE │───▶│ DECIDE  │
│   │         │    │         │    │         │    │         │
│   │Context  │    │Execute  │    │Process  │    │Continue │
│   │Awareness│    │Tools    │    │Results  │    │Complete │
│   │Messages │    │         │    │State    │    │Fail     │
│   └─────────┘    └─────────┘    └─────────┘    └─────────┘
│        │                                             │
│        └─────────────────────────────────────────────┘
│                        (if continue)
└─────────────────────────────────────────────────────────┘
```

### 3. Integration Systems

| System | Purpose |
|--------|---------|
| ContextManager | 6-tier memory with token budgeting |
| HooksManager | Pre/post execution hooks for observability |
| ResourceRegistry | @alias resolution for data references |
| SkillRegistry | Knowledge injection based on task |
| SessionSerializer | Persistence for checkpointing |

## Usage Patterns

### Basic Usage with Adapter

```typescript
import { runAgenticLoop } from '@btcp/ai-agents/agent-sdk';
import { createBTCPAdapter } from '@btcp/ai-agents/browser-agent';

// Create adapter for browser tools
const adapter = createBTCPAdapter({
  serverUrl: 'http://localhost:8765',
  sessionId: 'my-session',
});

// Run agent loop
for await (const event of runAgenticLoop("Click the login button", "session-1", {
  adapter,
  model: "balanced",
})) {
  switch (event.type) {
    case 'thinking':
      console.log('Thinking:', event.message);
      break;
    case 'tool_call':
      console.log('Calling:', event.tool, event.input);
      break;
    case 'complete':
      console.log('Done:', event.summary);
      break;
  }
}
```

### Custom Adapter Implementation

```typescript
import { ActionAdapter, ActionResult, StateSnapshot } from '@btcp/ai-agents/adapters';

class MyDatabaseAdapter implements ActionAdapter {
  readonly id = 'my-db';
  readonly name = 'Database Adapter';
  readonly type = 'database';

  private connected = false;

  async connect(): Promise<boolean> {
    // Connect to database
    this.connected = true;
    return true;
  }

  async execute<T>(action: string, params: Record<string, unknown>): Promise<ActionResult<T>> {
    switch (action) {
      case 'query':
        const results = await db.query(params.sql as string);
        return { success: true, data: results as T };
      case 'insert':
        await db.insert(params.table as string, params.data);
        return { success: true };
      default:
        return { success: false, error: { code: 'UNKNOWN_ACTION', message: 'Unknown action', recoverable: false }};
    }
  }

  getAvailableActions() {
    return [
      { name: 'query', description: 'Execute SQL query', inputSchema: { type: 'object', properties: { sql: { type: 'string' } } } },
      { name: 'insert', description: 'Insert data', inputSchema: { type: 'object', properties: { table: { type: 'string' }, data: { type: 'object' } } } },
    ];
  }

  // ... implement other methods
}
```

### Using Hooks for Observability

```typescript
import { runAgenticLoop, createHooksManager, CommonHooks } from '@btcp/ai-agents/agent-sdk';

const hooksManager = createHooksManager();

// Add logging
hooksManager.registerPostHook(CommonHooks.logOperations(true));

// Add metrics collection
hooksManager.registerPostHook(async (toolName, result, duration) => {
  metrics.record('tool_execution', { toolName, duration, success: !result.error });
});

// Add validation
hooksManager.registerPreHook(async (toolName, input) => {
  if (toolName === 'delete' && !input.confirmed) {
    return { blocked: true, reason: 'Deletion requires confirmation' };
  }
  return { blocked: false };
});

for await (const event of runAgenticLoop(task, session, {
  adapter,
  hooks: hooksManager,
})) {
  // ...
}
```

### Injecting Skills

```typescript
import { getSkillRegistry } from '@btcp/ai-agents/agent-sdk';

const registry = getSkillRegistry();

// Register a domain skill
registry.register({
  name: 'sql-expert',
  keywords: ['database', 'query', 'SQL', 'join'],
  prompt: `You are an expert in SQL databases. When writing queries:
- Always use parameterized queries to prevent SQL injection
- Prefer JOINs over subqueries for performance
- Add appropriate indexes for frequently queried columns
- Use EXPLAIN to analyze query performance`,
  priority: 10,
});

// Skills are automatically injected when task matches keywords
for await (const event of runAgenticLoop(
  "Write a query to find all users who haven't logged in",
  session,
  { adapter }
)) {
  // SQL expert skill is automatically injected
}
```

## Module Exports

### @btcp/ai-agents/agent-sdk

Core framework exports (domain-agnostic):

```typescript
// Loop
export { runAgenticLoop, LoopContext, LoopState, LoopOptions }

// Types
export { AgentEvent, AgentConfig, AgentState }

// Adapters
export { ActionAdapter, ActionResult, ActionError, NoOpAdapter }

// Providers
export { createProvider, LLMProvider }

// Context
export { createContextManager, ContextManager, MemoryTier }

// Hooks
export { createHooksManager, HooksManager, CommonHooks }

// Resources
export { createResourceRegistry, ResourceRegistry }

// Skills
export { getSkillRegistry, SkillRegistry }
```

### @btcp/ai-agents/browser-agent

Browser-specific exports:

```typescript
// Adapters
export { BTCPAdapter, createBTCPAdapter }
export { MCPAdapter, createMCPAdapter } // deprecated

// BTCP Client
export { BTCPAgentClient, createBTCPClient }

// HTTP Handler
export { createAgentHttpHandler }

// Re-exports from agent-sdk
export { runAgenticLoop, AgentEvent, ActionAdapter }
```

## Migration Guide

### From Direct MCP to Adapter Pattern

Before (coupled to MCP):
```typescript
const mcp = new HttpMcpClient({ baseUrl, canvasId });
await mcp.connect();
const result = await mcp.callTool('create', { type: 'rectangle' });
```

After (adapter pattern):
```typescript
import { createMCPAdapter } from '@btcp/ai-agents/browser-agent';

const adapter = createMCPAdapter({ baseUrl, canvasId });
await adapter.connect();
const result = await adapter.execute('create', { type: 'rectangle' });
```

### From Canvas-specific to Generic

Before:
```typescript
for await (const event of runAgenticLoop(task, canvasId, options)) {
  // Canvas-specific handling
}
```

After:
```typescript
const adapter = createBTCPAdapter({ serverUrl });

for await (const event of runAgenticLoop(task, sessionId, { adapter })) {
  // Works with any adapter
}
```

## Design Principles

1. **Domain Agnostic Core**: The agent framework knows nothing about browsers, canvases, or specific tools
2. **Adapter Pattern**: All domain-specific logic is encapsulated in adapters
3. **Streaming First**: All events are streamed via async generators
4. **Composable Hooks**: Pre/post hooks enable observability and control
5. **Skill Injection**: Domain knowledge is compressed and injected contextually
6. **Backward Compatible**: Legacy MCP code continues to work via adapter wrappers
