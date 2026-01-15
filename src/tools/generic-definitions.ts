/**
 * Generic Agent Tool Definitions
 *
 * Defines the core generic tools for the @btcp/ai-agents system.
 * These tools are domain-agnostic and work with any action adapter backend.
 *
 * Tool Mapping from Canvas Tools:
 * - canvas_read   -> context_read
 * - canvas_write  -> context_write
 * - canvas_edit   -> task_execute
 * - canvas_find   -> context_search
 * - canvas_capture -> state_snapshot
 * - canvas_delegate -> agent_delegate
 * - canvas_plan   -> agent_plan
 * - canvas_clarify -> agent_clarify
 */

import { z } from 'zod';

/**
 * Supported generic agent tools
 */
export const AGENT_TOOL_NAMES = [
  'context_read',
  'context_write',
  'context_search',
  'task_execute',
  'state_snapshot',
  'agent_delegate',
  'agent_plan',
  'agent_clarify',
] as const;

export type AgentToolName = (typeof AGENT_TOOL_NAMES)[number];

/**
 * Generic agent tool interface
 */
export interface AgentTool {
  name: AgentToolName;
  description: string;
  inputSchema: unknown;
  execute?: (input: unknown, context: unknown) => Promise<unknown>;
}

// ============================================================================
// CONTEXT TOOLS
// ============================================================================

/**
 * context_read - Read from agent context/memory
 *
 * Use for:
 * - Reading current context state
 * - Accessing memory/history
 * - Getting conversation context
 * - Reading structured data
 */
export const ContextReadInputSchema = z.object({
  /** Target to read */
  target: z
    .union([
      z.literal('context').describe('Current agent context'),
      z.literal('memory').describe('Persistent memory'),
      z.literal('history').describe('Conversation history'),
      z.literal('state').describe('Current state snapshot'),
      z.string().describe('Custom target key'),
    ])
    .default('context')
    .describe('What to read: context, memory, history, state, or custom key'),

  /** Output format */
  format: z
    .enum(['json', 'summary', 'tree', 'text'])
    .default('json')
    .describe('Output format'),

  /** Depth limit for nested structures */
  depth: z
    .number()
    .default(3)
    .describe('Depth limit for nested data (default: 3)'),

  /** Filter by keys */
  keys: z
    .array(z.string())
    .optional()
    .describe('Specific keys to retrieve'),
});

export type ContextReadInput = z.infer<typeof ContextReadInputSchema>;

/**
 * context_write - Write to agent context/memory
 *
 * Use for:
 * - Updating context state
 * - Storing information in memory
 * - Setting variables
 * - Persisting data
 */
export const ContextWriteInputSchema = z.object({
  /** Target to write to */
  target: z
    .enum(['memory', 'context', 'state'])
    .default('context')
    .describe('Where to write: memory, context, or state'),

  /** Data to write */
  data: z.unknown().describe('Data to store'),

  /** Key to write under (for key-value storage) */
  key: z.string().optional().describe('Key for the data'),

  /** Merge with existing data instead of replacing */
  merge: z
    .boolean()
    .default(true)
    .describe('Merge with existing data (default: true)'),

  /** Time-to-live in seconds (for expiring data) */
  ttl: z.number().optional().describe('TTL in seconds for expiring data'),
});

export type ContextWriteInput = z.infer<typeof ContextWriteInputSchema>;

/**
 * context_search - Search through context/history
 *
 * Use for:
 * - Finding information in context
 * - Searching conversation history
 * - Pattern matching across memory
 * - Retrieving relevant data
 */
export const ContextSearchInputSchema = z.object({
  /** Search query */
  query: z.string().describe('Search query (supports patterns)'),

  /** Target to search */
  target: z
    .enum(['all', 'context', 'memory', 'history'])
    .default('all')
    .describe('Where to search'),

  /** Result limit */
  limit: z.number().default(10).describe('Maximum results to return'),

  /** Search options */
  options: z
    .object({
      /** Case-insensitive search */
      ignoreCase: z.boolean().optional().default(true),
      /** Use regex pattern */
      regex: z.boolean().optional().default(false),
      /** Include metadata in results */
      includeMetadata: z.boolean().optional().default(false),
    })
    .optional(),
});

export type ContextSearchInput = z.infer<typeof ContextSearchInputSchema>;

// ============================================================================
// TASK TOOLS
// ============================================================================

/**
 * task_execute - Execute action via adapter
 *
 * Use for:
 * - Executing domain-specific actions
 * - Running operations through the action adapter
 * - Performing side effects
 * - Interacting with external systems
 */
export const TaskExecuteInputSchema = z.object({
  /** Action identifier */
  action: z.string().describe('Action to execute'),

  /** Action parameters */
  params: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('Parameters for the action'),

  /** Adapter to use (uses default if not specified) */
  adapter: z.string().optional().describe('Specific adapter to use'),

  /** Execute asynchronously */
  async: z
    .boolean()
    .default(false)
    .describe('Execute without waiting for result'),

  /** Execution options */
  options: z
    .object({
      /** Timeout in milliseconds */
      timeout: z.number().optional().describe('Timeout in ms'),
      /** Retry on failure */
      retries: z.number().optional().describe('Number of retries'),
      /** Rollback on failure */
      rollbackOnFailure: z.boolean().optional().default(false),
    })
    .optional(),
});

export type TaskExecuteInput = z.infer<typeof TaskExecuteInputSchema>;

// ============================================================================
// STATE TOOLS
// ============================================================================

/**
 * state_snapshot - Capture current state checkpoint
 *
 * Use for:
 * - Creating restore points
 * - Capturing state for debugging
 * - Recording milestones
 * - Enabling undo/rollback
 */
export const StateSnapshotInputSchema = z.object({
  /** Label for the snapshot */
  label: z.string().optional().describe('Human-readable label'),

  /** Include memory in snapshot */
  includeMemory: z
    .boolean()
    .default(true)
    .describe('Include memory in snapshot'),

  /** Include conversation history */
  includeHistory: z
    .boolean()
    .default(false)
    .describe('Include conversation history'),

  /** Custom metadata to attach */
  metadata: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('Additional metadata'),

  /** Snapshot options */
  options: z
    .object({
      /** Compress the snapshot */
      compress: z.boolean().optional().default(false),
      /** Create persistent snapshot */
      persistent: z.boolean().optional().default(false),
    })
    .optional(),
});

export type StateSnapshotInput = z.infer<typeof StateSnapshotInputSchema>;

// ============================================================================
// AGENT TOOLS
// ============================================================================

/**
 * agent_delegate - Delegate to sub-agent
 *
 * Use for:
 * - Complex tasks requiring specialized expertise
 * - Operations that need focused context
 * - Parallel execution of independent tasks
 * - Specialized processing
 */
export const AgentDelegateInputSchema = z.object({
  /** Type of agent to delegate to */
  agentType: z
    .string()
    .describe('Agent type to delegate to (e.g., planner, executor, analyzer)'),

  /** Task description for the sub-agent */
  task: z.string().describe('Task description for the sub-agent'),

  /** Context to pass to sub-agent */
  context: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('Additional context for the sub-agent'),

  /** Wait for the sub-agent to complete */
  waitForResult: z
    .boolean()
    .default(true)
    .describe('Wait for completion (default: true)'),

  /** Delegation options */
  options: z
    .object({
      /** Maximum turns for sub-agent */
      maxTurns: z.number().optional(),
      /** Timeout in milliseconds */
      timeout: z.number().optional(),
      /** Skills to load for sub-agent */
      skills: z.array(z.string()).optional(),
    })
    .optional(),
});

export type AgentDelegateInput = z.infer<typeof AgentDelegateInputSchema>;

/**
 * agent_plan - Create/update execution plan
 *
 * Use for:
 * - Breaking down complex tasks
 * - Creating step-by-step plans
 * - Organizing work
 * - Coordinating multi-step operations
 */
export const AgentPlanInputSchema = z.object({
  /** Goal to achieve */
  goal: z.string().describe('The goal of this plan'),

  /** Plan steps */
  steps: z.array(
    z.object({
      /** Step identifier */
      id: z.string(),
      /** Step description */
      description: z.string(),
      /** Dependencies on other steps */
      dependencies: z.array(z.string()).optional(),
      /** Estimated complexity */
      complexity: z.enum(['simple', 'medium', 'complex']).optional(),
      /** Agent type to execute this step */
      agentType: z.string().optional(),
    })
  ),

  /** Plan mode */
  mode: z
    .enum(['create', 'update', 'append'])
    .default('create')
    .describe('create: new plan, update: modify existing, append: add steps'),

  /** Plan metadata */
  metadata: z
    .object({
      /** Plan priority */
      priority: z.enum(['low', 'medium', 'high']).optional(),
      /** Deadline */
      deadline: z.string().optional(),
      /** Tags */
      tags: z.array(z.string()).optional(),
    })
    .optional(),
});

export type AgentPlanInput = z.infer<typeof AgentPlanInputSchema>;

/**
 * agent_clarify - Request user clarification
 *
 * Use for:
 * - Getting user input on ambiguous tasks
 * - Presenting options to the user
 * - Confirming actions before execution
 * - Gathering additional information
 */
export const AgentClarifyInputSchema = z.object({
  /** Question to ask the user */
  question: z.string().describe('Question for the user'),

  /** Predefined options (if applicable) */
  options: z
    .array(z.string())
    .optional()
    .describe('Available options for the user to choose'),

  /** Additional context to provide */
  context: z
    .string()
    .optional()
    .describe('Background context for the question'),

  /** Clarification type */
  type: z
    .enum(['question', 'choice', 'confirm', 'input'])
    .default('question')
    .describe('Type of clarification needed'),

  /** Allow free-form response */
  allowFreeform: z
    .boolean()
    .default(true)
    .describe('Allow user to provide free-form response'),
});

export type AgentClarifyInput = z.infer<typeof AgentClarifyInputSchema>;

// ============================================================================
// TOOL UTILITIES
// ============================================================================

/**
 * Tool result type (same as canvas tools for compatibility)
 */
export interface GenericToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    recoverable: boolean;
  };
  metadata?: {
    duration: number;
    tokensUsed?: number;
    itemsAffected?: number;
  };
}

/**
 * Generic tool context
 */
export interface GenericToolContext {
  sessionId: string;
  agentId?: string;
  memory: Record<string, unknown>;
  history: unknown[];
  adapters: {
    getDefault: () => { execute: (action: string, params: Record<string, unknown>) => Promise<unknown> };
    get: (name: string) => { execute: (action: string, params: Record<string, unknown>) => Promise<unknown> } | undefined;
  };
  onClarify?: (question: string, options?: string[]) => Promise<string>;
}

/**
 * Generic tool definition
 */
export interface GenericToolDefinition<TInput, TOutput> {
  name: AgentToolName;
  description: string;
  inputSchema: z.ZodType<TInput>;
  execute: (input: TInput, context: GenericToolContext) => Promise<GenericToolResult<TOutput>>;
}

/**
 * Tool schemas for AI SDK format
 */
export const GENERIC_TOOL_SCHEMAS = {
  context_read: {
    name: 'context_read' as const,
    description:
      'Read from agent context, memory, or history. Use to access stored information and state.',
    inputSchema: ContextReadInputSchema,
  },
  context_write: {
    name: 'context_write' as const,
    description:
      'Write to agent context or memory. Use to store information for later retrieval.',
    inputSchema: ContextWriteInputSchema,
  },
  context_search: {
    name: 'context_search' as const,
    description:
      'Search through context, memory, and history. Use to find relevant information.',
    inputSchema: ContextSearchInputSchema,
  },
  task_execute: {
    name: 'task_execute' as const,
    description:
      'Execute an action through the action adapter. Use for domain-specific operations.',
    inputSchema: TaskExecuteInputSchema,
  },
  state_snapshot: {
    name: 'state_snapshot' as const,
    description:
      'Capture a snapshot of current state. Use to create checkpoints for rollback or debugging.',
    inputSchema: StateSnapshotInputSchema,
  },
  agent_delegate: {
    name: 'agent_delegate' as const,
    description:
      'Delegate a task to a specialized sub-agent. Use for complex tasks requiring focused expertise.',
    inputSchema: AgentDelegateInputSchema,
  },
  agent_plan: {
    name: 'agent_plan' as const,
    description:
      'Create or update an execution plan. Use to break down complex tasks into steps.',
    inputSchema: AgentPlanInputSchema,
  },
  agent_clarify: {
    name: 'agent_clarify' as const,
    description:
      'Request clarification from the user. Use when task requirements are ambiguous.',
    inputSchema: AgentClarifyInputSchema,
  },
} as const;

/**
 * Generate tool reference documentation
 */
export function generateGenericToolReference(): string {
  return `## Agent Tools

You have access to 8 generic agent tools for context management, task execution, and orchestration:

### Context Tools

#### context_read
Read from agent context, memory, or history.
- target: "context" | "memory" | "history" | "state" | custom-key
- format: "json" | "summary" | "tree" | "text"
- depth: Number (default: 3)
- keys: Optional array of specific keys

#### context_write
Write to agent context or memory.
- target: "context" | "memory" | "state"
- data: Any data to store
- key: Optional key for the data
- merge: Merge with existing (default: true)

#### context_search
Search through context, memory, and history.
- query: Search pattern
- target: "all" | "context" | "memory" | "history"
- limit: Maximum results (default: 10)

### Task Tools

#### task_execute
Execute action through the action adapter.
- action: Action identifier
- params: Action parameters
- adapter: Specific adapter (optional)
- async: Execute without waiting (default: false)

### State Tools

#### state_snapshot
Capture current state checkpoint.
- label: Human-readable label
- includeMemory: Include memory (default: true)
- includeHistory: Include history (default: false)

### Agent Tools

#### agent_delegate
Delegate to specialized sub-agent.
- agentType: Agent type to delegate to
- task: Task description
- context: Additional context
- waitForResult: Wait for completion (default: true)

#### agent_plan
Create or update execution plan.
- goal: Plan goal
- steps: Array of { id, description, dependencies }
- mode: "create" | "update" | "append"

#### agent_clarify
Request user clarification.
- question: Question to ask
- options: Predefined choices
- type: "question" | "choice" | "confirm" | "input"
`;
}

/**
 * Get tool schema by name
 */
export function getGenericToolSchema(name: AgentToolName) {
  return GENERIC_TOOL_SCHEMAS[name];
}

/**
 * Map canvas tool names to generic tool names
 */
export const CANVAS_TO_GENERIC_MAP: Record<string, AgentToolName> = {
  canvas_read: 'context_read',
  canvas_write: 'context_write',
  canvas_edit: 'task_execute',
  canvas_find: 'context_search',
  canvas_capture: 'state_snapshot',
  canvas_delegate: 'agent_delegate',
  canvas_plan: 'agent_plan',
  canvas_clarify: 'agent_clarify',
};

/**
 * Map generic tool names to canvas tool names
 */
export const GENERIC_TO_CANVAS_MAP: Record<AgentToolName, string> = {
  context_read: 'canvas_read',
  context_write: 'canvas_write',
  task_execute: 'canvas_edit',
  context_search: 'canvas_find',
  state_snapshot: 'canvas_capture',
  agent_delegate: 'canvas_delegate',
  agent_plan: 'canvas_plan',
  agent_clarify: 'canvas_clarify',
};
