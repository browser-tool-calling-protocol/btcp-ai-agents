/**
 * Command Registry
 *
 * Registry for managing slash commands.
 */

import type { CommandDefinition, CommandRegistry } from "./types.js";

/**
 * Default command registry implementation
 */
export class DefaultCommandRegistry implements CommandRegistry {
  private commands = new Map<string, CommandDefinition>();

  register(command: CommandDefinition): void {
    this.commands.set(command.name, command);
  }

  unregister(name: string): boolean {
    return this.commands.delete(name);
  }

  get(name: string): CommandDefinition | undefined {
    return this.commands.get(name);
  }

  has(name: string): boolean {
    return this.commands.has(name);
  }

  list(): CommandDefinition[] {
    return Array.from(this.commands.values());
  }

  listByCategory(category: string): CommandDefinition[] {
    return this.list().filter((cmd) => cmd.category === category);
  }

  getCategories(): string[] {
    const categories = new Set<string>();
    for (const cmd of this.commands.values()) {
      if (cmd.category) {
        categories.add(cmd.category);
      }
    }
    return Array.from(categories);
  }

  // Implement CommandRegistry interface methods
  getNames(): string[] {
    return Array.from(this.commands.keys());
  }

  getAll(): CommandDefinition[] {
    return this.list();
  }

  getByCategory(category: string): CommandDefinition[] {
    return this.listByCategory(category);
  }
}

/**
 * Create a new command registry
 */
export function createCommandRegistry(): CommandRegistry {
  return new DefaultCommandRegistry();
}
