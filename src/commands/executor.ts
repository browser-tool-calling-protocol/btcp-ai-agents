/**
 * Command Executor
 *
 * Parses and executes slash commands.
 *
 * @example
 * ```typescript
 * import { CommandExecutor, createCommandExecutor } from '@waiboard/ai-agents/commands';
 *
 * const executor = createCommandExecutor(registry, handler);
 *
 * // Parse a command
 * const parsed = executor.parse('/help');
 *
 * // Execute (streaming)
 * for await (const event of executor.execute('/analyze data', { context })) {
 *   console.log(event.type, event.message);
 * }
 *
 * // Execute (batch)
 * const result = await executor.run('/help', { context });
 * ```
 */

import type {
  CommandDefinition,
  CommandRegistry,
  CommandExecutor as ICommandExecutor,
  ParsedCommand,
  CommandEvent,
  CommandResult,
  CommandExecutionOptions,
} from "./types.js";

// ============================================================================
// TYPES
// ============================================================================

/**
 * Command handler function
 */
export type CommandHandler<TContext = unknown, TToolName extends string = string> = (
  task: string,
  command: CommandDefinition<TToolName>,
  options: CommandExecutionOptions<TContext>
) => AsyncGenerator<CommandEvent<TToolName>>;

// ============================================================================
// COMMAND EXECUTOR
// ============================================================================

/**
 * Default command executor implementation
 */
export class DefaultCommandExecutor<TContext = unknown, TToolName extends string = string>
  implements ICommandExecutor<TContext, TToolName>
{
  constructor(
    private registry: CommandRegistry<TToolName>,
    private handler: CommandHandler<TContext, TToolName>
  ) {}

  /**
   * Parse a command string
   *
   * @example
   * ```typescript
   * executor.parse('/analyze the data')
   * // => { command: 'analyze', args: 'the data', isValid: true, ... }
   *
   * executor.parse('not a command')
   * // => { command: '', args: '', isValid: false, error: '...' }
   * ```
   */
  parse(input: string): ParsedCommand<TToolName> {
    const trimmed = input.trim();

    // Must start with /
    if (!trimmed.startsWith("/")) {
      return {
        command: "",
        args: "",
        raw: input,
        isValid: false,
        error: "Not a command. Commands must start with /",
      };
    }

    // Extract command and args
    const withoutSlash = trimmed.slice(1);
    const spaceIndex = withoutSlash.indexOf(" ");

    let command: string;
    let args: string;

    if (spaceIndex === -1) {
      command = withoutSlash;
      args = "";
    } else {
      command = withoutSlash.slice(0, spaceIndex);
      args = withoutSlash.slice(spaceIndex + 1).trim();
    }

    // Validate command exists
    const definition = this.registry.get(command);

    if (!definition) {
      const available = this.registry.getNames().slice(0, 5).join(", ");
      const suffix = this.registry.getNames().length > 5 ? "..." : "";
      return {
        command,
        args,
        raw: input,
        isValid: false,
        error: `Unknown command: /${command}. Available: ${available}${suffix}`,
      };
    }

    // Validate required arguments
    if (definition.requiresArgs && !args) {
      return {
        command,
        args,
        raw: input,
        isValid: false,
        definition,
        error: `Command /${command} requires arguments: ${definition.argumentHint || "<args>"}`,
      };
    }

    // Validate argument pattern
    if (args && definition.argPattern && !definition.argPattern.test(args)) {
      return {
        command,
        args,
        raw: input,
        isValid: false,
        definition,
        error: `Invalid arguments for /${command}. Expected: ${definition.argumentHint}`,
      };
    }

    return {
      command,
      args,
      raw: input,
      isValid: true,
      definition,
    };
  }

  /**
   * Execute a command (streaming)
   */
  async *execute(
    input: string,
    options: CommandExecutionOptions<TContext>
  ): AsyncGenerator<CommandEvent<TToolName>> {
    const parsed = this.parse(input);

    if (!parsed.isValid) {
      yield {
        type: "failed",
        command: parsed.command || "unknown",
        error: parsed.error,
        message: `Invalid command: ${parsed.error}`,
        timestamp: Date.now(),
      };
      return;
    }

    const definition = parsed.definition!;
    const { args } = parsed;

    // Emit start event
    yield {
      type: "start",
      command: definition.name,
      message: `Executing command: /${definition.name}${args ? ` ${args}` : ""}`,
      timestamp: Date.now(),
    };

    // Build task from command body
    const task = this.buildTask(definition, args);

    // Execute via handler
    try {
      for await (const event of this.handler(task, definition, options)) {
        yield event;
      }
    } catch (error) {
      yield {
        type: "failed",
        command: definition.name,
        error: error instanceof Error ? error.message : String(error),
        message: "Command execution failed",
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Execute a command (batch)
   */
  async run(
    input: string,
    options: CommandExecutionOptions<TContext>
  ): Promise<CommandResult> {
    const startTime = Date.now();
    const parsed = this.parse(input);
    const events: CommandEvent<TToolName>[] = [];

    for await (const event of this.execute(input, options)) {
      events.push(event);
    }

    const completeEvent = events.find((e) => e.type === "complete");
    const failedEvent = events.find((e) => e.type === "failed");

    if (completeEvent) {
      return {
        success: true,
        command: parsed.command,
        args: parsed.args,
        summary: completeEvent.summary,
        duration: Date.now() - startTime,
      };
    }

    return {
      success: false,
      command: parsed.command,
      args: parsed.args,
      error: failedEvent?.error || "Command execution failed",
      duration: Date.now() - startTime,
    };
  }

  /**
   * Check if input is a command
   */
  isCommand(input: string): boolean {
    return input.trim().startsWith("/");
  }

  /**
   * Suggest commands based on partial input
   */
  suggest(partial: string): string[] {
    const trimmed = partial.trim().toLowerCase();

    if (!trimmed.startsWith("/")) {
      return this.registry.getNames();
    }

    const search = trimmed.slice(1);
    return this.registry
      .getAll()
      .filter((cmd) => cmd.name.toLowerCase().startsWith(search))
      .map((cmd) => `/${cmd.name}`);
  }

  /**
   * Build task prompt from command definition
   */
  private buildTask(definition: CommandDefinition<TToolName>, args: string): string {
    // Replace $ARGUMENTS placeholder
    let task = definition.body.replace(/\$ARGUMENTS/g, args || "(none specified)");

    // Add command context
    task = `Execute command: /${definition.name}${args ? ` ${args}` : ""}\n\n${task}`;

    return task;
  }
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Create a command executor
 */
export function createCommandExecutor<TContext = unknown, TToolName extends string = string>(
  registry: CommandRegistry<TToolName>,
  handler: CommandHandler<TContext, TToolName>
): DefaultCommandExecutor<TContext, TToolName> {
  return new DefaultCommandExecutor(registry, handler);
}

/**
 * Create a simple command executor with default handler
 */
export function createSimpleExecutor<TToolName extends string = string>(
  registry: CommandRegistry<TToolName>
): DefaultCommandExecutor<unknown, TToolName> {
  // Simple handler that just emits the task as a thinking event and completes
  const handler: CommandHandler<unknown, TToolName> = async function* (task, command) {
    yield {
      type: "thinking",
      command: command.name,
      message: task,
      timestamp: Date.now(),
    };

    yield {
      type: "complete",
      command: command.name,
      summary: `Command /${command.name} executed`,
      timestamp: Date.now(),
    };
  };

  return new DefaultCommandExecutor(registry, handler);
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Check if string is a command
 */
export function isCommand(input: string): boolean {
  return input.trim().startsWith("/");
}

/**
 * Get command name from input
 */
export function getCommandName(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return null;

  const withoutSlash = trimmed.slice(1);
  const spaceIndex = withoutSlash.indexOf(" ");

  return spaceIndex === -1 ? withoutSlash : withoutSlash.slice(0, spaceIndex);
}

/**
 * Get command arguments from input
 */
export function getCommandArgs(input: string): string {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return "";

  const withoutSlash = trimmed.slice(1);
  const spaceIndex = withoutSlash.indexOf(" ");

  return spaceIndex === -1 ? "" : withoutSlash.slice(spaceIndex + 1).trim();
}
