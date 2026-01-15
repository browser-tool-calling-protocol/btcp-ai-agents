/**
 * Generic Agent Definitions
 *
 * Domain-agnostic agent definitions for the @btcp/ai-agents system.
 * These agents work with any action adapter backend.
 *
 * Agent Mapping from Canvas Agents:
 * - canvas-agent -> generic-agent
 * - layout-specialist -> planner-agent
 * - style-specialist -> executor-agent
 * - diagram-specialist -> analyzer-agent
 * - mockup-specialist -> explorer-agent
 */

import type { AgentToolName } from '../tools/generic-definitions.js';

/**
 * Generic agent type identifiers
 */
export type GenericAgentType =
  | 'generic-agent'
  | 'planner-agent'
  | 'executor-agent'
  | 'analyzer-agent'
  | 'explorer-agent';

/**
 * Model tier for agent selection
 */
export type ModelTier = 'fast' | 'balanced' | 'powerful';

/**
 * Agent capabilities
 */
export interface GenericAgentCapabilities {
  /** Can write to context/memory */
  canWrite?: boolean;
  /** Can execute actions via adapter */
  canExecute?: boolean;
  /** Can delegate to sub-agents */
  canDelegate?: boolean;
  /** Can request user clarification */
  canClarify?: boolean;
  /** Can create execution plans */
  canPlan?: boolean;
  /** Read-only mode */
  readOnly?: boolean;
}

/**
 * Generic agent definition
 */
export interface GenericAgentDefinition {
  id: GenericAgentType;
  name: string;
  description: string;
  systemPrompt: string;
  allowedTools: AgentToolName[];
  triggers: {
    keywords: string[];
    patterns: RegExp[];
  };
  model: ModelTier;
  maxTokens: number;
  capabilities: GenericAgentCapabilities;
  promptOptions?: {
    includeSecurity?: boolean;
    includeBehavioral?: boolean;
    includeToolDocs?: AgentToolName[];
  };
}

// ============================================================================
// GENERIC AGENT DEFINITIONS
// ============================================================================

/**
 * Generic Agent - Root orchestrator agent
 *
 * The main agent that handles general tasks and coordinates sub-agents.
 */
export const GENERIC_AGENT: GenericAgentDefinition = {
  id: 'generic-agent',
  name: 'Generic Agent',
  description:
    'Root orchestrator agent. Handles general tasks, delegates to specialists for planning, execution, and analysis.',
  systemPrompt: `# Generic Agent

You are a general-purpose AI agent. You can execute tasks, plan actions, and delegate to specialized sub-agents.

## Core Capabilities

1. **Context Management** - Read, write, and search through your context and memory
2. **Task Execution** - Execute discrete actions via the action adapter
3. **Planning** - Break down complex tasks into manageable steps
4. **Delegation** - Delegate specialized work to sub-agents
5. **Clarification** - Ask users for clarification when needed

## Operating Principles

- Be concise and action-oriented
- Verify understanding before executing
- Report progress and results clearly
- Fail gracefully with helpful error messages

## Decision Framework

- Simple task → Execute directly
- Complex task → Create a plan first
- Specialized task → Delegate to appropriate sub-agent
- Unclear task → Clarify with user`,
  allowedTools: [
    'context_read',
    'context_write',
    'context_search',
    'task_execute',
    'state_snapshot',
    'agent_delegate',
    'agent_plan',
    'agent_clarify',
  ],
  triggers: {
    keywords: ['help', 'do', 'execute', 'run', 'perform', 'handle'],
    patterns: [/(?:help|assist) (?:me |us )?(?:with|to)/i],
  },
  model: 'balanced',
  maxTokens: 8192,
  capabilities: {
    canWrite: true,
    canExecute: true,
    canDelegate: true,
    canClarify: true,
    canPlan: true,
  },
  promptOptions: {
    includeSecurity: true,
    includeBehavioral: true,
  },
};

/**
 * Planner Agent - Breaks down complex tasks into steps
 *
 * Specializes in creating execution plans and organizing work.
 */
export const PLANNER_AGENT: GenericAgentDefinition = {
  id: 'planner-agent',
  name: 'Planner Agent',
  description:
    'Breaks down complex tasks into steps. Use for planning, organizing, and structuring work.',
  systemPrompt: `# Planner Agent

You are a planning specialist. Your role is to break down complex tasks into clear, actionable steps.

## Responsibilities

1. Analyze task requirements
2. Identify dependencies and constraints
3. Create step-by-step execution plans
4. Estimate complexity of each step
5. Recommend appropriate agent types for each step

## Planning Principles

- Start with the end goal
- Work backwards to identify required steps
- Keep steps atomic and testable
- Consider parallel execution opportunities
- Include validation checkpoints

## Output Format

Always structure plans as:
1. Goal: Clear statement of the objective
2. Steps: Numbered, actionable items
3. Dependencies: Which steps depend on others
4. Risks: Potential issues to watch for`,
  allowedTools: ['context_read', 'context_search', 'agent_plan', 'agent_clarify'],
  triggers: {
    keywords: ['plan', 'break down', 'steps', 'organize', 'structure', 'how to'],
    patterns: [
      /how (?:should|do) (?:i|we)/i,
      /(?:create|make) (?:a )?plan/i,
      /break (?:this|it) down/i,
    ],
  },
  model: 'balanced',
  maxTokens: 4096,
  capabilities: {
    canPlan: true,
    canClarify: true,
    readOnly: true,
  },
  promptOptions: {
    includeBehavioral: true,
    includeToolDocs: ['context_read', 'context_search', 'agent_plan', 'agent_clarify'],
  },
};

/**
 * Executor Agent - Executes discrete actions
 *
 * Specializes in executing individual actions efficiently.
 */
export const EXECUTOR_AGENT: GenericAgentDefinition = {
  id: 'executor-agent',
  name: 'Executor Agent',
  description: 'Executes discrete actions. Use for running specific operations and tasks.',
  systemPrompt: `# Executor Agent

You are an execution specialist. Your role is to execute discrete actions efficiently and reliably.

## Responsibilities

1. Execute actions through the action adapter
2. Handle errors gracefully
3. Report results clearly
4. Create state snapshots when appropriate

## Execution Principles

- Verify prerequisites before execution
- Execute one action at a time
- Check results before proceeding
- Handle errors with appropriate fallbacks
- Report both success and failure clearly

## Error Handling

When an action fails:
1. Log the error details
2. Assess if retry is appropriate
3. Attempt recovery if possible
4. Report failure with context`,
  allowedTools: ['context_read', 'context_write', 'task_execute', 'state_snapshot'],
  triggers: {
    keywords: ['execute', 'run', 'do', 'perform', 'action'],
    patterns: [/(?:execute|run|perform) (?:the )?(?:action|task)/i],
  },
  model: 'fast',
  maxTokens: 2048,
  capabilities: {
    canWrite: true,
    canExecute: true,
  },
  promptOptions: {
    includeBehavioral: true,
    includeToolDocs: ['context_read', 'context_write', 'task_execute', 'state_snapshot'],
  },
};

/**
 * Analyzer Agent - Analyzes context and finds patterns
 *
 * Specializes in searching, analyzing, and understanding context.
 */
export const ANALYZER_AGENT: GenericAgentDefinition = {
  id: 'analyzer-agent',
  name: 'Analyzer Agent',
  description:
    'Analyzes context and finds patterns. Use for searching, understanding, and investigating.',
  systemPrompt: `# Analyzer Agent

You are an analysis specialist. Your role is to search, analyze, and understand context.

## Responsibilities

1. Search through context and history
2. Find relevant information
3. Identify patterns and relationships
4. Summarize findings clearly

## Analysis Principles

- Be thorough in searching
- Consider multiple perspectives
- Look for patterns and anomalies
- Present findings with evidence
- Distinguish facts from inferences

## Output Format

Structure analysis results as:
1. Query: What was searched for
2. Findings: Key discoveries
3. Patterns: Recurring themes
4. Recommendations: Suggested actions`,
  allowedTools: ['context_read', 'context_search'],
  triggers: {
    keywords: ['analyze', 'find', 'search', 'look for', 'investigate', 'understand'],
    patterns: [/what (?:is|are)/i, /why (?:is|did|does)/i, /find (?:all|any|the)/i],
  },
  model: 'balanced',
  maxTokens: 4096,
  capabilities: {
    readOnly: true,
  },
  promptOptions: {
    includeBehavioral: true,
    includeToolDocs: ['context_read', 'context_search'],
  },
};

/**
 * Explorer Agent - Explores and gathers information
 *
 * Specializes in exploring context and gathering comprehensive information.
 */
export const EXPLORER_AGENT: GenericAgentDefinition = {
  id: 'explorer-agent',
  name: 'Explorer Agent',
  description:
    'Explores and gathers information. Use for broad exploration and information gathering.',
  systemPrompt: `# Explorer Agent

You are an exploration specialist. Your role is to broadly explore context and gather comprehensive information.

## Responsibilities

1. Explore context thoroughly
2. Gather related information
3. Map relationships
4. Report discoveries

## Exploration Principles

- Cast a wide net initially
- Follow interesting leads
- Document everything found
- Organize findings logically
- Highlight unexpected discoveries

## Output Format

Structure exploration results as:
1. Scope: What was explored
2. Map: Overview of the territory
3. Discoveries: Notable findings
4. Connections: Relationships found
5. Questions: Areas needing further exploration`,
  allowedTools: ['context_read', 'context_search', 'state_snapshot'],
  triggers: {
    keywords: ['explore', 'discover', 'map', 'survey', 'overview'],
    patterns: [/(?:explore|survey|map) (?:the|this)/i, /give (?:me )?(?:an )?overview/i],
  },
  model: 'balanced',
  maxTokens: 4096,
  capabilities: {
    readOnly: true,
  },
  promptOptions: {
    includeBehavioral: true,
    includeToolDocs: ['context_read', 'context_search', 'state_snapshot'],
  },
};

// ============================================================================
// AGENT REGISTRY
// ============================================================================

/**
 * All generic agent definitions
 */
export const GENERIC_AGENTS: Record<GenericAgentType, GenericAgentDefinition> = {
  'generic-agent': GENERIC_AGENT,
  'planner-agent': PLANNER_AGENT,
  'executor-agent': EXECUTOR_AGENT,
  'analyzer-agent': ANALYZER_AGENT,
  'explorer-agent': EXPLORER_AGENT,
};

/**
 * Get generic agent definition by type
 */
export function getGenericAgent(type: GenericAgentType): GenericAgentDefinition {
  return GENERIC_AGENTS[type];
}

/**
 * Detect which generic agent should handle a prompt
 */
export function detectGenericAgent(prompt: string): GenericAgentType {
  const lower = prompt.toLowerCase();

  // Check specialists first (more specific)
  const specialists: GenericAgentType[] = [
    'planner-agent',
    'analyzer-agent',
    'explorer-agent',
    'executor-agent',
  ];

  for (const type of specialists) {
    const def = GENERIC_AGENTS[type];

    // Check patterns first (more specific)
    for (const pattern of def.triggers.patterns) {
      if (pattern.test(prompt)) {
        return type;
      }
    }

    // Then check keywords
    for (const keyword of def.triggers.keywords) {
      if (lower.includes(keyword)) {
        return type;
      }
    }
  }

  // Default to root generic agent
  return 'generic-agent';
}

/**
 * Get all specialist generic agent types
 */
export function getGenericSpecialistTypes(): GenericAgentType[] {
  return ['planner-agent', 'executor-agent', 'analyzer-agent', 'explorer-agent'];
}

/**
 * Get tools allowed for a generic agent
 */
export function getGenericAgentTools(type: GenericAgentType): AgentToolName[] {
  return GENERIC_AGENTS[type].allowedTools;
}

/**
 * Map canvas agent types to generic agent types
 */
export const CANVAS_TO_GENERIC_AGENT_MAP: Record<string, GenericAgentType> = {
  'canvas-agent': 'generic-agent',
  'layout-specialist': 'planner-agent',
  'style-specialist': 'executor-agent',
  'diagram-specialist': 'analyzer-agent',
  'mockup-specialist': 'explorer-agent',
};

/**
 * Map generic agent types to canvas agent types
 */
export const GENERIC_TO_CANVAS_AGENT_MAP: Record<GenericAgentType, string> = {
  'generic-agent': 'canvas-agent',
  'planner-agent': 'layout-specialist',
  'executor-agent': 'style-specialist',
  'analyzer-agent': 'diagram-specialist',
  'explorer-agent': 'mockup-specialist',
};
