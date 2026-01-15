/**
 * Agent Types Tests
 *
 * Tests for agent type definitions and utilities.
 */

import { describe, it, expect } from 'vitest';
import {
  createCancellationToken,
  type AgentConfig,
  type AgentMode,
  type CancellationToken,
} from './types.js';

describe('Agent Types', () => {
  describe('createCancellationToken', () => {
    it('should create token with cancelled=false', () => {
      const token = createCancellationToken();
      expect(token.cancelled).toBe(false);
    });

    it('should create token with undefined reason', () => {
      const token = createCancellationToken();
      expect(token.reason).toBeUndefined();
    });

    it('should cancel with default reason', () => {
      const token = createCancellationToken();
      token.cancel();
      expect(token.cancelled).toBe(true);
      expect(token.reason).toBe('User cancelled');
    });

    it('should cancel with custom reason', () => {
      const token = createCancellationToken();
      token.cancel('Timeout exceeded');
      expect(token.cancelled).toBe(true);
      expect(token.reason).toBe('Timeout exceeded');
    });

    it('should remain cancelled after multiple cancel calls', () => {
      const token = createCancellationToken();
      token.cancel('First reason');
      token.cancel('Second reason');
      expect(token.cancelled).toBe(true);
      // Note: reason gets overwritten, which is expected behavior
    });
  });

  describe('AgentConfig type', () => {
    it('should accept minimal config', () => {
      const config: AgentConfig = {
        canvasId: 'canvas-123',
      };
      expect(config.canvasId).toBe('canvas-123');
    });

    it('should accept full config', () => {
      const config: AgentConfig = {
        canvasId: 'canvas-123',
        sessionId: 'session-456',
        model: 'sonnet',
        systemPrompt: 'You are a canvas agent',
        maxIterations: 10,
        tokenBudget: 4000,
        verbose: true,
        autoDetectMode: true,
        mode: 'diagram',
      };
      expect(config.model).toBe('sonnet');
      expect(config.maxIterations).toBe(10);
    });

    it('should accept all model types', () => {
      const models: AgentConfig['model'][] = ['sonnet', 'opus', 'haiku'];
      for (const model of models) {
        const config: AgentConfig = { canvasId: 'test', model };
        expect(config.model).toBe(model);
      }
    });
  });

  describe('AgentMode type', () => {
    it('should accept all valid modes', () => {
      const modes: AgentMode[] = [
        'general',
        'generation',
        'diagram',
        'ui-mockup',
        'moodboard',
        'storyboard',
        'creative',
        'analysis',
      ];

      for (const mode of modes) {
        const config: AgentConfig = { canvasId: 'test', mode };
        expect(config.mode).toBe(mode);
      }
    });
  });
});
