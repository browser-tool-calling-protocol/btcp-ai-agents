/**
 * Skills Module - Auto-Activating Expert Knowledge
 *
 * Pattern 6: Skills as Compressed Context
 * 150 tokens → 10,000 tokens of expertise
 *
 * This module provides a pluggable skill registry for dynamic skill management.
 * Skills are domain-specific knowledge modules that can be injected into agent prompts.
 *
 * @example
 * ```typescript
 * import { getSkillRegistry, createSkillRegistry } from '@btcp/ai-agents/skills';
 *
 * // Create a custom skill
 * const mySkill: SkillPlugin = {
 *   id: 'my-skill',
 *   name: 'My Custom Skill',
 *   description: 'Expert knowledge for my domain',
 *   triggers: ['my-keyword', 'another-keyword'],
 *   content: `## My Skill Guidelines
 * - Guideline 1
 * - Guideline 2`,
 *   tokenCost: 50,
 * };
 *
 * // Register the skill
 * const registry = getSkillRegistry();
 * registry.register(mySkill);
 *
 * // Inject skills into a prompt based on task
 * const task = "Do something with my-keyword";
 * const result = registry.injectSkills(task, baseSystemPrompt);
 * console.log(result.injectedPrompt);
 * ```
 */

// ============================================================================
// PLUGGABLE SKILL REGISTRY
// ============================================================================

export {
  createSkillRegistry,
  getSkillRegistry,
  setSkillRegistry,
  type SkillPlugin,
  type SkillRegistry,
  type SkillInjectionConfig,
  type SkillInjectionResult,
} from './registry.js';
