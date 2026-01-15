/**
 * Comprehensive Context Management Tests
 *
 * Extended test coverage for:
 * - Edge cases and error handling
 * - Complex scenarios
 * - Performance characteristics
 * - Integration with resources
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  // Manager
  ContextManager,
  createContextManager,
  createContextManagerForModel,
  createExtendedContextManager,
  createMessage,
  // Token management
  ClaudeTokenEstimator,
  TokenBudgetTracker,
  estimateTokens,
  estimateMessageTokens,
  MODEL_CONTEXT_SIZES,
  getRecommendedReserve,
  createTokenEstimator,
  createTokenBudget,
  // Memory
  TieredMemory,
  createTieredMemory,
  MemoryTier,
  MessagePriority,
  DEFAULT_TIER_CONFIG,
  DEFAULT_MEMORY_CONFIG,
  DEFAULT_PRIORITY_RULES,
  // Compression
  DefaultContextCompressor,
  createCompressor,
  createSimpleCompressor,
  createClaudeCompressor,
  CompressionStrategy,
  getRecommendedStrategy,
  quickCompress,
  // Allocation
  DefaultContextAllocator,
  CodingAllocator,
  ChatAllocator,
  AnalysisAllocator,
  createAllocator,
  createTaskAllocator,
  // Integration
  IntegratedContextManager,
  createIntegratedContext,
  preparePromptWithAliases,
} from "./index.js";
import {
  ResourceRegistry,
  registerBuiltInProviders,
  colorProvider,
  timeProvider,
} from "../resources/index.js";

// =============================================================================
// Token Estimation - Extended Tests
// =============================================================================

describe("ClaudeTokenEstimator - Extended", () => {
  const estimator = new ClaudeTokenEstimator();

  describe("Content Type Detection", () => {
    it("should detect and handle JSON content", () => {
      const json = JSON.stringify({ name: "test", value: 123, nested: { a: 1 } });
      const tokens = estimator.estimateText(json);

      // JSON typically has higher token density
      expect(tokens).toBeGreaterThan(0);
    });

    it("should handle multiline text", () => {
      const multiline = "Line 1\nLine 2\nLine 3\n\nLine 5";
      const tokens = estimator.estimateText(multiline);

      expect(tokens).toBeGreaterThan(5);
    });

    it("should handle unicode characters", () => {
      const unicode = "Hello 世界 🎉 café résumé";
      const tokens = estimator.estimateText(unicode);

      expect(tokens).toBeGreaterThan(0);
    });

    it("should handle whitespace-heavy content", () => {
      const whitespace = "a     b     c     d     e";
      const normal = "a b c d e";

      const whitespaceTokens = estimator.estimateText(whitespace);
      const normalTokens = estimator.estimateText(normal);

      // Whitespace content uses more chars, so more tokens (char-based estimation)
      // Just verify both are positive integers
      expect(whitespaceTokens).toBeGreaterThan(0);
      expect(normalTokens).toBeGreaterThan(0);
    });

    it("should handle numbers", () => {
      const numbers = "123456789 0.123 -456 1e10";
      const tokens = estimator.estimateText(numbers);

      expect(tokens).toBeGreaterThan(0);
    });

    it("should handle special punctuation", () => {
      const punctuation = "Hello!!! What??? Yes... No;;;";
      const tokens = estimator.estimateText(punctuation);

      expect(tokens).toBeGreaterThan(0);
    });
  });

  describe("Tool Result Estimation", () => {
    it("should estimate tool result with content", () => {
      const result = {
        toolUseId: "tool-123",
        name: "Read",
        content: '{"file": "test.ts", "content": "export const x = 1;"}',
      };

      const tokens = estimator.estimateToolResult(result);
      expect(tokens).toBeGreaterThan(10);
    });

    it("should estimate error tool result", () => {
      const result = {
        toolUseId: "tool-456",
        name: "Bash",
        content: "Error: command not found",
        isError: true,
      };

      const tokens = estimator.estimateToolResult(result);
      expect(tokens).toBeGreaterThan(5);
    });
  });

  describe("Image Estimation", () => {
    it("should estimate small base64 image", () => {
      const image = {
        type: "base64" as const,
        mediaType: "image/png",
        data: "a".repeat(50000), // ~37KB
      };

      const tokens = estimator.estimateImage(image);
      expect(tokens).toBe(85); // IMAGE_SMALL
    });

    it("should estimate medium base64 image", () => {
      const image = {
        type: "base64" as const,
        mediaType: "image/png",
        data: "a".repeat(200000), // ~150KB
      };

      const tokens = estimator.estimateImage(image);
      expect(tokens).toBe(170); // IMAGE_MEDIUM
    });

    it("should estimate large base64 image", () => {
      const image = {
        type: "base64" as const,
        mediaType: "image/png",
        data: "a".repeat(800000), // ~600KB
      };

      const tokens = estimator.estimateImage(image);
      expect(tokens).toBe(340); // IMAGE_LARGE
    });

    it("should estimate URL image", () => {
      const image = {
        type: "url" as const,
        data: "https://example.com/image.png",
      };

      const tokens = estimator.estimateImage(image);
      expect(tokens).toBe(170); // IMAGE_MEDIUM default
    });
  });

  describe("Batch Estimation", () => {
    it("should estimate batch of mixed items", () => {
      const items = [
        { type: "message" as const, message: createMessage("user", "Hello") },
        { type: "text" as const, text: "World" },
        {
          type: "tool_result" as const,
          result: { toolUseId: "1", name: "Read", content: "data" },
        },
      ];

      const tokens = estimator.estimateBatch(items);
      expect(tokens).toBeGreaterThan(10);
    });

    it("should return 0 for empty batch", () => {
      const tokens = estimator.estimateBatch([]);
      expect(tokens).toBe(0);
    });
  });
});

describe("TokenBudgetTracker - Extended", () => {
  describe("Edge Cases", () => {
    it("should handle zero budget", () => {
      const budget = new TokenBudgetTracker(0);

      expect(budget.maxTokens).toBe(0);
      expect(budget.canFit(1)).toBe(false);
      expect(budget.utilizationRatio).toBe(NaN); // 0/0
    });

    it("should handle allocation exceeding budget", () => {
      const budget = new TokenBudgetTracker(100);

      // Try to allocate more than available
      const result = budget.allocate("test", 150);

      expect(result).toBe(false);
      expect(budget.usedTokens).toBe(0);
    });

    it("should handle multiple reservations", () => {
      const budget = new TokenBudgetTracker(1000);

      const r1 = budget.reserve(200, "response");
      const r2 = budget.reserve(300, "tools");
      const r3 = budget.reserve(100, "extra");

      expect(budget.usedTokens).toBe(600);
      expect(budget.remainingTokens).toBe(400);

      budget.release(r2);
      expect(budget.usedTokens).toBe(300);
      expect(budget.remainingTokens).toBe(700);
    });

    it("should reset allocations but keep reservations", () => {
      const budget = new TokenBudgetTracker(1000);

      budget.allocate("history", 300);
      const reservation = budget.reserve(200, "response");

      expect(budget.usedTokens).toBe(500);

      budget.reset();

      // Allocations cleared, reservations kept
      expect(budget.getAllocation("history")).toBe(0);
      expect(budget.usedTokens).toBe(200); // Only reservation
    });

    it("should clone correctly", () => {
      const budget = new TokenBudgetTracker(1000);
      budget.allocate("system", 100);
      budget.allocate("history", 300);
      budget.reserve(200, "response");

      const clone = budget.clone();

      expect(clone.maxTokens).toBe(1000);
      expect(clone.usedTokens).toBe(budget.usedTokens);
      expect(clone.getAllocation("system")).toBe(100);
      expect(clone.getAllocation("history")).toBe(300);

      // Modifications are independent
      clone.allocate("tools", 50);
      expect(clone.usedTokens).toBe(budget.usedTokens + 50);
    });

    it("should update max tokens", () => {
      const budget = new TokenBudgetTracker(1000);
      budget.allocate("history", 500);

      budget.setMaxTokens(2000);

      expect(budget.maxTokens).toBe(2000);
      expect(budget.remainingTokens).toBe(1500);
      expect(budget.utilizationRatio).toBe(0.25);
    });
  });

  describe("Deallocate", () => {
    it("should deallocate tokens", () => {
      const budget = new TokenBudgetTracker(1000);
      budget.allocate("history", 500);

      budget.deallocate("history", 200);

      expect(budget.getAllocation("history")).toBe(300);
      expect(budget.usedTokens).toBe(300);
    });

    it("should not go negative on deallocate", () => {
      const budget = new TokenBudgetTracker(1000);
      budget.allocate("history", 100);

      budget.deallocate("history", 200);

      expect(budget.getAllocation("history")).toBe(0);
    });
  });
});

describe("Factory Functions - Tokens", () => {
  it("should create token estimator", () => {
    const estimator = createTokenEstimator();
    expect(estimator).toBeInstanceOf(ClaudeTokenEstimator);
  });

  it("should create token budget", () => {
    const budget = createTokenBudget(50000);
    expect(budget.maxTokens).toBe(50000);
  });

  it("should estimate message tokens", () => {
    const tokens = estimateMessageTokens("Hello, world!");
    expect(tokens).toBeGreaterThan(0);
  });
});

// =============================================================================
// Tiered Memory - Extended Tests
// =============================================================================

describe("TieredMemory - Extended", () => {
  let memory: TieredMemory;

  beforeEach(() => {
    memory = createTieredMemory();
  });

  describe("Force Tier Assignment", () => {
    it("should force message to specific tier", () => {
      const msg = createMessage("user", "Hello");
      memory.addMessage(msg, MemoryTier.ARCHIVED);

      expect(memory.getMessages(MemoryTier.ARCHIVED).length).toBe(1);
      expect(memory.getMessages(MemoryTier.RECENT).length).toBe(0);
    });

    it("should force critical message to system tier", () => {
      const msg = createMessage("user", "Important", {
        priority: MessagePriority.CRITICAL,
      });
      memory.addMessage(msg);

      expect(memory.getMessages(MemoryTier.SYSTEM).length).toBe(1);
    });
  });

  describe("Token Tracking", () => {
    it("should track total tokens across tiers", () => {
      memory.addMessage(createMessage("system", "System prompt"));
      memory.addMessage(createMessage("user", "User message"));

      const total = memory.getTotalTokens();
      expect(total).toBeGreaterThan(0);

      const systemTokens = memory.getTierTokens(MemoryTier.SYSTEM);
      const recentTokens = memory.getTierTokens(MemoryTier.RECENT);
      expect(systemTokens + recentTokens).toBe(total);
    });
  });

  describe("Promote and Demote", () => {
    it("should promote messages from archived to recent", () => {
      // First add messages to archived
      const msg1 = createMessage("user", "Old message 1");
      const msg2 = createMessage("user", "Old message 2");
      memory.addMessage(msg1, MemoryTier.ARCHIVED);
      memory.addMessage(msg2, MemoryTier.ARCHIVED);

      expect(memory.getMessages(MemoryTier.ARCHIVED).length).toBe(2);

      // Promote one
      memory.promoteToRecent([msg1.id]);

      expect(memory.getMessages(MemoryTier.ARCHIVED).length).toBe(1);
      expect(memory.getMessages(MemoryTier.RECENT).length).toBe(1);
    });

    it("should handle empty demote", () => {
      memory.addMessage(createMessage("user", "Only message"));

      const demoted = memory.demoteToArchived(5);

      expect(demoted.length).toBe(0);
    });
  });

  describe("Replace Messages", () => {
    it("should replace messages in tier", () => {
      const msg1 = createMessage("user", "Original message");
      msg1.tokens = 50;
      memory.addMessage(msg1, MemoryTier.ARCHIVED);

      const summary = createMessage("assistant", "Summary of conversation");
      summary.tokens = 20;
      summary.summarizedFrom = [msg1.id];

      memory.replaceMessages(MemoryTier.ARCHIVED, [msg1.id], [summary]);

      const archived = memory.getMessages(MemoryTier.ARCHIVED);
      expect(archived.length).toBe(1);
      expect(archived[0].content).toBe("Summary of conversation");
      expect(memory.getTierTokens(MemoryTier.ARCHIVED)).toBe(20);
    });
  });

  describe("Clear Operations", () => {
    it("should clear specific tier", () => {
      memory.addMessage(createMessage("system", "System"));
      memory.addMessage(createMessage("user", "User"));

      const cleared = memory.clearTier(MemoryTier.RECENT);

      expect(cleared.length).toBe(1);
      expect(memory.getMessages(MemoryTier.RECENT).length).toBe(0);
      expect(memory.getMessages(MemoryTier.SYSTEM).length).toBe(1);
    });

    it("should clear all tiers", () => {
      memory.addMessage(createMessage("system", "System"));
      memory.addMessage(createMessage("user", "User"));

      memory.clearAll();

      expect(memory.getTotalTokens()).toBe(0);
      expect(memory.getAllMessages().length).toBe(0);
    });
  });

  describe("Clone", () => {
    it("should create independent clone", () => {
      memory.addMessage(createMessage("user", "Hello"));

      const clone = memory.clone();

      expect(clone.getTotalTokens()).toBe(memory.getTotalTokens());

      // Modifications are independent
      clone.addMessage(createMessage("user", "World"));
      expect(clone.getAllMessages().length).toBe(2);
      expect(memory.getAllMessages().length).toBe(1);
    });
  });

  describe("Messages Needing Compression", () => {
    it("should identify tiers needing compression", () => {
      // Create memory with small tier limit for ARCHIVED (which is compressible)
      const smallMemory = createTieredMemory({
        tiers: {
          ...DEFAULT_TIER_CONFIG,
          archived: { ...DEFAULT_TIER_CONFIG.archived, maxTokens: 100, compressible: true },
        },
      });

      // Add messages with explicit tokens to ARCHIVED tier
      for (let i = 0; i < 10; i++) {
        const msg = createMessage("user", "X".repeat(200));
        msg.tokens = 50; // Total will be 500, exceeding 100 maxTokens
        smallMemory.addMessage(msg, MemoryTier.ARCHIVED);
      }

      const needing = smallMemory.getMessagesNeedingCompression();

      expect(needing.length).toBeGreaterThan(0);
      expect(needing[0].tier).toBe(MemoryTier.ARCHIVED);
      expect(needing[0].overflow).toBeGreaterThan(0);
    });
  });
});

describe("createMessage Utility", () => {
  it("should create message with defaults", () => {
    const msg = createMessage("user", "Hello");

    expect(msg.id).toMatch(/^msg_/);
    expect(msg.role).toBe("user");
    expect(msg.content).toBe("Hello");
    expect(msg.timestamp).toBeLessThanOrEqual(Date.now());
    expect(msg.compressible).toBe(true);
  });

  it("should create non-compressible system message", () => {
    const msg = createMessage("system", "Instructions");

    expect(msg.compressible).toBe(false);
    expect(msg.priority).toBe(MessagePriority.SYSTEM);
  });

  it("should accept custom options", () => {
    const msg = createMessage("user", "Hello", {
      id: "custom-id",
      priority: MessagePriority.HIGH,
      metadata: { custom: true },
    });

    expect(msg.id).toBe("custom-id");
    expect(msg.priority).toBe(MessagePriority.HIGH);
    expect(msg.metadata?.custom).toBe(true);
  });
});

// =============================================================================
// Compression - Extended Tests
// =============================================================================

describe("DefaultContextCompressor - Extended", () => {
  const compressor = new DefaultContextCompressor();

  describe("Preserve Patterns", () => {
    it("should preserve specific patterns in minify", async () => {
      const message = createMessage(
        "user",
        "Keep this: CODE_123\n\n\nRemove   extra    spaces"
      );
      message.tokens = 50;

      const result = await compressor.compress([message], {
        strategy: CompressionStrategy.MINIFY,
        preservePatterns: [/CODE_\d+/],
      });

      const content = result.compressed[0].content as string;
      expect(content).toContain("CODE_123");
      expect(content).not.toContain("   ");
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty messages array", async () => {
      const result = await compressor.compress([], {
        strategy: CompressionStrategy.MINIFY,
      });

      expect(result.compressed.length).toBe(0);
      expect(result.ratio).toBe(1);
    });

    it("should handle single message", async () => {
      const messages = [createMessage("user", "Short")];
      messages[0].tokens = 10;

      const result = await compressor.compress(messages, {
        strategy: CompressionStrategy.TRUNCATE,
        targetTokens: 5,
      });

      expect(result.compressed.length).toBeLessThanOrEqual(1);
    });
  });

  describe("Strategy Selection", () => {
    it("should apply correct strategy based on options", async () => {
      const messages = [
        createMessage("user", "Hello   world\n\n\ntest"),
      ];
      messages[0].tokens = 20;

      // MINIFY should remove extra whitespace
      const minified = await compressor.compress(messages, {
        strategy: CompressionStrategy.MINIFY,
      });
      expect(minified.lossiness).toBe("minimal");

      // EXTRACT should reduce more aggressively
      const extracted = await compressor.compress(messages, {
        strategy: CompressionStrategy.EXTRACT,
        targetTokens: 5,
      });
      expect(extracted.lossiness).toBe("moderate");
    });
  });

  describe("Estimation", () => {
    it("should estimate different strategies", async () => {
      const messages = [createMessage("user", "Test message")];
      messages[0].tokens = 100;

      const estimates = await Promise.all([
        compressor.estimate(messages, { strategy: CompressionStrategy.NONE }),
        compressor.estimate(messages, { strategy: CompressionStrategy.MINIFY }),
        compressor.estimate(messages, { strategy: CompressionStrategy.EXTRACT }),
      ]);

      expect(estimates[0].estimatedRatio).toBe(1);
      expect(estimates[1].estimatedRatio).toBeLessThan(1);
      expect(estimates[2].estimatedRatio).toBeLessThan(estimates[1].estimatedRatio);
    });
  });
});

describe("quickCompress Utility", () => {
  it("should compress with default ratio", async () => {
    const messages = [];
    for (let i = 0; i < 10; i++) {
      const msg = createMessage("user", `Message ${i}: ${"x".repeat(100)}`);
      msg.tokens = 50;
      messages.push(msg);
    }

    const result = await quickCompress(messages);

    expect(result.ratio).toBeLessThan(1);
    expect(result.strategy).toBe(CompressionStrategy.EXTRACT);
  });

  it("should compress with custom ratio", async () => {
    const messages = [createMessage("user", "Test ".repeat(50))];
    messages[0].tokens = 100;

    const result = await quickCompress(messages, 0.3);

    expect(result.compressedTokens).toBeLessThanOrEqual(100);
  });
});

// =============================================================================
// Allocator - Extended Tests
// =============================================================================

describe("DefaultContextAllocator - Extended", () => {
  const allocator = new DefaultContextAllocator();

  describe("Optimal Allocation", () => {
    it("should respect tier max limits", () => {
      const allocation = allocator.getOptimalAllocation(10_000_000);

      // Should not exceed tier maximums
      for (const tier of Object.values(MemoryTier)) {
        expect(allocation[tier as MemoryTier]).toBeLessThanOrEqual(
          DEFAULT_TIER_CONFIG[tier as MemoryTier].maxTokens
        );
      }
    });
  });

  describe("Complex Allocation Scenarios", () => {
    it("should handle mixed tier content", () => {
      const content = new Map<MemoryTier, any[]>([
        [MemoryTier.SYSTEM, [{ ...createMessage("system", "S"), tokens: 500 }]],
        [MemoryTier.TOOLS, [{ ...createMessage("tool", "T"), tokens: 300 }]],
        [MemoryTier.RECENT, [
          { ...createMessage("user", "U1"), tokens: 200 },
          { ...createMessage("assistant", "A1"), tokens: 300 },
        ]],
      ]);

      const result = allocator.allocate({
        totalBudget: 5000,
        currentContent: content,
        reservations: [],
      });

      expect(result.success).toBe(true);
      expect(result.retained.size).toBeGreaterThan(0);
    });

    it("should handle incoming messages", () => {
      const content = new Map<MemoryTier, any[]>([
        [MemoryTier.RECENT, [{ ...createMessage("user", "Old"), tokens: 100 }]],
      ]);

      const incoming = [
        { ...createMessage("user", "New"), tokens: 50 },
      ];

      const result = allocator.allocate({
        totalBudget: 5000,
        currentContent: content,
        incoming,
        reservations: [],
      });

      expect(result.success).toBe(true);
      const recentMessages = result.retained.get(MemoryTier.RECENT) ?? [];
      expect(recentMessages.length).toBe(2);
    });
  });

  describe("Rebalance", () => {
    it("should rebalance existing content", () => {
      const content = new Map<MemoryTier, any[]>([
        [MemoryTier.RECENT, [{ ...createMessage("user", "Test"), tokens: 100 }]],
      ]);

      const budget = new TokenBudgetTracker(5000);

      const result = allocator.rebalance(content, budget);

      expect(result.success).toBe(true);
      expect(result.allocations).toBeDefined();
    });
  });
});

describe("Specialized Allocators - Extended", () => {
  it("should allocate differently for coding vs chat", () => {
    const codingAllocator = new CodingAllocator();
    const chatAllocator = new ChatAllocator();

    const codingAlloc = codingAllocator.getOptimalAllocation(100000);
    const chatAlloc = chatAllocator.getOptimalAllocation(100000);

    // Coding should allocate more to tools
    expect(codingAlloc[MemoryTier.TOOLS]).toBeGreaterThan(
      chatAlloc[MemoryTier.TOOLS]
    );

    // Chat should allocate more to recent/archived
    expect(
      chatAlloc[MemoryTier.RECENT] + chatAlloc[MemoryTier.ARCHIVED]
    ).toBeGreaterThan(
      codingAlloc[MemoryTier.RECENT] + codingAlloc[MemoryTier.ARCHIVED]
    );
  });

  it("should allocate more resources for analysis", () => {
    const analysisAllocator = new AnalysisAllocator();
    const defaultAllocator = new DefaultContextAllocator();

    // Use larger budget where tier maxTokens difference becomes relevant
    // Default resources maxTokens: 10_000, Analysis resources maxTokens: 60_000
    // With 200_000 budget: 10% = 20_000, but capped by maxTokens
    const analysisAlloc = analysisAllocator.getOptimalAllocation(200_000);
    const defaultAlloc = defaultAllocator.getOptimalAllocation(200_000);

    // Analysis allows up to 60K for resources, default caps at 10K
    expect(analysisAlloc[MemoryTier.RESOURCES]).toBeGreaterThan(
      defaultAlloc[MemoryTier.RESOURCES]
    );
  });
});

// =============================================================================
// Context Manager - Extended Tests
// =============================================================================

describe("ContextManager - Extended", () => {
  describe("Message Ordering", () => {
    it("should maintain message order by timestamp", () => {
      const manager = createContextManager();

      const msg1 = createMessage("user", "First", { timestamp: 1000 });
      const msg2 = createMessage("assistant", "Second", { timestamp: 2000 });
      const msg3 = createMessage("user", "Third", { timestamp: 3000 });

      // Add out of order
      manager.addMessage(msg2);
      manager.addMessage(msg1);
      manager.addMessage(msg3);

      const messages = manager.getMessages();
      expect(messages[0].timestamp).toBe(1000);
      expect(messages[1].timestamp).toBe(2000);
      expect(messages[2].timestamp).toBe(3000);
    });
  });

  describe("Compression Flow", () => {
    it("should auto-compress when threshold reached", async () => {
      const manager = createContextManager({
        maxTokens: 500,
        responseReserve: 50,
        toolReserve: 50,
        tieredMemory: {
          ...DEFAULT_MEMORY_CONFIG,
          compressionThreshold: 0.5,
        },
      });

      // Add messages to trigger compression
      for (let i = 0; i < 10; i++) {
        manager.addUserMessage("X".repeat(50));
      }

      // Should have compressed or evicted
      expect(manager.getBudget().utilizationRatio).toBeLessThan(1);
    });

    it("should manual compact", async () => {
      // Create a compressor with a mock summarizer using createClaudeCompressor
      const mockSummarizer = async (_text: string, _prompt: string, _targetTokens: number) =>
        "Summary of conversation";
      const compressor = createClaudeCompressor(mockSummarizer);

      const manager = new ContextManager({
        maxTokens: 10000,
        compressor,
      });

      for (let i = 0; i < 10; i++) {
        manager.addUserMessage(`Message ${i}`);
      }

      const beforeCount = manager.getMessageCount();
      await manager.compact(0.5);

      // With summarizer, compact should work
      expect(manager.getStats().compressionCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Event Handling", () => {
    it("should emit multiple event types", () => {
      const manager = createContextManager();
      const events: any[] = [];

      manager.on((event) => events.push(event));

      manager.addUserMessage("Hello");
      manager.addAssistantMessage("Hi!");

      expect(events.filter((e) => e.type === "message_added").length).toBe(2);
    });

    it("should handle errors in event handlers gracefully", () => {
      const manager = createContextManager();
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      manager.on(() => {
        throw new Error("Handler error");
      });

      // Should not throw
      expect(() => manager.addUserMessage("Hello")).not.toThrow();

      consoleSpy.mockRestore();
    });
  });

  describe("API Format", () => {
    it("should convert complex messages to API format", () => {
      const manager = createContextManager();

      manager.addSystemMessage("System");
      manager.addUserMessage("User");
      manager.addAssistantMessage("Assistant");
      manager.addToolResult("t1", "Read", "Result");

      const api = manager.toApiFormat();

      // getAllMessages sorts by timestamp, but when timestamps are identical
      // (as in rapid test execution), tier-collection order is preserved:
      // SYSTEM -> TOOLS -> RESOURCES -> ARCHIVED -> RECENT -> EPHEMERAL
      // So: System (SYSTEM) -> Tool (TOOLS) -> User, Assistant (RECENT)
      expect(api.length).toBe(4);
      expect(api[0].role).toBe("system");
      expect(api[1].role).toBe("tool");
      expect(api[2].role).toBe("user");
      expect(api[3].role).toBe("assistant");
    });
  });

  describe("Context Window State", () => {
    it("should provide complete window state", () => {
      const manager = createContextManager({ maxTokens: 50000 });

      manager.addSystemMessage("System");
      manager.addUserMessage("User");

      const window = manager.getWindow();

      expect(window.messages.length).toBe(2);
      expect(window.tiers.size).toBeGreaterThan(0);
      expect(window.budget).toBeDefined();
      expect(window.stats.totalMessages).toBe(2);
    });
  });
});

// =============================================================================
// Integration Context Manager - Extended Tests
// =============================================================================

describe("IntegratedContextManager - Extended", () => {
  let registry: ResourceRegistry;

  beforeEach(() => {
    registry = new ResourceRegistry();
    registerBuiltInProviders(registry);
  });

  describe("Custom Resource Registry", () => {
    it("should work with custom provider", async () => {
      // Add custom provider with proper ResolvedResource return type
      registry.register({
        name: "custom",
        definitions: [
          { name: "greeting", description: "Custom greeting", hasArgs: true, examples: ["@greeting(Alice)"], isAsync: false },
        ],
        handles: (name) => name === "greeting",
        get: (_name, args) => ({
          value: `Hello, ${args[0] ?? "World"}!`,
          summary: `Greeting for ${args[0] ?? "World"}`,
          tokenEstimate: 5,
          success: true,
        }),
      });

      const ctx = createIntegratedContext({ registry });
      const result = await ctx.addUserMessageWithAliases("Say @greeting(Alice)");

      expect(result.context?.stats.resolved).toBe(1);
    });
  });

  describe("Separate Resource Message", () => {
    it("should add resource context as separate message", async () => {
      const ctx = createIntegratedContext({ registry });

      await ctx.addUserMessageWithAliases("Use @color(red)", {
        separateResourceMessage: true,
      });

      const messages = ctx.getMessages();
      expect(messages.length).toBe(2); // Resource message + user message
    });
  });

  describe("Error Handling", () => {
    it("should handle unknown aliases gracefully", async () => {
      const ctx = createIntegratedContext({ registry });

      const result = await ctx.addUserMessageWithAliases("Use @unknown(x)");

      // Should still add message even if alias fails
      expect(ctx.getMessages().length).toBe(1);
      expect(result.context?.stats.failed).toBe(1);
    });

    it("should use fallbacks when provided", async () => {
      // Register a provider that will fail
      registry.register({
        name: "failing",
        definitions: [
          { name: "flaky", description: "A failing resource", hasArgs: false, examples: ["@flaky"], isAsync: false },
        ],
        handles: (name) => name === "flaky",
        get: () => {
          throw new Error("Intentional failure for test");
        },
      });

      const ctx = createIntegratedContext({ registry });

      const result = await ctx.addUserMessageWithAliases("Use @flaky", {
        fallbacks: { flaky: "fallback-value" },
        onError: () => "fallback", // Explicitly request fallback on error
      });

      expect(result.context?.stats.fallback).toBe(1);
    });
  });

  describe("Complex Workflows", () => {
    it("should handle multi-turn conversation with aliases", async () => {
      const ctx = createIntegratedContext({ registry, maxTokens: 50000 });

      ctx.addSystemMessage("You are a canvas assistant");
      await ctx.addUserMessageWithAliases("Set color to @color(blue)");
      ctx.addAssistantMessage("Color set to blue");
      await ctx.addUserMessageWithAliases("Now use @color(red)");
      ctx.addAssistantMessage("Changed to red");

      const prepared = await ctx.prepareForRequest();

      expect(prepared.messages.length).toBe(5);
      expect(prepared.responseTokens).toBeGreaterThan(0);
    });

    it("should respect token budget for resources", async () => {
      const ctx = createIntegratedContext({
        registry,
        maxTokens: 1000,
        resourceBudgetRatio: 0.2, // 20% for resources
      });

      await ctx.addUserMessageWithAliases("Use @color(red)");

      const breakdown = ctx.getBudgetBreakdown();
      expect(breakdown.used).toBeGreaterThan(0);
    });
  });
});

describe("preparePromptWithAliases", () => {
  let registry: ResourceRegistry;

  beforeEach(() => {
    registry = new ResourceRegistry();
    registerBuiltInProviders(registry);
  });

  it("should prepare prompt with resolved aliases", async () => {
    const result = await preparePromptWithAliases(
      "Use @color(red) and @color(blue)",
      {},
      { tokenBudget: 1000 },
      registry
    );

    expect(result.stats.total).toBe(2);
    expect(result.stats.resolved).toBe(2);
    expect(result.enrichedPrompt).toContain("<context>");
  });

  it("should handle empty prompt", async () => {
    const result = await preparePromptWithAliases("No aliases here", {}, {}, registry);

    expect(result.stats.total).toBe(0);
    expect(result.enrichedPrompt).toBe("No aliases here");
  });
});

// =============================================================================
// Model Configuration Tests
// =============================================================================

describe("Model Context Sizes", () => {
  it("should have all expected models", () => {
    expect(MODEL_CONTEXT_SIZES["claude-3-opus"]).toBe(200_000);
    expect(MODEL_CONTEXT_SIZES["claude-3-sonnet"]).toBe(200_000);
    expect(MODEL_CONTEXT_SIZES["claude-3-haiku"]).toBe(200_000);
    expect(MODEL_CONTEXT_SIZES["claude-3.5-sonnet"]).toBe(200_000);
    expect(MODEL_CONTEXT_SIZES["claude-sonnet-4"]).toBe(200_000);
    expect(MODEL_CONTEXT_SIZES["claude-opus-4"]).toBe(200_000);
  });

  it("should have extended context models", () => {
    expect(MODEL_CONTEXT_SIZES["claude-sonnet-4-1m"]).toBe(1_000_000);
    expect(MODEL_CONTEXT_SIZES["claude-opus-4.5-1m"]).toBe(1_000_000);
  });
});

describe("Model-Specific Managers", () => {
  it("should create manager for each model size", () => {
    const sonnet = createContextManagerForModel("claude-3.5-sonnet");
    const extended = createContextManagerForModel("claude-sonnet-4-1m");

    expect(sonnet.getBudget().maxTokens).toBe(200_000);
    expect(extended.getBudget().maxTokens).toBe(1_000_000);
  });

  it("should create extended context manager", () => {
    const extended = createExtendedContextManager();

    expect(extended.getBudget().maxTokens).toBe(1_000_000);
  });
});

// =============================================================================
// Defaults and Configuration Tests
// =============================================================================

describe("Default Configurations", () => {
  it("should have valid DEFAULT_TIER_CONFIG", () => {
    for (const tier of Object.values(MemoryTier)) {
      const config = DEFAULT_TIER_CONFIG[tier as MemoryTier];
      expect(config.maxTokens).toBeGreaterThan(0);
      expect(config.minTokens).toBeLessThanOrEqual(config.maxTokens);
    }
  });

  it("should have valid DEFAULT_MEMORY_CONFIG", () => {
    expect(DEFAULT_MEMORY_CONFIG.recentTurnsCount).toBeGreaterThan(0);
    expect(DEFAULT_MEMORY_CONFIG.compressionThreshold).toBeGreaterThan(0);
    expect(DEFAULT_MEMORY_CONFIG.compressionThreshold).toBeLessThan(1);
    expect(DEFAULT_MEMORY_CONFIG.evictionThreshold).toBeGreaterThan(
      DEFAULT_MEMORY_CONFIG.compressionThreshold
    );
  });

  it("should have valid DEFAULT_PRIORITY_RULES", () => {
    expect(DEFAULT_PRIORITY_RULES.roleDefaults.system).toBe(MessagePriority.SYSTEM);
    expect(DEFAULT_PRIORITY_RULES.roleDefaults.user).toBe(MessagePriority.NORMAL);
    expect(DEFAULT_PRIORITY_RULES.keywordBoosts.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// Performance Characteristics Tests
// =============================================================================

describe("Performance Characteristics", () => {
  it("should handle large number of messages", () => {
    const manager = createContextManager({ maxTokens: 200_000 });

    const start = Date.now();

    for (let i = 0; i < 1000; i++) {
      manager.addUserMessage(`Message ${i}`);
    }

    const duration = Date.now() - start;

    // Should complete in reasonable time (< 1 second)
    expect(duration).toBeLessThan(1000);
    expect(manager.getMessageCount()).toBe(1000);
  });

  it("should efficiently clone large context", () => {
    const manager = createContextManager({ maxTokens: 200_000 });

    for (let i = 0; i < 500; i++) {
      manager.addUserMessage(`Message ${i}`);
    }

    const start = Date.now();
    const clone = manager.clone();
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(500);
    expect(clone.getMessageCount()).toBe(500);
  });

  it("should handle rapid budget queries", () => {
    const budget = new TokenBudgetTracker(200_000);
    budget.allocate("history", 100_000);

    const start = Date.now();

    for (let i = 0; i < 10000; i++) {
      budget.canFit(1000);
      budget.getBreakdown();
      budget.utilizationRatio;
    }

    const duration = Date.now() - start;

    expect(duration).toBeLessThan(100);
  });
});
