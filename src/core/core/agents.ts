/**
 * SDK Agent Definitions
 *
 * Agent configurations compatible with Claude Agent SDK's agents option.
 * Defines specialized sub-agents for Task delegation.
 */

import type { ModelId } from "./options.js";
import type { GenericAgentType } from "../agents/generic-definitions.js";

// ============================================================================
// AGENT DEFINITION TYPES
// ============================================================================

/**
 * Agent definition for Task delegation
 */
export interface AgentDefinition {
  /** Human-readable description */
  description: string;
  /** Tools available to this agent */
  tools?: string[];
  /** System prompt for the agent */
  prompt?: string;
  /** Model to use (overrides default) */
  model?: ModelId;
  /** Maximum turns for this agent */
  maxTurns?: number;
  /** Maximum tokens for this agent */
  maxTokens?: number;
}

/**
 * Agents configuration option
 */
export type AgentsOption = Record<string, AgentDefinition>;

// ============================================================================
// SYSTEM PROMPTS
// ============================================================================

/**
 * Planning agent system prompt
 */
export const PLANNING_PROMPT = `# Planning Agent

You design implementation plans. PLANNING-ONLY.

## Constraints

STRICTLY PROHIBITED:
- Executing modifications directly
- Calling action adapters

PERMITTED:
- context_read
- context_search

## Required Output

### 1. Task Breakdown
Numbered steps with:
- Clear action
- Dependencies
- Estimated complexity

### 2. Recommendation
- Agent: [executor|analyzer|explorer]
- Complexity: [simple|medium|complex]
- Approach: brief description`;

/**
 * Exploring agent system prompt
 */
export const EXPLORING_PROMPT = `# Explorer Agent

You analyze context and data. READ-ONLY.

## Constraints

STRICTLY PROHIBITED:
- context_write
- task_execute
- agent_delegate
- Any modifications

PERMITTED:
- context_read
- context_search

## Output

- Data structure analysis
- Patterns identified
- Issues found
- Recommendations

If asked to modify: "I'm read-only. I can analyze but not change."`;

/**
 * Executor agent system prompt
 */
export const EXECUTOR_PROMPT = `# Executor Agent

You execute planned tasks through action adapters.

## Tools
- task_execute → Execute actions
- context_read → Read current state
- context_write → Update state

## Workflow
1. Receive task specification
2. Execute via task_execute
3. Verify with context_read
4. Update state if needed

## Response
Execution summary with results.`;

/**
 * Analyzer agent system prompt
 */
export const ANALYZER_PROMPT = `# Analyzer Agent

You analyze data and provide insights. READ-ONLY.

## Constraints

STRICTLY PROHIBITED:
- task_execute
- context_write
- Any modifications

PERMITTED:
- context_read
- context_search

## Output

- Data analysis
- Pattern identification
- Anomaly detection
- Recommendations

Report findings only. Do not execute changes.`;

// ============================================================================
// DEFAULT GENERIC AGENTS
// ============================================================================

/**
 * Default generic agents configuration
 */
export const GENERIC_AGENTS: AgentsOption = {
  "planner-agent": {
    description: "Plans tasks and breaks down complex work",
    tools: ["context_read", "context_search", "agent_plan"],
    prompt: PLANNING_PROMPT,
    maxTurns: 5,
    maxTokens: 4000,
  },

  "explorer-agent": {
    description: "Explores and discovers context and data",
    tools: ["context_read", "context_search", "state_snapshot"],
    prompt: EXPLORING_PROMPT,
    maxTurns: 5,
    maxTokens: 3000,
  },

  "executor-agent": {
    description: "Executes tasks through action adapters",
    tools: ["task_execute", "context_read", "context_write"],
    prompt: EXECUTOR_PROMPT,
    maxTurns: 10,
    maxTokens: 3000,
  },

  "analyzer-agent": {
    description: "Analyzes data and provides insights",
    tools: ["context_read", "context_search"],
    prompt: ANALYZER_PROMPT,
    maxTurns: 5,
    maxTokens: 3000,
  },
};

// ============================================================================
// AGENT UTILITIES
// ============================================================================

/**
 * Get agent definition by type
 */
export function getAgentDefinition(type: string): AgentDefinition | undefined {
  return GENERIC_AGENTS[type];
}

/**
 * List all available agent types
 */
export function listAgentTypes(): string[] {
  return Object.keys(GENERIC_AGENTS);
}

/**
 * Check if agent type exists
 */
export function isValidAgentType(type: string): boolean {
  return type in GENERIC_AGENTS;
}

/**
 * Get tools for an agent
 */
export function getAgentTools(type: string): string[] {
  return GENERIC_AGENTS[type]?.tools || [];
}

/**
 * Get prompt for an agent
 */
export function getAgentPrompt(type: string): string | undefined {
  return GENERIC_AGENTS[type]?.prompt;
}

// ============================================================================
// AGENT DETECTION
// ============================================================================

/**
 * Keyword patterns for agent detection
 */
const AGENT_PATTERNS: Record<GenericAgentType, RegExp> = {
  "generic-agent": /help|assist|do|perform/i,
  "planner-agent": /plan|break down|steps|strategy|how to|approach/i,
  "explorer-agent": /explore|discover|find|search|what|check|review/i,
  "executor-agent": /execute|implement|build|create|run|do/i,
  "analyzer-agent": /analyze|inspect|examine|report|summarize/i,
};

/**
 * Detect which agent should handle a task
 */
export function detectAgentType(task: string): GenericAgentType | null {
  const lower = task.toLowerCase();

  // Check patterns in priority order
  const priorityOrder: GenericAgentType[] = [
    "planner-agent",
    "explorer-agent",
    "analyzer-agent",
    "executor-agent",
    "generic-agent",
  ];

  for (const agentType of priorityOrder) {
    if (AGENT_PATTERNS[agentType].test(lower)) {
      return agentType;
    }
  }

  return null;
}

/**
 * Get confidence score for agent type
 */
export function getAgentConfidence(task: string, agentType: GenericAgentType): number {
  const pattern = AGENT_PATTERNS[agentType];
  const matches = task.match(pattern);
  if (!matches) return 0;

  // Base score
  let score = 0.5;

  // Multiple keyword matches increase confidence
  const keywords = pattern.source.split("|");
  let matchCount = 0;
  for (const keyword of keywords) {
    if (new RegExp(keyword, "i").test(task)) {
      matchCount++;
    }
  }
  score += Math.min(matchCount * 0.1, 0.3);

  // Task length affects confidence
  const wordCount = task.split(/\s+/).length;
  if (wordCount > 5 && wordCount < 30) {
    score += 0.1;
  }

  return Math.min(score, 1);
}

// ============================================================================
// AGENT MERGING
// ============================================================================

/**
 * Merge custom agents with defaults
 */
export function mergeAgents(
  custom: AgentsOption = {},
  defaults: AgentsOption = GENERIC_AGENTS
): AgentsOption {
  const merged: AgentsOption = { ...defaults };

  for (const [name, definition] of Object.entries(custom)) {
    if (name in merged) {
      // Merge with existing
      merged[name] = {
        ...merged[name],
        ...definition,
        tools: definition.tools || merged[name].tools,
      };
    } else {
      // Add new agent
      merged[name] = definition;
    }
  }

  return merged;
}

// ============================================================================
// AGENT EXPORTS FOR SETTINGS
// ============================================================================

/**
 * Export agents for Claude Code settings format
 */
export function exportAgentsForSettings(): Record<string, { description: string; tools: string[] }> {
  const exported: Record<string, { description: string; tools: string[] }> = {};

  for (const [name, definition] of Object.entries(GENERIC_AGENTS)) {
    exported[name] = {
      description: definition.description,
      tools: definition.tools || [],
    };
  }

  return exported;
}
