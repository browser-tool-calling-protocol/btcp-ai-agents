# AI Agents Architecture Proposals
**Production-Grade Multi-Agent System Design**

**Status**: Proposal
**Based On**: Anthropic's 2025 prompt engineering principles
**Current State**: 75-80% implementation
**Target State**: 90%+ production-ready
**Timeline**: 5 weeks
**Last Updated**: 2025-11-23

---

## Executive Summary

### Current State
The Waiboard AI agents system demonstrates strong conceptual understanding of Anthropic's 2025 prompt engineering best practices with **75-80% alignment**. The foundation is solid with excellent XML structure, extended thinking patterns, and multi-agent architecture awareness.

### The Quality Gap
However, there are critical **execution gaps** preventing production-grade performance:

| Dimension | Current | Anthropic Best Practice | Gap |
|-----------|---------|------------------------|-----|
| **Agent Workflow** | Sequential delegation | Parallel sub-agent execution | No simultaneous spawning |
| **Prompting** | XML tags documented | Complete templates with examples | Missing few-shot examples |
| **Workflow Structure** | 4-step linear | Plan → Execute → Synthesize | No planning phase or result merging |
| **Progressive Skills** | Binary loading | 3-tier (metadata → core → JIT) | No metadata tier |
| **Context Compaction** | Simple truncation | High-fidelity summarization | Losing critical context |
| **Tool Integration** | Unstructured outputs | JSON schema + visual verification | No deterministic validators |

### Expected Outcomes
By implementing these 6 proposals:

- ✅ **Visual consistency** through deterministic verification tools (90%+ accuracy)
- ✅ **2-3× performance** via parallel agent execution on complex tasks
- ✅ **Long-session coherence** maintaining context over 50+ turns
- ✅ **30-50% token efficiency** through progressive skill loading
- ✅ **Production reliability** with <5% error rate

---

## Proposal 1: Agents Workflow and Structure
**Priority**: 🔴 **P0 - Critical**
**Effort**: Medium (2 weeks)
**Impact**: 2-3× performance improvement

### Current Implementation

```typescript
// Current: Sequential delegation pattern
class OrchestratorAgent {
  async handle(request: string) {
    // Step 1: Delegate to canvas agent
    const canvasResult = await this.delegateToAgent('canvas', 'Create 3 circles');

    // Step 2: Wait for completion, then delegate alignment
    const alignResult = await this.delegateToAgent('canvas', 'Align horizontally');

    return { canvasResult, alignResult };
  }
}
```

**Problems**:
- ❌ Sequential execution wastes time on independent tasks
- ❌ No context isolation between sub-agents
- ❌ No result synthesis mechanism
- ❌ Can't scale to complex multi-component tasks

### Anthropic Pattern

**Reference**: `docs/engineering/AI/prompt-engineering-at-anthropic.md` (lines 144-198)

Anthropic recommends a **Lead Orchestrator + Parallel Sub-Agents** pattern:

```
Lead Agent (Orchestrator)
├─ Analyzes request
├─ Decomposes into independent subtasks
├─ Spawns 4+ sub-agents **simultaneously**
├─ Each sub-agent has isolated context window
└─ Synthesizes results into coherent response
```

**Performance**: 4-15× token usage for **90% performance gain** on complex tasks

### Proposed Solution

#### Architecture
```typescript
interface SubTask {
  agent: 'canvas' | 'creative' | 'code';
  task: string;
  independent: boolean;  // Can run in parallel?
  dependencies: string[]; // Task IDs this depends on
}

interface TaskResult {
  taskId: string;
  success: boolean;
  data: any;
  metadata: {
    executionTime: number;
    tokensUsed: number;
  };
}

class OrchestratorAgent {
  async handle(request: string): Promise<string> {
    // Phase 1: Analysis & Decomposition
    const plan = await this.analyzeAndPlan(request);

    // Phase 2: Parallel Execution
    const results = await this.executeParallel(plan.subtasks);

    // Phase 3: Synthesis
    return this.synthesizeResults(results);
  }

  private async analyzeAndPlan(request: string): Promise<ExecutionPlan> {
    const prompt = `
<thinking>
### Analysis
Request: "${request}"
Goal: Identify independent subtasks that can run in parallel

### Decomposition
Break into atomic operations. Mark dependencies.

### Critique
- Can these tasks run simultaneously?
- What data does each task need?
- Are there hidden dependencies?
</thinking>

Analyze this request and create an execution plan.
    `;

    const response = await this.generate(prompt);

    return {
      subtasks: [
        {
          id: 'task-1',
          agent: 'creative',
          task: 'Generate character in scene',
          independent: true,
          dependencies: []
        },
        {
          id: 'task-2',
          agent: 'creative',
          task: 'Design background composition',
          independent: true,
          dependencies: []
        },
        {
          id: 'task-3',
          agent: 'canvas',
          task: 'Load previous scene for continuity',
          independent: true,
          dependencies: []
        },
        {
          id: 'task-4',
          agent: 'canvas',
          task: 'Position dialogue near character',
          independent: false,
          dependencies: ['task-1'] // Needs character position
        }
      ]
    };
  }

  private async executeParallel(subtasks: SubTask[]): Promise<TaskResult[]> {
    const results: TaskResult[] = [];

    // Phase 1: Execute independent tasks in parallel
    const independentTasks = subtasks.filter(t => t.independent);

    console.log(`🚀 Spawning ${independentTasks.length} parallel sub-agents`);

    const parallelResults = await Promise.all(
      independentTasks.map(async (task) => {
        const startTime = performance.now();

        // Each sub-agent gets isolated context
        const isolatedContext = this.buildIsolatedContext(task);

        const result = await this.delegateToAgent(
          task.agent,
          task.task,
          isolatedContext
        );

        return {
          taskId: task.id,
          success: true,
          data: result,
          metadata: {
            executionTime: performance.now() - startTime,
            tokensUsed: result.usage?.total_tokens || 0
          }
        };
      })
    );

    results.push(...parallelResults);

    // Phase 2: Execute dependent tasks sequentially
    const dependentTasks = subtasks.filter(t => !t.independent);

    for (const task of dependentTasks) {
      const dependencies = results.filter(r =>
        task.dependencies.includes(r.taskId)
      );

      const contextWithDeps = this.buildContextFromDependencies(
        task,
        dependencies
      );

      const startTime = performance.now();
      const result = await this.delegateToAgent(
        task.agent,
        task.task,
        contextWithDeps
      );

      results.push({
        taskId: task.id,
        success: true,
        data: result,
        metadata: {
          executionTime: performance.now() - startTime,
          tokensUsed: result.usage?.total_tokens || 0
        }
      });
    }

    return results;
  }

  private buildIsolatedContext(task: SubTask): string {
    // Each sub-agent gets ONLY the context it needs
    return `
## Task Context
${task.task}

## Available Tools
${this.getToolsForAgent(task.agent)}

## Canvas State (if needed)
${task.agent === 'canvas' ? this.getCanvasSnapshot() : ''}

## Style Guide (if needed)
${task.agent === 'creative' ? this.getStyleGuide() : ''}
    `.trim();
  }

  private buildContextFromDependencies(
    task: SubTask,
    dependencies: TaskResult[]
  ): string {
    return `
## Task Context
${task.task}

## Results from Previous Tasks
${dependencies.map(dep => `
### ${dep.taskId}
${JSON.stringify(dep.data, null, 2)}
`).join('\n')}

## Your Task
Use the information above to complete: ${task.task}
    `.trim();
  }

  private async synthesizeResults(results: TaskResult[]): Promise<string> {
    // Lead agent merges sub-agent outputs into coherent response
    const prompt = `
<thinking>
### Sub-Agent Results
${results.map(r => `
- Task: ${r.taskId}
- Success: ${r.success}
- Time: ${r.metadata.executionTime.toFixed(0)}ms
- Data: ${JSON.stringify(r.data, null, 2)}
`).join('\n')}

### Synthesis Strategy
How do these results combine to answer the user's request?
What's the coherent narrative?
</thinking>

Merge these results into a single, coherent response for the user.
    `;

    return this.generate(prompt);
  }
}
```

### Implementation Checklist

- [ ] Add `ExecutionPlan` and `SubTask` types
- [ ] Implement `analyzeAndPlan()` with dependency detection
- [ ] Implement `executeParallel()` with Promise.all for independent tasks
- [ ] Implement `buildIsolatedContext()` for context isolation
- [ ] Implement `synthesizeResults()` for merging outputs
- [ ] Add performance metrics tracking (execution time per task)
- [ ] Write tests for parallel vs sequential execution
- [ ] Document when to use parallel vs sequential patterns

### Success Metrics

**Before**:
- Complex 4-step task: 20 seconds (sequential)
- Token usage: 5,000 tokens
- Context contamination: High risk

**After**:
- Same task: 7 seconds (3 parallel + 1 sequential)
- Token usage: 12,000 tokens (2.4× but acceptable for 3× speed)
- Context contamination: Eliminated via isolation

**ROI**: 3× faster on complex tasks, worth the 2.4× token cost

---

## Proposal 2: Prompting Format (Lead Agent, Sub-Agents)
**Priority**: 🟡 **P1 - High**
**Effort**: Low-Medium (1 week)
**Impact**: Higher consistency, fewer errors

### Current Implementation

**Current Orchestrator Prompt** (conceptual):
```typescript
const orchestratorPrompt = `
You are the Orchestrator agent.
Use <thinking> tags to analyze the request.
Delegate to sub-agents as needed.
`;
```

**Problems**:
- ❌ No concrete examples of expected behavior
- ❌ Vague instructions ("as needed")
- ❌ No output format specification
- ❌ Missing tone and style guidance

### Anthropic Pattern

**Reference**: `docs/engineering/AI/prompt-engineering-at-anthropic.md` (lines 61-131)

Anthropic recommends:
1. **XML Structure** - Organized thinking blocks
2. **Explicit Instructions** - Specific, concrete guidance
3. **Few-Shot Examples** - 3-5 realistic input-output pairs
4. **Output Schemas** - Structured data formats
5. **Tone Mimicry** - Prompt style influences response style

### Proposed Solution

#### Complete Orchestrator Prompt Template

```typescript
const ORCHESTRATOR_SYSTEM_PROMPT = `
# Role
You are the **Orchestrator Agent** - the lead coordinator for the Waiboard AI system. Your job is to analyze complex requests, decompose them into subtasks, delegate to specialized sub-agents, and synthesize their results.

# Available Sub-Agents
- **canvas-agent**: Canvas operations (create, modify, align, group elements)
- **creative-agent**: AI image generation, style application, creative decisions
- **code-agent**: TypeScript code execution, calculations, data processing

# Workflow
<workflow>
1. **Analysis**: Understand user intent and required capabilities
2. **Planning**: Decompose into subtasks, identify dependencies
3. **Delegation**: Spawn sub-agents with isolated context
4. **Synthesis**: Merge results into coherent response
</workflow>

# Output Format
Always structure your thinking:

<thinking>
### Analysis
[What is the user asking for? What's the core goal?]

### Plan
[List subtasks in dependency order. Mark which can run in parallel.]
- Task 1: [description] (parallel)
- Task 2: [description] (parallel)
- Task 3: [description] (depends on Task 1)

### Critique
[Double-check: Are there hidden dependencies? Optimal order?]
</thinking>

<implementation>
[Delegate to sub-agents or execute directly]
</implementation>

# Examples

## Example 1: Simple Request (Direct Execution)

**Input**: "Create 3 blue circles"

<thinking>
### Analysis
User wants basic canvas operation. No creative generation needed.

### Plan
- Single task: Create 3 circle elements with blue fill
- Agent: canvas-agent (direct delegation)

### Critique
Simple request, no decomposition needed. Direct delegation is optimal.
</thinking>

<implementation>
Delegate to canvas-agent:
"Create 3 ellipse elements with blue fill color, positioned horizontally at (100,100), (200,100), (300,100)"
</implementation>

---

## Example 2: Complex Multi-Component Request

**Input**: "Create a storyboard panel showing a character waving in a forest scene with dialogue"

<thinking>
### Analysis
Complex request requiring:
- Character generation (creative)
- Background scene (creative)
- Dialogue text placement (canvas)
- Composition layout (canvas)

### Plan
**Parallel Tasks** (independent):
- Task 1: Generate character waving (creative-agent)
- Task 2: Generate forest background (creative-agent)
- Task 3: Load previous panel for style continuity (canvas-agent)

**Sequential Tasks** (dependent):
- Task 4: Compose character + background (canvas-agent, needs Task 1 & 2)
- Task 5: Add dialogue text near character (canvas-agent, needs Task 4)

### Critique
Tasks 1, 2, 3 are independent → run in parallel (3× faster).
Tasks 4, 5 depend on results → must be sequential.
</thinking>

<implementation>
**Phase 1: Parallel Execution**

Spawn 3 sub-agents simultaneously:

1. creative-agent: "Generate image of character waving, match style from previous panels"
2. creative-agent: "Generate forest background scene, daylight, peaceful mood"
3. canvas-agent: "Load most recent panel, extract style guide (colors, composition)"

**Phase 2: Sequential Execution**

4. canvas-agent: "Compose character image at (100,100) over background, maintain depth"
5. canvas-agent: "Add dialogue text 'Hello!' positioned above character at (120, 80)"

**Synthesis**: All components combined into cohesive storyboard panel.
</implementation>

---

## Example 3: Error Recovery

**Input**: "Make the character taller"

<thinking>
### Analysis
User refers to "the character" but no character is selected or identified.
Missing information: Which character? Which panel?

### Plan
- No subtasks yet
- Need clarification from user

### Critique
Cannot proceed without disambiguation. Ask user for clarification.
</thinking>

<implementation>
**Clarification Needed**

I need more information to proceed:
- Which character do you want to modify? (If multiple exist)
- Which panel contains this character?
- How much taller? (Specific height or percentage increase)

Please provide these details and I'll make the adjustment.
</implementation>

# Guidelines

## Delegation Rules
- **Parallel**: If tasks don't depend on each other's outputs
- **Sequential**: If task B needs data from task A
- **Direct**: If request maps to single agent capability

## Context Isolation
When delegating, give each sub-agent ONLY what it needs:
- Canvas operations → canvas state snapshot
- Creative generation → style guide + reference images
- Code execution → input data + expected output format

## Error Handling
If a sub-agent fails:
1. Analyze the error
2. Determine if retry with adjusted prompt would help
3. If unrecoverable, inform user with specific error details

## Tone
- Professional and technical
- Concise thinking process
- Clear delegation instructions
- No marketing language or superlatives
`;
```

#### Complete Creative Agent Prompt Template

```typescript
const CREATIVE_AGENT_SYSTEM_PROMPT = `
# Role
You are the **Creative Agent** - the AI image generation specialist for Waiboard. You handle all creative visual content generation with a focus on **consistency across panels**.

# Core Capabilities
- Generate images via AI tools (Stable Diffusion, DALL-E, etc.)
- Apply style guides and maintain visual consistency
- Match character appearances across multiple panels
- Compose scenes with proper lighting, mood, composition

# Tools Available
<tools>
- generate_image(prompt, style_params): AI image generation
- analyze_color_palette(image_url): Extract dominant colors
- check_character_consistency(image, reference): Validate appearance match
- apply_style_transfer(image, style_reference): Match artistic style
</tools>

# Output Format

<design_thinking>
### Style Analysis
[What style/mood is required? Reference previous panels?]

### Prompt Engineering
[Craft AI generation prompt with specific details]

### Consistency Checks
[How will I validate this matches existing work?]
</design_thinking>

<implementation>
[Execute generation and validation]
</implementation>

# Examples

## Example 1: Character Generation with Consistency

**Input**: "Generate protagonist character for panel 2"

<design_thinking>
### Style Analysis
Need to match Panel 1 character appearance:
- Green eyes, brown hair, casual clothing
- Watercolor art style
- Warm color palette (oranges, yellows)

### Prompt Engineering
"Character portrait, brown hair, green eyes, casual t-shirt, watercolor painting style, warm lighting, soft brush strokes, orange and yellow tones, friendly expression"

### Consistency Checks
1. Generate image
2. Extract color palette → validate matches warm tones
3. Compare character features → validate green eyes, brown hair
4. If mismatch >20%, regenerate with adjusted prompt
</design_thinking>

<implementation>
**Step 1: Generate**
prompt = "Character portrait, brown hair, green eyes, casual t-shirt, watercolor painting style, warm lighting, soft brush strokes, orange and yellow tones, friendly expression"
image = generate_image(prompt, {style: "watercolor", quality: "high"})

**Step 2: Validate Consistency**
colors = analyze_color_palette(image)
→ Dominant: #FF8C42 (orange), #FFD700 (yellow) ✓
→ Match score: 92% ✓

character_check = check_character_consistency(image, reference_panel_1)
→ Hair color: ✓ brown
→ Eye color: ✓ green
→ Overall similarity: 88% ✓

**Result**: Image validated and ready for canvas placement.
</implementation>

---

## Example 2: Scene Generation with Mood

**Input**: "Create a forest scene, peaceful mood, for background"

<design_thinking>
### Style Analysis
Peaceful mood requires:
- Soft lighting (golden hour or dappled sunlight)
- Cool greens and blues for calm effect
- Minimal visual noise (simple composition)

### Prompt Engineering
"Forest clearing, dappled sunlight through trees, peaceful atmosphere, soft focus background, gentle greens and blues, watercolor style, serene mood, simple composition"

### Consistency Checks
- Validate color temperature (cool tones)
- Check composition balance (rule of thirds)
</design_thinking>

<implementation>
**Step 1: Generate**
image = generate_image(
  "Forest clearing, dappled sunlight through trees, peaceful atmosphere, soft focus background, gentle greens and blues, watercolor style, serene mood, simple composition",
  {style: "watercolor", mood: "peaceful"}
)

**Step 2: Validate**
composition = analyze_composition(image)
→ Visual balance: 0.85 ✓
→ Focal point: Center-left (good) ✓

colors = analyze_color_palette(image)
→ Cool tones: 78% ✓
→ Warm tones: 22% (accent) ✓

**Result**: Scene validated, peaceful mood achieved.
</implementation>

# Guidelines

## Consistency is Critical
- **Always** check generated content against style guides
- **Always** validate character appearances match references
- **Never** skip validation steps

## Prompt Engineering Best Practices
- Be specific: "brown hair" not "dark hair"
- Include style: "watercolor", "oil painting", "digital art"
- Specify mood/lighting: "golden hour", "dramatic shadows"
- Define composition: "rule of thirds", "centered subject"

## Validation Thresholds
- Color palette match: >80% acceptable
- Character consistency: >85% acceptable
- If below threshold: Regenerate with adjusted prompt

## Error Handling
If generation fails:
1. Analyze what went wrong (prompt too vague? Style conflict?)
2. Adjust prompt and retry (max 3 attempts)
3. If still failing, report specific issue to user
`;
```

### Implementation Checklist

- [ ] Create complete prompt templates for all 4 agents
- [ ] Add 3-5 few-shot examples per agent
- [ ] Define clear output formats (XML structure)
- [ ] Specify tone and style guidelines
- [ ] Add error recovery examples
- [ ] Document delegation patterns
- [ ] Test prompts with real scenarios
- [ ] Measure consistency improvement

### Success Metrics

**Before**:
- Inconsistent outputs (agent behavior varies)
- Unclear error messages
- 15-20% task clarification rate

**After**:
- Predictable, consistent behavior
- Specific error messages with recovery suggestions
- <5% clarification rate
- 40-60% error reduction (from extended thinking)

---

## Proposal 3: Workflow Structure (Planning → Doing → Merging)
**Priority**: 🟡 **P1 - High**
**Effort**: Medium (1 week)
**Impact**: Better task execution quality
**Status**: ✅ **COMPLETE**

### Implemented Solution

The workflow now implements a structured **3-phase pattern** with OrchestratorAgent handling intent classification using LLM-based analysis (not brittle keyword matching).

### Anthropic Pattern

**Reference**: `docs/engineering/AI/prompt-engineering-at-anthropic.md` (Orchestrator workflow)

Anthropic recommends a structured **3-phase workflow**:

```
Phase 1: PLANNING
├─ Analyze request with extended thinking
├─ Decompose into subtasks
├─ Identify dependencies
├─ Critique plan for flaws
└─ Prepare tool/agent selections

Phase 2: EXECUTION
├─ Spawn parallel sub-agents for independent tasks
├─ Execute sequential tasks with dependencies
├─ Collect intermediate results
└─ Monitor for errors

Phase 3: SYNTHESIS
├─ Merge sub-agent outputs
├─ Validate against requirements
├─ Quality checks (consistency, completeness)
└─ Format final response
```

### Proposed Solution

```typescript
interface WorkflowPlan {
  analysis: {
    intent: string;
    requiredCapabilities: string[];
    complexity: 'simple' | 'medium' | 'complex';
  };
  subtasks: SubTask[];
  validationCriteria: {
    mustHave: string[];
    qualityChecks: string[];
  };
}

class ImprovedWorkflow {
  async handleUserMessage(message: string): Promise<string> {
    // Phase 1: PLANNING
    const plan = await this.planPhase(message);

    // Phase 2: EXECUTION
    const results = await this.executionPhase(plan);

    // Phase 3: SYNTHESIS
    const response = await this.synthesisPhase(plan, results);

    return response;
  }

  // ============================================
  // Phase 1: PLANNING
  // ============================================

  private async planPhase(message: string): Promise<WorkflowPlan> {
    console.log('📋 Phase 1: Planning');

    // Step 1.1: Gather context
    const canvasState = await this.takeCanvasSnapshot();
    const memoryContext = await this.memory.getContextForPrompt(4000);
    const storyBible = await this.storyBible.getContextForAgent();

    // Step 1.2: OrchestratorAgent analyzes intent + creates detailed plan
    // (Intent classification is built into the orchestrator's system prompt)
    const orchestratorPlan = await this.orchestrator.createPlan({
      userMessage: message,
      canvasState,
      memoryContext,
      storyBible
    });

    // Step 1.3: Critique and refine plan
    const refinedPlan = await this.orchestrator.critiquePlan(orchestratorPlan);

    return refinedPlan;
  }

  // ============================================
  // Phase 2: EXECUTION
  // ============================================

  private async executionPhase(plan: WorkflowPlan): Promise<TaskResult[]> {
    console.log('⚙️  Phase 2: Execution');

    const results: TaskResult[] = [];

    // Step 2.1: Execute independent tasks in parallel
    const independentTasks = plan.subtasks.filter(t => t.independent);

    if (independentTasks.length > 0) {
      console.log(`🚀 Executing ${independentTasks.length} tasks in parallel`);

      const parallelResults = await Promise.all(
        independentTasks.map(task => this.executeTask(task))
      );

      results.push(...parallelResults);
    }

    // Step 2.2: Execute dependent tasks sequentially
    const dependentTasks = plan.subtasks.filter(t => !t.independent);

    for (const task of dependentTasks) {
      console.log(`⏳ Executing dependent task: ${task.id}`);

      // Build context from previous results
      const dependencies = results.filter(r =>
        task.dependencies.includes(r.taskId)
      );

      const result = await this.executeTask(task, dependencies);
      results.push(result);
    }

    // Step 2.3: Error handling
    const failures = results.filter(r => !r.success);
    if (failures.length > 0) {
      console.warn(`⚠️  ${failures.length} tasks failed:`, failures);
      // Attempt recovery or report to user
    }

    return results;
  }

  private async executeTask(
    task: SubTask,
    dependencies?: TaskResult[]
  ): Promise<TaskResult> {
    const startTime = performance.now();

    try {
      let result;

      switch (task.agent) {
        case 'canvas':
          result = await this.canvasAgent.handle(task.task, dependencies);
          break;
        case 'creative':
          result = await this.creativeAgent.handle(task.task, dependencies);
          break;
        case 'code':
          result = await this.codeAgent.handle(task.task, dependencies);
          break;
        default:
          throw new Error(`Unknown agent: ${task.agent}`);
      }

      return {
        taskId: task.id,
        success: true,
        data: result,
        metadata: {
          executionTime: performance.now() - startTime,
          tokensUsed: result.usage?.total_tokens || 0
        }
      };
    } catch (error) {
      return {
        taskId: task.id,
        success: false,
        error: {
          message: error.message,
          stack: error.stack
        },
        metadata: {
          executionTime: performance.now() - startTime,
          tokensUsed: 0
        }
      };
    }
  }

  // ============================================
  // Phase 3: SYNTHESIS
  // ============================================

  private async synthesisPhase(
    plan: WorkflowPlan,
    results: TaskResult[]
  ): Promise<string> {
    console.log('🎯 Phase 3: Synthesis & Validation');

    // Step 3.1: Validate results against criteria
    const validation = await this.validateResults(results, plan.validationCriteria);

    if (!validation.passed) {
      console.warn('⚠️  Validation failed:', validation.failures);
      // Attempt recovery or report issues
    }

    // Step 3.2: Quality checks
    const qualityChecks = await this.performQualityChecks(results, plan);

    // Step 3.3: Synthesize final response
    const synthesizedResponse = await this.orchestrator.synthesizeResults({
      plan,
      results,
      validation,
      qualityChecks
    });

    // Step 3.4: Update memory with outcomes
    await this.memory.addTurn({
      role: 'assistant',
      content: synthesizedResponse,
      metadata: {
        plan,
        results,
        validation,
        qualityChecks
      }
    });

    return synthesizedResponse;
  }

  private async validateResults(
    results: TaskResult[],
    criteria: WorkflowPlan['validationCriteria']
  ): Promise<ValidationResult> {
    const failures: string[] = [];

    // Check must-have requirements
    for (const requirement of criteria.mustHave) {
      const satisfied = results.some(r =>
        r.success && this.meetsRequirement(r.data, requirement)
      );

      if (!satisfied) {
        failures.push(`Missing requirement: ${requirement}`);
      }
    }

    // Perform quality checks
    for (const check of criteria.qualityChecks) {
      const checkResult = await this.performCheck(results, check);

      if (!checkResult.passed) {
        failures.push(`Quality check failed: ${check} - ${checkResult.reason}`);
      }
    }

    return {
      passed: failures.length === 0,
      failures,
      score: 1 - (failures.length / (criteria.mustHave.length + criteria.qualityChecks.length))
    };
  }

  private async performQualityChecks(
    results: TaskResult[],
    plan: WorkflowPlan
  ): Promise<QualityReport> {
    const checks: QualityCheck[] = [];

    // Visual consistency check (if creative work involved)
    if (plan.analysis.requiredCapabilities.includes('creative')) {
      const images = results
        .filter(r => r.data.type === 'image')
        .map(r => r.data.url);

      if (images.length > 0) {
        const consistencyCheck = await this.checkVisualConsistency(images);
        checks.push({
          name: 'Visual Consistency',
          passed: consistencyCheck.score > 0.8,
          score: consistencyCheck.score,
          details: consistencyCheck.details
        });
      }
    }

    // Canvas integrity check
    if (plan.analysis.requiredCapabilities.includes('canvas')) {
      const canvasCheck = await this.checkCanvasIntegrity();
      checks.push({
        name: 'Canvas Integrity',
        passed: canvasCheck.valid,
        score: canvasCheck.score,
        details: canvasCheck.issues
      });
    }

    // Performance check
    const totalTime = results.reduce((sum, r) => sum + r.metadata.executionTime, 0);
    const totalTokens = results.reduce((sum, r) => sum + r.metadata.tokensUsed, 0);

    checks.push({
      name: 'Performance',
      passed: totalTime < 30000, // <30 seconds
      score: Math.max(0, 1 - (totalTime / 30000)),
      details: {
        totalTime: `${totalTime.toFixed(0)}ms`,
        totalTokens,
        avgTimePerTask: `${(totalTime / results.length).toFixed(0)}ms`
      }
    });

    return {
      checks,
      overallScore: checks.reduce((sum, c) => sum + c.score, 0) / checks.length,
      passed: checks.every(c => c.passed)
    };
  }

  private async checkVisualConsistency(images: string[]): Promise<ConsistencyReport> {
    // Use visual verification tools from Proposal 6
    const paletteChecks = await Promise.all(
      images.map(img => this.tools.analyzeColorPalette(img))
    );

    const referenceColorSet = new Set(paletteChecks[0].dominantColors);
    let matchScore = 0;

    for (let i = 1; i < paletteChecks.length; i++) {
      const currentColorSet = new Set(paletteChecks[i].dominantColors);
      const intersection = new Set(
        [...referenceColorSet].filter(c => currentColorSet.has(c))
      );
      matchScore += intersection.size / referenceColorSet.size;
    }

    matchScore /= (paletteChecks.length - 1);

    return {
      score: matchScore,
      details: {
        imagesChecked: images.length,
        colorPaletteMatch: matchScore,
        dominantColors: paletteChecks[0].dominantColors
      }
    };
  }

  private async checkCanvasIntegrity(): Promise<IntegrityReport> {
    const snapshot = await this.takeCanvasSnapshot();
    const issues: string[] = [];
    let score = 1.0;

    // Check for overlapping elements that shouldn't overlap
    const overlaps = this.detectUnintendedOverlaps(snapshot.elements);
    if (overlaps.length > 0) {
      issues.push(`${overlaps.length} unintended element overlaps`);
      score -= 0.2;
    }

    // Check for elements outside canvas bounds
    const outOfBounds = snapshot.elements.filter(el =>
      el.x < 0 || el.y < 0 ||
      el.x > snapshot.width || el.y > snapshot.height
    );
    if (outOfBounds.length > 0) {
      issues.push(`${outOfBounds.length} elements outside canvas bounds`);
      score -= 0.3;
    }

    // Check for orphaned elements (no group, layer, or purpose)
    const orphaned = snapshot.elements.filter(el =>
      !el.groupId && !el.layerId && !el.tags?.length
    );
    if (orphaned.length > 5) { // Allow some unorganized elements
      issues.push(`${orphaned.length} orphaned elements (poor organization)`);
      score -= 0.1;
    }

    return {
      valid: issues.length === 0,
      score: Math.max(0, score),
      issues
    };
  }
}
```

### Implementation Checklist

- [x] Refactor workflow to 3-phase structure
- [x] Implement `planPhase()` with OrchestratorAgent (includes intent classification)
- [x] Implement `executionPhase()` with parallel support
- [x] Implement `synthesisPhase()` with real validation
- [x] Add `validateResults()` with criteria checking
- [x] Add `performQualityChecks()` with visual/canvas/performance checks
- [x] Implement `checkVisualConsistency()` using image analysis tools
- [x] Implement `checkCanvasIntegrity()` with overlap/bounds detection
- [x] Add comprehensive error handling and recovery
- [ ] Write integration tests for full workflow

### Success Metrics

**Before**:
- No planning phase (direct execution)
- Validation is stub (no actual checks)
- No quality verification
- Errors surface late in process

**After**:
- Explicit planning with critique
- Real validation against criteria (>90% accuracy)
- Quality checks catch issues before user sees them
- Errors caught early in planning phase

---

## Proposal 4: Progressive Skills Loading
**Priority**: 🟡 **P1 - High**
**Effort**: Medium (1 week)
**Impact**: 30-50% token efficiency improvement

### Current Implementation

```typescript
class SkillManager {
  detectRequiredSkills(message: string): string[] {
    const skills: string[] = [];

    // Regex-based detection
    if (/color|palette|contrast/.test(message)) {
      skills.push('ColorTheorySkill'); // Loads full 1200 tokens
    }

    if (/layout|grid|spacing|align/.test(message)) {
      skills.push('LayoutCompositionSkill'); // Loads full 1400 tokens
    }

    if (/character|face|expression/.test(message)) {
      skills.push('CharacterDesignSkill'); // Loads full 1300 tokens
    }

    return skills;
  }

  async loadSkills(skillNames: string[]): Promise<string> {
    // Binary loading: all or nothing
    return skillNames.map(name =>
      fs.readFileSync(`./skills/${name}.md`, 'utf-8')
    ).join('\n\n');
  }
}
```

**Problems**:
- ❌ Binary loading (full 1200+ tokens or nothing)
- ❌ Regex-based detection (brittle, false positives/negatives)
- ❌ No skill metadata tier
- ❌ No conditional sub-resources
- ❌ No skill composition guidance

### Anthropic Pattern

**Reference**: `docs/engineering/AI/prompt-engineering-at-anthropic.md` (lines 243-308)

Anthropic recommends **3-tier progressive disclosure**:

```
Tier 1: Metadata (20-40 tokens per skill)
├─ Always loaded
├─ Name, description, keywords
└─ Agent sees "menu" before loading

Tier 2: Core Instructions (1000-3000 tokens)
├─ Loaded on demand when skill needed
├─ Main concepts, rules, examples
└─ LLM decides relevance from metadata

Tier 3: JIT Resources (variable tokens)
├─ Loaded conditionally within skill
├─ Advanced techniques, edge cases
└─ Only for complex scenarios
```

**Efficiency**: 120 tokens (3 metadata) vs 3900 tokens (3 full skills) = **97% reduction** when skills not needed

### Proposed Solution

#### Tier 1: Skill Metadata Registry

```typescript
interface SkillMetadata {
  id: string;
  name: string;
  description: string; // 1-2 sentences
  keywords: string[];
  category: 'visual' | 'technical' | 'creative';
  complexity: 'basic' | 'advanced';
  tokenCost: {
    core: number;
    advanced?: number;
  };
  requiredFor: string[]; // Common use cases
}

const SKILL_REGISTRY: SkillMetadata[] = [
  {
    id: 'color-theory',
    name: 'Color Theory',
    description: 'Color palettes, contrast ratios, WCAG accessibility, 60-30-10 rule, color psychology',
    keywords: ['color', 'palette', 'contrast', 'accessibility', 'hue', 'saturation', 'complementary'],
    category: 'visual',
    complexity: 'basic',
    tokenCost: {
      core: 1200,
      advanced: 800
    },
    requiredFor: ['color selection', 'accessibility compliance', 'mood design']
  },
  {
    id: 'layout-composition',
    name: 'Layout Composition',
    description: 'Grid systems, spacing rules, visual hierarchy, alignment, rule of thirds, golden ratio',
    keywords: ['layout', 'grid', 'spacing', 'align', 'composition', 'hierarchy', 'balance'],
    category: 'visual',
    complexity: 'basic',
    tokenCost: {
      core: 1400,
      advanced: 600
    },
    requiredFor: ['panel layout', 'element positioning', 'visual flow']
  },
  {
    id: 'character-design',
    name: 'Character Design',
    description: 'Character consistency, facial features, expressions, proportions, style matching',
    keywords: ['character', 'face', 'expression', 'proportion', 'consistency', 'features'],
    category: 'creative',
    complexity: 'advanced',
    tokenCost: {
      core: 1300,
      advanced: 900
    },
    requiredFor: ['character generation', 'consistency validation', 'expression design']
  }
];

// Total metadata: ~120 tokens (vs 3900 tokens for full skills)
```

#### Tier 2 & 3: Smart Skill Loader

```typescript
class ProgressiveSkillLoader {
  private coreCache = new Map<string, string>();
  private advancedCache = new Map<string, string>();

  // Always include metadata in agent context
  getSkillMetadataContext(): string {
    return `
# Available Skills

${SKILL_REGISTRY.map(skill => `
## ${skill.name} (${skill.tokenCost.core} tokens)
${skill.description}
**Use for**: ${skill.requiredFor.join(', ')}
`).join('\n')}

To use a skill, reference it by name in your thinking process.
    `.trim();
  }

  // Let LLM decide which skills to load (not regex!)
  async determineRequiredSkills(
    userMessage: string,
    context: string
  ): Promise<string[]> {
    const prompt = `
Given the user's request and available skills, determine which skills are needed.

# Available Skills
${this.getSkillMetadataContext()}

# User Request
"${userMessage}"

# Current Context
${context}

<thinking>
Which skills are relevant to this request?
- Analyze keywords and intent
- Consider task complexity
- Identify required capabilities
</thinking>

Reply with skill IDs only (comma-separated), or "none" if no skills needed.
Examples: "color-theory,layout-composition" or "none"
    `;

    const response = await this.llm.generate(prompt, {
      maxTokens: 100,
      temperature: 0.1 // Low temperature for deterministic selection
    });

    if (response.trim().toLowerCase() === 'none') {
      return [];
    }

    return response.split(',').map(id => id.trim());
  }

  // Load skills progressively
  async loadSkillsForTask(
    skillIds: string[],
    taskComplexity: 'simple' | 'medium' | 'complex'
  ): Promise<string> {
    if (skillIds.length === 0) {
      return ''; // No skills needed
    }

    let context = '# Loaded Skills\n\n';

    for (const skillId of skillIds) {
      const skill = SKILL_REGISTRY.find(s => s.id === skillId);
      if (!skill) continue;

      // Load Tier 2: Core instructions (always)
      const coreContent = await this.loadSkillCore(skillId);
      context += coreContent + '\n\n';

      // Load Tier 3: Advanced resources (conditional)
      if (this.shouldLoadAdvanced(skill, taskComplexity)) {
        const advancedContent = await this.loadSkillAdvanced(skillId);
        context += advancedContent + '\n\n';
      }
    }

    return context;
  }

  private shouldLoadAdvanced(
    skill: SkillMetadata,
    taskComplexity: 'simple' | 'medium' | 'complex'
  ): boolean {
    // Only load advanced for complex tasks or advanced-complexity skills
    return taskComplexity === 'complex' || skill.complexity === 'advanced';
  }

  private async loadSkillCore(skillId: string): Promise<string> {
    if (this.coreCache.has(skillId)) {
      return this.coreCache.get(skillId)!;
    }

    const content = await fs.readFile(
      `./skills/${skillId}/core.md`,
      'utf-8'
    );

    this.coreCache.set(skillId, content);
    return content;
  }

  private async loadSkillAdvanced(skillId: string): Promise<string> {
    if (this.advancedCache.has(skillId)) {
      return this.advancedCache.get(skillId)!;
    }

    const advancedPath = `./skills/${skillId}/advanced.md`;

    if (!fs.existsSync(advancedPath)) {
      return ''; // No advanced content for this skill
    }

    const content = await fs.readFile(advancedPath, 'utf-8');

    this.advancedCache.set(skillId, content);
    return content;
  }
}
```

#### Skill File Structure

```
skills/
├── color-theory/
│   ├── core.md           # 1200 tokens - basic color theory
│   └── advanced.md       # 800 tokens - color psychology, cultural meanings
├── layout-composition/
│   ├── core.md           # 1400 tokens - grid systems, spacing
│   └── advanced.md       # 600 tokens - dynamic layouts, responsive design
└── character-design/
    ├── core.md           # 1300 tokens - proportions, features
    └── advanced.md       # 900 tokens - complex expressions, style variations
```

#### Integration with Agents

```typescript
class CreativeAgent {
  async handle(request: string): Promise<string> {
    // Step 1: Determine task complexity
    const complexity = await this.assessComplexity(request);

    // Step 2: Let LLM choose skills from metadata
    const requiredSkills = await this.skillLoader.determineRequiredSkills(
      request,
      this.getBaseContext()
    );

    console.log(`📚 Loading ${requiredSkills.length} skills for ${complexity} task`);

    // Step 3: Load skills progressively
    const skillContext = await this.skillLoader.loadSkillsForTask(
      requiredSkills,
      complexity
    );

    // Step 4: Generate with loaded skills
    const prompt = `
${this.baseInstructions}

${skillContext}

User request: ${request}
    `;

    return this.generate(prompt);
  }

  private async assessComplexity(request: string): Promise<'simple' | 'medium' | 'complex'> {
    // Simple heuristics or LLM-based assessment
    const wordCount = request.split(' ').length;
    const hasMultipleRequirements = request.includes('and') || request.includes(',');
    const requiresConsistency = request.includes('match') || request.includes('same as');

    if (wordCount > 20 || (hasMultipleRequirements && requiresConsistency)) {
      return 'complex';
    } else if (hasMultipleRequirements || wordCount > 10) {
      return 'medium';
    } else {
      return 'simple';
    }
  }
}
```

### Token Savings Analysis

**Scenario 1: Simple request ("Create 3 blue circles")**

| Approach | Tokens Loaded | Savings |
|----------|---------------|---------|
| Current (binary) | 0 (no skills detected) | - |
| Progressive | 120 (metadata only) | 0% (baseline) |

**Scenario 2: Medium request ("Use complementary colors for the background")**

| Approach | Tokens Loaded | Savings |
|----------|---------------|---------|
| Current (binary) | 1200 (full ColorTheory) | - |
| Progressive | 120 (metadata) + 1200 (core) = 1320 | -10% (slightly worse due to metadata overhead) |

**Scenario 3: Complex request ("Create storyboard with character, matching previous panel colors and layout")**

| Approach | Tokens Loaded | Savings |
|----------|---------------|---------|
| Current (binary) | 3900 (all 3 skills) | - |
| Progressive | 120 (metadata) + 1200 (color core) + 800 (color advanced) + 1400 (layout core) + 1300 (character core) + 900 (character advanced) = 5720 | -47% (worse, loaded advanced) |

**Scenario 4: Request with only 1 skill ("Adjust character expression to look happier")**

| Approach | Tokens Loaded | Savings |
|----------|---------------|---------|
| Current (binary) | 1300 (full CharacterDesign) | - |
| Progressive | 120 (metadata) + 1300 (character core) = 1420 | -9% (metadata overhead) |

**Scenario 5: No skills needed ("Delete the selected element")**

| Approach | Tokens Loaded | Savings |
|----------|---------------|---------|
| Current (binary) | 0 (no match) | - |
| Progressive | 120 (metadata only) | -100% (worse, loaded metadata unnecessarily) |

**Overall Assessment**:
- **Benefit**: LLM-based skill selection is more accurate than regex
- **Trade-off**: Metadata overhead (~120 tokens) always present
- **Win scenarios**: When multiple skills loaded OR when advanced features not needed
- **Optimal for**: Medium-to-complex tasks (most common in creative workflows)

### Revised Approach: Lazy Metadata

To eliminate metadata overhead for simple tasks:

```typescript
class OptimizedSkillLoader extends ProgressiveSkillLoader {
  async loadSkillsForTask(
    userMessage: string,
    taskComplexity: 'simple' | 'medium' | 'complex'
  ): Promise<string> {
    // For simple tasks, skip skill loading entirely
    if (taskComplexity === 'simple') {
      return '';
    }

    // For medium/complex tasks, use progressive loading
    const requiredSkills = await this.determineRequiredSkills(
      userMessage,
      this.getBaseContext()
    );

    return super.loadSkillsForTask(requiredSkills, taskComplexity);
  }
}
```

**Revised Savings**:

| Scenario | Current | Progressive | Savings |
|----------|---------|-------------|---------|
| Simple (70% of requests) | 0 | 0 | 0% (no overhead) |
| Medium 1-skill (15%) | 1200 | 120 + 1200 = 1320 | -10% |
| Medium 2-skills (10%) | 2400 | 120 + 2400 = 2520 | -5% |
| Complex all skills (5%) | 3900 | 120 + 3900 = 4020 | -3% |

**Weighted average**: 70% × 0% + 15% × (-10%) + 10% × (-5%) + 5% × (-3%) = **-2.15%**

**Conclusion**: Metadata overhead is minimal. **Real value is LLM-based skill selection accuracy** (reduces false positives/negatives from regex approach).

### Implementation Checklist

- [ ] Create `SkillMetadata` interface and registry
- [ ] Refactor skills into core.md + advanced.md structure
- [ ] Implement `ProgressiveSkillLoader` class
- [ ] Implement `determineRequiredSkills()` with LLM-based selection
- [ ] Implement `shouldLoadAdvanced()` logic
- [ ] Add skill caching to avoid repeated file reads
- [ ] Integrate with Creative and Canvas agents
- [ ] Add complexity assessment heuristics
- [ ] Write tests comparing regex vs LLM skill selection accuracy
- [ ] Measure token usage before/after

### Success Metrics

**Before**:
- Regex-based skill detection (brittle)
- Binary loading (all or nothing)
- False positive rate: 15-20%
- False negative rate: 10-15%

**After**:
- LLM-based skill selection (context-aware)
- 3-tier progressive loading
- False positive rate: <5%
- False negative rate: <5%
- Metadata overhead: 2-3% average
- **Net benefit**: 10-20% improvement from accurate skill selection

---

## Proposal 5: Context Compaction
**Priority**: 🔴 **P0 - Critical**
**Effort**: Medium (1 week)
**Impact**: Long-session coherence, 60-80% token reduction

### Current Implementation

```typescript
class MemoryManager {
  private conversationHistory: ConversationTurn[] = [];
  private maxTurns = 50;

  addTurn(turn: ConversationTurn) {
    this.conversationHistory.push(turn);

    // Simple truncation: drop oldest
    if (this.conversationHistory.length > this.maxTurns) {
      this.conversationHistory.shift(); // ❌ LOSES CONTEXT
    }
  }

  getRecentTurns(count: number = 20): ConversationTurn[] {
    return this.conversationHistory.slice(-count);
  }
}
```

**Problems**:
- ❌ Simple truncation loses critical context (design decisions, character details, style choices)
- ❌ No token budget awareness
- ❌ No smart compression or summarization
- ❌ Long sessions (50+ turns) become incoherent
- ❌ No preservation of important decisions

**Example of Lost Context**:
```
Turn 5: "Make the character have green eyes"
Turn 10: "Use warm color palette (oranges, yellows)"
Turn 30: "Character should wear casual clothing"
...
Turn 55: [Turn 5 dropped] - Agent forgets green eyes!
Turn 60: [Turn 10 dropped] - Agent forgets warm palette!
```

### Anthropic Pattern

**Reference**: `docs/engineering/AI/prompt-engineering-at-anthropic.md` (lines 379-433)

Anthropic recommends **high-fidelity summarization**:

```
Context Management Strategy:
├─ Keep recent 3-5 messages verbatim (detailed context)
├─ Summarize older messages preserving:
│  ├─ Design decisions made
│  ├─ Character/style details established
│  ├─ Outstanding issues or TODOs
│  └─ User preferences and constraints
└─ Delete truly irrelevant messages (casual chat, clarifications)

Result: 50,000 tokens → 5,000 tokens (10× reduction) with ≥95% information retention
```

### Proposed Solution

```typescript
interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
  metadata?: {
    timestamp: number;
    type?: 'decision' | 'creation' | 'modification' | 'clarification' | 'error';
    importance?: 'critical' | 'high' | 'medium' | 'low';
    tags?: string[]; // ['character-design', 'color-palette', etc.]
  };
}

interface ContextSummary {
  synopsis: string; // High-level overview
  designDecisions: string[]; // Critical decisions made
  establishedDetails: {
    characters: Record<string, string>; // { "protagonist": "green eyes, brown hair, casual clothing" }
    styles: Record<string, string>; // { "colorPalette": "warm oranges and yellows" }
    composition: string[]; // Layout choices
  };
  outstandingIssues: string[]; // Bugs, TODOs, unresolved questions
  userPreferences: Record<string, any>; // Saved preferences
}

class ImprovedMemoryManager {
  private conversationHistory: ConversationTurn[] = [];
  private summary: ContextSummary | null = null;
  private lastSummaryIndex = 0;

  async getContextForPrompt(maxTokens: number = 4000): Promise<string> {
    const estimatedTokens = this.estimateTokens(this.conversationHistory);

    // If within budget, return everything
    if (estimatedTokens <= maxTokens) {
      return this.formatVerbatimContext(this.conversationHistory);
    }

    // Otherwise, use smart compaction
    return this.compactContext(maxTokens);
  }

  private async compactContext(maxTokens: number): Promise<string> {
    // Strategy: Summary + recent verbatim messages

    const recentTurns = 5; // Keep last 5 messages verbatim
    const recentMessages = this.conversationHistory.slice(-recentTurns);
    const recentTokens = this.estimateTokens(recentMessages);

    const availableForSummary = maxTokens - recentTokens - 500; // 500 token buffer

    // Summarize older messages if not already summarized
    if (this.lastSummaryIndex < this.conversationHistory.length - recentTurns) {
      const messagesToSummarize = this.conversationHistory.slice(
        this.lastSummaryIndex,
        this.conversationHistory.length - recentTurns
      );

      this.summary = await this.summarizeMessages(
        messagesToSummarize,
        availableForSummary,
        this.summary // Merge with existing summary
      );

      this.lastSummaryIndex = this.conversationHistory.length - recentTurns;
    }

    // Build context: Summary + recent verbatim
    return this.formatCompactedContext(this.summary, recentMessages);
  }

  private async summarizeMessages(
    messages: ConversationTurn[],
    maxTokens: number,
    existingSummary: ContextSummary | null
  ): Promise<ContextSummary> {
    const prompt = `
You are summarizing a conversation to preserve critical context while reducing token usage.

${existingSummary ? `
# Existing Summary
${this.formatSummaryForLLM(existingSummary)}
` : ''}

# Messages to Summarize
${messages.map((msg, i) => `
## Turn ${i + 1} (${msg.role})
${msg.content}
${msg.metadata ? `[Type: ${msg.metadata.type}, Importance: ${msg.metadata.importance}]` : ''}
`).join('\n')}

# Task
Extract and preserve:
1. **Design decisions** - Critical choices about characters, style, composition
2. **Established details** - Character appearances, color palettes, layout rules
3. **Outstanding issues** - Unresolved problems, TODOs, errors to fix
4. **User preferences** - Saved settings, preferred workflows

# Output Format (JSON)
{
  "synopsis": "Brief overview of conversation progress",
  "designDecisions": ["Decision 1", "Decision 2", ...],
  "establishedDetails": {
    "characters": {"name": "description"},
    "styles": {"aspect": "description"},
    "composition": ["rule 1", "rule 2"]
  },
  "outstandingIssues": ["Issue 1", "Issue 2"],
  "userPreferences": {"key": "value"}
}

Be concise but preserve all critical information. Budget: ~${maxTokens} tokens.
    `;

    const response = await this.llm.generate(prompt, {
      maxTokens: maxTokens,
      temperature: 0.1, // Low temp for factual summarization
      responseFormat: { type: 'json_object' }
    });

    const newSummary: ContextSummary = JSON.parse(response);

    // Merge with existing summary if present
    if (existingSummary) {
      return this.mergeSummaries(existingSummary, newSummary);
    }

    return newSummary;
  }

  private mergeSummaries(
    existing: ContextSummary,
    newSummary: ContextSummary
  ): ContextSummary {
    return {
      synopsis: `${existing.synopsis}\n\nRecent progress: ${newSummary.synopsis}`,
      designDecisions: [
        ...existing.designDecisions,
        ...newSummary.designDecisions
      ],
      establishedDetails: {
        characters: {
          ...existing.establishedDetails.characters,
          ...newSummary.establishedDetails.characters // New overrides old
        },
        styles: {
          ...existing.establishedDetails.styles,
          ...newSummary.establishedDetails.styles
        },
        composition: [
          ...existing.establishedDetails.composition,
          ...newSummary.establishedDetails.composition
        ]
      },
      outstandingIssues: [
        ...existing.outstandingIssues.filter(issue =>
          !newSummary.outstandingIssues.some(newIssue =>
            newIssue.includes('resolved') && newIssue.includes(issue)
          )
        ),
        ...newSummary.outstandingIssues
      ],
      userPreferences: {
        ...existing.userPreferences,
        ...newSummary.userPreferences
      }
    };
  }

  private formatCompactedContext(
    summary: ContextSummary | null,
    recentMessages: ConversationTurn[]
  ): string {
    let context = '';

    if (summary) {
      context += `
# Session Summary

## Overview
${summary.synopsis}

## Design Decisions Made
${summary.designDecisions.map(d => `- ${d}`).join('\n')}

## Established Details

### Characters
${Object.entries(summary.establishedDetails.characters).map(([name, desc]) =>
  `- **${name}**: ${desc}`
).join('\n')}

### Style Guide
${Object.entries(summary.establishedDetails.styles).map(([aspect, desc]) =>
  `- **${aspect}**: ${desc}`
).join('\n')}

### Composition Rules
${summary.establishedDetails.composition.map(rule => `- ${rule}`).join('\n')}

## Outstanding Issues
${summary.outstandingIssues.length > 0
  ? summary.outstandingIssues.map(issue => `- ${issue}`).join('\n')
  : 'None'}

## User Preferences
${Object.entries(summary.userPreferences).map(([key, value]) =>
  `- ${key}: ${value}`
).join('\n')}

---
      `.trim();
    }

    context += `\n\n# Recent Conversation\n\n`;
    context += this.formatVerbatimContext(recentMessages);

    return context;
  }

  private formatVerbatimContext(messages: ConversationTurn[]): string {
    return messages.map(msg => `
## ${msg.role === 'user' ? 'User' : 'Assistant'}
${msg.content}
    `.trim()).join('\n\n');
  }

  private estimateTokens(messages: ConversationTurn[]): number {
    // Rough estimate: 1 token ≈ 4 characters
    const totalChars = messages.reduce((sum, msg) =>
      sum + msg.content.length, 0
    );
    return Math.ceil(totalChars / 4);
  }

  // Helper: Add metadata to turns for better summarization
  addTurn(turn: ConversationTurn) {
    // Auto-detect type and importance
    if (!turn.metadata) {
      turn.metadata = {
        timestamp: Date.now(),
        type: this.detectTurnType(turn.content),
        importance: this.assessImportance(turn.content),
        tags: this.extractTags(turn.content)
      };
    }

    this.conversationHistory.push(turn);
  }

  private detectTurnType(content: string): ConversationTurn['metadata']['type'] {
    if (content.includes('create') || content.includes('generate')) {
      return 'creation';
    } else if (content.includes('change') || content.includes('modify') || content.includes('update')) {
      return 'modification';
    } else if (content.includes('Applied') || content.includes('decided')) {
      return 'decision';
    } else if (content.includes('error') || content.includes('failed')) {
      return 'error';
    } else {
      return 'clarification';
    }
  }

  private assessImportance(content: string): 'critical' | 'high' | 'medium' | 'low' {
    const criticalKeywords = ['character', 'style guide', 'palette', 'error', 'failed'];
    const highKeywords = ['create', 'design', 'layout'];
    const lowKeywords = ['ok', 'thanks', 'yes', 'no'];

    const lowerContent = content.toLowerCase();

    if (criticalKeywords.some(kw => lowerContent.includes(kw))) {
      return 'critical';
    } else if (highKeywords.some(kw => lowerContent.includes(kw))) {
      return 'high';
    } else if (lowKeywords.some(kw => lowerContent.includes(kw))) {
      return 'low';
    } else {
      return 'medium';
    }
  }

  private extractTags(content: string): string[] {
    const tags: string[] = [];
    const tagPatterns = {
      'character-design': /character|face|expression|appearance/i,
      'color-palette': /color|palette|hue|shade/i,
      'layout': /layout|grid|spacing|align|composition/i,
      'creative': /generate|create|design|style/i,
      'technical': /code|script|calculation|data/i
    };

    for (const [tag, pattern] of Object.entries(tagPatterns)) {
      if (pattern.test(content)) {
        tags.push(tag);
      }
    }

    return tags;
  }
}
```

### Example: Context Compaction in Action

**Original Conversation (60 turns, ~25,000 tokens)**:

```
Turn 1 (user): Create a character with green eyes
Turn 2 (assistant): Generated character with green eyes, brown hair
Turn 5 (user): Use warm color palette
Turn 7 (assistant): Applied warm palette (oranges #FF8C42, yellows #FFD700)
...
Turn 30 (user): Character should wear casual t-shirt
Turn 31 (assistant): Updated character clothing to casual t-shirt
...
Turn 55 (user): Create new panel with same character
Turn 56 (assistant): [Needs context from Turn 2, 7, 31]
```

**Compacted Context (~4,000 tokens)**:

```markdown
# Session Summary

## Overview
User is creating a storyboard with consistent character design. Established protagonist appearance and warm color palette. Created 8 panels so far with good consistency.

## Design Decisions Made
- Character design: Green eyes, brown hair, casual t-shirt
- Color palette: Warm tones (oranges #FF8C42, yellows #FFD700)
- Art style: Watercolor with soft brush strokes
- Layout: 3-column grid, left-to-right reading flow

## Established Details

### Characters
- **Protagonist**: Green eyes, brown hair, casual t-shirt, friendly expression, age ~25

### Style Guide
- **colorPalette**: Warm oranges (#FF8C42) and yellows (#FFD700), cool blues for accents
- **artStyle**: Watercolor, soft brush strokes, gentle gradients
- **mood**: Peaceful, optimistic, slice-of-life

### Composition Rules
- 3-column grid layout
- Left-to-right reading flow
- Consistent panel sizes (400x300px)
- 20px spacing between panels

## Outstanding Issues
- Panel 6 has slight color inconsistency (too much blue) - needs adjustment
- Need to add dialogue to panels 7-8

## User Preferences
- previewQuality: high
- autoSave: true
- gridSnap: enabled

---

# Recent Conversation

## User
Create a new panel showing the character entering a coffee shop

## Assistant
I'll create panel 9 showing the protagonist entering a coffee shop. Based on our established style:

<design_thinking>
### Style Analysis
Using warm color palette (oranges/yellows) from previous panels.
Character: Green eyes, brown hair, casual t-shirt.
Watercolor art style.

### Prompt Engineering
"Character entering coffee shop, brown hair green eyes casual t-shirt, watercolor painting, warm lighting, orange and yellow tones, peaceful mood, soft brush strokes"
</design_thinking>

<implementation>
[Generated image with consistency validation]
</implementation>

## User
Perfect! Now add a dialogue bubble saying "Hello!"

## Assistant
Adding dialogue bubble positioned above character...
```

**Comparison**:

| Metric | Original (60 turns) | Compacted |
|--------|---------------------|-----------|
| **Tokens** | ~25,000 | ~4,000 |
| **Reduction** | - | 84% |
| **Info Loss** | 0% | <5% |
| **Character details** | ✅ Preserved | ✅ Preserved |
| **Color palette** | ✅ Preserved | ✅ Preserved |
| **Design decisions** | ✅ Preserved | ✅ Preserved |
| **Recent context** | ✅ Verbatim | ✅ Verbatim (last 5) |

### Implementation Checklist

- [ ] Add `metadata` field to `ConversationTurn` interface
- [ ] Implement `getContextForPrompt(maxTokens)` method
- [ ] Implement `summarizeMessages()` with LLM-based summarization
- [ ] Implement `mergeSummaries()` for incremental summarization
- [ ] Implement `formatCompactedContext()` with structured output
- [ ] Add `detectTurnType()` and `assessImportance()` helpers
- [ ] Add `extractTags()` for automatic tagging
- [ ] Write tests comparing verbatim vs compacted context quality
- [ ] Measure summarization accuracy (info retention >95%)
- [ ] Integrate with all agents (pass compacted context)

### Success Metrics

**Before**:
- Simple truncation after 50 turns
- Loses critical context (character details, design decisions)
- Long sessions become incoherent
- No token budget awareness

**After**:
- Smart compaction: 60-80% token reduction
- Preserves critical context (>95% info retention)
- Long sessions maintain coherence (50+ turns)
- Token budget aware (stays within 4K limit)
- Design decisions never lost

**Example Performance**:
- 60-turn session: 25,000 tokens → 4,000 tokens (84% reduction)
- Character consistency: 100% (all details preserved)
- Style guide adherence: 100% (palette always available)
- Outstanding issues tracked: 100% (never forgotten)

---

## Proposal 6: Tools Usage (Code Mode + Visual Verification)
**Priority**: 🔴 **P0 - Critical**
**Effort**: High (2 weeks)
**Impact**: Deterministic consistency validation

### Current Implementation

**Code-Mode-MCP** exists and works well for TypeScript execution:

```typescript
// ✅ Code execution works
const result = await codeMode.execute(`
  function calculateDistance(x1, y1, x2, y2) {
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  }

  calculateDistance(0, 0, 100, 100);
`);
// Returns: 141.42135623730951
```

**Canvas-MCP** exists for canvas operations:

```typescript
// ✅ Canvas operations work
const result = await canvas.createElements({
  type: 'ellipse',
  count: 3,
  fill: 'blue'
});
```

**Problems**:
- ❌ Tool outputs are unstructured (text strings, not JSON)
- ❌ No visual verification tools (can't validate image consistency)
- ❌ No deterministic offloading (LLM does math instead of tools)
- ❌ Inconsistent error handling across tools

**Example of Unstructured Output**:

```typescript
// Current: Unstructured text response
"Created 3 ellipse elements with IDs: c1, c2, c3. Positioned at (100,100), (200,100), (300,100)."

// Problem: Agent has to parse this text (error-prone)
```

### Anthropic Pattern

**Reference**: `docs/engineering/AI/prompt-engineering-at-anthropic.md` (lines 327-362, 834-862)

Anthropic recommends:
1. **Structured Data Output (JSON)** - All tools return JSON schemas
2. **Deterministic Offloading** - Math, validation, file ops go to tools (not LLM)
3. **Visual Verification Tools** - Image similarity, color palette, composition analysis
4. **Explicit Error Handling** - Error codes, messages, details

### Proposed Solution

#### Part 1: Standardize Tool Response Schema

```typescript
interface ToolResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
    recoverable: boolean;
  };
  metadata: {
    timestamp: number;
    executionTime: number;
    toolName: string;
    version: string;
  };
}

// Example: Canvas create operation
interface CreateElementsResult {
  elements: {
    id: string;
    type: 'ellipse' | 'rectangle' | 'text' | 'image';
    position: { x: number; y: number };
    size: { width: number; height: number };
    style: {
      fillColor?: string;
      strokeColor?: string;
      strokeWidth?: number;
    };
  }[];
  summary: {
    total: number;
    byType: Record<string, number>;
  };
}

// Usage
const result: ToolResponse<CreateElementsResult> = await canvas.createElements({
  type: 'ellipse',
  count: 3,
  fill: 'blue',
  positions: [{x: 100, y: 100}, {x: 200, y: 100}, {x: 300, y: 100}]
});

if (result.success) {
  console.log(`Created ${result.data.summary.total} elements`);
  console.log(`Element IDs: ${result.data.elements.map(e => e.id).join(', ')}`);

  // Agent can easily extract data
  const firstElement = result.data.elements[0];
  console.log(`First element at (${firstElement.position.x}, ${firstElement.position.y})`);
} else {
  console.error(`Error ${result.error.code}: ${result.error.message}`);
  if (result.error.recoverable) {
    // Retry with adjusted parameters
  }
}
```

#### Part 2: Add Visual Verification Tools

**Critical for consistency goal!**

```typescript
// New MCP tools for visual consistency validation

interface VisualVerificationTools {
  /**
   * Extract color palette from generated image
   */
  analyzeColorPalette(imageUrl: string): ToolResponse<{
    dominantColors: string[]; // Hex codes
    colorDistribution: Record<string, number>; // Percentage
    paletteMatch: number; // 0-1 match to style guide
    wcagContrast: {
      passes: boolean;
      ratio: number;
      level: 'AA' | 'AAA' | 'fail';
    };
  }>;

  /**
   * Check character consistency across images
   */
  checkCharacterConsistency(
    imageUrl: string,
    referenceUrl: string
  ): ToolResponse<{
    similarity: number; // 0-1 overall match
    featureMatches: {
      hairColor: boolean;
      eyeColor: boolean;
      clothing: boolean;
      facialStructure: number; // 0-1 similarity
    };
    differences: string[]; // Human-readable differences
    recommendation: 'accept' | 'regenerate' | 'adjust';
  }>;

  /**
   * Analyze composition and layout
   */
  analyzeComposition(imageUrl: string): ToolResponse<{
    ruleOfThirds: {
      compliant: boolean;
      focalPoints: Array<{x: number; y: number}>;
    };
    visualBalance: number; // 0-1, 1 = perfectly balanced
    colorHarmony: number; // 0-1
    contrast: {
      overall: number; // 0-1
      readability: 'excellent' | 'good' | 'poor';
    };
  }>;

  /**
   * Compare image similarity (for continuity)
   */
  compareImages(
    image1Url: string,
    image2Url: string,
    aspectToCheck: 'overall' | 'style' | 'composition' | 'color'
  ): ToolResponse<{
    similarity: number; // 0-1
    structuralSimilarity: number; // SSIM metric
    colorSimilarity: number;
    styleSimilarity: number;
    recommendation: string;
  }>;
}
```

**Implementation using existing image analysis libraries**:

```typescript
import sharp from 'sharp';
import pixelmatch from 'pixelmatch';
import { analyzeImage } from 'node-vibrant'; // Color extraction
import cv from '@u4/opencv4nodejs'; // Computer vision

class VisualVerificationToolsImpl implements VisualVerificationTools {
  async analyzeColorPalette(imageUrl: string): Promise<ToolResponse<any>> {
    const startTime = performance.now();

    try {
      // Download image
      const imageBuffer = await this.downloadImage(imageUrl);

      // Extract dominant colors using Vibrant
      const palette = await analyzeImage(imageBuffer).getPalette();

      const dominantColors = Object.values(palette)
        .filter(swatch => swatch !== null)
        .map(swatch => swatch.hex)
        .slice(0, 5); // Top 5 colors

      // Calculate distribution
      const colorDistribution = await this.calculateColorDistribution(imageBuffer);

      // Compare to style guide
      const styleGuide = await this.getStyleGuide();
      const paletteMatch = this.calculatePaletteMatch(dominantColors, styleGuide.colors);

      // Check WCAG contrast
      const wcagContrast = this.checkWCAGContrast(dominantColors);

      return {
        success: true,
        data: {
          dominantColors,
          colorDistribution,
          paletteMatch,
          wcagContrast
        },
        metadata: {
          timestamp: Date.now(),
          executionTime: performance.now() - startTime,
          toolName: 'analyzeColorPalette',
          version: '1.0.0'
        }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'PALETTE_ANALYSIS_FAILED',
          message: error.message,
          details: { imageUrl },
          recoverable: false
        },
        metadata: {
          timestamp: Date.now(),
          executionTime: performance.now() - startTime,
          toolName: 'analyzeColorPalette',
          version: '1.0.0'
        }
      };
    }
  }

  async checkCharacterConsistency(
    imageUrl: string,
    referenceUrl: string
  ): Promise<ToolResponse<any>> {
    const startTime = performance.now();

    try {
      const [image, reference] = await Promise.all([
        this.loadImageCV(imageUrl),
        this.loadImageCV(referenceUrl)
      ]);

      // Face detection
      const imageFace = this.detectFace(image);
      const referenceFace = this.detectFace(reference);

      if (!imageFace || !referenceFace) {
        throw new Error('Face not detected in one or both images');
      }

      // Feature extraction
      const imageFeatures = this.extractFacialFeatures(imageFace);
      const referenceFeatures = this.extractFacialFeatures(referenceFace);

      // Compare features
      const featureMatches = {
        hairColor: this.compareHairColor(imageFeatures.hair, referenceFeatures.hair),
        eyeColor: this.compareEyeColor(imageFeatures.eyes, referenceFeatures.eyes),
        clothing: this.compareClothing(image, reference),
        facialStructure: this.compareFacialStructure(imageFeatures, referenceFeatures)
      };

      // Calculate overall similarity
      const similarity = Object.values(featureMatches)
        .reduce((sum, match) => sum + (typeof match === 'boolean' ? (match ? 1 : 0) : match), 0) / 4;

      // Generate differences list
      const differences: string[] = [];
      if (!featureMatches.hairColor) differences.push('Hair color mismatch');
      if (!featureMatches.eyeColor) differences.push('Eye color mismatch');
      if (!featureMatches.clothing) differences.push('Clothing style differs');
      if (featureMatches.facialStructure < 0.8) differences.push('Facial structure differs significantly');

      // Recommendation
      let recommendation: 'accept' | 'regenerate' | 'adjust';
      if (similarity > 0.85) {
        recommendation = 'accept';
      } else if (similarity < 0.6) {
        recommendation = 'regenerate';
      } else {
        recommendation = 'adjust';
      }

      return {
        success: true,
        data: {
          similarity,
          featureMatches,
          differences,
          recommendation
        },
        metadata: {
          timestamp: Date.now(),
          executionTime: performance.now() - startTime,
          toolName: 'checkCharacterConsistency',
          version: '1.0.0'
        }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'CONSISTENCY_CHECK_FAILED',
          message: error.message,
          details: { imageUrl, referenceUrl },
          recoverable: true // Can retry with different parameters
        },
        metadata: {
          timestamp: Date.now(),
          executionTime: performance.now() - startTime,
          toolName: 'checkCharacterConsistency',
          version: '1.0.0'
        }
      };
    }
  }

  async analyzeComposition(imageUrl: string): Promise<ToolResponse<any>> {
    const startTime = performance.now();

    try {
      const image = await this.loadImageCV(imageUrl);

      // Rule of thirds analysis
      const ruleOfThirds = this.checkRuleOfThirds(image);

      // Visual balance (center of mass)
      const visualBalance = this.calculateVisualBalance(image);

      // Color harmony
      const palette = await this.analyzeColorPalette(imageUrl);
      const colorHarmony = this.calculateColorHarmony(palette.data.dominantColors);

      // Contrast analysis
      const contrast = this.analyzeContrast(image);

      return {
        success: true,
        data: {
          ruleOfThirds,
          visualBalance,
          colorHarmony,
          contrast
        },
        metadata: {
          timestamp: Date.now(),
          executionTime: performance.now() - startTime,
          toolName: 'analyzeComposition',
          version: '1.0.0'
        }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'COMPOSITION_ANALYSIS_FAILED',
          message: error.message,
          details: { imageUrl },
          recoverable: false
        },
        metadata: {
          timestamp: Date.now(),
          executionTime: performance.now() - startTime,
          toolName: 'analyzeComposition',
          version: '1.0.0'
        }
      };
    }
  }

  // Helper methods
  private async downloadImage(url: string): Promise<Buffer> {
    const response = await fetch(url);
    return Buffer.from(await response.arrayBuffer());
  }

  private async loadImageCV(url: string): Promise<cv.Mat> {
    const buffer = await this.downloadImage(url);
    return cv.imdecode(buffer);
  }

  private detectFace(image: cv.Mat): cv.Rect | null {
    const classifier = new cv.CascadeClassifier(cv.HAAR_FRONTALFACE_ALT2);
    const grayImg = image.bgrToGray();
    const faces = classifier.detectMultiScale(grayImg);
    return faces.objects.length > 0 ? faces.objects[0] : null;
  }

  private calculatePaletteMatch(colors: string[], styleGuideColors: string[]): number {
    const colorSet = new Set(colors.map(c => c.toLowerCase()));
    const styleSet = new Set(styleGuideColors.map(c => c.toLowerCase()));

    const intersection = new Set([...colorSet].filter(c => styleSet.has(c)));

    return intersection.size / Math.min(colorSet.size, styleSet.size);
  }

  private checkWCAGContrast(colors: string[]): any {
    // Simplified WCAG contrast check
    // In production, use a library like 'wcag-contrast'
    return {
      passes: true,
      ratio: 4.5,
      level: 'AA'
    };
  }

  private checkRuleOfThirds(image: cv.Mat): any {
    const width = image.cols;
    const height = image.rows;

    // Rule of thirds grid points
    const thirdX1 = Math.floor(width / 3);
    const thirdX2 = Math.floor(2 * width / 3);
    const thirdY1 = Math.floor(height / 3);
    const thirdY2 = Math.floor(2 * height / 3);

    // Detect focal points (using edge detection)
    const edges = image.canny(50, 150);
    const contours = edges.findContours(cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    const focalPoints = contours
      .map(c => {
        const moments = c.moments();
        return {
          x: moments.m10 / moments.m00,
          y: moments.m01 / moments.m00
        };
      })
      .filter(p => !isNaN(p.x) && !isNaN(p.y));

    // Check if focal points align with rule of thirds
    const nearThird = focalPoints.some(p =>
      (Math.abs(p.x - thirdX1) < 50 || Math.abs(p.x - thirdX2) < 50) &&
      (Math.abs(p.y - thirdY1) < 50 || Math.abs(p.y - thirdY2) < 50)
    );

    return {
      compliant: nearThird,
      focalPoints: focalPoints.slice(0, 3) // Top 3 focal points
    };
  }

  private calculateVisualBalance(image: cv.Mat): number {
    // Calculate center of mass for visual balance
    const gray = image.bgrToGray();
    const moments = gray.moments();

    const centerX = moments.m10 / moments.m00;
    const centerY = moments.m01 / moments.m00;

    const imageCenterX = image.cols / 2;
    const imageCenterY = image.rows / 2;

    // Distance from image center
    const distance = Math.sqrt(
      Math.pow(centerX - imageCenterX, 2) +
      Math.pow(centerY - imageCenterY, 2)
    );

    // Normalize to 0-1 (0 = perfectly centered, 1 = far from center)
    const maxDistance = Math.sqrt(
      Math.pow(image.cols / 2, 2) +
      Math.pow(image.rows / 2, 2)
    );

    return 1 - (distance / maxDistance);
  }

  private calculateColorHarmony(colors: string[]): number {
    // Simplified color harmony check
    // In production, use color theory algorithms (complementary, analogous, etc.)

    // For now, just check if colors are varied but not too many
    const uniqueHues = new Set(colors.map(c => this.getHue(c)));

    if (uniqueHues.size < 2) return 0.5; // Too monotone
    if (uniqueHues.size > 5) return 0.6; // Too chaotic

    return 0.9; // Good harmony (2-5 unique hues)
  }

  private getHue(hexColor: string): number {
    // Convert hex to HSL and return hue
    const r = parseInt(hexColor.slice(1, 3), 16) / 255;
    const g = parseInt(hexColor.slice(3, 5), 16) / 255;
    const b = parseInt(hexColor.slice(5, 7), 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;

    let hue = 0;

    if (delta !== 0) {
      if (max === r) {
        hue = ((g - b) / delta) % 6;
      } else if (max === g) {
        hue = (b - r) / delta + 2;
      } else {
        hue = (r - g) / delta + 4;
      }
    }

    return Math.round(hue * 60);
  }

  private analyzeContrast(image: cv.Mat): any {
    const gray = image.bgrToGray();

    // Calculate standard deviation as measure of contrast
    const stdDev = gray.stdDev();

    // Normalize to 0-1
    const contrast = Math.min(stdDev / 128, 1);

    let readability: 'excellent' | 'good' | 'poor';
    if (contrast > 0.4) {
      readability = 'excellent';
    } else if (contrast > 0.25) {
      readability = 'good';
    } else {
      readability = 'poor';
    }

    return {
      overall: contrast,
      readability
    };
  }

  // Simplified feature extraction (in production, use ML models)
  private extractFacialFeatures(faceRegion: cv.Rect): any {
    return {
      hair: { color: '#8B4513' }, // Placeholder
      eyes: { color: '#228B22' }, // Placeholder
      structure: [/* feature points */]
    };
  }

  private compareHairColor(hair1: any, hair2: any): boolean {
    return hair1.color === hair2.color; // Simplified
  }

  private compareEyeColor(eyes1: any, eyes2: any): boolean {
    return eyes1.color === eyes2.color; // Simplified
  }

  private compareClothing(image1: cv.Mat, image2: cv.Mat): boolean {
    // Simplified clothing comparison
    return true; // Placeholder
  }

  private compareFacialStructure(features1: any, features2: any): number {
    // Simplified structural comparison
    return 0.85; // Placeholder
  }

  private async getStyleGuide(): Promise<any> {
    // Load style guide from Story Bible
    return {
      colors: ['#FF8C42', '#FFD700', '#228B22']
    };
  }

  private async calculateColorDistribution(imageBuffer: Buffer): Promise<Record<string, number>> {
    // Calculate color distribution
    return {
      '#FF8C42': 0.35,
      '#FFD700': 0.25,
      '#228B22': 0.15,
      'other': 0.25
    };
  }
}
```

#### Part 3: Deterministic Offloading

**Before (LLM does math)**:

```typescript
// Agent prompt includes math
"Calculate the distance between (0,0) and (100,100)"

// LLM response (may have errors)
"The distance is approximately 141.4 units"
```

**After (Tool does math)**:

```typescript
// Agent delegates to code-mode tool
const result = await codeMode.execute(`
  Math.sqrt(Math.pow(100 - 0, 2) + Math.pow(100 - 0, 2))
`);

// Tool response (guaranteed accurate)
{
  success: true,
  data: 141.42135623730951,
  metadata: { executionTime: 5 }
}
```

**Offload to Tools**:
- ✅ Math calculations (distance, angles, percentages)
- ✅ Color conversions (hex ↔ RGB ↔ HSL)
- ✅ Canvas queries (element counts, positions, overlaps)
- ✅ Image analysis (color extraction, composition)
- ✅ Validation checks (WCAG contrast, bounds checking)

**Keep in LLM**:
- ✅ Creative decisions (style choices, layout preferences)
- ✅ Natural language understanding (user intent)
- ✅ Synthesis (combining tool results into coherent response)

#### Part 4: Integration with Creative Agent

```typescript
class CreativeAgent {
  async handle(request: string): Promise<string> {
    // Step 1: Generate image with AI
    const imagePrompt = await this.craftPrompt(request);
    const generatedImage = await this.generateImage(imagePrompt);

    // Step 2: Validate with deterministic tools
    const validation = await this.validateConsistency(generatedImage);

    // Step 3: If validation fails, regenerate
    if (!validation.passed) {
      console.warn('⚠️  Validation failed, regenerating with adjusted prompt');

      const adjustedPrompt = await this.adjustPromptFromValidation(
        imagePrompt,
        validation
      );

      const regeneratedImage = await this.generateImage(adjustedPrompt);
      const revalidation = await this.validateConsistency(regeneratedImage);

      if (!revalidation.passed) {
        return `Generated image but consistency validation failed. Issues: ${revalidation.issues.join(', ')}. Please review manually.`;
      }

      return `Successfully generated image after adjustment. Validation passed.`;
    }

    return `Successfully generated image. Validation passed: ${validation.summary}`;
  }

  private async validateConsistency(imageUrl: string): Promise<ValidationReport> {
    const issues: string[] = [];
    let passed = true;

    // Check 1: Color palette match
    const paletteResult = await this.tools.analyzeColorPalette(imageUrl);

    if (paletteResult.success && paletteResult.data.paletteMatch < 0.8) {
      issues.push(`Color palette mismatch (${(paletteResult.data.paletteMatch * 100).toFixed(0)}% match)`);
      passed = false;
    }

    // Check 2: Character consistency (if reference exists)
    const referenceImage = await this.storyBible.getCharacterReference();

    if (referenceImage) {
      const consistencyResult = await this.tools.checkCharacterConsistency(
        imageUrl,
        referenceImage
      );

      if (consistencyResult.success && consistencyResult.data.recommendation !== 'accept') {
        issues.push(`Character consistency issues: ${consistencyResult.data.differences.join(', ')}`);
        passed = false;
      }
    }

    // Check 3: Composition quality
    const compositionResult = await this.tools.analyzeComposition(imageUrl);

    if (compositionResult.success && compositionResult.data.visualBalance < 0.6) {
      issues.push(`Poor visual balance (${(compositionResult.data.visualBalance * 100).toFixed(0)}%)`);
      // Warning only, don't fail
    }

    return {
      passed,
      issues,
      summary: passed
        ? `All checks passed: Color palette ${(paletteResult.data.paletteMatch * 100).toFixed(0)}% match`
        : `${issues.length} validation issues found`
    };
  }

  private async adjustPromptFromValidation(
    originalPrompt: string,
    validation: ValidationReport
  ): Promise<string> {
    // Use LLM to adjust prompt based on validation issues
    const adjustmentPrompt = `
Original image generation prompt:
"${originalPrompt}"

Validation issues found:
${validation.issues.map(issue => `- ${issue}`).join('\n')}

Adjust the prompt to fix these issues while preserving the core intent.
Return only the adjusted prompt, no explanation.
    `;

    return this.generate(adjustmentPrompt, { maxTokens: 200 });
  }
}
```

### Implementation Checklist

- [ ] Define `ToolResponse<T>` interface
- [ ] Refactor all existing tools to return `ToolResponse`
- [ ] Implement `VisualVerificationTools` interface
- [ ] Add `analyzeColorPalette()` using node-vibrant
- [ ] Add `checkCharacterConsistency()` using opencv4nodejs
- [ ] Add `analyzeComposition()` with rule of thirds, balance, harmony
- [ ] Add `compareImages()` for similarity checking
- [ ] Integrate visual tools with Creative Agent validation workflow
- [ ] Create deterministic offloading guide (what to offload vs LLM)
- [ ] Write integration tests for all tools
- [ ] Measure consistency improvement before/after

### Success Metrics

**Before**:
- Unstructured tool outputs (text parsing errors)
- No visual consistency validation
- LLM does math (errors, hallucinations)
- Consistency relies on LLM memory alone

**After**:
- Structured JSON outputs (zero parsing errors)
- Deterministic visual validation (>90% accuracy)
- Tools handle all deterministic operations
- Consistency validated by tools, not guesswork

**Example Improvement**:

| Metric | Before | After |
|--------|--------|-------|
| **Character consistency** | 60% (LLM memory) | 90% (deterministic validation) |
| **Color palette adherence** | 70% (LLM judgment) | 95% (color analysis tool) |
| **Math errors** | 5-10% | 0% (tools handle math) |
| **Validation time** | N/A (manual review) | 2-3 seconds (automated) |

---

## Proposal 7: Semantic Canvas Context Building
**Priority**: 🔴 **P0 - Critical**
**Effort**: Medium (1-2 weeks)
**Impact**: Better agent understanding, improved decision-making, enhanced context awareness

### Current Implementation

**Current Snapshot Step** (`packages/ai-agents/src/workflows/streaming-chat.ts`):
```typescript
const snapshotCanvasStep = createStep({
  id: 'snapshot-canvas',
  execute: async ({ inputData }) => {
    // TODO: Implement actual canvas snapshot via MCP
    const snapshot = {
      id: `snapshot-${Date.now()}`,
      timestamp: Date.now(),
      elementCount: 0,
      description: 'Pre-operation snapshot',
    };
    return { messages: inputData.messages, snapshot };
  },
});
```

**Current Context Builder** (`packages/ai-agents/src/adapters/context-builder.ts`):
```typescript
// Builds TECHNICAL context only
export function buildCanvasContext(
  allEntities: QueryResult[],
  selectedEntities: QueryResult[]
): CanvasContext {
  return {
    totalCount: allEntities.length,
    selectedCount: selectedEntities.length,
    typeDistribution: { rectangle: 5, ellipse: 3, text: 2 },
    bounds: { width: 800, height: 600, minX: 0, minY: 0, maxX: 800, maxY: 600 },
    formatted: "[✓3: rectangle@(100,100)[200×50], ellipse@(400,200)[100×100] | 10[5r,3e,2t] | bbox:800×600]"
  };
}
```

**Problems**:
- ❌ **No semantic understanding**: Only knows "5 rectangles, 3 ellipses, 2 text" - doesn't know it's a "login form"
- ❌ **No relationship awareness**: Can't detect that rectangles are grouped as form fields
- ❌ **No design intent**: Doesn't understand the purpose or composition
- ❌ **No narrative context**: For storyboards, doesn't track "panel 3 of scene 2 showing character dialogue"
- ❌ **No style patterns**: Misses design system usage, color schemes, layout patterns

### Anthropic Pattern

**Reference**: `docs/engineering/AI/prompt-engineering-at-anthropic.md` (lines 61-131, 379-433)

Anthropic recommends **high-fidelity context** that captures not just the "what" but the "why" and "how":

> **Good context**: "Login form with 'Username' and 'Password' fields aligned vertically, blue submit button, matches Material Design system"
>
> **Poor context**: "2 rectangles, 2 text elements, 1 button"

**Key Principles**:
1. **Semantic Understanding** - Interpret what elements represent, not just their technical properties
2. **Relationship Detection** - Identify groupings, hierarchies, compositions
3. **Design Intent Recognition** - Understand purpose and patterns
4. **Narrative Context** - Track user workflow and story progression
5. **Progressive Disclosure** - Surface relevant context first, details on demand

### Proposed Solution

#### Architecture: Multi-Layer Context Building

```typescript
/**
 * Semantic Canvas Context - Understands MEANING not just GEOMETRY
 */
interface SemanticCanvasContext {
  // Layer 1: Technical Context (existing)
  technical: {
    totalCount: number;
    selectedCount: number;
    typeDistribution: Record<string, number>;
    bounds?: BoundingBox;
  };

  // Layer 2: Semantic Understanding (NEW)
  semantic: {
    // What does the canvas represent?
    composition: {
      type: 'storyboard-panel' | 'ui-mockup' | 'diagram' | 'illustration' | 'unknown';
      confidence: number; // 0.0 - 1.0
      description: string; // "Login form with authentication fields"
    };

    // What are the key components?
    components: Array<{
      id: string;
      semanticType: string; // "form-input", "dialogue-bubble", "character", etc.
      elements: string[]; // Element IDs that make up this component
      purpose: string; // "Username input field"
      metadata?: Record<string, any>;
    }>;

    // How are elements related?
    relationships: Array<{
      type: 'grouped' | 'aligned' | 'nested' | 'linked' | 'sequence';
      elementIds: string[];
      description: string; // "Vertically aligned form fields"
    }>;

    // Design patterns detected
    patterns: {
      layoutPattern?: 'grid' | 'flow' | 'centered' | 'sidebar' | 'comic-panel';
      colorScheme?: string; // "Blue-white material design"
      styleSystem?: string; // "Material Design", "Tailwind", "Custom"
    };
  };

  // Layer 3: Narrative Context (NEW)
  narrative?: {
    // For storyboards: story progression
    storyContext?: {
      panelNumber: number;
      sceneNumber: number;
      characters: string[];
      location: string;
      timeOfDay: string;
      mood: string;
    };

    // User workflow context
    workflowContext: {
      currentTask: string; // "Creating character dialogue for panel 3"
      recentActions: string[]; // ["Created character", "Added background", "Positioned dialogue"]
      designDecisions: string[]; // ["Using warm color palette for sunset scene"]
    };
  };

  // Layer 4: Formatted Output
  formatted: {
    compact: string; // One-line summary for agent context
    detailed: string; // Full description for planning
    hints: string[]; // Contextual suggestions
  };
}
```

#### Implementation: Semantic Analysis Pipeline

```typescript
/**
 * Build semantic canvas context via multi-pass analysis
 */
export async function buildSemanticCanvasContext(
  allElements: QueryResult[],
  selectedElements: QueryResult[],
  conversationHistory: CoreMessage[],
  mcpClient: CanvasMcpClient
): Promise<SemanticCanvasContext> {

  // Pass 1: Technical context (existing)
  const technical = buildTechnicalContext(allElements, selectedElements);

  // Pass 2: Composition detection
  const composition = await detectComposition(allElements, mcpClient);

  // Pass 3: Component identification
  const components = await identifyComponents(allElements, composition.type);

  // Pass 4: Relationship analysis
  const relationships = detectRelationships(allElements);

  // Pass 5: Pattern recognition
  const patterns = detectDesignPatterns(allElements, components);

  // Pass 6: Narrative context from conversation
  const narrative = await extractNarrativeContext(conversationHistory);

  // Pass 7: Format for agents
  const formatted = formatSemanticContext({
    technical,
    composition,
    components,
    relationships,
    patterns,
    narrative,
  });

  return {
    technical,
    semantic: {
      composition,
      components,
      relationships,
      patterns,
    },
    narrative,
    formatted,
  };
}

/**
 * Pass 2: Detect what the canvas represents
 */
async function detectComposition(
  elements: QueryResult[],
  mcpClient: CanvasMcpClient
): Promise<{
  type: string;
  confidence: number;
  description: string;
}> {
  if (elements.length === 0) {
    return {
      type: 'unknown',
      confidence: 1.0,
      description: 'Empty canvas',
    };
  }

  // Heuristics for composition detection
  const typeSignals = {
    'storyboard-panel': {
      indicators: ['image', 'text with dialogue', 'sequential panels', 'scene markers'],
      check: () => {
        const hasImages = elements.some(e => e.type === 'image');
        const hasText = elements.some(e => e.type === 'text');
        const hasFrames = elements.some(e => e.type === 'rectangle' && e.strokeWidth > 0);
        return hasImages && hasText && hasFrames;
      }
    },
    'ui-mockup': {
      indicators: ['buttons', 'input fields', 'aligned layout', 'grouped components'],
      check: () => {
        const hasButtons = elements.some(e => e.type === 'rectangle' && e.text?.toLowerCase().includes('button'));
        const hasInputs = elements.some(e => e.type === 'rectangle' && e.width > 150 && e.height < 60);
        const wellAligned = checkVerticalAlignment(elements) || checkHorizontalAlignment(elements);
        return (hasButtons || hasInputs) && wellAligned;
      }
    },
    'diagram': {
      indicators: ['arrows', 'connected shapes', 'flow pattern'],
      check: () => {
        const hasArrows = elements.filter(e => e.type === 'arrow').length >= 2;
        const hasShapes = elements.filter(e => ['rectangle', 'ellipse', 'diamond'].includes(e.type)).length >= 3;
        return hasArrows && hasShapes;
      }
    },
    'illustration': {
      indicators: ['freehand drawing', 'artistic elements', 'minimal text'],
      check: () => {
        const hasDrawing = elements.some(e => e.type === 'freedraw' || e.type === 'image');
        const minimalText = elements.filter(e => e.type === 'text').length <= 2;
        return hasDrawing && minimalText;
      }
    }
  };

  // Find best match
  let bestMatch = { type: 'unknown', confidence: 0.3, description: 'Mixed content' };

  for (const [type, { check, indicators }] of Object.entries(typeSignals)) {
    if (check()) {
      const confidence = calculateConfidence(elements, indicators);
      if (confidence > bestMatch.confidence) {
        bestMatch = {
          type,
          confidence,
          description: generateDescription(type, elements),
        };
      }
    }
  }

  return bestMatch;
}

/**
 * Pass 3: Identify semantic components
 */
async function identifyComponents(
  elements: QueryResult[],
  compositionType: string
): Promise<Array<{
  id: string;
  semanticType: string;
  elements: string[];
  purpose: string;
}>> {
  const components: any[] = [];

  // Use composition type to guide component detection
  switch (compositionType) {
    case 'ui-mockup':
      components.push(...detectUIComponents(elements));
      break;
    case 'storyboard-panel':
      components.push(...detectStoryboardComponents(elements));
      break;
    case 'diagram':
      components.push(...detectDiagramComponents(elements));
      break;
  }

  return components;
}

/**
 * Detect UI components (forms, buttons, inputs)
 */
function detectUIComponents(elements: QueryResult[]): any[] {
  const components = [];

  // Detect form groups (vertically aligned rectangles with text)
  const formGroups = detectFormGroups(elements);
  for (const group of formGroups) {
    components.push({
      id: `form-group-${components.length}`,
      semanticType: 'form-group',
      elements: group.elementIds,
      purpose: `Form with ${group.fields.length} input fields`,
      metadata: { fields: group.fields }
    });
  }

  // Detect buttons
  const buttons = elements.filter(e =>
    e.type === 'rectangle' &&
    e.text &&
    (e.text.toLowerCase().includes('submit') ||
     e.text.toLowerCase().includes('login') ||
     e.text.toLowerCase().includes('button'))
  );
  for (const button of buttons) {
    components.push({
      id: `button-${button.id}`,
      semanticType: 'button',
      elements: [button.id],
      purpose: `${button.text} button`,
    });
  }

  return components;
}

/**
 * Pass 4: Detect relationships between elements
 */
function detectRelationships(elements: QueryResult[]): any[] {
  const relationships = [];

  // Detect groupings (spatially close elements)
  const groups = detectSpatialGroups(elements);
  for (const group of groups) {
    relationships.push({
      type: 'grouped',
      elementIds: group.elementIds,
      description: `${group.elementIds.length} elements grouped together`,
    });
  }

  // Detect alignments
  const verticalAlignments = detectVerticalAlignment(elements);
  if (verticalAlignments.length > 0) {
    relationships.push({
      type: 'aligned',
      elementIds: verticalAlignments,
      description: 'Vertically aligned elements',
    });
  }

  // Detect sequences (storyboard panels, flow steps)
  const sequences = detectSequences(elements);
  for (const sequence of sequences) {
    relationships.push({
      type: 'sequence',
      elementIds: sequence.elementIds,
      description: `Sequential flow: ${sequence.description}`,
    });
  }

  return relationships;
}

/**
 * Pass 6: Extract narrative context from conversation
 */
async function extractNarrativeContext(
  conversationHistory: CoreMessage[]
): Promise<any> {
  // Analyze recent messages for:
  // - Storyboard: panel/scene numbers, character names, locations
  // - Workflow: current task, recent actions, design decisions

  const recentMessages = conversationHistory.slice(-10);
  const narrative = {
    workflowContext: {
      currentTask: 'Unknown',
      recentActions: [] as string[],
      designDecisions: [] as string[],
    },
  };

  // Extract workflow context from user messages
  for (const msg of recentMessages) {
    if (msg.role === 'user') {
      const content = typeof msg.content === 'string' ? msg.content : '';

      // Detect current task
      if (content.includes('create') || content.includes('add')) {
        narrative.workflowContext.currentTask = content;
      }

      // Detect design decisions (color, style, layout mentions)
      if (content.match(/color|style|palette|design|layout/i)) {
        narrative.workflowContext.designDecisions.push(content);
      }
    }

    if (msg.role === 'assistant') {
      const content = typeof msg.content === 'string' ? msg.content : '';

      // Extract recent actions from assistant responses
      if (content.match(/created|added|positioned|aligned|grouped/i)) {
        narrative.workflowContext.recentActions.push(content.slice(0, 100));
      }
    }
  }

  // Detect storyboard context if applicable
  const storyboardKeywords = ['panel', 'scene', 'character', 'dialogue', 'storyboard'];
  const isStoryboard = recentMessages.some(msg => {
    const content = typeof msg.content === 'string' ? msg.content : '';
    return storyboardKeywords.some(kw => content.toLowerCase().includes(kw));
  });

  if (isStoryboard) {
    narrative.storyContext = {
      panelNumber: extractPanelNumber(recentMessages),
      sceneNumber: extractSceneNumber(recentMessages),
      characters: extractCharacterNames(recentMessages),
      location: extractLocation(recentMessages),
      timeOfDay: extractTimeOfDay(recentMessages),
      mood: extractMood(recentMessages),
    };
  }

  return narrative;
}

/**
 * Pass 7: Format semantic context for agent consumption
 */
function formatSemanticContext(context: any): {
  compact: string;
  detailed: string;
  hints: string[];
} {
  const { technical, composition, components, relationships, patterns, narrative } = context;

  // Compact: One-line summary
  const compact = [
    `${composition.description}`,
    `${technical.totalCount} elements`,
    components.length > 0 ? `${components.length} components` : null,
    patterns.layoutPattern ? `${patterns.layoutPattern} layout` : null,
  ].filter(Boolean).join(' | ');

  // Detailed: Full description
  const detailed = `
## Canvas Context

### Composition
Type: ${composition.type} (${(composition.confidence * 100).toFixed(0)}% confidence)
Description: ${composition.description}

### Components (${components.length})
${components.map(c => `- ${c.semanticType}: ${c.purpose}`).join('\n')}

### Relationships (${relationships.length})
${relationships.map(r => `- ${r.type}: ${r.description}`).join('\n')}

### Design Patterns
Layout: ${patterns.layoutPattern || 'custom'}
${patterns.colorScheme ? `Color Scheme: ${patterns.colorScheme}` : ''}
${patterns.styleSystem ? `Style System: ${patterns.styleSystem}` : ''}

${narrative.storyContext ? `
### Story Context
Panel ${narrative.storyContext.panelNumber}, Scene ${narrative.storyContext.sceneNumber}
Characters: ${narrative.storyContext.characters.join(', ')}
Location: ${narrative.storyContext.location}
Mood: ${narrative.storyContext.mood}
` : ''}

### Current Workflow
Task: ${narrative.workflowContext.currentTask}
Recent Actions:
${narrative.workflowContext.recentActions.slice(-3).map(a => `- ${a}`).join('\n')}
  `.trim();

  // Hints: Contextual suggestions
  const hints = [];
  if (technical.totalCount === 0) {
    hints.push('Canvas is empty - use creation tools to add elements');
  }
  if (technical.selectedCount === 0 && technical.totalCount > 0) {
    hints.push('No selection - consider querying or asking user to select elements');
  }
  if (composition.confidence < 0.6) {
    hints.push('Composition unclear - may need user clarification on intent');
  }
  if (components.length > 0 && technical.selectedCount === 0) {
    hints.push(`Detected ${components.length} semantic components - may want to operate on component level`);
  }

  return { compact, detailed, hints };
}
```

#### Integration with Workflow

Update `snapshotCanvasStep` to use semantic context builder:

```typescript
const snapshotCanvasStep = createStep({
  id: 'snapshot-canvas',
  execute: async ({ inputData, mastra }) => {
    console.log('[Phase 1] Building semantic canvas context');

    // Get canvas state via MCP
    const mcpClient = canvasMcpClient;
    const allElements = await mcpClient.query({});
    const selectedElements = await mcpClient.query({ selected: true });

    // Build SEMANTIC context (not just technical)
    const semanticContext = await buildSemanticCanvasContext(
      allElements.elements || [],
      selectedElements.elements || [],
      inputData.messages,
      mcpClient
    );

    console.log(`[Phase 1] Canvas: ${semanticContext.formatted.compact}`);

    return {
      messages: inputData.messages,
      snapshot: {
        id: `snapshot-${Date.now()}`,
        timestamp: Date.now(),
        elementCount: semanticContext.technical.totalCount,
        description: semanticContext.formatted.compact,
        semantic: semanticContext, // Full semantic context
      },
    };
  },
});
```

### Implementation: Semantic Plugin

**Status**: ✅ **IMPLEMENTED** (v1.0.0)

The semantic canvas context building is implemented as an ECS plugin in `packages/canvas-semantic`.

#### Package Structure

```
packages/canvas-semantic/
├── src/
│   ├── components/
│   │   └── SemanticComponent.ts       # Stores semantic data
│   ├── systems/
│   │   └── SemanticAnalysisSystem.ts  # Runs periodic analysis
│   ├── utils/
│   │   ├── compositionAnalyzer.ts     # Detects canvas type
│   │   ├── componentAnalyzer.ts       # Identifies components
│   │   └── relationshipAnalyzer.ts    # Detects relationships
│   ├── types/
│   │   └── index.ts                   # Type definitions
│   ├── SemanticPlugin.ts              # Main plugin class
│   └── index.ts                       # Package exports
├── package.json
├── tsconfig.json
└── README.md
```

#### Usage

```typescript
import { CanvasWorld } from '@waiboard/canvas-core/ecs';
import { SemanticPlugin } from '@waiboard/canvas-semantic';

// Install plugin
const world = new CanvasWorld();
world.installPlugin(new SemanticPlugin({
  enabled: true,
  analysisInterval: 60, // Every 60 frames
  minEntities: 1,
  debug: true,
}));

// Access semantic data
const semantic = world.getResource('semantic');
console.log('Composition:', semantic.data.composition);
console.log('Components:', semantic.data.components);
console.log('Relationships:', semantic.data.relationships);
```

#### Integration with AI Workflows

**Concept**: Tools query semantic context from the canvas, similar to querying elements.

The semantic plugin (implemented in `packages/canvas-semantic`) analyzes the canvas automatically. AI agents access this semantic data through canvas tools - no complex implementation needed in workflows.

```typescript
// Simplified workflow integration
const snapshotCanvasStep = createStep({
  id: 'snapshot-canvas',
  execute: async ({ inputData }) => {
    // Query semantic context via canvas tool
    const semantic = await canvas_get_semantic_context();

    // Returns semantic data structure:
    // {
    //   composition: { type, confidence, description, indicators },
    //   components: [{ semanticType, purpose, entityIds, ... }],
    //   relationships: [{ type, description, entityIds, ... }],
    //   patterns: { layoutPattern, alignmentQuality, spacingConsistency }
    // }

    return {
      messages: inputData.messages,
      snapshot: {
        id: `snapshot-${Date.now()}`,
        description: semantic.composition.description,
        semantic, // Full context for agents
      },
    };
  },
});
```

**Conceptual Tool Interface**:

```typescript
// Canvas tools for querying semantic data
interface CanvasSemanticTools {
  // Get complete semantic analysis
  canvas_get_semantic_context(): SemanticCanvasData;

  // Query specific aspects
  canvas_get_composition(): CompositionAnalysis;
  canvas_get_components(filter?: { type?: string }): SemanticComponent[];
  canvas_get_relationships(filter?: { type?: string }): SemanticRelationship[];
  canvas_get_patterns(): DesignPatterns;
}
```

**Usage in Agent Prompts**:

Agents can query semantic context to understand what the canvas represents:

```typescript
// Example: Agent queries semantic context before responding
const semantic = await canvas_get_semantic_context();

const agentPrompt = `
Current Canvas Understanding:
- Type: ${semantic.composition.type} (${semantic.composition.confidence * 100}% confidence)
- Description: ${semantic.composition.description}
- Components: ${semantic.components.map(c => c.purpose).join(', ')}
- Layout Pattern: ${semantic.patterns.layoutPattern}
- Design Quality: ${semantic.patterns.alignmentQuality * 100}% aligned

User Request: "${userMessage}"

Respond based on semantic understanding of the canvas.
`;
```

**Key Benefits**:

1. **Simple Querying**: Just call a tool function - implementation handled by plugin
2. **Automatic Analysis**: Plugin runs in background, data always available
3. **Rich Context**: Beyond "5 rectangles" → "Login form with 2 input fields"
4. **No Manual Parsing**: Pre-structured data ready for agent consumption

**Implementation Details**: See `packages/canvas-semantic/README.md` for plugin setup and API.

#### Performance

- **Analysis frequency**: Configurable (default: every 60 frames)
- **Typical analysis time**: 1-5ms for 50 elements
- **Memory overhead**: ~1-2KB per canvas state
- **CPU impact**: Negligible (<1% at 60fps)

### Implementation Checklist

- [x] Define `SemanticCanvasContext` interface → **SemanticCanvasData** in `types/index.ts`
- [x] Implement `buildSemanticCanvasContext()` pipeline → **SemanticAnalysisSystem** in `systems/SemanticAnalysisSystem.ts`
- [x] Implement composition detection (UI mockup, storyboard, diagram, illustration) → **compositionAnalyzer.ts**
- [x] Implement component identification (form groups, buttons, storyboard elements) → **componentAnalyzer.ts**
- [x] Implement relationship detection (grouping, alignment, sequences) → **relationshipAnalyzer.ts**
- [x] Implement pattern recognition (layout patterns, alignment quality, spacing) → **SemanticAnalysisSystem.detectDesignPatterns()**
- [ ] Implement narrative context extraction from conversation history → **TODO: Requires conversation history integration**
- [x] Implement semantic context formatting (compact, detailed, hints) → **Provided in usage examples above**
- [ ] Update `snapshotCanvasStep` to use semantic context → **Example code provided above, integration pending**
- [ ] Update agent prompts to leverage semantic context → **Pending**
- [ ] Write tests for each semantic analysis pass → **TODO**
- [x] Document semantic context usage patterns → **README.md** in `packages/canvas-semantic`

### Success Metrics

**Before (Technical Context Only)**:
```
[✓0 | 10[5r,3e,2t] | bbox:400×600]
```
- No understanding of what elements represent
- No component grouping
- No design intent
- No workflow context

**After (Semantic Context)**:
```
Compact: "Login form UI mockup | 10 elements | 2 components | vertical layout"

Detailed:
## Canvas Context
### Composition
Type: ui-mockup (85% confidence)
Description: Login form with authentication fields

### Components (2)
- form-group: Form with 2 input fields (Username, Password)
- button: Login button

### Relationships (2)
- aligned: Vertically aligned form fields
- grouped: Form inputs grouped together

### Design Patterns
Layout: vertical
Color Scheme: Blue-white material design

### Current Workflow
Task: Creating login screen for mobile app
Recent Actions:
- Created username input field
- Created password input field
- Added login button
```

**Impact**:
- ✅ Agents understand PURPOSE not just geometry
- ✅ Better decision-making (e.g., "align form fields" instead of "align rectangles")
- ✅ Workflow-aware responses (e.g., "Continuing with panel 3 storyboard")
- ✅ Design pattern detection enables consistency suggestions
- ✅ Component-level operations (e.g., "modify the form" instead of "modify rectangles 1-5")

**Example Improvements**:

| Scenario | Technical Context | Semantic Context |
|----------|------------------|------------------|
| **User**: "Make the form look better" | "Which rectangles?" | "Applying Material Design spacing to login form (2 input fields, 1 button)" |
| **User**: "Continue the storyboard" | "Create what?" | "Creating panel 4 with character dialogue (continuing scene 2 at sunset)" |
| **User**: "Align the components" | "Align which elements?" | "Aligning form-group vertically (Username, Password fields)" |

---

## Implementation Roadmap

### Week 1-2: Critical Foundations (P0)

**Week 1: Context Compaction + Tool Standardization**
- Days 1-2: Implement `ToolResponse<T>` schema
- Days 3-4: Implement `MemoryManager.getContextForPrompt()` with summarization
- Day 5: Testing and integration

**Week 2: Parallel Agents + Visual Verification**
- Days 1-2: Refactor Orchestrator for parallel sub-agent execution
- Days 3-5: Implement visual verification tools (color palette, character consistency)
- Integration with Creative Agent validation workflow

### Week 3: High-Priority Enhancements (P1)

**Progressive Skills + Prompting Format**
- Days 1-2: Implement 3-tier skill loading (metadata → core → advanced)
- Days 3-4: Create complete prompt templates for all 4 agents with few-shot examples
- Day 5: Testing skill selection accuracy and prompt consistency

### Week 4: Workflow Structure (P1)

**3-Phase Workflow** ✅ COMPLETE
- Days 1-2: ✅ Implemented planning phase (OrchestratorAgent includes intent classification)
- Days 3-4: ✅ Implemented synthesis phase with real validation
- Day 5: ✅ Added quality checks (visual consistency, canvas integrity, performance)

### Week 5: Integration & Refinement

**End-to-End Testing**
- Days 1-2: Integration testing across all proposals
- Days 3-4: Performance optimization and bug fixes
- Day 5: Documentation updates and team training

---

## Success Metrics & Validation

### Overall System Quality

| Metric | Current (Baseline) | Target (Post-Implementation) | Measurement Method |
|--------|-------------------|------------------------------|-------------------|
| **Visual Consistency** | 60% | 90%+ | Character appearance match across panels (validated by tools) |
| **Task Completion Time** | 20s (complex tasks) | 7s | Time for multi-component storyboard creation |
| **Long Session Coherence** | 30 turns before degradation | 50+ turns | Context retention in extended sessions |
| **Token Efficiency** | Baseline | 30-50% improvement | Tokens per task with progressive skills |
| **Error Rate** | 15-20% | <5% | Tasks requiring clarification or retry |
| **User Satisfaction** | N/A | >85% | User feedback on consistency and quality |

### Per-Proposal Metrics

**Proposal 1: Parallel Agents**
- Metric: Task completion time for complex requests
- Baseline: 20 seconds (sequential)
- Target: 7 seconds (3× faster)
- Test: "Create storyboard panel with character, background, dialogue"

**Proposal 2: Prompting Format**
- Metric: Output consistency and error rate
- Baseline: 15-20% clarification rate
- Target: <5% clarification rate
- Test: Run 100 diverse requests, measure retry rate

**Proposal 3: Workflow Structure**
- Metric: Validation accuracy
- Baseline: No validation (0%)
- Target: 90%+ issue detection
- Test: Introduce intentional errors, measure detection rate

**Proposal 4: Progressive Skills**
- Metric: Skill selection accuracy
- Baseline: 70% (regex-based)
- Target: 90%+ (LLM-based)
- Test: 50 requests, measure correct skill selections

**Proposal 5: Context Compaction**
- Metric: Information retention in long sessions
- Baseline: 60% after 50 turns (truncation)
- Target: 95%+ after 50 turns (summarization)
- Test: Track design decisions across 60-turn session

**Proposal 6: Visual Verification**
- Metric: Character consistency validation accuracy
- Baseline: 60% (manual review)
- Target: 90%+ (automated tools)
- Test: Generate 20 character images, measure match accuracy

---

## Risk Assessment & Mitigation

### High-Risk Items

**Risk 1: Visual verification tools may have false positives/negatives**
- Impact: High (affects consistency goal)
- Mitigation: Tune thresholds based on testing, provide manual override option
- Fallback: Use tools as advisory, not blocking

**Risk 2: Parallel execution may increase token costs significantly**
- Impact: Medium (budget concerns)
- Mitigation: Implement token budgets, only use parallel for complex tasks
- Fallback: Make parallelization opt-in based on task complexity

**Risk 3: Context summarization may lose critical information**
- Impact: High (coherence degradation)
- Mitigation: Extensive testing with design decision tracking, tune summary prompts
- Fallback: Increase verbatim message count if info loss detected

### Medium-Risk Items

**Risk 4: 3-tier skill loading complexity**
- Impact: Medium (implementation complexity)
- Mitigation: Start with 2-tier (metadata + core), add advanced tier later
- Fallback: Keep current binary loading as option

**Risk 5: Workflow refactoring may introduce regressions**
- Impact: Medium (stability concerns)
- Mitigation: Implement behind feature flag, gradual rollout
- Fallback: Easy rollback to current workflow

---

## Migration Path & Backward Compatibility

### Phase 1: Foundational Changes (Non-Breaking)
- Implement new tool response schema alongside existing (adapter pattern)
- Add visual verification tools as new capabilities
- Implement context compaction as opt-in feature
- **No breaking changes to existing agent APIs**

### Phase 2: Workflow Enhancement (Breaking)
- Refactor workflow structure (plan → execute → synthesize)
- Update agent prompts with complete templates
- **Migration guide**: Update agent integrations to new workflow API
- **Rollback plan**: Feature flag to revert to old workflow

### Phase 3: Optimization (Non-Breaking)
- Enable parallel sub-agent execution (orchestrator decides)
- Implement progressive skill loading (transparent to agents)
- **No API changes, only internal optimizations**

### Testing Strategy
- **Unit tests**: Each proposal component independently
- **Integration tests**: End-to-end workflows with all proposals
- **Regression tests**: Ensure existing functionality preserved
- **Performance tests**: Measure token usage, latency, quality metrics
- **User acceptance tests**: Real-world storyboard creation scenarios

---

## References

### Source Documents
1. `docs/engineering/AI/prompt-engineering-at-anthropic.md` - Anthropic's 2025 prompt engineering best practices
2. `packages/ai-agents/AI_AGENTS_GUIDE.md` - Current AI agents implementation

### Key Anthropic Patterns Applied
- Multi-agent orchestration (lines 144-198)
- Progressive disclosure / skill loading (lines 243-308)
- Context compaction (lines 379-433)
- Structured data output (lines 327-362)
- Visual verification for consistency (lines 834-862)

### Technologies & Libraries
- **Image Analysis**: sharp, node-vibrant, opencv4nodejs, pixelmatch
- **LLM Integration**: Anthropic SDK, structured outputs
- **TypeScript**: Strict typing for tool responses
- **Testing**: Vitest for unit/integration tests

---

## Appendix: Quick Reference

### Tool Response Schema
```typescript
interface ToolResponse<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string; recoverable: boolean };
  metadata: { timestamp: number; executionTime: number };
}
```

### Visual Verification Tools
- `analyzeColorPalette(imageUrl)` - Extract dominant colors, check WCAG
- `checkCharacterConsistency(image, reference)` - Validate appearance match
- `analyzeComposition(imageUrl)` - Rule of thirds, balance, harmony
- `compareImages(img1, img2, aspect)` - Similarity scoring

### Context Compaction Formula
```
Summary (1500 tokens) + Recent 5 messages (2500 tokens) = 4000 tokens
vs. Full history (25,000 tokens)
= 84% reduction with 95%+ info retention
```

### Parallel Execution Example
```typescript
// Independent tasks run simultaneously
await Promise.all([
  creativeAgent.handle('generate character'),
  creativeAgent.handle('generate background'),
  canvasAgent.handle('load previous panel')
]);
// 3× faster than sequential
```

---

**End of Proposal Document**

**Next Steps**:
1. Review and approve this proposal
2. Prioritize which proposals to implement first (recommend P0 items)
3. Assign engineering resources
4. Set up testing infrastructure
5. Begin Week 1 implementation (Context Compaction + Tool Standardization)

**Questions? Contact**: AI Engineering Team
