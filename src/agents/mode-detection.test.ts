/**
 * Mode Detection Tests
 *
 * Tests for auto-detecting agent mode from task descriptions.
 */

import { describe, it, expect } from 'vitest';
import {
  detectAgentMode,
  getModeConfidence,
  detectAllModes,
  MODE_DESCRIPTIONS,
} from './mode-detection.js';

describe('Mode Detection', () => {
  describe('detectAgentMode', () => {
    describe('diagram mode', () => {
      it('should detect flowchart', () => {
        expect(detectAgentMode('Create a flowchart')).toBe('diagram');
      });

      it('should detect architecture diagram', () => {
        expect(detectAgentMode('Draw an architecture diagram')).toBe('diagram');
      });

      it('should detect process flow', () => {
        expect(detectAgentMode('Make a process flow diagram')).toBe('diagram');
      });

      it('should detect org chart', () => {
        expect(detectAgentMode('Create an org chart')).toBe('diagram');
      });

      it('should detect sequence diagram', () => {
        expect(detectAgentMode('Design a sequence diagram')).toBe('diagram');
      });

      it('should detect mind map', () => {
        expect(detectAgentMode('Create a mind map')).toBe('diagram');
      });

      it('should detect system design', () => {
        expect(detectAgentMode('Draw a system design')).toBe('diagram');
      });

      it('should detect ER diagram', () => {
        expect(detectAgentMode('Create an ER diagram')).toBe('diagram');
      });
    });

    describe('ui-mockup mode', () => {
      it('should detect wireframe', () => {
        expect(detectAgentMode('Create a wireframe')).toBe('ui-mockup');
      });

      it('should detect mockup', () => {
        expect(detectAgentMode('Design a mockup')).toBe('ui-mockup');
      });

      it('should detect UI', () => {
        expect(detectAgentMode('Design the UI')).toBe('ui-mockup');
      });

      it('should detect dashboard', () => {
        expect(detectAgentMode('Create a dashboard')).toBe('ui-mockup');
      });

      it('should detect mobile app', () => {
        expect(detectAgentMode('Design a mobile app screen')).toBe('ui-mockup');
      });

      it('should detect login page', () => {
        expect(detectAgentMode('Create a login page')).toBe('ui-mockup');
      });

      it('should detect website', () => {
        expect(detectAgentMode('Design a website layout')).toBe('ui-mockup');
      });

      it('should detect landing page', () => {
        expect(detectAgentMode('Create a landing page')).toBe('ui-mockup');
      });
    });

    describe('moodboard mode', () => {
      it('should detect moodboard', () => {
        expect(detectAgentMode('Create a moodboard')).toBe('moodboard');
      });

      it('should detect mood board (with space)', () => {
        expect(detectAgentMode('Make a mood board')).toBe('moodboard');
      });

      it('should detect color palette', () => {
        expect(detectAgentMode('Create a color palette')).toBe('moodboard');
      });

      it('should detect brand', () => {
        expect(detectAgentMode('Design brand identity')).toBe('moodboard');
      });

      it('should detect style guide', () => {
        expect(detectAgentMode('Create a style guide')).toBe('moodboard');
      });

      it('should detect design system', () => {
        expect(detectAgentMode('Build a design system')).toBe('moodboard');
      });
    });

    describe('storyboard mode', () => {
      it('should detect storyboard', () => {
        expect(detectAgentMode('Create a storyboard')).toBe('storyboard');
      });

      it('should detect timeline', () => {
        expect(detectAgentMode('Make a timeline')).toBe('storyboard');
      });

      it('should detect user flow', () => {
        expect(detectAgentMode('Design a user flow')).toBe('storyboard');
      });

      it('should detect user journey', () => {
        expect(detectAgentMode('Map the user journey')).toBe('storyboard');
      });

      it('should detect steps', () => {
        expect(detectAgentMode('Show the steps of the process')).toBe('storyboard');
      });
    });

    describe('analysis mode', () => {
      it('should detect analyze', () => {
        expect(detectAgentMode('Analyze the canvas')).toBe('analysis');
      });

      it('should detect review', () => {
        expect(detectAgentMode('Review the layout')).toBe('analysis');
      });

      it('should detect "what is on the canvas"', () => {
        expect(detectAgentMode('What is on the canvas?')).toBe('analysis');
      });

      it('should detect "how many"', () => {
        expect(detectAgentMode('How many elements are there?')).toBe('analysis');
      });

      it('should detect "list all"', () => {
        expect(detectAgentMode('List all rectangles')).toBe('analysis');
      });

      it('should detect evaluate', () => {
        expect(detectAgentMode('Evaluate the design')).toBe('analysis');
      });
    });

    describe('generation mode', () => {
      it('should detect create', () => {
        expect(detectAgentMode('Create a rectangle')).toBe('generation');
      });

      it('should detect generate', () => {
        expect(detectAgentMode('Generate some shapes')).toBe('generation');
      });

      it('should detect make', () => {
        expect(detectAgentMode('Make a circle')).toBe('generation');
      });

      it('should detect draw', () => {
        expect(detectAgentMode('Draw some lines')).toBe('generation');
      });

      it('should detect add', () => {
        expect(detectAgentMode('Add a text element')).toBe('generation');
      });
    });

    describe('creative mode', () => {
      it('should detect beautify', () => {
        expect(detectAgentMode('Beautify the design')).toBe('creative');
      });

      it('should detect improve', () => {
        expect(detectAgentMode('Improve the design')).toBe('creative');
      });

      it('should detect enhance', () => {
        expect(detectAgentMode('Enhance the visuals')).toBe('creative');
      });

      it('should detect "make it look better"', () => {
        expect(detectAgentMode('Make it look better')).toBe('creative');
      });
    });

    describe('general mode (fallback)', () => {
      it('should fallback to general for unknown tasks', () => {
        expect(detectAgentMode('Hello')).toBe('general');
      });

      it('should fallback to general for empty task', () => {
        expect(detectAgentMode('')).toBe('general');
      });

      it('should fallback to general for random text', () => {
        expect(detectAgentMode('asdfghjkl')).toBe('general');
      });
    });

    describe('mode priority', () => {
      it('should prioritize diagram over generation', () => {
        // "create" matches generation, but "flowchart" matches diagram
        expect(detectAgentMode('Create a flowchart')).toBe('diagram');
      });

      it('should prioritize ui-mockup over generation', () => {
        // "design" matches generation, but "wireframe" matches ui-mockup
        expect(detectAgentMode('Design a wireframe')).toBe('ui-mockup');
      });

      it('should prioritize analysis over other modes', () => {
        expect(detectAgentMode('Analyze and improve the design')).toBe('analysis');
      });
    });
  });

  describe('getModeConfidence', () => {
    it('should return 0 for general mode', () => {
      expect(getModeConfidence('any text', 'general')).toBe(0);
    });

    it('should return positive value for matching mode', () => {
      const confidence = getModeConfidence('Create a flowchart', 'diagram');
      expect(confidence).toBeGreaterThan(0);
    });

    it('should return higher confidence for multiple matches', () => {
      // This matches both "flowchart" and "diagram"
      const conf1 = getModeConfidence('flowchart', 'diagram');
      const conf2 = getModeConfidence('flowchart diagram', 'diagram');
      expect(conf2).toBeGreaterThan(conf1);
    });

    it('should return 0 for non-matching mode', () => {
      const confidence = getModeConfidence('Hello world', 'diagram');
      expect(confidence).toBe(0);
    });
  });

  describe('detectAllModes', () => {
    it('should return general for unknown tasks', () => {
      const modes = detectAllModes('Hello');
      expect(modes).toHaveLength(1);
      expect(modes[0].mode).toBe('general');
    });

    it('should return matching modes sorted by confidence', () => {
      const modes = detectAllModes('Create a flowchart diagram');
      expect(modes.length).toBeGreaterThan(0);
      expect(modes[0].mode).toBe('diagram'); // Highest match
    });

    it('should return multiple matching modes', () => {
      // This should match both diagram and generation
      const modes = detectAllModes('Create a diagram');
      expect(modes.length).toBeGreaterThan(1);
    });

    it('should include confidence scores', () => {
      const modes = detectAllModes('Create a flowchart');
      for (const { confidence } of modes) {
        expect(confidence).toBeGreaterThanOrEqual(0);
        expect(confidence).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('MODE_DESCRIPTIONS', () => {
    it('should have description for all modes', () => {
      const modes = [
        'diagram',
        'ui-mockup',
        'moodboard',
        'storyboard',
        'analysis',
        'generation',
        'creative',
        'general',
      ] as const;

      for (const mode of modes) {
        expect(MODE_DESCRIPTIONS[mode]).toBeDefined();
        expect(MODE_DESCRIPTIONS[mode].length).toBeGreaterThan(0);
      }
    });
  });
});
