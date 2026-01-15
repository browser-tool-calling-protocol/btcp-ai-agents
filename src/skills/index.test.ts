/**
 * Skills Module Tests
 *
 * Tests for skill matching and context injection.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  CANVAS_SKILLS,
  skillMatches,
  getMatchingSkills,
  injectRelevantSkills,
  getSkill,
  listSkills,
  registerSkill,
  type CanvasSkill,
} from './index.js';

describe('Skills Module', () => {
  describe('CANVAS_SKILLS registry', () => {
    it('should have diagram skill', () => {
      expect(CANVAS_SKILLS.diagram).toBeDefined();
      expect(CANVAS_SKILLS.diagram.id).toBe('diagram');
    });

    it('should have wireframe skill', () => {
      expect(CANVAS_SKILLS.wireframe).toBeDefined();
      expect(CANVAS_SKILLS.wireframe.id).toBe('wireframe');
    });

    it('should have moodboard skill', () => {
      expect(CANVAS_SKILLS.moodboard).toBeDefined();
      expect(CANVAS_SKILLS.moodboard.id).toBe('moodboard');
    });

    it('should have storyboard skill', () => {
      expect(CANVAS_SKILLS.storyboard).toBeDefined();
      expect(CANVAS_SKILLS.storyboard.id).toBe('storyboard');
    });

    it('should have layout skill', () => {
      expect(CANVAS_SKILLS.layout).toBeDefined();
      expect(CANVAS_SKILLS.layout.id).toBe('layout');
    });

    it('all skills should have required properties', () => {
      for (const [key, skill] of Object.entries(CANVAS_SKILLS)) {
        expect(skill.id, `${key} should have id`).toBeDefined();
        expect(skill.name, `${key} should have name`).toBeDefined();
        expect(skill.description, `${key} should have description`).toBeDefined();
        expect(skill.triggers, `${key} should have triggers`).toBeDefined();
        expect(skill.triggers.length, `${key} should have at least one trigger`).toBeGreaterThan(0);
        expect(skill.context, `${key} should have context`).toBeDefined();
        expect(skill.context.length, `${key} should have non-empty context`).toBeGreaterThan(0);
      }
    });
  });

  describe('skillMatches', () => {
    it('should match by trigger keyword', () => {
      const skill = CANVAS_SKILLS.diagram;
      expect(skillMatches(skill, 'Create a flowchart')).toBe(true);
    });

    it('should match case-insensitively', () => {
      const skill = CANVAS_SKILLS.diagram;
      expect(skillMatches(skill, 'Create a FLOWCHART')).toBe(true);
      expect(skillMatches(skill, 'FlowChart design')).toBe(true);
    });

    it('should match by regex pattern', () => {
      const skill = CANVAS_SKILLS.diagram;
      expect(skillMatches(skill, 'create a process flow')).toBe(true);
    });

    it('should not match unrelated text', () => {
      const skill = CANVAS_SKILLS.diagram;
      expect(skillMatches(skill, 'Hello world')).toBe(false);
    });

    it('should match wireframe triggers', () => {
      const skill = CANVAS_SKILLS.wireframe;
      expect(skillMatches(skill, 'Design a wireframe')).toBe(true);
      expect(skillMatches(skill, 'Create a UI mockup')).toBe(true);
    });

    it('should match layout triggers', () => {
      const skill = CANVAS_SKILLS.layout;
      expect(skillMatches(skill, 'Align all elements')).toBe(true);
      expect(skillMatches(skill, 'Distribute evenly')).toBe(true);
    });
  });

  describe('getMatchingSkills', () => {
    it('should return matching skills', () => {
      const skills = getMatchingSkills('Create a flowchart');
      expect(skills.length).toBeGreaterThan(0);
      expect(skills.some(s => s.id === 'diagram')).toBe(true);
    });

    it('should return empty array for no matches', () => {
      const skills = getMatchingSkills('Hello world');
      expect(skills).toHaveLength(0);
    });

    it('should return multiple skills when applicable', () => {
      // This could match both diagram and layout
      const skills = getMatchingSkills('Create a flowchart and align elements');
      expect(skills.length).toBeGreaterThanOrEqual(1);
    });

    it('should sort by priority', () => {
      const skills = getMatchingSkills('Create a flowchart diagram');
      if (skills.length > 1) {
        // Higher priority first
        for (let i = 1; i < skills.length; i++) {
          const prevPriority = skills[i - 1].priority ?? 0;
          const currPriority = skills[i].priority ?? 0;
          expect(prevPriority).toBeGreaterThanOrEqual(currPriority);
        }
      }
    });
  });

  describe('injectRelevantSkills', () => {
    const basePrompt = 'You are a canvas agent.';

    it('should return base prompt when no skills match', () => {
      const result = injectRelevantSkills('Hello world', basePrompt);
      expect(result).toBe(basePrompt);
    });

    it('should inject matching skill context', () => {
      const result = injectRelevantSkills('Create a flowchart', basePrompt);
      expect(result).toContain(basePrompt);
      expect(result).toContain('Diagram Expert');
    });

    it('should inject wireframe context for UI tasks', () => {
      const result = injectRelevantSkills('Design a wireframe', basePrompt);
      expect(result).toContain('Wireframe Expert');
    });

    it('should include skill separator', () => {
      const result = injectRelevantSkills('Create a flowchart', basePrompt);
      expect(result).toContain('## Active Skills');
    });

    it('should limit number of injected skills', () => {
      // Even with multiple matches, should not inject too many
      const result = injectRelevantSkills(
        'Create a flowchart diagram with aligned elements in a grid layout',
        basePrompt
      );
      // Check it doesn't explode in size (reasonable limit)
      expect(result.length).toBeLessThan(basePrompt.length + 20000);
    });
  });

  describe('getSkill', () => {
    it('should return skill by id', () => {
      const skill = getSkill('diagram');
      expect(skill).toBeDefined();
      expect(skill?.id).toBe('diagram');
    });

    it('should return undefined for unknown id', () => {
      const skill = getSkill('unknown-skill');
      expect(skill).toBeUndefined();
    });
  });

  describe('listSkills', () => {
    it('should return all skills', () => {
      const skills = listSkills();
      expect(skills.length).toBeGreaterThan(0);
    });

    it('should return array of skills', () => {
      const skills = listSkills();
      for (const skill of skills) {
        expect(skill.id).toBeDefined();
        expect(skill.name).toBeDefined();
      }
    });
  });

  describe('registerSkill', () => {
    it('should register a new skill', () => {
      const customSkill: CanvasSkill = {
        id: 'test-skill',
        name: 'Test Skill',
        description: 'A test skill for unit testing',
        triggers: ['test-trigger', 'unit-test'],
        context: 'This is test context',
        priority: 5,
      };

      registerSkill(customSkill);

      const registered = getSkill('test-skill');
      expect(registered).toBeDefined();
      expect(registered?.name).toBe('Test Skill');
    });

    it('should allow matching registered skills', () => {
      const customSkill: CanvasSkill = {
        id: 'custom-matcher',
        name: 'Custom Matcher',
        description: 'Tests custom matching',
        triggers: ['custom-unique-trigger'],
        context: 'Custom context',
      };

      registerSkill(customSkill);

      const skills = getMatchingSkills('task with custom-unique-trigger');
      expect(skills.some(s => s.id === 'custom-matcher')).toBe(true);
    });
  });
});
