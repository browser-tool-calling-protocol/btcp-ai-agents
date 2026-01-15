/**
 * Templates Module
 *
 * Generic template system for agent workflows.
 * Templates can be registered via the skill registry.
 *
 * This module provides the expansion utilities for templates.
 */

// Template expansion types and utilities
export type {
  ExpansionOptions,
  ExpansionContent,
  ExpansionItem,
  ExpansionRegionContent,
  ExpandedElement,
  RegionBreakdown,
  ExpansionResult,
  WriteOperation,
  WriteNode,
  CustomTemplateInput,
} from "./expansion.js";

export {
  expandTemplate,
  expandRegion,
  createCustomTemplate,
} from "./expansion.js";

// Note: Domain-specific templates should be registered via the skill registry
// The predefined canvas templates have been removed - use the skill system instead
