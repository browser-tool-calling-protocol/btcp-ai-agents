# @btcp/ai-agents

General-purpose AI agent framework using the **TOAD pattern** (Think, Act, Observe, Decide) with pluggable adapters for any domain.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            @btcp/ai-agents                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         ORCHESTRATION                                │   │
│  │                                                                      │   │
│  │  orchestrate() ─────► Pre-processing ─────► TOAD Loop ─────► Result │   │
│  │                       (aliases, skills,    (core loop)              │   │
│  │                        context, hooks)                               │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│          ┌─────────────────────────┼─────────────────────────┐             │
│          ▼                         ▼                         ▼             │
│  ┌──────────────┐         ┌──────────────┐         ┌──────────────┐        │
│  │   RESOURCES  │         │     CORE     │         │    TOOLS     │        │
│  │              │         │              │         │              │        │
│  │ • Aliases    │         │ • TOAD Loop  │         │ • Generic    │        │
│  │ • Registry   │         │ • LLM        │         │ • 8-tool API │        │
│  │ • Providers  │         │ • Providers  │         │ • Delegation │        │
│  └──────────────┘         └──────────────┘         └──────────────┘        │
│          │                         │                         │             │
│          └─────────────────────────┼─────────────────────────┘             │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         INFRASTRUCTURE                               │   │
│  │                                                                      │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐   │   │
│  │  │ Context │  │  Hooks  │  │ Skills  │  │  HTTP   │  │  BTCP   │   │   │
│  │  │ Manager │  │ Manager │  │ Inject  │  │ Handler │  │ Client  │   │   │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘  └─────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## TOAD Pattern: Message Round Trip

The core loop follows the **TOAD pattern** - a structured approach to agentic execution:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        TOAD LOOP - MESSAGE ROUND TRIP                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  User Message: "Click the login button and fill in the form"                │
│                              │                                              │
│                              ▼                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ ╔══════════════════════════════════════════════════════════════════╗ │  │
│  │ ║                         T H I N K                                 ║ │  │
│  │ ╠══════════════════════════════════════════════════════════════════╣ │  │
│  │ ║                                                                  ║ │  │
│  │ ║  • Fetch state snapshot (current context)                        ║ │  │
│  │ ║  • Build awareness (what exists, available actions)              ║ │  │
│  │ ║  • Inject context (skills, task state, corrections)              ║ │  │
│  │ ║  • Age tool results (3-stage lifecycle)                          ║ │  │
│  │ ║  • Format user message with awareness                            ║ │  │
│  │ ║                                                                  ║ │  │
│  │ ╚══════════════════════════════════════════════════════════════════╝ │  │
│  │                              │                                       │  │
│  │                              ▼                                       │  │
│  │                   ┌─────────────────────┐                            │  │
│  │                   │    LLM GENERATION   │                            │  │
│  │                   │  (Gemini/OpenAI/    │                            │  │
│  │                   │   Anthropic)        │                            │  │
│  │                   └─────────────────────┘                            │  │
│  │                              │                                       │  │
│  │              ┌───────────────┴───────────────┐                       │  │
│  │              ▼                               ▼                       │  │
│  │     ┌─────────────────┐             ┌─────────────────┐              │  │
│  │     │  Text Response  │             │   Tool Calls    │              │  │
│  │     │  (no tools)     │             │  (generic)      │              │  │
│  │     └────────┬────────┘             └────────┬────────┘              │  │
│  │              │                               │                       │  │
│  │              ▼                               ▼                       │  │
│  │ ╔════════════════════════╗    ╔══════════════════════════════════╗  │  │
│  │ ║       D E C I D E      ║    ║            A C T                 ║  │  │
│  │ ╠════════════════════════╣    ╠══════════════════════════════════╣  │  │
│  │ ║                        ║    ║                                  ║  │  │
│  │ ║  • type: "complete"    ║    ║  For each tool call:             ║  │  │
│  │ ║  • Return summary      ║    ║  • Validate via hooks (pre)      ║  │  │
│  │ ║  • End loop            ║    ║  • Execute via adapter            ║  │  │
│  │ ║                        ║    ║  • Emit events (post)            ║  │  │
│  │ ╚════════════════════════╝    ║  • Check for interruption        ║  │  │
│  │              │                ║                                  ║  │  │
│  │              ▼                ╚══════════════════════════════════╝  │  │
│  │         ┌────────┐                           │                      │  │
│  │         │  DONE  │                           ▼                      │  │
│  │         └────────┘            ╔══════════════════════════════════╗  │  │
│  │                               ║          O B S E R V E           ║  │  │
│  │                               ╠══════════════════════════════════╣  │  │
│  │                               ║                                  ║  │  │
│  │                               ║  • Add results to lifecycle      ║  │  │
│  │                               ║  • Validate for echo poisoning   ║  │  │
│  │                               ║  • Update history (capped)       ║  │  │
│  │                               ║  • Invalidate awareness cache    ║  │  │
│  │                               ║  • Save checkpoint if due        ║  │  │
│  │                               ║                                  ║  │  │
│  │                               ╚══════════════════════════════════╝  │  │
│  │                                              │                      │  │
│  │                                              ▼                      │  │
│  │                               ╔══════════════════════════════════╗  │  │
│  │                               ║          D E C I D E             ║  │  │
│  │                               ╠══════════════════════════════════╣  │  │
│  │                               ║                                  ║  │  │
│  │                               ║  Check in order:                 ║  │  │
│  │                               ║  1. Cancelled? → stop            ║  │  │
│  │                               ║  2. Interrupted? → pause         ║  │  │
│  │                               ║  3. Too many errors? → fail      ║  │  │
│  │                               ║  4. Max iterations? → timeout    ║  │  │
│  │                               ║  5. Otherwise → continue         ║  │  │
│  │                               ║                                  ║  │  │
│  │                               ╚══════════════════════════════════╝  │  │
│  │                                              │                      │  │
│  │                       ┌──────────────────────┴──────────────────┐   │  │
│  │                       ▼                                         ▼   │  │
│  │              ┌─────────────────┐                       ┌────────┐   │  │
│  │              │    CONTINUE     │                       │  STOP  │   │  │
│  │              │  (next iteration)│                       │        │   │  │
│  │              └────────┬────────┘                       └────────┘   │  │
│  │                       │                                             │  │
│  │                       └──────────────► THINK (loop back)            │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Quick Start

```typescript
import { createAgentSession, createBTCPAdapter } from '@btcp/ai-agents';

// Create session with adapter
const session = await createAgentSession({
  adapter: createBTCPAdapter({ serverUrl: 'http://localhost:8765' }),
  model: 'balanced',
});

// Streaming (recommended for UIs)
for await (const event of session.run('Analyze the page and click login')) {
  switch (event.type) {
    case 'thinking': console.log('Thinking:', event.message); break;
    case 'tool_call': console.log('Tool:', event.tool); break;
    case 'complete': console.log('Done:', event.summary); break;
  }
}

// Simple (result only)
const result = await session.execute('Fill in the registration form');
console.log(result.success ? result.summary : result.errors);

// Cleanup
await session.close();
```

## Package Structure

```
src/
├── agent-sdk/               # Core domain-agnostic framework
│   ├── session.ts           # Session-based API (primary interface)
│   ├── core/                # TOAD loop implementation
│   │   ├── loop/            # TOAD phases (think, act, observe, decide)
│   │   └── providers/       # LLM providers (Gemini, OpenAI)
│   ├── agents/              # Agent definitions & prompts
│   ├── tools/               # Generic 8-tool API
│   ├── context/             # Context & memory management (6-tier)
│   ├── resources/           # @alias resolution
│   ├── skills/              # Auto-injecting skills
│   └── hooks/               # Pre/post execution hooks
│
├── browser-agent/           # Browser-specific integration (BTCP)
│   ├── btcp/                # Browser Tool Calling Protocol client
│   ├── adapters/            # BTCP & MCP adapters
│   └── http/                # HTTP handlers
│
├── planning/                # Orchestration & delegation
├── tracing/                 # OpenTelemetry-compatible tracing
└── benchmarks/              # Performance benchmarking
```

## Key Concepts

### TOAD Phases

| Phase | Responsibility |
|-------|---------------|
| **THINK** | Gather context, build awareness, prepare user message |
| **ACT** | Execute tool calls via adapter, handle blocking/interruption |
| **OBSERVE** | Process results, update state, validate for echo poisoning |
| **DECIDE** | Determine continuation: continue, complete, fail, timeout |

### 8-Tool Generic API

| Tool | Purpose |
|------|---------|
| `context_read` | Read from agent context, memory, or history |
| `context_write` | Write to agent context or memory |
| `context_search` | Search through context and history |
| `task_execute` | Execute actions through the adapter |
| `state_snapshot` | Capture state checkpoint for rollback |
| `agent_delegate` | Delegate to specialized sub-agent |
| `agent_plan` | Create/update execution plans |
| `agent_clarify` | Request user clarification |

### ActionAdapter Interface

The adapter pattern enables domain-agnostic operation. Implement `ActionAdapter` to connect to any backend:

```typescript
interface ActionAdapter {
  execute<T>(action: string, params: Record<string, unknown>): Promise<ActionResult<T>>;
  getAvailableActions(): ActionDefinition[];
  getState(): Promise<StateSnapshot>;
  getAwareness(): Promise<AwarenessContext>;
  connect(): Promise<boolean>;
  disconnect(): void;
}
```

Built-in adapters:
- **BTCPAdapter** - Browser Tool Calling Protocol (primary)
- **MCPAdapter** - Model Context Protocol (legacy)
- **NoOpAdapter** - Testing/development

### Subagent Delegation

Generic specialist agents for task decomposition:
- **planner** - Break down complex tasks into steps
- **executor** - Carry out planned steps efficiently
- **analyzer** - Examine data and identify patterns
- **explorer** - Discover context and map structure

## Package Exports

```typescript
import { ... } from '@btcp/ai-agents';              // Main entry
import { ... } from '@btcp/ai-agents/agent-sdk';     // Core SDK
import { ... } from '@btcp/ai-agents/browser-agent';  // Browser integration
import { ... } from '@btcp/ai-agents/core';           // TOAD loop
import { ... } from '@btcp/ai-agents/tools';          // Generic tools
import { ... } from '@btcp/ai-agents/context';        // Context management
import { ... } from '@btcp/ai-agents/resources';      // @alias resolution
import { ... } from '@btcp/ai-agents/skills';         // Skill injection
import { ... } from '@btcp/ai-agents/hooks';          // Execution hooks
import { ... } from '@btcp/ai-agents/types';          // TypeScript types
```

## Environment Variables

```bash
GOOGLE_API_KEY=...      # Gemini (primary)
OPENAI_API_KEY=...      # OpenAI (optional)
ANTHROPIC_API_KEY=...   # Anthropic (optional)
BTCP_SERVER_URL=...     # BTCP server for remote browser tools (optional)
```

## Development

```bash
pnpm dev              # Start dev server (port 4111)
pnpm test             # Run unit tests
pnpm test:all         # Run all tests
pnpm build            # Build package
pnpm benchmark        # Run benchmarks
```

## License

MIT
