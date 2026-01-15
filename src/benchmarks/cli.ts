#!/usr/bin/env npx tsx
/**
 * Benchmark CLI
 *
 * Command-line interface for running benchmarks with configurable options.
 *
 * Usage:
 *   pnpm benchmark:smoke                    # Quick smoke test
 *   pnpm benchmark:full                     # Full benchmark
 *   pnpm benchmark:compare --models gpt-4o,claude-3-5-sonnet  # Compare models
 *   pnpm benchmark --help                   # Show help
 *
 * Environment Variables:
 *   OPENAI_API_KEY      - Required for OpenAI models
 *   ANTHROPIC_API_KEY   - Required for Anthropic models
 *   GOOGLE_API_KEY      - Required for Google models
 *   BENCHMARK_MODEL     - Default model (default: gpt-4o)
 *   BENCHMARK_PROVIDER  - Default provider (default: openai)
 */

// Load environment variables from .env file
import "dotenv/config";

import { parseArgs } from "node:util";
import {
  BenchmarkRunner,
  MultiConfigBenchmarkRunner,
  MODELS,
  MODEL_GROUPS,
  SCENARIO_SETS,
  REASONING_SCENARIO_SETS,
  ROUTING_SCENARIO_SETS,
  EDGE_CASE_SCENARIO_SETS,
  REGRESSION_SCENARIO_SETS,
  COMPARISON_SCENARIO_SETS,
  generateBenchmarkReport,
  generateMultiModelReport,
  FileBenchmarkStorage,
  type ModelConfig,
} from "./index.js";
import {
  buildDebugSession,
  generateDebugView,
  LiveDebugReporter,
  formatTickerEvent,
  type TickerEvent,
} from "./debug-view.js";
import { getScenarioById } from "./scenarios.js";

// ============================================================================
// CLI CONFIGURATION
// ============================================================================

const HELP_TEXT = `
╔════════════════════════════════════════════════════════════════════════╗
║                    WAIBOARD AI BENCHMARK CLI                           ║
╠════════════════════════════════════════════════════════════════════════╣
║                                                                        ║
║  Usage: pnpm benchmark [options]                                       ║
║                                                                        ║
║  Options:                                                              ║
║    --suite <name>      Benchmark suite to run                          ║
║                        smoke, core, full, reasoning, routing,          ║
║                        edge-cases, regression, comparison              ║
║                                                                        ║
║    --model <name>      Model to use (default: gpt-4o)                  ║
║                        gpt-4o, gpt-4-turbo, gpt-4o-mini,               ║
║                        claude-3-5-sonnet, claude-3-5-haiku,            ║
║                        gemini-2.0-pro, gemini-2.0-flash                ║
║                                                                        ║
║    --provider <name>   Provider (openai, anthropic, google)            ║
║                                                                        ║
║    --compare           Compare multiple models                         ║
║    --models <list>     Comma-separated list of models for comparison   ║
║    --model-group       Predefined model group                          ║
║                        flagship, fast, openai, anthropic, google       ║
║                                                                        ║
║    --format <type>     Output format (console, markdown, json, csv)    ║
║    --output <file>     Write results to file                           ║
║    --verbose           Show detailed output                            ║
║    --debug             Enable debug view with reasoning flow           ║
║    --help              Show this help message                          ║
║                                                                        ║
║  Examples:                                                             ║
║    pnpm benchmark --suite smoke                                        ║
║    pnpm benchmark --suite full --model claude-3-5-sonnet               ║
║    pnpm benchmark --compare --model-group flagship --suite reasoning   ║
║    pnpm benchmark --suite regression --format markdown --output out.md ║
║                                                                        ║
╚════════════════════════════════════════════════════════════════════════╝
`;

// ============================================================================
// ARGUMENT PARSING
// ============================================================================

interface CLIArgs {
  suite: string;
  model: string;
  provider: string;
  compare: boolean;
  models: string;
  modelGroup: string;
  format: string;
  output: string;
  verbose: boolean;
  debug: boolean;
  help: boolean;
}

function parseCliArgs(): CLIArgs {
  const { values } = parseArgs({
    options: {
      suite: { type: "string", default: "smoke" },
      model: { type: "string", default: process.env.BENCHMARK_MODEL || "gpt-4o" },
      provider: { type: "string", default: process.env.BENCHMARK_PROVIDER || "openai" },
      compare: { type: "boolean", default: false },
      models: { type: "string", default: "" },
      "model-group": { type: "string", default: "" },
      format: { type: "string", default: "console" },
      output: { type: "string", default: "" },
      verbose: { type: "boolean", default: false },
      debug: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });

  return {
    suite: values.suite as string,
    model: values.model as string,
    provider: values.provider as string,
    compare: values.compare as boolean,
    models: values.models as string,
    modelGroup: values["model-group"] as string,
    format: values.format as string,
    output: values.output as string,
    verbose: values.verbose as boolean,
    debug: values.debug as boolean,
    help: values.help as boolean,
  };
}

// ============================================================================
// SCENARIO SELECTION
// ============================================================================

function getScenarios(suite: string) {
  switch (suite) {
    case "smoke":
      return SCENARIO_SETS.smoke;
    case "core":
      return SCENARIO_SETS.core;
    case "full":
      return SCENARIO_SETS.full;
    case "reasoning":
      return REASONING_SCENARIO_SETS.all;
    case "routing":
      return ROUTING_SCENARIO_SETS.all;
    case "edge-cases":
      return EDGE_CASE_SCENARIO_SETS.all;
    case "regression":
      return REGRESSION_SCENARIO_SETS.all;
    case "comparison":
      return COMPARISON_SCENARIO_SETS.all;
    case "taod":
      return REASONING_SCENARIO_SETS.taod;
    case "analyze":
      return REASONING_SCENARIO_SETS.analyze;
    case "planning":
      return REASONING_SCENARIO_SETS.planning;
    default:
      console.error(`Unknown suite: ${suite}`);
      console.log("Available suites: smoke, core, full, reasoning, routing, edge-cases, regression, comparison");
      process.exit(1);
  }
}

// ============================================================================
// MODEL RESOLUTION
// ============================================================================

function resolveModel(modelName: string): ModelConfig {
  const modelMap: Record<string, ModelConfig> = {
    "gpt-4o": MODELS.GPT_4O,
    "gpt-4-turbo": MODELS.GPT_4_TURBO,
    "gpt-4o-mini": MODELS.GPT_4O_MINI,
    "claude-3-5-sonnet": MODELS.CLAUDE_SONNET,
    "claude-sonnet": MODELS.CLAUDE_SONNET,
    "claude-3-5-haiku": MODELS.CLAUDE_HAIKU,
    "claude-haiku": MODELS.CLAUDE_HAIKU,
    "claude-3-opus": MODELS.CLAUDE_OPUS,
    "claude-opus": MODELS.CLAUDE_OPUS,
    "gemini-2.0-pro": MODELS.GEMINI_2_PRO,
    "gemini-pro": MODELS.GEMINI_2_PRO,
    "gemini-2.0-flash": MODELS.GEMINI_2_FLASH,
    "gemini-flash": MODELS.GEMINI_2_FLASH,
    "gemini-1.5-pro": MODELS.GEMINI_1_5_PRO,
  };

  const model = modelMap[modelName.toLowerCase()];
  if (!model) {
    console.error(`Unknown model: ${modelName}`);
    console.log("Available models:", Object.keys(modelMap).join(", "));
    process.exit(1);
  }

  return model;
}

function resolveModelGroup(groupName: string): ModelConfig[] {
  const group = MODEL_GROUPS[groupName as keyof typeof MODEL_GROUPS];
  if (!group) {
    console.error(`Unknown model group: ${groupName}`);
    console.log("Available groups:", Object.keys(MODEL_GROUPS).join(", "));
    process.exit(1);
  }
  return group;
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function runSingleModelBenchmark(args: CLIArgs): Promise<void> {
  const scenarios = getScenarios(args.suite);
  const model = resolveModel(args.model);

  // Check for required API key BEFORE running benchmarks
  const apiKeyEnvMap: Record<string, string> = {
    openai: "OPENAI_API_KEY",
    anthropic: "ANTHROPIC_API_KEY",
    google: "GOOGLE_API_KEY",
  };
  const requiredEnvVar = apiKeyEnvMap[model.provider];
  if (requiredEnvVar && !process.env[requiredEnvVar]) {
    console.error(`\n❌ Missing required API key: ${requiredEnvVar}`);
    console.error(`   The ${model.provider} provider requires ${requiredEnvVar} to be set.`);
    console.error(`\n   To fix this:`);
    console.error(`   1. Create a .env file in packages/ai-agents/`);
    console.error(`   2. Add: ${requiredEnvVar}=your-api-key-here`);
    console.error(`   3. Or set it inline: ${requiredEnvVar}=... pnpm benchmark:smoke\n`);
    process.exit(1);
  }

  console.log("\n🚀 Starting Benchmark");
  console.log(`   Suite: ${args.suite} (${scenarios.length} scenarios)`);
  console.log(`   Model: ${model.displayName || model.model}`);
  console.log(`   Provider: ${model.provider}`);
  if (args.debug) {
    console.log(`   Mode: Debug (showing reasoning flow)`);
  }
  console.log("");

  // Collect debug data for each scenario
  const debugSessions: Array<{ scenarioId: string; debugView: string }> = [];

  const runner = new BenchmarkRunner(
    {
      scenarios: scenarios,
      model: model.model,
      provider: model.provider,
      concurrency: 1,
      retries: 1,
    },
    {
      verbose: args.verbose,
      enableDebugLog: args.debug,
      onProgress: (completed, total, result) => {
        const status = result?.passed ? "✓" : "✗";
        const score = result?.overallScore.toFixed(0) || "0";

        if (args.debug && result) {
          // Show real-time ticker events for debug mode
          console.log("");
          console.log(`=== Scenario: ${result.scenarioId} ===`);
          console.log("");

          // Check if this was an initialization failure (0 tool calls, very short duration)
          const isInitFailure = result.rawData.toolCalls.length === 0 &&
            result.duration < 100 &&
            !result.passed;

          if (isInitFailure) {
            // Show error message prominently for initialization failures
            console.log("❌ Scenario failed during initialization");
            if (result.issues.length > 0) {
              for (const issue of result.issues) {
                console.log(`   [${issue.severity}] ${issue.message}`);
                if (issue.details) {
                  // Show first line of stack trace
                  const firstLine = issue.details.split("\n")[0];
                  console.log(`   ${firstLine}`);
                }
              }
            }
            console.log("");
          } else {
            // Show ticker events from tool calls
            for (const toolCall of result.rawData.toolCalls) {
              const tickerEvent: TickerEvent = {
                type: "tool",
                name: toolCall.tool,
                durationMs: toolCall.duration,
                success: !toolCall.error,
              };
              console.log(formatTickerEvent(tickerEvent));
            }

            // Show LLM call summary (only if there were actual LLM calls)
            if (result.rawData.events.some(e => e.type === "thinking" || e.type === "reasoning")) {
              const llmEvent: TickerEvent = {
                type: "llm",
                name: model.model,
                durationMs: result.duration - result.rawData.toolCalls.reduce((sum, t) => sum + t.duration, 0),
                success: result.passed,
                provider: model.provider,
              };
              console.log(formatTickerEvent(llmEvent));
            }
          }

          // Build and show debug view
          const scenario = getScenarioById(result.scenarioId);
          if (scenario) {
            const session = buildDebugSession(scenario, result);
            const debugView = generateDebugView(session);
            debugSessions.push({ scenarioId: result.scenarioId, debugView });
            console.log(debugView);
          }
        } else {
          console.log(`   [${completed}/${total}] ${status} ${result?.scenarioId} (${score}/100)`);
        }
      },
    }
  );

  const run = await runner.runAll();

  // Generate report (skip if debug mode already showed details)
  if (!args.debug) {
    const report = generateBenchmarkReport(run, {
      format: args.format as any,
      includeDetails: true,
      showEfficiency: true,
      showRecommendations: true,
    });
    console.log("\n" + report);
  } else {
    // Show summary in debug mode
    console.log("");
    console.log("═".repeat(80));
    console.log("  DEBUG BENCHMARK SUMMARY");
    console.log("═".repeat(80));
    console.log(`  Scenarios: ${run.summary.totalScenarios} total, ${run.summary.passedScenarios} passed, ${run.summary.failedScenarios} failed`);
    console.log(`  Pass Rate: ${run.summary.passRate.toFixed(1)}%`);
    console.log(`  Avg Score: ${run.summary.averageScore.toFixed(1)}/100`);
    console.log(`  Duration:  ${(run.summary.totalDuration / 1000).toFixed(1)}s`);
    console.log(`  Tokens:    ${run.summary.totalTokens.toLocaleString()}`);
    console.log("═".repeat(80));
  }

  // Save to file if specified
  if (args.output) {
    const fs = await import("node:fs/promises");
    if (args.debug) {
      // In debug mode, save debug views
      const debugOutput = debugSessions.map((s) => s.debugView).join("\n\n");
      await fs.writeFile(args.output, debugOutput);
    } else {
      const report = generateBenchmarkReport(run, {
        format: args.format as any,
        includeDetails: true,
        showEfficiency: true,
        showRecommendations: true,
      });
      await fs.writeFile(args.output, report);
    }
    console.log(`\n📄 Report saved to: ${args.output}`);
  }

  // Save to storage
  const storage = new FileBenchmarkStorage();
  await storage.saveRun(run);
  console.log(`\n💾 Results saved with run ID: ${run.runId}`);
}

async function runMultiModelComparison(args: CLIArgs): Promise<void> {
  const scenarios = getScenarios(args.suite);

  // Resolve models
  let models: ModelConfig[];
  if (args.modelGroup) {
    models = resolveModelGroup(args.modelGroup);
  } else if (args.models) {
    models = args.models.split(",").map((m) => resolveModel(m.trim()));
  } else {
    models = MODEL_GROUPS.flagship;
  }

  console.log("\n🚀 Starting Multi-Model Comparison");
  console.log(`   Suite: ${args.suite} (${scenarios.length} scenarios)`);
  console.log(`   Models: ${models.map((m) => m.displayName || m.model).join(", ")}\n`);

  const runner = new MultiConfigBenchmarkRunner({
    models,
    scenarios,
    parallelModels: false,
    concurrencyPerModel: 1,
    runnerOptions: {
      verbose: args.verbose,
      onProgress: (completed, total, result) => {
        const status = result?.passed ? "✓" : "✗";
        console.log(`   [${completed}/${total}] ${status} ${result?.scenarioId}`);
      },
    },
  });

  const result = await runner.runAll();

  // Generate comparison report
  const report = generateMultiModelReport(result.comparison);
  console.log("\n" + report);

  // Show winner
  console.log("\n🏆 Best Configuration:");
  console.log(`   Model: ${result.bestConfig.model.displayName || result.bestConfig.model.model}`);
  console.log(`   Score: ${result.bestConfig.score.toFixed(1)}/100`);
  console.log(`   Pass Rate: ${result.bestConfig.passRate.toFixed(1)}%`);

  // Save to file if specified
  if (args.output) {
    const fs = await import("node:fs/promises");
    await fs.writeFile(args.output, report);
    console.log(`\n📄 Report saved to: ${args.output}`);
  }
}

async function main(): Promise<void> {
  const args = parseCliArgs();

  if (args.help) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  try {
    if (args.compare || args.modelGroup || args.models) {
      await runMultiModelComparison(args);
    } else {
      await runSingleModelBenchmark(args);
    }
  } catch (error) {
    console.error("\n❌ Benchmark failed:", (error as Error).message);
    if (args.verbose) {
      console.error((error as Error).stack);
    }
    process.exit(1);
  }
}

main();
