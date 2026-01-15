# Prompt Efficiency Analysis: Long-Form vs Short-Form

**Core Insight:** Claude Code trusts the model. Waiboard over-specifies.

---

## The Fundamental Difference

### Claude Code Philosophy
```
Minimal instructions → Model's inherent capabilities → Great results
```

### Waiboard Current Philosophy
```
Exhaustive instructions → Constrained model behavior → Predictable but verbose results
```

---

## Token Count Comparison

| Component | Claude Code | Waiboard | Ratio |
|-----------|-------------|----------|-------|
| Main system prompt | ~2,850 tokens | ~4,500 tokens | 1.6x more |
| Tool descriptions | ~150 tokens each (separate files) | ~800 tokens (embedded) | 5x more |
| Agent prompts | ~300-500 tokens | ~800-1,200 tokens | 2-3x more |
| Reasoning structure | None (implicit) | ~400 tokens (TAOD) | ∞ |
| Examples | 2-3 one-liners | 10+ multi-line blocks | 5x more |

**Result:** Waiboard uses 2-3x more tokens for the same capabilities.

---

## What Claude Code Does Right

### 1. Trust the Model's Training

**Claude Code:**
```markdown
"Be careful not to introduce security vulnerabilities"
```

**Waiboard:**
```markdown
"Be careful not to introduce security vulnerabilities such as command injection,
XSS, SQL injection, and other OWASP top 10 vulnerabilities. If you notice that
you wrote insecure code, immediately fix it."
```

**Lesson:** Claude already knows OWASP top 10. Listing them wastes tokens and implies the model doesn't know.

### 2. Short, Imperative Constraints

**Claude Code:**
```markdown
STRICTLY PROHIBITED from:
- Creating new files
- Modifying existing files
```

**Waiboard:**
```markdown
## CRITICAL CONSTRAINTS

This is a READ-ONLY exploration task.

### STRICTLY PROHIBITED
You MUST NOT:
- Use canvas_write to create new elements
- Use canvas_edit to modify existing elements
- Use canvas_delegate to spawn writing agents
- Make any changes to the canvas state

### PERMITTED ACTIONS
You MAY ONLY:
- Use canvas_read to examine canvas state
...
```

**Lesson:** The section header, the explanation, and the "permitted" section are redundant. The model understands from the prohibition.

### 3. No Embedded Reasoning Framework

**Claude Code:** No TAOD loop, no XML tags, no reasoning structure in prompt.

**Waiboard:**
```markdown
## Reasoning Process (TAOD Loop)

For every request, structure your thinking in these phases:

### THINK Phase

<analyze>
- What is the user asking for?
- What elements currently exist?
- What constraints apply?
</analyze>

<assess_clarity>
...
</assess_clarity>

<plan>
...
</plan>

### ACT Phase
...
```

**Lesson:** Modern Claude models reason well without being told HOW to reason. The TAOD structure adds ~400 tokens and may actually constrain natural reasoning.

### 4. Minimal Examples

**Claude Code:**
```markdown
**Good:** "Let me read the file."
**Bad:** "Let me read the file:"
```

**Waiboard:**
```markdown
**Example Decision Process:**
\`\`\`
User: "Create an infographic about AI history with timeline and stats"

<analyze>
This requires:
- Header section (simple frame + text → do directly)
- Timeline with 5+ milestones (specialized diagram → delegate)
- Statistics with 4 cards (layout + styling → could delegate)
</analyze>

Decision:
1. Create header frame and title → canvas_write (simple, 1-2 calls)
2. Create timeline → canvas_delegate to timeline-specialist (specialized, 3+ calls)
3. Create stat cards → canvas_delegate to grid-specialist (layout algorithm)
   OR if simple, just canvas_write (4 elements is borderline)
\`\`\`
```

**Lesson:** One precise example beats five verbose ones.

### 5. Separation of Concerns

**Claude Code:**
```
system-prompt-main.md          # Core behavior (~2,850 tokens)
builtin-tool-Bash.md           # Loaded when Bash needed
builtin-tool-Write.md          # Loaded when Write needed
agent-prompt-explore.md        # Loaded for explore tasks
```

**Waiboard:**
```
prompts.ts                     # Everything in one file (1,437 lines)
  - TOOLS_REFERENCE            # Always loaded
  - REASONING_STRUCTURE        # Always loaded
  - CHAT_HANDLING              # Always loaded
  - COMPLEX_TASK_HANDLING      # Always loaded
  - All specialist prompts     # Always available
```

**Lesson:** Load only what's needed for the current task.

---

## The Anti-Patterns We're Using

### Anti-Pattern 1: Explaining the Obvious

```typescript
// REMOVE THIS:
"Use frames to group related content"
"Report created element IDs in your summaries"
"Be efficient: combine multiple creates when possible"

// Claude already knows these are good practices
```

### Anti-Pattern 2: Defensive Over-Specification

```typescript
// REMOVE THIS:
"If an operation fails, analyze the error and try an alternative approach"

// Claude naturally does this - telling it to is condescending
```

### Anti-Pattern 3: Redundant Structure

```typescript
// REMOVE THIS:
"### THINK Phase"
"### ACT Phase"
"### OBSERVE Phase"
"### DECIDE Phase"

// Claude thinks before acting naturally
```

### Anti-Pattern 4: Verbose Tool Documentation

```typescript
// CURRENT (too long):
### canvas_read
Read canvas state or specific elements.
- target: "canvas" | "selection" | "viewport" | element-id | { ids: [...] } | { bounds: {...} }
- format: "json" | "summary" | "tree"

// BETTER (concise):
canvas_read(target, format?) → Get canvas state. Target: "canvas"|"selection"|id|{ids}|{bounds}
```

### Anti-Pattern 5: Multiple Examples for Same Concept

```typescript
// CURRENT: 5 examples of when to clarify
// BETTER: 1 clear example + the principle
```

---

## Proposed Lean Prompt Structure

### New Main System Prompt (~800 tokens target)

```markdown
You are a canvas agent for Waiboard. Create and modify visual elements.

## Tools
- canvas_read(target, format?) - Get state
- canvas_write(elements) - Create elements
- canvas_edit(operations) - Modify elements
- canvas_find(match) - Search elements
- canvas_capture(region) - Export image
- canvas_delegate(agent, task) - Spawn specialist

## Constraints
- Read canvas before modifying
- Use frames to group content
- Batch operations when possible

## Response Style
- Concise, action-first
- Include element IDs
- No preambles

## When Unclear
Ask clarifying questions. Don't guess output type.
```

**That's it.** ~150 tokens instead of ~4,500.

### New Agent Prompts (~200 tokens each)

**Explorer:**
```markdown
You analyze canvas content. READ-ONLY.

Prohibited: canvas_write, canvas_edit, canvas_delegate
Permitted: canvas_read, canvas_find

Return findings with element IDs and positions.
```

**Designer:**
```markdown
You design canvas layouts from descriptions.

1. Identify output type (flowchart, mindmap, wireframe, etc.)
2. Plan element positions on 8px grid
3. Use canvas_write with tree structures
4. Group in frames

Return created element IDs.
```

**Executor:**
```markdown
You execute design plans on canvas.

Input: Design specification with elements and positions
Output: Created elements via canvas_write

Follow the plan exactly. Report any issues.
```

---

## Implementation Strategy

### Phase 1: Measure Current State

```typescript
// Add to loop.ts
console.log(`System prompt tokens: ${countTokens(systemPrompt)}`);
console.log(`Total context tokens: ${countTokens(fullContext)}`);
```

### Phase 2: Create Lean Prompts

```
packages/ai-agents/src/prompts/
├── v2/                        # New lean prompts
│   ├── core.md               # ~150 tokens
│   ├── agents/
│   │   ├── explorer.md       # ~100 tokens
│   │   ├── designer.md       # ~150 tokens
│   │   └── executor.md       # ~100 tokens
│   └── tools/                # Loaded on-demand
│       ├── canvas_read.md    # ~50 tokens
│       └── ...
└── v1/                        # Current prompts (keep for comparison)
```

### Phase 3: A/B Test

```typescript
const PROMPT_VERSION = process.env.PROMPT_VERSION || 'v2';

function getSystemPrompt(mode: AgentMode): string {
  if (PROMPT_VERSION === 'v2') {
    return loadLeanPrompt(mode);
  }
  return getLegacyPrompt(mode);
}
```

### Phase 4: Measure Improvements

| Metric | V1 (Current) | V2 (Lean) | Target |
|--------|--------------|-----------|--------|
| Prompt tokens | ~4,500 | ~800 | -80% |
| Response latency | X ms | ? | -30% |
| Task success rate | Y% | ? | Same or better |
| Token cost/task | $Z | ? | -50% |

---

## What to Remove Immediately

### 1. TAOD Loop Structure
The model reasons naturally. Remove all `<analyze>`, `<plan>`, `<execute>`, `<summarize>` guidance.

### 2. assess_clarity Block
Replace with single line: "If unclear, ask. Don't guess."

### 3. Verbose Examples
Keep 1 example per concept maximum.

### 4. Redundant Guidelines
Remove anything the model already knows:
- "Always use canvas_read first" → Model knows to check state
- "Create elements with meaningful positions" → Model does this
- "Be efficient" → Model optimizes naturally

### 5. Error Recovery Section
Remove explicit recovery rules. Model handles errors naturally.

### 6. Coordinate System Documentation
```markdown
// REMOVE:
## Coordinate System
- Origin: top-left (0, 0)
- X increases right, Y increases down
- Units: pixels
- Grid: 8px recommended

// Model knows standard coordinate systems
```

---

## The Core Principle

> **Tell the model WHAT to do, not HOW to think.**

Claude Code's prompts are effective because they:
1. State the goal clearly
2. List constraints concisely
3. Trust the model's capabilities
4. Load context dynamically

Waiboard's prompts are inefficient because they:
1. Explain reasoning processes the model already has
2. Include examples for every edge case
3. Document obvious behaviors
4. Load everything upfront

---

## Action Items

### Immediate (Today)
1. Measure current prompt token counts
2. Create v2/ directory with lean prompts
3. Remove TAOD structure from main prompt

### This Week
1. Implement dynamic prompt loading
2. A/B test lean vs verbose prompts
3. Measure latency and success rate differences

### This Month
1. Migrate all agents to lean prompts
2. Document token savings
3. Remove v1/ after validation

---

## Expected Outcomes

| Outcome | Improvement |
|---------|-------------|
| Prompt tokens | -70 to -80% |
| First-token latency | -20 to -30% |
| Cost per task | -40 to -50% |
| Task success rate | Same or +5% |
| Code maintainability | Significantly better |

The model is smarter than our prompts give it credit for. Trust it.
