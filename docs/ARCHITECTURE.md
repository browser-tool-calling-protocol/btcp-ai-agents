# Agent Framework Architecture

This document describes the architecture of the `@btcp/ai-agents` package, which provides a Claude Code-level agentic framework with clean separation between core agent functionality and domain-specific integrations.

## Quick Start

```typescript
import { createAgentSession, createBTCPAdapter } from '@btcp/ai-agents';

// Create session with adapter
const session = await createAgentSession({
  adapter: createBTCPAdapter({ serverUrl: 'http://localhost:8765' }),
  model: 'balanced',
});

// Run tasks (streaming)
for await (const event of session.run("Click the login button")) {
  console.log(event.type, event);
}

// Or execute and get result
const result = await session.execute("Fill in the form");
console.log(result.success, result.summary);

// Multi-turn: context is preserved
for await (const event of session.run("Now submit")) {
  console.log(event);
}

// Cleanup
await session.close();
```

## Package Structure

```
@btcp/ai-agents
├── agent-sdk       # Core domain-agnostic framework
│   ├── session     # Session-based API (PRIMARY INTERFACE)
│   ├── core/loop   # TOAD loop (low-level, deprecated)
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

### Session-based API (Recommended)

```typescript
import { createAgentSession } from '@btcp/ai-agents';
import { createBTCPAdapter } from '@btcp/ai-agents/browser-agent';

// Create session with adapter
const session = await createAgentSession({
  adapter: createBTCPAdapter({ serverUrl: 'http://localhost:8765' }),
  model: 'balanced',
  verbose: true,
});

// Stream events from a task
for await (const event of session.run("Click the login button")) {
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

// Execute and get result (no streaming)
const result = await session.execute("Fill in the form");
if (result.success) {
  console.log('Summary:', result.summary);
  console.log('Duration:', result.duration, 'ms');
}

// Get session stats
console.log('Stats:', session.getStats());

// Cleanup
await session.close();
```

### Convenience Functions

```typescript
import { runTask, streamTask, createBTCPAdapter } from '@btcp/ai-agents';

const adapter = createBTCPAdapter({ serverUrl: 'http://localhost:8765' });

// Single task with result (creates/closes session automatically)
const result = await runTask("Click the button", adapter, { model: 'fast' });

// Single task with streaming
for await (const event of streamTask("Fill form", adapter)) {
  console.log(event);
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

## Session API Reference

The `AgentSession` class is the primary interface for interacting with the agent framework.

### AgentSessionConfig

```typescript
interface AgentSessionConfig {
  // Required
  adapter: ActionAdapter;           // Domain adapter (BTCP, MCP, custom)

  // Optional
  sessionId?: string;               // Auto-generated if not provided
  provider?: 'google' | 'openai';   // LLM provider (default: 'google')
  model?: 'fast' | 'balanced' | 'powerful' | string;  // Model tier (default: 'balanced')
  systemPrompt?: string;            // Custom system prompt
  maxIterations?: number;           // Max iterations per task (default: 20)
  tokenBudget?: number;             // Context token budget (default: 8000)
  verbose?: boolean;                // Enable verbose logging (default: false)
  hooks?: HooksManager;             // Pre-configured hooks
  resources?: ResourceRegistry;     // Pre-configured resources
  serializer?: SessionSerializer;   // For persistence
  autoConnect?: boolean;            // Auto-connect on creation (default: true)
}
```

### AgentSession Methods

| Method | Description |
|--------|-------------|
| `run(task, options?)` | Run a task, streaming events as async generator |
| `execute(task, options?)` | Run a task, return result when complete |
| `cancel()` | Cancel the currently running task |
| `connect()` | Connect the adapter (auto-called by default) |
| `close()` | Close session and cleanup resources |
| `getState()` | Get session state: 'created' \| 'connected' \| 'running' \| 'idle' \| 'closed' \| 'error' |
| `getId()` | Get session ID |
| `getStats()` | Get session statistics |
| `getHistory()` | Get task execution history |
| `clearHistory()` | Clear task history |
| `getAwareness()` | Get current awareness/context from adapter |
| `getAdapter()` | Get underlying adapter |
| `getContextManager()` | Get context manager |
| `getHooksManager()` | Get hooks manager |

### TaskResult

```typescript
interface TaskResult {
  success: boolean;                              // Whether task completed successfully
  summary: string;                               // Summary of what was done
  events: AgentEvent[];                          // All events emitted
  duration: number;                              // Duration in milliseconds
  iterations: number;                            // Number of TOAD iterations
  errors: Array<{ code: string; message: string }>;  // Errors encountered
}
```

## Event Types Reference

Events are emitted during task execution and can be consumed via `session.run()`.

### Event Type Hierarchy

```typescript
type AgentEvent =
  | IterationEvent      // Loop iteration started
  | ThinkingEvent       // Agent is reasoning
  | ToolCallEvent       // Tool execution started
  | ToolResultEvent     // Tool execution completed
  | ObservationEvent    // Agent observing results
  | DecisionEvent       // Agent made a decision
  | ContextEvent        // Context/awareness update
  | ErrorEvent          // Error occurred
  | CompleteEvent       // Task completed
  | CancelledEvent;     // Task cancelled
```

### Event Details

| Event Type | Key Fields | Description |
|------------|------------|-------------|
| `iteration` | `iteration`, `maxIterations` | New TOAD iteration started |
| `thinking` | `message`, `reasoning` | Agent reasoning about next action |
| `tool_call` | `tool`, `input`, `callId` | Tool execution initiated |
| `tool_result` | `tool`, `result`, `callId`, `duration` | Tool execution completed |
| `observation` | `observations[]` | Agent processed tool results |
| `decision` | `decision`, `reason` | Agent decided next action |
| `context` | `awareness`, `tokensUsed` | Context/awareness updated |
| `error` | `code`, `message`, `recoverable` | Error occurred |
| `complete` | `success`, `summary`, `totalIterations` | Task finished successfully |
| `cancelled` | `reason` | Task was cancelled |

### Event Handling Example

```typescript
for await (const event of session.run("Click the button")) {
  switch (event.type) {
    case 'iteration':
      console.log(`Iteration ${event.iteration}/${event.maxIterations}`);
      break;

    case 'thinking':
      console.log('Reasoning:', event.message);
      break;

    case 'tool_call':
      console.log(`Calling ${event.tool}:`, event.input);
      break;

    case 'tool_result':
      console.log(`${event.tool} completed in ${event.duration}ms`);
      if (event.result.error) {
        console.error('Tool error:', event.result.error);
      }
      break;

    case 'error':
      console.error(`Error [${event.code}]: ${event.message}`);
      if (!event.recoverable) {
        console.error('Non-recoverable error, task will fail');
      }
      break;

    case 'complete':
      console.log('Task completed:', event.summary);
      break;
  }
}
```

## Error Handling

### Error Types

```typescript
interface ActionError {
  code: string;           // Error code (e.g., 'TIMEOUT', 'CONNECTION_LOST')
  message: string;        // Human-readable message
  recoverable: boolean;   // Whether agent can retry
  details?: unknown;      // Additional error context
}
```

### Common Error Codes

| Code | Description | Recoverable |
|------|-------------|-------------|
| `CONNECTION_LOST` | Adapter connection dropped | Yes |
| `TIMEOUT` | Action execution timeout | Yes |
| `UNKNOWN_ACTION` | Action not supported by adapter | No |
| `VALIDATION_ERROR` | Invalid input parameters | No |
| `RATE_LIMITED` | LLM API rate limit hit | Yes |
| `MAX_ITERATIONS` | Exceeded max iterations | No |
| `CANCELLED` | Task was cancelled | No |
| `ADAPTER_ERROR` | Adapter-specific error | Depends |

### Error Recovery Pattern

```typescript
const session = await createAgentSession({
  adapter,
  maxIterations: 20,  // Allow retries
});

// Hooks can implement retry logic
session.getHooksManager().registerPostHook(async (tool, result, duration) => {
  if (result.error?.recoverable) {
    console.log(`Recoverable error in ${tool}, agent will retry`);
  }
});

try {
  const result = await session.execute("Complete the task");
  if (!result.success) {
    console.log('Task failed:', result.errors);
  }
} catch (error) {
  // Non-recoverable errors throw
  console.error('Fatal error:', error);
} finally {
  await session.close();
}
```

## Context Management

### 6-Tier Memory System

The context manager implements a 6-tier memory hierarchy:

```
┌─────────────────────────────────────────────────────┐
│                  MEMORY TIERS                        │
│                                                      │
│  Tier 0: SYSTEM      │ System prompt, never evicted │
│  Tier 1: IDENTITY    │ Agent identity, high priority│
│  Tier 2: TASK        │ Current task context         │
│  Tier 3: WORKING     │ Recent tool results          │
│  Tier 4: REFERENCE   │ Referenced data (@aliases)   │
│  Tier 5: HISTORICAL  │ Older context, first evicted │
└─────────────────────────────────────────────────────┘
```

### Token Budgeting

```typescript
const contextManager = createContextManager({
  maxTokens: 8000,        // Total budget
  reservedForResponse: 2000,  // Reserved for LLM response
});

// Messages are automatically prioritized and evicted
contextManager.addMessage({
  role: 'assistant',
  content: 'Observation...',
  tier: MemoryTier.WORKING,
  priority: MessagePriority.NORMAL,
});
```

### Tool Result Lifecycle

Tool results follow a lifecycle for efficient context management:

```
FRESH → REFERENCED → STALE → COMPRESSED → EVICTED
  │         │          │          │
  └─ High ──┴─ Normal ─┴── Low ───┴─ Summarized/Removed
    priority
```

## Extension Points

### 1. Custom Adapters

Implement `ActionAdapter` to connect to any backend:

```typescript
interface ActionAdapter {
  // Required
  readonly id: string;
  readonly name: string;
  readonly type: string;

  connect(): Promise<boolean>;
  disconnect(): void;
  isConnected(): boolean;
  getConnectionState(): AdapterConnectionState;

  execute<T>(action: string, params: Record<string, unknown>): Promise<ActionResult<T>>;
  getAvailableActions(): ActionDefinition[];
  supportsAction(action: string): boolean;

  getState(): Promise<StateSnapshot>;
  getAwareness(): Promise<AwarenessContext>;
}
```

### 2. Custom Hooks

Add pre/post execution logic:

```typescript
// Pre-hook: runs before tool execution
hooksManager.registerPreHook(async (toolName, input) => {
  // Validate, transform, or block
  return { blocked: false, transformedInput: input };
});

// Post-hook: runs after tool execution
hooksManager.registerPostHook(async (toolName, result, duration) => {
  // Log, record metrics, trigger side effects
});
```

### 3. Custom Skills

Register domain-specific knowledge:

```typescript
getSkillRegistry().register({
  name: 'my-domain-expert',
  keywords: ['domain', 'specific', 'terms'],
  prompt: `Expert knowledge for this domain...`,
  priority: 10,
  matcher: (task) => task.includes('specific pattern'),  // Optional custom matcher
});
```

### 4. Custom Resource Providers

Add @alias resolution providers:

```typescript
resourceRegistry.registerProvider({
  pattern: /^@mydata:(.+)$/,
  resolve: async (alias, match) => {
    const key = match[1];
    return { content: await fetchMyData(key), type: 'application/json' };
  },
});
```

## Testing

### Unit Testing with NoOpAdapter

```typescript
import { createAgentSession, NoOpAdapter } from '@btcp/ai-agents';

describe('Agent Session', () => {
  it('should handle tasks', async () => {
    const adapter = new NoOpAdapter();
    const session = await createAgentSession({ adapter });

    const events: AgentEvent[] = [];
    for await (const event of session.run("Test task")) {
      events.push(event);
    }

    expect(events.some(e => e.type === 'complete')).toBe(true);
    await session.close();
  });
});
```

### Integration Testing with Mock Adapter

```typescript
class MockBrowserAdapter implements ActionAdapter {
  readonly id = 'mock-browser';
  readonly name = 'Mock Browser';
  readonly type = 'browser';

  private state = { elements: [], url: 'https://example.com' };

  async execute<T>(action: string, params: Record<string, unknown>): Promise<ActionResult<T>> {
    // Simulate browser actions
    switch (action) {
      case 'click':
        return { success: true, data: { clicked: params.selector } as T };
      case 'screenshot':
        return { success: true, data: { image: 'base64...' } as T };
      default:
        return { success: false, error: { code: 'UNKNOWN', message: 'Unknown action', recoverable: false }};
    }
  }

  async getAwareness(): Promise<AwarenessContext> {
    return {
      type: 'browser',
      state: this.state,
      capabilities: ['click', 'type', 'screenshot'],
    };
  }

  // ... other required methods
}
```

### Testing Hooks

```typescript
it('should call hooks', async () => {
  const preCalls: string[] = [];
  const postCalls: string[] = [];

  const hooks = createHooksManager();
  hooks.registerPreHook(async (tool) => {
    preCalls.push(tool);
    return { blocked: false };
  });
  hooks.registerPostHook(async (tool) => {
    postCalls.push(tool);
  });

  const session = await createAgentSession({ adapter, hooks });
  await session.execute("Click the button");

  expect(preCalls).toContain('click');
  expect(postCalls).toContain('click');
});
```

## Performance Considerations

### Token Budget Tuning

```typescript
// For simple tasks
const session = await createAgentSession({
  adapter,
  tokenBudget: 4000,      // Smaller budget
  maxIterations: 10,      // Fewer iterations
  model: 'fast',          // Faster model
});

// For complex tasks
const session = await createAgentSession({
  adapter,
  tokenBudget: 16000,     // Larger budget
  maxIterations: 30,      // More iterations
  model: 'powerful',      // More capable model
});
```

### Streaming vs Execute

- Use `session.run()` (streaming) for:
  - Real-time UI updates
  - Progress tracking
  - Early cancellation
  - Long-running tasks

- Use `session.execute()` for:
  - Simple tasks
  - Batch processing
  - When you only need the result

### Connection Management

```typescript
// Reuse sessions for multiple tasks
const session = await createAgentSession({ adapter });

for (const task of tasks) {
  await session.execute(task);  // Connection reused
}

await session.close();

// vs. creating new sessions (slower)
for (const task of tasks) {
  const result = await runTask(task, adapter);  // New connection each time
}
```

## Appendix: Model Tiers

| Tier | Google | OpenAI | Use Case |
|------|--------|--------|----------|
| `fast` | gemini-1.5-flash | gpt-4o-mini | Simple tasks, high throughput |
| `balanced` | gemini-1.5-pro | gpt-4o | General purpose (default) |
| `powerful` | gemini-1.5-pro-002 | gpt-4-turbo | Complex reasoning |

## Appendix: Import Paths

```typescript
// Main entry (all exports)
import { createAgentSession, createBTCPAdapter } from '@btcp/ai-agents';

// Core SDK only
import { AgentSession, runAgenticLoop } from '@btcp/ai-agents/agent-sdk';

// Browser agent only
import { BTCPAdapter, MCPAdapter } from '@btcp/ai-agents/browser-agent';

// Specific modules
import { createContextManager } from '@btcp/ai-agents/context';
import { createHooksManager } from '@btcp/ai-agents/hooks';
import { getSkillRegistry } from '@btcp/ai-agents/skills';
import { createResourceRegistry } from '@btcp/ai-agents/resources';
import { createBTCPClient } from '@btcp/ai-agents/btcp';
```
