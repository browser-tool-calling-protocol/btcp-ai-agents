/**
 * Claude Code Patterns Demo
 *
 * Demonstrates the 7 patterns implementation for canvas agents.
 *
 * Run: pnpm patterns:demo
 */

import {
  // Agent (Pattern 2: Streaming)
  streamCanvasAgent,
  runCanvasAgent,
  getCanvasAgentResult,
  createCanvasAgentSession,
} from "../core/index.js";

import {
  // Agent types
  createCancellationToken,
  type AgentConfig,
  type AgentEvent,
  // Prompts (Pattern 3: XML Reasoning)
  getSystemPromptWithXml,
  detectAgentMode,
} from "../agents/index.js";

import {
  // Tools (Pattern 1: Minimal Tools)
  createToolExecutor,
  getToolNames,
} from "../tools/index.js";

import {
  // Resources (Pattern 4: Stateless)
  createResources,
  getResourcesSummary,
} from "../agents/state.js";

import {
  // Hooks (Pattern 5: Observability)
  createCanvasAgentHooks,
  CommonHooks,
} from "../hooks/canvas.js";

import {
  // Skills (Pattern 6: Compressed Context)
  getMatchingSkills,
  injectRelevantSkills,
} from "../skills/index.js";

import {
  // Subagents (Pattern 7: Delegation)
  detectSubAgent,
  listSubAgents,
} from "../core/delegation.js";

// Demo configuration
const CANVAS_ID = "demo-canvas";
const DEMO_TASKS = [
  "Create a flowchart for user registration",
  "Design a mobile app login screen",
  "Create a moodboard for a tech startup brand",
  "Analyze the current canvas layout",
  "Align all elements to the grid",
];

/**
 * Demo: Pattern 1 - Minimal Tools
 */
async function demoMinimalTools(): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("📦 Pattern 1: Minimal Tools, Maximum Composability");
  console.log("=".repeat(60));

  const tools = getToolNames();
  console.log(`\nCore tools (like Claude Code's Read/Write/Edit/Grep/Glob):`);
  tools.forEach((tool) => {
    const descriptions: Record<string, string> = {
      canvas_read: "Get canvas/element data (like Read)",
      canvas_write: "Create/replace elements (like Write)",
      canvas_edit: "Precise incremental changes (like Edit)",
      canvas_find: "Search by pattern (like Grep)",
      canvas_capture: "Export for vision (like Read for images)",
      canvas_delegate: "Spawn sub-agent (like Task)",
    };
    console.log(`  • ${tool}: ${descriptions[tool]}`);
  });
}

/**
 * Demo: Pattern 2 - Streaming Architecture
 */
async function demoStreamingArchitecture(): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("🔄 Pattern 2: Streaming-First Architecture");
  console.log("=".repeat(60));

  const config: AgentConfig = {
    canvasId: CANVAS_ID,
    model: "balanced",
    verbose: false,
    maxIterations: 3,
  };

  console.log("\n1. Streaming consumption (real-time events):");
  console.log("   for await (const event of streamCanvasAgent(task, config)) { ... }");

  console.log("\n2. Batch consumption (collect all):");
  console.log("   const events = await runCanvasAgent(task, config);");

  console.log("\n3. Simple consumption (final result):");
  console.log("   const result = await getCanvasAgentResult(task, config);");

  console.log("\n4. Session-based (with history):");
  console.log("   const session = createCanvasAgentSession(config);");
  console.log("   await session.send('Create rectangle');");
  console.log("   await session.send('Make it blue');");

  // Demo cancellation token
  const token = createCancellationToken();
  console.log("\n5. Cancellation support:");
  console.log("   const token = createCancellationToken();");
  console.log("   token.cancel('User requested'); // Graceful cancellation");
}

/**
 * Demo: Pattern 3 - XML Reasoning Structure
 */
async function demoXmlReasoning(): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("📋 Pattern 3: Explicit Reasoning Structure (XML Tags)");
  console.log("=".repeat(60));

  const task = "Create a flowchart for login process";
  const mode = detectAgentMode(task);

  console.log(`\nTask: "${task}"`);
  console.log(`Detected mode: ${mode}`);

  console.log("\nReasoning structure in prompts:");
  console.log(`
<analyze>
  - What is the user asking for?
  - What elements currently exist?
  - What constraints apply?
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
  - What was created/modified/deleted?
  - Element IDs for reference
  - Any issues encountered?
</summarize>
`);
}

/**
 * Demo: Pattern 4 - Stateless Resources
 */
async function demoStatelessResources(): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("📊 Pattern 4: Stateless Systems, Observable State");
  console.log("=".repeat(60));

  const resources = createResources(CANVAS_ID);

  console.log("\nAll state lives in resources (serializable, inspectable):");
  console.log(`\n${getResourcesSummary(resources)}`);

  console.log("\nResource structure:");
  console.log(`
  AgentResources {
    canvas: { id, version, summary, workingSet, viewport }
    task: { id, status, currentStep, checkpoint, errors }
    context: { tokenBudget, tokensUsed, strategies, skills }
    history: { operations[], maxEntries }
  }
`);

  console.log("Benefits:");
  console.log("  • State is always inspectable (debugging)");
  console.log("  • State is always serializable (checkpointing)");
  console.log("  • No hidden coupling between components");
  console.log("  • Easy to test (inject mock resources)");
}

/**
 * Demo: Pattern 5 - Hooks for Observability
 */
async function demoHooks(): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("🔗 Pattern 5: Pre/Post Hooks for Observability");
  console.log("=".repeat(60));

  const hooks = createCanvasAgentHooks();

  // Register validation hook
  hooks.onPreToolUse(CommonHooks.createValidationHook());

  // Register logging hook
  hooks.onPostToolUse((context) => {
    console.log(`  [Hook] ${context.tool} completed in ${context.duration}ms`);
  });

  console.log("\nHooks enable:");
  console.log("  • Complete audit trail");
  console.log("  • UI updates automatically");
  console.log("  • Security enforcement point");
  console.log("  • Metrics collection");

  console.log("\nCommon hooks:");
  console.log("  • createValidationHook() - Validate inputs");
  console.log("  • createLoggingHook() - Log all operations");
  console.log("  • createRateLimitHook() - Rate limiting");
  console.log("  • createConfirmationHook() - User confirmation for destructive ops");

  // Show metrics
  console.log("\nMetrics tracked:");
  console.log(JSON.stringify(hooks.getMetrics(), null, 2));
}

/**
 * Demo: Pattern 6 - Skills as Compressed Context
 */
async function demoSkills(): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("🎯 Pattern 6: Skills as Compressed Context");
  console.log("=".repeat(60));

  console.log("\nAvailable skills:");
  for (const task of DEMO_TASKS) {
    const skills = getMatchingSkills(task);
    const skillNames = skills.map((s) => s.name).join(", ");
    console.log(`  "${task.slice(0, 40)}..."`);
    console.log(`    → Skills: ${skillNames || "general"}`);
  }

  console.log("\nSkill injection example:");
  const basePrompt = "You are a canvas agent.";
  const task = "Create a flowchart for user login";
  const injected = injectRelevantSkills(task, basePrompt);
  console.log(`  Base prompt: ${basePrompt.length} chars`);
  console.log(`  With skills: ${injected.length} chars`);
  console.log(`  Knowledge expansion: ${(injected.length / basePrompt.length).toFixed(1)}x`);

  console.log("\nBenefit: 150 tokens of trigger → 10,000 tokens of expertise");
}

/**
 * Demo: Pattern 7 - Sub-Agent Delegation
 */
async function demoSubAgentDelegation(): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("👥 Pattern 7: Sub-Agent Delegation (Task Tool)");
  console.log("=".repeat(60));

  console.log("\nAvailable sub-agents:");
  for (const subagent of listSubAgents()) {
    console.log(`  • ${subagent.name} (${subagent.id})`);
    console.log(`    ${subagent.description}`);
    console.log(`    Model: ${subagent.model}, Tools: ${subagent.allowedTools.join(", ")}`);
  }

  console.log("\nAuto-detection:");
  for (const task of DEMO_TASKS) {
    const detected = detectSubAgent(task);
    console.log(`  "${task.slice(0, 40)}..." → ${detected || "root agent"}`);
  }

  console.log("\nDelegation example:");
  console.log(`
await delegateToSubAgent({
  subagent: "layout-specialist",
  task: "Align all elements to 8px grid",
  context: { canvasId: "my-canvas" },
  expectReturn: "positions"
});

// Returns: [{ id: "...", x: 100, y: 200 }, ...]
`);
}

/**
 * Main demo runner
 */
async function main(): Promise<void> {
  console.log("\n");
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║    Claude Code Patterns for Canvas Agents                  ║");
  console.log("║    @waiboard/ai-agents/patterns                            ║");
  console.log("╚════════════════════════════════════════════════════════════╝");

  await demoMinimalTools();
  await demoStreamingArchitecture();
  await demoXmlReasoning();
  await demoStatelessResources();
  await demoHooks();
  await demoSkills();
  await demoSubAgentDelegation();

  console.log("\n" + "=".repeat(60));
  console.log("📚 Summary: The Meta-Pattern");
  console.log("=".repeat(60));

  console.log(`
Claude Code's core insight:

  "Complexity should be in the prompts and skills, not in the architecture."

  • Simple tools + rich prompts = emergent capability
  • Few agents + deep specialization = better than many shallow agents
  • Observable state + hooks = debuggable without complexity
  • Streaming + structured output = great UX without coupling

The goal: A single well-equipped agent that can handle 80% of tasks,
with specialized sub-agents for the remaining 20%.
`);

  console.log("Documentation: docs/engineering/CLAUDE_CODE_PATTERNS.md");
  console.log("\n");
}

main().catch(console.error);
