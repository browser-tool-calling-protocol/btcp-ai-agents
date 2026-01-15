/**
 * Command System Types
 *
 * Generic types for slash command support in AI agents.
 */

// ============================================================================
// COMMAND DEFINITION
// ============================================================================

/**
 * Command definition
 *
 * @example
 * ```typescript
 * const analyzeCommand: CommandDefinition = {
 *   name: 'analyze',
 *   description: 'Analyze the current context',
 *   category: 'system',
 *   allowedTools: ['read', 'search'],
 *   body: `Analyze the context and provide insights.
 *
 *   <analyze>
 *   - Examine the current state
 *   - Identify patterns
 *   </analyze>`,
 * };
 * ```
 */
export interface CommandDefinition<TToolName extends string = string> {
  /** Command name (without slash) */
  name: string;
  /** Human-readable description */
  description: string;
  /** Category for organization */
  category?: string;
  /** Argument hint (e.g., "<query>" or "[options]") */
  argumentHint?: string;
  /** Tools this command is allowed to use */
  allowedTools: TToolName[];
  /** Command body/prompt template */
  body: string;
  /** Whether command requires arguments */
  requiresArgs?: boolean;
  /** Argument validation pattern */
  argPattern?: RegExp;
  /** Example usages */
  examples?: string[];
}

/**
 * Parsed command from user input
 */
export interface ParsedCommand<TToolName extends string = string> {
  /** Command name (without slash) */
  command: string;
  /** Arguments string */
  args: string;
  /** Raw input string */
  raw: string;
  /** Whether the command is valid */
  isValid: boolean;
  /** Command definition if found */
  definition?: CommandDefinition<TToolName>;
  /** Error message if invalid */
  error?: string;
}

/**
 * Command execution options
 */
export interface CommandExecutionOptions<TContext = unknown> {
  /** Execution context */
  context: TContext;
  /** Maximum execution time (ms) */
  timeout?: number;
  /** Maximum iterations */
  maxIterations?: number;
  /** Enable streaming events */
  streaming?: boolean;
}

/**
 * Command execution result
 */
export interface CommandResult {
  /** Whether execution was successful */
  success: boolean;
  /** Command that was executed */
  command: string;
  /** Arguments used */
  args: string;
  /** Result summary */
  summary?: string;
  /** Error message if failed */
  error?: string;
  /** Output data */
  output?: unknown;
  /** Execution duration (ms) */
  duration?: number;
}

// ============================================================================
// COMMAND EVENTS
// ============================================================================

/**
 * Command event types
 */
export type CommandEventType =
  | "start"
  | "progress"
  | "tool_call"
  | "tool_result"
  | "thinking"
  | "complete"
  | "failed"
  | "cancelled";

/**
 * Command event - emitted during command execution
 */
export interface CommandEvent<TToolName extends string = string> {
  /** Event type */
  type: CommandEventType;
  /** Command name */
  command: string;
  /** Event message */
  message?: string;
  /** Tool being called */
  tool?: TToolName;
  /** Tool input */
  toolInput?: unknown;
  /** Tool result */
  toolResult?: unknown;
  /** Progress percentage (0-100) */
  progress?: number;
  /** Error message */
  error?: string;
  /** Result summary */
  summary?: string;
  /** Timestamp */
  timestamp: number;
}

// ============================================================================
// COMMAND REGISTRY
// ============================================================================

/**
 * Command registry interface
 */
export interface CommandRegistry<TToolName extends string = string> {
  /** Register a command */
  register(command: CommandDefinition<TToolName>): void;
  /** Unregister a command */
  unregister(name: string): boolean;
  /** Get a command by name */
  get(name: string): CommandDefinition<TToolName> | undefined;
  /** Check if command exists */
  has(name: string): boolean;
  /** Get all command names */
  getNames(): string[];
  /** Get all commands */
  getAll(): CommandDefinition<TToolName>[];
  /** Get commands by category */
  getByCategory(category: string): CommandDefinition<TToolName>[];
}

/**
 * Command executor interface
 */
export interface CommandExecutor<TContext = unknown, TToolName extends string = string> {
  /** Parse a command string */
  parse(input: string): ParsedCommand<TToolName>;
  /** Execute a command (streaming) */
  execute(
    input: string,
    options: CommandExecutionOptions<TContext>
  ): AsyncGenerator<CommandEvent<TToolName>>;
  /** Execute a command (batch) */
  run(input: string, options: CommandExecutionOptions<TContext>): Promise<CommandResult>;
  /** Check if input is a command */
  isCommand(input: string): boolean;
  /** Suggest commands */
  suggest(partial: string): string[];
}
