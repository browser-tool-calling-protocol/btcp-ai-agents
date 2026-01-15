# Context Isolation: How Claude Code Handles Complex Tasks

## The Problem

When delegating complex tasks to sub-agents, several issues arise:

### 1. Context Pollution
```
Parent Agent Context:
├─ User conversation (50 messages)
├─ Previous tool results (large JSON)
├─ System prompt
└─ Sub-agent internal reasoning ← POLLUTION!
    └─ 20 iterations of thinking
    └─ Failed attempts
    └─ Debug output
```

The parent doesn't need to see the sub-agent's internal thought process.

### 2. Token Budget Waste
```
Without Isolation:
├─ Parent context: 10,000 tokens
├─ Sub-agent A reasoning: 5,000 tokens  ← Leaks back
├─ Sub-agent B reasoning: 5,000 tokens  ← Leaks back
└─ Total parent context: 20,000 tokens  ← Bloated!

With Isolation:
├─ Parent context: 10,000 tokens
├─ Sub-agent A: [isolated, returns 100 token summary]
├─ Sub-agent B: [isolated, returns 100 token summary]
└─ Total parent context: 10,200 tokens  ← Clean!
```

### 3. Canvas Conflicts
```
Without Region Scoping:
├─ Sub-agent A creates element at (100, 100)
├─ Sub-agent B creates element at (100, 100)  ← CONFLICT!
└─ Elements overlap, layout broken

With Region Scoping:
├─ Sub-agent A works in Frame "section-1"
├─ Sub-agent B works in Frame "section-2"
└─ No conflicts possible
```

### 4. Complex Reasoning Needs
```
Simple Task: "Create a blue rectangle"
├─ Think: 1 iteration
└─ Execute: 1 tool call

Complex Task: "Design an infographic about quantum computing"
├─ Think: What is quantum computing?
├─ Think: What are the key concepts?
├─ Think: How to visualize superposition?
├─ Think: What layout works best?
├─ Think: Which elements to create first?
└─ Execute: After extensive reasoning
```

---

## Claude Code's Solution: Task Tool Pattern

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        PARENT AGENT                                      │
│                                                                          │
│  Conversation History:                                                   │
│  ├─ User: "Create a complex infographic"                                │
│  ├─ Assistant: "I'll delegate this to specialists"                      │
│  ├─ [Task Tool Call] ─────────────────────────────┐                     │
│  ├─ [Task Result: { success: true, summary }]     │ ONLY RESULT         │
│  └─ Assistant: "The infographic is complete"      │ RETURNS!            │
│                                                   │                     │
└───────────────────────────────────────────────────│─────────────────────┘
                                                    │
                          ┌─────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     ISOLATED SUB-AGENT CONTEXT                          │
│                                                                          │
│  Fresh Conversation (NOT shared with parent):                            │
│  ├─ System: "You are a diagram specialist..."                           │
│  ├─ User: "Create a timeline for quantum computing"                     │
│  ├─ Assistant: <thinking>Let me analyze...</thinking>                   │
│  ├─ Assistant: [canvas_write] { ... }                                   │
│  ├─ Tool Result: { created: ["elem-1", "elem-2"] }                      │
│  ├─ Assistant: <thinking>Now I need arrows...</thinking>                │
│  ├─ Assistant: [canvas_write] { ... }                                   │
│  ├─ Tool Result: { created: ["elem-3"] }                                │
│  └─ Assistant: "Complete - created timeline with 3 elements"            │
│                                                                          │
│  ───────────────────────────────────────────────────────────            │
│  RETURNS TO PARENT:                                                      │
│  {                                                                       │
│    success: true,                                                        │
│    summary: "Created timeline with 3 elements",                         │
│    elementIds: ["elem-1", "elem-2", "elem-3"]                           │
│  }                                                                       │
│                                                                          │
│  DISCARDED (not returned):                                              │
│  - All thinking blocks                                                   │
│  - All intermediate tool results                                         │
│  - All conversation messages                                             │
└─────────────────────────────────────────────────────────────────────────┘
```

### Key Mechanisms

#### 1. Contract-Based Interface

Sub-agents receive a **contract**, not raw context:

```typescript
interface SubAgentContract {
  // What to do
  task: string;

  // Where to work (isolation)
  workRegion: {
    frameId: string;  // Work only in this frame
    bounds: { x, y, width, height };
  };

  // Inputs (minimal, structured)
  inputs: {
    data: { /* structured data */ };
    style: { colorPalette, typography };
  };

  // Expected output
  expectedOutput: {
    type: "elements";
    minElements: 5;
  };

  // Resource limits
  limits: {
    maxIterations: 10;
    maxTokens: 4000;
  };
}
```

#### 2. Two-Phase Execution

Complex tasks benefit from separating thinking from doing:

```
Phase 1: REASONING (No Tools)
├─ Receive contract
├─ Analyze requirements
├─ Create detailed plan
├─ Identify risks
├─ Estimate resources
└─ Return: ReasoningResult

Phase 2: EXECUTION (With Tools)
├─ Follow the plan
├─ Execute tool calls
├─ Track created elements
└─ Return: IsolatedSubAgentResult
```

**Why Two Phases?**

1. **Better Plans** - Thinking without pressure to act leads to better strategies
2. **Early Abort** - Can stop before wasting tokens on doomed execution
3. **Resource Estimation** - Know token budget needed before committing
4. **Risk Identification** - Catch issues before they cause failures

#### 3. Scoped Canvas Operations

Sub-agents operate within bounded regions:

```typescript
// Original executor
executor.execute("canvas_write", {
  tree: { type: "rectangle", x: 100, y: 100 }
});
// Could write ANYWHERE on canvas

// Scoped executor
scopedExecutor.execute("canvas_write", {
  tree: { type: "rectangle", x: 100, y: 100 }
});
// Automatically constrained to assigned frame/region
```

#### 4. Result Aggregation (Not Context Merging)

```typescript
// BAD: Merging contexts
parentContext.push(...subAgentA.allMessages);
parentContext.push(...subAgentB.allMessages);
// Context grows exponentially!

// GOOD: Aggregating results
const resultA = await executeIsolatedSubAgent(contractA);
const resultB = await executeIsolatedSubAgent(contractB);
// Parent only sees: resultA.summary + resultB.summary
```

---

## Implementation Patterns

### Pattern 1: Simple Delegation (Current)

```typescript
// Parent sees all events
for await (const event of delegateToAgent(request, executor)) {
  yield event;  // ALL events pass through
}
```

**Use when:**
- Task is simple (< 5 iterations)
- Parent needs to monitor progress
- Token budget isn't a concern

### Pattern 2: Isolated Delegation (New)

```typescript
// Parent only sees result
const result = await executeIsolatedSubAgent(contract, config);
yield { type: "step_complete", summary: result.summary };
```

**Use when:**
- Task is complex (> 10 iterations)
- Parent doesn't need internal details
- Token budget is constrained
- Multiple sub-agents work in parallel

### Pattern 3: Two-Phase Isolated

```typescript
// Phase 1: Plan without executing
const plan = await executeReasoningPhase(contract, config);

if (!plan.shouldProceed) {
  yield { type: "blocked", reason: plan.blockingReason };
  return;
}

// Phase 2: Execute with plan
const result = await executeIsolatedTask(contract, plan, config);
```

**Use when:**
- Task requires extensive reasoning
- Early abort saves significant resources
- Plan needs user approval before execution

---

## Example: Complex Infographic

### Without Isolation

```
User: "Create infographic about AI history"

Parent Agent Context (grows to 50,000 tokens):
├─ System prompt: 2,000 tokens
├─ User message: 100 tokens
├─ Header specialist thinking: 3,000 tokens      ← WASTED
├─ Header specialist tool calls: 2,000 tokens    ← WASTED
├─ Timeline specialist thinking: 8,000 tokens    ← WASTED
├─ Timeline specialist tool calls: 5,000 tokens  ← WASTED
├─ Statistics specialist thinking: 4,000 tokens  ← WASTED
├─ Statistics specialist tool calls: 3,000 tokens← WASTED
├─ ... more specialists ...
└─ Final response: 500 tokens

Problem: Context full, can't do final polish pass!
```

### With Isolation

```
User: "Create infographic about AI history"

Parent Agent Context (stays at 5,000 tokens):
├─ System prompt: 2,000 tokens
├─ User message: 100 tokens
├─ Plan: 500 tokens
├─ Header result: { success: true, elementIds: [...] } - 100 tokens
├─ Timeline result: { success: true, elementIds: [...] } - 100 tokens
├─ Statistics result: { success: true, elementIds: [...] } - 100 tokens
├─ ... more results ...
└─ Final polish + response: 2,000 tokens

Isolated contexts (executed and discarded):
├─ Header specialist: 5,000 tokens (isolated)
├─ Timeline specialist: 13,000 tokens (isolated)
├─ Statistics specialist: 7,000 tokens (isolated)
└─ ... each isolated, not added to parent

Benefit: Parent has room for final polish!
```

---

## Code Example

```typescript
import {
  executeIsolatedSubAgent,
  executeParallelIsolated,
  type SubAgentContract,
} from '@waiboard/ai-agents/planning';

// Create contracts for isolated execution
const timelineContract: SubAgentContract = {
  contractId: 'timeline-section',
  agentType: 'diagram-specialist',
  task: 'Create a timeline showing AI milestones from 1950-2024',
  workRegion: {
    canvasId: 'main-canvas',
    frameId: 'timeline-frame', // Isolated region!
  },
  inputs: {
    data: {
      events: [
        { year: 1950, event: 'Turing Test proposed' },
        { year: 1997, event: 'Deep Blue beats Kasparov' },
        { year: 2024, event: 'Claude Opus 4.5 released' },
      ],
    },
    style: {
      colorPalette: { primary: '#3b82f6' },
    },
  },
  expectedOutput: {
    type: 'elements',
    minElements: 10,
    requiredTypes: ['rectangle', 'text', 'arrow'],
  },
  limits: {
    maxIterations: 15,
    maxTokens: 8000,
    timeoutMs: 60000,
  },
};

const statisticsContract: SubAgentContract = {
  contractId: 'stats-section',
  agentType: 'canvas-agent',
  task: 'Create statistics display with key AI metrics',
  workRegion: {
    canvasId: 'main-canvas',
    frameId: 'stats-frame', // Different isolated region!
  },
  // ... similar structure
};

// Execute in parallel isolation
const [timelineResult, statsResult] = await executeParallelIsolated(
  [timelineContract, statisticsContract],
  { executor, apiKey: process.env.ANTHROPIC_API_KEY }
);

// Parent only sees results, not internal context!
console.log(timelineResult);
// {
//   contractId: 'timeline-section',
//   success: true,
//   summary: 'Created timeline with 12 elements',
//   elementIds: ['elem-1', 'elem-2', ...],
//   bounds: { x: 0, y: 200, width: 800, height: 300 },
//   tokensUsed: 6500,
//   durationMs: 8234
// }

// Timeline's internal thinking (discarded):
// - "Let me analyze the events..."
// - "I should use a horizontal layout..."
// - "The arrows should connect each milestone..."
// - ... 15 iterations of reasoning ...
// NONE of this reaches the parent!
```

---

## Summary

| Aspect | Without Isolation | With Isolation |
|--------|-------------------|----------------|
| Context size | Grows with each sub-agent | Stays constant |
| Parent visibility | All internal details | Only results |
| Token efficiency | Low (duplicate context) | High (isolated) |
| Parallel safety | Risk of conflicts | Scoped regions |
| Complex reasoning | Pollutes parent | Contained in sub-agent |
| Error recovery | Complex state | Clean contract boundaries |

**Claude Code's key insight:** The parent agent doesn't need to know HOW the sub-agent accomplished the task, only WHAT was accomplished. This separation enables:

1. **Unlimited sub-agent complexity** - Sub-agents can think as long as needed
2. **Clean parent context** - Parent stays focused on orchestration
3. **Parallel execution** - No shared state means no conflicts
4. **Better error handling** - Failed contracts don't corrupt parent state
