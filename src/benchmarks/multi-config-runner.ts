/**
 * Multi-Configuration Benchmark Runner
 *
 * Runs benchmarks across multiple configurations for comparison:
 * - Different LLM models (GPT-4, Claude, Gemini)
 * - Different providers
 * - Different prompt versions
 * - Different agent configurations
 *
 * Enables systematic optimization of agent performance over time.
 */

import type {
  BenchmarkRun,
  BenchmarkConfig,
  BenchmarkScenario,
  ScenarioResult,
} from "./types.js";
import { BenchmarkRunner, type RunnerOptions } from "./runner.js";
import {
  generateConsoleReport,
  generateMarkdownReport,
  generateMultiModelReport,
  type MultiModelComparisonResult,
} from "./report-format.js";
import { FileBenchmarkStorage, MemoryBenchmarkStorage, type BenchmarkStorage } from "./storage.js";

// ============================================================================
// TYPES
// ============================================================================

/**
 * A single model/provider configuration
 */
export interface ModelConfig {
  /** Model identifier (e.g., "gpt-4o", "claude-3-5-sonnet") */
  model: string;
  /** Provider name */
  provider: "google" | "openai" | "anthropic";
  /** Optional display name */
  displayName?: string;
  /** Optional environment variable for API key */
  apiKeyEnv?: string;
}

/**
 * Agent version/configuration
 */
export interface AgentVersion {
  /** Version identifier */
  id: string;
  /** Version name */
  name: string;
  /** Prompt version */
  promptVersion?: "v1" | "v2";
  /** System prompt override */
  systemPromptOverride?: string;
  /** Tool configuration override */
  toolConfig?: Record<string, unknown>;
  /** Description */
  description?: string;
}

/**
 * Multi-configuration benchmark options
 */
export interface MultiConfigBenchmarkOptions {
  /** Models to test */
  models: ModelConfig[];
  /** Agent versions to test (optional) */
  agentVersions?: AgentVersion[];
  /** Scenarios to run */
  scenarios: BenchmarkScenario[] | string[];
  /** Runner options */
  runnerOptions?: RunnerOptions;
  /** Concurrency per model */
  concurrencyPerModel?: number;
  /** Run models in parallel */
  parallelModels?: boolean;
  /** Storage for results */
  storage?: BenchmarkStorage;
  /** Tags for this benchmark run */
  tags?: string[];
}

/**
 * Multi-configuration benchmark result
 */
export interface MultiConfigBenchmarkResult {
  /** Overall run ID */
  runId: string;
  /** Timestamp */
  timestamp: number;
  /** Duration of entire benchmark */
  totalDuration: number;
  /** Configurations tested */
  configurations: Array<{
    model: ModelConfig;
    agentVersion?: AgentVersion;
    run: BenchmarkRun;
  }>;
  /** Aggregated comparison */
  comparison: MultiModelComparisonResult;
  /** Best performing configuration */
  bestConfig: {
    model: ModelConfig;
    agentVersion?: AgentVersion;
    score: number;
    passRate: number;
  };
  /** Winner by category */
  winnersByCategory: Record<string, { model: string; score: number }>;
}

// ============================================================================
// PREDEFINED MODEL CONFIGURATIONS
// ============================================================================

export const MODELS = {
  // OpenAI
  GPT_4O: {
    model: "gpt-4o",
    provider: "openai" as const,
    displayName: "GPT-4o",
    apiKeyEnv: "OPENAI_API_KEY",
  },
  GPT_4_TURBO: {
    model: "gpt-4-turbo",
    provider: "openai" as const,
    displayName: "GPT-4 Turbo",
    apiKeyEnv: "OPENAI_API_KEY",
  },
  GPT_4O_MINI: {
    model: "gpt-4o-mini",
    provider: "openai" as const,
    displayName: "GPT-4o Mini",
    apiKeyEnv: "OPENAI_API_KEY",
  },

  // Anthropic
  CLAUDE_SONNET: {
    model: "claude-3-5-sonnet-20241022",
    provider: "anthropic" as const,
    displayName: "Claude 3.5 Sonnet",
    apiKeyEnv: "ANTHROPIC_API_KEY",
  },
  CLAUDE_HAIKU: {
    model: "claude-3-5-haiku-20241022",
    provider: "anthropic" as const,
    displayName: "Claude 3.5 Haiku",
    apiKeyEnv: "ANTHROPIC_API_KEY",
  },
  CLAUDE_OPUS: {
    model: "claude-3-opus-20240229",
    provider: "anthropic" as const,
    displayName: "Claude 3 Opus",
    apiKeyEnv: "ANTHROPIC_API_KEY",
  },

  // Google
  GEMINI_2_PRO: {
    model: "gemini-2.0-pro",
    provider: "google" as const,
    displayName: "Gemini 2.0 Pro",
    apiKeyEnv: "GOOGLE_API_KEY",
  },
  GEMINI_2_FLASH: {
    model: "gemini-2.0-flash",
    provider: "google" as const,
    displayName: "Gemini 2.0 Flash",
    apiKeyEnv: "GOOGLE_API_KEY",
  },
  GEMINI_1_5_PRO: {
    model: "gemini-1.5-pro",
    provider: "google" as const,
    displayName: "Gemini 1.5 Pro",
    apiKeyEnv: "GOOGLE_API_KEY",
  },
};

/**
 * Predefined model groups for common comparisons
 */
export const MODEL_GROUPS = {
  /** All top-tier models */
  flagship: [MODELS.GPT_4O, MODELS.CLAUDE_SONNET, MODELS.GEMINI_2_PRO],

  /** Fast/cost-effective models */
  fast: [MODELS.GPT_4O_MINI, MODELS.CLAUDE_HAIKU, MODELS.GEMINI_2_FLASH],

  /** OpenAI only */
  openai: [MODELS.GPT_4O, MODELS.GPT_4_TURBO, MODELS.GPT_4O_MINI],

  /** Anthropic only */
  anthropic: [MODELS.CLAUDE_SONNET, MODELS.CLAUDE_HAIKU, MODELS.CLAUDE_OPUS],

  /** Google only */
  google: [MODELS.GEMINI_2_PRO, MODELS.GEMINI_2_FLASH, MODELS.GEMINI_1_5_PRO],

  /** Single model for quick testing */
  quick: [MODELS.GPT_4O_MINI],
};

// ============================================================================
// MULTI-CONFIG RUNNER CLASS
// ============================================================================

export class MultiConfigBenchmarkRunner {
  private options: MultiConfigBenchmarkOptions;
  private storage: BenchmarkStorage;

  constructor(options: MultiConfigBenchmarkOptions) {
    this.options = options;
    this.storage = options.storage || new MemoryBenchmarkStorage();
  }

  /**
   * Run benchmarks across all configurations
   */
  async runAll(): Promise<MultiConfigBenchmarkResult> {
    const runId = `multi_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const startTime = Date.now();

    console.log("\n🚀 Starting Multi-Configuration Benchmark");
    console.log(`   Run ID: ${runId}`);
    console.log(`   Models: ${this.options.models.map((m) => m.displayName || m.model).join(", ")}`);
    console.log(`   Scenarios: ${this.getScenarioCount()} scenarios\n`);

    // Build configurations to test
    const configs = this.buildConfigurations();

    // Run benchmarks
    const configResults: MultiConfigBenchmarkResult["configurations"] = [];

    if (this.options.parallelModels) {
      // Run all models in parallel
      const results = await Promise.all(
        configs.map((config) => this.runConfiguration(config, runId))
      );
      configResults.push(...results);
    } else {
      // Run models sequentially
      for (const config of configs) {
        const result = await this.runConfiguration(config, runId);
        configResults.push(result);
      }
    }

    const totalDuration = Date.now() - startTime;

    // Build comparison
    const comparison = this.buildComparison(configResults);

    // Find best configuration
    const bestConfig = this.findBestConfig(configResults);

    // Find winners by category
    const winnersByCategory = this.findWinnersByCategory(configResults);

    const result: MultiConfigBenchmarkResult = {
      runId,
      timestamp: startTime,
      totalDuration,
      configurations: configResults,
      comparison,
      bestConfig,
      winnersByCategory,
    };

    // Store aggregate result
    await this.storeResult(result);

    return result;
  }

  /**
   * Build list of configurations to test
   */
  private buildConfigurations(): Array<{ model: ModelConfig; agentVersion?: AgentVersion }> {
    const configs: Array<{ model: ModelConfig; agentVersion?: AgentVersion }> = [];

    if (this.options.agentVersions && this.options.agentVersions.length > 0) {
      // Cross-product of models × versions
      for (const model of this.options.models) {
        for (const version of this.options.agentVersions) {
          configs.push({ model, agentVersion: version });
        }
      }
    } else {
      // Just models
      for (const model of this.options.models) {
        configs.push({ model });
      }
    }

    return configs;
  }

  /**
   * Run a single configuration
   */
  private async runConfiguration(
    config: { model: ModelConfig; agentVersion?: AgentVersion },
    parentRunId: string
  ): Promise<{ model: ModelConfig; agentVersion?: AgentVersion; run: BenchmarkRun }> {
    const displayName = config.agentVersion
      ? `${config.model.displayName || config.model.model} (${config.agentVersion.name})`
      : config.model.displayName || config.model.model;

    console.log(`\n📊 Running: ${displayName}`);

    // Check for API key
    if (config.model.apiKeyEnv && !process.env[config.model.apiKeyEnv]) {
      console.log(`   ⚠️  Skipping: ${config.model.apiKeyEnv} not set`);
      return {
        model: config.model,
        agentVersion: config.agentVersion,
        run: this.createSkippedRun(config, parentRunId),
      };
    }

    // Convert scenarios to IDs
    const scenarioIds = this.options.scenarios.map((s) =>
      typeof s === "string" ? s : (s as BenchmarkScenario).id
    );

    const benchConfig: BenchmarkConfig = {
      model: config.model.model,
      provider: config.model.provider,
      promptVersion: config.agentVersion?.promptVersion,
      concurrency: this.options.concurrencyPerModel || 1,
      retries: 1,
      scenarios: scenarioIds,
    };

    const runner = new BenchmarkRunner(
      benchConfig,
      {
        verbose: false,
        onProgress: (completed, total, result) => {
          const status = result?.passed ? "✓" : "✗";
          console.log(`   [${completed}/${total}] ${status} ${result?.scenarioId}`);
        },
        ...this.options.runnerOptions,
      }
    );

    // Run the benchmark
    const run = await runner.runAll();

    // Store individual run
    await this.storage.saveRun(run);

    console.log(`   ✅ Complete: ${run.summary.passRate.toFixed(1)}% pass, ${run.summary.averageScore.toFixed(1)} avg`);

    return {
      model: config.model,
      agentVersion: config.agentVersion,
      run,
    };
  }

  /**
   * Create a placeholder run for skipped configurations
   */
  private createSkippedRun(
    config: { model: ModelConfig; agentVersion?: AgentVersion },
    parentRunId: string
  ): BenchmarkRun {
    return {
      runId: `${parentRunId}_skipped_${config.model.model}`,
      timestamp: Date.now(),
      config: {
        model: config.model.model,
        provider: config.model.provider,
        promptVersion: config.agentVersion?.promptVersion,
      },
      results: [],
      summary: {
        totalScenarios: 0,
        passedScenarios: 0,
        failedScenarios: 0,
        passRate: 0,
        averageScore: 0,
        scoresByCategory: {} as any,
        scoresByComplexity: {} as any,
        commonIssues: [],
        totalDuration: 0,
        totalTokens: 0,
      },
    };
  }

  /**
   * Build comparison data structure
   */
  private buildComparison(
    configResults: MultiConfigBenchmarkResult["configurations"]
  ): MultiModelComparisonResult {
    // Get all unique scenario IDs
    const allScenarios = new Set<string>();
    for (const config of configResults) {
      for (const result of config.run.results) {
        allScenarios.add(result.scenarioId);
      }
    }

    // Build model data
    const models = configResults.map((config) => ({
      model: config.model.model,
      provider: config.model.provider,
      runId: config.run.runId,
      summary: config.run.summary,
      results: new Map(config.run.results.map((r) => [r.scenarioId, r])),
    }));

    return {
      scenarios: Array.from(allScenarios).sort(),
      models,
    };
  }

  /**
   * Find the best performing configuration
   */
  private findBestConfig(
    configResults: MultiConfigBenchmarkResult["configurations"]
  ): MultiConfigBenchmarkResult["bestConfig"] {
    let best = configResults[0];

    for (const config of configResults) {
      if (config.run.summary.averageScore > best.run.summary.averageScore) {
        best = config;
      }
    }

    return {
      model: best.model,
      agentVersion: best.agentVersion,
      score: best.run.summary.averageScore,
      passRate: best.run.summary.passRate,
    };
  }

  /**
   * Find winners by category
   */
  private findWinnersByCategory(
    configResults: MultiConfigBenchmarkResult["configurations"]
  ): Record<string, { model: string; score: number }> {
    const winners: Record<string, { model: string; score: number }> = {};

    // Get all categories
    const categories = new Set<string>();
    for (const config of configResults) {
      for (const category of Object.keys(config.run.summary.scoresByCategory)) {
        categories.add(category);
      }
    }

    // Find winner for each category
    for (const category of categories) {
      let bestModel = "";
      let bestScore = -1;

      for (const config of configResults) {
        const categoryStats = config.run.summary.scoresByCategory;
        const stats = categoryStats[category as keyof typeof categoryStats];
        if (stats && stats.averageScore > bestScore) {
          bestScore = stats.averageScore;
          bestModel = config.model.displayName || config.model.model;
        }
      }

      if (bestModel) {
        winners[category] = { model: bestModel, score: bestScore };
      }
    }

    return winners;
  }

  /**
   * Store the multi-config result
   */
  private async storeResult(result: MultiConfigBenchmarkResult): Promise<void> {
    // Store as a JSON file if using file storage
    if (this.storage instanceof FileBenchmarkStorage) {
      // The individual runs are already stored; we could add a summary file
    }
  }

  /**
   * Get scenario count
   */
  private getScenarioCount(): number {
    if (typeof this.options.scenarios[0] === "string") {
      return this.options.scenarios.length;
    }
    return (this.options.scenarios as BenchmarkScenario[]).length;
  }

  /**
   * Generate comparison report
   */
  generateReport(result: MultiConfigBenchmarkResult, format: "console" | "markdown" = "console"): string {
    return generateMultiModelReport(result.comparison);
  }
}

// ============================================================================
// QUICK RUN FUNCTIONS
// ============================================================================

/**
 * Compare flagship models on smoke test scenarios
 */
export async function compareModelsQuick(
  scenarios: BenchmarkScenario[]
): Promise<MultiConfigBenchmarkResult> {
  const runner = new MultiConfigBenchmarkRunner({
    models: MODEL_GROUPS.flagship,
    scenarios,
    parallelModels: false,
  });

  return runner.runAll();
}

/**
 * Compare all models on a full benchmark suite
 */
export async function compareModelsFull(
  scenarios: BenchmarkScenario[],
  models: ModelConfig[] = MODEL_GROUPS.flagship
): Promise<MultiConfigBenchmarkResult> {
  const runner = new MultiConfigBenchmarkRunner({
    models,
    scenarios,
    parallelModels: false,
    concurrencyPerModel: 2,
  });

  return runner.runAll();
}

/**
 * A/B test two prompt versions
 */
export async function abTestPromptVersions(
  scenarios: BenchmarkScenario[],
  model: ModelConfig = MODELS.GPT_4O
): Promise<MultiConfigBenchmarkResult> {
  const runner = new MultiConfigBenchmarkRunner({
    models: [model],
    agentVersions: [
      { id: "v1", name: "Prompt V1", promptVersion: "v1" },
      { id: "v2", name: "Prompt V2", promptVersion: "v2" },
    ],
    scenarios,
    parallelModels: false,
  });

  return runner.runAll();
}
