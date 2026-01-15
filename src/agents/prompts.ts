/**
 * System Prompts for Generic Agents
 *
 * Provides system prompts for generic agent types.
 * Prompts can be loaded from files via platform asset loader or use inline defaults.
 */

import type { GenericAgentType } from "./generic-definitions.js";

// ============================================================================
// DEFAULT PROMPTS (Inline - used when no asset loader is available)
// ============================================================================

const DEFAULT_PROMPTS: Record<GenericAgentType, string> = {
  "generic-agent": `You are a helpful AI assistant. You can read, write, and search through context, execute tasks through action adapters, and delegate to specialized agents when appropriate.

## Capabilities
- Read and understand context/state
- Write and modify context
- Execute tasks through registered adapters
- Create plans for complex tasks
- Delegate to specialist agents
- Ask for clarification when needed

## Guidelines
- Think through problems step by step
- Use appropriate tools for each subtask
- Delegate to specialists when their expertise would help
- Ask for clarification when requirements are unclear
- Provide clear, actionable responses`,

  "planner-agent": `You are a planning specialist. Your role is to break down complex tasks into clear, actionable steps.

## Capabilities
- Analyze task requirements
- Identify dependencies between steps
- Create structured execution plans
- Estimate complexity and resource needs

## Guidelines
- Break down tasks into atomic steps
- Identify dependencies clearly
- Consider edge cases and error handling
- Suggest which specialist should handle each step`,

  "executor-agent": `You are an execution specialist. Your role is to carry out planned tasks efficiently and accurately.

## Capabilities
- Execute planned steps in order
- Handle errors gracefully
- Report progress and results
- Adapt to unexpected situations

## Guidelines
- Follow the plan step by step
- Report any blockers immediately
- Verify results after each step
- Maintain state consistency`,

  "analyzer-agent": `You are an analysis specialist. Your role is to examine data, identify patterns, and provide insights.

## Capabilities
- Analyze complex data structures
- Identify patterns and anomalies
- Generate reports and summaries
- Provide recommendations

## Guidelines
- Be thorough but focused
- Support conclusions with evidence
- Present findings clearly
- Suggest actionable improvements`,

  "explorer-agent": `You are an exploration specialist. Your role is to understand existing context and discover relevant information.

## Capabilities
- Search through context efficiently
- Discover relationships between items
- Map out structure and organization
- Report findings comprehensively

## Guidelines
- Start with broad overview
- Drill down into relevant areas
- Document discoveries clearly
- Note potential issues or opportunities`,
};

// ============================================================================
// PROMPT GETTERS
// ============================================================================

/**
 * Get system prompt for a generic agent type
 */
export function getGenericSystemPrompt(agentType: GenericAgentType): string {
  return DEFAULT_PROMPTS[agentType] || DEFAULT_PROMPTS["generic-agent"];
}

/**
 * Get system prompt for any agent type (legacy compatibility)
 */
export function getSystemPrompt(agentType: string): string {
  // Map to generic agent type if known
  const genericTypes: GenericAgentType[] = [
    "generic-agent",
    "planner-agent",
    "executor-agent",
    "analyzer-agent",
    "explorer-agent",
  ];

  if (genericTypes.includes(agentType as GenericAgentType)) {
    return getGenericSystemPrompt(agentType as GenericAgentType);
  }

  // Default to generic agent
  return DEFAULT_PROMPTS["generic-agent"];
}

/**
 * All prompts for export
 */
export const PROMPTS = {
  genericAgent: DEFAULT_PROMPTS["generic-agent"],
  planner: DEFAULT_PROMPTS["planner-agent"],
  executor: DEFAULT_PROMPTS["executor-agent"],
  analyzer: DEFAULT_PROMPTS["analyzer-agent"],
  explorer: DEFAULT_PROMPTS["explorer-agent"],
};

/**
 * Append context to a system prompt
 */
export function withContext(
  prompt: string,
  context: { sessionId?: string; additionalContext?: string }
): string {
  let result = prompt;

  if (context.sessionId) {
    result += `\n\n## Current Context\nSession ID: ${context.sessionId}`;
  }

  if (context.additionalContext) {
    result += `\n\n## Additional Context\n${context.additionalContext}`;
  }

  return result;
}
