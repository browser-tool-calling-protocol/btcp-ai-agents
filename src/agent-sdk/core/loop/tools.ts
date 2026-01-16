/**
 * Tool Definitions
 *
 * Creates AI SDK tools from generic schema definitions with hooks integration.
 */

import type {
  AgentEvent,
  McpClient,
  ToolSet,
  HooksManager,
  LoopOptions,
} from "./types.js";
import {
  ContextReadInputSchema,
  ContextWriteInputSchema,
  ContextSearchInputSchema,
  TaskExecuteInputSchema,
  StateSnapshotInputSchema,
  AgentDelegateInputSchema,
  AgentPlanInputSchema,
  AgentClarifyInputSchema,
  type ContextReadInput,
  type ContextWriteInput,
  type ContextSearchInput,
  type TaskExecuteInput,
  type StateSnapshotInput,
  type AgentDelegateInput,
  type AgentPlanInput,
  type AgentClarifyInput,
  type AgentToolName,
} from "../../tools/generic-definitions.js";
import {
  createTypedTool,
  type BlockedResult,
} from "../../tools/ai-sdk-bridge.js";
import { createToolExecutor } from "../../tools/executor.js";
import {
  delegateToSubAgent,
  executeSubagentWithMainLoop,
  type SubAgentTask,
  type SubAgentResult,
} from "../delegation.js";

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Execute tool with hooks integration
 * Returns BlockedResult if blocked by pre-hook, otherwise tool result
 */
export async function executeToolWithHooks<TInput>(
  executor: ReturnType<typeof createToolExecutor>,
  hooksManager: HooksManager,
  toolName: AgentToolName,
  input: TInput,
  checkProceed: boolean
): Promise<BlockedResult | unknown> {
  const startTime = Date.now();

  if (checkProceed) {
    const hookResult = await hooksManager.triggerPreExecute(toolName, input);
    if (!hookResult.proceed) {
      return { blocked: true, reason: hookResult.reason, success: false } satisfies BlockedResult;
    }
  } else {
    await hooksManager.triggerPreExecute(toolName, input);
  }

  const result = await executor.execute(
    toolName as Parameters<typeof executor.execute>[0],
    input as Parameters<typeof executor.execute>[1]
  );
  await hooksManager.triggerPostExecute(toolName, result, Date.now() - startTime);
  return result;
}

// ============================================================================
// TOOL FACTORY
// ============================================================================

/**
 * Create AI SDK tools from generic schema definitions
 * Enhanced with hooks integration, proper typing, and whitelist filtering.
 *
 * @param mcpClient - MCP client for communication (optional)
 * @param executor - Tool executor instance
 * @param hooksManager - Hooks manager for pre/post execution
 * @param onDelegateEvent - Callback for delegation events
 * @param enabledTools - If provided, only these tools are included (whitelist)
 * @param parentLoopOptions - Parent loop options for delegation
 */
export function createAgentTools(
  _mcpClient: McpClient | null,
  executor: ReturnType<typeof createToolExecutor>,
  hooksManager: HooksManager,
  onDelegateEvent?: (event: AgentEvent) => void,
  enabledTools?: AgentToolName[],
  parentLoopOptions?: LoopOptions
): ToolSet {
  const allTools: ToolSet = {
    context_read: createTypedTool({
      name: "context_read",
      description: `Read context, memory, or state. Use to understand current state before making changes.
Examples:
- Read session context: { scope: "session" }
- Read specific key: { key: "user_preferences" }
- Read with filter: { scope: "history", filter: { type: "tool_call" } }`,
      parameters: ContextReadInputSchema,
      execute: async (input: ContextReadInput) =>
        executeToolWithHooks(executor, hooksManager, "context_read", input, false),
    }),

    context_write: createTypedTool({
      name: "context_write",
      description: `Write to context or memory. Use for storing state, results, or intermediate data.
Examples:
- Write key-value: { key: "analysis_result", value: { summary: "..." } }
- Append to list: { key: "history", value: { event: "..." }, append: true }`,
      parameters: ContextWriteInputSchema,
      execute: async (input: ContextWriteInput) =>
        executeToolWithHooks(executor, hooksManager, "context_write", input, true),
    }),

    context_search: createTypedTool({
      name: "context_search",
      description: `Search through context by pattern or query.
Examples:
- Search by query: { query: "error messages" }
- Search with filter: { query: "user input", filter: { scope: "session" } }`,
      parameters: ContextSearchInputSchema,
      execute: async (input: ContextSearchInput) =>
        executeToolWithHooks(executor, hooksManager, "context_search", input, false),
    }),

    task_execute: createTypedTool({
      name: "task_execute",
      description: `Execute an action through the registered action adapter. Use for domain-specific operations.
Examples:
- Execute action: { action: "create_item", params: { name: "test", type: "document" } }
- With options: { action: "update_record", params: { id: "123", data: {...} }, options: { validate: true } }`,
      parameters: TaskExecuteInputSchema,
      execute: async (input: TaskExecuteInput) =>
        executeToolWithHooks(executor, hooksManager, "task_execute", input, true),
    }),

    state_snapshot: createTypedTool({
      name: "state_snapshot",
      description: `Capture a state checkpoint for rollback or comparison.
Examples:
- Create snapshot: { name: "before_changes", description: "State before modifications" }
- With metadata: { name: "checkpoint_1", metadata: { step: 1, status: "in_progress" } }`,
      parameters: StateSnapshotInputSchema,
      execute: async (input: StateSnapshotInput) =>
        executeToolWithHooks(executor, hooksManager, "state_snapshot", input, false),
    }),

    agent_delegate: createTypedTool({
      name: "agent_delegate",
      description: `Delegate tasks to specialized sub-agents.

Sub-agents run in ISOLATED context:
- Fresh context (no parent history leaks through)
- Specialized system prompt
- Whitelisted tools
- Returns summary + results

## Available Sub-agents
| Subagent | Capability |
|----------|------------|
| planner-agent | Plans complex tasks, breaks down work |
| explorer-agent | Explores context, discovers patterns |
| executor-agent | Executes tasks through action adapters |
| analyzer-agent | Analyzes data, provides insights |

DELEGATE when: (1) complex multi-step task, (2) task is self-contained, (3) needs specialized approach
DO NOT delegate: simple tasks (1-2 calls), needs user feedback mid-task

Examples:
- Plan task: { agent: "planner-agent", task: "Plan how to reorganize the data structure" }
- Analyze: { agent: "analyzer-agent", task: "Analyze patterns in the current dataset" }
- Execute: { agent: "executor-agent", task: "Execute the planned changes" }`,
      parameters: AgentDelegateInputSchema,
      execute: async (input: AgentDelegateInput) => {
        const startTime = Date.now();
        const delegateInput = {
          subagent: input.agent,
          task: input.task,
          context: input.context,
        } as SubAgentTask;

        // Emit delegating event
        onDelegateEvent?.({
          type: "tool_call",
          tool: "agent_delegate" as any,
          input: delegateInput,
        });

        await hooksManager.triggerPreExecute("agent_delegate", input);

        // Use executeSubagentWithMainLoop for REAL tool execution
        let result: SubAgentResult;
        if (parentLoopOptions) {
          result = await executeSubagentWithMainLoop(delegateInput, parentLoopOptions);
        } else {
          // Fallback to old delegateToSubAgent (text-only, no tools)
          result = await delegateToSubAgent(delegateInput);
        }

        const duration = Date.now() - startTime;
        await hooksManager.triggerPostExecute("agent_delegate", result, duration);

        // Emit delegation complete event with metrics
        onDelegateEvent?.({
          type: "tool_result",
          tool: "agent_delegate" as any,
          result: {
            success: result.success,
            duration,
            tokensUsed: result.tokensUsed,
          },
        });

        return result;
      },
    }),

    agent_plan: createTypedTool({
      name: "agent_plan",
      description: `Create or update an execution plan for complex tasks.
Examples:
- Create plan: { action: "create", goal: "Implement feature X", steps: [{...}] }
- Update step: { action: "update", planId: "plan_123", stepId: "step_1", status: "completed" }
- Get plan: { action: "get", planId: "plan_123" }`,
      parameters: AgentPlanInputSchema,
      execute: async (input: AgentPlanInput) =>
        executeToolWithHooks(executor, hooksManager, "agent_plan", input, false),
    }),

    agent_clarify: createTypedTool({
      name: "agent_clarify",
      description: `Ask the user clarifying questions before proceeding. INTERRUPTS the stream and waits for user response.

USE THIS TOOL WHEN:
- Requirements are unclear or ambiguous
- Multiple valid approaches exist
- You need specific information to proceed

DO NOT USE when:
- Request is already clear
- You can reasonably infer the intent

EFFECT:
- Interrupts current stream
- Shows questions to user
- Waits for user response
- Next message will have clarification in context

Example:
agent_clarify({
  question: "Which approach should I use?",
  options: [
    { label: "Option A", value: "a", description: "Faster but less thorough" },
    { label: "Option B", value: "b", description: "More thorough but slower" }
  ],
  reason: "Multiple valid approaches exist"
})`,
      parameters: AgentClarifyInputSchema,
      execute: async (input: AgentClarifyInput) =>
        executeToolWithHooks(executor, hooksManager, "agent_clarify", input, false),
    }),
  };

  // Whitelist filtering: if enabledTools is provided, only include those tools
  if (enabledTools && enabledTools.length > 0) {
    const filtered: ToolSet = {};
    for (const toolName of enabledTools) {
      if (allTools[toolName]) {
        filtered[toolName] = allTools[toolName];
      }
    }
    return filtered;
  }

  return allTools;
}

// Legacy export for backward compatibility
export const createCanvasTools = createAgentTools;
