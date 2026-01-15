/**
 * Template Expansion Module
 *
 * Converts template definitions into concrete canvas elements.
 * Handles region → element breakdown with positioning.
 *
 * ## Expansion Process
 * 1. Parse template definition
 * 2. Calculate absolute positions from relative bounds
 * 3. Expand repeatable regions based on content
 * 4. Generate canvas_write operations
 *
 * @see ./definitions.ts
 */

import type {
  WhiteboardTemplate,
  TemplateRegion,
  TemplateElement,
} from "./definitions.js";
import { getTemplate, detectTemplateFromTask, PREDEFINED_TEMPLATES } from "./definitions.js";

// ============================================================================
// TYPES
// ============================================================================

/**
 * Expansion options
 */
export interface ExpansionOptions {
  /** Target canvas dimensions (default: use template base) */
  canvasDimensions?: { width: number; height: number };
  /** Offset position on canvas */
  offset?: { x: number; y: number };
  /** Content for placeholders */
  content?: ExpansionContent;
  /** Custom color scheme override */
  colorScheme?: Partial<WhiteboardTemplate["colorScheme"]>;
}

/**
 * Content to fill placeholders
 */
export interface ExpansionContent {
  /** Title for the main element */
  title?: string;
  /** Subtitle */
  subtitle?: string;
  /** Data for repeatable regions */
  items?: ExpansionItem[];
  /** Key-value content by region ID */
  regions?: Record<string, ExpansionRegionContent>;
}

/**
 * Content for a repeatable item
 */
export interface ExpansionItem {
  /** Label or title */
  title: string;
  /** Description or content */
  content?: string;
  /** Additional properties */
  properties?: Record<string, unknown>;
}

/**
 * Content for a specific region
 */
export interface ExpansionRegionContent {
  title?: string;
  content?: string;
  items?: ExpansionItem[];
}

/**
 * Expanded element ready for canvas_write
 */
export interface ExpandedElement {
  /** Generated element ID */
  id: string;
  /** Element type */
  type: string;
  /** Absolute position */
  x: number;
  y: number;
  /** Absolute size */
  width: number;
  height: number;
  /** Style properties */
  style: Record<string, unknown>;
  /** Text content (for text elements) */
  text?: string;
  /** Source region ID */
  regionId: string;
  /** Role in the layout */
  role: string;
}

/**
 * Region breakdown result
 */
export interface RegionBreakdown {
  /** Region information */
  region: {
    id: string;
    name: string;
    type: string;
  };
  /** Absolute bounds */
  bounds: { x: number; y: number; width: number; height: number };
  /** Elements in this region */
  elements: ExpandedElement[];
  /** Child regions (for repeated regions) */
  instances?: RegionBreakdown[];
}

/**
 * Full expansion result
 */
export interface ExpansionResult {
  /** Template used */
  template: {
    id: string;
    name: string;
    skill: string;
  };
  /** Canvas dimensions used */
  dimensions: { width: number; height: number };
  /** Region breakdown */
  regions: RegionBreakdown[];
  /** All expanded elements (flattened) */
  elements: ExpandedElement[];
  /** canvas_write operations to execute */
  writeOperations: WriteOperation[];
  /** Summary for AI response */
  summary: string;
}

/**
 * canvas_write operation
 */
export interface WriteOperation {
  type: "canvas_write";
  params: {
    tree: WriteNode;
    position?: { x: number; y: number };
  };
}

/**
 * Node for canvas_write tree
 */
export interface WriteNode {
  type: string;
  id?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  text?: string;
  backgroundColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  fontSize?: number;
  textAlign?: string;
  children?: WriteNode[];
}

// ============================================================================
// EXPANSION FUNCTIONS
// ============================================================================

let elementCounter = 0;

function generateElementId(prefix: string): string {
  return `${prefix}-${++elementCounter}-${Date.now().toString(36)}`;
}

/**
 * Expand a template into concrete elements
 *
 * @param templateIdOrTask - Template ID or task string to detect template
 * @param options - Expansion options
 * @returns Expansion result with elements and operations
 *
 * @example
 * ```typescript
 * // Using template ID
 * const result = expandTemplate("mindmap", {
 *   content: {
 *     title: "AI Technologies",
 *     items: [
 *       { title: "Machine Learning" },
 *       { title: "Natural Language Processing" },
 *       { title: "Computer Vision" },
 *     ]
 *   }
 * });
 *
 * // Using task detection
 * const result = expandTemplate("Create a mindmap about AI", {
 *   canvasDimensions: { width: 1600, height: 1000 }
 * });
 * ```
 */
export function expandTemplate(
  templateIdOrTask: string,
  options: ExpansionOptions = {}
): ExpansionResult {
  // Find template
  let template = getTemplate(templateIdOrTask);
  if (!template) {
    template = detectTemplateFromTask(templateIdOrTask);
  }
  if (!template) {
    // Default to mindmap if nothing detected
    template = PREDEFINED_TEMPLATES.mindmap;
  }

  // Calculate dimensions
  const dimensions = options.canvasDimensions || template.baseDimensions;
  const offset = options.offset || { x: 0, y: 0 };

  // Merge color schemes
  const colorScheme = {
    ...template.colorScheme,
    ...options.colorScheme,
  };

  // Expand each region
  const regionBreakdowns: RegionBreakdown[] = [];
  const allElements: ExpandedElement[] = [];

  for (const region of template.regions) {
    const breakdown = expandRegion(
      region,
      dimensions,
      offset,
      colorScheme,
      options.content
    );
    regionBreakdowns.push(breakdown);
    allElements.push(...breakdown.elements);

    // Include instance elements
    if (breakdown.instances) {
      for (const instance of breakdown.instances) {
        allElements.push(...instance.elements);
      }
    }
  }

  // Generate write operations
  const writeOperations = generateWriteOperations(allElements, template);

  // Generate summary
  const summary = generateExpansionSummary(template, regionBreakdowns, allElements);

  return {
    template: {
      id: template.id,
      name: template.name,
      skill: template.skill,
    },
    dimensions,
    regions: regionBreakdowns,
    elements: allElements,
    writeOperations,
    summary,
  };
}

/**
 * Expand a single region into elements
 */
export function expandRegion(
  region: TemplateRegion,
  canvasDimensions: { width: number; height: number },
  offset: { x: number; y: number },
  colorScheme: WhiteboardTemplate["colorScheme"],
  content?: ExpansionContent
): RegionBreakdown {
  // Calculate absolute bounds
  const bounds = {
    x: offset.x + region.relativeBounds.x * canvasDimensions.width,
    y: offset.y + region.relativeBounds.y * canvasDimensions.height,
    width: region.relativeBounds.width * canvasDimensions.width,
    height: region.relativeBounds.height * canvasDimensions.height,
  };

  // Get region-specific content
  const regionContent = content?.regions?.[region.id];

  // Expand elements
  const elements = expandElements(
    region.elements,
    bounds,
    region.id,
    colorScheme,
    regionContent || content
  );

  // Handle repeatable regions
  let instances: RegionBreakdown[] | undefined;
  if (region.repeatable && content?.items) {
    const itemCount = Math.min(
      content.items.length,
      region.repeatBounds?.max || 10
    );
    instances = [];

    for (let i = 0; i < itemCount; i++) {
      const item = content.items[i];
      const instanceOffset = calculateRepeatOffset(region, i, itemCount, canvasDimensions);

      const instanceBounds = {
        x: offset.x + instanceOffset.x,
        y: offset.y + instanceOffset.y,
        width: bounds.width,
        height: bounds.height,
      };

      const instanceElements = expandElements(
        region.elements,
        instanceBounds,
        `${region.id}-${i}`,
        colorScheme,
        { title: item.title, content: item.content }
      );

      instances.push({
        region: {
          id: `${region.id}-${i}`,
          name: `${region.name} ${i + 1}`,
          type: region.type,
        },
        bounds: instanceBounds,
        elements: instanceElements,
      });
    }
  }

  return {
    region: {
      id: region.id,
      name: region.name,
      type: region.type,
    },
    bounds,
    elements,
    instances,
  };
}

/**
 * Expand elements within a region
 */
function expandElements(
  elements: TemplateElement[],
  regionBounds: { x: number; y: number; width: number; height: number },
  regionId: string,
  colorScheme: WhiteboardTemplate["colorScheme"],
  content?: ExpansionContent | ExpansionRegionContent
): ExpandedElement[] {
  return elements.map((element) => {
    // Calculate absolute position
    const x = regionBounds.x + element.relativeX * regionBounds.width;
    const y = regionBounds.y + element.relativeY * regionBounds.height;
    const width = element.relativeWidth * regionBounds.width;
    const height = element.relativeHeight * regionBounds.height;

    // Resolve colors
    const style = resolveElementStyle(element, colorScheme);

    // Get text content
    let text: string | undefined;
    if (element.type === "text") {
      text = resolveTextContent(element, content);
    }

    return {
      id: generateElementId(element.type),
      type: element.type,
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(width),
      height: Math.round(height),
      style,
      text,
      regionId,
      role: element.role,
    };
  });
}

/**
 * Resolve element style with color scheme
 */
function resolveElementStyle(
  element: TemplateElement,
  colorScheme: WhiteboardTemplate["colorScheme"]
): Record<string, unknown> {
  const style: Record<string, unknown> = { ...element.style };

  // Map color scheme to style properties
  if (style.backgroundColor) {
    style.backgroundColor = resolveColor(
      style.backgroundColor as string,
      colorScheme
    );
  }
  if (style.strokeColor) {
    style.strokeColor = resolveColor(style.strokeColor as string, colorScheme);
  }

  return style;
}

/**
 * Resolve color from scheme or use as-is
 */
function resolveColor(
  color: string,
  colorScheme: WhiteboardTemplate["colorScheme"]
): string {
  const schemeMap: Record<string, keyof WhiteboardTemplate["colorScheme"]> = {
    $primary: "primary",
    $secondary: "secondary",
    $background: "background",
    $text: "text",
    $accent: "accent",
  };

  if (color.startsWith("$")) {
    const key = schemeMap[color];
    return key ? colorScheme[key] : color;
  }

  return color;
}

/**
 * Resolve text content from element placeholder or content
 */
function resolveTextContent(
  element: TemplateElement,
  content?: ExpansionContent | ExpansionRegionContent
): string {
  if (!content) {
    return element.placeholder || "";
  }

  // Check by role
  switch (element.role) {
    case "title":
      return (content as ExpansionContent).title || element.placeholder || "";
    case "subtitle":
      return (content as ExpansionContent).subtitle || element.placeholder || "";
    case "content":
      return (content as ExpansionRegionContent).content || element.placeholder || "";
    case "label":
      return (content as ExpansionContent).title || element.placeholder || "";
    default:
      return element.placeholder || "";
  }
}

/**
 * Calculate offset for repeated region instances
 */
function calculateRepeatOffset(
  region: TemplateRegion,
  index: number,
  total: number,
  dimensions: { width: number; height: number }
): { x: number; y: number } {
  const baseX = region.relativeBounds.x * dimensions.width;
  const baseY = region.relativeBounds.y * dimensions.height;
  const width = region.relativeBounds.width * dimensions.width;
  const height = region.relativeBounds.height * dimensions.height;

  // Different layouts based on region type
  switch (region.type) {
    case "column":
      // Horizontal arrangement
      return {
        x: baseX + index * (width + 16),
        y: baseY,
      };

    case "node":
      // Radial or grid arrangement
      if (total <= 4) {
        // Cardinal directions
        const angle = (index * 2 * Math.PI) / total - Math.PI / 2;
        const radius = Math.min(dimensions.width, dimensions.height) * 0.3;
        return {
          x: dimensions.width / 2 + Math.cos(angle) * radius - width / 2,
          y: dimensions.height / 2 + Math.sin(angle) * radius - height / 2,
        };
      } else {
        // Grid fallback
        const cols = Math.ceil(Math.sqrt(total));
        const row = Math.floor(index / cols);
        const col = index % cols;
        return {
          x: baseX + col * (width + 20),
          y: baseY + row * (height + 20),
        };
      }

    case "cell":
      // Vertical stack within column
      return {
        x: baseX,
        y: baseY + index * (height + 12),
      };

    default:
      // Vertical stack
      return {
        x: baseX,
        y: baseY + index * (height + 16),
      };
  }
}

/**
 * Generate canvas_write operations from elements
 */
function generateWriteOperations(
  elements: ExpandedElement[],
  template: WhiteboardTemplate
): WriteOperation[] {
  // Group elements by region for efficient writes
  const regionGroups = new Map<string, ExpandedElement[]>();
  for (const element of elements) {
    const regionId = element.regionId.split("-")[0]; // Base region ID
    if (!regionGroups.has(regionId)) {
      regionGroups.set(regionId, []);
    }
    regionGroups.get(regionId)!.push(element);
  }

  // Create a single write operation with nested structure
  const rootNode: WriteNode = {
    type: "frame",
    id: `${template.id}-root`,
    x: 0,
    y: 0,
    width: template.baseDimensions.width,
    height: template.baseDimensions.height,
    backgroundColor: template.colorScheme.background,
    children: [],
  };

  for (const element of elements) {
    rootNode.children!.push(elementToWriteNode(element));
  }

  return [
    {
      type: "canvas_write",
      params: {
        tree: rootNode,
        position: { x: 0, y: 0 },
      },
    },
  ];
}

/**
 * Convert expanded element to write node
 */
function elementToWriteNode(element: ExpandedElement): WriteNode {
  const node: WriteNode = {
    type: element.type,
    id: element.id,
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
  };

  // Add style properties
  if (element.style.backgroundColor) {
    node.backgroundColor = element.style.backgroundColor as string;
  }
  if (element.style.strokeColor) {
    node.strokeColor = element.style.strokeColor as string;
  }
  if (element.style.strokeWidth) {
    node.strokeWidth = element.style.strokeWidth as number;
  }
  if (element.style.fontSize) {
    node.fontSize = element.style.fontSize as number;
  }
  if (element.style.textAlign) {
    node.textAlign = element.style.textAlign as string;
  }

  // Add text content
  if (element.text) {
    node.text = element.text;
  }

  return node;
}

/**
 * Generate expansion summary for AI response
 */
function generateExpansionSummary(
  template: WhiteboardTemplate,
  regions: RegionBreakdown[],
  elements: ExpandedElement[]
): string {
  const regionCounts = regions.map((r) => {
    const instanceCount = r.instances?.length || 0;
    return instanceCount > 0
      ? `${r.region.name} (${instanceCount} instances)`
      : r.region.name;
  });

  return `Expanded ${template.name} template with ${regions.length} regions and ${elements.length} elements. Regions: ${regionCounts.join(", ")}.`;
}

// ============================================================================
// CUSTOM TEMPLATE CREATION
// ============================================================================

/**
 * Create a custom template from description
 */
export interface CustomTemplateInput {
  /** Template name */
  name: string;
  /** Skill to associate */
  skill: string;
  /** Layout type */
  layout: "grid" | "flow" | "radial" | "timeline" | "freeform";
  /** Number of main sections */
  sectionCount: number;
  /** Optional specific dimensions */
  dimensions?: { width: number; height: number };
}

/**
 * Generate a custom template based on input
 */
export function createCustomTemplate(input: CustomTemplateInput): WhiteboardTemplate {
  const dimensions = input.dimensions || { width: 1200, height: 800 };

  // Generate regions based on layout
  const regions = generateLayoutRegions(input.layout, input.sectionCount, dimensions);

  return {
    id: `custom-${Date.now()}`,
    name: input.name,
    description: `Custom ${input.layout} template with ${input.sectionCount} sections`,
    skill: input.skill as WhiteboardTemplate["skill"],
    baseDimensions: dimensions,
    colorScheme: {
      primary: "#3B82F6",
      secondary: "#8B5CF6",
      background: "#FFFFFF",
      text: "#1F2937",
      accent: "#10B981",
    },
    regions,
    layoutGuidelines: generateLayoutGuidelines(input.layout),
  };
}

/**
 * Generate regions based on layout type
 */
function generateLayoutRegions(
  layout: CustomTemplateInput["layout"],
  sectionCount: number,
  dimensions: { width: number; height: number }
): TemplateRegion[] {
  const regions: TemplateRegion[] = [];

  // Always add header
  regions.push({
    id: "header",
    name: "Header",
    type: "header",
    relativeBounds: { x: 0.02, y: 0.02, width: 0.96, height: 0.1 },
    elements: [
      {
        type: "text",
        role: "title",
        relativeX: 0,
        relativeY: 0.2,
        relativeWidth: 1,
        relativeHeight: 0.6,
        style: { fontSize: 28, textAlign: "center" },
        placeholder: "Title",
      },
    ],
  });

  // Generate content regions based on layout
  switch (layout) {
    case "grid": {
      const cols = Math.ceil(Math.sqrt(sectionCount));
      const rows = Math.ceil(sectionCount / cols);
      const cellWidth = 0.9 / cols;
      const cellHeight = 0.75 / rows;

      for (let i = 0; i < sectionCount; i++) {
        const row = Math.floor(i / cols);
        const col = i % cols;
        regions.push({
          id: `section-${i}`,
          name: `Section ${i + 1}`,
          type: "cell",
          relativeBounds: {
            x: 0.05 + col * cellWidth,
            y: 0.15 + row * cellHeight,
            width: cellWidth * 0.95,
            height: cellHeight * 0.95,
          },
          elements: [
            {
              type: "rectangle",
              role: "container",
              relativeX: 0,
              relativeY: 0,
              relativeWidth: 1,
              relativeHeight: 1,
              style: { backgroundColor: "#F3F4F6", strokeWidth: 1, strokeColor: "#D1D5DB" },
            },
            {
              type: "text",
              role: "title",
              relativeX: 0.05,
              relativeY: 0.1,
              relativeWidth: 0.9,
              relativeHeight: 0.25,
              style: { fontSize: 16, textAlign: "left" },
              placeholder: `Section ${i + 1}`,
            },
          ],
        });
      }
      break;
    }

    case "flow": {
      const stepHeight = 0.7 / sectionCount;
      for (let i = 0; i < sectionCount; i++) {
        regions.push({
          id: `step-${i}`,
          name: `Step ${i + 1}`,
          type: "node",
          relativeBounds: {
            x: 0.35,
            y: 0.15 + i * stepHeight,
            width: 0.3,
            height: stepHeight * 0.8,
          },
          elements: [
            {
              type: "rectangle",
              role: "container",
              relativeX: 0,
              relativeY: 0,
              relativeWidth: 1,
              relativeHeight: 1,
              style: { backgroundColor: "#3B82F6", strokeWidth: 0 },
            },
            {
              type: "text",
              role: "content",
              relativeX: 0.1,
              relativeY: 0.3,
              relativeWidth: 0.8,
              relativeHeight: 0.4,
              style: { fontSize: 14, textAlign: "center" },
              placeholder: `Step ${i + 1}`,
            },
          ],
        });
      }
      break;
    }

    case "radial": {
      // Center node
      regions.push({
        id: "center",
        name: "Center",
        type: "node",
        relativeBounds: { x: 0.4, y: 0.4, width: 0.2, height: 0.2 },
        elements: [
          {
            type: "ellipse",
            role: "container",
            relativeX: 0,
            relativeY: 0,
            relativeWidth: 1,
            relativeHeight: 1,
            style: { backgroundColor: "#3B82F6", strokeWidth: 0 },
          },
          {
            type: "text",
            role: "title",
            relativeX: 0.1,
            relativeY: 0.35,
            relativeWidth: 0.8,
            relativeHeight: 0.3,
            style: { fontSize: 18, textAlign: "center" },
            placeholder: "Center",
          },
        ],
      });

      // Radial nodes
      for (let i = 0; i < sectionCount; i++) {
        const angle = (i * 2 * Math.PI) / sectionCount - Math.PI / 2;
        const x = 0.5 + Math.cos(angle) * 0.35 - 0.08;
        const y = 0.5 + Math.sin(angle) * 0.35 - 0.06;
        regions.push({
          id: `branch-${i}`,
          name: `Branch ${i + 1}`,
          type: "node",
          relativeBounds: { x, y, width: 0.16, height: 0.12 },
          elements: [
            {
              type: "rectangle",
              role: "container",
              relativeX: 0,
              relativeY: 0,
              relativeWidth: 1,
              relativeHeight: 1,
              style: { backgroundColor: "#8B5CF6", strokeWidth: 0 },
            },
            {
              type: "text",
              role: "label",
              relativeX: 0.1,
              relativeY: 0.3,
              relativeWidth: 0.8,
              relativeHeight: 0.4,
              style: { fontSize: 14, textAlign: "center" },
              placeholder: `Branch ${i + 1}`,
            },
          ],
        });
      }
      break;
    }

    case "timeline": {
      // Baseline
      regions.push({
        id: "baseline",
        name: "Baseline",
        type: "row",
        relativeBounds: { x: 0.05, y: 0.48, width: 0.9, height: 0.04 },
        elements: [
          {
            type: "rectangle",
            role: "decoration",
            relativeX: 0,
            relativeY: 0.4,
            relativeWidth: 1,
            relativeHeight: 0.2,
            style: { backgroundColor: "#CBD5E1", strokeWidth: 0 },
          },
        ],
      });

      // Events
      const eventWidth = 0.85 / sectionCount;
      for (let i = 0; i < sectionCount; i++) {
        const isAbove = i % 2 === 0;
        regions.push({
          id: `event-${i}`,
          name: `Event ${i + 1}`,
          type: "node",
          relativeBounds: {
            x: 0.075 + i * eventWidth,
            y: isAbove ? 0.2 : 0.55,
            width: eventWidth * 0.9,
            height: 0.25,
          },
          elements: [
            {
              type: "ellipse",
              role: "decoration",
              relativeX: 0.4,
              relativeY: isAbove ? 0.9 : -0.1,
              relativeWidth: 0.2,
              relativeHeight: 0.2,
              style: { backgroundColor: "#3B82F6", strokeWidth: 0 },
            },
            {
              type: "text",
              role: "label",
              relativeX: 0.1,
              relativeY: isAbove ? 0.1 : 0.6,
              relativeWidth: 0.8,
              relativeHeight: 0.25,
              style: { fontSize: 12, textAlign: "center" },
              placeholder: `${2020 + i}`,
            },
            {
              type: "text",
              role: "title",
              relativeX: 0.1,
              relativeY: isAbove ? 0.4 : 0.2,
              relativeWidth: 0.8,
              relativeHeight: 0.25,
              style: { fontSize: 14, textAlign: "center" },
              placeholder: `Event ${i + 1}`,
            },
          ],
        });
      }
      break;
    }

    case "freeform":
    default: {
      // Simple scattered regions
      for (let i = 0; i < sectionCount; i++) {
        regions.push({
          id: `item-${i}`,
          name: `Item ${i + 1}`,
          type: "cell",
          relativeBounds: {
            x: 0.1 + (i % 3) * 0.3,
            y: 0.2 + Math.floor(i / 3) * 0.35,
            width: 0.25,
            height: 0.3,
          },
          elements: [
            {
              type: "rectangle",
              role: "container",
              relativeX: 0,
              relativeY: 0,
              relativeWidth: 1,
              relativeHeight: 1,
              style: { backgroundColor: "#F3F4F6", strokeWidth: 1, strokeColor: "#D1D5DB" },
            },
            {
              type: "text",
              role: "title",
              relativeX: 0.1,
              relativeY: 0.1,
              relativeWidth: 0.8,
              relativeHeight: 0.3,
              style: { fontSize: 16, textAlign: "center" },
              placeholder: `Item ${i + 1}`,
            },
          ],
        });
      }
      break;
    }
  }

  return regions;
}

/**
 * Generate layout guidelines for custom templates
 */
function generateLayoutGuidelines(layout: CustomTemplateInput["layout"]): string {
  const guidelines: Record<string, string> = {
    grid: `
## Grid Layout Guidelines
- Equal cell sizes
- Consistent gaps (16-24px)
- Align content within cells
- Use frames for grouping`,

    flow: `
## Flow Layout Guidelines
- Top-to-bottom flow
- 60px vertical spacing
- Arrows between steps
- Decision points use diamonds`,

    radial: `
## Radial Layout Guidelines
- Center node at canvas center
- Equal angle distribution
- Curved connectors
- Size hierarchy (center largest)`,

    timeline: `
## Timeline Layout Guidelines
- Horizontal baseline
- Alternating above/below
- Clear date markers
- Proportional spacing`,

    freeform: `
## Freeform Layout Guidelines
- Organic placement
- Group related items
- Maintain whitespace
- Use visual proximity`,
  };

  return guidelines[layout] || guidelines.freeform;
}
