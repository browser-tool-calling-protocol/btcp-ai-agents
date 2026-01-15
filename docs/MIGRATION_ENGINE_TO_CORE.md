# Migration Plan: Engine to Core

This document outlines the migration of implementation code from `engine/` to `core/`, making `core/` the native implementation with SDK-aligned API.

## Current Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         core/ (SDK Interface)                   │
│  query.ts, session.ts, delegation.ts (wrappers)                │
│  hooks.ts, messages.ts, options.ts, tools.ts, agents.ts        │
└───────────────────────────────┬─────────────────────────────────┘
                                │ imports orchestrate()
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                     planning/orchestration.ts                    │
│  orchestrate() - thin wrapper around runAgenticLoop()        │
└───────────────────────────────┬─────────────────────────────────┘
                                │ imports runAgenticLoop()
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      engine/ (Implementation)                    │
│  loop.ts (1700+ lines), delegation.ts, consumption.ts          │
│  ai-sdk-client.ts, providers/, constants.ts                    │
└─────────────────────────────────────────────────────────────────┘
```

## Target Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    core/ (Native Implementation)                │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Public API (SDK-aligned)                                  │  │
│  │ query.ts, session.ts, delegation.ts                       │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Execution Engine (moved from engine/)                     │  │
│  │ loop.ts → execution.ts                                    │  │
│  │ providers/ → providers/                                   │  │
│  │ ai-sdk-client.ts → client.ts                              │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Support Modules                                           │  │
│  │ hooks.ts, messages.ts, options.ts, tools.ts, agents.ts   │  │
│  │ constants.ts, utils.ts                                    │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│               engine/ (Backward Compatibility Layer)            │
│  Re-exports from core/ with deprecated warnings                │
└─────────────────────────────────────────────────────────────────┘
```

## File Mapping

| From (engine/)           | To (core/)                | Notes                           |
|--------------------------|---------------------------|----------------------------------|
| loop.ts                  | execution.ts              | Main agentic loop               |
| consumption.ts           | (merge into query/session)| Consumption patterns            |
| delegation.ts            | delegation.ts             | Native implementation           |
| ai-sdk-client.ts         | client.ts                 | AI SDK client                   |
| providers/index.ts       | providers/index.ts        | Provider factory                |
| providers/base.ts        | providers/base.ts         | Base provider interface         |
| providers/google.ts      | providers/google.ts       | Google Gemini provider          |
| providers/openai.ts      | providers/openai.ts       | OpenAI provider                 |
| providers/factory.ts     | providers/factory.ts      | Provider factory                |
| constants.ts             | constants.ts              | Merge with existing             |
| response-extractor.ts    | utils.ts                  | Merge into utils                |
| google-direct.ts         | (remove)                  | Deprecated, use providers       |

## Migration Steps

### Phase 1: Move Core Execution Engine

1. **Create `core/execution.ts`** from `engine/loop.ts`
   - Rename `runAgenticLoop` to `execute` (SDK-aligned naming)
   - Update imports to use `core/` relative paths
   - Export both new name and legacy alias

2. **Create `core/providers/`** from `engine/providers/`
   - Copy all provider files
   - Update imports

3. **Create `core/client.ts`** from `engine/ai-sdk-client.ts`
   - Update imports

### Phase 2: Update Query/Session to Use Native Execution

1. **Update `core/query.ts`**
   - Replace `import { orchestrate }` with direct execution
   - Inline the orchestration logic (it's minimal)

2. **Update `core/session.ts`**
   - Same as query.ts

### Phase 3: Migrate Delegation

1. **Move implementation to `core/delegation.ts`**
   - Remove wrapper pattern (re-exports)
   - Move actual implementation code
   - Keep SDK-aligned types

### Phase 4: Merge Constants and Utils

1. **Merge `engine/constants.ts` into `core/constants.ts`**
   - Add any missing constants
   - Keep SDK-aligned naming

2. **Merge `engine/response-extractor.ts` into `core/utils.ts`**
   - Add extraction functions

### Phase 5: Create Backward Compatibility Layer

1. **Update `engine/index.ts`**
   - Re-export everything from `core/`
   - Add deprecation warnings

2. **Update `engine/loop.ts`**
   - Re-export from `core/execution.ts`

3. **Update other engine files**
   - Point to core equivalents

### Phase 6: Update Main Entry Point

1. **Update `src/index.ts`**
   - Primary exports from `core/`
   - Remove duplicate exports from `engine/`

## API Changes

### New SDK-Aligned API (core/)

```typescript
// Query API (V1)
import { query, prompt, runQuery, streamQuery } from '@waiboard/ai-agents/core';

// Session API (V2)
import { createSession, resumeSession } from '@waiboard/ai-agents/core';

// Execution (internal, but exported for advanced use)
import { execute, ExecuteOptions } from '@waiboard/ai-agents/core';

// Delegation
import { delegate, delegateAll, detectAgent } from '@waiboard/ai-agents/core';
```

### Legacy API (engine/) - Deprecated

```typescript
// Still works, but shows deprecation warning
import {
  runAgenticLoop,      // → use execute() from core
  streamCanvasAgent,      // → use query() from core
  runCanvasAgent,         // → use runQuery() from core
  delegateToSubAgent,     // → use delegate() from core
} from '@waiboard/ai-agents/engine';
```

## Implementation Notes

### Loop Execution Refactoring

The `runAgenticLoop` function (~1700 lines) needs to be refactored into smaller, composable functions:

```typescript
// core/execution.ts

export interface ExecuteOptions {
  canvasId: string;
  model?: ModelId;
  tools?: ToolsOption;
  hooks?: HookConfig[];
  maxIterations?: number;
  // ... SDK-aligned options
}

export async function* execute(
  task: string,
  options: ExecuteOptions
): AsyncGenerator<SDKMessage> {
  // Initialize execution context
  const context = await initializeContext(options);

  // Run the agentic loop
  for await (const event of agenticLoop(task, context)) {
    yield agentEventToSDKMessage(event);
  }
}

// Internal functions (not exported)
async function initializeContext(options: ExecuteOptions): Promise<ExecutionContext> { ... }
async function* agenticLoop(task: string, context: ExecutionContext): AsyncGenerator<AgentEvent> { ... }
async function executeToolCall(tool: string, input: unknown, context: ExecutionContext): Promise<unknown> { ... }
```

### Delegation Refactoring

```typescript
// core/delegation.ts

export interface DelegateOptions {
  agent: AgentType;
  task: string;
  skill?: DomainSkill;
  canvasId?: string;
  context?: string;
}

export async function delegate(options: DelegateOptions): Promise<DelegateResult> {
  // Native implementation (moved from engine/delegation.ts)
}

export async function delegateAll(tasks: DelegateOptions[]): Promise<DelegateResult[]> {
  return Promise.all(tasks.map(delegate));
}
```

## Testing Strategy

1. **Unit Tests**: Each migrated module needs unit tests
2. **Integration Tests**: Test the full query/session flow
3. **Backward Compatibility Tests**: Ensure engine/ imports still work

## Rollout Plan

1. Create branch `refactor/engine-to-core`
2. Implement Phase 1-2 (core execution)
3. Run tests, fix issues
4. Implement Phase 3-4 (delegation, constants)
5. Run tests, fix issues
6. Implement Phase 5-6 (backward compat, entry point)
7. Run full test suite
8. Review and merge

## Success Criteria

- [ ] All exports from `core/` work with SDK-aligned API
- [ ] All tests pass
- [ ] No breaking changes for existing `engine/` imports
- [ ] Deprecation warnings show for legacy imports
- [ ] Bundle size is not increased
- [ ] Performance is not degraded
