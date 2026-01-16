/**
 * Agent Registry - Pluggable Domain Agents
 *
 * Claude Code pattern: agents registered with name + description,
 * delegated by description matching.
 *
 * ## Core Agents (built-in)
 * - planner: Plans complex tasks, breaks down work
 * - analyzer: Analyzes data, provides insights
 * - explorer: Explores context, finds patterns
 *
 * ## Domain Agents (from registry)
 * - Registered at runtime via `registerAgent()`
 * - Matched by task description/keywords
 * - Examples: canvas-designer, code-executor, etc.
 *
 * @module @btcp/ai-agents/agents
 */

import type { ModelPreference } from "../types/index.js";

/**
 * Registered agent definition
 */
export interface RegisteredAgent {
  /** Unique agent ID */
  id: string;
  /** Display name */
  name: string;
  /** Description for task matching */
  description: string;
  /** System prompt for the agent */
  systemPrompt: string;
  /** Tools this agent can use */
  allowedTools: string[];
  /** Model tier: fast, balanced, powerful */
  model: ModelPreference;
  /** Maximum output tokens */
  maxTokens: number;
  /** Keywords for task matching (optional) */
  keywords?: RegExp;
}

/**
 * Agent Registry - manages pluggable domain agents
 */
class AgentRegistry {
  private agents = new Map<string, RegisteredAgent>();

  /**
   * Register a domain agent
   */
  register(agent: RegisteredAgent): void {
    if (!agent.id) {
      throw new Error("Agent must have an id");
    }
    this.agents.set(agent.id, agent);
  }

  /**
   * Unregister an agent
   */
  unregister(id: string): boolean {
    return this.agents.delete(id);
  }

  /**
   * Get agent by ID
   */
  get(id: string): RegisteredAgent | undefined {
    return this.agents.get(id);
  }

  /**
   * Check if agent exists
   */
  has(id: string): boolean {
    return this.agents.has(id);
  }

  /**
   * Find agent by matching task description
   *
   * Claude Code pattern: delegate by description matching.
   * Checks keywords regex first, then falls back to word matching.
   */
  findByDescription(task: string): RegisteredAgent | undefined {
    const taskLower = task.toLowerCase();

    for (const agent of this.agents.values()) {
      // Check keywords regex if provided
      if (agent.keywords?.test(task)) {
        return agent;
      }

      // Simple description word matching
      const descWords = agent.description.toLowerCase().split(/\s+/);
      const matchingWords = descWords.filter(
        (word) => word.length > 4 && taskLower.includes(word)
      );

      // Match if 2+ significant words match
      if (matchingWords.length >= 2) {
        return agent;
      }
    }

    return undefined;
  }

  /**
   * List all registered agents
   */
  list(): RegisteredAgent[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get all agent IDs
   */
  getIds(): string[] {
    return Array.from(this.agents.keys());
  }

  /**
   * Clear all registered agents
   */
  clear(): void {
    this.agents.clear();
  }
}

// Singleton registry instance
let registry: AgentRegistry | null = null;

/**
 * Get the global agent registry
 */
export function getAgentRegistry(): AgentRegistry {
  if (!registry) {
    registry = new AgentRegistry();
  }
  return registry;
}

/**
 * Register a domain agent
 *
 * @example
 * ```typescript
 * registerAgent({
 *   id: "canvas-designer",
 *   name: "Canvas Designer",
 *   description: "Creates visual layouts and designs on canvas",
 *   systemPrompt: "You are a canvas design specialist...",
 *   allowedTools: ["context_read", "context_write", "task_execute"],
 *   model: "balanced",
 *   maxTokens: 4000,
 *   keywords: /canvas|design|layout|visual/i,
 * });
 * ```
 */
export function registerAgent(agent: RegisteredAgent): void {
  getAgentRegistry().register(agent);
}

/**
 * Unregister a domain agent
 */
export function unregisterAgent(id: string): boolean {
  return getAgentRegistry().unregister(id);
}

/**
 * Get a registered agent by ID
 */
export function getRegisteredAgent(id: string): RegisteredAgent | undefined {
  return getAgentRegistry().get(id);
}

/**
 * List all registered domain agents
 */
export function listRegisteredAgents(): RegisteredAgent[] {
  return getAgentRegistry().list();
}

/**
 * Find agent matching task description
 */
export function findAgentForTask(task: string): RegisteredAgent | undefined {
  return getAgentRegistry().findByDescription(task);
}

/**
 * Clear all registered agents (useful for testing)
 */
export function clearAgentRegistry(): void {
  getAgentRegistry().clear();
}

// Re-export for convenience
export { AgentRegistry };
