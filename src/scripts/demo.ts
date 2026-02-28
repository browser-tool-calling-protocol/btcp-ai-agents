/**
 * Agent Framework Patterns Demo
 *
 * Demonstrates the 7 patterns implementation for AI agents.
 *
 * Run: pnpm patterns:demo
 */

import {
  // Agent types
  createCancellationToken,
  type AgentConfig,
  // Prompts (Pattern 3: XML Reasoning)
  detectAgentMode,
} from "../agent-sdk/agents/index.js";

import {
  // Resources (Pattern 4: Stateless)
  createResources,
  getResourcesSummary,
} from "../agent-sdk/agents/state.js";

import {
  // Skills (Pattern 6: Compressed Context)
  getMatchingSkills,
  injectRelevantSkills,
} from "../agent-sdk/skills/index.js";

import {
  // Tools (Pattern 1: Minimal Tools)
  AGENT_TOOL_NAMES,
} from "../agent-sdk/tools/generic-definitions.js";

// Demo configuration
const SESSION_ID = "demo-session";
const DEMO_TASKS = [
  "Analyze the current page structure",
  "Fill in the registration form",
  "Click the submit button and verify",
  "Search for error messages",
  "Create a plan for multi-step workflow",
];

/**
 * Demo: Pattern 1 - Minimal Tools
 */
async function demoMinimalTools(): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("Pattern 1: Minimal Tools, Maximum Composability");
  console.log("=".repeat(60));

  console.log(`\nCore tools (${AGENT_TOOL_NAMES.length} generic tools):`);
  const descriptions: Record<string, string> = {
    context_read: "Read context/state data (like Read)",
    context_write: "Write/update context (like Write)",
    context_search: "Search through context (like Grep)",
    task_execute: "Execute domain actions via adapter (like Edit)",
    state_snapshot: "Capture state checkpoint (like snapshot)",
    agent_delegate: "Spawn sub-agent (like Task)",
    agent_plan: "Create execution plan",
    agent_clarify: "Request user clarification",
  };
  for (const tool of AGENT_TOOL_NAMES) {
    console.log(`  - ${tool}: ${descriptions[tool] || tool}`);
  }
}

/**
 * Demo: Pattern 2 - Streaming Architecture
 */
async function demoStreamingArchitecture(): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("Pattern 2: Streaming-First Architecture");
  console.log("=".repeat(60));

  console.log("\n1. Streaming consumption (real-time events):");
  console.log("   for await (const event of session.run(task)) { ... }");

  console.log("\n2. Simple consumption (result only):");
  console.log("   const result = await session.execute(task);");

  console.log("\n3. One-shot (auto session lifecycle):");
  console.log("   const result = await runTask(task, adapter);");

  // Demo cancellation token
  const token = createCancellationToken();
  console.log("\n4. Cancellation support:");
  console.log("   const token = createCancellationToken();");
  console.log("   token.cancel('User requested'); // Graceful cancellation");
}

/**
 * Demo: Pattern 3 - XML Reasoning Structure
 */
async function demoXmlReasoning(): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("Pattern 3: Explicit Reasoning Structure (XML Tags)");
  console.log("=".repeat(60));

  const task = "Create a plan for the registration flow";
  const mode = detectAgentMode(task);

  console.log(`\nTask: "${task}"`);
  console.log(`Detected mode: ${mode}`);

  console.log("\nReasoning structure in prompts:");
  console.log(`
<analyze>
  - What is the user asking for?
  - What is the current state?
  - What constraints apply?
</analyze>

<plan>
  - List operations in execution order
  - Identify dependencies between operations
</plan>

<execute>
  - Run context_read to understand state
  - Run task_execute for each operation
  - Verify each operation succeeded
</execute>

<summarize>
  - What was accomplished?
  - Any issues encountered?
</summarize>
`);
}

/**
 * Demo: Pattern 4 - Stateless Resources
 */
async function demoStatelessResources(): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("Pattern 4: Stateless Systems, Observable State");
  console.log("=".repeat(60));

  const resources = createResources(SESSION_ID);

  console.log("\nAll state lives in resources (serializable, inspectable):");
  console.log(`\n${getResourcesSummary(resources)}`);

  console.log("\nResource structure:");
  console.log(`
  AgentResources {
    browser: { id, version, availableTools, summary, viewport }
    task: { id, status, currentStep, checkpoint, errors }
    context: { tokenBudget, tokensUsed, strategies, skills }
    history: { operations[], maxEntries }
  }
`);

  console.log("Benefits:");
  console.log("  - State is always inspectable (debugging)");
  console.log("  - State is always serializable (checkpointing)");
  console.log("  - No hidden coupling between components");
  console.log("  - Easy to test (inject mock resources)");
}

/**
 * Demo: Pattern 6 - Skills as Compressed Context
 */
async function demoSkills(): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("Pattern 6: Skills as Compressed Context");
  console.log("=".repeat(60));

  console.log("\nAvailable skills:");
  for (const task of DEMO_TASKS) {
    const skills = getMatchingSkills(task);
    const skillNames = skills.map((s) => s.name).join(", ");
    console.log(`  "${task.slice(0, 40)}..."`);
    console.log(`    -> Skills: ${skillNames || "general"}`);
  }

  console.log("\nSkill injection example:");
  const basePrompt = "You are a helpful AI agent.";
  const task = "Analyze the database schema";
  const injected = injectRelevantSkills(task, basePrompt);
  console.log(`  Base prompt: ${basePrompt.length} chars`);
  console.log(`  With skills: ${injected.length} chars`);
  console.log(`  Knowledge expansion: ${(injected.length / basePrompt.length).toFixed(1)}x`);

  console.log("\nBenefit: 150 tokens of trigger -> 10,000 tokens of expertise");
}

/**
 * Main demo runner
 */
async function main(): Promise<void> {
  console.log("\n");
  console.log("================================================================");
  console.log("    BTCP AI Agents - Framework Patterns Demo");
  console.log("    @btcp/ai-agents");
  console.log("================================================================");

  await demoMinimalTools();
  await demoStreamingArchitecture();
  await demoXmlReasoning();
  await demoStatelessResources();
  await demoSkills();

  console.log("\n" + "=".repeat(60));
  console.log("Summary: The Meta-Pattern");
  console.log("=".repeat(60));

  console.log(`
Core insight:

  "Complexity should be in the prompts and skills, not in the architecture."

  - Simple tools + rich prompts = emergent capability
  - Few agents + deep specialization = better than many shallow agents
  - Observable state + hooks = debuggable without complexity
  - Streaming + structured output = great UX without coupling

The goal: A single well-equipped agent that can handle 80% of tasks,
with specialized sub-agents for the remaining 20%.
`);

  console.log("Documentation: docs/ARCHITECTURE.md");
  console.log("\n");
}

main().catch(console.error);
