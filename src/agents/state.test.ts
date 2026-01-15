/**
 * Resources Module Tests
 *
 * Tests for stateless resource management.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createResources,
  cloneResources,
  updateCanvas,
  updateTask,
  addHistory,
  addError,
  createCheckpoint,
  serializeResources,
  deserializeResources,
  getResourcesSummary,
  type AgentResources,
  type HistoryEntry,
} from './state.js';

describe('Resources Module', () => {
  describe('createResources', () => {
    it('should create resources with canvas ID', () => {
      const resources = createResources('agent-123');
      expect(resources.canvas.id).toBe('agent-123');
    });

    it('should initialize canvas with version 0', () => {
      const resources = createResources('agent-123');
      expect(resources.canvas.version).toBe(0);
    });

    it('should initialize task with pending status', () => {
      const resources = createResources('agent-123');
      expect(resources.task.status).toBe('pending');
    });

    it('should initialize task with step 0', () => {
      const resources = createResources('agent-123');
      expect(resources.task.currentStep).toBe(0);
    });

    it('should initialize task with empty errors', () => {
      const resources = createResources('agent-123');
      expect(resources.task.errors).toHaveLength(0);
    });

    it('should initialize context with default token budget', () => {
      const resources = createResources('agent-123');
      expect(resources.context.tokenBudget).toBe(8000);
    });

    it('should initialize context with lazy strategy', () => {
      const resources = createResources('agent-123');
      expect(resources.context.strategies).toContain('lazy');
    });

    it('should initialize history with empty operations', () => {
      const resources = createResources('agent-123');
      expect(resources.history.operations).toHaveLength(0);
    });

    it('should initialize history with maxEntries 50', () => {
      const resources = createResources('agent-123');
      expect(resources.history.maxEntries).toBe(50);
    });

    it('should generate unique task ID', () => {
      const r1 = createResources('agent-1');
      const r2 = createResources('agent-2');
      expect(r1.task.id).not.toBe(r2.task.id);
    });
  });

  describe('cloneResources', () => {
    let resources: AgentResources;

    beforeEach(() => {
      resources = createResources('agent-123');
    });

    it('should create a new object', () => {
      const cloned = cloneResources(resources);
      expect(cloned).not.toBe(resources);
    });

    it('should clone canvas', () => {
      const cloned = cloneResources(resources);
      expect(cloned.canvas).not.toBe(resources.canvas);
      expect(cloned.canvas.id).toBe(resources.canvas.id);
    });

    it('should clone task', () => {
      const cloned = cloneResources(resources);
      expect(cloned.task).not.toBe(resources.task);
      expect(cloned.task.id).toBe(resources.task.id);
    });

    it('should clone context', () => {
      const cloned = cloneResources(resources);
      expect(cloned.context).not.toBe(resources.context);
      expect(cloned.context.tokenBudget).toBe(resources.context.tokenBudget);
    });

    it('should clone history', () => {
      const cloned = cloneResources(resources);
      expect(cloned.history).not.toBe(resources.history);
      expect(cloned.history.maxEntries).toBe(resources.history.maxEntries);
    });

    it('should deep clone arrays', () => {
      resources.task.errors.push({
        code: 'ERR',
        message: 'Test',
        timestamp: Date.now(),
        recoverable: true,
      });
      const cloned = cloneResources(resources);
      expect(cloned.task.errors).not.toBe(resources.task.errors);
      expect(cloned.task.errors).toHaveLength(1);
    });
  });

  describe('updateCanvas', () => {
    it('should update canvas version', () => {
      const resources = createResources('agent-123');
      const updated = updateCanvas(resources, { version: 5 });
      expect(updated.canvas.version).toBe(5);
    });

    it('should preserve other canvas properties', () => {
      const resources = createResources('agent-123');
      const updated = updateCanvas(resources, { version: 5 });
      expect(updated.canvas.id).toBe('agent-123');
    });

    it('should not mutate original resources', () => {
      const resources = createResources('agent-123');
      updateCanvas(resources, { version: 5 });
      expect(resources.canvas.version).toBe(0);
    });

    it('should update summary', () => {
      const resources = createResources('agent-123');
      const updated = updateCanvas(resources, {
        summary: {
          elementCount: 10,
          typeBreakdown: { rectangle: 5, text: 5 },
          bounds: { x: 0, y: 0, width: 1000, height: 800 },
          frameCount: 2,
        },
      });
      expect(updated.canvas.summary?.elementCount).toBe(10);
    });
  });

  describe('updateTask', () => {
    it('should update task status', () => {
      const resources = createResources('agent-123');
      const updated = updateTask(resources, { status: 'executing' });
      expect(updated.task.status).toBe('executing');
    });

    it('should update current step', () => {
      const resources = createResources('agent-123');
      const updated = updateTask(resources, { currentStep: 3 });
      expect(updated.task.currentStep).toBe(3);
    });

    it('should not mutate original resources', () => {
      const resources = createResources('agent-123');
      updateTask(resources, { status: 'executing' });
      expect(resources.task.status).toBe('pending');
    });
  });

  describe('addHistory', () => {
    it('should add history entry', () => {
      const resources = createResources('agent-123');
      const entry: HistoryEntry = {
        tool: 'canvas_write',
        input: { elements: [] },
        result: { success: true },
        timestamp: Date.now(),
        duration: 100,
        success: true,
      };
      const updated = addHistory(resources, entry);
      expect(updated.history.operations).toHaveLength(1);
    });

    it('should preserve existing entries', () => {
      let resources = createResources('agent-123');
      const entry1: HistoryEntry = {
        tool: 'canvas_read',
        input: {},
        result: {},
        timestamp: Date.now(),
        duration: 50,
        success: true,
      };
      const entry2: HistoryEntry = {
        tool: 'canvas_write',
        input: {},
        result: {},
        timestamp: Date.now(),
        duration: 100,
        success: true,
      };
      resources = addHistory(resources, entry1);
      resources = addHistory(resources, entry2);
      expect(resources.history.operations).toHaveLength(2);
    });

    it('should respect maxEntries limit', () => {
      let resources = createResources('agent-123');
      // Override maxEntries for testing
      resources = {
        ...resources,
        history: { ...resources.history, maxEntries: 3 },
      };

      // Add 5 entries
      for (let i = 0; i < 5; i++) {
        resources = addHistory(resources, {
          tool: 'canvas_read',
          input: { i },
          result: {},
          timestamp: Date.now(),
          duration: 10,
          success: true,
        });
      }

      expect(resources.history.operations).toHaveLength(3);
      // Should keep the most recent entries
      expect((resources.history.operations[0].input as { i: number }).i).toBe(2);
    });
  });

  describe('addError', () => {
    it('should add error to task', () => {
      const resources = createResources('agent-123');
      const updated = addError(resources, {
        code: 'TOOL_ERROR',
        message: 'Failed to execute tool',
        recoverable: true,
        tool: 'canvas_write',
      });
      expect(updated.task.errors).toHaveLength(1);
    });

    it('should automatically add timestamp', () => {
      const resources = createResources('agent-123');
      const before = Date.now();
      const updated = addError(resources, {
        code: 'ERR',
        message: 'Test',
        recoverable: true,
      });
      const after = Date.now();
      expect(updated.task.errors[0].timestamp).toBeGreaterThanOrEqual(before);
      expect(updated.task.errors[0].timestamp).toBeLessThanOrEqual(after);
    });

    it('should preserve existing errors', () => {
      let resources = createResources('agent-123');
      resources = addError(resources, {
        code: 'ERR1',
        message: 'Error 1',
        recoverable: true,
      });
      resources = addError(resources, {
        code: 'ERR2',
        message: 'Error 2',
        recoverable: false,
      });
      expect(resources.task.errors).toHaveLength(2);
    });
  });

  describe('createCheckpoint', () => {
    it('should create checkpoint with current step', () => {
      let resources = createResources('agent-123');
      resources = updateTask(resources, { currentStep: 5 });
      resources = createCheckpoint(resources);
      expect(resources.task.checkpoint?.step).toBe(5);
    });

    it('should create checkpoint with canvas version', () => {
      let resources = createResources('agent-123');
      resources = updateCanvas(resources, { version: 3 });
      resources = createCheckpoint(resources);
      expect(resources.task.checkpoint?.canvasVersion).toBe(3);
    });

    it('should include timestamp', () => {
      const resources = createResources('agent-123');
      const before = Date.now();
      const updated = createCheckpoint(resources);
      const after = Date.now();
      expect(updated.task.checkpoint?.timestamp).toBeGreaterThanOrEqual(before);
      expect(updated.task.checkpoint?.timestamp).toBeLessThanOrEqual(after);
    });

    it('should include optional data', () => {
      const resources = createResources('agent-123');
      const updated = createCheckpoint(resources, { custom: 'data' });
      expect(updated.task.checkpoint?.data).toEqual({ custom: 'data' });
    });
  });

  describe('serializeResources / deserializeResources', () => {
    it('should round-trip resources', () => {
      const original = createResources('agent-123');
      const serialized = serializeResources(original);
      const deserialized = deserializeResources(serialized);

      expect(deserialized.canvas.id).toBe(original.canvas.id);
      expect(deserialized.task.status).toBe(original.task.status);
      expect(deserialized.context.tokenBudget).toBe(original.context.tokenBudget);
    });

    it('should serialize to valid JSON', () => {
      const resources = createResources('agent-123');
      const serialized = serializeResources(resources);
      expect(() => JSON.parse(serialized)).not.toThrow();
    });

    it('should preserve complex state', () => {
      let resources = createResources('agent-123');
      resources = updateCanvas(resources, { version: 10 });
      resources = updateTask(resources, { status: 'executing', currentStep: 3 });
      resources = addHistory(resources, {
        tool: 'canvas_write',
        input: { test: true },
        result: { success: true },
        timestamp: 12345,
        duration: 100,
        success: true,
      });

      const serialized = serializeResources(resources);
      const deserialized = deserializeResources(serialized);

      expect(deserialized.canvas.version).toBe(10);
      expect(deserialized.task.status).toBe('executing');
      expect(deserialized.history.operations).toHaveLength(1);
    });
  });

  describe('getResourcesSummary', () => {
    it('should return human-readable summary', () => {
      let resources = createResources('agent-123');
      resources = updateCanvas(resources, { version: 5 });
      resources = updateTask(resources, { status: 'executing', currentStep: 2 });

      const summary = getResourcesSummary(resources);

      expect(summary).toContain('v5');
      expect(summary).toContain('executing');
      expect(summary).toContain('step 2');
    });

    it('should include token usage', () => {
      let resources = createResources('agent-123');
      resources = {
        ...resources,
        context: { ...resources.context, tokensUsed: 1500 },
      };

      const summary = getResourcesSummary(resources);
      expect(summary).toContain('1500/8000');
    });

    it('should include operation count', () => {
      let resources = createResources('agent-123');
      resources = addHistory(resources, {
        tool: 'canvas_read',
        input: {},
        result: {},
        timestamp: Date.now(),
        duration: 10,
        success: true,
      });

      const summary = getResourcesSummary(resources);
      expect(summary).toContain('1 ops');
    });
  });
});
