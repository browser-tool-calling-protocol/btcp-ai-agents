/**
 * Pluggable Skill Registry
 *
 * Provides a registry pattern for skills that can be dynamically
 * registered and unregistered at runtime. Supports skill bundles
 * for loading related skills together.
 *
 * @see docs/engineering/CLAUDE_CODE_PATTERNS.md#pattern-6
 */

/**
 * Skill plugin interface
 *
 * Skills provide domain-specific knowledge that gets injected
 * into the system prompt when relevant keywords are detected.
 */
export interface SkillPlugin {
  /** Unique identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description of the skill's expertise */
  description: string;
  /** Keywords that trigger this skill */
  triggers: string[];
  /** Regex patterns for more complex matching */
  patterns?: RegExp[];
  /** Context to inject when skill is active (the expertise) */
  context: string;
  /** Priority when multiple skills match (higher = more important) */
  priority?: number;
  /** Category for grouping (e.g., 'canvas', 'coding', 'writing') */
  category?: string;
  /** Lifecycle hooks */
  onActivate?: (ctx: unknown) => Promise<void>;
  onDeactivate?: () => Promise<void>;
}

/**
 * Skill injection configuration
 */
export interface SkillInjectionConfig {
  /** Maximum number of skills to inject (default: 2) */
  maxSkills?: number;
  /** Maximum tokens for skill context (default: 10000) */
  maxTokens?: number;
  /** Enable deduplication of overlapping content (default: true) */
  deduplicate?: boolean;
  /** Minimum priority threshold */
  minPriority?: number;
  /** Filter by category */
  category?: string;
}

/**
 * Skill injection result
 */
export interface SkillInjectionResult {
  /** The combined prompt with skills injected */
  prompt: string;
  /** Skills that were injected */
  injectedSkills: SkillPlugin[];
  /** Skills that were excluded */
  excludedSkills: SkillPlugin[];
  /** Estimated tokens added */
  estimatedTokens: number;
  /** Whether deduplication was applied */
  deduplicationApplied: boolean;
}

/**
 * Skill registry interface
 */
export interface SkillRegistry {
  /** Register a single skill */
  register(skill: SkillPlugin): void;
  /** Unregister a skill by ID */
  unregister(id: string): void;
  /** Get a skill by ID */
  get(id: string): SkillPlugin | undefined;
  /** Check if a skill exists */
  has(id: string): boolean;
  /** List all registered skills */
  list(): SkillPlugin[];
  /** List skills by category */
  listByCategory(category: string): SkillPlugin[];
  /** Get skills matching a task */
  getMatching(task: string): SkillPlugin[];
  /** Register multiple skills at once */
  registerBundle(skills: SkillPlugin[]): void;
  /** Unregister all skills in a category */
  unregisterCategory(category: string): number;
  /** Clear all skills */
  clear(): void;
  /** Inject relevant skills into a prompt */
  injectSkills(task: string, basePrompt: string, config?: SkillInjectionConfig): SkillInjectionResult;
}

/**
 * Create a new skill registry instance
 */
export function createSkillRegistry(): SkillRegistry {
  const skills = new Map<string, SkillPlugin>();

  /**
   * Check if a skill matches the given task
   */
  function skillMatches(skill: SkillPlugin, task: string): boolean {
    const lower = task.toLowerCase();

    // Check triggers
    for (const trigger of skill.triggers) {
      if (lower.includes(trigger.toLowerCase())) {
        return true;
      }
    }

    // Check patterns
    if (skill.patterns) {
      for (const pattern of skill.patterns) {
        if (pattern.test(task)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Estimate tokens for a skill context
   */
  function estimateTokens(skill: SkillPlugin): number {
    return Math.ceil(skill.context.length / 3.5);
  }

  /**
   * Check if two skills overlap (for deduplication)
   */
  function skillsOverlap(skill1: SkillPlugin, skill2: SkillPlugin): boolean {
    const commonTriggers = skill1.triggers.filter((t) =>
      skill2.triggers.some((t2) => t.toLowerCase() === t2.toLowerCase())
    );
    return commonTriggers.length > 2;
  }

  /**
   * Deduplicate skills
   */
  function deduplicateSkills(inputSkills: SkillPlugin[]): SkillPlugin[] {
    if (inputSkills.length <= 1) return inputSkills;

    const result: SkillPlugin[] = [];
    const excluded = new Set<string>();
    const sorted = [...inputSkills].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

    for (const skill of sorted) {
      if (excluded.has(skill.id)) continue;

      const overlapsWithIncluded = result.some((included) => skillsOverlap(skill, included));

      if (!overlapsWithIncluded) {
        result.push(skill);
      } else {
        excluded.add(skill.id);
      }
    }

    return result;
  }

  return {
    register(skill: SkillPlugin): void {
      if (skills.has(skill.id)) {
        console.warn(`[SkillRegistry] Overwriting skill: ${skill.id}`);
      }
      skills.set(skill.id, skill);
    },

    unregister(id: string): void {
      skills.delete(id);
    },

    get(id: string): SkillPlugin | undefined {
      return skills.get(id);
    },

    has(id: string): boolean {
      return skills.has(id);
    },

    list(): SkillPlugin[] {
      return Array.from(skills.values());
    },

    listByCategory(category: string): SkillPlugin[] {
      return Array.from(skills.values()).filter((s) => s.category === category);
    },

    getMatching(task: string): SkillPlugin[] {
      return Array.from(skills.values())
        .filter((skill) => skillMatches(skill, task))
        .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    },

    registerBundle(bundle: SkillPlugin[]): void {
      for (const skill of bundle) {
        skills.set(skill.id, skill);
      }
    },

    unregisterCategory(category: string): number {
      let count = 0;
      for (const [id, skill] of skills) {
        if (skill.category === category) {
          skills.delete(id);
          count++;
        }
      }
      return count;
    },

    clear(): void {
      skills.clear();
    },

    injectSkills(
      task: string,
      basePrompt: string,
      config: SkillInjectionConfig = {}
    ): SkillInjectionResult {
      const {
        maxSkills = 2,
        maxTokens = 10000,
        deduplicate = true,
        minPriority = 0,
        category,
      } = config;

      let matchingSkills = this.getMatching(task);

      // Filter by category
      if (category) {
        matchingSkills = matchingSkills.filter((s) => s.category === category);
      }

      // Filter by minimum priority
      if (minPriority > 0) {
        matchingSkills = matchingSkills.filter((s) => (s.priority ?? 0) >= minPriority);
      }

      if (matchingSkills.length === 0) {
        return {
          prompt: basePrompt,
          injectedSkills: [],
          excludedSkills: [],
          estimatedTokens: 0,
          deduplicationApplied: false,
        };
      }

      // Deduplicate if enabled
      let deduplicationApplied = false;
      if (deduplicate && matchingSkills.length > 1) {
        const beforeCount = matchingSkills.length;
        matchingSkills = deduplicateSkills(matchingSkills);
        deduplicationApplied = matchingSkills.length < beforeCount;
      }

      // Select skills within limits
      const injectedSkills: SkillPlugin[] = [];
      const excludedSkills: SkillPlugin[] = [];
      let totalTokens = 0;

      for (const skill of matchingSkills) {
        const skillTokens = estimateTokens(skill);

        if (injectedSkills.length >= maxSkills || totalTokens + skillTokens > maxTokens) {
          excludedSkills.push(skill);
          continue;
        }

        injectedSkills.push(skill);
        totalTokens += skillTokens;
      }

      if (injectedSkills.length === 0) {
        return {
          prompt: basePrompt,
          injectedSkills: [],
          excludedSkills: matchingSkills,
          estimatedTokens: 0,
          deduplicationApplied,
        };
      }

      // Build the combined prompt
      const skillContexts = injectedSkills.map((skill) => skill.context).join('\n\n');

      const prompt = `${basePrompt}

## Active Skills
${injectedSkills.map((s) => `- ${s.name}`).join('\n')}

${skillContexts}`;

      return {
        prompt,
        injectedSkills,
        excludedSkills,
        estimatedTokens: totalTokens,
        deduplicationApplied,
      };
    },
  };
}

// Global skill registry instance
let globalRegistry: SkillRegistry | null = null;

/**
 * Get the global skill registry (creates one if needed)
 */
export function getSkillRegistry(): SkillRegistry {
  if (!globalRegistry) {
    globalRegistry = createSkillRegistry();
  }
  return globalRegistry;
}

/**
 * Set a custom global skill registry
 */
export function setSkillRegistry(registry: SkillRegistry): void {
  globalRegistry = registry;
}

/**
 * Convenience function to register a skill to the global registry
 */
export function registerSkill(skill: SkillPlugin): void {
  getSkillRegistry().register(skill);
}

/**
 * Convenience function to get matching skills from the global registry
 */
export function getMatchingSkills(task: string): SkillPlugin[] {
  return getSkillRegistry().getMatching(task);
}

/**
 * Convenience function to inject skills using the global registry
 */
export function injectRelevantSkills(
  task: string,
  basePrompt: string,
  config?: SkillInjectionConfig
): SkillInjectionResult {
  return getSkillRegistry().injectSkills(task, basePrompt, config);
}
