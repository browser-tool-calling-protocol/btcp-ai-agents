/**
 * Mode Detection
 *
 * Auto-detect agent mode from user task description.
 */

import type { AgentMode } from "./types.js";

/**
 * Mode detection patterns
 */
const MODE_PATTERNS: Record<AgentMode, RegExp[]> = {
  diagram: [
    /flowchart/i,
    /architecture\s*(diagram)?/i,
    /diagram/i,
    /process\s*flow/i,
    /org\s*chart/i,
    /sequence\s*(diagram)?/i,
    /mind\s*map/i,
    /kanban/i,
    /system\s*design/i,
    /data\s*flow/i,
    /entity\s*relationship/i,
    /ER\s*diagram/i,
    /class\s*diagram/i,
    /state\s*machine/i,
  ],
  "ui-mockup": [
    /wireframe/i,
    /mockup/i,
    /\bui\b/i,
    /\bux\b/i,
    /interface/i,
    /screen/i,
    /app\s*design/i,
    /mobile\s*app/i,
    /dashboard/i,
    /website/i,
    /landing\s*page/i,
    /login\s*(page|screen|form)/i,
    /signup/i,
    /navigation/i,
    /menu/i,
    /form/i,
    /button/i,
    /card\s*layout/i,
  ],
  moodboard: [
    /moodboard/i,
    /mood\s*board/i,
    /inspiration/i,
    /color\s*palette/i,
    /brand/i,
    /style\s*guide/i,
    /visual\s*theme/i,
    /aesthetic/i,
    /color\s*scheme/i,
    /design\s*system/i,
    /visual\s*identity/i,
  ],
  storyboard: [
    /storyboard/i,
    /story\s*board/i,
    /timeline/i,
    /sequence/i,
    /journey/i,
    /user\s*flow/i,
    /steps/i,
    /scenes/i,
    /narrative/i,
    /comic/i,
    /animation\s*frames/i,
    /keyframes/i,
  ],
  analysis: [
    /analyze/i,
    /analysis/i,
    /examine/i,
    /review/i,
    /assess/i,
    /evaluate/i,
    /audit/i,
    /check\s*(the\s*)?(canvas|layout|design)/i,
    /what.*(on|in)\s*(the\s*)?canvas/i,
    /describe\s*(the\s*)?(layout|canvas|design)/i,
    /how\s*many/i,
    /list\s*all/i,
  ],
  generation: [
    /create/i,
    /generate/i,
    /make/i,
    /draw/i,
    /build/i,
    /design/i,
    /add/i,
    /new/i,
  ],
  creative: [
    /beautify/i,
    /improve/i,
    /enhance/i,
    /polish/i,
    /refine/i,
    /make\s*(it\s*)?(look\s*)?(better|nicer|prettier)/i,
  ],
  layout: [
    /layout/i,
    /arrange/i,
    /align/i,
    /position/i,
    /distribute/i,
    /grid/i,
    /spacing/i,
  ],
  styling: [
    /style/i,
    /color/i,
    /theme/i,
    /font/i,
    /typography/i,
    /background/i,
    /border/i,
  ],
  editing: [
    /edit/i,
    /modify/i,
    /change/i,
    /update/i,
    /move/i,
    /resize/i,
    /delete/i,
    /remove/i,
  ],
  general: [], // Fallback, no patterns
};

/**
 * Mode priority order for detection
 * Higher priority modes are checked first
 */
const MODE_PRIORITY: AgentMode[] = [
  "diagram",
  "ui-mockup",
  "moodboard",
  "storyboard",
  "analysis",
  "layout",
  "styling",
  "editing",
  "creative",
  "generation",
  "general",
];

/**
 * Detect agent mode from task description
 *
 * @example
 * ```typescript
 * detectAgentMode("Create a flowchart for login process")
 * // Returns: "diagram"
 *
 * detectAgentMode("Design a mobile app login screen")
 * // Returns: "ui-mockup"
 *
 * detectAgentMode("What elements are on the canvas?")
 * // Returns: "analysis"
 * ```
 */
export function detectAgentMode(task: string): AgentMode {
  // Check modes in priority order
  for (const mode of MODE_PRIORITY) {
    const patterns = MODE_PATTERNS[mode];

    for (const pattern of patterns) {
      if (pattern.test(task)) {
        return mode;
      }
    }
  }

  // Default to general
  return "general";
}

/**
 * Get confidence score for a mode detection
 *
 * @returns Score from 0 to 1 indicating confidence
 */
export function getModeConfidence(task: string, mode: AgentMode): number {
  const patterns = MODE_PATTERNS[mode];

  if (patterns.length === 0) {
    return 0;
  }

  let matches = 0;
  for (const pattern of patterns) {
    if (pattern.test(task)) {
      matches++;
    }
  }

  return matches / patterns.length;
}

/**
 * Get all possible modes with confidence scores
 */
export function detectAllModes(
  task: string
): Array<{ mode: AgentMode; confidence: number }> {
  const results: Array<{ mode: AgentMode; confidence: number }> = [];

  for (const mode of MODE_PRIORITY) {
    const confidence = getModeConfidence(task, mode);
    if (confidence > 0) {
      results.push({ mode, confidence });
    }
  }

  // Sort by confidence descending
  results.sort((a, b) => b.confidence - a.confidence);

  // If no matches, return general
  if (results.length === 0) {
    return [{ mode: "general", confidence: 0.5 }];
  }

  return results;
}

/**
 * Mode descriptions for display
 */
export const MODE_DESCRIPTIONS: Record<AgentMode, string> = {
  diagram: "Flowcharts, architecture diagrams, process flows",
  "ui-mockup": "Wireframes, app screens, interfaces",
  moodboard: "Visual inspiration, color palettes, style guides",
  storyboard: "Sequential narratives, timelines, user journeys",
  analysis: "Canvas analysis and insights",
  generation: "General content creation",
  creative: "Design improvements and styling",
  layout: "Element arrangement, alignment, and positioning",
  styling: "Colors, fonts, and visual styling",
  editing: "Modifying, moving, and deleting elements",
  general: "General canvas operations",
};
