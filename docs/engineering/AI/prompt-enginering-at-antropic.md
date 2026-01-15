# Anthropic's Application-Level Engineering for Efficient Coding & Multi-Agent Workflows

## Overview

Anthropic has developed several innovative techniques at the prompt and system design level to make their AI assistant Claude effective for coding assistance and complex multi-agent workflows. This report explores those techniques, including:

- **Prompt engineering strategies** for better reasoning and modularity
- **Multi-agent architecture** that coordinates sub-agents
- **System design patterns** like progressive context disclosure and memory management
- **Practical examples** in code generation and research assistant applications
- **Application insights** for Emo Board's agent-based visual workflow system

---

## 1. Prompt Engineering Techniques for Reasoning and Modularity

Anthropic emphasizes prompt clarity, structure, and modularity to improve Claude's reasoning.

### 1.1 Structured Prompts with XML/Markdown

- **XML tags** like `<example>`, `<document>`, `<thinking>`, `<answer>` help organize information
- **Sectioned prompts** with clear divisions (e.g., `<background_information>`, `<instructions>`, `## Tool guidance`, `## Output description`)
- Makes prompts easier for the model to parse and follow
- Leaked Anthropic prompt examples show heavy use of XML tags for this reason

**Example structure:**
```xml
<background_information>
  Context about the task
</background_information>

<instructions>
  Specific steps to follow
</instructions>

<output_format>
  How to structure the response
</output_format>
```

### 1.2 Specific and Modular Instructions

Anthropic's prompt engineers advise giving **explicit, concrete instructions** instead of vague ones:

- ❌ **Vague:** "be concise"
- ✅ **Specific:** "Limit your response to 2–3 sentences"

**Key principles:**
- Each prompt or prompt component should do **one job effectively**
- Modular prompts are easier to test, reuse, and improve performance
- Eliminates conflicting objectives
- Anthropic's Zack Witten: treat the model as a "dimwitted intern" – never assume it will infer unspecified requirements

### 1.3 Mimic Desired Tone & Format

Claude tends to **continue in the style of the prompt**:

- If the prompt is academic in style, the answer will likely be academic
- If the prompt is in English, it's harder to get an answer in another language
- Formal prompt → formal response; casual prompt → casual response

**Techniques:**
- **Provide example outputs** to guide the model
- **Prefilling:** Start the model's answer for it (e.g., begin with `{` for JSON output)
- The model will naturally continue in the established format

### 1.4 Chain-of-Thought (CoT) Prompting

For complex problems, Anthropic encourages **"letting Claude think"** by prompting step-by-step reasoning:

- Instruct Claude to break down the problem and output its reasoning process
- Improves accuracy and coherence on tasks like debugging, analysis, or multi-step math
- **Critical insight:** "Without outputting its thought process, no thinking occurs!"

**Implementation pattern:**
```xml
<thinking>
  Step-by-step reasoning here
  - Consider X
  - Analyze Y
  - Conclude Z
</thinking>

<answer>
  Final answer without reasoning clutter
</answer>
```

This allows systems to **hide the reasoning** from end-users while improving output quality.

### 1.5 Avoiding Negative or Ambiguous Prompts

**Best practices:**
- ❌ Avoid negative instructions ("don't do X") – they can backfire by focusing the model on forbidden content
- ✅ Use positive instructions (what to do, not what to avoid)
- Practice good "prompt hygiene": correct grammar, consistent casing, clear structure
- Even superficial prompt clarity yields better outputs

### Summary

Anthropic's prompt engineering for Claude focuses on making every instruction **explicit, structured, and scoped**. By segmenting prompts, providing examples, and even partially writing the answer or reasoning format, they reduce ambiguity and encourage Claude to follow a reliable, reusable thought process.

---

## 2. Claude's Multi-Agent Architecture and Coordination

Beyond single prompts, Anthropic has pioneered **multi-agent architectures** for Claude to tackle complex, open-ended tasks by delegating work across specialized "sub-agents." Instead of one monolithic AI handling everything, Claude can coordinate multiple instances of itself with different roles or sub-goals.

**Key implementations:**
- Claude's Research mode
- Claude Code multi-agent setup

### 2.1 Orchestrator and Sub-Agents Pattern

Anthropic's multi-agent systems use a **lead agent (orchestrator)** that plans and delegates tasks to multiple worker agents in parallel:

**Architecture:**
```
┌─────────────────┐
│  Lead Agent     │ ← Analyzes query, creates plan
│  (Orchestrator) │
└────────┬────────┘
         │
    ┌────┴────┬────────┬────────┐
    ▼         ▼        ▼        ▼
┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
│Sub-Agent│ │Sub-Agent│ │Sub-Agent│ │Sub-Agent│
│   #1    │ │   #2    │ │   #3    │ │   #4    │
└────────┘ └────────┘ └────────┘ └────────┘
    │         │        │        │
    └─────────┴────────┴────────┘
              │
         (Report back)
```

**Key characteristics:**
- Lead agent analyzes the user's query, then spawns sub-agents for specific subtasks
- Each sub-agent runs in its **own context window** (focused, no cross-contamination)
- Sub-agents operate **semi-autonomously** using tools (web search, code execution, etc.)
- Sub-agents report back **summaries** to the lead agent

### 2.2 Parallel Exploration and Separation of Concerns

This design enables **parallel processing** of different task aspects:

**Research example:**
- Claude's Research feature creates multiple sub-agents to search the web simultaneously
- Each sub-agent explores a different source or angle
- Acts like a team of independent researchers

**Coding example:**
- Claude Code dispatches sub-agents to handle distinct codebase parts:
  - Sub-agent #1: Backend code
  - Sub-agent #2: Frontend files
  - Sub-agent #3: Configuration
  - Sub-agent #4: Documentation
- Main agent collates all findings

**Benefits:**
- Each agent can **delve deeply** without interfering with others
- Combined insights cover **far more ground** than sequential processing
- Separation of concerns improves focus and quality

**Example prompt:**
> "Using 4 subagents, explore the backend, frontend, configuration, and tests in parallel. Each subagent should read the relevant files and generate a report on its assigned section."

Claude will spin up four coordinated agents under the hood – one per area – then merge their reports into a coherent overview. This dramatically speeds up codebase understanding.

### 2.3 Planning, Synchronization, and Merging

The lead agent is responsible for the **overall game plan**:

**Planning phase:**
1. Decompose problem into sub-tasks
2. Write plan or to-do list in scratchpad (can be persisted to memory)
3. Launch sub-agents with appropriate instructions

**Execution approach:**
- **"Interleaved thinking"** for tools: sub-agents alternate between thinking steps and tool use
- Example loop: web query → analyze results → decide next query → repeat

**Aggregation phase:**
- Lead agent waits for sub-agent results
- Synthesizes final answer from combined outputs

**Modular role architecture example (Research system):**
- `LeadResearcher` - Orchestrates the research
- Multiple `SearchAgents` - Explore different angles
- `CitationAgent` - Analyzes sources and inserts precise citations

Each role is handled by a **specialized prompt with clear responsibilities**.

### 2.4 Performance Benefits

Anthropic's internal evaluations show **significant performance gains**:

**Benchmark results:**
- Multi-agent setup (Claude 4 lead + Claude 4 sub-agents) **outperformed single agent by 90%** on hard web research tasks
- Success through query decomposition and parallel searching
- Single agent doing serial searches struggled

**Key insight:** Multiple agents help **"spend enough tokens to solve the problem"** in the right places, acting like an **intelligence multiplier**.

### 2.5 Challenges and Limits

Multi-agent systems have trade-offs to consider:

**Token consumption:**
- Research agents: **~4× tokens** vs normal single-agent chat
- Multi-agent systems: **~15× tokens** on average
- Best reserved for **high-value tasks** that warrant extra computation

**Coordination complexity:**
- Risk of agents duplicating work or interfering with each other
- Mitigation: Give each sub-agent a **distinct, well-defined scope**
- Lead agent integrates results to reduce overlap

**Not universally beneficial:**
- Some tasks have **sequential dependencies** (one function's output → another's input)
- Parallel agents less useful for highly coupled work
- Better alternatives: iterative planning, focused tool use

**Best use cases:**
- ✅ Research with multiple angles
- ✅ Analyzing multiple documents
- ✅ Scanning many files in large codebases
- ❌ Tightly coupled sequential workflows

---

## 3. System Design Strategies and Prompt Frameworks for Complex Tasks

Anthropic couples its prompt engineering and agent architecture with **system-level patterns** that make Claude more efficient in long, complex interactions.

**Key strategies:**
- Progressively loading context
- Maintaining long-term state via summarization or notes
- Leveraging external tools/coding within the workflow

### 3.1 Progressive Disclosure via "Skills"

One of Anthropic's notable innovations is the **Agent Skills framework**, which introduces modularity and reuse into prompting. Instead of stuffing the prompt with all possible instructions, a Skill packages expertise (style guides, coding standards, analysis procedures) into files that Claude can load **on demand**.

**Three-tier context loading architecture:**

#### Tier 1: Metadata (20-40 tokens per skill)

On session start, Claude only sees a **short name and description** for each available skill:

```yaml
---
name: pdf-form-filler
description: Comprehensive PDF toolkit for extracting text/tables, creating and editing PDFs, and handling forms
---
```

**Benefits:**
- Even with dozens of skills installed, only a couple thousand tokens total
- Far smaller than embedding entire instructions for every request
- Claude sees a "menu" of skill names and summaries

#### Tier 2: Core Instructions (loaded on demand)

When Claude determines a skill is relevant, it pulls in the **full content** of that skill's instructions (SKILL.md):

**Example: code-review-enforcer skill**
```markdown
## Code Review Procedure
1. Run linter script
2. Run security scan
3. Check documentation completeness
4. Verify test coverage

## Output Format
- List issues by severity
- Provide file:line references
- Suggest fixes
```

**Benefits:**
- Instructions become part of context **only when needed**
- Can be several thousand tokens of detailed guidance
- Otherwise stays out of the way

#### Tier 3: Just-in-Time Resources (conditional loading)

Even more detailed reference material loads **only if specific steps require it**:

**Examples:**
- Code review skill → `python.md` or `typescript.md` (language-specific guidelines)
- PDF skill → `advanced_features.md` (only for complex forms)

**Benefits:**
- Skills can include **megabytes of knowledge** in reserve
- Claude's **active context stays lean**
- Unbounded knowledge available when needed

#### Skills Summary

Progressive disclosure means Claude doesn't carry the full burden of all possible instructions, yet can tap into potentially unbounded knowledge when needed. It's like having a **library of modules** that Claude can consult.

**Composability:**
- Skills can be invoked together if a task spans domains
- Claude coordinates multiple skills automatically

**Comparison to alternatives:**
- **OpenAI's approach:** With 10 tools, you pay the context cost of all 10 every time
- **Skills approach:** Only pull in what's needed – **fundamentally more efficient at scale**

**Executable workflows:**
- Skills bundle **code execution** (Python/Bash scripts) with instructions
- Claude can not only *know* how to do something but also *run* a tool to do it
- "Teaching Claude a complete workflow," not just calling a stateless API

**Example:** Rather than describing how to parse a PDF in text, a skill includes a Python script that actually performs the parse when invoked.

### 3.2 Tool Use & Code Execution Integration

Claude's design heavily leverages **tool use** to extend its capabilities, especially for coding tasks.

**Sandboxed Code Execution:**
- Anthropic provides a sandboxed execution environment
- Claude can run Python or Bash code (with user permission)
- Agent Skills framework executes skill scripts (linters, data transformations, etc.)
- Results incorporated into Claude's answer

#### Best Practice: Structured Data Output

Have scripts output **structured data (JSON)** that Claude can easily parse:

**❌ Unstructured approach:**
```
Linter output:
Error: undefined variable on line 42
Warning: unused import on line 7
Error: syntax error on line 103
... (hundreds of lines)
```

**✅ Structured approach:**
```json
{
  "errors": [
    {"line": 42, "severity": "error", "message": "undefined variable"},
    {"line": 103, "severity": "error", "message": "syntax error"}
  ],
  "warnings": [
    {"line": 7, "severity": "warning", "message": "unused import"}
  ],
  "summary": {
    "total_errors": 2,
    "total_warnings": 1
  }
}
```

**Benefits:**
- Avoids forcing Claude to parse lengthy raw outputs
- Reduces token waste
- Prevents parsing errors
- Claude summarizes JSON into coherent review reports

#### Offloading to Tools

**Key principle:** "If I don't have to make this long pilgrimage to the Oracle [the LLM], I shouldn't."

- Offload heavy or precise computations to tools
- Improves accuracy (no hallucinated calculations)
- Reduces prompt size (delegate instead of describe)

**Division of labor:**
- **Use LLM for:** Reasoning, flexible tasks, creative work
- **Use deterministic tools for:** Well-defined subroutines, exact computations

Claude's architecture (function calling + code sandbox) supports this **mix of AI and traditional computation** seamlessly.

### 3.3 Context Compaction (Summarization)

To handle very long sessions or projects, Anthropic employs **context compaction** – systematically summarizing and trimming conversation or working state to fit within the context window.

**Problem:** Context windows have limits, but sessions can be very long
**Solution:** High-fidelity summarization instead of simple truncation

#### How It Works

**Traditional approach (❌):**
- Simply truncate old history
- Drops important details
- Loses context coherence

**Anthropic's approach (✅):**
- Produce **high-fidelity synopsis** that preserves key points
- Focus on: architectural decisions, outstanding bugs, current goals, etc.
- Continue with summary + recent context
- "Reset" context window while retaining important information

**Example (Claude Code):**
```
Original context (50,000 tokens):
- Full conversation history
- All code changes
- Tool outputs
- Debug sessions

↓ Compaction ↓

Compressed context (5,000 tokens):
- Summary: "Refactored X module, tests A and B passing"
- Outstanding: "Need to fix bug in module Y"
- Decisions: "Chose architecture pattern Z"
+ Most recent 10 messages
```

#### Best Practices

**Tuning summarization prompts:**
- Err on the side of **keeping too much** (high recall)
- Then trim less relevant details
- Overly aggressive summaries might omit vital information

**Commonly dropped content:**
- ✂️ Raw tool outputs (after extraction complete)
- ✂️ Processed web search results
- ✂️ Old code outputs Claude already analyzed

**Automated optimization:**
- Anthropic introduced automated feature to clear old tool results
- Considered "lightweight" compaction that's generally safe

**Benefits:**
- Maintain coherence over **hours of work**
- Handle **tens of thousands of tokens** of content
- Compress instead of lose

### 3.4 Structured Memory and Note-Taking

Alongside compressing context, Anthropic gives Claude **persistent memory** via structured note-taking.

**Concept:** Claude writes important information to external file/storage (outside immediate context) and retrieves it later.

#### Implementation Examples

**Claude Code:**
- Automatically maintains `NOTES.md` or to-do list
- Keeps high-level summary of codebase (`claude.md`)
- Updates as it works
- Acts as **extension of Claude's memory**
- Persists beyond context window

**On context reset or new session:**
- Claude reloads notes to regain state
- Quick context recovery
- Maintains project continuity

#### Real-World Example: Pokémon Agent

Anthropic demonstrated an agent playing Pokémon for **thousands of steps** by maintaining a journal:

**Memory contents:**
```markdown
## Progress
- Been training Pikachu for 1,234 steps
- Gained 8 levels (current: level 18, target: level 20)
- Currently in Viridian Forest

## Areas Explored
- ✅ Pallet Town
- ✅ Route 1
- ⏳ Viridian Forest (in progress)
- ❌ Pewter City (not yet)

## Strategies That Worked
- Battle wild Pidgeys for easy XP
- Avoid Bug Catchers until level 15+
```

**Result:**
- Even with context resets, agent continues consistently
- Mapped out areas explored
- Recorded strategies
- All done **autonomously** using notes as extended memory

#### Memory API (Claude 4.5+)

Anthropic now provides a **Memory API/tool** for developers:

**Capabilities:**
- Append to memory file
- Query memory contents
- Maintain continuity across conversations/sessions
- Extend beyond raw context limit

**Use cases:**
- Long-running projects
- Multi-session workflows
- State persistence
- Knowledge accumulation

### 3.5 Prompt Templates and Reusability

On a higher level, Anthropic treats **well-crafted prompts and workflows as reusable components**.

#### Template Patterns

Skills are essentially **reusable prompt+tool packages**. Even without formal Skills, you can design templates:

**Example templates:**
- Code review template
- Research summary template
- Data analysis template
- Bug investigation template

**Implementation:**
- Design template structure once
- Programmatically fill in variables as needed
- Maintain consistency across uses

#### From Prompt Engineering to Context Engineering

**Traditional approach:**
- Ever-growing chat history
- Ad-hoc prompts
- Focus on phrasing individual prompts

**Anthropic's approach:**
- Few large, well-structured prompts
- Call out to tools or memory
- Focus on **overall state** given to model:
  - System instructions
  - Available tools
  - Retrieved data
  - Memory contents

**Context engineering goal:** Optimize the **configuration of context** to achieve desired behavior.

**Holistic framework includes:**
- ✅ Structuring prompts (XML tags, sections)
- ✅ Trimming low-value context (compaction)
- ✅ Splitting tasks among sub-agents (orchestration)
- ✅ Progressive skill loading (on-demand knowledge)
- ✅ Tool delegation (offload computations)
- ✅ Memory persistence (notes, summaries)

### Design Patterns Summary

These design patterns allow Claude to handle **complex, extended tasks efficiently**:

| Pattern | Purpose | Benefit |
|---------|---------|---------|
| Progressive skill loading | Tackle instruction bloat | Load knowledge on-demand |
| Tool use & code execution | Offload work from model | Improve accuracy, reduce tokens |
| Context compaction | Address context limits | Maintain long-session coherence |
| Structured memory | Persist beyond context window | Enable multi-session continuity |
| Prompt templates | Ensure consistency | Reusable, testable workflows |

**Key insight:** Much of an AI system's "intelligence" comes from **how you orchestrate and feed the model**, not just the model itself. All done at the **application level** (outside core model weights).

---

## 4. Application Examples: Coding Assistant and Research Agent Modes

To see these techniques in action, let's examine two domains Anthropic has targeted.

### 4.1 Claude Code (Coding Assistant)

Claude Code is Anthropic's **AI programmer mode**, leveraging the above techniques to boost coding productivity.

#### Initialization

**Session start:**
- Initialize project → generates `claude.md` summary of codebase
- Persistent overview Claude can refer to for context
- Acts as project "memory"

#### Multi-Agent Codebase Exploration

**Example workflow:**
1. User asks Claude to analyze large repository
2. Claude spawns 4 sub-agents in parallel:
   - Sub-agent #1: Backend analysis
   - Sub-agent #2: Frontend analysis
   - Sub-agent #3: Tests analysis
   - Sub-agent #4: Documentation analysis
3. Each sub-agent opens its own view of project files
4. Performs analysis or modifications
5. Returns **concise summary** to lead agent

**Key benefit:** Lead agent doesn't get overwhelmed by thousands of lines of code – it only sees distilled reports.

**User experience:** Feels like managing a **"team of AI developers"** rather than just one bot.

#### Tool Integration

Claude Code makes heavy use of tools:
- Run tests
- Execute code
- Search documentation online
- Lint and format code
- Git operations

**Separation of duties example:**
- Agent #1: Runs tests
- Agent #2: Reads error logs
- Agent #3: Looks up documentation
- Main agent: Coordinates and synthesizes

#### Memory and Long Sessions

**Progress tracking:**
- Summarizes work: "Refactored X module, tests A and B passing, need to fix bug in module Y next"
- Stores summary to persistent file
- On context clear or new session: reads project summary to regain state

**Combined approach:**
- **Chain-of-thought reasoning:** Planning and debugging logic errors
- **Tool execution:** Accurate computation and environment interaction
- **Memory:** Maintain state across sessions

**Result:** An AI agent that can **reason, act, and remember** in a coding workflow.

### 4.2 Research Assistant (Claude's "Research" Mode)

This feature turns Claude into a **web researcher** that can answer complex queries by finding and citing information.

#### Multi-Agent Research Architecture

**Workflow:**
1. User asks research question
2. **Lead Researcher** agent formulates research plan
3. Plan splits query into sub-questions
4. Launches multiple **Search sub-agents** in parallel
5. Each sub-agent investigates specific angle
6. Sub-agents report findings to lead
7. **Citation Agent** cross-checks and adds citations
8. Lead produces final synthesized report

**Example query:** "What are all the board members of companies in the S&P 500 tech sector?"

**Agent delegation:**
- Sub-agent #1: Gather list of IT sector companies
- Sub-agent #2: Search company A's board members
- Sub-agent #3: Search company B's board members
- Sub-agent #4: Search company C's board members
- (etc., concurrently)

#### Citation Integration

**Citation Agent role:**
- Takes assembled answer
- Cross-checks against gathered sources
- Inserts citation footnotes for each claim
- Ensures report is **verifiably linked** to source material

**Result:** Comprehensive AND credible research.

#### Scratchpads and Planning

**Intermediate working memory:**
- Lead agent "thinks" through approach
- Records plan to scratchpad
- Saves to memory (prevents loss if context overflows)
- Sub-agents track:
  - What they've searched
  - What remains to be done

**This is chain-of-thought applied at the agent-system level.**

#### Performance Results

**Anthropic's internal tests:**
- Multi-agent system tackles breadth and depth far better than single agent
- Trade-off: Uses more computing resources (15× tokens)
- Worth it for high-value research tasks

**Key insight:** Clever system engineering (dynamic agent delegation + tool use) allows AI to achieve **complex objectives like a human research team**.

---

## 5. Applying These Insights to Emo Board's Visual Workflow System

Emo Board's goal – an **agent-based visual narrative workflow** with reusable components and consistent results – can draw heavily from Anthropic's strategies.

### 5.1 Reusable Prompt Components (Skills/Modules)

**Application to Emo Board:**

Define "skills" or prompt modules for common creative tasks:

**Example skills:**
- **Character Consistency Skill**
  - Character's key traits
  - Art style guidelines
  - Visual reference descriptions
- **Layout Design Skill**
  - Composition principles
  - Shot framing guidelines
  - Visual hierarchy rules
- **Style Transfer Skill**
  - Color palette definitions
  - Lighting preferences
  - Artistic techniques

**Implementation approach:**
- Keep modules separate
- Invoke only when needed (progressive disclosure)
- Load "character profile skill" when generating new scene
- Ensures appearance and demeanor match previous scenes
- Doesn't carry info in every prompt (saves context)

**Benefits for Emo Board:**
- Efficient context usage
- Consistent application of creative rules
- Easy to update and maintain

### 5.2 Structured Reasoning Templates

**Application to Emo Board:**

Use structured prompts and tags to separate planning from output.

**Example: Storyboard generation**
```xml
<thinking>
  Story beats for this scene:
  1. Character A enters room
  2. Discovers evidence
  3. Reacts with shock

  Visual continuity checks:
  - Character A wearing blue jacket from previous scene ✓
  - Time of day: late afternoon (golden hour lighting) ✓
  - Location: Same apartment as scene 3 ✓
</thinking>

<answer>
  {
    "scene_description": "Character A enters dimly lit room...",
    "visual_elements": [...],
    "dialogue": [...]
  }
</answer>
```

**Structured sections:**
- `<background>` - Context of story so far
- `<instructions>` - Specific task for this scene
- `<output_format>` - Required format (JSON/markdown)

**UI handling:**
- Hide reasoning tag content from user
- Use it to debug and verify agent considered all factors
- Ensure continuity checks were performed

### 5.3 Dynamic Agent Delegation

**Application to Emo Board:**

Borrow orchestrator-subagent architecture for complex multi-modal tasks.

**Example: Generating a visual narrative scene**

```
┌────────────────────┐
│   Lead Agent       │ ← Coordinates overall scene
│   (Scene Director) │
└─────────┬──────────┘
          │
    ┌─────┴─────┬──────────┬────────────┐
    ▼           ▼          ▼            ▼
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│Script    │ │Scene     │ │Continuity│ │Color     │
│Writer    │ │Designer  │ │Checker   │ │Stylist   │
└──────────┘ └──────────┘ └──────────┘ └──────────┘
```

**Agent roles:**
- **ScriptWriter** - Dialogue and narrative beats
- **SceneDesigner** - Background art and composition
- **ContinuityChecker** - Verify alignment with previous scenes
- **ColorStylist** - Ensure color palette consistency

**Context optimization:**
- SceneDesigner gets: art style guidelines + script (not full story)
- ContinuityChecker gets: summary of past scenes + new scene
- Each agent focuses deeply on one aspect

**Benefits:**
- **Speed:** Parallel generation
- **Quality:** Each agent deeply focuses on their domain
- **Scalability:** Easy to add new specialized agents

### 5.4 Persistent Memory for Consistency

**Application to Emo Board:**

Consistency in narrative (character traits, plot points, visual details) is crucial.

**Implementation: Story Bible / World State File**

Analogous to Claude's `NOTES.md` or `claude.md`:

```markdown
# Story Bible

## Characters
### Character A
- **Appearance:** Green eyes, scar on left hand, blonde hair
- **Outfit (current):** Blue jacket, gray pants
- **Personality:** Cautious, analytical, protective

### Character B
- **Appearance:** Brown eyes, short black hair, athletic build
- **Outfit (current):** Red shirt, jeans
- **Personality:** Impulsive, creative, optimistic

## Environment
- **Current location:** Downtown apartment
- **Time of day:** Late afternoon (golden hour)
- **Weather:** Light rain started in scene 4

## Style Guide
- **Color palette:** Pastel tones, warm lighting
- **Art style:** Semi-realistic, soft edges
- **Mood:** Contemplative, slightly melancholic
```

**Usage pattern:**
- Agents update file as story progresses
- Refer to it when creating new content
- On context reset: reload and restore consistency
- Ensures character/story consistency (key Emo Board goal)

### 5.5 Tool Integration (Vision & Verification Tools)

**Application to Emo Board:**

While Anthropic focuses on text/code, Emo Board deals with **visuals**.

**Proposed tools:**
- **Image Similarity Tool** - Verify character appearance consistency across images
- **Color Palette Checker** - Ensure color scheme matches style guide
- **Composition Analyzer** - Check visual balance and framing
- **Object Detector** - Verify required elements are present

**Implementation approach (MCP-like):**
- Call external APIs or custom scripts
- Get deterministic feedback: "Character's hair color in image is #FFD700"
- Adjust image generation prompt accordingly
- Don't rely purely on LLM memory

**Benefits:**
- No hallucinated visual details
- Actual data-driven consistency checks
- Deterministic verification

**Example workflow:**
1. Generate image for scene
2. Run through consistency checker
3. Tool reports: "Character's eye color: GREEN ✓" (matches Story Bible)
4. Tool reports: "Outfit: BLUE JACKET ✓" (matches previous scene)
5. If mismatch: regenerate with corrected prompt

### 5.6 Testing and Iteration

**Application to Emo Board:**

Adopt Anthropic's systematic testing approach.

**Testing strategies:**
- **Unit-test prompts:** Verify character description skill yields correct style
- **Integration test:** Multi-agent pipeline correctly flags continuity errors
- **Regression test:** Spreadsheet of test cases for various story scenarios
- **A/B testing:** Compare different prompt formulations

**Evaluation criteria:**
- Visual consistency across scenes
- Adherence to style guidelines
- Narrative coherence
- Character consistency
- User satisfaction

**Iterative refinement:**
- Fine-tune prompt wording
- Adjust memory content structure
- Optimize skill trigger conditions
- Improve agent coordination

## Conclusion

Anthropic's application-level engineering demonstrates that by carefully **structuring context and dividing tasks**, even a general-purpose model can become a powerful specialist.

**Key takeaways for Emo Board:**

| Technique | Emo Board Application |
|-----------|----------------------|
| Modular prompts | Reusable creative skills (character, style, layout) |
| Orchestrated agents | Specialized roles (writer, designer, continuity checker) |
| Context management | Progressive disclosure, compaction |
| Persistent memory | Story Bible for consistency |
| Tool integration | Vision tools for verification |
| Systematic testing | Prompt testing, agent evaluation |

**Philosophy shift:**

Don't treat AI as a single monolithic "oracle" – instead, build an **organized system of cooperating parts**. Like Anthropic's "modular mind" of skills and agents, Emo Board can create an AI-driven visual storytelling workflow that is:

- ✅ **Efficient** - Progressive loading, context optimization
- ✅ **Consistent** - Memory persistence, verification tools
- ✅ **Scalable** - Modular architecture, parallel processing
- ✅ **Reliable** - Systematic testing, deterministic checks
- ✅ **Magical** - Delivers creative results without micromanagement

**Final insight:** Much of an AI system's "intelligence" comes from **how you orchestrate and feed the model**, not just the model itself. By applying these application-level techniques, Emo Board's agents can deliver results that are both **imaginative and reliable**.