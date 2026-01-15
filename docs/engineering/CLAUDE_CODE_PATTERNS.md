# Claude Code Success Patterns for Waiboard Agents

## Why Claude Code Succeeds at Complex Tasks

Claude Code demonstrates remarkable performance on multi-step coding tasks. This document extracts the key architectural patterns and applies them to Waiboard's canvas manipulation agents.

---

## Part 1: The 7 Core Patterns

### Pattern 1: Minimal Tools, Maximum Composability

**Claude Code's Approach:**
```
5 core tools: Read, Write, Edit, Grep, Glob
+ 2 execution tools: Bash, Task
= Complete codebase control
```

**Why It Works:**
- Each tool does ONE thing extremely well
- Tools compose naturally (Glob → Read → Edit)
- LLM learns tool semantics deeply (fewer to master)
- Clear boundaries prevent confusion

**Anti-pattern (What ADK Plan Proposed):**
```
canvas_create, canvas_update, canvas_delete, canvas_query, canvas_capture...
+ el_create, el_update, el_delete, el_select, el_move, el_resize...
= Tool explosion, LLM confusion
```

**Waiboard Application:**
```typescript
// ✅ 5 Canvas Tools (mirroring Claude Code)
canvas_read    // Like Read - get canvas/element as JSON/XML
canvas_write   // Like Write - create/replace subtree
canvas_edit    // Like Edit - precise incremental changes
canvas_find    // Like Grep - search by pattern
canvas_capture // Like Read (image) - export for vision

// The "Task" equivalent
canvas_delegate  // Spawn sub-agent for complex operations
```

### Pattern 2: Streaming-First Architecture

**Claude Code's Approach:**
```typescript
// Async generator - stream as you go
async function* claudeCanvasAgent(prompt, config): AsyncGenerator<SDKMessage> {
  for await (const message of query({ prompt, options })) {
    yield message;  // Immediate feedback
  }
}

// Three consumption patterns from ONE implementation
const stream = claudeCanvasAgent(prompt, config);     // Real-time
const messages = await runClaudeCanvasAgent(...);     // Batch
const text = await getClaudeCanvasAgentResponse(...); // Simple
```

**Why It Works:**
- User sees progress immediately (reduced anxiety)
- Caller chooses consumption pattern
- Natural cancellation support
- Memory efficient (no buffering)

**Waiboard Application:**
```typescript
// Canvas agent with streaming
async function* canvasAgent(
  task: string,
  canvasId: string
): AsyncGenerator<CanvasEvent> {

  yield { type: 'thinking', message: 'Analyzing canvas...' };

  const context = await buildContext(canvasId, task);
  yield { type: 'context', summary: context.summary };

  const plan = await planOperations(task, context);
  yield { type: 'plan', steps: plan.steps };

  for (const step of plan.steps) {
    yield { type: 'step_start', step: step.description };

    const result = await executeStep(step);
    yield { type: 'step_complete', result };

    // User can cancel between steps
    if (await checkCancellation()) break;
  }

  yield { type: 'complete', summary: '...' };
}
```

### Pattern 3: Explicit Reasoning Structure

**Claude Code's System Prompt Pattern:**
```markdown
## Workflow
1. <understanding> Analyze user request and current state
2. <plan> Plan the sequence of operations needed
3. <execute> Run tools to implement the plan
4. <verify> Confirm results match user intent
```

**Why It Works:**
- XML tags create structured thinking (outperforms prose)
- Each phase has clear purpose
- Model self-documents reasoning
- Easy to parse for debugging

**Waiboard Application:**
```typescript
const CANVAS_AGENT_PROMPT = `
You are a canvas manipulation expert. For every request:

## Reasoning Process

<analyze>
- What is the user asking for?
- What elements currently exist? (use canvas_read)
- What constraints apply? (space, style, hierarchy)
</analyze>

<plan>
- List operations in execution order
- Identify dependencies between operations
- Estimate element count and positions
</plan>

<execute>
- Run canvas_write/canvas_edit for each operation
- Verify each operation succeeded
- Adjust if conflicts detected
</execute>

<summarize>
- What was created/modified?
- Element IDs for reference
- Any issues encountered?
</summarize>

Always show your reasoning in these tags.
`;
```

### Pattern 4: Stateless Systems, Observable State

**Claude Code's ECS Pattern:**
```typescript
// ❌ BAD - Hidden state, hard to debug
class CanvasAgent {
  private elements: Map<string, Element>;  // Can't inspect
  private history: Operation[];             // Can't serialize
}

// ✅ GOOD - All state in resources
class CanvasAgent {
  execute(context: AgentContext) {
    const canvas = context.getResource('canvas');     // Observable
    const history = context.getResource('history');   // Serializable
    const selection = context.getResource('selection'); // Inspectable
  }
}
```

**Why It Works:**
- State is always inspectable (debugging)
- State is always serializable (checkpointing)
- No hidden coupling between components
- Easy to test (inject mock resources)

**Waiboard Application:**
```typescript
interface AgentResources {
  // All agent state lives here
  canvas: {
    id: string;
    version: number;
    summary: CanvasSummary;
    workingSet: Element[];
  };

  task: {
    id: string;
    status: TaskStatus;
    currentStep: number;
    checkpoint: Checkpoint | null;
  };

  context: {
    tokenBudget: number;
    tokensUsed: number;
    strategies: ContextStrategy[];
  };
}

// Every function receives resources, doesn't own state
async function executeStep(
  step: TaskStep,
  resources: AgentResources
): Promise<StepResult> {
  // Read from resources
  const { canvas, task } = resources;

  // Execute operation
  const result = await mcp.execute('canvas_edit', step.operation);

  // Update resources (caller persists)
  return {
    success: true,
    resources: {
      ...resources,
      canvas: { ...canvas, version: canvas.version + 1 },
      task: { ...task, currentStep: task.currentStep + 1 }
    }
  };
}
```

### Pattern 5: Pre/Post Hooks for Observability

**Claude Code's Hook System:**
```typescript
// Every tool call passes through hooks
preToolUse: async (tool, input) => {
  console.log(`[Pre] ${tool}`, input);

  // Can block dangerous operations
  if (tool === 'canvas_write' && input.clear) {
    return { proceed: false, reason: 'Clear requires confirmation' };
  }

  return { proceed: true };
};

postToolUse: async (tool, result) => {
  console.log(`[Post] ${tool}`, result);

  // Emit events for UI
  eventEmitter.emit('tool:complete', { tool, result });

  // Track metrics
  metrics.increment(`tool.${tool}.calls`);
};
```

**Why It Works:**
- Complete audit trail
- UI updates automatically
- Security enforcement point
- Metrics collection

**Waiboard Application:**
```typescript
class CanvasAgentHooks {
  async preToolUse(tool: string, input: unknown): Promise<HookResult> {
    // 1. Validate input
    const validation = await this.validateInput(tool, input);
    if (!validation.valid) {
      return { proceed: false, reason: validation.error };
    }

    // 2. Check permissions
    if (this.requiresApproval(tool, input)) {
      const approved = await this.requestApproval(tool, input);
      if (!approved) return { proceed: false, reason: 'User declined' };
    }

    // 3. Log for debugging
    this.logger.debug(`[${tool}] Input:`, input);

    // 4. Start timing
    this.metrics.startTimer(tool);

    return { proceed: true };
  }

  async postToolUse(tool: string, result: unknown): Promise<void> {
    // 1. Stop timing
    const duration = this.metrics.stopTimer(tool);

    // 2. Log result
    this.logger.debug(`[${tool}] Result (${duration}ms):`, result);

    // 3. Emit for UI
    this.events.emit('canvas:update', { tool, result, duration });

    // 4. Update checkpoint if significant
    if (this.isSignificantChange(tool)) {
      await this.checkpoint.save();
    }
  }
}
```

### Pattern 6: Skills as Compressed Context

**Claude Code's Skill System:**
```markdown
<!-- .claude/skills/canvas-ecs/SKILL.md -->
# Canvas ECS Skill

## When to Activate
Triggers: "ECS", "system", "component", "entity", "canvas-core"

## Context (150 tokens, provides 10,000 tokens of knowledge)
- Systems are stateless, priority-ordered
- Components are pure data
- Queries filter entities by component
- World is the container

## Key Patterns
[Compressed expert knowledge...]
```

**Why It Works:**
- 150 tokens of trigger = 10,000 tokens of expertise
- Auto-activates (no explicit invocation)
- Domain-specific knowledge injection
- Reduces hallucination

**Waiboard Application:**
```typescript
// Skills for canvas manipulation
const CANVAS_SKILLS = {
  'diagram': {
    triggers: ['flowchart', 'diagram', 'process', 'architecture'],
    context: `
## Diagram Expert Knowledge
- Use tree layout for hierarchies
- 40px minimum gap between nodes
- Arrows flow top-to-bottom or left-to-right
- Color code by node type (action=blue, decision=yellow, terminal=red)
- Maximum 7±2 nodes per level (cognitive load)
    `
  },

  'wireframe': {
    triggers: ['wireframe', 'mockup', 'UI', 'interface', 'screen'],
    context: `
## Wireframe Expert Knowledge
- 8px grid system for alignment
- 16px base spacing, 24px section spacing
- Gray boxes for images (#E5E5E5)
- Blue for interactive elements (#3B82F6)
- Mobile: 375px, Tablet: 768px, Desktop: 1440px
    `
  },

  'moodboard': {
    triggers: ['moodboard', 'inspiration', 'collage', 'visual'],
    context: `
## Moodboard Expert Knowledge
- Masonry or scattered layout
- Varied image sizes (hero 2x, supporting 1x)
- Color palette extraction from images
- 8-16px gaps, slight overlaps OK
- Group by theme, not size
    `
  }
};

// Auto-activate based on task
function injectRelevantSkills(task: string, basePrompt: string): string {
  const activeSkills = Object.entries(CANVAS_SKILLS)
    .filter(([_, skill]) =>
      skill.triggers.some(t => task.toLowerCase().includes(t))
    )
    .map(([_, skill]) => skill.context);

  return basePrompt + '\n\n' + activeSkills.join('\n\n');
}
```

### Pattern 7: Sub-Agent Delegation (Task Tool)

**Claude Code's Task Tool:**
```typescript
// Parent agent spawns specialized sub-agent
const result = await Task({
  subagent_type: 'frontend-developer',
  prompt: 'Implement the React component for...',
  description: 'Build login form component'
});

// Sub-agent has:
// - Specialized system prompt
// - Restricted tool access
// - Focused context
// - Returns structured result
```

**Why It Works:**
- Reduces context pollution (sub-agent has clean slate)
- Specialized expertise per domain
- Parallel execution possible
- Clear responsibility boundaries

**Waiboard Application:**
```typescript
// Define specialized canvas sub-agents
const CANVAS_SUB_AGENTS = {
  'layout-specialist': {
    model: 'gemini-2.0-flash',
    systemPrompt: LAYOUT_SPECIALIST_PROMPT,
    tools: ['canvas_read', 'canvas_find', 'layout_compute'],
    description: 'Computes optimal positions for elements'
  },

  'style-specialist': {
    model: 'gpt-4o',
    systemPrompt: STYLE_SPECIALIST_PROMPT,
    tools: ['canvas_read', 'canvas_edit'],
    description: 'Applies consistent styling and theming'
  },

  'connector-specialist': {
    model: 'gemini-2.0-flash',
    systemPrompt: CONNECTOR_SPECIALIST_PROMPT,
    tools: ['canvas_read', 'canvas_write'],
    description: 'Creates arrows and connections between elements'
  }
};

// Root agent delegates to specialists
async function* rootCanvasAgent(task: string, canvasId: string) {
  // Analyze task
  const analysis = await analyzeTask(task);

  // Parallel delegation for independent subtasks
  if (analysis.requiresLayout && analysis.requiresStyling) {
    const [layout, style] = await Promise.all([
      delegateToAgent('layout-specialist', analysis.layoutTask),
      delegateToAgent('style-specialist', analysis.styleTask)
    ]);

    yield { type: 'subtasks_complete', layout, style };
  }

  // Sequential for dependent tasks
  if (analysis.requiresConnections) {
    // Must wait for layout to finish
    const connections = await delegateToAgent(
      'connector-specialist',
      analysis.connectionTask
    );
    yield { type: 'connections_complete', connections };
  }
}
```

---

## Part 2: The Agentic Loop

### Claude Code's Core Loop

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        THE AGENTIC LOOP                                      │
│                                                                              │
│   ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐          │
│   │  THINK   │────▶│   ACT    │────▶│ OBSERVE  │────▶│  DECIDE  │          │
│   │          │     │          │     │          │     │          │          │
│   │ Analyze  │     │ Call     │     │ Parse    │     │ Continue │          │
│   │ context  │     │ tool     │     │ result   │     │ or done? │          │
│   └──────────┘     └──────────┘     └──────────┘     └─────┬────┘          │
│        ▲                                                    │               │
│        │                                                    │               │
│        └────────────────────────────────────────────────────┘               │
│                         (if more work needed)                                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Implementation for Canvas

```typescript
async function* runAgenticLoop(
  task: string,
  canvasId: string,
  maxIterations: number = 20
): AsyncGenerator<AgentEvent> {

  const resources = await initializeResources(canvasId);
  let iteration = 0;

  while (iteration < maxIterations) {
    iteration++;

    // THINK: Build context and reason about next action
    yield { type: 'thinking', iteration };

    const context = await buildContext(resources, task);
    const reasoning = await llm.generate({
      model: 'claude-sonnet-4',
      messages: [
        { role: 'system', content: injectSkills(task, CANVAS_SYSTEM_PROMPT) },
        { role: 'user', content: formatContext(context, task) }
      ]
    });

    yield { type: 'reasoning', content: reasoning.thinking };

    // Check if done
    if (reasoning.decision === 'complete') {
      yield { type: 'complete', summary: reasoning.summary };
      return;
    }

    // ACT: Execute the chosen tool
    yield { type: 'acting', tool: reasoning.tool, input: reasoning.input };

    const hookResult = await hooks.preToolUse(reasoning.tool, reasoning.input);
    if (!hookResult.proceed) {
      yield { type: 'blocked', reason: hookResult.reason };
      continue;
    }

    const result = await executeTool(reasoning.tool, reasoning.input);
    await hooks.postToolUse(reasoning.tool, result);

    // OBSERVE: Process the result
    yield { type: 'observing', result };

    if (result.error) {
      // Error recovery
      yield { type: 'error', error: result.error };
      resources.errors.push(result.error);

      if (resources.errors.length > 3) {
        yield { type: 'failed', reason: 'Too many errors' };
        return;
      }
    } else {
      // Update state
      resources.history.push({ tool: reasoning.tool, result });
      resources.canvas.version++;
    }

    // DECIDE: Continue or complete (happens in next THINK phase)
  }

  yield { type: 'timeout', iterations: iteration };
}
```

---

## Part 3: Context Efficiency

### Claude Code's Token Management

**Strategy 1: Lazy Loading**
```typescript
// Don't load everything upfront
// Load only what's needed for current step

async function buildContext(task: string, step: number): Promise<Context> {
  switch (step) {
    case 1: // Initial analysis
      return {
        summary: await getCanvasSummary(),  // 100 tokens
        // Don't load elements yet
      };

    case 2: // Planning
      return {
        summary: cached.summary,
        relevantElements: await findRelevant(task),  // 500 tokens
        // Don't load full details yet
      };

    case 3: // Execution
      return {
        workingSet: await loadWorkingSet(),  // 1000 tokens
        // Only elements we're modifying
      };
  }
}
```

**Strategy 2: Compression Hierarchy**
```
Level 0: Full element (100 tokens)
{
  "id": "rect-1",
  "type": "rectangle",
  "x": 100, "y": 200,
  "width": 300, "height": 150,
  "fill": "#3B82F6",
  "stroke": "#1E40AF",
  "strokeWidth": 2,
  "cornerRadius": 8,
  "opacity": 1,
  "rotation": 0,
  "children": [...],
  "metadata": {...}
}

Level 1: Summary (20 tokens)
{ "id": "rect-1", "type": "rectangle", "bounds": [100,200,400,350], "fill": "#3B82F6" }

Level 2: Minimal (5 tokens)
"rect-1:rectangle@100,200"

Level 3: Count (1 token)
"47 rectangles"
```

**Strategy 3: Semantic Chunking**
```typescript
// For 10,000 elements, don't send all
// Chunk by relevance to task

async function getSemanticChunk(
  canvasId: string,
  task: string,
  tokenBudget: number
): Promise<Element[]> {

  // Embed the task
  const taskEmbedding = await embed(task);

  // Find semantically similar elements
  const similar = await vectorSearch(canvasId, taskEmbedding, {
    limit: Math.floor(tokenBudget / 50),  // ~50 tokens per element
    threshold: 0.7
  });

  // Also include spatial neighbors
  const expanded = await expandWithNeighbors(similar, {
    radius: 100,
    maxExtra: 20
  });

  return expanded;
}
```

### Waiboard Context Manager

```typescript
class CanvasContextManager {
  private tokenBudgets = {
    summary: 200,      // Always fits
    skeleton: 500,     // Frame structure
    relevant: 2000,    // Task-relevant elements
    working: 1000,     // Current selection/viewport
    history: 500,      // Recent operations
    total: 8000        // Max for fast models
  };

  async build(
    canvasId: string,
    task: string,
    options: ContextOptions = {}
  ): Promise<CanvasContext> {

    const budget = options.tokenBudget || this.tokenBudgets.total;
    let tokensUsed = 0;

    // Layer 1: Always include summary (cheap)
    const summary = await this.buildSummary(canvasId);
    tokensUsed += this.countTokens(summary);

    // Layer 2: Frame skeleton if space
    let skeleton = null;
    if (tokensUsed + this.tokenBudgets.skeleton < budget) {
      skeleton = await this.buildSkeleton(canvasId);
      tokensUsed += this.countTokens(skeleton);
    }

    // Layer 3: Task-relevant elements
    const relevantBudget = Math.min(
      this.tokenBudgets.relevant,
      budget - tokensUsed - this.tokenBudgets.working
    );
    const relevant = await this.buildRelevant(canvasId, task, relevantBudget);
    tokensUsed += this.countTokens(relevant);

    // Layer 4: Working set (selection + viewport)
    const workingBudget = budget - tokensUsed;
    const working = await this.buildWorkingSet(canvasId, options, workingBudget);
    tokensUsed += this.countTokens(working);

    return {
      summary,
      skeleton,
      relevant,
      working,
      tokensUsed,
      compressionRatio: this.calculateCompression(canvasId, tokensUsed)
    };
  }

  private async buildSummary(canvasId: string): Promise<string> {
    const stats = await this.mcp.execute('canvas_find', {
      aggregate: { count: true, countBy: 'type', bounds: true }
    });

    return `
Canvas: ${stats.count} elements | ${stats.bounds.width}×${stats.bounds.height}
Types: ${this.formatTypeCounts(stats.countBy)}
Frames: ${stats.countBy.frame || 0} root containers
    `.trim();
  }

  private async buildSkeleton(canvasId: string): Promise<FrameTree> {
    // Get only frames (containers) up to depth 2
    const frames = await this.mcp.execute('canvas_find', {
      match: { type: 'frame' },
      return: 'tree',
      maxDepth: 2
    });

    return frames.map(f => ({
      id: f.id,
      name: f.name || f.id,
      bounds: f.bounds,
      childCount: f.children?.length || 0
    }));
  }

  private async buildRelevant(
    canvasId: string,
    task: string,
    budget: number
  ): Promise<Element[]> {
    // Semantic search for task-relevant elements
    const embedding = await this.embed(task);

    return this.mcp.execute('canvas_find', {
      match: { $semantic: { embedding, threshold: 0.6 } },
      return: 'summary',
      limit: Math.floor(budget / 50)
    });
  }

  private async buildWorkingSet(
    canvasId: string,
    options: ContextOptions,
    budget: number
  ): Promise<Element[]> {
    const elements: Element[] = [];

    // Include selection (full detail)
    if (options.selection?.length) {
      const selected = await this.mcp.execute('canvas_read', {
        target: { id: { $in: options.selection } }
      });
      elements.push(...selected);
    }

    // Include viewport
    if (options.viewport) {
      const visible = await this.mcp.execute('canvas_find', {
        match: { $geo: { $within: options.viewport } },
        return: 'summary',
        limit: 50
      });
      elements.push(...visible);
    }

    return elements.slice(0, Math.floor(budget / 30));
  }
}
```

---

## Part 4: Context Management & Allocation

### Claude Code's Context Window Strategy

Claude Code operates within a finite context window (typically 128K-200K tokens). Managing this effectively is critical for long-running agentic sessions. Here's how Claude Code allocates and manages context:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      CONTEXT WINDOW ALLOCATION                               │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ System Prompt + Skills (~2K-5K tokens)                                 │ │
│  │ - Base instructions, capabilities, constraints                         │ │
│  │ - Auto-activated skills based on task keywords                         │ │
│  │ - Tool definitions and schemas                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Conversation History (variable, managed via summarization)             │ │
│  │ - Recent messages kept verbatim                                        │ │
│  │ - Older messages summarized or pruned                                  │ │
│  │ - Tool results compressed aggressively                                 │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Working Memory (~3K-8K tokens reserved)                                │ │
│  │ - Current task state and progress                                      │ │
│  │ - Active file contents being edited                                    │ │
│  │ - Recent tool outputs                                                  │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Generation Budget (~4K-8K tokens reserved)                             │ │
│  │ - Space for model's response                                           │ │
│  │ - Reasoning, tool calls, explanations                                  │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Token Budget Allocation Rules

**Claude Code's Allocation Strategy:**

```typescript
interface ContextBudget {
  // Fixed allocations (always reserved)
  systemPrompt: 2000-5000;    // Base instructions + skills
  toolDefinitions: 500-1500;   // MCP tool schemas
  generationBuffer: 4000-8000; // Response space

  // Dynamic allocations (managed at runtime)
  conversationHistory: 'remainder'; // Fills available space
  workingMemory: 3000-8000;         // Current task context
}

// Priority order when context gets tight:
// 1. System prompt (never truncated)
// 2. Generation buffer (never truncated)
// 3. Working memory (compress, don't remove)
// 4. Recent messages (keep verbatim)
// 5. Older messages (summarize or prune)
// 6. Tool results (aggressive compression)
```

### Conversation History Management

**Strategy 1: Sliding Window with Summarization**

```typescript
// Claude Code doesn't just truncate - it summarizes
class ConversationManager {
  private readonly RECENT_WINDOW = 10;  // Keep last N turns verbatim
  private readonly SUMMARY_THRESHOLD = 50000;  // Tokens before summarizing

  async manageHistory(
    messages: Message[],
    currentTokens: number,
    budget: number
  ): Promise<Message[]> {

    if (currentTokens < this.SUMMARY_THRESHOLD) {
      return messages;  // No management needed yet
    }

    // Split into recent and older messages
    const recent = messages.slice(-this.RECENT_WINDOW);
    const older = messages.slice(0, -this.RECENT_WINDOW);

    // Summarize older messages
    const summary = await this.summarize(older);

    return [
      { role: 'system', content: `Previous conversation summary:\n${summary}` },
      ...recent
    ];
  }

  private async summarize(messages: Message[]): Promise<string> {
    // Extract key information:
    // - Decisions made
    // - Files modified
    // - Errors encountered
    // - User preferences expressed
    return generateSummary(messages, {
      maxTokens: 1000,
      focus: ['decisions', 'changes', 'errors', 'preferences']
    });
  }
}
```

**Strategy 2: Tool Result Compression**

```typescript
// Tool outputs are the biggest context consumers
// Claude Code aggressively compresses them

const COMPRESSION_RULES = {
  // Read tool - keep structure, trim content
  Read: (result: string, budget: number): string => {
    if (countTokens(result) <= budget) return result;

    // Strategy: Keep first/last lines, sample middle
    const lines = result.split('\n');
    const keepFirst = Math.floor(budget * 0.3 / AVG_TOKENS_PER_LINE);
    const keepLast = Math.floor(budget * 0.3 / AVG_TOKENS_PER_LINE);

    return [
      ...lines.slice(0, keepFirst),
      `\n... (${lines.length - keepFirst - keepLast} lines omitted) ...\n`,
      ...lines.slice(-keepLast)
    ].join('\n');
  },

  // Grep tool - show counts, sample matches
  Grep: (result: GrepResult, budget: number): string => {
    const matchCount = result.matches.length;

    if (matchCount <= 10) return formatMatches(result.matches);

    return `Found ${matchCount} matches across ${result.files.length} files.\n` +
           `Sample matches:\n${formatMatches(result.matches.slice(0, 5))}\n` +
           `... and ${matchCount - 5} more`;
  },

  // Bash tool - keep exit code, trim output
  Bash: (result: BashResult, budget: number): string => {
    const output = result.stdout + result.stderr;
    const exitInfo = `Exit code: ${result.exitCode}`;

    if (countTokens(output) <= budget - 10) {
      return `${exitInfo}\n${output}`;
    }

    // Keep errors (more important), trim stdout
    const errorBudget = Math.min(countTokens(result.stderr), budget * 0.6);
    const stdoutBudget = budget - errorBudget - 10;

    return `${exitInfo}\n` +
           truncate(result.stdout, stdoutBudget) +
           (result.stderr ? `\nErrors:\n${truncate(result.stderr, errorBudget)}` : '');
  }
};
```

### Working Memory Management

**What Claude Code Keeps in Working Memory:**

```typescript
interface WorkingMemory {
  // Current task state (always in context)
  currentTask: {
    description: string;
    status: 'analyzing' | 'planning' | 'executing' | 'verifying';
    stepsCompleted: number;
    stepsTotal: number;
  };

  // Active file context (for edits in progress)
  activeFiles: Map<string, {
    path: string;
    relevantLines: string;     // Not full content
    pendingChanges: Change[];
  }>;

  // Recent tool outputs (compressed)
  recentOutputs: {
    tool: string;
    summary: string;           // Compressed representation
    timestamp: number;
  }[];

  // Error context (for recovery)
  recentErrors: {
    tool: string;
    error: string;
    attemptedFix: string;
  }[];
}

// Working memory budget allocation
const WORKING_MEMORY_BUDGET = {
  taskState: 200,        // tokens
  activeFiles: 3000,     // Up to 3-5 files
  recentOutputs: 2000,   // Last 3-5 tool calls
  errorContext: 500,     // Last 2-3 errors
  total: 6000
};
```

### Context Overflow Handling

**When approaching context limits:**

```typescript
async function handleContextOverflow(
  currentTokens: number,
  maxTokens: number,
  messages: Message[]
): Promise<Message[]> {

  const buffer = maxTokens * 0.15;  // 15% safety buffer
  const targetTokens = maxTokens - buffer;

  if (currentTokens <= targetTokens) {
    return messages;  // No action needed
  }

  const overflow = currentTokens - targetTokens;

  // Strategy order (least to most aggressive):
  const strategies = [
    // 1. Compress old tool results
    () => compressToolResults(messages, overflow * 0.5),

    // 2. Summarize old conversation turns
    () => summarizeOldTurns(messages, overflow * 0.3),

    // 3. Drop redundant context (duplicate reads, etc.)
    () => deduplicateContext(messages, overflow * 0.2),

    // 4. Emergency: truncate oldest messages
    () => truncateOldest(messages, overflow)
  ];

  let managed = messages;
  let remaining = overflow;

  for (const strategy of strategies) {
    if (remaining <= 0) break;
    const { messages: newMessages, freed } = await strategy();
    managed = newMessages;
    remaining -= freed;
  }

  return managed;
}
```

### Token Accounting System

**Claude Code tracks token usage carefully:**

```typescript
class TokenAccountant {
  private usage: Map<string, number> = new Map();

  track(category: string, tokens: number): void {
    const current = this.usage.get(category) || 0;
    this.usage.set(category, current + tokens);
  }

  getBreakdown(): TokenBreakdown {
    return {
      system: this.usage.get('system') || 0,
      conversation: this.usage.get('conversation') || 0,
      toolDefinitions: this.usage.get('toolDefinitions') || 0,
      toolResults: this.usage.get('toolResults') || 0,
      workingMemory: this.usage.get('workingMemory') || 0,
      total: Array.from(this.usage.values()).reduce((a, b) => a + b, 0)
    };
  }

  canAfford(tokens: number, maxTokens: number): boolean {
    const GENERATION_RESERVE = 4000;
    return this.getBreakdown().total + tokens + GENERATION_RESERVE <= maxTokens;
  }

  // Smart decision: should we load this file?
  shouldLoadFile(filePath: string, fileTokens: number, maxTokens: number): Decision {
    const breakdown = this.getBreakdown();
    const available = maxTokens - breakdown.total - 4000;  // Reserve for generation

    if (fileTokens <= available) {
      return { load: true, full: true };
    }

    if (fileTokens * 0.3 <= available) {
      return { load: true, full: false, budget: available };
    }

    return { load: false, reason: 'Insufficient context budget' };
  }
}
```

### Waiboard Context Allocation

**Applying these patterns to canvas agents:**

```typescript
class CanvasAgentContextManager {
  // Budget allocation for canvas operations
  private readonly BUDGETS = {
    systemPrompt: 3000,       // Agent instructions + skills
    canvasSummary: 500,       // Always fit a summary
    frameStructure: 1000,     // Canvas hierarchy
    workingElements: 4000,    // Elements being modified
    taskHistory: 1500,        // Recent operations
    generationBuffer: 4000,   // Response space
    total: 16000              // For fast models (Gemini Flash)
  };

  async buildOptimalContext(
    canvasId: string,
    task: string,
    conversationHistory: Message[]
  ): Promise<AgentContext> {

    const accountant = new TokenAccountant();

    // 1. Fixed allocations
    accountant.track('system', this.BUDGETS.systemPrompt);
    accountant.track('generation', this.BUDGETS.generationBuffer);

    // 2. Canvas summary (always include)
    const summary = await this.getCanvasSummary(canvasId);
    accountant.track('canvasSummary', countTokens(summary));

    // 3. Determine remaining budget
    const remaining = this.BUDGETS.total - accountant.getBreakdown().total;

    // 4. Allocate remaining to working set vs history
    const workingBudget = Math.min(this.BUDGETS.workingElements, remaining * 0.7);
    const historyBudget = remaining - workingBudget;

    // 5. Load working elements (task-relevant)
    const workingSet = await this.loadWorkingSet(canvasId, task, workingBudget);
    accountant.track('workingElements', countTokens(workingSet));

    // 6. Compress conversation history to fit
    const compressedHistory = await this.compressHistory(
      conversationHistory,
      historyBudget
    );
    accountant.track('history', countTokens(compressedHistory));

    return {
      summary,
      workingSet,
      history: compressedHistory,
      tokenUsage: accountant.getBreakdown()
    };
  }

  private async loadWorkingSet(
    canvasId: string,
    task: string,
    budget: number
  ): Promise<Element[]> {

    // Priority loading order:
    // 1. Selected elements (full detail)
    // 2. Elements mentioned in task
    // 3. Spatially adjacent elements
    // 4. Recently modified elements

    let tokensUsed = 0;
    const elements: Element[] = [];

    // Selection (highest priority)
    const selection = await this.getSelection(canvasId);
    for (const el of selection) {
      const tokens = countTokens(JSON.stringify(el));
      if (tokensUsed + tokens <= budget * 0.4) {
        elements.push(el);
        tokensUsed += tokens;
      }
    }

    // Task-mentioned elements
    const mentioned = await this.findMentioned(canvasId, task);
    for (const el of mentioned) {
      if (elements.find(e => e.id === el.id)) continue;
      const tokens = countTokens(JSON.stringify(el));
      if (tokensUsed + tokens <= budget * 0.7) {
        elements.push(el);
        tokensUsed += tokens;
      }
    }

    // Fill remainder with context elements (summaries only)
    const contextBudget = budget - tokensUsed;
    const context = await this.getContextElements(canvasId, elements, contextBudget);
    elements.push(...context);

    return elements;
  }
}
```

### Key Insights: Context as a Scarce Resource

| Principle | Implementation | Impact |
|-----------|---------------|--------|
| **Reserve generation space** | Always keep 4K+ tokens free | Model can think and respond |
| **Compress aggressively** | Tool results → summaries | 10x more history fits |
| **Prioritize recency** | Recent > older messages | Better task continuity |
| **Lazy load content** | Load only what's needed | More room for reasoning |
| **Track every token** | Accounting system | Predictable behavior |
| **Graceful degradation** | Summarize vs truncate | No sudden failures |

**The Meta-Principle:**

> Context window is the agent's working memory. Treat every token like RAM in a memory-constrained system. The agent that manages context well can handle arbitrarily long sessions; the one that doesn't will fail mysteriously when context fills up.

---

## Part 5: Error Recovery Patterns

### Claude Code's Retry Logic

```typescript
// Built into system prompt
const RECOVERY_RULES = `
## Error Recovery

1. **Transient Errors** (network, timeout)
   - Retry up to 2 times with exponential backoff
   - Wait 1s, then 2s, then fail

2. **Validation Errors** (invalid input)
   - Parse error message for specific issue
   - Correct the input and retry once
   - If still failing, ask user for clarification

3. **Conflict Errors** (version mismatch)
   - Re-read current canvas state
   - Re-plan based on new state
   - Execute with fresh version

4. **Resource Errors** (element not found)
   - Query canvas to verify element existence
   - If deleted, skip operation and note in response
   - If renamed, find by content/position
`;
```

### Implementation

```typescript
async function executeWithRecovery(
  operation: Operation,
  maxRetries: number = 2
): Promise<OperationResult> {

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Pre-validate
      const validation = await validate(operation);
      if (!validation.valid) {
        // Try to fix
        const fixed = await autoFix(operation, validation.issues);
        if (fixed) {
          operation = fixed;
        } else {
          throw new ValidationError(validation.issues);
        }
      }

      // Execute
      const result = await mcp.execute(operation.tool, operation.input);

      // Verify
      if (result.error) {
        throw new OperationError(result.error);
      }

      return { success: true, result };

    } catch (error) {
      lastError = error;

      // Classify error
      const errorType = classifyError(error);

      switch (errorType) {
        case 'transient':
          // Retry with backoff
          await sleep(Math.pow(2, attempt) * 1000);
          continue;

        case 'version_conflict':
          // Refresh state and retry
          await refreshCanvasState();
          continue;

        case 'not_found':
          // Try to find alternative
          const alternative = await findAlternative(operation);
          if (alternative) {
            operation = alternative;
            continue;
          }
          break;

        case 'validation':
          // One more try with fixed input
          if (attempt === 0) {
            const fixed = await llmFixInput(operation, error);
            if (fixed) {
              operation = fixed;
              continue;
            }
          }
          break;
      }

      // Can't recover
      break;
    }
  }

  return {
    success: false,
    error: lastError,
    recoveryAttempts: maxRetries + 1
  };
}
```

---

## Part 6: Key Takeaways

### What Makes Claude Code Remarkable

| Factor | Implementation | Result |
|--------|---------------|--------|
| **Minimal tools** | 7 core tools | Deep mastery, clear composition |
| **Streaming** | Async generators | Immediate feedback, natural cancellation |
| **Structured thinking** | XML tags in prompts | Better reasoning, debuggable |
| **Stateless** | Resources, not instance state | Serializable, testable |
| **Observable** | Pre/post hooks | Full audit trail, reactive UI |
| **Skills** | Auto-activating context | 100x knowledge compression |
| **Delegation** | Task tool + sub-agents | Clean boundaries, parallelism |
| **Context management** | Token accounting + compression | Long sessions, graceful degradation |

### Application to Waiboard

```
Claude Code Success         Waiboard Application
─────────────────────────────────────────────────────────
Read/Write/Edit/Grep/Glob → canvas_read/write/edit/find/capture
Task sub-agents           → Layout/Style/Connector specialists
XML reasoning tags        → <analyze>/<plan>/<execute>/<verify>
Skill auto-activation     → Diagram/Wireframe/Moodboard skills
Pre/post hooks            → Validation, metrics, UI events
Streaming generators      → Real-time progress, cancellation
Stateless systems         → Resources-based state
Context management        → CanvasAgentContextManager + budgets
```

### The Meta-Pattern

**Claude Code's core insight:**

> Complexity should be in the prompts and skills, not in the architecture.
>
> - Simple tools + rich prompts = emergent capability
> - Few agents + deep specialization = better than many shallow agents
> - Observable state + hooks = debuggable without complexity
> - Streaming + structured output = great UX without coupling
> - Context management + token budgets = unlimited session length

This is the opposite of the ADK Migration Plan which proposed complex multi-agent architectures. Claude Code shows that **a well-prompted single agent with good tools often outperforms a complex multi-agent system**.

---

## Implementation Priority

1. **Immediate**: Adopt 5-tool pattern (read/write/edit/find/capture)
2. **Phase 1**: Implement streaming async generators
3. **Phase 2**: Add XML reasoning structure to prompts
4. **Phase 3**: Build context management + token accounting
5. **Phase 4**: Build skill auto-activation system
6. **Phase 5**: Implement pre/post hooks
7. **Phase 6**: Add sub-agent delegation for complex tasks

The goal: **A single well-equipped agent that can handle 80% of tasks, with specialized sub-agents for the remaining 20%.** Context management ensures the agent can handle arbitrarily long sessions without degradation.
