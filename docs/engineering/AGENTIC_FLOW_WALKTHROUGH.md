# Agentic Flow Walkthrough

> Tracing a single user request through the AI agent system, showing reasoning at each step

---

## The Complete Flow (With Semantic Routing)

```
User Request
     │
     ▼
┌─────────────────────────────────────────────────────────────────┐
│ MAIN AGENT - Semantic Assessment                                 │
│                                                                  │
│ "Is this request clear enough to proceed?"                       │
│                                                                  │
│ ├── VAGUE ("help me visualize something")                        │
│ │   └── ASK USER for clarification                               │
│ │                                                                │
│ ├── NEEDS BREAKDOWN ("create a complex dashboard")               │
│ │   └── Delegate to PLANNING agent                               │
│ │                                                                │
│ └── CLEAR ENOUGH ("create mindmap about machine learning")       │
│     └── Delegate to CANVAS-DESIGNER                              │
└─────────────────────────────────────────────────────────────────┘
```

---

## Scenario A: Clear Request (Happy Path)

**User:** "Create a mindmap about machine learning"

This request is clear because:
- Type is explicit: "mindmap"
- Topic is specific: "machine learning"
- No ambiguity about what to create

### Flow

```
User: "Create a mindmap about machine learning"
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│ MAIN AGENT - Iteration 1                                         │
│                                                                  │
│ <analyze>                                                        │
│ Request type: mindmap (clear)                                    │
│ Topic: machine learning (specific)                               │
│ Ambiguity level: LOW                                             │
│ </analyze>                                                       │
│                                                                  │
│ Decision: Clear enough → Delegate to canvas-designer             │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│ CANVAS-DESIGNER (Isolated)                                       │
│                                                                  │
│ Uses canvas_search_templates → Returns DesignSpecification       │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│ CANVAS-EXECUTOR (Isolated)                                       │
│                                                                  │
│ Creates elements from design → Returns element IDs               │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ▼
            Canvas Updated
```

---

## Scenario B: Vague Request (Needs Clarification)

**User:** "Help me visualize my ideas"

This request is vague because:
- No specific type (diagram? mindmap? wireframe?)
- No topic or content specified
- Too open-ended to proceed

### Flow

```
User: "Help me visualize my ideas"
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│ MAIN AGENT - Iteration 1                                         │
│                                                                  │
│ <analyze>                                                        │
│ Request type: UNKNOWN                                            │
│ Topic: "my ideas" (not specified)                                │
│ Ambiguity level: HIGH                                            │
│                                                                  │
│ Missing information:                                             │
│ - What type of visualization? (diagram, mindmap, wireframe?)     │
│ - What ideas? (topic, content, structure?)                       │
│ - How should they be organized?                                  │
│ </analyze>                                                       │
│                                                                  │
│ Decision: Too vague → Use canvas_clarify tool                    │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│ TOOL CALL: canvas_clarify                                        │
│                                                                  │
│ canvas_clarify({                                                 │
│   questions: [                                                   │
│     "What type of visualization would work best?",               │
│     "What's the main topic or subject?"                          │
│   ],                                                             │
│   options: [                                                     │
│     { label: "Mindmap", value: "mindmap",                        │
│       description: "For brainstorming, hierarchies" },           │
│     { label: "Flowchart", value: "flowchart",                    │
│       description: "For processes, decisions" },                 │
│     { label: "Wireframe", value: "wireframe",                    │
│       description: "For UI/app design" },                        │
│     { label: "Kanban", value: "kanban",                          │
│       description: "For task organization" }                     │
│   ],                                                             │
│   reason: "I need to know the type and topic",                   │
│   clarificationType: "output_type"                               │
│ })                                                               │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│ EVENT: clarification_needed                                      │
│                                                                  │
│ Stream INTERRUPTS - waiting for user response                    │
│ (Questions and options shown to user in UI)                      │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ▼
         User responds: "A mindmap about project planning"
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│ MAIN AGENT - Iteration 2 (new message)                           │
│                                                                  │
│ Context includes: original request + user's clarification        │
│                                                                  │
│ <analyze>                                                        │
│ Request type: mindmap (CLEAR)                                    │
│ Topic: project planning (SPECIFIC)                               │
│ </analyze>                                                       │
│                                                                  │
│ Decision: Clear → Delegate to canvas-designer                    │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ▼
            ... continues to designer ...
```

---

## Scenario C: Complex Request (Needs Planning)

**User:** "Create a project dashboard with timeline, team overview, and metrics"

This request needs planning because:
- Multiple distinct sections required
- Unclear relationships between sections
- Layout and sizing decisions needed
- Multiple delegation targets

### Flow

```
User: "Create a project dashboard with timeline, team overview, and metrics"
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│ MAIN AGENT - Iteration 1                                         │
│                                                                  │
│ <analyze>                                                        │
│ Request type: dashboard (complex, multi-section)                 │
│ Sections identified: timeline, team overview, metrics            │
│ Ambiguity level: MEDIUM                                          │
│                                                                  │
│ Issues:                                                          │
│ - How should sections be laid out? (grid? vertical stack?)       │
│ - What size for each section?                                    │
│ - What specific metrics? What team info?                         │
│ - Dependencies between sections?                                 │
│ </analyze>                                                       │
│                                                                  │
│ Decision: Needs breakdown → Delegate to PLANNING agent           │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│ PLANNING AGENT (Isolated)                                        │
│                                                                  │
│ Analyzes canvas space, creates execution plan:                   │
│                                                                  │
│ Plan:                                                            │
│ 1. Create main container frame (1200x800)                        │
│ 2. Header section: Project title + status                        │
│ 3. Left column (60%): Timeline visualization                     │
│ 4. Right column top (40%): Team overview grid                    │
│ 5. Right column bottom (40%): Metrics cards                      │
│                                                                  │
│ Returns: Structured plan with sections, sizes, order             │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│ MAIN AGENT - Iteration 2                                         │
│                                                                  │
│ Received plan from planning agent.                               │
│ Now I can delegate each section to the appropriate agent.        │
│                                                                  │
│ Decision: Execute plan section by section                        │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ▼
         (Multiple delegations to designers/executors)
```

---

## Semantic Routing Decision Tree

```
┌─────────────────────────────────────────────────────────────────┐
│                    SEMANTIC ROUTING                              │
└─────────────────────────────────────────────────────────────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │ Is the request type  │
              │ explicitly stated?   │
              │ (mindmap, flowchart, │
              │  wireframe, etc.)    │
              └──────────────────────┘
                    │         │
                   YES        NO
                    │         │
                    ▼         ▼
         ┌─────────────┐  ┌─────────────────────┐
         │ Is there    │  │ Can we infer the    │
         │ enough      │  │ type from context?  │
         │ content/    │  │ ("login flow" →     │
         │ topic info? │  │  flowchart)         │
         └─────────────┘  └─────────────────────┘
           │       │            │         │
          YES      NO          YES        NO
           │       │            │         │
           ▼       ▼            ▼         ▼
    ┌──────────┐ ┌────────┐ ┌──────────┐ ┌────────────┐
    │ DESIGNER │ │ ASK:   │ │ Check    │ │ ASK:       │
    │ (proceed)│ │ "What  │ │ content  │ │ "What type │
    └──────────┘ │ content│ │ clarity  │ │ of visual  │
                 │ to     │ └──────────┘ │ would you  │
                 │include?"│      │       │ like?"     │
                 └────────┘      ▼       └────────────┘
                          (back to content check)


         ┌─────────────────────────────────────────┐
         │ Is it a multi-section complex request?  │
         │ (dashboard with X, Y, Z)                │
         └─────────────────────────────────────────┘
                    │         │
                   YES        NO
                    │         │
                    ▼         ▼
         ┌─────────────┐  ┌─────────────┐
         │ PLANNING    │  │ Continue    │
         │ AGENT first │  │ to DESIGNER │
         │ (break down)│  │             │
         └─────────────┘  └─────────────┘
```

---

## What Makes a Request "Clear Enough"?

### Clear Requests (→ Go to Designer)

| Request | Why It's Clear |
|---------|----------------|
| "Create a mindmap about AI" | Type + topic explicit |
| "Make a flowchart for user login" | Type + topic + implied content |
| "Add a kanban board with 4 columns" | Type + structure specified |
| "Create an org chart for marketing team" | Type + subject clear |

### Unclear Requests (→ Ask for Clarification)

| Request | What's Missing |
|---------|----------------|
| "Visualize my ideas" | Type? Topic? Content? |
| "Make something cool" | Everything unclear |
| "Create a diagram" | What kind? What content? |
| "Help me brainstorm" | Output type? Topic? |

### Complex Requests (→ Planning Agent First)

| Request | Why It Needs Planning |
|---------|----------------------|
| "Create a dashboard with timeline, stats, and team" | Multiple distinct sections |
| "Design my app's main screens" | Multiple outputs needed |
| "Build a complete project board" | Layout decisions needed |

---

## Implementation Status

### Implemented ✅

1. **canvas_clarify Tool (Human-in-the-Loop)**
   ```
   packages/ai-agents/src/tools/canvas-clarify.ts
   ├── CanvasClarifyInputSchema - Zod schema for input validation
   ├── executeCanvasClarify() - Returns { interruptStream: true, ... }
   ├── isInterruptResult() - Type guard for interrupt detection
   └── formatClarificationForUser() - Format questions for UI
   ```

2. **Semantic Routing in System Prompts**
   ```
   packages/ai-agents/src/agents/prompts.ts
   ├── <assess_clarity> tag - Guides LLM to assess request clarity
   ├── Decision rules for vague/complex/clear requests
   └── Examples of canvas_clarify usage
   ```

3. **Event Handling in Loop**
   ```
   packages/ai-agents/src/core/loop.ts
   ├── createCanvasTools() includes canvas_clarify
   ├── Detects interruptStream: true and emits clarification_needed
   └── Returns from generator to end stream
   ```

4. **Event Types**
   ```
   packages/ai-agents/src/agents/types.ts
   ├── ClarificationNeededEvent - Event interface
   └── AgentEvent union includes clarification_needed
   ```

---

## Current Flow (Implemented)

```
User Request
     │
     ▼
┌─────────────────────────────────────────────────────────────────┐
│ MAIN AGENT - Phase 0: Semantic Assessment                        │
│                                                                  │
│ <assess_clarity>                                                 │
│ 1. Is the output type clear? (mindmap/flowchart/wireframe/etc.) │
│ 2. Is the topic/content specified?                               │
│ 3. Is this a single thing or multiple sections?                  │
│ </assess_clarity>                                                │
│                                                                  │
│ Outcomes:                                                        │
│ ├── VAGUE → Use canvas_clarify tool (interrupts stream)          │
│ ├── COMPLEX → Delegate to planning agent                         │
│ └── CLEAR → Delegate to canvas-designer                          │
└─────────────────────────────────────────────────────────────────┘
     │
     ├── VAGUE ─────────────────────────────────────────────────┐
     │                                                          │
     │   ┌──────────────────────────────────────────────────────┴──┐
     │   │ TOOL: canvas_clarify                                    │
     │   │                                                         │
     │   │ canvas_clarify({                                        │
     │   │   questions: ["What type?", "What topic?"],             │
     │   │   options: [{ label: "Mindmap", value: "mindmap" }, ...]│
     │   │   clarificationType: "output_type"                      │
     │   │ })                                                      │
     │   │                                                         │
     │   │ → Emits: clarification_needed event                     │
     │   │ → Stream ENDS, waiting for user response                │
     │   └─────────────────────────────────────────────────────────┘
     │
     ├── COMPLEX ───────────────────────────────────────────────┐
     │                                                          │
     │   ┌──────────────────────────────────────────────────────┴──┐
     │   │ PLANNING AGENT (Isolated)                               │
     │   │                                                         │
     │   │ Breaks down into sections, determines layout            │
     │   │ Returns: Execution plan with phases                     │
     │   └─────────────────────────────────────────────────────────┘
     │                       │
     │                       ▼
     │             ┌─────────────────────┐
     │             │ For each section:   │
     │             │ DESIGNER → EXECUTOR │
     │             └─────────────────────┘
     │
     └── CLEAR ─────────────────────────────────────────────────┐
                                                                │
        ┌───────────────────────────────────────────────────────┴──┐
        │ CANVAS-DESIGNER (Isolated)                               │
        │                                                          │
        │ Uses canvas_search_templates                             │
        │ Returns: DesignSpecification                             │
        └──────────────────────────────────────────────────────────┘
                            │
                            ▼
        ┌──────────────────────────────────────────────────────────┐
        │ CANVAS-EXECUTOR (Isolated)                               │
        │                                                          │
        │ Creates elements from design                             │
        │ Returns: Created element IDs                             │
        └──────────────────────────────────────────────────────────┘
                            │
                            ▼
                    Canvas Updated
```

---

## Implementation Required

### 1. Update Main Agent System Prompt

Add clarity assessment phase before delegation:

```
## Before Delegating

Always assess request clarity first:

<assess_clarity>
- Output type: [mindmap|flowchart|wireframe|kanban|timeline|unknown]
- Topic clarity: [specific|vague|missing]
- Complexity: [single|multi-section]
</assess_clarity>

If output type is UNKNOWN or topic is MISSING:
→ Respond with clarifying questions (DO NOT delegate)

If complexity is MULTI-SECTION:
→ Delegate to planning agent first

Only delegate to canvas-designer when:
→ Output type is KNOWN
→ Topic is SPECIFIC or can be inferred
→ Single coherent output expected
```

### 2. Integrate assessAmbiguity()

Either:
- Call `assessAmbiguity()` in the HTTP handler before starting loop
- Or add it as a tool the main agent can use

### 3. Update canvas_delegate Description

Add guidance on when NOT to delegate to designer:

```
## canvas_delegate

BEFORE delegating to canvas-designer, verify:
- Output type is explicitly stated or clearly inferrable
- Topic/content is specific enough to search templates
- NOT a multi-section complex layout

If unclear → respond to user with questions instead
If multi-section → delegate to planning agent first
```

---

## See Also

- [TASK_DELEGATION_STRATEGY.md](./TASK_DELEGATION_STRATEGY.md) - Delegation patterns
- [CLAUDE_CODE_PATTERNS.md](./CLAUDE_CODE_PATTERNS.md) - Core patterns
- `packages/ai-agents/src/tools/canvas-clarify.ts` - Human-in-the-loop clarification tool
