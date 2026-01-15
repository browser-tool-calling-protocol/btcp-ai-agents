/**
 * Tracing Example
 *
 * Demonstrates how to use the enhanced conversation tracing system.
 *
 * New features demonstrated:
 * - Cost tracking per model
 * - Latency breakdown visualization
 * - Error classification
 * - Streaming support (TTFT, tokens/sec)
 * - Hierarchical span visualization
 * - Model metrics aggregation
 */

import { ConversationTracer } from "./tracer.js";
import {
  ConsoleExporter,
  JsonLinesExporter,
  InMemoryExporter,
} from "./exporters.js";
import { withTracing, createTracingHandlers } from "./instrumentation.js";
import { MODEL_PRICING, calculateCost } from "./types.js";

// Track all tracers created for proper cleanup
const tracers: ConversationTracer[] = [];

// ============================================================================
// EXAMPLE 1: Basic Manual Tracing
// ============================================================================

async function basicTracingExample() {
  console.log("\n=== Basic Tracing Example ===\n");

  // Create tracer with console output
  const tracer = new ConversationTracer({
    serviceName: "example-agent",
    exporters: [
      new ConsoleExporter({ verbose: true, colorize: true }),
    ],
    captureThinking: true,
    captureToolIO: true,
  });
  tracers.push(tracer);

  // Start a trace for a conversation
  tracer.startTrace("chat_session", {
    "user.id": "user_123",
    "session.id": "session_abc",
    "canvas.id": "canvas_xyz",
  });

  // Record user message
  tracer.recordUserMessage("Create a mindmap about AI agents", 15);

  // Record reasoning
  tracer.recordThinking("analyze", "User wants a mindmap visualization about AI agents");
  tracer.recordThinking("assess_clarity", "Output type: mindmap\nTopic clarity: specific");
  tracer.recordThinking("plan", "1. Create central node\n2. Add branches for subtopics");

  // Record LLM request
  tracer.recordLLMRequest("gpt-4o", "openai", {
    maxTokens: 4096,
    temperature: 0.7,
  });

  // Simulate some delay
  await sleep(100);

  // Complete LLM request
  tracer.completeLLMRequest("tool_calls", {
    promptTokens: 500,
    completionTokens: 200,
    totalTokens: 700,
  }, true);

  // Record tool call
  const toolCall = tracer.recordToolCall("canvas_write", {
    tree: {
      type: "frame",
      name: "AI Agents Mindmap",
      children: [
        { type: "text", text: "AI Agents" },
        { type: "rectangle", text: "Planning" },
        { type: "rectangle", text: "Tools" },
      ],
    },
  });

  // Simulate tool execution
  await sleep(50);

  // Complete tool call
  tracer.completeToolCall(toolCall, {
    created: ["frame_1", "text_1", "rect_1", "rect_2"],
    elementsCount: 4,
  }, true);

  // Record assistant response
  tracer.recordAssistantMessage(
    "I've created a mindmap about AI agents with sections for Planning and Tools.",
    25
  );

  // End the turn
  tracer.endTurn();

  // End the trace
  const trace = await tracer.endTrace("ok");

  console.log("\nTrace Summary:", trace?.summary);
}

// ============================================================================
// EXAMPLE 2: File Logging
// ============================================================================

async function fileLoggingExample() {
  console.log("\n=== File Logging Example ===\n");

  const tracer = new ConversationTracer({
    serviceName: "production-agent",
    environment: "production",
    exporters: [
      new JsonLinesExporter({
        filePath: "./.traces/conversations.jsonl",
        bufferSize: 10,
        flushIntervalMs: 1000,
      }),
      new ConsoleExporter({ verbose: false }),
    ],
  });
  tracers.push(tracer);

  tracer.startTrace("api_request", {
    "request.id": "req_" + Date.now(),
    "llm.model": "gpt-4o",
  });

  tracer.recordUserMessage("What's on the canvas?");

  const toolCall = tracer.recordToolCall("canvas_read", { format: "json" });
  await sleep(30);
  tracer.completeToolCall(toolCall, { elements: [], count: 0 }, true);

  tracer.recordAssistantMessage("The canvas is currently empty.");
  tracer.endTurn();

  await tracer.endTrace("ok");

  console.log("Trace written to ./.traces/conversations.jsonl");
}

// ============================================================================
// EXAMPLE 3: Using withTracing Helper
// ============================================================================

async function withTracingExample() {
  console.log("\n=== withTracing Example ===\n");

  const result = await withTracing(
    "agent_query",
    async (tracer, handlers) => {
      // Use handlers to record events
      handlers.onUserMessage?.("Draw a red rectangle", 5);

      handlers.onAgentLoopStart?.("general", 10);
      handlers.onAgentLoopIteration?.(1);

      handlers.onLLMRequest?.("gpt-4o", "openai");
      await sleep(100);
      handlers.onLLMResponse?.("tool_calls", {
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      }, true);

      handlers.onToolCallStart?.("canvas_write", { type: "rectangle", fill: "red" }, "call_1");
      await sleep(50);
      handlers.onToolCallEnd?.("call_1", { created: ["rect_1"] }, true);

      handlers.onAgentLoopEnd?.(1, true);
      handlers.onAssistantMessage?.("Created a red rectangle!", 10);

      return { success: true, elementId: "rect_1" };
    },
    {
      exporters: [new ConsoleExporter({ verbose: true })],
    }
  );

  console.log("\nResult:", result.result);
  console.log("Duration:", result.durationMs, "ms");
  console.log("Trace Summary:", result.trace?.summary);
}

// ============================================================================
// EXAMPLE 4: Multi-Turn Conversation
// ============================================================================

async function multiTurnExample() {
  console.log("\n=== Multi-Turn Conversation Example ===\n");

  const memoryExporter = new InMemoryExporter();

  const tracer = new ConversationTracer({
    exporters: [memoryExporter, new ConsoleExporter({ verbose: false })],
  });
  tracers.push(tracer);

  tracer.startTrace("multi_turn_chat", { "user.id": "user_456" });

  // Turn 1
  tracer.recordUserMessage("Create a circle");
  tracer.recordThinking("analyze", "Simple shape creation request");

  const tc1 = tracer.recordToolCall("canvas_write", { type: "ellipse" });
  await sleep(30);
  tracer.completeToolCall(tc1, { created: ["circle_1"] }, true);

  tracer.recordAssistantMessage("Created a circle.");
  tracer.endTurn();

  // Turn 2
  tracer.recordUserMessage("Make it red");
  tracer.recordThinking("analyze", "Style modification request");

  const tc2 = tracer.recordToolCall("canvas_edit", { target: "circle_1", fill: "red" });
  await sleep(20);
  tracer.completeToolCall(tc2, { modified: ["circle_1"] }, true);

  tracer.recordAssistantMessage("Made the circle red.");
  tracer.endTurn();

  // Turn 3
  tracer.recordUserMessage("Add a label");

  const tc3 = tracer.recordToolCall("canvas_write", { type: "text", text: "My Circle" });
  await sleep(25);
  tracer.completeToolCall(tc3, { created: ["text_1"] }, true);

  tracer.recordAssistantMessage("Added a label.");
  tracer.endTurn();

  await tracer.endTrace("ok");

  // Access recorded turns
  const turns = tracer.getTurns();
  console.log(`\nRecorded ${turns.length} turns`);

  for (const turn of turns) {
    console.log(`  Turn ${turn.turn}: "${turn.userMessage.content}" → ${turn.toolCalls.length} tool calls`);
  }

  // Access from memory exporter
  const traces = memoryExporter.getTraces();
  console.log(`\nExported ${traces.length} traces with ${traces[0]?.spans.length} spans`);
}

// ============================================================================
// EXAMPLE 5: Error Handling
// ============================================================================

async function errorHandlingExample() {
  console.log("\n=== Error Handling Example ===\n");

  const tracer = new ConversationTracer({
    exporters: [new ConsoleExporter({ verbose: true })],
  });
  tracers.push(tracer);

  tracer.startTrace("error_example");

  tracer.recordUserMessage("Do something impossible");

  // Record a failed tool call
  const toolCall = tracer.recordToolCall("canvas_magic", { impossible: true });
  await sleep(50);
  tracer.completeToolCall(toolCall, null, false, "Tool 'canvas_magic' does not exist");

  // Record an error
  tracer.recordError(new Error("Failed to complete the request"));

  // Record a warning
  tracer.recordWarning("Falling back to default behavior");

  tracer.recordAssistantMessage("I wasn't able to do that. Here's what I can help with...");
  tracer.endTurn();

  const trace = await tracer.endTrace("error", "Tool execution failed");

  console.log("\nError count:", trace?.summary?.errorCount);
  console.log("Warning count:", trace?.summary?.warningCount);
}

// ============================================================================
// EXAMPLE 6: Cost Tracking and Enhanced Metrics
// ============================================================================

async function costTrackingExample() {
  console.log("\n=== Cost Tracking Example ===\n");

  // Show available model pricing
  console.log("Supported models for cost tracking:");
  for (const [model, pricing] of Object.entries(MODEL_PRICING).slice(0, 5)) {
    console.log(`  ${model}: $${pricing.promptPer1K}/1K prompt, $${pricing.completionPer1K}/1K completion`);
  }
  console.log("");

  // Calculate cost manually
  const costBreakdown = calculateCost("gpt-4o", 1500, 500);
  if (costBreakdown) {
    console.log(`Cost for 1500 prompt + 500 completion tokens with gpt-4o:`);
    console.log(`  Prompt cost: $${costBreakdown.promptCost.toFixed(4)}`);
    console.log(`  Completion cost: $${costBreakdown.completionCost.toFixed(4)}`);
    console.log(`  Total: $${(costBreakdown.promptCost + costBreakdown.completionCost).toFixed(4)}`);
  }

  // Create tracer with enhanced console output
  const tracer = new ConversationTracer({
    serviceName: "cost-demo",
    exporters: [
      new ConsoleExporter({
        verbose: true,
        colorize: true,
        showLatencyChart: true,
        showModelMetrics: true,
      }),
    ],
  });
  tracers.push(tracer);

  tracer.startTrace("cost_tracking_demo", {
    "user.id": "demo_user",
  });

  // Simulate multiple LLM calls to show aggregated metrics
  tracer.recordUserMessage("Create a complex diagram with multiple steps");

  // First LLM call - planning
  tracer.recordLLMRequest("gpt-4o", "openai", { temperature: 0.3 });
  await sleep(150);
  tracer.completeLLMRequest("tool_calls", {
    promptTokens: 800,
    completionTokens: 400,
    totalTokens: 1200,
  }, true);

  // Tool calls
  const tc1 = tracer.recordToolCall("canvas_write", { type: "frame" });
  await sleep(30);
  tracer.completeToolCall(tc1, { created: ["frame_1"] }, true);

  const tc2 = tracer.recordToolCall("canvas_write", { type: "rectangle" });
  await sleep(25);
  tracer.completeToolCall(tc2, { created: ["rect_1", "rect_2"] }, true);

  // Second LLM call - refinement
  tracer.recordLLMRequest("gpt-4o", "openai", { temperature: 0.5 });
  await sleep(120);
  tracer.completeLLMRequest("stop", {
    promptTokens: 600,
    completionTokens: 200,
    totalTokens: 800,
  }, true);

  tracer.recordAssistantMessage("Created a complex diagram with frame and rectangles.");
  tracer.endTurn();

  const trace = await tracer.endTrace("ok");

  // Show enhanced summary
  if (trace?.summary) {
    console.log("\nEnhanced Summary:");
    console.log(`  Total Cost: $${trace.summary.estimatedCost?.toFixed(4) || "N/A"}`);
    console.log(`  Tokens/sec: ${trace.summary.tokensPerSecond?.toFixed(0) || "N/A"}`);

    if (trace.summary.latencyBreakdown) {
      console.log(`  Latency Breakdown:`);
      console.log(`    LLM: ${trace.summary.latencyBreakdown.llmPercent.toFixed(1)}%`);
      console.log(`    Tools: ${trace.summary.latencyBreakdown.toolPercent.toFixed(1)}%`);
      console.log(`    Overhead: ${trace.summary.latencyBreakdown.overheadPercent.toFixed(1)}%`);
    }

    if (trace.summary.modelMetrics) {
      console.log(`  Model Metrics:`);
      for (const m of trace.summary.modelMetrics) {
        console.log(`    ${m.model}: ${m.callCount} calls, $${m.estimatedCost.toFixed(4)}`);
      }
    }
  }
}

// ============================================================================
// EXAMPLE 7: Streaming Support
// ============================================================================

async function streamingExample() {
  console.log("\n=== Streaming Support Example ===\n");

  const tracer = new ConversationTracer({
    serviceName: "streaming-demo",
    exporters: [new ConsoleExporter({ verbose: false })],
  });
  tracers.push(tracer);

  tracer.startTrace("streaming_demo");
  tracer.recordUserMessage("Generate a long response");

  // Start LLM request
  tracer.recordLLMRequest("gpt-4o", "openai");

  // Record stream start
  tracer.recordStreamStart();

  // Simulate streaming chunks
  for (let i = 0; i < 10; i++) {
    await sleep(15);
    tracer.recordStreamChunk(`chunk_${i}`, 5);
  }

  // Record stream end
  tracer.recordStreamEnd(10);

  // Complete LLM request
  tracer.completeLLMRequest("stop", {
    promptTokens: 200,
    completionTokens: 50,
    totalTokens: 250,
  }, true);

  tracer.recordAssistantMessage("Here is the streamed response...");
  tracer.endTurn();

  const trace = await tracer.endTrace("ok");

  console.log(`Time to First Token: ${trace?.summary?.timeToFirstTokenMs || "N/A"}ms`);
}

// ============================================================================
// EXAMPLE 8: Error Classification
// ============================================================================

async function errorClassificationExample() {
  console.log("\n=== Error Classification Example ===\n");

  const tracer = new ConversationTracer({
    serviceName: "error-demo",
    exporters: [new ConsoleExporter({ verbose: true })],
  });
  tracers.push(tracer);

  tracer.startTrace("error_classification_demo");
  tracer.recordUserMessage("Test various error types");

  // Simulate different error types
  tracer.recordError(new Error("Rate limit exceeded (429)"));
  tracer.recordError(new Error("Connection timeout after 30s"));
  tracer.recordError(new Error("MCP canvas-mcp server unreachable"));
  tracer.recordError(new Error("Tool canvas_invalid not found"));

  tracer.endTurn();
  const trace = await tracer.endTrace("error", "Multiple errors occurred");

  // Show classified errors
  const errors = tracer.getErrors();
  console.log("\nClassified Errors:");
  for (const err of errors) {
    console.log(`  [${err.category}] ${err.message} (retryable: ${err.retryable})`);
    if (err.retryDelayMs) {
      console.log(`    Suggested retry delay: ${err.retryDelayMs}ms`);
    }
  }

  // Show error breakdown from summary
  if (trace?.summary?.errorsByCategory) {
    console.log("\nError Summary by Category:");
    for (const [category, count] of Object.entries(trace.summary.errorsByCategory)) {
      if (count > 0) {
        console.log(`  ${category}: ${count}`);
      }
    }
  }
}

// ============================================================================
// EXAMPLE 9: Debug Mode - Conversation & Reasoning Flow
// ============================================================================

async function debugModeExample() {
  console.log("\n=== Debug Mode Example (Conversation & Reasoning Flow) ===\n");

  // Create tracer with DEBUG mode for conversation/reasoning debugging
  const tracer = new ConversationTracer({
    serviceName: "debug-demo",
    exporters: [
      new ConsoleExporter({
        mode: "debug",           // Enable debug mode
        showConversation: true,  // Show user/assistant messages
        showReasoning: true,     // Show thinking/reasoning phases
        showToolDetails: true,   // Show tool inputs/outputs
        maxContentLength: 300,   // Truncate long content
      }),
    ],
    captureThinking: true,
    captureToolIO: true,
  });
  tracers.push(tracer);

  // Start trace
  tracer.startTrace("reasoning_debug", {
    "user.id": "debug_user",
    "canvas.id": "canvas_test",
  });

  // === TURN 1: Complex request with reasoning ===
  tracer.recordUserMessage(
    "Create a moodboard for a minimalist coffee shop brand. Include earthy tones, modern typography, and a cozy atmosphere."
  );

  // Reasoning phases
  tracer.recordThinking(
    "analyze",
    "User wants a moodboard for a coffee shop brand.\n" +
    "Key requirements:\n" +
    "- Minimalist aesthetic\n" +
    "- Earthy color palette\n" +
    "- Modern typography\n" +
    "- Cozy/warm atmosphere"
  );

  tracer.recordThinking(
    "plan",
    "1. Create a frame for the moodboard\n" +
    "2. Add color palette section (browns, greens, cream)\n" +
    "3. Add typography samples\n" +
    "4. Include imagery placeholders for cozy elements\n" +
    "5. Add texture/pattern samples"
  );

  // LLM request
  tracer.recordLLMRequest("gpt-4o", "openai", { temperature: 0.7 });
  await sleep(150);
  tracer.completeLLMRequest("tool_calls", {
    promptTokens: 450,
    completionTokens: 280,
    totalTokens: 730,
  }, true);

  // Tool calls with detailed input/output
  const tc1 = tracer.recordToolCall("canvas_write", {
    tree: {
      type: "frame",
      name: "Coffee Shop Moodboard",
      width: 1200,
      height: 800,
      children: [
        {
          type: "frame",
          name: "Color Palette",
          children: [
            { type: "rectangle", fill: "#8B4513", width: 80, height: 80 },
            { type: "rectangle", fill: "#D2B48C", width: 80, height: 80 },
            { type: "rectangle", fill: "#F5F5DC", width: 80, height: 80 },
          ],
        },
      ],
    },
  });
  await sleep(80);
  tracer.completeToolCall(tc1, {
    created: ["frame_main", "frame_colors", "rect_1", "rect_2", "rect_3"],
    elementsCount: 5,
  }, true);

  tracer.recordThinking(
    "observe",
    "Created the main frame and color palette section.\n" +
    "Colors chosen: Saddle Brown, Tan, Beige - representing earthy coffee tones."
  );

  const tc2 = tracer.recordToolCall("canvas_write", {
    tree: {
      type: "text",
      text: "Brew & Bean",
      fontFamily: "Playfair Display",
      fontSize: 48,
      position: { x: 400, y: 100 },
    },
  });
  await sleep(50);
  tracer.completeToolCall(tc2, {
    created: ["text_title"],
    elementsCount: 1,
  }, true);

  tracer.recordThinking(
    "decide",
    "Moodboard structure complete. Added:\n" +
    "- Main frame with branded name\n" +
    "- Color palette with earthy tones\n" +
    "Ready to present to user."
  );

  // Assistant response
  tracer.recordAssistantMessage(
    "I've created a minimalist moodboard for your coffee shop brand! It features:\n\n" +
    "• **Color Palette**: Earthy browns and creams (Saddle Brown, Tan, Beige)\n" +
    "• **Typography**: Elegant Playfair Display for a modern, sophisticated feel\n" +
    "• **Layout**: Clean, organized frame structure\n\n" +
    "Would you like me to add more elements like textures or imagery?"
  );

  tracer.endTurn();

  // === TURN 2: Follow-up with error ===
  tracer.recordUserMessage("Add some texture patterns to the background");

  tracer.recordThinking(
    "analyze",
    "User wants texture patterns added to the moodboard background.\n" +
    "Will use subtle patterns that complement the minimalist aesthetic."
  );

  // LLM request for second turn
  tracer.recordLLMRequest("gpt-4o", "openai");
  await sleep(100);
  tracer.completeLLMRequest("tool_calls", {
    promptTokens: 320,
    completionTokens: 150,
    totalTokens: 470,
  }, true);

  // Tool call that fails
  const tc3 = tracer.recordToolCall("canvas_edit", {
    target: { id: "frame_main" },
    set: {
      backgroundImage: "pattern://linen-texture",
      backgroundOpacity: 0.1,
    },
  });
  await sleep(60);
  tracer.completeToolCall(tc3, null, false, "Pattern 'linen-texture' not found in asset library");

  tracer.recordWarning("Falling back to solid color background");

  // Retry with different approach
  const tc4 = tracer.recordToolCall("canvas_edit", {
    target: { id: "frame_main" },
    set: {
      backgroundColor: "#FAF0E6",
      opacity: 0.95,
    },
  });
  await sleep(40);
  tracer.completeToolCall(tc4, {
    modified: ["frame_main"],
    changes: { backgroundColor: "#FAF0E6" },
  }, true);

  tracer.recordAssistantMessage(
    "I've added a subtle linen-white background to the moodboard. " +
    "The texture pattern wasn't available, so I used a warm cream tone instead."
  );

  tracer.endTurn();

  // End trace
  const trace = await tracer.endTrace("ok");

  // Summary
  console.log("\n--- Debug Mode Summary ---");
  console.log(`Turns: ${trace?.turns?.length || 0}`);
  console.log(`Total reasoning phases: ${trace?.turns?.reduce((acc, t) => acc + (t.thinking?.length || 0), 0) || 0}`);
  console.log(`Total tool calls: ${trace?.summary?.toolCalls || 0}`);
  console.log(`Warnings: ${trace?.summary?.warningCount || 0}`);
}

// ============================================================================
// HELPER
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// RUN EXAMPLES
// ============================================================================

async function main() {
  try {
    // Run debug mode example first (most relevant for debugging reasoning)
    await debugModeExample();

    // Run other examples
    await basicTracingExample();
    await fileLoggingExample();
    await withTracingExample();
    await multiTurnExample();
    await errorHandlingExample();
    await costTrackingExample();
    await streamingExample();
    await errorClassificationExample();
  } finally {
    // Shutdown all tracers to clean up resources (e.g., flush timers)
    for (const tracer of tracers) {
      await tracer.shutdown();
    }
  }
}

main().catch(console.error);
