/**
 * Infographic Planning Strategy
 *
 * Claude Code-like approach for complex multi-section infographic generation.
 * Implements hierarchical planning with specialized sub-agent delegation.
 *
 * ## How Claude Code Handles Complex Projects:
 *
 * 1. **Plan Mode** - Analyze task, break into subtasks, identify dependencies
 * 2. **Todo Tracking** - Create work items, mark progress
 * 3. **Parallel Agents** - Spawn independent tasks concurrently
 * 4. **Sequential Agents** - Chain dependent tasks
 * 5. **Merge Phase** - Combine results, apply final polish
 *
 * ## Infographic Complexity Levels:
 *
 * - **Simple** (1-2 sections): Direct execution, no planning
 * - **Moderate** (3-5 sections): Light planning, sequential delegation
 * - **Complex** (6+ sections): Full planning, parallel + sequential delegation
 */

import type {
  AgentType,
  AgentEvent,
  SubAgentRequest,
  SubAgentResult,
} from "../types/index.js";
import { delegateToAgent, delegateParallel, type AgentRequest, type AgentResult } from "../core/delegation.js";
import type { MCPExecutor } from "../core/loop.js";
import type { HooksManager } from "../hooks/manager.js";

// ============================================================================
// INFOGRAPHIC SECTION TYPES
// ============================================================================

/**
 * Types of sections that can appear in an infographic
 */
export type InfographicSectionType =
  | "header" // Title, subtitle, branding
  | "statistics" // Key numbers, metrics, KPIs
  | "chart" // Bar, pie, line charts
  | "diagram" // Flowchart, process diagram
  | "timeline" // Sequential events
  | "comparison" // Before/after, vs tables
  | "icons" // Icon grid, feature list
  | "image" // Hero image, illustration
  | "quote" // Testimonial, callout
  | "footer" // Sources, credits, CTA
  | "divider"; // Visual separator

/**
 * A section in the infographic plan
 */
export interface InfographicSection {
  id: string;
  type: InfographicSectionType;
  title: string;
  description: string;

  /** Position in layout (row index) */
  row: number;

  /** Relative height (1 = standard, 2 = double) */
  heightUnits: number;

  /** Content specification */
  content: {
    text?: string[];
    data?: Record<string, unknown>;
    imagePrompt?: string;
  };

  /** Which agent should handle this section */
  assignedAgent: AgentType | InfographicSpecialist;

  /** Dependencies on other sections (must complete first) */
  dependsOn: string[];

  /** Estimated complexity */
  complexity: "low" | "medium" | "high";
}

/**
 * Specialized agents for infographic sections
 */
export type InfographicSpecialist =
  | "chart-specialist" // Statistical visualizations
  | "icon-specialist" // Icon arrangements
  | "image-specialist" // Image generation/placement
  | "typography-specialist"; // Text hierarchy

// ============================================================================
// INFOGRAPHIC PLAN
// ============================================================================

/**
 * Complete plan for generating an infographic
 */
export interface InfographicPlan {
  /** Unique plan ID */
  id: string;

  /** Original user request */
  originalRequest: string;

  /** Analyzed theme/topic */
  theme: string;

  /** Target dimensions */
  dimensions: {
    width: number;
    height: number;
    orientation: "portrait" | "landscape";
  };

  /** Color palette derived from theme */
  colorPalette: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
  };

  /** All sections in order */
  sections: InfographicSection[];

  /** Execution phases */
  phases: ExecutionPhase[];

  /** Overall complexity */
  complexity: "simple" | "moderate" | "complex";

  /** Estimated token budget */
  estimatedTokens: number;

  /** Whether user approval is needed */
  requiresApproval: boolean;
}

/**
 * An execution phase groups sections that can run together
 */
export interface ExecutionPhase {
  id: string;
  name: string;
  description: string;

  /** Sections to execute in this phase */
  sectionIds: string[];

  /** Can sections run in parallel? */
  parallel: boolean;

  /** Dependencies on previous phases */
  dependsOnPhases: string[];
}

// ============================================================================
// PLAN ANALYSIS ENGINE
// ============================================================================

/**
 * Analyze user request and generate an infographic plan
 *
 * This is the "Plan Mode" equivalent - thoroughly analyzes the request
 * before any execution begins.
 */
export function analyzeInfographicRequest(request: string): InfographicPlan {
  const lower = request.toLowerCase();

  // Extract theme and key topics
  const theme = extractTheme(request);
  const topics = extractTopics(request);

  // Determine dimensions
  const dimensions = inferDimensions(request);

  // Generate sections based on content
  const sections = generateSections(request, topics, theme);

  // Group into execution phases
  const phases = groupIntoPhases(sections);

  // Calculate complexity
  const complexity = calculateInfographicComplexity(sections);

  // Estimate token usage
  const estimatedTokens = estimateTokenBudget(sections);

  return {
    id: `infographic-${Date.now()}`,
    originalRequest: request,
    theme,
    dimensions,
    colorPalette: generateColorPalette(theme),
    sections,
    phases,
    complexity,
    estimatedTokens,
    requiresApproval: complexity === "complex",
  };
}

/**
 * Extract the main theme from the request
 */
function extractTheme(request: string): string {
  // Look for explicit theme mentions
  const themePatterns = [
    /(?:about|on|regarding) (.+?)(?:\.|,|$)/i,
    /(?:infographic|visual) (?:on|about|for) (.+?)(?:\.|,|$)/i,
    /(.+?) infographic/i,
  ];

  for (const pattern of themePatterns) {
    const match = request.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }

  // Default: first significant phrase
  return request.split(/[.,!?]/)[0].trim();
}

/**
 * Extract key topics/data points from the request
 */
function extractTopics(request: string): string[] {
  const topics: string[] = [];
  const lower = request.toLowerCase();

  // Look for list patterns
  const listMatch = request.match(
    /(?:including|with|showing|featuring)[:\s]+(.+?)(?:\.|$)/i
  );
  if (listMatch) {
    topics.push(
      ...listMatch[1].split(/,|and/).map((t) => t.trim())
    );
  }

  // Look for numbered items
  const numberedMatch = request.match(/\d+\.\s*([^,.\n]+)/g);
  if (numberedMatch) {
    topics.push(...numberedMatch.map((m) => m.replace(/^\d+\.\s*/, "").trim()));
  }

  // Look for section mentions
  const sectionKeywords = [
    "statistics",
    "chart",
    "graph",
    "timeline",
    "comparison",
    "steps",
    "process",
    "benefits",
    "features",
  ];
  for (const keyword of sectionKeywords) {
    if (lower.includes(keyword)) {
      topics.push(keyword);
    }
  }

  return [...new Set(topics)];
}

/**
 * Infer dimensions based on content and request
 */
function inferDimensions(request: string): InfographicPlan["dimensions"] {
  const lower = request.toLowerCase();

  // Check for explicit orientation
  if (lower.includes("landscape") || lower.includes("wide")) {
    return { width: 1200, height: 800, orientation: "landscape" };
  }

  if (lower.includes("social") || lower.includes("instagram")) {
    return { width: 1080, height: 1080, orientation: "portrait" };
  }

  if (lower.includes("pinterest") || lower.includes("tall")) {
    return { width: 800, height: 2000, orientation: "portrait" };
  }

  // Default: standard infographic (portrait)
  return { width: 800, height: 1600, orientation: "portrait" };
}

// ============================================================================
// SECTION GENERATION
// ============================================================================

/**
 * Generate sections based on analyzed content
 */
function generateSections(
  request: string,
  topics: string[],
  theme: string
): InfographicSection[] {
  const sections: InfographicSection[] = [];
  let rowIndex = 0;

  // Always start with header
  sections.push(createSection("header", theme, rowIndex++, {
    title: theme,
    description: "Main title and branding",
    content: { text: [theme] },
    assignedAgent: "typography-specialist",
    complexity: "low",
    dependsOn: [],
  }));

  // Analyze request for specific section types
  const lower = request.toLowerCase();

  // Statistics section
  if (
    lower.includes("statistic") ||
    lower.includes("number") ||
    lower.includes("metric") ||
    lower.includes("kpi")
  ) {
    sections.push(createSection("statistics", "Key Statistics", rowIndex++, {
      description: "Display key metrics and numbers",
      assignedAgent: "canvas-agent",
      complexity: "medium",
      dependsOn: ["header"],
    }));
  }

  // Chart section
  if (
    lower.includes("chart") ||
    lower.includes("graph") ||
    lower.includes("data")
  ) {
    sections.push(createSection("chart", "Data Visualization", rowIndex++, {
      description: "Bar, pie, or line chart visualization",
      assignedAgent: "chart-specialist",
      complexity: "high",
      dependsOn: ["header"],
    }));
  }

  // Timeline section
  if (
    lower.includes("timeline") ||
    lower.includes("history") ||
    lower.includes("evolution") ||
    lower.includes("roadmap")
  ) {
    sections.push(createSection("timeline", "Timeline", rowIndex++, {
      description: "Chronological sequence of events",
      assignedAgent: "diagram-specialist",
      complexity: "high",
      dependsOn: ["header"],
      heightUnits: 2,
    }));
  }

  // Process/diagram section
  if (
    lower.includes("process") ||
    lower.includes("flow") ||
    lower.includes("step") ||
    lower.includes("how")
  ) {
    sections.push(createSection("diagram", "Process Flow", rowIndex++, {
      description: "Step-by-step process visualization",
      assignedAgent: "diagram-specialist",
      complexity: "high",
      dependsOn: ["header"],
      heightUnits: 2,
    }));
  }

  // Comparison section
  if (
    lower.includes("compar") || // matches compare, comparison, comparing
    lower.includes("vs") ||
    lower.includes("versus") ||
    lower.includes("before") ||
    lower.includes("after")
  ) {
    sections.push(createSection("comparison", "Comparison", rowIndex++, {
      description: "Side-by-side comparison",
      assignedAgent: "layout-specialist",
      complexity: "medium",
      dependsOn: ["header"],
    }));
  }

  // Icons/features section
  if (
    lower.includes("feature") ||
    lower.includes("benefit") ||
    lower.includes("icon") ||
    lower.includes("list")
  ) {
    sections.push(createSection("icons", "Features & Benefits", rowIndex++, {
      description: "Icon grid with labels",
      assignedAgent: "icon-specialist",
      complexity: "medium",
      dependsOn: ["header"],
    }));
  }

  // Image section
  if (
    lower.includes("image") ||
    lower.includes("illustration") ||
    lower.includes("photo") ||
    lower.includes("visual")
  ) {
    sections.push(createSection("image", "Hero Image", rowIndex++, {
      description: "Main illustration or photo",
      assignedAgent: "image-specialist",
      complexity: "high",
      dependsOn: ["header"],
      heightUnits: 2,
    }));
  }

  // Quote section
  if (
    lower.includes("quote") ||
    lower.includes("testimonial") ||
    lower.includes("callout")
  ) {
    sections.push(createSection("quote", "Key Quote", rowIndex++, {
      description: "Highlighted quote or testimonial",
      assignedAgent: "typography-specialist",
      complexity: "low",
      dependsOn: [],
    }));
  }

  // If no specific sections detected, add defaults
  if (sections.length <= 1) {
    sections.push(
      createSection("statistics", "Key Facts", rowIndex++, {
        description: "Important numbers and facts",
        assignedAgent: "canvas-agent",
        complexity: "medium",
        dependsOn: ["header"],
      }),
      createSection("icons", "Main Points", rowIndex++, {
        description: "Core concepts with icons",
        assignedAgent: "icon-specialist",
        complexity: "medium",
        dependsOn: ["header"],
      }),
      createSection("diagram", "Visual Summary", rowIndex++, {
        description: "Visual representation of the topic",
        assignedAgent: "diagram-specialist",
        complexity: "high",
        dependsOn: ["header"],
      })
    );
  }

  // Always end with footer
  sections.push(createSection("footer", "Footer", rowIndex++, {
    description: "Sources, credits, and call-to-action",
    assignedAgent: "typography-specialist",
    complexity: "low",
    dependsOn: sections.map((s) => s.id).filter((id) => id !== "header"),
  }));

  return sections;
}

/**
 * Helper to create a section
 */
function createSection(
  type: InfographicSectionType,
  title: string,
  row: number,
  options: Partial<InfographicSection>
): InfographicSection {
  return {
    id: `section-${type}-${row}`,
    type,
    title,
    description: options.description || `${title} section`,
    row,
    heightUnits: options.heightUnits || 1,
    content: options.content || {},
    assignedAgent: options.assignedAgent || "canvas-agent",
    dependsOn: options.dependsOn || [],
    complexity: options.complexity || "medium",
  };
}

// ============================================================================
// PHASE GROUPING
// ============================================================================

/**
 * Group sections into execution phases based on dependencies
 *
 * This is how Claude Code handles complexity:
 * - Phase 1: Independent tasks (can run in parallel)
 * - Phase 2: Tasks depending on Phase 1
 * - Phase 3: Final assembly
 */
function groupIntoPhases(sections: InfographicSection[]): ExecutionPhase[] {
  const phases: ExecutionPhase[] = [];

  // Phase 0: Foundation (header, layout skeleton)
  const foundationSections = sections.filter(
    (s) => s.type === "header" || s.dependsOn.length === 0
  );
  if (foundationSections.length > 0) {
    phases.push({
      id: "phase-0",
      name: "Foundation",
      description: "Create header and layout skeleton",
      sectionIds: foundationSections.map((s) => s.id),
      parallel: false, // Sequential for foundation
      dependsOnPhases: [],
    });
  }

  // Phase 1: Independent content sections (PARALLEL)
  const independentSections = sections.filter(
    (s) =>
      s.type !== "header" &&
      s.type !== "footer" &&
      s.dependsOn.length <= 1 && // Only depends on header
      s.complexity !== "high"
  );
  if (independentSections.length > 0) {
    phases.push({
      id: "phase-1",
      name: "Content Generation",
      description: "Generate independent content sections in parallel",
      sectionIds: independentSections.map((s) => s.id),
      parallel: true, // Run these in parallel!
      dependsOnPhases: ["phase-0"],
    });
  }

  // Phase 2: Complex sections (may need results from Phase 1)
  const complexSections = sections.filter(
    (s) =>
      s.type !== "header" &&
      s.type !== "footer" &&
      (s.complexity === "high" || s.dependsOn.length > 1)
  );
  if (complexSections.length > 0) {
    phases.push({
      id: "phase-2",
      name: "Complex Sections",
      description: "Generate complex visualizations",
      sectionIds: complexSections.map((s) => s.id),
      parallel: complexSections.length >= 2, // Parallel if multiple
      dependsOnPhases: phases.length > 1 ? ["phase-1"] : ["phase-0"],
    });
  }

  // Phase 3: Assembly (footer, final layout, styling)
  const assemblySection = sections.find((s) => s.type === "footer");
  if (assemblySection) {
    phases.push({
      id: "phase-3",
      name: "Assembly & Polish",
      description: "Add footer, apply final styling, ensure consistency",
      sectionIds: [assemblySection.id],
      parallel: false,
      dependsOnPhases: phases.map((p) => p.id),
    });
  }

  return phases;
}

// ============================================================================
// COMPLEXITY & TOKEN ESTIMATION
// ============================================================================

function calculateInfographicComplexity(
  sections: InfographicSection[]
): InfographicPlan["complexity"] {
  const sectionCount = sections.length;
  const highComplexitySections = sections.filter(
    (s) => s.complexity === "high"
  ).length;

  if (sectionCount <= 3 && highComplexitySections === 0) {
    return "simple";
  }

  if (sectionCount <= 6 && highComplexitySections <= 2) {
    return "moderate";
  }

  return "complex";
}

function estimateTokenBudget(sections: InfographicSection[]): number {
  const baseTokens = 2000; // System prompt, context
  const tokensPerSection: Record<InfographicSection["complexity"], number> = {
    low: 500,
    medium: 1000,
    high: 2000,
  };

  return sections.reduce(
    (total, section) => total + tokensPerSection[section.complexity],
    baseTokens
  );
}

function generateColorPalette(
  theme: string
): InfographicPlan["colorPalette"] {
  // In production, this would use AI to generate theme-appropriate colors
  // For now, return a professional default palette
  return {
    primary: "#2563eb", // Blue
    secondary: "#64748b", // Slate
    accent: "#f59e0b", // Amber
    background: "#ffffff",
    text: "#1e293b",
  };
}

// ============================================================================
// EXECUTION ENGINE
// ============================================================================

/**
 * Execute an infographic plan using the delegation system
 *
 * This is the main orchestration loop that:
 * 1. Emits plan for user review
 * 2. Executes phases in order
 * 3. Runs parallel sections concurrently
 * 4. Merges results between phases
 * 5. Applies final polish
 */
export async function* executeInfographicPlan(
  plan: InfographicPlan,
  canvasId: string,
  executor: MCPExecutor,
  hooks?: HooksManager
): AsyncGenerator<AgentEvent> {
  // Emit plan for visibility (like Claude Code's TodoWrite)
  yield {
    type: "plan",
    message: `Infographic Plan: ${plan.complexity} complexity, ${plan.sections.length} sections`,
    steps: plan.phases.map(
      (p) =>
        `${p.name}: ${p.sectionIds.length} sections ${p.parallel ? "(parallel)" : "(sequential)"}`
    ),
    metadata: {
      planId: plan.id,
      theme: plan.theme,
      dimensions: plan.dimensions,
      colorPalette: plan.colorPalette,
    },
  };

  // Track completed sections for merging
  const completedSections: Map<string, SubAgentResult> = new Map();
  const sectionMap = new Map(plan.sections.map((s) => [s.id, s]));

  // Execute each phase
  for (const phase of plan.phases) {
    yield {
      type: "step_start",
      step: phase.name,
      message: phase.description,
    };

    // Get sections for this phase
    const phaseSections = phase.sectionIds
      .map((id) => sectionMap.get(id))
      .filter((s): s is InfographicSection => s !== undefined);

    if (phase.parallel && phaseSections.length > 1) {
      // === PARALLEL EXECUTION ===
      yield {
        type: "thinking",
        message: `Running ${phaseSections.length} sections in parallel...`,
      };

      const requests: SubAgentRequest[] = phaseSections.map((section) => ({
        agentType: mapToCanvasAgent(section.assignedAgent),
        task: buildSectionTask(section, plan, completedSections),
        context: buildSectionContext(section, plan),
        maxTokens: section.complexity === "high" ? 3000 : 1500,
      }));

      const results = await delegateParallel(requests, executor, hooks);

      // Process results
      for (let i = 0; i < results.length; i++) {
        const section = phaseSections[i];
        const result = results[i];

        completedSections.set(section.id, result);

        yield {
          type: result.success ? "step_complete" : "error",
          step: section.title,
          message: result.success
            ? `✓ ${section.title} completed`
            : `✗ ${section.title} failed: ${result.error}`,
        };
      }
    } else {
      // === SEQUENTIAL EXECUTION ===
      for (const section of phaseSections) {
        yield {
          type: "thinking",
          message: `Working on: ${section.title}`,
        };

        const result = await delegateToAgent(
          {
            agentType: mapToCanvasAgent(section.assignedAgent),
            task: buildSectionTask(section, plan, completedSections),
            context: buildSectionContext(section, plan),
            maxTokens: section.complexity === "high" ? 3000 : 1500,
          },
          executor,
          hooks
        );

        completedSections.set(section.id, result);

        yield {
          type: result.success ? "step_complete" : "error",
          step: section.title,
          message: result.success
            ? `✓ ${section.title} completed`
            : `✗ ${section.title} failed: ${result.error}`,
        };

        if (!result.success) {
          yield {
            type: "warning",
            message: `Section ${section.title} failed, continuing with remaining sections`,
          };
        }
      }
    }

    yield {
      type: "step_complete",
      step: phase.name,
      message: `Phase completed`,
    };
  }

  // Final merge and polish phase
  yield {
    type: "thinking",
    message: "Applying final polish and ensuring consistency...",
  };

  const polishResult = await delegateToAgent(
    {
      agentType: "style-specialist",
      task: buildPolishTask(plan, completedSections),
      maxTokens: 2000,
    },
    executor,
    hooks
  );

  if (polishResult.success) {
    yield {
      type: "complete",
      summary: `Infographic "${plan.theme}" completed with ${plan.sections.length} sections`,
      metadata: {
        sections: Array.from(completedSections.keys()),
        colorPalette: plan.colorPalette,
      },
    };
  } else {
    yield {
      type: "complete",
      summary: `Infographic "${plan.theme}" completed (polish phase had issues)`,
      metadata: {
        warning: polishResult.error,
      },
    };
  }
}

// ============================================================================
// TASK BUILDERS
// ============================================================================

/**
 * Map infographic specialists to canvas agents
 */
function mapToCanvasAgent(
  agent: AgentType | InfographicSpecialist
): AgentType {
  const mapping: Record<InfographicSpecialist, AgentType> = {
    "chart-specialist": "diagram-specialist",
    "icon-specialist": "canvas-agent",
    "image-specialist": "canvas-agent",
    "typography-specialist": "style-specialist",
  };

  return (mapping as Record<string, AgentType>)[agent] || (agent as AgentType);
}

/**
 * Build task prompt for a section
 */
function buildSectionTask(
  section: InfographicSection,
  plan: InfographicPlan,
  completedSections: Map<string, SubAgentResult>
): string {
  const dependencies = section.dependsOn
    .map((id) => completedSections.get(id))
    .filter((r): r is SubAgentResult => r?.success === true);

  let task = `Create ${section.type} section: "${section.title}"\n`;
  task += `Description: ${section.description}\n`;
  task += `Position: Row ${section.row}, Height: ${section.heightUnits} units\n`;

  if (section.content.text?.length) {
    task += `Content: ${section.content.text.join(", ")}\n`;
  }

  if (dependencies.length > 0) {
    task += `\nContext from previous sections:\n`;
    dependencies.forEach((dep, i) => {
      task += `- ${i + 1}. ${dep.output?.slice(0, 200)}...\n`;
    });
  }

  task += `\nStyle guidelines:\n`;
  task += `- Primary color: ${plan.colorPalette.primary}\n`;
  task += `- Background: ${plan.colorPalette.background}\n`;
  task += `- Text: ${plan.colorPalette.text}\n`;

  return task;
}

/**
 * Build context for a section
 */
function buildSectionContext(
  section: InfographicSection,
  plan: InfographicPlan
): string {
  return `
Theme: ${plan.theme}
Canvas size: ${plan.dimensions.width}x${plan.dimensions.height}
Orientation: ${plan.dimensions.orientation}
Section type: ${section.type}
Complexity: ${section.complexity}
`.trim();
}

/**
 * Build task for final polish
 */
function buildPolishTask(
  plan: InfographicPlan,
  completedSections: Map<string, SubAgentResult>
): string {
  const completedIds = Array.from(completedSections.keys());

  return `
Apply final polish to the infographic:
1. Ensure consistent spacing between all ${completedIds.length} sections
2. Verify color palette consistency: ${JSON.stringify(plan.colorPalette)}
3. Add subtle dividers between sections if needed
4. Ensure text hierarchy is clear
5. Verify all elements are within canvas bounds (${plan.dimensions.width}x${plan.dimensions.height})
6. Apply any final visual refinements for a professional look
`.trim();
}

// ============================================================================
// CONVENIENCE API
// ============================================================================

/**
 * High-level API for generating infographics
 *
 * @example
 * ```typescript
 * for await (const event of generateInfographic(
 *   "Create an infographic about climate change with statistics, timeline, and comparison charts",
 *   "main-canvas",
 *   executor
 * )) {
 *   console.log(event.type, event.message);
 * }
 * ```
 */
export async function* generateInfographic(
  request: string,
  canvasId: string,
  executor: MCPExecutor,
  hooks?: HooksManager
): AsyncGenerator<AgentEvent> {
  // Step 1: Analyze and plan
  yield {
    type: "thinking",
    message: "Analyzing request and creating plan...",
  };

  const plan = analyzeInfographicRequest(request);

  // Step 2: For complex plans, emit for approval
  if (plan.requiresApproval) {
    yield {
      type: "plan",
      message: "Complex infographic detected - review plan:",
      steps: plan.sections.map((s) => `${s.row + 1}. ${s.title} (${s.type})`),
      metadata: { requiresApproval: true },
    };
    // In production, wait for user approval here
  }

  // Step 3: Execute the plan
  for await (const event of executeInfographicPlan(
    plan,
    canvasId,
    executor,
    hooks
  )) {
    yield event;
  }
}

