/**
 * Command System
 *
 * Provides slash command support for AI agents.
 *
 * @example
 * ```typescript
 * import {
 *   createCommandRegistry,
 *   createCommandExecutor,
 *   isCommand,
 * } from '@btcp/ai-agents/commands';
 *
 * // Create registry
 * const registry = createCommandRegistry();
 *
 * // Register commands
 * registry.register({
 *   name: 'help',
 *   description: 'Show available commands',
 *   category: 'system',
 *   allowedTools: [],
 *   body: 'List all available commands with descriptions.',
 * });
 *
 * registry.register({
 *   name: 'analyze',
 *   description: 'Analyze the provided input',
 *   argumentHint: '<query>',
 *   requiresArgs: true,
 *   allowedTools: ['context_read', 'context_search'],
 *   body: `Analyze: $ARGUMENTS
 *
 *   Provide detailed analysis of the input.`,
 * });
 *
 * // Create executor
 * const executor = createCommandExecutor(registry, handler);
 *
 * // Check if input is command
 * if (executor.isCommand('/help')) {
 *   // Execute command
 *   for await (const event of executor.execute('/help', { context })) {
 *     console.log(event.type, event.message);
 *   }
 * }
 * ```
 */

// =============================================================================
// Types
// =============================================================================

export type {
  CommandDefinition,
  ParsedCommand,
  CommandExecutionOptions,
  CommandResult,
  CommandEventType,
  CommandEvent,
  CommandRegistry,
  CommandExecutor,
} from "./types.js";

// =============================================================================
// Registry
// =============================================================================

export {
  DefaultCommandRegistry,
  createCommandRegistry,
} from "./registry.js";

// =============================================================================
// Executor
// =============================================================================

export {
  DefaultCommandExecutor,
  createCommandExecutor,
  createSimpleExecutor,
  isCommand,
  getCommandName,
  getCommandArgs,
  type CommandHandler,
} from "./executor.js";

// Note: Domain-specific commands should be registered dynamically
// The predefined canvas commands have been removed - use createCommandRegistry() to create custom commands
