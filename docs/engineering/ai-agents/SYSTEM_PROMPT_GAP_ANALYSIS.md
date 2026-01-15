# System Prompt Gap Analysis: Claude Code vs Waiboard AI Agents

**Version:** 1.0
**Date:** January 2026
**Reference:** Claude Code v2.1.1 System Prompts (Piebald AI)

---

## Executive Summary

This document analyzes the gap between Claude Code's production system prompts (v2.1.1) and Waiboard's `@waiboard/ai-agents` implementation. While Waiboard has implemented many Claude Code patterns (TAOD loop, semantic routing, sub-agent delegation), several critical gaps exist in **constraint specificity**, **agent boundaries**, **response formatting**, and **safety mechanisms**.

### Key Findings

| Area | Claude Code | Waiboard | Gap Severity |
|------|-------------|----------|--------------|
| Modular Prompt Architecture | 40+ components | 7 monolithic prompts | 🔴 High |
| Agent Constraints (Read-Only) | Strict enforcement | Implicit only | 🔴 High |
| Response Formatting | CLI-optimized, concise | Verbose, flexible | 🟡 Medium |
| Error/Safety Handling | Comprehensive | Basic | 🟡 Medium |
| Task Tracking Integration | TodoWrite reminders | canvas_plan (similar) | 🟢 Low |
| Tool Documentation | Extensive examples | Good coverage | 🟢 Low |

---

## Part 1: Structural Architecture Gaps

### 1.1 Monolithic vs Modular Prompt Design

**Claude Code Approach:**
- **40+ interconnected markdown files** that compose dynamically
- Separate files for: tool descriptions, agent prompts, system reminders, slash commands
- Components loaded conditionally based on context and environment
- Enables versioning, A/B testing, and targeted updates

**Waiboard Current:**
- **Single `prompts.ts` file** (1,437 lines) with all prompts
- String templates with embedded shared components
- Changes require modifying the entire file

**Impact:** High maintenance burden, difficult to test individual components, no conditional loading.

**Recommended Fix:**
```
packages/ai-agents/src/prompts/
├── core/
│   ├── tools-reference.md
│   ├── reasoning-structure.md
│   ├── chat-handling.md
│   ├── error-recovery.md
│   └── complex-task-handling.md
├── agents/
│   ├── canvas-agent.md
│   ├── layout-specialist.md
│   ├── style-specialist.md
│   └── ...
├── tools/
│   ├── canvas_read.md
│   ├── canvas_write.md
│   └── ...
└── index.ts  # Dynamic composition
```

### 1.2 Component Composition Pattern

**Claude Code:**
```typescript
// Pseudocode based on v2.1.1 structure
const systemPrompt = compose([
  loadComponent('system-prompt-main'),
  context.planMode && loadComponent('system-reminder-plan-mode'),
  context.hasTasks && loadComponent('builtin-tool-TodoWrite'),
  ...context.enabledTools.map(t => loadComponent(`builtin-tool-${t}`)),
]);
```

**Waiboard Current:**
```typescript
// Static template composition
const BASE_SYSTEM_PROMPT = `
${CHAT_HANDLING}
${TOOLS_REFERENCE}
${REASONING_STRUCTURE}
${COMPLEX_TASK_HANDLING}
${ERROR_RECOVERY}
`;
```

**Gap:** No conditional loading, all components always included.

---

## Part 2: Agent Constraint Gaps

### 2.1 Read-Only Agent Enforcement

**Claude Code (Explore Agent):**
```markdown
**Critical Constraint:**
"This is a READ-ONLY exploration task. You are STRICTLY PROHIBITED from:
- Creating new files
- Modifying existing files
- Deleting files
- Moving or copying files
- Using any commands that change system state"

BASH is restricted to: ls, git status, git log, find, cat
```

**Claude Code (Plan Mode Agent):**
```markdown
"You are STRICTLY PROHIBITED from:
- Creating new files... Modifying existing files... Deleting files...
- Moving or copying files"
- Cannot use write operations, redirect operators, or state-changing commands
```

**Waiboard Current:**
```typescript
// packages/ai-agents/src/core/delegation.ts
{
  id: "exploring",
  allowedTools: ["canvas_read", "canvas_find"],  // Implicit restriction
  // No explicit PROHIBITION statements
}
```

**Gap:** Waiboard relies on tool whitelisting but lacks explicit prohibition statements that reinforce the constraint boundary. LLMs respond better to explicit negative constraints.

**Recommended Fix:**
```typescript
export const EXPLORING_AGENT_PROMPT = `You are a READ-ONLY canvas exploration agent.

## CRITICAL CONSTRAINTS - STRICTLY PROHIBITED
- You MUST NOT use canvas_write or canvas_edit
- You MUST NOT create, modify, or delete any canvas elements
- You MUST NOT use canvas_delegate to spawn writing agents
- Your ONLY permitted tools are: canvas_read, canvas_find

If asked to modify the canvas, respond:
"I'm an exploration-only agent. I can analyze and find elements, but modifications require a different agent."
`;
```

### 2.2 Planning Agent Boundaries

**Claude Code Pattern:**
- Planning agent is **explicitly architectural**
- Must conclude with "Critical Files for Implementation" section
- Three-phase workflow: Understand → Explore → Design
- Deliverable requirements specified

**Waiboard Gap:**
- Planning agent lacks structured output requirements
- No explicit deliverable format
- Missing "Critical Elements" requirement for canvas planning

**Recommended Addition:**
```typescript
export const PLANNING_AGENT_PROMPT = `...

## Required Deliverables

Your planning output MUST include:

### 1. Task Breakdown
- Numbered steps with clear actions
- Dependencies between steps noted

### 2. Critical Elements for Implementation
List 3-5 canvas elements that are essential to this plan:
| Element | Purpose | Dependencies |
|---------|---------|--------------|
| frame-header | Container for title section | None |
| ... | ... | ... |

### 3. Token Budget Estimate
- Estimated tool calls: X
- Recommended sub-agent: [canvas-designer|canvas-executor|direct]
`;
```

---

## Part 3: Response Formatting Gaps

### 3.1 CLI-Optimized Output

**Claude Code:**
```markdown
- "Your output will be displayed on a command line interface"
- "Your responses should be short and concise"
- "GitHub-flavored markdown formatting, rendered in monospace font"
- "Only use emojis if the user explicitly requests it"
```

**Waiboard Current:**
- No CLI optimization (renders in React chat UI)
- Allows verbose responses
- No emoji guidance

**Assessment:** This is a **contextual difference**, not a gap. Waiboard's chat UI supports rich formatting. However, the conciseness principle should be adopted.

**Recommended Addition:**
```typescript
const RESPONSE_GUIDELINES = `
## Response Style

- Keep responses **concise** - users want results, not explanations
- Lead with the action taken, follow with details if needed
- When creating multiple elements, summarize counts rather than listing all
- Use markdown for structure (headers, lists, code blocks)

**Good:** "Created a 5-node flowchart in frame_login_flow."
**Avoid:** "I have analyzed your request and determined that a flowchart would be appropriate. I will now create the following nodes..."
`;
```

### 3.2 Professional Objectivity

**Claude Code:**
```markdown
"Prioritize technical accuracy and truthfulness over validating the user's beliefs"
"Avoid using over-the-top validation or excessive praise"
"Focus on facts and problem-solving, providing direct, objective technical info"
```

**Waiboard Gap:** No equivalent guidance on tone/objectivity.

**Recommended Addition:**
```typescript
const PROFESSIONAL_OBJECTIVITY = `
## Communication Tone

- Be direct and factual, not effusively positive
- If a request is unclear, ask for clarification rather than guessing
- If an approach has trade-offs, mention them briefly
- Don't validate poor design choices - suggest improvements respectfully

**Instead of:** "Great choice! I'll definitely create that for you!"
**Use:** "I'll create a flowchart with 5 nodes for the login process."
`;
```

---

## Part 4: Tool Documentation Gaps

### 4.1 Absolute Path Requirement

**Claude Code:**
```markdown
"Agent threads always have their cwd reset between bash calls"
"Please only use absolute file paths"
"All returned file paths must be absolute, never relative"
```

**Waiboard Equivalent:**
Canvas uses element IDs rather than file paths, but a similar principle applies to canvas coordinates.

**Recommended Addition:**
```typescript
const CANVAS_COORDINATES = `
## Coordinate Consistency

- Always use ABSOLUTE canvas coordinates (x, y from origin 0,0)
- Never use relative offsets in canvas_write (only in canvas_edit with dx/dy)
- When reporting element positions, include absolute coordinates
- Frame-relative coordinates should be converted to canvas-absolute
`;
```

### 4.2 Tool Call Formatting

**Claude Code:**
```markdown
"Do not include a colon before tool calls"
"Use 'Let me read the file.' instead of 'Let me read the file:'"
```

**Waiboard Gap:** No formatting guidance for tool call narration.

**Recommended Addition:**
```typescript
const TOOL_CALL_FORMAT = `
## Narrating Tool Calls

Do NOT use colons before tool calls:
- ✅ "I'll create the flowchart now."
- ❌ "I'll create the flowchart now:"

Do NOT announce every tool call:
- ✅ Just use the tool
- ❌ "Let me now invoke canvas_write to create..."
`;
```

---

## Part 5: Safety and Error Handling Gaps

### 5.1 Security Considerations

**Claude Code:**
```markdown
"Be careful not to introduce security vulnerabilities"
"Do not commit files that likely contain secrets (.env, credentials.json)"
"NEVER generate or guess URLs unless confident"
```

**Waiboard Current:**
- No security guidance in prompts
- No handling for sensitive content on canvas

**Recommended Addition:**
```typescript
const SECURITY_GUIDELINES = `
## Security Awareness

- Do NOT create canvas elements containing API keys, passwords, or secrets
- If user asks to visualize credentials, redact sensitive portions
- Be cautious with user-provided URLs - do not fetch without explicit request
- When capturing canvas (canvas_capture), warn if sensitive data is visible
`;
```

### 5.2 Malware/Harmful Content Detection

**Claude Code System Reminder:**
```markdown
"Whenever you read a file, consider whether it would be considered malware"
"Refuse to improve or augment malicious code"
"Can still analyze existing code, write reports, or answer questions"
```

**Waiboard Gap:** No equivalent for canvas content analysis.

**Recommended Addition:**
```typescript
const CONTENT_MODERATION = `
## Content Guidelines

If asked to create content that appears to be:
- Instructions for harmful activities
- Deceptive or misleading designs (fake login screens, phishing mockups)
- Hate speech or discriminatory content

Decline politely: "I can't create that content. Would you like help with something else?"

Exception: Educational analysis of security concepts is permitted when clearly framed as such.
`;
```

---

## Part 6: Context Management Gaps

### 6.1 Task Tracking Reminders

**Claude Code:**
```markdown
<system-reminder>
The TodoWrite tool hasn't been used recently. If you're working on tasks
that would benefit from tracking progress, consider using the TodoWrite tool.
</system-reminder>
```

**Waiboard Current:**
- canvas_plan exists and is documented
- No system reminders for proactive use

**Recommended Implementation:**
Add injection point in the agentic loop:
```typescript
// In loop.ts, after N iterations without canvas_plan
if (iteration > 3 && !hasUsedCanvasPlan && estimatedTaskComplexity > 2) {
  injectSystemReminder(
    "Consider using canvas_plan to track progress on this multi-step task."
  );
}
```

### 6.2 Conversation Summarization

**Claude Code:**
```markdown
"The conversation has unlimited context through automatic summarization"
Agent: "conversation summarization specialist"
```

**Waiboard Current:**
- ContextManager exists but no automatic summarization agent
- Token compression is manual

**Recommended Implementation:**
```typescript
// Add summarization sub-agent
export const SUMMARIZATION_AGENT = {
  id: "summarizer",
  description: "Compress conversation history for context efficiency",
  systemPrompt: `You are a conversation summarizer.
    Given the conversation history, produce a concise summary that:
    - Preserves canvas state changes (element IDs, positions)
    - Captures user intent and preferences
    - Removes conversational fluff
    - Returns summary under 200 tokens`,
  allowedTools: [],
  model: "fast",
  maxTokens: 500,
};
```

---

## Part 7: Missing Agent Types

### 7.1 Agents Claude Code Has That Waiboard Lacks

| Agent | Purpose | Priority |
|-------|---------|----------|
| **Command Execution Specialist** | Focused bash/terminal operations | Low (not applicable) |
| **PR Review Agent** | GitHub PR analysis | Low (not applicable) |
| **Security Review Agent** | Code security analysis | Medium (could apply to canvas security) |
| **Plan Verification Agent** | Validates plan execution | 🔴 High |
| **Conversation Summarizer** | Context compression | 🔴 High |
| **Status Line Setup** | Configuration assistance | Low |

### 7.2 Plan Verification Agent (High Priority)

**Claude Code Pattern:**
After the main agent executes a plan, a verification agent reviews the result.

**Waiboard Gap:**
No verification step after complex canvas operations.

**Recommended Implementation:**
```typescript
export const VERIFICATION_AGENT = {
  id: "verifier",
  description: "Verify canvas operations completed correctly",
  systemPrompt: `You are a canvas verification agent.

Given:
- Original plan (from canvas_plan)
- Current canvas state (from canvas_read)

Verify:
1. All planned elements were created
2. Positions match expectations (within 10px tolerance)
3. Styling is consistent
4. Connections are properly attached
5. No orphaned or overlapping elements

Output: { verified: boolean, issues: string[], fixes: Operation[] }`,
  allowedTools: ["canvas_read", "canvas_find"],
  model: "fast",
};
```

---

## Part 8: Prompt Engineering Patterns

### 8.1 Patterns Claude Code Uses That Waiboard Should Adopt

#### Pattern 1: Explicit Prohibitions Before Permissions
```markdown
# Claude Code Pattern
"STRICTLY PROHIBITED from: [list]"
"You MUST NOT: [list]"
"NEVER: [action]"

# Then permissions
"You are permitted to: [list]"
```

**Current Waiboard:** Permissions-first, implicit prohibitions.

#### Pattern 2: Example-Driven Disambiguation
```markdown
# Claude Code Pattern
**Good:** "Let me read the file."
**Bad:** "Let me read the file:"
```

**Current Waiboard:** Has examples but could be more systematic.

#### Pattern 3: Contextual System Reminders
```markdown
<system-reminder>
[Injected contextually when condition met]
[Explicitly marked as reminder, not instruction]
[Instructs agent not to mention reminder to user]
</system-reminder>
```

**Current Waiboard:** No system reminder injection mechanism.

### 8.2 Patterns Waiboard Has That Claude Code Lacks

These are **strengths to preserve**:

| Pattern | Description | Value |
|---------|-------------|-------|
| **Semantic Routing** | `<assess_clarity>` block before any action | Prevents hallucinated outputs |
| **TAOD Loop** | Explicit Think→Act→Observe→Decide | Better reasoning transparency |
| **Domain Skills** | Auto-detected skill injection | Token efficiency |
| **canvas_clarify** | Human-in-the-loop tool | Prevents bad assumptions |
| **Token Economy Metrics** | 77% savings documented | Cost awareness |

---

## Part 9: Improvement Roadmap

### Phase 1: Quick Wins (1-2 days)
1. ✅ Add explicit prohibition statements to exploration/planning agents
2. ✅ Add response conciseness guidelines
3. ✅ Add professional objectivity guidance
4. ✅ Add tool call formatting rules (no colons)
5. ✅ Add content moderation guidelines

### Phase 2: Structural Improvements (1 week)
1. Refactor `prompts.ts` into modular markdown files
2. Implement dynamic prompt composition
3. Add system reminder injection mechanism
4. Create verification agent

### Phase 3: Advanced Features (2 weeks)
1. Implement conversation summarization agent
2. Add automatic task tracking reminders
3. Build prompt A/B testing infrastructure
4. Create prompt versioning system

---

## Appendix A: Side-by-Side Comparison Table

| Feature | Claude Code v2.1.1 | Waiboard ai-agents | Gap |
|---------|-------------------|-------------------|-----|
| Prompt files | 40+ .md files | 1 .ts file | 🔴 |
| Agent constraints | Explicit prohibitions | Tool whitelists | 🔴 |
| Response style | CLI-concise | Flexible | 🟡 |
| Task tracking | TodoWrite + reminders | canvas_plan | 🟢 |
| Semantic routing | Implicit in main | `<assess_clarity>` | ✅ Better |
| Verification agent | Yes | No | 🔴 |
| Context summarization | Dedicated agent | Manual | 🔴 |
| Error recovery | Comprehensive | Basic | 🟡 |
| Security guidance | Extensive | None | 🔴 |
| Professional tone | Explicit guidance | None | 🟡 |

---

## Appendix B: Implementation Checklist

```
□ Phase 1 - Quick Wins
  □ Add STRICTLY_PROHIBITED blocks to read-only agents
  □ Add RESPONSE_GUIDELINES component
  □ Add PROFESSIONAL_OBJECTIVITY component
  □ Add TOOL_CALL_FORMAT component
  □ Add SECURITY_GUIDELINES component
  □ Add CONTENT_MODERATION component

□ Phase 2 - Structural
  □ Create prompts/ directory structure
  □ Extract components to .md files
  □ Implement loadComponent() function
  □ Add conditional composition
  □ Create verification agent

□ Phase 3 - Advanced
  □ Implement summarization agent
  □ Add system reminder injection
  □ Build prompt versioning
  □ Add A/B testing support
```

---

## References

1. [Claude Code System Prompts v2.1.1](https://github.com/Piebald-AI/claude-code-system-prompts) - Piebald AI
2. Waiboard AI Agents: `packages/ai-agents/src/agents/prompts.ts`
3. Waiboard Delegation System: `packages/ai-agents/src/core/delegation.ts`
4. Anthropic Prompt Engineering Guidelines (2025)
