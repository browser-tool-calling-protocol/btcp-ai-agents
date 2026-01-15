# AI Agent Query Design Proposal

> **Status**: Draft
> **Author**: Claude
> **Date**: 2026-01-04
> **Packages**: `@waiboard/canvas-driver`, `@waiboard/canvas-core`, `@waiboard/ai-agents`

## Executive Summary

This document proposes an optimized query architecture for AI agents interacting with the canvas system. The design focuses on:

1. **Reducing round-trips** - Single-query compound operations
2. **Minimizing token usage** - Adaptive projection and streaming
3. **Semantic understanding** - Role-based and relationship queries
4. **Leveraging ECS performance** - O(log n) spatial queries, query caching

## Table of Contents

1. [Current State Analysis](#current-state-analysis)
2. [Pain Points](#pain-points)
3. [Proposed Architecture](#proposed-architecture)
4. [Query API Design](#query-api-design)
5. [Semantic Query Layer](#semantic-query-layer)
6. [Performance Optimizations](#performance-optimizations)
7. [Implementation Plan](#implementation-plan)
8. [Migration Strategy](#migration-strategy)

---

## Current State Analysis

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        AI Agent Layer                           │
│   Canvas Agent · Vision Agent · Layout Agent · Design Agent    │
└─────────────────────────────────┬───────────────────────────────┘
                                  │
┌─────────────────────────────────▼───────────────────────────────┐
│                      Canvas MCP Server                          │
│   canvas_read · canvas_edit · canvas_write · canvas_find       │
└─────────────────────────────────┬───────────────────────────────┘
                                  │
┌─────────────────────────────────▼───────────────────────────────┐
│                       Canvas Driver                             │
│   V3 API (4 ops) · V2 API (query/patch/execute) · Simulator    │
└─────────────────────────────────┬───────────────────────────────┘
                                  │
┌─────────────────────────────────▼───────────────────────────────┐
│                       Canvas Core (ECS)                         │
│   World · Spatial Index · Query Cache · EntityRecord           │
└─────────────────────────────────────────────────────────────────┘
```

### Current Query Capabilities

#### V3 API (Primary for AI)

| Operation | Purpose | Latency |
|-----------|---------|---------|
| `canvas_read` | Get element tree/flat/summary | ~2-5ms |
| `canvas_find` | Search with filters | ~1-3ms |
| `canvas_edit` | Incremental mutations | ~5-10ms |
| `canvas_write` | Create element trees | ~10-20ms |

#### ECS Layer Performance

| Operation | Performance | Notes |
|-----------|-------------|-------|
| Query hit (cached) | 768ns - 1.88μs | Excellent |
| Component lookup | O(1) | Direct Map access |
| Spatial query (R-tree) | O(log n) | Hit testing, bounds |
| Hit testing | 0.1ms | 25x faster than legacy |
| Bounding box query | 0.12ms | 63x faster than legacy |

### Current Data Flow

```
Agent Request: "Find all rectangles containing 'Login'"
    │
    ▼ [Round-trip 1]
canvas_find({ type: 'rectangle' })
    │
    ▼ [Round-trip 2]
canvas_read({ target: matchingIds, format: 'tree' })
    │
    ▼ [Round-trip 3]
Filter in agent code (text.contains('Login'))
    │
    ▼ [Round-trip 4]
canvas_edit({ operations: [...] })
```

**Problem**: 4 round-trips for a single semantic operation.

---

## Pain Points

### 1. Multiple Round-Trips (High Impact)

**Current State**: Complex queries require 2-4 separate API calls.

```typescript
// Agent needs: rectangles with "Login" text, sorted by position
const allRects = await canvas_find({ type: 'rectangle' });       // Call 1
const detailed = await canvas_read({ target: allRects.ids });    // Call 2
const filtered = detailed.filter(e => e.text?.includes('Login'));// Client-side
const sorted = filtered.sort((a, b) => a.y - b.y);               // Client-side
```

**Impact**:
- 200-400ms latency per compound query
- Increased token usage (multiple tool calls)
- Complex agent logic for simple operations

### 2. Token Bloat (High Impact)

**Current State**: Large canvases (1000+ elements) cause expensive API calls.

| Canvas Size | Current Response | Token Count |
|-------------|------------------|-------------|
| 10 elements | 2KB | ~500 |
| 100 elements | 20KB | ~5,000 |
| 1000 elements | 200KB | ~50,000 |

**Mitigation exists**: Context builder switches to summary mode for large canvases, but this loses detail when agents need specific elements.

### 3. No Semantic Queries (Medium Impact)

**Current State**: Agents can't query by:
- Role: "navigation elements", "form inputs", "buttons"
- Relationship: "elements connected to X", "siblings of Y"
- Context: "elements in the header area", "form fields"

**Workaround**: Manual filtering in agent code:

```typescript
// Agent must manually classify
const elements = await canvas_read({ format: 'tree' });
const buttons = elements.filter(e =>
  e.type === 'rectangle' &&
  e.text &&
  e.width < 200 &&
  e.height < 60
);
```

### 4. No Query Result Caching (Medium Impact)

**Current State**: Each agent tool call re-executes the full query pipeline.

```typescript
// Agent asks same question twice
await canvas_find({ type: 'text' });  // Full execution
// ... other operations ...
await canvas_find({ type: 'text' });  // Full execution again
```

**ECS Layer**: Has query caching, but driver layer doesn't leverage it across requests.

### 5. Inefficient Batch Operations (Medium Impact)

**Current State**: `canvas_edit` supports batches, but agents don't always use them effectively.

```typescript
// Inefficient: Multiple canvas_edit calls
for (const id of ids) {
  await canvas_edit({ target: id, operations: [{ op: 'set', fill: 'red' }] });
}

// Efficient: Single batch (but agents often miss this pattern)
await canvas_edit({
  target: ids,
  operations: [{ op: 'set', fill: 'red' }]
});
```

### 6. No Streaming for Large Results (Low Impact)

**Current State**: Full result must be assembled before returning.

For 10,000 elements: Agent waits 2-3 seconds for complete response instead of processing incrementally.

---

## Proposed Architecture

### Design Principles

1. **Single-Query Power** - One query should handle compound operations
2. **Projection Control** - Return only needed fields
3. **Semantic Understanding** - Query by role, relationship, context
4. **Progressive Loading** - Stream results for large datasets
5. **Smart Caching** - Cache across agent requests
6. **ECS-Native** - Leverage underlying O(log n) performance

### Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                         AI Agent Layer                               │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │              Agent Query Builder (New)                       │    │
│  │   .where() .select() .include() .aggregate() .stream()      │    │
│  └─────────────────────────────────────────────────────────────┘    │
└────────────────────────────────┬─────────────────────────────────────┘
                                 │
┌────────────────────────────────▼─────────────────────────────────────┐
│                    Query Execution Layer (New)                       │
│                                                                      │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐           │
│  │ Query Planner │  │ Query Cache   │  │ Result Stream │           │
│  │ (Optimization)│  │ (Cross-req)   │  │ (Progressive) │           │
│  └───────────────┘  └───────────────┘  └───────────────┘           │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │              Semantic Query Engine (New)                     │    │
│  │   Role Detection · Relationship Graph · Context Analysis    │    │
│  └─────────────────────────────────────────────────────────────┘    │
└────────────────────────────────┬─────────────────────────────────────┘
                                 │
┌────────────────────────────────▼─────────────────────────────────────┐
│                      Canvas Driver (Enhanced)                        │
│   canvas_query (new unified) · canvas_mutate (enhanced batch)       │
└────────────────────────────────┬─────────────────────────────────────┘
                                 │
┌────────────────────────────────▼─────────────────────────────────────┐
│                         Canvas Core (ECS)                            │
│   Spatial Index · Component Queries · Hierarchy Service             │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Query API Design

### New Unified Query: `canvas_query`

Replace multiple round-trips with a single powerful query:

```typescript
interface CanvasQueryInput {
  // === Selection ===
  where?: QueryFilter;           // What to find
  target?: string | string[];    // Or specific IDs

  // === Projection ===
  select?: SelectionSpec;        // Which fields to return
  include?: IncludeSpec;         // Related data to include

  // === Semantic ===
  semantic?: SemanticQuery;      // Role/relationship queries

  // === Aggregation ===
  aggregate?: AggregateSpec;     // Computed summaries
  groupBy?: string | string[];   // Group results

  // === Ordering ===
  orderBy?: OrderSpec;           // Sort results

  // === Pagination ===
  limit?: number;                // Max results
  offset?: number;               // Skip N results
  cursor?: string;               // Cursor-based pagination

  // === Performance ===
  hints?: QueryHints;            // Optimization hints
  stream?: boolean;              // Enable streaming
  cache?: CacheOptions;          // Caching behavior
}

interface CanvasQueryOutput {
  // === Format-specific output (all tree-based) ===
  json?: QueryNode[];            // JSON tree (format: 'json')
  ascii?: string;                // ASCII tree (format: 'ascii')
  xml?: string;                  // XML tree (format: 'xml')

  // === Metadata ===
  count?: number;                // Total element count
  depth?: number;                // Max depth returned
  aggregations?: AggregationResults;

  // === Pagination ===
  hasMore?: boolean;
  cursor?: string;

  // === Performance ===
  cached?: boolean;
  executionTime?: number;
}
```

---

## Tree-First Result Model

### Design Philosophy

The query API is designed for **AI agent chain-of-thought reasoning**:

1. **Tree as default** - Canvas is inherently hierarchical (frames → elements)
2. **Depth control** - Progressive disclosure, start shallow, drill down
3. **Component selection** - Return only what's needed for current reasoning step
4. **Minimal tokens** - Summaries first, details on demand
5. **ECS-native** - Results mirror actual component data model

### Output Format Options

All formats are **tree-based** to match the hierarchical canvas structure:

```typescript
interface CanvasQueryInput {
  // ... other fields ...

  // === Output Format (all tree-based) ===
  format?: 'json' | 'ascii' | 'xml';

  // json  - Nested JSON tree (default, best for programmatic use)
  // ascii - Visual ASCII tree (best for AI reasoning/display)
  // xml   - XML tree structure (best for structured parsing)

  // === Depth Control ===
  depth?: number;              // Max tree depth (default: unlimited)
                               // 0 = roots only
                               // 1 = roots + immediate children
                               // 2 = roots + children + grandchildren

  // === Children Options ===
  children?: {
    include?: boolean;         // Include children (default: true)
    components?: ComponentSelection[];  // Components for children
    summarize?: boolean;       // Replace children with count
  };
}
```

### Format Examples

#### JSON Format (Default)

Best for programmatic manipulation, full component data:

```typescript
await canvas_query({
  format: 'json',
  depth: 2,
  select: { preset: 'spatial' }
});
```

```json
{
  "tree": [{
    "id": "frame-1",
    "entity": 10,
    "shape": { "kind": "frame" },
    "position": { "x": 0, "y": 0 },
    "size": { "width": 800, "height": 600 },
    "children": [{
      "id": "rect-1",
      "entity": 11,
      "shape": { "kind": "rectangle" },
      "position": { "x": 50, "y": 50 },
      "size": { "width": 200, "height": 100 },
      "children": []
    }, {
      "id": "text-1",
      "entity": 12,
      "shape": { "kind": "text" },
      "position": { "x": 300, "y": 50 },
      "size": { "width": 150, "height": 24 },
      "children": []
    }]
  }],
  "count": 3
}
```

#### ASCII Format

Best for AI chain-of-thought reasoning, human-readable overview:

```typescript
await canvas_query({
  format: 'ascii',
  depth: 2,
  select: { preset: 'spatial' }
});
```

```
Canvas (3 elements)
└── frame-1 [frame] (0,0) 800×600
    ├── rect-1 [rectangle] (50,50) 200×100
    └── text-1 [text] (300,50) 150×24 "Login"
```

With more detail (`select: { preset: 'visual' }`):

```
Canvas (3 elements)
└── frame-1 [frame] (0,0) 800×600 fill:#f5f5f5
    ├── rect-1 [rectangle] (50,50) 200×100 fill:#3b82f6 stroke:#1e40af
    └── text-1 [text] (300,50) 150×24 "Login" 16px Inter
```

Summarized children (`children: { summarize: true }`):

```
Canvas (47 elements)
├── frame-1 [frame] "Login Form" (0,0) 400×300 [12 children]
├── frame-2 [frame] "Dashboard" (450,0) 600×400 [25 children]
└── frame-3 [frame] "Settings" (0,350) 400×250 [10 children]
```

#### XML Format

Best for structured parsing, schema validation:

```typescript
await canvas_query({
  format: 'xml',
  depth: 2,
  select: { preset: 'spatial' }
});
```

```xml
<?xml version="1.0" encoding="UTF-8"?>
<canvas count="3">
  <node id="frame-1" entity="10">
    <shape kind="frame"/>
    <position x="0" y="0"/>
    <size width="800" height="600"/>
    <children>
      <node id="rect-1" entity="11">
        <shape kind="rectangle"/>
        <position x="50" y="50"/>
        <size width="200" height="100"/>
      </node>
      <node id="text-1" entity="12">
        <shape kind="text"/>
        <position x="300" y="50"/>
        <size width="150" height="24"/>
        <text content="Login"/>
      </node>
    </children>
  </node>
</canvas>
```

### Format Selection Guide

| Format | Tokens | Best For |
|--------|--------|----------|
| `json` | Medium | Programmatic manipulation, full data |
| `ascii` | **Low** | AI reasoning, quick overview, chain-of-thought |
| `xml` | High | Structured parsing, validation, transforms |

### ASCII Format Variants

```typescript
// Compact (minimal tokens)
await canvas_query({
  format: 'ascii',
  select: { preset: 'identity' }
});
// └── frame-1 [frame] [5 children]

// Spatial (positions/sizes)
await canvas_query({
  format: 'ascii',
  select: { preset: 'spatial' }
});
// └── frame-1 [frame] (0,0) 800×600

// Visual (+ colors)
await canvas_query({
  format: 'ascii',
  select: { preset: 'visual' }
});
// └── frame-1 [frame] (0,0) 800×600 fill:#f5f5f5

// Content (+ text/names)
await canvas_query({
  format: 'ascii',
  select: { preset: 'content' }
});
// └── frame-1 [frame] "Login Form" (0,0) 800×600 fill:#f5f5f5
```

### Tree Output Structure

```typescript
/**
 * Query result node - hierarchical tree structure
 * Mirrors ECS component architecture
 */
interface QueryNode {
  // === Identity (always included) ===
  id: string;                    // Element ID
  entity: number;                // ECS entity handle

  // === Components (based on select.components) ===
  shape?: ShapeData;
  position?: PositionData;
  size?: SizeData;
  rotation?: RotationData;
  bounds?: BoundsData;
  order?: OrderData;
  state?: StateData;
  style?: StyleData;
  text?: TextData;
  image?: ImageData;
  bindings?: BindingsData;
  interaction?: InteractionData;
  metadata?: MetadataData;

  // === Tree Structure (always for tree format) ===
  children?: QueryNode[];        // Nested children (recursive)
  childCount?: number;           // Total children (when summarize: true)

  // === Semantic (optional) ===
  _semantic?: SemanticData;
}
```

### Depth Control Examples

```typescript
// === DEPTH 0: Roots only (minimal overview) ===
await canvas_query({
  format: 'tree',
  depth: 0,
  select: { preset: 'identity' }
});
// Result:
// { tree: [
//   { id: 'frame-1', entity: 10, childCount: 5 },
//   { id: 'frame-2', entity: 20, childCount: 3 }
// ]}
// Tokens: ~50 (extremely minimal)

// === DEPTH 1: Roots + immediate children ===
await canvas_query({
  format: 'tree',
  depth: 1,
  select: { preset: 'spatial' }
});
// Result:
// { tree: [{
//   id: 'frame-1', entity: 10,
//   shape: { kind: 'frame' },
//   position: { x: 0, y: 0 },
//   size: { width: 800, height: 600 },
//   children: [
//     { id: 'rect-1', entity: 11, shape: { kind: 'rectangle' }, ... },
//     { id: 'text-1', entity: 12, shape: { kind: 'text' }, ... }
//   ]
// }]}

// === DEPTH 2: Include grandchildren ===
await canvas_query({
  format: 'tree',
  depth: 2,
  select: { preset: 'visual' }
});

// === UNLIMITED DEPTH (full tree) ===
await canvas_query({
  format: 'tree',
  // depth: undefined = unlimited
  select: { preset: 'content' }
});
```

### Children Summarization (Token Optimization)

```typescript
// Replace children array with count for token efficiency
await canvas_query({
  format: 'tree',
  depth: 1,
  children: { summarize: true },
  select: { preset: 'spatial' }
});
// Result:
// { tree: [{
//   id: 'frame-1', entity: 10,
//   shape: { kind: 'frame' },
//   position: { x: 0, y: 0 },
//   size: { width: 800, height: 600 },
//   childCount: 15  // Instead of full children array
// }]}
// Tokens: ~80 per frame (vs ~1000 with full children)

// Different components for children vs parents
await canvas_query({
  format: 'tree',
  depth: 1,
  select: { preset: 'visual' },           // Full visual for roots
  children: { components: ['shape'] }     // Only shape for children
});
// Result:
// { tree: [{
//   id: 'frame-1', entity: 10,
//   shape: { kind: 'frame' },
//   position: { x: 0, y: 0 },
//   size: { width: 800, height: 600 },
//   style: { fill: { color: '#f0f0f0' }, ... },
//   children: [
//     { id: 'rect-1', entity: 11, shape: { kind: 'rectangle' } },  // Minimal
//     { id: 'text-1', entity: 12, shape: { kind: 'text' } }
//   ]
// }]}
```

---

## Chain-of-Thought Query Patterns

### Progressive Disclosure Pattern

AI agents should query progressively using ASCII for reasoning, JSON for manipulation:

```typescript
// === STEP 1: Overview (what's on the canvas?) ===
const overview = await canvas_query({
  format: 'ascii',
  depth: 0,
  children: { summarize: true }
});
// Result:
// Canvas (47 elements)
// ├── frame-1 [frame] "Login Form" [12 children]
// ├── frame-2 [frame] "Dashboard" [25 children]
// └── frame-3 [frame] "Settings" [10 children]
// Tokens: ~50

// === STEP 2: Structure (expand one area) ===
const structure = await canvas_query({
  format: 'ascii',
  target: 'frame-1',
  depth: 1,
  select: { preset: 'spatial' }
});
// Result:
// frame-1 [frame] "Login Form" (0,0) 400×300
// ├── rect-1 [rectangle] (20,20) 360×40
// ├── input-1 [rectangle] (20,80) 360×36
// ├── input-2 [rectangle] (20,130) 360×36
// └── btn-1 [rectangle] (20,200) 120×40
// Tokens: ~100

// === STEP 3: Focus (get full details for action) ===
const details = await canvas_query({
  format: 'json',
  target: ['rect-1', 'btn-1'],
  select: { preset: 'visual' }
});
// Result: Full JSON for programmatic manipulation
// Tokens: ~200

// === STEP 4: Action (modify specific elements) ===
await canvas_mutate({
  target: ['rect-1', 'btn-1'],
  operations: [{ op: 'set', style: { fill: { color: '#3b82f6' } } }]
});
```

### Fluent Query Builder

For AI agent convenience, support fluent chaining:

```typescript
// Fluent API for chain-of-thought
const query = canvas
  .query()
  .where({ shape: { kind: 'rectangle' } })
  .select('spatial')
  .depth(1)
  .limit(10);

// Refinement (continue from previous query)
const refined = query
  .and({ style: { fill: { color: '#ff0000' } } })
  .select('visual');

// Execution
const result = await refined.execute();
```

### Query Presets for Common Patterns

```typescript
// Built-in presets for AI agent workflows
const QUERY_PRESETS = {
  // 📊 Canvas overview - "What's on the canvas?"
  overview: {
    format: 'ascii',
    depth: 0,
    children: { summarize: true }
  },

  // 🌳 Structure scan - "How is it organized?"
  structure: {
    format: 'ascii',
    depth: 1,
    select: { components: ['shape', 'metadata'] },
    children: { summarize: true }
  },

  // 📍 Layout view - "Where are things positioned?"
  layout: {
    format: 'ascii',
    depth: 1,
    select: { preset: 'spatial' }
  },

  // 🎨 Design view - "What does it look like?"
  design: {
    format: 'ascii',
    depth: 2,
    select: { preset: 'visual' }
  },

  // 📝 Content view - "What text/images are there?"
  content: {
    format: 'ascii',
    where: { shape: { kind: ['text', 'image'] } },
    select: { preset: 'content' }
  },

  // 🔗 Connections view - "How are things connected?"
  connections: {
    format: 'ascii',
    where: { shape: { kind: 'arrow' } },
    select: { components: ['shape', 'bindings'] }
  },

  // ✅ Selection focus - "What's selected?"
  selection: {
    format: 'json',  // JSON for manipulation
    where: { state: { selected: true } },
    select: { preset: 'visual' }
  },

  // 🔧 Manipulation ready - "Get data for editing"
  editable: {
    format: 'json',
    select: { preset: 'complete' }
  }
};

// Usage
await canvas_query({ preset: 'overview' });   // ASCII for reasoning
await canvas_query({ preset: 'structure' });  // ASCII for reasoning
await canvas_query({ preset: 'selection' });  // JSON for manipulation
```

### Token Budget Guide

| Preset | Format | Tokens | Use When |
|--------|--------|--------|----------|
| `overview` | ascii | ~30-50 | Start of task, orientation |
| `structure` | ascii | ~100-200 | Understanding hierarchy |
| `layout` | ascii | ~300-500 | Positioning operations |
| `design` | ascii | ~500-1000 | Visual inspection |
| `content` | ascii | ~300-800 | Text/image overview |
| `connections` | ascii | ~100-300 | Arrow/flow overview |
| `selection` | json | ~100-500 | Acting on selection |
| `editable` | json | ~500-2000 | Full data for editing |

### Reasoning-Aligned Response Format

Results include hints for AI reasoning:

```typescript
interface CanvasQueryOutput {
  // ... core results ...

  // === AI Reasoning Hints ===
  _hints?: {
    // Summarize what was found
    summary: string;           // "Found 3 frames with 47 total elements"

    // Suggest next actions
    suggestions?: string[];    // ["Drill into 'Login Form' frame", "Check arrow connections"]

    // Highlight notable patterns
    patterns?: {
      type: string;            // "grid_layout" | "flow_diagram" | "form" | ...
      confidence: number;
      elements: string[];
    }[];
  };
}
```

---

## ECS-Aligned Result Model

Query results mirror the ECS component architecture in canvas-core. Results are **tree-structured by default** with **component-based data**:

```typescript
/**
 * Query result node - mirrors ECS component structure
 */
interface QueryNode {
  // === Identity (always included) ===
  id: string;                    // From: elementId component
  entity: number;                // ECS entity handle

  // === Components (included based on select) ===
  shape?: ShapeData;             // From: shape component
  position?: PositionData;       // From: position component
  size?: SizeData;               // From: size component
  rotation?: RotationData;       // From: rotation component
  bounds?: BoundsData;           // From: bounds component (computed)
  order?: OrderData;             // From: order component
  state?: StateData;             // From: state component
  style?: StyleData;             // From: fill, stroke, opacity, roughness
  text?: TextData;               // From: text component
  image?: ImageData;             // From: image component
  hierarchy?: HierarchyData;     // From: parent, children, group
  bindings?: BindingsData;       // From: bindings, boundTo
  interaction?: InteractionData; // From: interaction component
  metadata?: MetadataData;       // From: version, customData, frameName

  // === Semantic (optional) ===
  _semantic?: SemanticData;      // Computed role/context
}
```

### Component Data Structures

Each component group maps directly to ECS components:

```typescript
// === SHAPE COMPONENT ===
interface ShapeData {
  kind: ShapeKind;  // 'rectangle' | 'ellipse' | 'diamond' | 'triangle' |
                    // 'line' | 'arrow' | 'freedraw' | 'text' | 'image' |
                    // 'frame' | 'slot' | 'embeddable'
}

// === SPATIAL COMPONENTS ===
interface PositionData {
  x: number;        // Canvas X coordinate
  y: number;        // Canvas Y coordinate
}

interface SizeData {
  width: number;
  height: number;
  lockedRatio?: boolean;
}

interface RotationData {
  angle: number;    // Radians
}

interface BoundsData {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  centerX: number;  // Computed
  centerY: number;  // Computed
}

interface OrderData {
  index: string | null;  // Fractional z-index
  layer: 'background' | 'content' | 'foreground' | 'overlay';
}

// === STATE COMPONENT ===
interface StateData {
  selected: boolean;
  locked: boolean;
  hidden: boolean;
  deleted: boolean;
  dirty: boolean;
  editing: boolean;
  dragging: boolean;
  // Flags extracted from bitfield for readability
}

// === STYLE COMPONENTS ===
interface StyleData {
  fill?: {
    color: string;
    style: 'solid' | 'hachure' | 'cross-hatch' | 'none';
  };
  stroke?: {
    color: string;
    width: number;
    style: 'solid' | 'dashed' | 'dotted';
  };
  opacity?: number;      // 0-100
  roughness?: number;    // 0-3
}

// === TEXT COMPONENT ===
interface TextData {
  content: string;
  fontSize: number;
  fontFamily: string;
  textAlign: 'left' | 'center' | 'right';
  verticalAlign: 'top' | 'middle' | 'bottom';
  lineHeight: number;
  autoResize: boolean;
}

// === IMAGE COMPONENT ===
interface ImageData {
  fileId: string | null;
  status: 'pending' | 'saved' | 'error';
  naturalWidth: number;
  naturalHeight: number;
  scale: [number, number];
  crop?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

// === HIERARCHY COMPONENTS ===
interface HierarchyData {
  parent?: string;        // Parent element ID
  children?: string[];    // Child element IDs
  groupIds?: string[];    // Group memberships
  frameId?: string;       // Containing frame ID
}

// === BINDING COMPONENTS ===
interface BindingsData {
  start?: PointBinding;   // For arrows/lines
  end?: PointBinding;
  boundTo?: string[];     // Elements bound to this
}

interface PointBinding {
  elementId: string;
  focus: number;          // -1 to 1
  gap: number;
}

// === INTERACTION COMPONENT ===
interface InteractionData {
  selectable: boolean;
  draggable: boolean;
  resizable: boolean;
  rotatable: boolean;
  editable: boolean;
  deletable: boolean;
}

// === METADATA COMPONENTS ===
interface MetadataData {
  version: number;
  updated: number;        // Epoch timestamp
  name?: string;          // Frame name
  customData?: Record<string, unknown>;
}
```

### Component-Based Selection

Select which component groups to include:

```typescript
interface SelectionSpec {
  // === Component Groups ===
  components?: ComponentSelection[];

  // === Preset (shorthand for component groups) ===
  preset?: ComponentPreset;

  // === Fine-grained control ===
  exclude?: ComponentSelection[];

  // === Computed additions ===
  computed?: ('bounds' | 'worldPosition')[];
}

type ComponentSelection =
  | 'shape'       // Shape kind
  | 'position'    // x, y
  | 'size'        // width, height
  | 'rotation'    // angle
  | 'bounds'      // minX, minY, maxX, maxY (computed)
  | 'order'       // z-index, layer
  | 'state'       // selected, locked, hidden, etc.
  | 'style'       // fill, stroke, opacity, roughness
  | 'text'        // Text content and formatting
  | 'image'       // Image data
  | 'hierarchy'   // parent, children, groups
  | 'bindings'    // Arrow bindings
  | 'interaction' // Interaction flags
  | 'metadata';   // Version, customData

type ComponentPreset =
  | 'identity'    // Just id + entity
  | 'spatial'     // shape + position + size + rotation
  | 'visual'      // spatial + style
  | 'content'     // visual + text + image
  | 'complete';   // All components
```

### Component Presets

Presets map to common AI agent use cases:

```typescript
const COMPONENT_PRESETS = {
  // 🆔 Identity only - for counting, existence checks
  // ~30 bytes/element
  identity: {
    components: []  // Only id + entity (always included)
  },

  // 📍 Spatial - positioning, layout operations
  // ~100 bytes/element
  spatial: {
    components: ['shape', 'position', 'size', 'rotation']
  },

  // 🎨 Visual - spatial + styling
  // ~180 bytes/element
  visual: {
    components: ['shape', 'position', 'size', 'rotation', 'style']
  },

  // 📝 Content - visual + text/image data
  // ~250 bytes/element (varies with text length)
  content: {
    components: ['shape', 'position', 'size', 'rotation', 'style', 'text', 'image']
  },

  // ✅ Complete - all components
  // ~400 bytes/element
  complete: {
    components: [
      'shape', 'position', 'size', 'rotation', 'bounds', 'order',
      'state', 'style', 'text', 'image', 'hierarchy', 'bindings',
      'interaction', 'metadata'
    ]
  }
};
```

### Preset Selection Guide

| Preset | Components | Bytes/El | Use Case |
|--------|------------|----------|----------|
| `identity` | - | ~30 | Count, batch IDs, existence |
| `spatial` | shape, position, size, rotation | ~100 | Layout, alignment, move |
| `visual` | + style | ~180 | Design inspection, styling |
| `content` | + text, image | ~250 | Content editing, search |
| `complete` | all | ~400 | Full inspection, export |

### Query Examples with Components

```typescript
// 🆔 Just count rectangles
const count = await canvas_query({
  where: { shape: { kind: 'rectangle' } },
  select: { preset: 'identity' },
  aggregate: { count: true }
});
// Result: { count: 42, nodes: [{ id, entity }, ...] }

// 📍 Get positions for layout
const positions = await canvas_query({
  where: { state: { selected: true } },
  select: { preset: 'spatial' }
});
// Result: { nodes: [{
//   id: 'rect-1',
//   entity: 42,
//   shape: { kind: 'rectangle' },
//   position: { x: 100, y: 200 },
//   size: { width: 150, height: 80 },
//   rotation: { angle: 0 }
// }, ...]}

// 🎨 Get visual properties for styling
const visuals = await canvas_query({
  where: { shape: { kind: ['rectangle', 'ellipse'] } },
  select: { preset: 'visual' }
});
// Result includes shape + position + size + rotation + style

// 📝 Get text content for editing
const texts = await canvas_query({
  where: { shape: { kind: 'text' } },
  select: {
    components: ['shape', 'position', 'size', 'text']
  }
});
// Result: { nodes: [{
//   id: 'text-1',
//   entity: 55,
//   shape: { kind: 'text' },
//   position: { x: 300, y: 100 },
//   size: { width: 200, height: 24 },
//   text: {
//     content: 'Hello World',
//     fontSize: 16,
//     fontFamily: 'Inter',
//     textAlign: 'left',
//     ...
//   }
// }, ...]}

// 🌳 Get hierarchy for tree operations
const tree = await canvas_query({
  where: { shape: { kind: 'frame' } },
  select: {
    components: ['shape', 'position', 'size', 'hierarchy', 'metadata']
  }
});
// Result: { nodes: [{
//   id: 'frame-1',
//   entity: 10,
//   shape: { kind: 'frame' },
//   position: { x: 0, y: 0 },
//   size: { width: 800, height: 600 },
//   hierarchy: {
//     parent: null,
//     children: ['rect-1', 'text-1', 'ellipse-1'],
//     groupIds: []
//   },
//   metadata: { name: 'Main Frame', version: 3 }
// }, ...]}

// 🔗 Get bindings for arrow operations
const arrows = await canvas_query({
  where: { shape: { kind: 'arrow' } },
  select: {
    components: ['shape', 'position', 'bindings']
  }
});
// Result: { nodes: [{
//   id: 'arrow-1',
//   entity: 77,
//   shape: { kind: 'arrow' },
//   position: { x: 150, y: 200 },
//   bindings: {
//     start: { elementId: 'rect-1', focus: 0.5, gap: 8 },
//     end: { elementId: 'rect-2', focus: 0.5, gap: 8 }
//   }
// }, ...]}
```

### Token Efficiency Comparison

For a canvas with 100 elements:

| Preset | Bytes | Tokens | vs Full |
|--------|-------|--------|---------|
| `identity` | 3 KB | ~750 | **13x smaller** |
| `spatial` | 10 KB | ~2,500 | **4x smaller** |
| `visual` | 18 KB | ~4,500 | **2x smaller** |
| `content` | 25 KB | ~6,250 | **1.6x smaller** |
| `complete` | 40 KB | ~10,000 | baseline |

### Include Specification

Eager-load related data:

```typescript
interface IncludeSpec {
  // Hierarchy
  parent?: boolean | SelectionSpec;
  children?: boolean | SelectionSpec | { depth?: number };
  ancestors?: boolean | { depth?: number };
  descendants?: boolean | { depth?: number };
  siblings?: boolean;

  // Relationships
  connectedTo?: boolean;         // Elements this connects to
  connectedFrom?: boolean;       // Elements connecting to this
  boundTo?: boolean;             // Bound elements (arrows to shapes)

  // Spatial
  overlapping?: boolean;         // Elements overlapping bounds
  nearby?: { distance: number }; // Elements within distance
  containing?: boolean;          // Elements containing this
  containedBy?: boolean;         // Elements this is contained by
}
```

**Example - Include connected elements**:

```typescript
// Single query: Get element + all connected arrows + their targets
const result = await canvas_query({
  target: 'button-1',
  include: {
    connectedFrom: true,  // Arrows pointing to this
    connectedTo: true     // Arrows from this pointing elsewhere
  }
});

// Returns:
// {
//   nodes: [{
//     id: 'button-1',
//     type: 'rectangle',
//     _connected: {
//       from: [{ id: 'arrow-1', from: 'form-1', to: 'button-1' }],
//       to: [{ id: 'arrow-2', from: 'button-1', to: 'result-1' }]
//     }
//   }]
// }
```

### Component-Based Filter Specification

Filters query directly on ECS components, mirroring the data model:

```typescript
interface QueryFilter {
  // === SHAPE COMPONENT ===
  shape?: {
    kind?: ShapeKind | ShapeKind[];  // Filter by shape type
  };

  // === SPATIAL COMPONENTS ===
  position?: {
    x?: NumberFilter;
    y?: NumberFilter;
  };

  size?: {
    width?: NumberFilter;
    height?: NumberFilter;
  };

  rotation?: {
    angle?: NumberFilter;
  };

  // Computed spatial queries (uses R-tree index)
  bounds?: {
    $within?: BoundingBox;         // Fully contained in box
    $intersects?: BoundingBox;     // Overlaps with box
    $near?: { x: number; y: number; maxDistance: number };
    $contains?: { x: number; y: number };  // Contains point
  };

  // === STATE COMPONENT ===
  state?: {
    selected?: boolean;
    locked?: boolean;
    hidden?: boolean;
    deleted?: boolean;
    editing?: boolean;
    dirty?: boolean;
  };

  // === STYLE COMPONENTS ===
  style?: {
    fill?: {
      color?: string | string[];
      style?: FillStyle | FillStyle[];
    };
    stroke?: {
      color?: string | string[];
      width?: NumberFilter;
      style?: StrokeStyle | StrokeStyle[];
    };
    opacity?: NumberFilter;
    roughness?: NumberFilter;
  };

  // === TEXT COMPONENT ===
  text?: {
    content?: TextFilter;          // Text content search
    fontSize?: NumberFilter;
    fontFamily?: string | string[];
    textAlign?: TextAlign | TextAlign[];
  };

  // === HIERARCHY COMPONENTS ===
  hierarchy?: {
    parent?: string | null;        // null = root elements
    hasChildren?: boolean;
    childCount?: NumberFilter;
    groupIds?: { $contains?: string; $empty?: boolean };
    frameId?: string | null;
    depth?: NumberFilter;          // Tree depth
    isRoot?: boolean;
    isLeaf?: boolean;
  };

  // === BINDING COMPONENTS ===
  bindings?: {
    hasStart?: boolean;
    hasEnd?: boolean;
    startElementId?: string;
    endElementId?: string;
  };

  // === ORDER COMPONENT ===
  order?: {
    layer?: LayerCategory | LayerCategory[];
  };

  // === METADATA COMPONENTS ===
  metadata?: {
    name?: TextFilter;             // Frame name search
    hasCustomData?: boolean;
  };

  // === LOGICAL OPERATORS ===
  $and?: QueryFilter[];
  $or?: QueryFilter[];
  $not?: QueryFilter;
}

// Number filter operators
interface NumberFilter {
  $eq?: number;
  $ne?: number;
  $gt?: number;
  $gte?: number;
  $lt?: number;
  $lte?: number;
  $between?: [number, number];
}

// Text filter operators
interface TextFilter {
  $eq?: string;
  $contains?: string;
  $startsWith?: string;
  $endsWith?: string;
  $regex?: string;
  $empty?: boolean;
}

type ShapeKind = 'rectangle' | 'ellipse' | 'diamond' | 'triangle' |
                 'line' | 'arrow' | 'freedraw' | 'text' | 'image' |
                 'frame' | 'slot' | 'embeddable';

type LayerCategory = 'background' | 'content' | 'foreground' | 'overlay';
```

### Filter Examples by Component

```typescript
// === SHAPE FILTERS ===
// Find all rectangles
{ shape: { kind: 'rectangle' } }

// Find shapes (rectangles or ellipses)
{ shape: { kind: ['rectangle', 'ellipse'] } }

// === SPATIAL FILTERS ===
// Elements at specific position
{ position: { x: { $eq: 100 }, y: { $eq: 200 } } }

// Elements larger than 200x200
{ size: { width: { $gte: 200 }, height: { $gte: 200 } } }

// Elements within viewport (uses R-tree, O(log n))
{ bounds: { $within: { x: 0, y: 0, w: 1920, h: 1080 } } }

// Elements near a point
{ bounds: { $near: { x: 500, y: 300, maxDistance: 100 } } }

// === STATE FILTERS ===
// Selected elements
{ state: { selected: true } }

// Unlocked, visible elements
{ state: { locked: false, hidden: false, deleted: false } }

// === STYLE FILTERS ===
// Red elements
{ style: { fill: { color: '#ff0000' } } }

// Elements with thick stroke
{ style: { stroke: { width: { $gte: 3 } } } }

// Semi-transparent elements
{ style: { opacity: { $lt: 100 } } }

// === TEXT FILTERS ===
// Text containing "Login"
{ text: { content: { $contains: 'Login' } } }

// Large text
{ text: { fontSize: { $gte: 24 } } }

// === HIERARCHY FILTERS ===
// Root elements (no parent)
{ hierarchy: { parent: null } }

// Elements with children
{ hierarchy: { hasChildren: true } }

// Children of specific frame
{ hierarchy: { parent: 'frame-1' } }

// Elements in groups
{ hierarchy: { groupIds: { $empty: false } } }

// === BINDING FILTERS ===
// Arrows connected to both ends
{ bindings: { hasStart: true, hasEnd: true } }

// Arrows starting from element
{ bindings: { startElementId: 'button-1' } }

// === ORDER FILTERS ===
// Foreground elements only
{ order: { layer: 'foreground' } }
```

**Example - Complex component-based filter**:

```typescript
// Before: Multiple calls + client filtering
const rects = await canvas_find({ type: 'rectangle' });
const detailed = await canvas_read({ target: rects.ids });
const filtered = detailed.filter(e =>
  e.text?.includes('Login') &&
  e.width > 100 &&
  e.x > 0 && e.x < 500
);

// After: Single query with component filters
const result = await canvas_query({
  where: {
    shape: { kind: 'rectangle' },
    text: { content: { $contains: 'Login' } },
    size: { width: { $gt: 100 } },
    bounds: { $within: { x: 0, y: 0, w: 500, h: 10000 } }
  },
  select: { preset: 'visual' }
});
// Result: Only rectangles with "Login" text, width > 100, within bounds
// Returns: shape + position + size + rotation + style components
```

### Aggregation Specification

```typescript
interface AggregateSpec {
  // Counting
  count?: boolean;
  countBy?: string;              // Group count by field

  // Spatial
  bounds?: boolean;              // Bounding box of all results
  center?: boolean;              // Center point
  area?: boolean;                // Total area

  // Numeric
  sum?: string | string[];       // Sum of field(s)
  avg?: string | string[];       // Average
  min?: string | string[];       // Minimum
  max?: string | string[];       // Maximum

  // Distribution
  histogram?: {
    field: string;
    buckets: number;
  };

  // Custom
  stats?: string[];              // Full statistics for field(s)
}
```

**Example - Analytics query**:

```typescript
// Single query: Get distribution of elements by type and bounds
const result = await canvas_query({
  where: { $state: { deleted: false } },
  aggregate: {
    count: true,
    countBy: 'type',
    bounds: true,
    center: true,
    stats: ['width', 'height']
  }
});

// Returns:
// {
//   count: 156,
//   aggregations: {
//     countBy: { rectangle: 42, text: 38, ellipse: 20, ... },
//     bounds: { x: 0, y: -100, w: 1920, h: 1200 },
//     center: { x: 960, y: 500 },
//     stats: {
//       width: { min: 10, max: 800, avg: 150, stdDev: 120 },
//       height: { min: 10, max: 600, avg: 100, stdDev: 80 }
//     }
//   }
// }
```

---

## Semantic Query Layer

### Role-Based Queries

Enable queries by semantic role rather than low-level properties:

```typescript
interface SemanticQuery {
  // === UI Role ===
  role?: SemanticRole | SemanticRole[];

  // === Relationships ===
  relationship?: RelationshipQuery;

  // === Context ===
  context?: ContextQuery;

  // === Pattern ===
  pattern?: PatternQuery;
}

type SemanticRole =
  | 'button'           // Clickable action elements
  | 'input'            // Form input fields
  | 'label'            // Text labels
  | 'heading'          // Section headings
  | 'container'        // Grouping containers
  | 'navigation'       // Navigation elements
  | 'card'             // Card components
  | 'icon'             // Icons/symbols
  | 'image'            // Image elements
  | 'divider'          // Visual separators
  | 'badge'            // Status badges
  | 'tooltip'          // Tooltip content
  | 'modal'            // Modal/dialog content
  | 'form'             // Form containers
  | 'list'             // List containers
  | 'list-item'        // List items
  | 'table'            // Table structures
  | 'chart'            // Data visualizations
  | 'annotation';      // Design annotations
```

### Role Detection Engine

```typescript
interface RoleDetector {
  // Detection rules
  rules: RoleDetectionRule[];

  // ML-based fallback (optional)
  mlModel?: RoleClassificationModel;

  // Caching
  cache: Map<string, SemanticRole>;
}

interface RoleDetectionRule {
  role: SemanticRole;
  conditions: {
    // Type hints
    types?: string[];

    // Size constraints
    size?: { width?: NumberFilter; height?: NumberFilter };
    aspectRatio?: NumberFilter;

    // Content hints
    text?: TextMatcher;
    hasChildren?: boolean;
    childCount?: NumberFilter;

    // Style hints
    fill?: string | string[];
    hasStroke?: boolean;
    cornerRadius?: NumberFilter;

    // Hierarchy hints
    parentRole?: SemanticRole;
    position?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  };
  confidence: number;  // 0-1 confidence threshold
}

// Example rules
const buttonRule: RoleDetectionRule = {
  role: 'button',
  conditions: {
    types: ['rectangle', 'roundedRect'],
    size: {
      width: { $between: [60, 300] },
      height: { $between: [30, 60] }
    },
    text: { exists: true, maxLength: 30 },
    cornerRadius: { $gte: 4 },
    fill: { $exists: true }
  },
  confidence: 0.8
};

const inputRule: RoleDetectionRule = {
  role: 'input',
  conditions: {
    types: ['rectangle'],
    size: {
      width: { $gte: 100 },
      height: { $between: [30, 50] }
    },
    hasStroke: true,
    fill: ['#ffffff', 'transparent', '#f5f5f5']
  },
  confidence: 0.75
};
```

**Example - Semantic query**:

```typescript
// Find all button-like elements
const buttons = await canvas_query({
  semantic: { role: 'button' },
  select: { preset: 'standard' }
});

// Find all form inputs with their labels
const formFields = await canvas_query({
  semantic: { role: 'input' },
  include: {
    nearby: { distance: 50 }  // Get nearby labels
  },
  select: { fields: ['id', 'x', 'y', 'width', 'height', 'text'] }
});
```

### Relationship Queries

```typescript
interface RelationshipQuery {
  // Connection-based
  connectedTo?: string | QueryFilter;
  connectedFrom?: string | QueryFilter;

  // Hierarchy-based
  childOf?: string | QueryFilter;
  parentOf?: string | QueryFilter;
  siblingOf?: string | QueryFilter;

  // Spatial-based
  alignedWith?: string | AlignmentSpec;
  groupedWith?: string;

  // Flow-based
  flowsTo?: string;              // In directed graph
  flowsFrom?: string;
  pathBetween?: { from: string; to: string };
}
```

**Example - Find connected elements**:

```typescript
// Find all elements that flow from "Start" to "End"
const flowPath = await canvas_query({
  semantic: {
    relationship: {
      pathBetween: { from: 'start-node', to: 'end-node' }
    }
  }
});

// Find all elements aligned with the selected element
const aligned = await canvas_query({
  semantic: {
    relationship: {
      alignedWith: {
        target: 'selected-1',
        axis: 'horizontal',
        tolerance: 5
      }
    }
  }
});
```

### Context Queries

```typescript
interface ContextQuery {
  // Spatial context
  region?: 'header' | 'footer' | 'sidebar' | 'main' | 'modal';
  quadrant?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

  // Semantic context
  withinForm?: string;
  withinCard?: string;
  withinSection?: string;

  // Visual context
  prominence?: 'primary' | 'secondary' | 'tertiary';
  layer?: 'foreground' | 'background' | 'overlay';
}
```

---

## Performance Optimizations

### 1. Query Planner

Optimize query execution based on filter analysis:

```typescript
interface QueryPlanner {
  analyze(query: CanvasQueryInput): QueryPlan;
  optimize(plan: QueryPlan): OptimizedPlan;
  execute(plan: OptimizedPlan): AsyncIterable<QueryNode>;
}

interface QueryPlan {
  // Execution strategy
  strategy: 'spatial-first' | 'type-first' | 'id-direct' | 'full-scan';

  // Index usage
  indexes: IndexUsage[];

  // Estimated cost
  estimatedCost: number;
  estimatedResults: number;

  // Pipeline stages
  stages: PipelineStage[];
}

type PipelineStage =
  | { type: 'spatial-filter'; bounds: BoundingBox }
  | { type: 'type-filter'; types: string[] }
  | { type: 'component-filter'; conditions: any }
  | { type: 'semantic-classify'; roles: SemanticRole[] }
  | { type: 'relationship-resolve'; spec: RelationshipQuery }
  | { type: 'project'; fields: string[] }
  | { type: 'aggregate'; spec: AggregateSpec }
  | { type: 'sort'; orderBy: OrderSpec }
  | { type: 'limit'; count: number; offset?: number };
```

**Optimization strategies**:

| Query Type | Strategy | Performance |
|------------|----------|-------------|
| By ID(s) | `id-direct` | O(1) per ID |
| By bounding box | `spatial-first` | O(log n) via R-tree |
| By type only | `type-first` | O(k) where k = matching |
| By type + spatial | `spatial-first` → `type-filter` | O(log n + k) |
| Complex filter | `full-scan` with early exit | O(n) worst case |

### 2. Query Result Caching

Cross-request caching with smart invalidation:

```typescript
interface QueryCache {
  // Cache storage
  cache: Map<string, CachedResult>;

  // Cache key generation
  generateKey(query: CanvasQueryInput): string;

  // Invalidation
  invalidateByEntity(entityId: string): void;
  invalidateByType(type: string): void;
  invalidateByBounds(bounds: BoundingBox): void;
  invalidateAll(): void;

  // TTL management
  ttl: number;  // Default: 5000ms
  maxEntries: number;  // Default: 100
}

interface CachedResult {
  query: CanvasQueryInput;
  result: CanvasQueryOutput;
  timestamp: number;
  hitCount: number;
  entityVersions: Map<string, number>;  // For invalidation
}
```

**Cache invalidation rules**:

| Canvas Operation | Invalidation Scope |
|-----------------|-------------------|
| Entity created | Queries matching new entity's type/bounds |
| Entity deleted | Queries containing deleted entity |
| Entity moved | Spatial queries intersecting old/new bounds |
| Entity property change | Queries filtering on changed property |
| Hierarchy change | Queries with hierarchy filters |

### 3. Streaming Results

For large result sets, stream results progressively:

```typescript
interface StreamingQuery {
  // Enable streaming
  stream: true;

  // Chunk configuration
  chunkSize?: number;  // Default: 50

  // Progress callback
  onProgress?: (progress: StreamProgress) => void;
}

interface StreamProgress {
  processed: number;
  total: number;
  percentage: number;
  currentChunk: QueryNode[];
}

// Usage
const stream = canvas_query({
  where: { type: 'text' },
  stream: true,
  chunkSize: 100
});

for await (const chunk of stream) {
  // Process 100 elements at a time
  processElements(chunk.nodes);
}
```

### 4. Query Hints

Allow agents to provide optimization hints:

```typescript
interface QueryHints {
  // Expected result size
  expectedCount?: 'few' | 'many' | number;

  // Index preference
  preferIndex?: 'spatial' | 'type' | 'none';

  // Caching
  skipCache?: boolean;
  cacheResult?: boolean;
  cacheTTL?: number;

  // Execution
  timeout?: number;
  maxScan?: number;  // Stop after scanning N entities

  // Debugging
  explain?: boolean;  // Return query plan
}
```

### 5. Batch Mutation API

Enhanced batch operations:

```typescript
interface CanvasMutateInput {
  // Multiple operations in single transaction
  operations: MutationOperation[];

  // Transaction options
  atomic?: boolean;        // All-or-nothing (default: true)
  ordered?: boolean;       // Execute in order (default: true)
  continueOnError?: boolean;

  // Performance
  skipValidation?: boolean;
  skipRender?: boolean;    // Defer rendering until complete

  // Hooks
  beforeEach?: (op: MutationOperation) => MutationOperation | null;
  afterEach?: (result: MutationResult) => void;
}

type MutationOperation =
  | { op: 'create'; element: V3Element; parentId?: string }
  | { op: 'update'; target: string | QueryFilter; changes: Partial<V3Element> }
  | { op: 'delete'; target: string | QueryFilter }
  | { op: 'move'; target: string | QueryFilter; delta: { dx?: number; dy?: number } }
  | { op: 'reparent'; target: string; newParent: string; index?: number }
  | { op: 'reorder'; target: string; position: 'front' | 'back' | number };
```

**Example - Batch with mixed operations**:

```typescript
// Single call: Create frame, add elements, connect with arrows
await canvas_mutate({
  operations: [
    { op: 'create', element: { type: 'frame', x: 0, y: 0, w: 400, h: 300 }, id: 'frame-1' },
    { op: 'create', element: { type: 'rectangle', x: 50, y: 50, w: 100, h: 40 }, parentId: 'frame-1' },
    { op: 'create', element: { type: 'rectangle', x: 250, y: 50, w: 100, h: 40 }, parentId: 'frame-1' },
    { op: 'create', element: { type: 'arrow', from: '$1', to: '$2' } },  // Reference by index
    { op: 'update', target: { type: 'rectangle' }, changes: { fill: '#e3f2fd' } }
  ],
  atomic: true
});
```

---

## Implementation Plan

### Phase 1: Foundation (Week 1-2)

**Goals**: Core query engine with projection and filtering

**Tasks**:
1. Implement `SelectionSpec` projection system
2. Enhance `QueryFilter` with all operators
3. Add `canvas_query` endpoint to canvas-driver
4. Add basic query caching layer
5. Write unit tests for all filter operators

**Files to modify**:
- `packages/canvas-driver/src/api.v3.ts` - Add new types
- `packages/canvas-driver/src/query/` - New directory for query engine
- `packages/canvas-driver/src/CanvasDriverSimulator.ts` - Implement new query
- `packages/canvas-mcp/src/tools.ts` - Expose new tool

### Phase 2: Optimization (Week 3-4)

**Goals**: Query planning, caching, and streaming

**Tasks**:
1. Implement QueryPlanner with strategy selection
2. Add cross-request QueryCache with smart invalidation
3. Implement streaming results for large datasets
4. Add query hints support
5. Performance benchmarks and optimization

**Files to modify**:
- `packages/canvas-driver/src/query/QueryPlanner.ts` - New file
- `packages/canvas-driver/src/query/QueryCache.ts` - New file
- `packages/canvas-driver/src/query/StreamingQuery.ts` - New file

### Phase 3: Semantic Layer (Week 5-6)

**Goals**: Role detection and relationship queries

**Tasks**:
1. Implement RoleDetector with rule-based classification
2. Add semantic role rules for common UI elements
3. Implement RelationshipQuery resolver
4. Add ContextQuery for spatial/semantic context
5. Integration tests with real canvas data

**Files to modify**:
- `packages/canvas-driver/src/semantic/` - Enhance existing
- `packages/canvas-driver/src/semantic/RoleDetector.ts` - New file
- `packages/canvas-driver/src/semantic/RelationshipResolver.ts` - New file

### Phase 4: Integration (Week 7-8)

**Goals**: AI agent integration and documentation

**Tasks**:
1. Update ai-agents package to use new query API
2. Update canvas-mcp tools documentation
3. Add query builder helpers for common patterns
4. Performance testing with 10K+ element canvases
5. Documentation and examples

**Files to modify**:
- `packages/ai-agents/src/tools/` - Update tool implementations
- `packages/canvas-mcp/src/tools.ts` - Update tool schemas
- `docs/engineering/` - Add query API documentation

---

## Migration Strategy

### Backwards Compatibility

The new `canvas_query` API supplements existing V3 API operations:

| Current API | New API | Behavior |
|-------------|---------|----------|
| `canvas_read` | `canvas_query` | Read becomes query with `select: { preset: 'full' }` |
| `canvas_find` | `canvas_query` | Find becomes query with `select: { preset: 'minimal' }` |
| `canvas_edit` | `canvas_mutate` | Edit enhanced with batch support |
| `canvas_write` | `canvas_mutate` | Write becomes mutate with `op: 'create'` |

### Deprecation Path

1. **Phase 1**: Add new APIs alongside existing
2. **Phase 2**: Add deprecation warnings to old APIs
3. **Phase 3**: Update all agent tools to use new APIs
4. **Phase 4**: Remove old APIs (major version bump)

### Agent Migration

```typescript
// Before: Multiple calls
const rects = await canvas_find({ type: 'rectangle' });
const detailed = await canvas_read({ target: rects.ids });

// After: Single call
const result = await canvas_query({
  where: { type: 'rectangle' },
  select: { preset: 'standard' }
});
```

---

## Appendix A: Complete Type Definitions

```typescript
// packages/canvas-driver/src/types/query.ts

export interface CanvasQueryInput {
  // Selection
  where?: QueryFilter;
  target?: string | string[];

  // Projection
  select?: SelectionSpec;
  include?: IncludeSpec;

  // Semantic
  semantic?: SemanticQuery;

  // Aggregation
  aggregate?: AggregateSpec;
  groupBy?: string | string[];

  // Ordering
  orderBy?: OrderSpec;

  // Pagination
  limit?: number;
  offset?: number;
  cursor?: string;

  // Performance
  hints?: QueryHints;
  stream?: boolean;
  cache?: CacheOptions;
}

export interface CanvasQueryOutput {
  nodes?: QueryNode[];
  count?: number;
  aggregations?: AggregationResults;
  groups?: GroupedResults;
  hasMore?: boolean;
  cursor?: string;
  total?: number;
  cached?: boolean;
  executionTime?: number;
  queryPlan?: QueryPlanInfo;
}

export interface QueryNode {
  id: string;
  type: string;
  [key: string]: any;
  _meta?: {
    role?: SemanticRole;
    confidence?: number;
    relationships?: RelationshipData;
  };
}

export interface SelectionSpec {
  fields?: string[];
  exclude?: string[];
  preset?: 'minimal' | 'standard' | 'full' | 'position' | 'style';
  computed?: ComputedField[];
}

export interface IncludeSpec {
  parent?: boolean | SelectionSpec;
  children?: boolean | SelectionSpec | { depth?: number };
  ancestors?: boolean | { depth?: number };
  descendants?: boolean | { depth?: number };
  siblings?: boolean;
  connectedTo?: boolean;
  connectedFrom?: boolean;
  boundTo?: boolean;
  overlapping?: boolean;
  nearby?: { distance: number };
  containing?: boolean;
  containedBy?: boolean;
}

export interface QueryFilter {
  type?: string | string[];
  $text?: TextSearch;
  $geo?: GeoFilter;
  $hierarchy?: HierarchyFilter;
  $state?: StateFilter;
  $and?: QueryFilter[];
  $or?: QueryFilter[];
  $not?: QueryFilter;
  [property: string]: FilterValue | FilterOperator | any;
}

export interface SemanticQuery {
  role?: SemanticRole | SemanticRole[];
  relationship?: RelationshipQuery;
  context?: ContextQuery;
  pattern?: PatternQuery;
}

export type SemanticRole =
  | 'button' | 'input' | 'label' | 'heading' | 'container'
  | 'navigation' | 'card' | 'icon' | 'image' | 'divider'
  | 'badge' | 'tooltip' | 'modal' | 'form' | 'list'
  | 'list-item' | 'table' | 'chart' | 'annotation';

export interface AggregateSpec {
  count?: boolean;
  countBy?: string;
  bounds?: boolean;
  center?: boolean;
  area?: boolean;
  sum?: string | string[];
  avg?: string | string[];
  min?: string | string[];
  max?: string | string[];
  histogram?: { field: string; buckets: number };
  stats?: string[];
}

export interface QueryHints {
  expectedCount?: 'few' | 'many' | number;
  preferIndex?: 'spatial' | 'type' | 'none';
  skipCache?: boolean;
  cacheResult?: boolean;
  cacheTTL?: number;
  timeout?: number;
  maxScan?: number;
  explain?: boolean;
}
```

---

## Appendix B: Example Queries

### Basic Queries

```typescript
// Get all rectangles
await canvas_query({ where: { type: 'rectangle' } });

// Get specific elements by ID
await canvas_query({ target: ['id-1', 'id-2', 'id-3'] });

// Get selected elements
await canvas_query({ where: { $state: { selected: true } } });
```

### Projected Queries

```typescript
// Minimal projection (just IDs and types)
await canvas_query({
  where: { type: 'text' },
  select: { preset: 'minimal' }
});

// Custom fields
await canvas_query({
  where: { type: 'rectangle' },
  select: { fields: ['id', 'x', 'y', 'fill', 'text'] }
});
```

### Spatial Queries

```typescript
// Elements within viewport
await canvas_query({
  where: {
    $geo: { $within: { x: 0, y: 0, w: 1920, h: 1080 } }
  }
});

// Elements near a point
await canvas_query({
  where: {
    $geo: { $near: { x: 500, y: 500, maxDistance: 200 } }
  }
});
```

### Semantic Queries

```typescript
// Find all buttons
await canvas_query({
  semantic: { role: 'button' }
});

// Find form with all its inputs
await canvas_query({
  semantic: { role: 'form' },
  include: {
    descendants: { depth: 3 }
  }
});

// Find navigation elements in header
await canvas_query({
  semantic: {
    role: 'navigation',
    context: { region: 'header' }
  }
});
```

### Aggregation Queries

```typescript
// Canvas statistics
await canvas_query({
  aggregate: {
    count: true,
    countBy: 'type',
    bounds: true
  }
});

// Size distribution
await canvas_query({
  where: { type: 'rectangle' },
  aggregate: {
    stats: ['width', 'height'],
    histogram: { field: 'width', buckets: 10 }
  }
});
```

### Complex Queries

```typescript
// Find buttons with "Submit" text, in forms, sorted by position
await canvas_query({
  semantic: { role: 'button' },
  where: {
    $text: { search: 'Submit', mode: 'contains' }
  },
  include: {
    ancestors: { depth: 2 }  // Get containing form
  },
  orderBy: { y: 'asc', x: 'asc' },
  select: { preset: 'standard' }
});

// Find all connected components from start node
await canvas_query({
  semantic: {
    relationship: {
      flowsFrom: 'start-node'
    }
  },
  include: {
    connectedTo: true
  }
});
```

---

## Appendix C: Performance Comparison

### Query Performance (1000 elements)

| Query Type | Current | Proposed | Improvement |
|------------|---------|----------|-------------|
| By type | 2 calls, ~10ms | 1 call, ~3ms | 3.3x |
| By type + text | 3 calls, ~50ms | 1 call, ~5ms | 10x |
| Spatial + filter | 3 calls, ~30ms | 1 call, ~2ms | 15x |
| Semantic (role) | N/A | 1 call, ~10ms | New capability |
| Relationship | N/A | 1 call, ~15ms | New capability |

### Token Usage (1000 elements)

| Query Type | Current | Proposed | Reduction |
|------------|---------|----------|-----------|
| Full read | ~50K tokens | ~50K tokens | 0% |
| Minimal read | ~50K tokens | ~5K tokens | 90% |
| Count only | ~50K tokens | ~100 tokens | 99.8% |
| Aggregation | ~50K tokens | ~500 tokens | 99% |

---

## Appendix D: Open Questions

1. **ML-based Role Detection**: Should we include a lightweight ML model for semantic role classification, or stick with rule-based detection?

2. **Real-time Updates**: Should `canvas_query` support subscription mode for real-time results?

3. **Custom Aggregations**: Should we allow agents to define custom aggregation functions?

4. **Query Language**: Should we define a text-based query language (like GraphQL or SQL) in addition to the JSON API?

5. **Cross-Canvas Queries**: Should queries support searching across multiple canvas instances?

---

## References

- [ECS Architecture Documentation](./ecs/index.md)
- [Canvas Driver V3 API](../../packages/canvas-driver/docs/README.md)
- [Canvas MCP Tools](../../packages/canvas-mcp/src/tools.ts)
- [AI Agents Architecture](./mastra/)
