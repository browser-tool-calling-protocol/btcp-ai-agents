# Complexity Handling Strategy

How the agentic loop handles different complexity levels, inspired by Claude Code's approach to complex projects.

## Overview: Claude Code's Pattern

When Claude Code handles complex projects, it follows this pattern:

```
┌─────────────────────────────────────────────────────────────────┐
│                     User Request                                │
│   "Build a full-stack app with auth, database, and tests"      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    PLAN MODE                                     │
│   • Analyze scope and complexity                                │
│   • Break into discrete tasks                                   │
│   • Identify dependencies                                       │
│   • Write plan to file                                          │
│   • Get user approval (ExitPlanMode)                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   TODO TRACKING                                  │
│   • Create work items (TodoWrite)                               │
│   • Mark items in_progress → completed                         │
│   • User sees real-time progress                                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   TASK DELEGATION                                │
│   • Spawn sub-agents for complex subtasks                       │
│   • Run independent tasks in PARALLEL                           │
│   • Run dependent tasks SEQUENTIALLY                            │
│   • Collect and merge results                                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   ASSEMBLY & POLISH                              │
│   • Verify all subtasks completed                               │
│   • Apply consistency passes                                    │
│   • Final quality checks                                        │
└─────────────────────────────────────────────────────────────────┘
```

## Complexity Classification

### Simple (1-3 sections, no dependencies)

**Characteristics:**
- Single-purpose request
- No data dependencies
- < 10 words in request
- 0-1 specialist needed

**Example:**
> "Create a blue rectangle"

**Handling:**
```typescript
// Direct execution - no planning phase
for await (const event of runAgenticLoop(task, canvasId, options)) {
  yield event;
}
```

**Loop behavior:**
1. Single Think → Act → Observe cycle
2. No delegation
3. 1-3 iterations max

---

### Moderate (3-6 sections, light dependencies)

**Characteristics:**
- Multi-step but predictable
- Some sections depend on header/layout
- 10-30 words in request
- 1-2 specialists needed

**Example:**
> "Create an infographic about coffee with statistics and a comparison chart"

**Handling:**
```typescript
// Light planning + sequential delegation
const plan = analyzeInfographicRequest(task);

// Foundation phase (sequential)
await executeSectionSequentially(plan.sections.filter(s => s.type === 'header'));

// Content phase (can parallelize simple sections)
const contentSections = plan.sections.filter(s => s.complexity !== 'high');
if (canParallelize(contentSections)) {
  await delegateParallel(contentSections.map(toRequest), executor);
} else {
  await executeSequentially(contentSections);
}

// Assembly phase
await applyPolish(plan);
```

**Loop behavior:**
1. Quick planning pass
2. 2-3 phases of execution
3. Some parallel delegation
4. 5-10 iterations total

---

### Complex (6+ sections, heavy dependencies)

**Characteristics:**
- Multi-faceted request
- Complex data dependencies
- > 30 words in request
- 3+ specialists needed
- Requires user approval

**Example:**
> "Create a detailed infographic about renewable energy including a timeline of adoption since 1990, comparison of solar vs wind vs hydro, cost reduction charts, a world map showing adoption by country, key statistics, and future projections"

**Handling:**
```typescript
// Full planning mode
const plan = analyzeInfographicRequest(task);

// Emit plan for user review (like Claude Code's plan file)
yield {
  type: 'plan',
  requiresApproval: true,
  phases: plan.phases,
  estimatedTokens: plan.estimatedTokens,
};

// Wait for approval (in real implementation)

// Phase 0: Foundation (SEQUENTIAL)
for (const section of foundationSections) {
  await delegateToAgent(toRequest(section), executor);
}

// Phase 1: Independent Content (PARALLEL)
const independentResults = await delegateParallel(
  independentSections.map(toRequest),
  executor
);

// Phase 2: Dependent Content (SEQUENTIAL with context)
for (const section of dependentSections) {
  const context = buildContextFromResults(section.dependsOn, completedResults);
  await delegateToAgent(toRequest(section, context), executor);
}

// Phase 3: Assembly (SEQUENTIAL)
await layoutSpecialist.arrange(allSections);
await styleSpecialist.polish(plan);
await finalValidation(plan);
```

**Loop behavior:**
1. Full planning with user approval
2. 4+ execution phases
3. Heavy parallel delegation
4. Cross-phase context passing
5. 15-30+ iterations total

---

## Execution Strategies

### 1. Direct Execution (Simple)

```
User Task → Think → Act → Observe → Complete
              │
              └─→ Single iteration, no branching
```

### 2. Sequential Delegation (Moderate)

```
User Task → Plan → Phase 1 → Phase 2 → Phase 3 → Complete
                      │         │         │
                      ▼         ▼         ▼
                   Agent 1   Agent 2   Agent 3
                   (runs)    (waits)   (waits)
```

### 3. Parallel Delegation (Complex)

```
User Task → Plan → Phase 1 → Phase 2 ─────────→ Phase 3 → Complete
                      │         │                  │
                      ▼         ├─→ Agent 2a ─┐    ▼
                   Agent 1      │             ├─→ Merge
                      │         └─→ Agent 2b ─┘    │
                      │                            ▼
                      └────────────────────────→ Agent 3
```

### 4. Hybrid Delegation (Very Complex)

```
                    ┌─→ Agent 2a (parallel) ─┐
                    │                        │
User → Plan → P1 ───┼─→ Agent 2b (parallel) ─┼─→ Merge → P3 → P4 → Done
        │           │                        │           │
        │           └─→ Agent 2c (parallel) ─┘           │
        │                                                │
        └─→ Agent 1 (foundation, blocks P2) ────────────┘
```

---

## Dependency Graph Resolution

The system analyzes task dependencies to determine execution order:

```typescript
interface DependencyGraph {
  nodes: Section[];
  edges: Map<string, string[]>; // section → depends on
}

function resolveDependencies(sections: Section[]): ExecutionOrder {
  // Topological sort
  const inDegree = new Map<string, number>();
  const queue: Section[] = [];
  const result: Section[][] = []; // levels that can run in parallel

  // Initialize
  sections.forEach(s => {
    inDegree.set(s.id, s.dependsOn.length);
    if (s.dependsOn.length === 0) {
      queue.push(s);
    }
  });

  // Process levels
  while (queue.length > 0) {
    const level = [...queue];
    result.push(level);
    queue.length = 0;

    for (const section of level) {
      // Find sections that depend on this one
      sections
        .filter(s => s.dependsOn.includes(section.id))
        .forEach(dependent => {
          const newDegree = inDegree.get(dependent.id)! - 1;
          inDegree.set(dependent.id, newDegree);
          if (newDegree === 0) {
            queue.push(dependent);
          }
        });
    }
  }

  return result.map((level, i) => ({
    phase: i,
    parallel: level.length > 1,
    sections: level,
  }));
}
```

---

## Context Passing Between Phases

When sections depend on others, context is passed:

```typescript
interface PhaseContext {
  completedSections: Map<string, SectionResult>;
  canvasState: CanvasSnapshot;
  sharedResources: {
    colorPalette: ColorPalette;
    typography: TypographyConfig;
    spacing: SpacingConfig;
  };
}

function buildSectionContext(
  section: Section,
  phaseContext: PhaseContext
): string {
  const dependencies = section.dependsOn
    .map(id => phaseContext.completedSections.get(id))
    .filter(Boolean);

  return `
## Previous Section Results
${dependencies.map(d => `- ${d.summary}`).join('\n')}

## Current Canvas State
Elements: ${phaseContext.canvasState.elementCount}
Bounds: ${JSON.stringify(phaseContext.canvasState.bounds)}

## Shared Resources
Colors: ${JSON.stringify(phaseContext.sharedResources.colorPalette)}
  `.trim();
}
```

---

## Error Handling by Complexity

### Simple Tasks
- Fail fast on any error
- No retry logic
- Clear error message to user

### Moderate Tasks
- Retry transient errors (network, rate limits)
- Skip non-critical sections on failure
- Continue with degraded result

### Complex Tasks
- Comprehensive retry with backoff
- Fallback strategies per section type
- Partial completion acceptable
- User notification of skipped sections
- Recovery checkpoints

```typescript
interface RecoveryStrategy {
  maxRetries: number;
  backoffMs: number[];
  fallbackAgents: AgentType[];
  skipOnFailure: boolean;
  notifyUser: boolean;
}

const RECOVERY_BY_COMPLEXITY: Record<Complexity, RecoveryStrategy> = {
  simple: {
    maxRetries: 1,
    backoffMs: [1000],
    fallbackAgents: [],
    skipOnFailure: false,
    notifyUser: true,
  },
  moderate: {
    maxRetries: 2,
    backoffMs: [1000, 2000],
    fallbackAgents: ['canvas-agent'],
    skipOnFailure: true,
    notifyUser: true,
  },
  complex: {
    maxRetries: 3,
    backoffMs: [1000, 2000, 4000],
    fallbackAgents: ['canvas-agent', 'style-specialist'],
    skipOnFailure: true,
    notifyUser: true,
  },
};
```

---

## Token Budget Allocation

Tokens are allocated based on complexity and section count:

```typescript
interface TokenAllocation {
  systemPrompt: number;      // Fixed overhead
  planningPhase: number;     // Analysis and planning
  perSection: number;        // Per-section budget
  mergePhase: number;        // Final assembly
  buffer: number;            // Safety buffer
}

function allocateTokens(plan: InfographicPlan): TokenAllocation {
  const totalBudget = 200_000; // Claude's context window

  switch (plan.complexity) {
    case 'simple':
      return {
        systemPrompt: 2000,
        planningPhase: 0,        // No planning for simple
        perSection: 3000,
        mergePhase: 1000,
        buffer: 4000,
      };

    case 'moderate':
      return {
        systemPrompt: 2000,
        planningPhase: 1000,
        perSection: 2500,
        mergePhase: 2000,
        buffer: 5000,
      };

    case 'complex':
      // More sections = less per section
      const sectionBudget = Math.min(
        3000,
        (totalBudget - 15000) / plan.sections.length
      );
      return {
        systemPrompt: 3000,
        planningPhase: 2000,
        perSection: sectionBudget,
        mergePhase: 3000,
        buffer: 7000,
      };
  }
}
```

---

## Real-World Example: "Marketing Campaign Infographic"

### Request
> "Create a marketing campaign infographic for our Q4 product launch. Include: company logo header, 3 key statistics about market opportunity, a timeline of launch phases, comparison of our product vs competitors, customer testimonial quote, and a call-to-action footer"

### Analysis Result
```typescript
{
  complexity: 'complex',
  sections: [
    { type: 'header', agent: 'typography', complexity: 'low' },
    { type: 'statistics', agent: 'canvas', complexity: 'medium' },
    { type: 'timeline', agent: 'diagram', complexity: 'high' },
    { type: 'comparison', agent: 'layout', complexity: 'medium' },
    { type: 'quote', agent: 'typography', complexity: 'low' },
    { type: 'footer', agent: 'typography', complexity: 'low' },
  ],
  phases: [
    { name: 'Foundation', sections: ['header'], parallel: false },
    { name: 'Content', sections: ['statistics', 'quote'], parallel: true },
    { name: 'Complex', sections: ['timeline', 'comparison'], parallel: true },
    { name: 'Assembly', sections: ['footer'], parallel: false },
  ],
  estimatedTokens: 15000,
  requiresApproval: true,
}
```

### Execution Flow
```
1. [PLAN] → Emit plan, wait for approval
2. [PHASE 0] → Create header (sequential, typography-specialist)
3. [PHASE 1] → Statistics + Quote (PARALLEL, canvas + typography)
4. [PHASE 2] → Timeline + Comparison (PARALLEL, diagram + layout)
5. [PHASE 3] → Footer + Polish (sequential, style-specialist)
6. [COMPLETE] → Emit final summary
```

---

## Summary: Key Principles

1. **Plan Before Execute** - Complex tasks require upfront analysis
2. **Parallelize Independence** - Run independent sections concurrently
3. **Sequence Dependencies** - Respect dependency order
4. **Pass Context Forward** - Share results between phases
5. **Graceful Degradation** - Handle failures without full abort
6. **User Visibility** - Emit progress events throughout
7. **Token Awareness** - Budget allocation based on complexity
