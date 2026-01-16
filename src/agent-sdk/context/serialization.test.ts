/**
 * Session Serialization Tests
 *
 * Test coverage for:
 * - SessionSerializer save/restore
 * - Storage backends (Memory, File, Custom)
 * - Checkpoints and incremental saves
 * - Migration and versioning
 * - Utility functions
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  // Serializer
  SessionSerializer,
  // Storage backends
  MemoryStorage,
  FileStorage,
  CustomStorage,
  // Factory functions
  createMemorySerializer,
  createFileSerializer,
  createCustomSerializer,
  // Utilities
  generateSessionId,
  exportSessionToJSON,
  importSessionFromJSON,
  cloneSession,
  mergeSessions,
  // Manager
  ContextManager,
  createContextManager,
  createMessage,
  // Types
  MemoryTier,
  MessagePriority,
  SERIALIZATION_VERSION,
  type SerializedSession,
  type SessionStorage,
} from "./index.js";

// =============================================================================
// SessionSerializer Tests
// =============================================================================

describe("SessionSerializer", () => {
  let storage: MemoryStorage;
  let serializer: SessionSerializer;

  beforeEach(() => {
    storage = new MemoryStorage();
    serializer = new SessionSerializer(storage);
  });

  describe("serialize", () => {
    it("should serialize a context manager to session format", () => {
      const manager = createContextManager({ maxTokens: 50000 });
      manager.addSystemMessage("System prompt");
      manager.addUserMessage("Hello");
      manager.addAssistantMessage("Hi there!");

      const session = serializer.serialize(manager, "test-session-1");

      expect(session.version).toBe(SERIALIZATION_VERSION);
      expect(session.sessionId).toBe("test-session-1");
      expect(session.createdAt).toBeLessThanOrEqual(Date.now());
      expect(session.config.maxTokens).toBe(50000);
    });

    it("should serialize messages by tier", () => {
      const manager = createContextManager();
      manager.addSystemMessage("System");
      manager.addUserMessage("User message");
      manager.addToolResult("t1", "Read", "Result");

      const session = serializer.serialize(manager, "test-session");

      expect(session.tiers[MemoryTier.SYSTEM].length).toBe(1);
      expect(session.tiers[MemoryTier.RECENT].length).toBe(1);
      expect(session.tiers[MemoryTier.TOOLS].length).toBe(1);
    });

    it("should include metadata when provided", () => {
      const manager = createContextManager();
      manager.addUserMessage("Hello");

      const session = serializer.serialize(manager, "test", {
        metadata: { userId: "user-123", source: "api" },
      });

      expect(session.metadata).toEqual({ userId: "user-123", source: "api" });
    });

    it("should include compression history when requested", () => {
      const manager = createContextManager();
      manager.addUserMessage("Hello");

      const session = serializer.serialize(manager, "test", {
        includeCompressionHistory: true,
      });

      expect(session.compressions).toEqual([]);
    });

    it("should include stats when requested", () => {
      const manager = createContextManager();
      manager.addUserMessage("One");
      manager.addUserMessage("Two");
      manager.addAssistantMessage("Three");

      const session = serializer.serialize(manager, "test", {
        includeStats: true,
      });

      expect(session.stats.totalMessages).toBe(3);
      expect(session.stats.messagesByRole.user).toBe(2);
      expect(session.stats.messagesByRole.assistant).toBe(1);
    });
  });

  describe("deserialize", () => {
    it("should restore a context manager from session", () => {
      const manager = createContextManager({ maxTokens: 50000 });
      manager.addSystemMessage("System");
      manager.addUserMessage("Hello");

      const session = serializer.serialize(manager, "test");
      const restored = serializer.deserialize(session);

      expect(restored.getMessageCount()).toBe(2);
      expect(restored.getBudget().maxTokens).toBe(50000);
    });

    it("should preserve message content and metadata", () => {
      const manager = createContextManager();
      manager.addUserMessage("Test message");

      const session = serializer.serialize(manager, "test");
      const restored = serializer.deserialize(session);

      const messages = restored.getMessages();
      expect(messages[0].content).toBe("Test message");
      expect(messages[0].role).toBe("user");
    });

    it("should apply config overrides", () => {
      const manager = createContextManager({ maxTokens: 50000 });
      manager.addUserMessage("Hello");

      const session = serializer.serialize(manager, "test");
      const restored = serializer.deserialize(session, {
        configOverrides: { maxTokens: 100000 },
      });

      expect(restored.getBudget().maxTokens).toBe(100000);
    });

    it("should skip old messages when requested", () => {
      const manager = createContextManager();

      // Add message with old timestamp
      const oldMsg = createMessage("user", "Old message", {
        timestamp: Date.now() - 100000,
      });
      manager.addMessage(oldMsg);

      // Add message with recent timestamp
      const newMsg = createMessage("user", "New message", {
        timestamp: Date.now(),
      });
      manager.addMessage(newMsg);

      const session = serializer.serialize(manager, "test");
      const restored = serializer.deserialize(session, {
        skipMessagesBefore: Date.now() - 50000,
      });

      expect(restored.getMessageCount()).toBe(1);
      expect(restored.getMessages()[0].content).toBe("New message");
    });

    it("should throw on unsupported version", () => {
      const session: SerializedSession = {
        version: 999,
        sessionId: "test",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        config: {
          maxTokens: 50000,
          responseReserve: 4000,
          toolReserve: 2000,
          enableCaching: true,
          compressionThreshold: 0.7,
          evictionThreshold: 0.9,
        },
        tiers: {
          [MemoryTier.SYSTEM]: [],
          [MemoryTier.TOOLS]: [],
          [MemoryTier.RESOURCES]: [],
          [MemoryTier.RECENT]: [],
          [MemoryTier.ARCHIVED]: [],
          [MemoryTier.EPHEMERAL]: [],
        },
        budget: {
          maxTokens: 50000,
          allocations: {},
          reservations: [],
        },
        compressions: [],
        stats: {
          totalMessages: 0,
          totalTokens: 0,
          compressionCount: 0,
          evictionCount: 0,
          messagesByRole: { system: 0, user: 0, assistant: 0, tool: 0 },
          messagesByTier: {
            [MemoryTier.SYSTEM]: 0,
            [MemoryTier.TOOLS]: 0,
            [MemoryTier.RESOURCES]: 0,
            [MemoryTier.RECENT]: 0,
            [MemoryTier.ARCHIVED]: 0,
            [MemoryTier.EPHEMERAL]: 0,
          },
        },
      };

      expect(() => serializer.deserialize(session)).toThrow(
        /newer than supported version/
      );
    });
  });

  describe("save and restore", () => {
    it("should save to storage and restore", async () => {
      const manager = createContextManager();
      manager.addSystemMessage("System");
      manager.addUserMessage("Hello");
      manager.addAssistantMessage("Hi!");

      await serializer.save(manager, "session-1");
      const restored = await serializer.restore("session-1");

      expect(restored).not.toBeNull();
      expect(restored!.getMessageCount()).toBe(3);
    });

    it("should return null for non-existent session", async () => {
      const restored = await serializer.restore("non-existent");
      expect(restored).toBeNull();
    });

    it("should overwrite existing session", async () => {
      const manager1 = createContextManager();
      manager1.addUserMessage("First");

      const manager2 = createContextManager();
      manager2.addUserMessage("Second");

      await serializer.save(manager1, "session");
      await serializer.save(manager2, "session");

      const restored = await serializer.restore("session");
      expect(restored!.getMessages()[0].content).toBe("Second");
    });
  });

  describe("checkpoints", () => {
    it("should create checkpoint with new messages", () => {
      const manager = createContextManager();
      const baseTime = Date.now() - 1000;

      // Add some initial messages
      const msg1 = createMessage("user", "Old message", { timestamp: baseTime });
      manager.addMessage(msg1);

      // Add new messages after checkpoint time
      const msg2 = createMessage("user", "New message", {
        timestamp: Date.now(),
      });
      manager.addMessage(msg2);

      const checkpoint = serializer.createCheckpoint(
        manager,
        "session-1",
        baseTime
      );

      expect(checkpoint.sessionId).toBe("session-1");
      expect(checkpoint.newMessages.length).toBe(1);
      expect(checkpoint.newMessages[0].content).toBe("New message");
    });

    it("should save checkpoint to storage", async () => {
      const manager = createContextManager();
      manager.addUserMessage("Test");

      const checkpoint = await serializer.saveCheckpoint(
        manager,
        "session-1",
        0
      );

      expect(checkpoint.checkpointId).toMatch(/^cp_/);
      expect(checkpoint.timestamp).toBeLessThanOrEqual(Date.now());
    });
  });

  describe("storage operations", () => {
    it("should list sessions", async () => {
      const m1 = createContextManager();
      m1.addUserMessage("One");
      await serializer.save(m1, "session-1");

      const m2 = createContextManager();
      m2.addUserMessage("Two");
      await serializer.save(m2, "session-2");

      const sessions = await serializer.list();
      expect(sessions).toContain("session-1");
      expect(sessions).toContain("session-2");
    });

    it("should delete sessions", async () => {
      const manager = createContextManager();
      manager.addUserMessage("Test");
      await serializer.save(manager, "to-delete");

      expect(await serializer.exists("to-delete")).toBe(true);

      await serializer.delete("to-delete");

      expect(await serializer.exists("to-delete")).toBe(false);
    });

    it("should check existence", async () => {
      expect(await serializer.exists("missing")).toBe(false);

      const manager = createContextManager();
      await serializer.save(manager, "exists");

      expect(await serializer.exists("exists")).toBe(true);
    });
  });
});

// =============================================================================
// MemoryStorage Tests
// =============================================================================

describe("MemoryStorage", () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  it("should save and load sessions", async () => {
    const session: SerializedSession = {
      version: 1,
      sessionId: "mem-test",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      config: {
        maxTokens: 50000,
        responseReserve: 4000,
        toolReserve: 2000,
        enableCaching: true,
        compressionThreshold: 0.7,
        evictionThreshold: 0.9,
      },
      tiers: {
        [MemoryTier.SYSTEM]: [],
        [MemoryTier.TOOLS]: [],
        [MemoryTier.RESOURCES]: [],
        [MemoryTier.RECENT]: [],
        [MemoryTier.ARCHIVED]: [],
        [MemoryTier.EPHEMERAL]: [],
      },
      budget: { maxTokens: 50000, allocations: {}, reservations: [] },
      compressions: [],
      stats: {
        totalMessages: 0,
        totalTokens: 0,
        compressionCount: 0,
        evictionCount: 0,
        messagesByRole: { system: 0, user: 0, assistant: 0, tool: 0 },
        messagesByTier: {
          [MemoryTier.SYSTEM]: 0,
          [MemoryTier.TOOLS]: 0,
          [MemoryTier.RESOURCES]: 0,
          [MemoryTier.RECENT]: 0,
          [MemoryTier.ARCHIVED]: 0,
          [MemoryTier.EPHEMERAL]: 0,
        },
      },
    };

    await storage.save(session);
    const loaded = await storage.load("mem-test");

    expect(loaded).not.toBeNull();
    expect(loaded!.sessionId).toBe("mem-test");
  });

  it("should isolate stored sessions (deep clone)", async () => {
    const session: SerializedSession = {
      version: 1,
      sessionId: "clone-test",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      config: {
        maxTokens: 50000,
        responseReserve: 4000,
        toolReserve: 2000,
        enableCaching: true,
        compressionThreshold: 0.7,
        evictionThreshold: 0.9,
      },
      tiers: {
        [MemoryTier.SYSTEM]: [],
        [MemoryTier.TOOLS]: [],
        [MemoryTier.RESOURCES]: [],
        [MemoryTier.RECENT]: [
          {
            id: "msg1",
            role: "user",
            content: "Original",
            timestamp: Date.now(),
            tokens: 10,
            priority: MessagePriority.NORMAL,
            compressible: true,
          },
        ],
        [MemoryTier.ARCHIVED]: [],
        [MemoryTier.EPHEMERAL]: [],
      },
      budget: { maxTokens: 50000, allocations: {}, reservations: [] },
      compressions: [],
      stats: {
        totalMessages: 1,
        totalTokens: 10,
        compressionCount: 0,
        evictionCount: 0,
        messagesByRole: { system: 0, user: 1, assistant: 0, tool: 0 },
        messagesByTier: {
          [MemoryTier.SYSTEM]: 0,
          [MemoryTier.TOOLS]: 0,
          [MemoryTier.RESOURCES]: 0,
          [MemoryTier.RECENT]: 1,
          [MemoryTier.ARCHIVED]: 0,
          [MemoryTier.EPHEMERAL]: 0,
        },
      },
    };

    await storage.save(session);

    // Modify original
    session.tiers[MemoryTier.RECENT][0].content = "Modified";

    // Load should have original
    const loaded = await storage.load("clone-test");
    expect(loaded!.tiers[MemoryTier.RECENT][0].content).toBe("Original");
  });

  it("should save and load checkpoints", async () => {
    const checkpoint = {
      checkpointId: "cp_1",
      sessionId: "session-1",
      timestamp: Date.now(),
      newMessages: [],
      evictedIds: [],
      budgetDelta: { allocations: {} },
    };

    await storage.saveCheckpoint(checkpoint);
    const checkpoints = await storage.loadCheckpoints("session-1", 0);

    expect(checkpoints.length).toBe(1);
    expect(checkpoints[0].checkpointId).toBe("cp_1");
  });

  it("should filter checkpoints by timestamp", async () => {
    const now = Date.now();

    await storage.saveCheckpoint({
      checkpointId: "cp_old",
      sessionId: "session-1",
      timestamp: now - 1000,
      newMessages: [],
      evictedIds: [],
      budgetDelta: { allocations: {} },
    });

    await storage.saveCheckpoint({
      checkpointId: "cp_new",
      sessionId: "session-1",
      timestamp: now,
      newMessages: [],
      evictedIds: [],
      budgetDelta: { allocations: {} },
    });

    const checkpoints = await storage.loadCheckpoints("session-1", now - 500);
    expect(checkpoints.length).toBe(1);
    expect(checkpoints[0].checkpointId).toBe("cp_new");
  });

  it("should clear all data", async () => {
    const manager = createContextManager();
    const serializer = new SessionSerializer(storage);
    await serializer.save(manager, "session-1");
    await serializer.save(manager, "session-2");

    storage.clear();

    const sessions = await storage.list();
    expect(sessions.length).toBe(0);
  });
});

// =============================================================================
// CustomStorage Tests
// =============================================================================

describe("CustomStorage", () => {
  it("should delegate to custom handlers", async () => {
    const mockStorage: SessionStorage = {
      save: vi.fn().mockResolvedValue(undefined),
      load: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue(["session-1"]),
      exists: vi.fn().mockResolvedValue(true),
    };

    const custom = new CustomStorage(mockStorage);

    await custom.save({} as SerializedSession);
    await custom.load("test");
    await custom.delete("test");
    await custom.list();
    await custom.exists("test");

    expect(mockStorage.save).toHaveBeenCalled();
    expect(mockStorage.load).toHaveBeenCalled();
    expect(mockStorage.delete).toHaveBeenCalled();
    expect(mockStorage.list).toHaveBeenCalled();
    expect(mockStorage.exists).toHaveBeenCalled();
  });

  it("should handle optional checkpoint methods", async () => {
    const mockStorage: SessionStorage = {
      save: vi.fn().mockResolvedValue(undefined),
      load: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue([]),
      exists: vi.fn().mockResolvedValue(false),
      // No checkpoint methods
    };

    const custom = new CustomStorage(mockStorage);

    // Should not throw
    await custom.saveCheckpoint({
      checkpointId: "cp_1",
      sessionId: "session-1",
      timestamp: Date.now(),
      newMessages: [],
      evictedIds: [],
      budgetDelta: { allocations: {} },
    });

    const checkpoints = await custom.loadCheckpoints("session-1", 0);
    expect(checkpoints).toEqual([]);
  });
});

// =============================================================================
// Factory Functions Tests
// =============================================================================

describe("Factory Functions", () => {
  it("should create memory serializer", () => {
    const serializer = createMemorySerializer();
    expect(serializer).toBeInstanceOf(SessionSerializer);
  });

  it("should create file serializer", () => {
    const serializer = createFileSerializer("/tmp/sessions");
    expect(serializer).toBeInstanceOf(SessionSerializer);
  });

  it("should create custom serializer", () => {
    const mockStorage: SessionStorage = {
      save: vi.fn(),
      load: vi.fn(),
      delete: vi.fn(),
      list: vi.fn(),
      exists: vi.fn(),
    };

    const serializer = createCustomSerializer(mockStorage);
    expect(serializer).toBeInstanceOf(SessionSerializer);
  });
});

// =============================================================================
// Utility Functions Tests
// =============================================================================

describe("Utility Functions", () => {
  describe("generateSessionId", () => {
    it("should generate unique IDs", () => {
      const id1 = generateSessionId();
      const id2 = generateSessionId();

      expect(id1).not.toBe(id2);
    });

    it("should use custom prefix", () => {
      const id = generateSessionId("custom");
      expect(id).toMatch(/^custom_/);
    });

    it("should generate default prefix", () => {
      const id = generateSessionId();
      expect(id).toMatch(/^session_/);
    });
  });

  describe("exportSessionToJSON", () => {
    it("should export manager to JSON string", () => {
      const manager = createContextManager();
      manager.addUserMessage("Hello");

      const json = exportSessionToJSON(manager, "test-export");

      expect(typeof json).toBe("string");

      const parsed = JSON.parse(json);
      expect(parsed.sessionId).toBe("test-export");
      expect(parsed.version).toBe(SERIALIZATION_VERSION);
    });

    it("should be valid JSON", () => {
      const manager = createContextManager();
      manager.addUserMessage("Test");

      const json = exportSessionToJSON(manager, "test");

      expect(() => JSON.parse(json)).not.toThrow();
    });
  });

  describe("importSessionFromJSON", () => {
    it("should import manager from JSON string", () => {
      const original = createContextManager({ maxTokens: 50000 });
      original.addUserMessage("Hello");
      original.addAssistantMessage("Hi!");

      const json = exportSessionToJSON(original, "test");
      const restored = importSessionFromJSON(json);

      expect(restored.getMessageCount()).toBe(2);
      expect(restored.getBudget().maxTokens).toBe(50000);
    });

    it("should round-trip messages correctly", () => {
      const original = createContextManager();
      original.addSystemMessage("System");
      original.addUserMessage("User message");
      original.addAssistantMessage("Assistant message");
      original.addToolResult("t1", "Read", '{"data": "test"}');

      const json = exportSessionToJSON(original, "test");
      const restored = importSessionFromJSON(json);

      const messages = restored.getMessages();
      expect(messages.find((m) => m.role === "system")?.content).toBe("System");
      expect(messages.find((m) => m.role === "user")?.content).toBe(
        "User message"
      );
      expect(messages.find((m) => m.role === "assistant")?.content).toBe(
        "Assistant message"
      );
      expect(messages.find((m) => m.role === "tool")).toBeDefined();
    });
  });

  describe("cloneSession", () => {
    it("should create independent clone", () => {
      const original = createContextManager();
      original.addUserMessage("Original");

      const clone = cloneSession(original);

      // Clone should have same messages
      expect(clone.getMessageCount()).toBe(1);
      expect(clone.getMessages()[0].content).toBe("Original");

      // Modifications should be independent
      clone.addUserMessage("Clone only");
      expect(clone.getMessageCount()).toBe(2);
      expect(original.getMessageCount()).toBe(1);
    });

    it("should use custom session ID", () => {
      const original = createContextManager();
      original.addUserMessage("Test");

      const clone = cloneSession(original, "custom-clone-id");
      const json = exportSessionToJSON(clone, "custom-clone-id");
      const parsed = JSON.parse(json);

      expect(parsed.sessionId).toBe("custom-clone-id");
    });
  });

  describe("mergeSessions", () => {
    it("should merge with append strategy", () => {
      const primary = createContextManager();
      primary.addUserMessage("Primary");

      const secondary = createContextManager();
      secondary.addUserMessage("Secondary");

      const merged = mergeSessions(primary, secondary);

      expect(merged.getMessageCount()).toBe(2);
    });

    it("should deduplicate by content", () => {
      const primary = createContextManager();
      primary.addUserMessage("Same content");

      const secondary = createContextManager();
      secondary.addUserMessage("Same content");

      const merged = mergeSessions(primary, secondary, {
        deduplicateByContent: true,
      });

      // Should only have one message
      expect(merged.getMessageCount()).toBe(1);
    });

    it("should interleave by timestamp", () => {
      const primary = createContextManager();
      const secondary = createContextManager();

      // Primary: t=1000, t=3000
      const p1 = createMessage("user", "P1", { timestamp: 1000 });
      const p2 = createMessage("user", "P2", { timestamp: 3000 });
      primary.addMessage(p1);
      primary.addMessage(p2);

      // Secondary: t=2000
      const s1 = createMessage("user", "S1", { timestamp: 2000 });
      secondary.addMessage(s1);

      const merged = mergeSessions(primary, secondary, {
        strategy: "interleave",
      });

      const messages = merged.getMessages();
      expect(messages[0].timestamp).toBe(1000);
      expect(messages[1].timestamp).toBe(2000);
      expect(messages[2].timestamp).toBe(3000);
    });
  });
});

// =============================================================================
// ContextManager Serialization Support Tests
// =============================================================================

describe("ContextManager Serialization Support", () => {
  describe("getConfig", () => {
    it("should return config copy", () => {
      const manager = createContextManager({ maxTokens: 75000 });
      const config = manager.getConfig();

      expect(config.maxTokens).toBe(75000);
    });

    it("should return independent copy", () => {
      const manager = createContextManager({ maxTokens: 50000 });
      const config1 = manager.getConfig();
      const config2 = manager.getConfig();

      config1.maxTokens = 100000;
      expect(config2.maxTokens).toBe(50000);
    });
  });

  describe("getCompressionHistory", () => {
    it("should return compression history copy", () => {
      const manager = createContextManager();
      const history = manager.getCompressionHistory();

      expect(Array.isArray(history)).toBe(true);
    });

    it("should return independent copy", () => {
      const manager = createContextManager();
      const history1 = manager.getCompressionHistory();
      const history2 = manager.getCompressionHistory();

      history1.push({} as any);
      expect(history2.length).toBe(0);
    });
  });

  describe("integration with serialization utilities", () => {
    it("should work with exportSessionToJSON", () => {
      const manager = createContextManager({ maxTokens: 50000 });
      manager.addUserMessage("Hello");

      const json = exportSessionToJSON(manager, "test-session");

      expect(typeof json).toBe("string");
      const parsed = JSON.parse(json);
      expect(parsed.sessionId).toBe("test-session");
    });

    it("should work with importSessionFromJSON", () => {
      const original = createContextManager({ maxTokens: 50000 });
      original.addUserMessage("Test");

      const json = exportSessionToJSON(original, "test");
      const restored = importSessionFromJSON(json);

      expect(restored.getMessageCount()).toBe(1);
      expect(restored.getBudget().maxTokens).toBe(50000);
    });
  });
});

// =============================================================================
// Edge Cases and Error Handling
// =============================================================================

describe("Edge Cases", () => {
  it("should handle empty context manager", async () => {
    const serializer = createMemorySerializer();
    const manager = createContextManager();

    await serializer.save(manager, "empty");
    const restored = await serializer.restore("empty");

    expect(restored).not.toBeNull();
    expect(restored!.getMessageCount()).toBe(0);
  });

  it("should handle large number of messages", () => {
    const manager = createContextManager({ maxTokens: 200000 });

    for (let i = 0; i < 500; i++) {
      manager.addUserMessage(`Message ${i}`);
    }

    const json = exportSessionToJSON(manager, "large");
    const restored = importSessionFromJSON(json);

    expect(restored.getMessageCount()).toBe(500);
  });

  it("should handle special characters in content", () => {
    const manager = createContextManager();
    manager.addUserMessage('Special chars: 日本語 emoji 🎉 "quotes" \\backslash');

    const json = exportSessionToJSON(manager, "special");
    const restored = importSessionFromJSON(json);

    expect(restored.getMessages()[0].content).toContain("日本語");
    expect(restored.getMessages()[0].content).toContain("🎉");
  });

  it("should preserve message IDs across serialization", () => {
    const manager = createContextManager();
    const msg = createMessage("user", "Test", { id: "custom-id-123" });
    manager.addMessage(msg);

    const json = exportSessionToJSON(manager, "test");
    const restored = importSessionFromJSON(json);

    expect(restored.getMessages()[0].id).toBe("custom-id-123");
  });

  it("should handle concurrent saves", async () => {
    const serializer = createMemorySerializer();
    const manager = createContextManager();
    manager.addUserMessage("Test");

    // Save same session multiple times concurrently
    await Promise.all([
      serializer.save(manager, "concurrent"),
      serializer.save(manager, "concurrent"),
      serializer.save(manager, "concurrent"),
    ]);

    const restored = await serializer.restore("concurrent");
    expect(restored).not.toBeNull();
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe("Integration", () => {
  it("should support full workflow: create -> save -> restore -> continue", async () => {
    const serializer = createMemorySerializer();

    // Create and populate
    const manager = createContextManager({ maxTokens: 50000 });
    manager.addSystemMessage("You are a helpful assistant");
    manager.addUserMessage("Hello!");
    manager.addAssistantMessage("Hi there! How can I help?");

    // Save
    await serializer.save(manager, "workflow-test");

    // Restore
    const restored = await serializer.restore("workflow-test");
    expect(restored).not.toBeNull();

    // Continue conversation
    restored!.addUserMessage("What's the weather?");
    restored!.addAssistantMessage("I don't have access to weather data.");

    // Verify
    expect(restored!.getMessageCount()).toBe(5);

    // Save updated state
    await serializer.save(restored!, "workflow-test");

    // Verify persistence
    const final = await serializer.restore("workflow-test");
    expect(final!.getMessageCount()).toBe(5);
  });

  it("should support branching conversations", async () => {
    const serializer = createMemorySerializer();

    // Create base conversation
    const base = createContextManager();
    base.addUserMessage("Should I go left or right?");

    await serializer.save(base, "base");

    // Branch 1: Go left
    const branch1 = await serializer.restore("base");
    branch1!.addAssistantMessage("Go left!");
    branch1!.addUserMessage("I went left and found treasure!");
    await serializer.save(branch1!, "branch-left");

    // Branch 2: Go right
    const branch2 = await serializer.restore("base");
    branch2!.addAssistantMessage("Go right!");
    branch2!.addUserMessage("I went right and found a dragon!");
    await serializer.save(branch2!, "branch-right");

    // Verify branches are independent
    const left = await serializer.restore("branch-left");
    const right = await serializer.restore("branch-right");

    expect(left!.getMessages()[1].content).toBe("Go left!");
    expect(right!.getMessages()[1].content).toBe("Go right!");
  });
});
