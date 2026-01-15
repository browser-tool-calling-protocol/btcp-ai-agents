/**
 * Validation Scenarios for Designer Workflow
 *
 * Demonstrates:
 * 1. Designer explores topic and generates whiteboard description
 * 2. Template selection (predefined or custom)
 * 3. Region → Element breakdown
 * 4. canvas_write operation generation
 *
 * @see ./definitions.ts - Template definitions
 * @see ./expansion.ts - Template expansion
 */

import type { DomainSkill } from "../core/delegation.js";
import {
  expandTemplate,
  createCustomTemplate,
  detectTemplateFromTask,
  type ExpansionResult,
  type CustomTemplateInput,
} from "./index.js";

// ============================================================================
// SCENARIO TYPES
// ============================================================================

/**
 * Scenario definition for validation
 */
export interface ValidationScenario {
  /** Scenario name */
  name: string;
  /** User request/task */
  task: string;
  /** Expected template to be detected */
  expectedTemplate: string;
  /** Expected skill to be loaded */
  expectedSkill: DomainSkill;
  /** Content for expansion */
  content: {
    title: string;
    items: Array<{ title: string; content?: string }>;
  };
  /** Validation checks */
  checks: ScenarioCheck[];
}

/**
 * Validation check
 */
export interface ScenarioCheck {
  /** Check description */
  description: string;
  /** Check function */
  validate: (result: ExpansionResult) => boolean;
}

/**
 * Scenario execution result
 */
export interface ScenarioResult {
  scenario: ValidationScenario;
  expansion: ExpansionResult;
  passed: boolean;
  checkResults: Array<{
    check: ScenarioCheck;
    passed: boolean;
  }>;
  duration: number;
}

// ============================================================================
// PREDEFINED SCENARIOS
// ============================================================================

/**
 * Scenario 1: Mindmap creation
 *
 * User asks to create a mindmap about AI technologies.
 * Designer should:
 * 1. Detect mindmap template
 * 2. Load mindmap skill
 * 3. Create central topic + branches
 */
export const MINDMAP_SCENARIO: ValidationScenario = {
  name: "Mindmap: AI Technologies",
  task: "Create a mindmap about artificial intelligence with branches for ML, NLP, and Computer Vision",
  expectedTemplate: "mindmap",
  expectedSkill: "mindmap",
  content: {
    title: "Artificial Intelligence",
    items: [
      { title: "Machine Learning", content: "Supervised, Unsupervised, Reinforcement" },
      { title: "Natural Language Processing", content: "Text analysis, Translation, Generation" },
      { title: "Computer Vision", content: "Object detection, Image recognition, Video" },
    ],
  },
  checks: [
    {
      description: "Should detect mindmap template",
      validate: (result) => result.template.id === "mindmap",
    },
    {
      description: "Should have center region",
      validate: (result) => result.regions.some((r) => r.region.id === "center"),
    },
    {
      description: "Should have branch regions",
      validate: (result) => result.regions.some((r) => r.region.id.includes("branch")),
    },
    {
      description: "Should generate 10+ elements",
      validate: (result) => result.elements.length >= 10,
    },
    {
      description: "Should have write operations",
      validate: (result) => result.writeOperations.length > 0,
    },
  ],
};

/**
 * Scenario 2: Flowchart creation
 *
 * User asks to create a user login flowchart.
 * Designer should:
 * 1. Detect flowchart/diagram template
 * 2. Load diagram skill
 * 3. Create start → process → decision → end flow
 */
export const FLOWCHART_SCENARIO: ValidationScenario = {
  name: "Flowchart: User Login Process",
  task: "Create a flowchart showing the user login process with validation and error handling",
  expectedTemplate: "flowchart",
  expectedSkill: "diagram",
  content: {
    title: "User Login Flow",
    items: [
      { title: "Enter Credentials", content: "Username and password input" },
      { title: "Validate Input", content: "Check format and required fields" },
      { title: "Authenticate", content: "Verify against database" },
      { title: "Handle Error", content: "Show error message" },
      { title: "Redirect to Dashboard", content: "Successful login" },
    ],
  },
  checks: [
    {
      description: "Should detect flowchart template",
      validate: (result) => result.template.id === "flowchart",
    },
    {
      description: "Should have start region",
      validate: (result) => result.regions.some((r) => r.region.id === "start"),
    },
    {
      description: "Should have end region",
      validate: (result) => result.regions.some((r) => r.region.id === "end"),
    },
    {
      description: "Should have process nodes",
      validate: (result) => result.regions.some((r) => r.region.id === "process"),
    },
    {
      description: "Should have decision nodes",
      validate: (result) => result.regions.some((r) => r.region.id === "decision"),
    },
  ],
};

/**
 * Scenario 3: Kanban board creation
 *
 * User asks to create a sprint board.
 * Designer should:
 * 1. Detect kanban template
 * 2. Load kanban skill
 * 3. Create columns with cards
 */
export const KANBAN_SCENARIO: ValidationScenario = {
  name: "Kanban: Sprint Board",
  task: "Create a kanban board for sprint planning with Backlog, In Progress, Review, and Done columns",
  expectedTemplate: "kanban",
  expectedSkill: "kanban",
  content: {
    title: "Sprint 42 Board",
    items: [
      { title: "Backlog", content: "3 tasks" },
      { title: "In Progress", content: "2 tasks" },
      { title: "Review", content: "1 task" },
      { title: "Done", content: "5 tasks" },
    ],
  },
  checks: [
    {
      description: "Should detect kanban template",
      validate: (result) => result.template.id === "kanban",
    },
    {
      description: "Should have column regions",
      validate: (result) => result.regions.some((r) => r.region.type === "column"),
    },
    {
      description: "Should have card regions",
      validate: (result) => result.regions.some((r) => r.region.type === "cell"),
    },
    {
      description: "Should have header",
      validate: (result) => result.regions.some((r) => r.region.id === "board-header"),
    },
  ],
};

/**
 * Scenario 4: Timeline creation
 *
 * User asks to create a project roadmap.
 * Designer should:
 * 1. Detect timeline template
 * 2. Load timeline skill
 * 3. Create milestones along baseline
 */
export const TIMELINE_SCENARIO: ValidationScenario = {
  name: "Timeline: Product Roadmap",
  task: "Create a timeline showing the product roadmap for 2024 with quarterly milestones",
  expectedTemplate: "timeline",
  expectedSkill: "timeline",
  content: {
    title: "2024 Product Roadmap",
    items: [
      { title: "Q1 Launch", content: "Initial release" },
      { title: "Q2 Expansion", content: "New markets" },
      { title: "Q3 Enterprise", content: "B2B features" },
      { title: "Q4 Scale", content: "Performance improvements" },
    ],
  },
  checks: [
    {
      description: "Should detect timeline template",
      validate: (result) => result.template.id === "timeline",
    },
    {
      description: "Should have baseline",
      validate: (result) => result.regions.some((r) => r.region.id === "baseline"),
    },
    {
      description: "Should have milestone nodes",
      validate: (result) => result.regions.some((r) => r.region.id === "milestone"),
    },
    {
      description: "Should have title region",
      validate: (result) => result.regions.some((r) => r.region.id === "title"),
    },
  ],
};

/**
 * Scenario 5: Custom template creation
 *
 * User wants a custom layout.
 * Designer should:
 * 1. Create custom template based on requirements
 * 2. Generate appropriate regions
 * 3. Expand to elements
 */
export const CUSTOM_TEMPLATE_SCENARIO: ValidationScenario = {
  name: "Custom: SWOT Analysis",
  task: "Create a SWOT analysis grid with 4 quadrants for Strengths, Weaknesses, Opportunities, Threats",
  expectedTemplate: "custom",
  expectedSkill: "diagram",
  content: {
    title: "Company SWOT Analysis",
    items: [
      { title: "Strengths", content: "Strong brand, skilled team" },
      { title: "Weaknesses", content: "Limited resources" },
      { title: "Opportunities", content: "Growing market" },
      { title: "Threats", content: "Competition" },
    ],
  },
  checks: [
    {
      description: "Should create custom template",
      validate: (result) => result.template.id.startsWith("custom"),
    },
    {
      description: "Should have 4 section regions",
      validate: (result) => {
        const sections = result.regions.filter((r) =>
          r.region.id.startsWith("section")
        );
        return sections.length === 4;
      },
    },
    {
      description: "Should have header",
      validate: (result) => result.regions.some((r) => r.region.id === "header"),
    },
    {
      description: "Should generate elements",
      validate: (result) => result.elements.length > 0,
    },
  ],
};

/**
 * All validation scenarios
 */
export const VALIDATION_SCENARIOS: ValidationScenario[] = [
  MINDMAP_SCENARIO,
  FLOWCHART_SCENARIO,
  KANBAN_SCENARIO,
  TIMELINE_SCENARIO,
  CUSTOM_TEMPLATE_SCENARIO,
];

// ============================================================================
// SCENARIO EXECUTION
// ============================================================================

/**
 * Execute a single scenario
 */
export function executeScenario(scenario: ValidationScenario): ScenarioResult {
  const startTime = Date.now();

  // Determine if custom template needed
  let expansion: ExpansionResult;

  if (scenario.expectedTemplate === "custom") {
    // Create custom template
    const customInput: CustomTemplateInput = {
      name: scenario.content.title,
      skill: scenario.expectedSkill,
      layout: "grid",
      sectionCount: scenario.content.items.length,
    };
    const customTemplate = createCustomTemplate(customInput);
    expansion = expandTemplate(customTemplate.id, {
      content: {
        title: scenario.content.title,
        items: scenario.content.items,
      },
    });
    // Override template info for custom
    expansion.template = {
      id: customTemplate.id,
      name: customTemplate.name,
      skill: customTemplate.skill,
    };
  } else {
    // Use predefined template
    expansion = expandTemplate(scenario.task, {
      content: {
        title: scenario.content.title,
        items: scenario.content.items,
      },
    });
  }

  // Run checks
  const checkResults = scenario.checks.map((check) => ({
    check,
    passed: check.validate(expansion),
  }));

  const passed = checkResults.every((r) => r.passed);

  return {
    scenario,
    expansion,
    passed,
    checkResults,
    duration: Date.now() - startTime,
  };
}

/**
 * Execute all scenarios
 */
export function executeAllScenarios(): ScenarioResult[] {
  return VALIDATION_SCENARIOS.map(executeScenario);
}

/**
 * Generate scenario report
 */
export function generateScenarioReport(results: ScenarioResult[]): string {
  const lines: string[] = [
    "# Template Validation Scenarios Report",
    "",
    `Executed: ${new Date().toISOString()}`,
    "",
    "## Summary",
    "",
    `- Total scenarios: ${results.length}`,
    `- Passed: ${results.filter((r) => r.passed).length}`,
    `- Failed: ${results.filter((r) => !r.passed).length}`,
    "",
    "## Scenario Results",
    "",
  ];

  for (const result of results) {
    const status = result.passed ? "✅ PASSED" : "❌ FAILED";
    lines.push(`### ${result.scenario.name}`);
    lines.push("");
    lines.push(`**Status:** ${status}`);
    lines.push(`**Task:** "${result.scenario.task}"`);
    lines.push(`**Duration:** ${result.duration}ms`);
    lines.push("");
    lines.push(`**Expansion:**`);
    lines.push(`- Template: ${result.expansion.template.name} (${result.expansion.template.id})`);
    lines.push(`- Regions: ${result.expansion.regions.length}`);
    lines.push(`- Elements: ${result.expansion.elements.length}`);
    lines.push(`- Write Operations: ${result.expansion.writeOperations.length}`);
    lines.push("");
    lines.push("**Checks:**");
    for (const checkResult of result.checkResults) {
      const checkStatus = checkResult.passed ? "✓" : "✗";
      lines.push(`- ${checkStatus} ${checkResult.check.description}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ============================================================================
// DESIGNER WORKFLOW DEMONSTRATION
// ============================================================================

/**
 * Demonstrates the complete designer workflow
 *
 * 1. Explore topic - understand what the user wants
 * 2. Select template - predefined or custom
 * 3. Break down into regions
 * 4. Expand regions to elements
 * 5. Generate canvas_write operations
 */
export interface DesignerWorkflowStep {
  step: number;
  name: string;
  description: string;
  input: unknown;
  output: unknown;
}

/**
 * Run designer workflow demonstration
 */
export function demonstrateDesignerWorkflow(task: string): {
  steps: DesignerWorkflowStep[];
  finalResult: ExpansionResult;
} {
  const steps: DesignerWorkflowStep[] = [];

  // Step 1: Explore topic
  const topicExploration = exploreTopicForDesign(task);
  steps.push({
    step: 1,
    name: "Explore Topic",
    description: "Analyze user request to understand requirements",
    input: task,
    output: topicExploration,
  });

  // Step 2: Select template
  const templateSelection = selectTemplateForTask(task, topicExploration);
  steps.push({
    step: 2,
    name: "Select Template",
    description: "Choose predefined template or create custom",
    input: topicExploration,
    output: templateSelection,
  });

  // Step 3: Prepare content
  const contentPreparation = prepareContent(topicExploration);
  steps.push({
    step: 3,
    name: "Prepare Content",
    description: "Structure content for template expansion",
    input: topicExploration,
    output: contentPreparation,
  });

  // Step 4: Expand template
  const expansion = expandTemplate(templateSelection.templateId, {
    content: contentPreparation,
  });
  steps.push({
    step: 4,
    name: "Expand Template",
    description: "Convert template regions to concrete elements",
    input: { template: templateSelection.templateId, content: contentPreparation },
    output: {
      regions: expansion.regions.map((r) => r.region),
      elementCount: expansion.elements.length,
    },
  });

  // Step 5: Generate operations
  steps.push({
    step: 5,
    name: "Generate Operations",
    description: "Create canvas_write operations for execution",
    input: expansion.elements.length,
    output: {
      operationCount: expansion.writeOperations.length,
      summary: expansion.summary,
    },
  });

  return { steps, finalResult: expansion };
}

/**
 * Step 1: Explore topic for design
 */
function exploreTopicForDesign(task: string): {
  topic: string;
  suggestedType: string;
  keyElements: string[];
  complexity: "simple" | "moderate" | "complex";
} {
  const lower = task.toLowerCase();

  // Extract topic
  const topicMatch = task.match(/(?:about|for|showing|of)\s+(.+?)(?:\s+with|\s*$)/i);
  const topic = topicMatch ? topicMatch[1] : task.split(" ").slice(2).join(" ");

  // Detect type
  let suggestedType = "freeform";
  if (/mind\s?map|brainstorm/.test(lower)) suggestedType = "mindmap";
  else if (/flowchart|flow|process/.test(lower)) suggestedType = "flowchart";
  else if (/kanban|board|tasks/.test(lower)) suggestedType = "kanban";
  else if (/timeline|roadmap|schedule/.test(lower)) suggestedType = "timeline";
  else if (/infographic|data|statistics/.test(lower)) suggestedType = "infographic";
  else if (/storyboard|scenes|narrative/.test(lower)) suggestedType = "storyboard";

  // Extract key elements
  const keyElements: string[] = [];
  const withMatch = task.match(/with\s+(.+)$/i);
  if (withMatch) {
    const parts = withMatch[1].split(/,|and/);
    keyElements.push(...parts.map((p) => p.trim()).filter(Boolean));
  }

  // Assess complexity
  const complexity =
    keyElements.length > 5 ? "complex" : keyElements.length > 2 ? "moderate" : "simple";

  return { topic, suggestedType, keyElements, complexity };
}

/**
 * Step 2: Select template for task
 */
function selectTemplateForTask(
  task: string,
  exploration: ReturnType<typeof exploreTopicForDesign>
): {
  templateId: string;
  isCustom: boolean;
  reason: string;
} {
  const detected = detectTemplateFromTask(task);

  if (detected) {
    return {
      templateId: detected.id,
      isCustom: false,
      reason: `Detected ${detected.name} template from task keywords`,
    };
  }

  // Create custom if no match
  const customInput: CustomTemplateInput = {
    name: exploration.topic,
    skill: "diagram",
    layout:
      exploration.suggestedType === "mindmap"
        ? "radial"
        : exploration.suggestedType === "flowchart"
        ? "flow"
        : exploration.suggestedType === "timeline"
        ? "timeline"
        : "grid",
    sectionCount: Math.max(exploration.keyElements.length, 4),
  };

  const custom = createCustomTemplate(customInput);

  return {
    templateId: custom.id,
    isCustom: true,
    reason: `Created custom ${customInput.layout} template for "${exploration.topic}"`,
  };
}

/**
 * Step 3: Prepare content for expansion
 */
function prepareContent(
  exploration: ReturnType<typeof exploreTopicForDesign>
): {
  title: string;
  items: Array<{ title: string; content?: string }>;
} {
  return {
    title: exploration.topic,
    items: exploration.keyElements.map((element) => ({
      title: element,
      content: `Details about ${element}`,
    })),
  };
}

// ============================================================================
// TEST EXECUTION
// ============================================================================

/**
 * Run all validation scenarios and return results
 */
export function runValidationTests(): {
  passed: boolean;
  results: ScenarioResult[];
  report: string;
} {
  const results = executeAllScenarios();
  const passed = results.every((r) => r.passed);
  const report = generateScenarioReport(results);

  return { passed, results, report };
}

/**
 * Quick check to verify templates work
 */
export function quickTemplateCheck(): boolean {
  try {
    // Test each predefined template
    const templates = ["mindmap", "flowchart", "kanban", "timeline", "infographic", "storyboard"];

    for (const templateId of templates) {
      const result = expandTemplate(templateId, {
        content: {
          title: "Test",
          items: [
            { title: "Item 1" },
            { title: "Item 2" },
            { title: "Item 3" },
          ],
        },
      });

      if (!result.elements || result.elements.length === 0) {
        console.error(`Template ${templateId} produced no elements`);
        return false;
      }

      if (!result.writeOperations || result.writeOperations.length === 0) {
        console.error(`Template ${templateId} produced no write operations`);
        return false;
      }
    }

    return true;
  } catch (error) {
    console.error("Template check failed:", error);
    return false;
  }
}
