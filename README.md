# @waiboard/ai-agents

AI agent engine for canvas operations using the **TOAD pattern** (Think, Act, Observe, Decide).

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           @waiboard/ai-agents                               │
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
│  │ • Aliases    │         │ • TOAD Loop  │         │ • canvas_*   │        │
│  │ • Registry   │         │ • LLM        │         │ • 5-tool API │        │
│  │ • Providers  │         │ • Providers  │         │ • Delegation │        │
│  └──────────────┘         └──────────────┘         └──────────────┘        │
│          │                         │                         │             │
│          └─────────────────────────┼─────────────────────────┘             │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         INFRASTRUCTURE                               │   │
│  │                                                                      │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐   │   │
│  │  │ Context │  │  Hooks  │  │ Skills  │  │  HTTP   │  │   MCP   │   │   │
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
│  User Message: "Create a flowchart with 3 steps"                            │
│                              │                                              │
│                              ▼                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ ╔══════════════════════════════════════════════════════════════════╗ │  │
│  │ ║                         T H I N K                                 ║ │  │
│  │ ╠══════════════════════════════════════════════════════════════════╣ │  │
│  │ ║                                                                  ║ │  │
│  │ ║  • Fetch canvas snapshot (current state)                         ║ │  │
│  │ ║  • Build canvas awareness (what exists, available space)         ║ │  │
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
│  │     │  (no tools)     │             │  (canvas_*)     │              │  │
│  │     └────────┬────────┘             └────────┬────────┘              │  │
│  │              │                               │                       │  │
│  │              ▼                               ▼                       │  │
│  │ ╔════════════════════════╗    ╔══════════════════════════════════╗  │  │
│  │ ║       D E C I D E      ║    ║            A C T                 ║  │  │
│  │ ╠════════════════════════╣    ╠══════════════════════════════════╣  │  │
│  │ ║                        ║    ║                                  ║  │  │
│  │ ║  • type: "complete"    ║    ║  For each tool call:             ║  │  │
│  │ ║  • Return summary      ║    ║  • Validate via hooks (pre)      ║  │  │
│  │ ║  • End loop            ║    ║  • Execute via MCP client        ║  │  │
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

### Decision Tree

```
                           ┌─────────────────┐
                           │  User Message   │
                           └────────┬────────┘
                                    │
                                    ▼
                           ┌─────────────────┐
                           │     THINK       │
                           │  Gather context │
                           └────────┬────────┘
                                    │
                                    ▼
                           ┌─────────────────┐
                           │  LLM Generate   │
                           └────────┬────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
           ┌───────────────┐               ┌───────────────┐
           │ Tool calls?   │               │ Text only?    │
           │     YES       │               │     YES       │
           └───────┬───────┘               └───────┬───────┘
                   │                               │
                   ▼                               ▼
           ┌───────────────┐               ┌───────────────┐
           │     ACT       │               │    DECIDE     │
           │ Execute tools │               │  "complete"   │
           └───────┬───────┘               └───────┬───────┘
                   │                               │
                   ▼                               ▼
           ┌───────────────┐               ┌───────────────┐
           │   OBSERVE     │               │     DONE      │
           │ Process result│               │ Return result │
           └───────┬───────┘               └───────────────┘
                   │
                   ▼
           ┌───────────────┐
           │    DECIDE     │
           └───────┬───────┘
                   │
       ┌───────────┴───────────┐
       ▼                       ▼
┌─────────────┐         ┌─────────────┐
│  continue   │         │  terminal   │
│ → THINK     │         │ → DONE      │
└─────────────┘         └─────────────┘
```

## Quick Start

```typescript
import { streamCanvasAgent, getCanvasAgentResult } from '@waiboard/ai-agents';

// Streaming (recommended for UIs)
for await (const event of streamCanvasAgent('Create a flowchart', { canvasId: 'canvas-1' })) {
  switch (event.type) {
    case 'thinking': console.log('Thinking:', event.message); break;
    case 'tool_call': console.log('Tool:', event.tool); break;
    case 'complete': console.log('Done:', event.summary); break;
  }
}

// Simple (result only)
const result = await getCanvasAgentResult('Add a rectangle', { canvasId: 'canvas-1' });
console.log(result.success ? result.summary : result.error);
```

## Package Structure

```
src/
├── core/                    # Core TOAD loop implementation
│   ├── loop/               # TOAD phases
│   │   ├── types.ts        # Shared type definitions
│   │   ├── context.ts      # Context & awareness management
│   │   ├── think.ts        # THINK phase
│   │   ├── act.ts          # ACT phase
│   │   ├── observe.ts      # OBSERVE phase
│   │   ├── decide.ts       # DECIDE phase
│   │   └── index.ts        # Main orchestrator
│   ├── providers/          # LLM providers (Gemini, OpenAI)
│   └── execution.ts        # Consumption patterns
│
├── agents/                  # Agent definitions & prompts
├── tools/                   # 5-tool canvas API
├── context/                 # Context & memory management
├── resources/               # Alias resolution (@selection, @color)
├── skills/                  # Auto-injecting skills
├── hooks/                   # Pre/post execution hooks
├── http/                    # HTTP handlers
└── planning/                # Orchestration & delegation
```

## Key Concepts

### TOAD Phases

| Phase | Responsibility |
|-------|---------------|
| **THINK** | Gather context, build awareness, prepare user message |
| **ACT** | Execute tool calls via MCP, handle blocking/interruption |
| **OBSERVE** | Process results, update state, validate for echo poisoning |
| **DECIDE** | Determine continuation: continue, complete, fail, timeout |

### 5-Tool Canvas API

| Tool | Purpose |
|------|---------|
| `canvas_read` | Get canvas state as JSON/ASCII/XML |
| `canvas_write` | Create new elements |
| `canvas_edit` | Modify existing elements |
| `canvas_find` | Search by pattern |
| `canvas_capture` | Export to image |

### Subagent Delegation

Domain specialists for creative outputs:
- **moodboard** - Visual inspiration boards
- **mindmap** - Hierarchical idea maps
- **diagram** - Flowcharts, ERDs, process diagrams
- **wireframe** - UI mockups
- **timeline** - Chronological events

## Package Exports

```typescript
import { ... } from '@waiboard/ai-agents';           // Main entry
import { ... } from '@waiboard/ai-agents/core';      // TOAD loop
import { ... } from '@waiboard/ai-agents/tools';     // Canvas tools
import { ... } from '@waiboard/ai-agents/context';   // Context management
import { ... } from '@waiboard/ai-agents/resources'; // Alias resolution
import { ... } from '@waiboard/ai-agents/skills';    // Skill injection
import { ... } from '@waiboard/ai-agents/hooks';     // Execution hooks
import { ... } from '@waiboard/ai-agents/http';      // HTTP handlers
import { ... } from '@waiboard/ai-agents/types';     // TypeScript types
```

## Environment Variables

```bash
GOOGLE_API_KEY=...      # Gemini (required for image generation)
OPENAI_API_KEY=...      # OpenAI (optional)
ANTHROPIC_API_KEY=...   # Anthropic (optional)
```

## Development

```bash
pnpm dev              # Start dev server (port 4111)
pnpm test             # Run tests
pnpm build            # Build package
```

## License

Private - Waiboard
