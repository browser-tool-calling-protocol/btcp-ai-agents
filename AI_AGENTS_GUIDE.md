# AI Agents Framework - Prompt Engineering Guide

**Production-ready agent framework leveraging Claude 4.x capabilities through structured prompts, XML tags, and chain-of-thought reasoning.**

## Table of Contents

1. [Overview](#overview)
2. [Anthropic Prompt Engineering Principles](#anthropic-prompt-engineering-principles)
3. [Skills-Based Architecture](#skills-based-architecture)
4. [Architecture](#architecture)
5. [The Agent Types](#the-agent-types)
6. [ActionAdapter Integration](#actionadapter-integration)
7. [Implementation](#implementation)
8. [Best Practices](#best-practices)
9. [Anti-Patterns to Avoid](#anti-patterns-to-avoid)
10. [Performance & Cost Optimization](#performance--cost-optimization)
11. [Workflows](#workflows)
12. [Testing](#testing)

---

## Overview

### Philosophy (Anthropic 2025)

> **Leverage Claude 4.x through explicit structure, minimal context, and extended thinking.**

This system adopts Anthropic's official prompt engineering best practices:
- **XML Structure** - Claude trained to recognize `<thinking>`, `<implementation>`, `<scene_understanding>` tags
- **Explicit Instructions** - Specific output formats, clear constraints, defined workflows
- **Extended Thinking** - Claude 4.x thinking capabilities for multi-step reasoning
- **Context Minimization** - Load skills/knowledge on-demand (30-70% token reduction)
- **Motivation-Driven** - Explain "why" behavior matters to improve understanding
- **Few-Shot Examples** - Realistic input-output pairs aligned with desired behavior

### Why This Approach?

Instead of building 7+ specialized agents and 10+ custom tools, we use:
- **3 core agents** (Orchestrator with built-in intent classification, Executor, Analyzer)
- **8 generic tools** (context_read, context_write, context_search, task_execute, state_snapshot, agent_delegate, agent_plan, agent_clarify)
- **Domain-specific skills** loaded on-demand via keyword matching
- **ActionAdapter pattern** for pluggable backends

### Design Principles

| Principle | Implementation |
|-----------|---------------|
| **Minimal Tools** | 8 generic tools that compose for any domain |
| **Rich Prompts** | Skills inject domain expertise on demand |
| **Observable State** | All state serializable via AgentResources |
| **Streaming First** | Async generators for real-time event delivery |
| **Hook System** | Pre/post hooks for validation, logging, metrics |
| **Sub-Agent Delegation** | Specialist agents for complex subtasks |

---

## Anthropic Prompt Engineering Principles

### 1. XML Tags for Structure

Claude is specifically trained to recognize and use XML tags:

| Tag | Purpose | Used By |
|-----|---------|---------|
| `<thinking>` | Chain-of-thought reasoning | All agents |
| `<analyze>` | Task & state analysis | Orchestrator, Analyzer |
| `<implementation>` | Execution block | Executor |
| `<summarize>` | Output summary | All agents |

### 2. Explicit Constraints

```markdown
## Constraints
- Maximum 20 iterations per task
- Prefer reading state before writing
- Validate inputs before execution
- Report errors immediately, don't retry silently
- Use appropriate tools for each subtask
```

### 3. Skills as Compressed Context

Instead of bloated always-on prompts:
- **Define constraints**: Available operations, error handling rules
- **Provide examples**: Realistic input-output pairs
- **Use few-shot**: 2-3 examples aligned with desired behavior
- **Load on demand**: Only inject skills matching task keywords

---

## Skills-Based Architecture

### Skill Registration

```typescript
import { getSkillRegistry } from '@btcp/ai-agents';

const registry = getSkillRegistry();

registry.register({
  name: 'sql-expert',
  keywords: ['database', 'query', 'SQL', 'schema', 'table'],
  prompt: `You are an expert in relational databases...`,
  priority: 10,
});
```

### Skill Injection Flow

```
User request → Keyword matching → Inject relevant skills → Build prompt
                    ↓
            "Design a schema"
                    ↓
            matches: ["database", "schema"]
                    ↓
            Inject: sql-expert skill (150 tokens trigger → 10,000 tokens expertise)
```

---

## Architecture

### System Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                       @btcp/ai-agents                                  │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  ┌─────────────────────────────────┐    ┌──────────────────────────┐  │
│  │        Session API              │    │    Planning Engine       │  │
│  │  createAgentSession()           │    │  orchestrate()           │  │
│  │  session.run() / .execute()     │    │  complexity detection    │  │
│  └─────────────┬───────────────────┘    └──────────┬───────────────┘  │
│                │                                    │                  │
│                ▼                                    ▼                  │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │                        TOAD Loop                                 │ │
│  │  THINK → ACT → OBSERVE → DECIDE (repeat until done)            │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                │                                                      │
│       ┌────────┼────────────────┐                                     │
│       ▼        ▼                ▼                                     │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐                                │
│  │ Context │ │  Hooks  │ │ Skills  │                                 │
│  │ Manager │ │ Manager │ │ Registry│                                 │
│  └─────────┘ └─────────┘ └─────────┘                                │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │                     ActionAdapter                                │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │ │
│  │  │  BTCP    │  │   MCP    │  │ Database │  │  Custom  │        │ │
│  │  │ Adapter  │  │ Adapter  │  │ Adapter  │  │ Adapter  │        │ │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘        │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

### Layers

**Layer 1: Session API (User-facing)**
- Primary interface for application code
- Manages multi-turn context preservation
- Auto-connects adapters and manages lifecycle

**Layer 2: TOAD Loop (Core Engine)**
- Think: Gather context, build awareness, inject skills
- Act: Execute tool calls through adapters
- Observe: Process results, update state
- Decide: Continue, complete, fail, or timeout

**Layer 3: Integration Systems**
- Context Manager: 6-tier memory with token budgeting
- Hooks Manager: Pre/post execution hooks for observability
- Skills Registry: On-demand knowledge injection

**Layer 4: ActionAdapter (Domain Abstraction)**
- Pluggable interface for any backend
- Built-in: BTCP (browser), MCP (protocol servers)
- Custom: database, API, file system, etc.

### Data Flow

```
    │  Analyze Request │  Classify intent, detect mode
    │  Load Skills     │  Keyword-matched domain knowledge
    └──────────────────┘
            │
    ┌──────────────────┐
    │  TOAD Loop       │
    │  Think → Act → Observe → Decide
    └──────────────────┘
            │
    ┌──────────────────┐
    │  ActionAdapter   │  Domain-specific execution
    └──────────────────┘
            │
    ┌──────────────────┐
    │  Backend         │  Browser, API, Database, etc.
    └──────────────────┘
```

---

## The Agent Types

### 1. Generic Agent (Default)

**Purpose**: General-purpose agent handling most tasks directly.

**Capabilities**:
- Read and understand context/state
- Write and modify context
- Execute tasks through registered adapters
- Create plans for complex tasks
- Delegate to specialist agents
- Ask for clarification when needed

**Source**: `src/agent-sdk/agents/prompts.ts`

### 2. Planner Agent

**Purpose**: Break down complex tasks into clear, actionable steps.

**When to use**: Multi-step tasks, dependency management, resource planning.

**Example Flow**:
```
User: "Set up monitoring for all API endpoints"
→ Analyze: Identify endpoints, monitoring requirements
→ Plan: Step 1 (discover endpoints), Step 2 (configure alerts), Step 3 (verify)
→ Delegate: executor-agent for each step
→ Result: Monitoring configured with verification report
```

### 3. Executor Agent

**Purpose**: Carry out planned steps efficiently and accurately.

**When to use**: Sequential execution, error handling, state verification.

### 4. Analyzer Agent

**Purpose**: Examine data, identify patterns, provide insights.

**When to use**: Data analysis, pattern recognition, reporting, auditing.

### 5. Explorer Agent

**Purpose**: Discover context and map structure.

**When to use**: Understanding new domains, mapping relationships, discovery tasks.

---

## ActionAdapter Integration

The `ActionAdapter` interface is the core abstraction enabling domain-agnostic operation. Any backend implements this interface to work with the agent framework.

### Interface

```typescript
interface ActionAdapter {
  readonly id: string;
  readonly name: string;
  readonly type: string;

  connect(): Promise<boolean>;
  disconnect(): void;
  isConnected(): boolean;

  execute<T>(action: string, params: Record<string, unknown>): Promise<ActionResult<T>>;
  getAvailableActions(): ActionDefinition[];
  supportsAction(action: string): boolean;

  getState(options?: StateOptions): Promise<StateSnapshot>;
  getAwareness(options?: AwarenessOptions): Promise<AwarenessContext>;
}
```

### Built-in Adapters

| Adapter | Domain | Protocol |
|---------|--------|----------|
| `BTCPAdapter` | Browser automation | BTCP (Browser Tool Calling Protocol) |
| `MCPAdapter` | MCP servers | MCP (Model Context Protocol) |
| `NoOpAdapter` | Testing | No-op (returns success) |

### Creating Custom Adapters

```typescript
class MyAPIAdapter implements ActionAdapter {
  readonly id = 'my-api';
  readonly name = 'REST API';
  readonly type = 'api';

  async execute<T>(action: string, params: Record<string, unknown>): Promise<ActionResult<T>> {
    const response = await fetch(`${this.baseUrl}/${action}`, {
      method: 'POST',
      body: JSON.stringify(params),
    });
    return { success: response.ok, data: await response.json() as T };
  }
  // ... other required methods
}
```

---

## Implementation

### Quick Start

```typescript
import { createAgentSession, createBTCPAdapter } from '@btcp/ai-agents';

const session = await createAgentSession({
  adapter: createBTCPAdapter({ serverUrl: 'http://localhost:8765' }),
  model: 'balanced',
});

for await (const event of session.run("Analyze the data")) {
  switch (event.type) {
    case 'thinking': console.log('Reasoning:', event.message); break;
    case 'tool_call': console.log('Executing:', event.tool); break;
    case 'complete': console.log('Done:', event.summary); break;
  }
}

await session.close();
```

### Hooks for Observability

```typescript
const hooks = createHooksManager();

// Validation
hooks.registerPreHook(async (tool, input) => {
  if (tool === 'task_execute' && !input.action) {
    return { blocked: true, reason: 'Action required' };
  }
  return { blocked: false };
});

// Logging
hooks.registerPostHook(async (tool, result, duration) => {
  console.log(`${tool} completed in ${duration}ms`);
});
```

---

## Best Practices

| Practice | Description |
|----------|-------------|
| **Single Responsibility** | Each agent has ONE clear job |
| **Read Before Write** | Always check state before modifying |
| **Checkpoint Often** | Create snapshots before risky operations |
| **Delegate Wisely** | Use specialists for their strengths |
| **Skills Over Prompts** | Inject knowledge on-demand |
| **Observable State** | Keep all state in serializable resources |

---

## Anti-Patterns to Avoid

| Anti-Pattern | What to Do Instead |
|-------------|-------------------|
| Monolithic prompts | Use skills for on-demand knowledge |
| Silent retries | Report errors, let decide phase handle |
| Deep nesting | Delegate to sub-agents with isolated context |
| Guessing state | Always read state before acting |
| Over-delegation | Handle simple tasks directly |

---

## Performance & Cost Optimization

### Model Selection

| Complexity | Model Tier | Use Case |
|-----------|-----------|----------|
| Simple | `fast` | Quick lookups, simple actions |
| Moderate | `balanced` | General tasks (default) |
| Complex | `powerful` | Multi-step reasoning, planning |

### Token Optimization

- Use awareness with `maxTokens` budget to limit state injection
- Context compression via 6-tier memory (stale data evicted first)
- Skills loaded on-demand (150 tokens trigger → 10,000 tokens expertise)

### Latency Targets

| Operation | Target |
|-----------|--------|
| Simple task | <2s |
| Moderate task | <5s |
| Complex task | <15s |

---

## Testing

### Unit Testing with NoOpAdapter

```typescript
import { createAgentSession, NoOpAdapter } from '@btcp/ai-agents';

const adapter = new NoOpAdapter();
const session = await createAgentSession({ adapter });
const result = await session.execute("Test task");
expect(result.success).toBe(true);
await session.close();
```

### Key Test Files

- `src/agent-sdk/agents/state.test.ts` - State management
- `src/agent-sdk/agents/mode-detection.test.ts` - Mode detection
- `src/agent-sdk/hooks/manager.test.ts` - Hook system
- `src/__tests__/live/tool-calling.test.ts` - Live tool calling

---

## Project Structure

```
src/
├── agent-sdk/               # Core domain-agnostic framework
│   ├── session.ts           # Session API (primary interface)
│   ├── core/loop/           # TOAD loop phases
│   ├── agents/              # Agent definitions & prompts
│   ├── tools/               # 8 generic tool definitions
│   ├── context/             # 6-tier memory management
│   ├── hooks/               # Pre/post execution hooks
│   ├── resources/           # @alias resolution
│   └── skills/              # Knowledge injection
│
├── browser-agent/           # Browser-specific BTCP integration
├── planning/                # Orchestration & delegation
├── tracing/                 # Observability
└── benchmarks/              # Performance testing
```
