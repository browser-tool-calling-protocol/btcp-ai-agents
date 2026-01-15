# Adapting Claude Code Patterns to Google ADK

This guide shows how to implement Claude Code's successful patterns using Google's Agent Development Kit (ADK).

## Pattern Mapping Overview

| Claude Code Pattern | Google ADK Implementation |
|--------------------|-----------------------------|
| 7 minimal tools | Python functions with docstrings |
| Skills (auto-inject) | Dynamic instruction injection via `before_agent_callback` |
| XML reasoning tags | Prompt engineering (same approach) |
| Streaming generators | `Runner.run_async()` with event iteration |
| Pre/post hooks | `before_agent_callback` / `after_agent_callback` |
| Task sub-agents | `sub_agents` parameter + `transfer_to_agent` |
| Stateless resources | `tool_context.state` dictionary |
| Session persistence | `SessionService` implementations |

---

## Part 1: The 5 Canvas Tools in ADK

### Tool Implementation Pattern

```python
# packages/waiboard-agents/src/tools/canvas_tools.py

import httpx
from typing import Optional, Literal
from google.adk.tools import ToolContext

CANVAS_MCP_URL = "http://localhost:3112"


async def canvas_read(
    target: Optional[str] = None,
    format: Literal["json", "xml", "ascii"] = "json",
    include_children: bool = True,
    tool_context: ToolContext = None
) -> dict:
    """
    Read canvas tree or specific element as structured data.

    Like Claude Code's Read tool - get current state before making changes.

    Args:
        target: Element ID to read, or None for entire canvas.
                Use "selected" to read current selection.
        format: Output format:
                - "json": Structured tree (default, best for processing)
                - "xml": SVG-compatible XML (can preview in browser)
                - "ascii": Human-readable tree (good for reasoning)
        include_children: Whether to include nested children (default True)

    Returns:
        Dict with canvas tree, element count, and version for optimistic locking.

    Examples:
        - Read entire canvas: canvas_read()
        - Read specific frame: canvas_read(target="frame-1")
        - Read selection as XML: canvas_read(target="selected", format="xml")
    """
    canvas_id = tool_context.state.get("canvas_id")

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            f"{CANVAS_MCP_URL}/api/mcp/tools/canvas_read",
            json={
                "canvasId": canvas_id,
                "target": target,
                "format": format,
                "include": {"children": include_children}
            }
        )
        result = response.json()

    # Track read in state for context building
    tool_context.state["last_read"] = {
        "target": target,
        "element_count": result.get("elementCount", 0),
        "version": result.get("version")
    }

    return result


async def canvas_write(
    tree: dict | list,
    target: Optional[str] = None,
    mode: Literal["append", "replace", "merge"] = "append",
    layout: Optional[dict] = None,
    clear: bool = False,
    tool_context: ToolContext = None
) -> dict:
    """
    Create or replace canvas elements. Like Claude Code's Write tool.

    Use for creating new structures - diagrams, wireframes, layouts.
    For small changes to existing elements, prefer canvas_edit instead.

    Args:
        tree: Element tree to create. Can be single element or array.
              Each element needs: type, x, y, width, height.
              Optional: id, fill, stroke, children, text, etc.
        target: Parent element ID to write into. None = canvas root.
        mode: How to handle existing content:
              - "append": Add to existing children (default)
              - "replace": Remove existing children first
              - "merge": Diff-based update, only apply changes
        layout: Auto-layout options, e.g., {"type": "grid", "columns": 3}
        clear: If True, clear entire canvas/target first

    Returns:
        Dict with created element IDs and operation status.

    Examples:
        - Create frame with children:
          canvas_write(tree={"type": "frame", "x": 0, "y": 0,
                            "width": 400, "height": 300,
                            "children": [...]})
        - Replace frame contents:
          canvas_write(tree=[...], target="frame-1", mode="replace")
        - Auto-layout grid:
          canvas_write(tree=[...], layout={"type": "grid", "columns": 3, "gap": 16})
    """
    canvas_id = tool_context.state.get("canvas_id")
    version = tool_context.state.get("last_read", {}).get("version")

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            f"{CANVAS_MCP_URL}/api/mcp/tools/canvas_write",
            json={
                "canvasId": canvas_id,
                "tree": tree,
                "target": target,
                "mode": mode,
                "layout": layout,
                "clear": clear,
                "version": version  # Optimistic locking
            }
        )
        result = response.json()

    # Track created elements
    if result.get("success"):
        created = tool_context.state.get("elements_created", [])
        created.extend(result.get("created_ids", []))
        tool_context.state["elements_created"] = created
        tool_context.state["operation_count"] = tool_context.state.get("operation_count", 0) + 1

    return result


async def canvas_edit(
    target: str | dict,
    set_props: Optional[dict] = None,
    move: Optional[dict] = None,
    resize: Optional[dict] = None,
    rotate: Optional[float] = None,
    delete: bool = False,
    reparent: Optional[str] = None,
    tool_context: ToolContext = None
) -> dict:
    """
    Make precise, incremental changes. Like Claude Code's Edit tool.

    Best for modifying existing elements - no need to read first for
    relative operations (move, resize, rotate).

    Args:
        target: Element ID string, or filter dict like {"type": "text"}.
                Use "selected" to edit current selection.
        set_props: Properties to set directly, e.g., {"fill": "#3B82F6"}
        move: Relative movement, e.g., {"dx": 50, "dy": 0}
        resize: Relative resize, e.g., {"dw": 100} or {"scale": 1.5}
        rotate: Rotation in degrees (relative to current)
        delete: If True, delete the target element(s)
        reparent: Move element to new parent ID

    Returns:
        Dict with modified element IDs and operation status.

    Examples:
        - Change color: canvas_edit(target="rect-1", set_props={"fill": "#EF4444"})
        - Move right: canvas_edit(target="rect-1", move={"dx": 100})
        - Delete: canvas_edit(target="rect-1", delete=True)
        - Batch edit by type: canvas_edit(target={"type": "text"},
                                          set_props={"fontSize": 16})
    """
    canvas_id = tool_context.state.get("canvas_id")

    operation = {}
    if set_props:
        operation["set"] = set_props
    if move:
        operation["move"] = move
    if resize:
        operation["resize"] = resize
    if rotate is not None:
        operation["rotate"] = rotate
    if delete:
        operation["delete"] = True
    if reparent:
        operation["reparent"] = {"to": reparent}

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            f"{CANVAS_MCP_URL}/api/mcp/tools/canvas_edit",
            json={
                "canvasId": canvas_id,
                "operations": [{"target": target, **operation}]
            }
        )
        result = response.json()

    if result.get("success"):
        tool_context.state["operation_count"] = tool_context.state.get("operation_count", 0) + 1

    return result


async def canvas_find(
    match: dict,
    return_format: Literal["ids", "summary", "tree", "full"] = "ids",
    sort: Optional[str] = None,
    limit: int = 50,
    aggregate: Optional[dict] = None,
    tool_context: ToolContext = None
) -> dict:
    """
    Search canvas elements by pattern. Like Claude Code's Grep tool.

    Returns minimal data by default (IDs only) to save tokens.
    Use before canvas_edit to find elements matching criteria.

    Args:
        match: Filter criteria. Examples:
               - {"type": "rectangle"}
               - {"type": ["rect", "ellipse"]}
               - {"text": {"contains": "Login"}}
               - {"class": "card"}
               - {"parent": "frame-1"}
               - {"selected": True}
               - {"$geo": {"$within": {"x": 0, "y": 0, "w": 500, "h": 500}}}
        return_format: What to return:
               - "ids": Just element IDs (default, minimal tokens)
               - "summary": ID + type + bounds
               - "tree": Hierarchical structure
               - "full": Complete element data
        sort: Sort order: "$position", "$zIndex", "$area", or {"x": 1}
        limit: Maximum results (default 50)
        aggregate: Get statistics instead:
               - {"count": True}
               - {"countBy": "type"}
               - {"bounds": True}

    Returns:
        Dict with matching elements or aggregation results.

    Examples:
        - Find all text: canvas_find(match={"type": "text"})
        - Count by type: canvas_find(match={}, aggregate={"countBy": "type"})
        - Find in region: canvas_find(match={"$geo": {"$within": {...}}})
    """
    canvas_id = tool_context.state.get("canvas_id")

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            f"{CANVAS_MCP_URL}/api/mcp/tools/canvas_find",
            json={
                "canvasId": canvas_id,
                "match": match,
                "return": return_format,
                "sort": sort,
                "limit": limit,
                "aggregate": aggregate
            }
        )
        return response.json()


async def canvas_capture(
    target: Optional[str] = None,
    selection: bool = False,
    format: Literal["png", "jpeg", "webp"] = "png",
    scale: float = 1.0,
    quality: float = 0.9,
    background: bool = True,
    tool_context: ToolContext = None
) -> dict:
    """
    Export canvas to base64 image for vision analysis.

    Use to verify visual output or analyze existing designs.
    Supports feeding result to vision models (GPT-4V, Gemini, Claude).

    Args:
        target: Element ID to capture, or None for viewport
        selection: If True, capture current selection bounds
        format: Image format - "png" (lossless), "jpeg", "webp"
        scale: Resolution multiplier (2.0 for retina)
        quality: JPEG/WebP quality 0.0-1.0
        background: Include canvas background

    Returns:
        Dict with base64 image data, dimensions, and file size.

    Examples:
        - Capture viewport: canvas_capture()
        - Capture selection: canvas_capture(selection=True)
        - High-res PNG: canvas_capture(scale=2.0)
    """
    canvas_id = tool_context.state.get("canvas_id")

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            f"{CANVAS_MCP_URL}/api/mcp/tools/canvas_capture",
            json={
                "canvasId": canvas_id,
                "target": target,
                "selection": selection,
                "format": format,
                "scale": scale,
                "quality": quality,
                "background": background
            }
        )
        return response.json()


# Export all tools as a list for Agent registration
CANVAS_TOOLS = [
    canvas_read,
    canvas_write,
    canvas_edit,
    canvas_find,
    canvas_capture
]
```

---

## Part 2: Skills via Dynamic Instruction Injection

### Skills Definition

```python
# packages/waiboard-agents/src/skills/definitions.py

from dataclasses import dataclass
from typing import List


@dataclass
class Skill:
    """A skill that injects expert knowledge into agent instructions."""
    name: str
    triggers: List[str]  # Keywords that activate this skill
    knowledge: str       # Expert knowledge to inject


CANVAS_SKILLS = [
    Skill(
        name="diagram",
        triggers=["flowchart", "diagram", "process", "architecture", "sequence", "workflow"],
        knowledge="""
## Diagram Expert Knowledge

**Layout Rules:**
- Tree layout for hierarchies, dagre for flowcharts
- 40px minimum gap between nodes
- Flow direction: top-to-bottom (TB) or left-to-right (LR)
- Maximum 7±2 nodes per level (cognitive load limit)

**Node Types & Colors:**
- Process (rectangle, #3B82F6 blue): Actions, steps
- Decision (diamond, #F59E0B amber): Branch points
- Terminal (rounded rect, #6B7280 gray): Start/end
- Data (parallelogram, #10B981 green): Input/output
- Subprocess (double-border rect, #8B5CF6 purple): Nested processes

**Connection Rules:**
- Arrows follow primary flow direction
- Label decision branches with conditions (Yes/No, True/False)
- Avoid crossing lines - reroute if needed
- Use consistent arrow styles (solid for flow, dashed for data)

**Best Practices:**
- Start with canvas_read() to check existing elements
- Create all nodes first with canvas_write()
- Add connections after nodes are positioned
- Use canvas_find() to get node IDs for connections
"""
    ),

    Skill(
        name="wireframe",
        triggers=["wireframe", "mockup", "UI", "interface", "screen", "app", "mobile", "desktop"],
        knowledge="""
## Wireframe Expert Knowledge

**Grid System:**
- 8px base unit for all spacing
- 16px component gaps, 24px section gaps
- Standard widths: Mobile 375px, Tablet 768px, Desktop 1440px

**Visual Language:**
- Gray boxes (#E5E5E5) for image placeholders
- Blue (#3B82F6) for interactive elements (buttons, links)
- Horizontal lines for text content (not lorem ipsum)
- Consistent 8px corner radius

**Component Patterns:**
- Navigation: 64px top bar or 280px side drawer
- Cards: 16px internal padding, 1px border or subtle shadow
- Forms: Labels above inputs, 8px label-input gap
- Buttons: Min 44px height for touch targets, 16px horizontal padding
- Lists: 48-72px row height, 16px left padding

**Layout Structure:**
- Use frames as containers for sections
- Name frames descriptively: "Header", "Sidebar", "Content", "Footer"
- Nest components inside their parent frames
- Leave 24px margin from viewport edges

**Creation Order:**
1. Create main frame containers first
2. Add navigation elements
3. Build content sections
4. Add interactive elements last
"""
    ),

    Skill(
        name="moodboard",
        triggers=["moodboard", "inspiration", "collage", "visual", "aesthetic", "brand", "style"],
        knowledge="""
## Moodboard Expert Knowledge

**Layout Styles:**
- Masonry: Varied heights, aligned columns
- Scattered: Organic placement, slight overlaps OK
- Grid: Uniform cells with consistent gaps
- Collage: Layered images at angles

**Composition Rules:**
- 1 hero image (2-3x larger, attention anchor)
- 3-5 supporting images (varied sizes)
- Color palette swatches (5-7 colors)
- Typography samples if relevant
- Texture/pattern samples for tactile feel

**Size Hierarchy:**
- Hero: 400-600px width
- Large supporting: 250-350px
- Small supporting: 150-200px
- Swatches: 60-80px squares

**Spacing:**
- 8-16px gaps (tighter = more energy)
- Slight overlaps acceptable for collage feel
- Group by theme, not by size

**Color Extraction:**
- Sample 5-7 dominant colors from hero image
- Include: Primary, secondary, accent, neutral, text
- Show as row of squares below images

**Best Practices:**
- Start with hero image placement
- Arrange supporting images around hero
- Add color swatches at bottom or side
- Use frames to group related items
"""
    ),

    Skill(
        name="storyboard",
        triggers=["storyboard", "sequence", "narrative", "scene", "story", "comic", "frame-by-frame"],
        knowledge="""
## Storyboard Expert Knowledge

**Panel Layout:**
- 16:9 aspect ratio for video/film
- 4:3 for traditional/TV
- 1:1 for social media
- Consistent panel size throughout

**Panel Structure:**
- Scene number (top-left)
- Main illustration area (center)
- Action description (bottom)
- Camera/transition notes (margins)

**Visual Storytelling:**
- Establish shot → Medium → Close-up flow
- 180-degree rule for continuity
- Lead room for moving subjects
- Eyeline matches between panels

**Standard Sizes:**
- Panel: 320x180px (16:9) or 240x180px (4:3)
- 24px gap between panels
- 3-4 panels per row
- Number in sequence (1, 2, 3...)

**Annotations:**
- Camera: WS (wide), MS (medium), CU (close-up), ECU (extreme close-up)
- Movement: PAN, TILT, ZOOM, DOLLY, TRACK
- Transitions: CUT, FADE, DISSOLVE, WIPE

**Creation Order:**
1. Create panel grid with canvas_write()
2. Add scene numbers
3. Sketch compositions
4. Add action descriptions
5. Note camera directions
"""
    )
]


def find_matching_skills(task: str) -> List[Skill]:
    """Find skills whose triggers match the task."""
    task_lower = task.lower()
    return [
        skill for skill in CANVAS_SKILLS
        if any(trigger in task_lower for trigger in skill.triggers)
    ]


def inject_skills(base_instruction: str, task: str) -> str:
    """Inject relevant skill knowledge into agent instructions."""
    matching = find_matching_skills(task)

    if not matching:
        return base_instruction

    skill_content = "\n\n---\n\n".join(skill.knowledge for skill in matching)

    return f"""{base_instruction}

---

## Activated Expert Knowledge

The following specialized knowledge has been activated based on your task:

{skill_content}

Use this knowledge to guide your decisions about layout, styling, and structure.
"""
```

### Before-Agent Callback for Skill Injection

```python
# packages/waiboard-agents/src/callbacks/skill_injection.py

from google.adk.agents import Agent
from google.adk.events import Event
from google.genai import types

from ..skills.definitions import inject_skills


def create_skill_injection_callback(base_instruction: str):
    """
    Create a before_agent_callback that dynamically injects skills.

    This implements Claude Code's "skills" pattern where expert knowledge
    is automatically injected based on task keywords.
    """

    async def skill_injection_callback(
        callback_context  # ADK provides this automatically
    ) -> types.Content | None:
        """
        Intercept before agent runs to inject relevant skills.

        Returns None to continue normal execution with modified instruction,
        or Content to skip agent and return directly.
        """
        # Get the user's message from the event
        invocation_context = callback_context.invocation_context
        user_message = ""

        # Extract user message from recent events
        for event in reversed(invocation_context.session.events):
            if event.author == "user":
                user_message = event.content.parts[0].text if event.content else ""
                break

        if not user_message:
            return None  # No modification needed

        # Inject skills into the agent's instruction
        enhanced_instruction = inject_skills(base_instruction, user_message)

        # Update the agent's instruction dynamically
        # Note: This modifies the agent for this invocation only
        callback_context.agent.instruction = enhanced_instruction

        return None  # Continue with enhanced instruction

    return skill_injection_callback
```

---

## Part 3: The Canvas Agent with ADK

### Main Agent Definition

```python
# packages/waiboard-agents/src/agents/canvas_agent.py

from google.adk.agents import Agent
from google.genai import types

from ..tools.canvas_tools import CANVAS_TOOLS
from ..callbacks.skill_injection import create_skill_injection_callback
from ..callbacks.observability import create_observability_callbacks

# Base instruction with XML reasoning structure (Claude Code pattern)
CANVAS_AGENT_INSTRUCTION = """
You are an expert canvas manipulation agent for Waiboard, an AI-powered visual whiteboard.

## Your Capabilities
- Create elements: rectangles, ellipses, text, frames, arrows, images
- Build layouts: diagrams, wireframes, moodboards, storyboards
- Modify elements: move, resize, restyle, delete, reparent
- Search and analyze: find by type, text, position, or properties

## Reasoning Process

For every request, follow this structured reasoning:

<analyze>
- What is the user asking for?
- What currently exists on the canvas? (use canvas_read if unsure)
- What constraints apply? (space, style, existing elements)
- What's the scope? (single element, multiple, entire canvas)
</analyze>

<plan>
- List the operations needed in execution order
- Identify which tool to use for each step:
  * canvas_read: Get current state
  * canvas_write: Create new structures
  * canvas_edit: Modify existing elements
  * canvas_find: Search for elements
  * canvas_capture: Visual verification
- Note any dependencies between steps
- Estimate positions and sizes needed
</plan>

<execute>
- Execute each planned operation
- Verify each step succeeded before continuing
- Adjust if you encounter conflicts or errors
- Track what you've created/modified
</execute>

<verify>
- Did the result match the user's intent?
- Are elements properly positioned (no overlaps unless intended)?
- Is styling consistent?
- Summarize what was created/modified
</verify>

## Element Types

| Type | Use For | Key Properties |
|------|---------|----------------|
| rectangle | Boxes, cards, buttons | fill, stroke, cornerRadius |
| ellipse | Circles, ovals | fill, stroke |
| text | Labels, headings, paragraphs | text, fontSize, fontFamily |
| frame | Containers, groups | children, name, background |
| arrow | Connections, flows | from, to, startArrow, endArrow |
| image | Pictures, icons | src (URL or base64) |

## Best Practices

1. **Read before write**: Use canvas_read() to understand context
2. **Batch operations**: Create related elements in one canvas_write() call
3. **Use frames**: Group related elements in named frames
4. **Consistent styling**: Match existing colors/fonts when extending
5. **Grid alignment**: Position elements on 8px grid
6. **Clear feedback**: Always report what you created/modified

## Error Handling

- If a tool returns an error, analyze the error message
- Try correcting the input and retry once
- If still failing, report the issue clearly to the user
- Never leave the user without feedback

## Response Format

After completing operations, always provide a concise summary:
- What was created/modified
- Element IDs for reference (if few elements)
- Any issues encountered
- Suggestions for next steps (if applicable)
"""


def create_canvas_agent(
    model: str = "gemini-2.5-flash",
    enable_observability: bool = True
) -> Agent:
    """
    Create the main canvas agent with Claude Code patterns.

    Features:
    - 5 minimal tools (read/write/edit/find/capture)
    - Dynamic skill injection via callback
    - XML reasoning structure in prompts
    - Observability hooks
    """

    callbacks = []

    # Skill injection callback (Claude Code pattern)
    callbacks.append(create_skill_injection_callback(CANVAS_AGENT_INSTRUCTION))

    # Observability callbacks
    if enable_observability:
        before_cb, after_cb = create_observability_callbacks()
        callbacks.append(before_cb)

    canvas_agent = Agent(
        name="canvas_agent",
        model=model,
        description="""
Expert canvas manipulation agent. Handles:
- Creating diagrams, flowcharts, wireframes, moodboards
- Modifying existing canvas elements
- Complex multi-element operations
- Visual design and layout tasks

Delegate to this agent for any canvas creation or modification task.
""",
        instruction=CANVAS_AGENT_INSTRUCTION,
        tools=CANVAS_TOOLS,
        output_key="canvas_result",  # Save output to session state
        before_agent_callback=callbacks if callbacks else None,
    )

    return canvas_agent
```

---

## Part 4: Sub-Agent Specialists (Task Pattern)

### Specialist Agents

```python
# packages/waiboard-agents/src/agents/specialists.py

from google.adk.agents import Agent
from ..tools.canvas_tools import canvas_read, canvas_find, canvas_edit, canvas_write


# Layout Specialist - Fast computation agent
layout_specialist = Agent(
    name="layout_specialist",
    model="gemini-2.0-flash",  # Fast model for computation
    description="""
Layout computation specialist. Use for:
- Calculating optimal element positions
- Auto-arranging elements in grids/trees/flows
- Resolving overlaps
- Centering and distributing elements
""",
    instruction="""
You are a layout computation specialist. Your job is to calculate optimal positions.

## Your Task
Given elements and a layout type, compute exact x, y, width, height for each element.

## Layout Types
- grid: Arrange in rows/columns with gaps
- tree: Hierarchical top-to-bottom or left-to-right
- flow: Flowchart with decision branches
- masonry: Pinterest-style varied heights
- center: Center elements in container
- distribute: Even spacing between elements

## Process
1. Use canvas_read() to get current element data
2. Calculate new positions based on layout type
3. Use canvas_edit() to apply positions
4. Return summary of changes

## Output
Return computed positions as structured data, then apply them.
Always use 8px grid alignment.
""",
    tools=[canvas_read, canvas_find, canvas_edit],
    output_key="layout_result"
)


# Style Specialist - Aesthetic design agent
style_specialist = Agent(
    name="style_specialist",
    model="gemini-2.5-flash",  # Better at aesthetics
    description="""
Style and theming specialist. Use for:
- Applying consistent color schemes
- Typography adjustments
- Visual polish and refinement
- Brand consistency
""",
    instruction="""
You are a visual design specialist focused on styling and aesthetics.

## Your Task
Apply consistent, professional styling to canvas elements.

## Design Principles
- 60-30-10 color rule (dominant, secondary, accent)
- Typography hierarchy (H1 > H2 > Body > Caption)
- Consistent spacing (8px grid)
- WCAG contrast ratios (4.5:1 minimum)

## Color Palettes
Professional: #1E293B, #3B82F6, #10B981, #F59E0B, #EF4444
Minimal: #000000, #FFFFFF, #6B7280, #E5E7EB
Vibrant: #7C3AED, #EC4899, #06B6D4, #84CC16

## Process
1. Use canvas_read() to analyze current styling
2. Identify inconsistencies
3. Apply cohesive styling with canvas_edit()
4. Report changes made

## Rules
- Preserve intentional style differences
- Match existing brand colors if present
- Don't change layout, only visual properties
""",
    tools=[canvas_read, canvas_find, canvas_edit],
    output_key="style_result"
)


# Connector Specialist - Arrow and relationship agent
connector_specialist = Agent(
    name="connector_specialist",
    model="gemini-2.0-flash",
    description="""
Connection specialist. Use for:
- Creating arrows between elements
- Drawing relationship lines
- Flowchart connections
- Dependency visualization
""",
    instruction="""
You are a connection specialist for creating arrows and relationships.

## Your Task
Create appropriate connections between canvas elements.

## Connection Types
- arrow: Directional connection with arrowhead
- line: Non-directional connection
- dashed: Represents optional or weak relationship
- double: Bidirectional relationship

## Process
1. Use canvas_find() to get element IDs and positions
2. Determine connection points (center, edges)
3. Use canvas_write() to create arrows
4. Avoid crossing other elements when possible

## Arrow Properties
- from: Source element ID
- to: Target element ID
- startArrow: none, arrow, diamond, circle
- endArrow: arrow (default), none, diamond, circle
- stroke: Line color
- strokeStyle: solid, dashed, dotted

## Best Practices
- Connect to element edges, not centers
- Route around obstacles
- Use consistent arrow styles
- Label important connections
""",
    tools=[canvas_read, canvas_find, canvas_write],
    output_key="connector_result"
)


SPECIALIST_AGENTS = [
    layout_specialist,
    style_specialist,
    connector_specialist
]
```

### Root Agent with Sub-Agents

```python
# packages/waiboard-agents/src/agents/root_agent.py

from google.adk.agents import Agent

from .canvas_agent import create_canvas_agent
from .specialists import SPECIALIST_AGENTS
from ..tools.canvas_tools import canvas_read, canvas_find


ROOT_AGENT_INSTRUCTION = """
You are Waiboard's AI assistant, the primary interface for visual canvas interactions.

## Your Role
- Handle all user requests related to the canvas
- Delegate complex operations to specialist agents
- Provide clear, helpful responses
- Guide users on canvas capabilities

## When to Handle Directly
- Simple questions about the canvas ("What's on the canvas?")
- Single element queries (use canvas_read or canvas_find)
- Explanations and guidance
- Simple single-step operations

## When to Delegate to canvas_agent
- Creating multiple elements (diagrams, wireframes, layouts)
- Complex modifications affecting multiple elements
- Any task requiring multiple tool calls
- Visual design and generation tasks

## When to Delegate to Specialists
After canvas_agent creates elements, you may delegate to:
- layout_specialist: Arrange elements in grid/tree/flow patterns
- style_specialist: Apply consistent colors, fonts, styling
- connector_specialist: Create arrows and connections

## Response Style
- Be concise and helpful
- Confirm what was done after delegations
- Provide element IDs when relevant
- Suggest next steps when appropriate

## Example Delegation
User: "Create a flowchart for user login"
→ Delegate to canvas_agent (complex creation)

User: "Arrange these elements in a grid"
→ Delegate to layout_specialist

User: "Make all buttons blue"
→ Delegate to style_specialist

User: "What's on the canvas?"
→ Handle directly with canvas_read
"""


def create_root_agent(model: str = "gemini-2.5-flash") -> Agent:
    """
    Create the root agent with sub-agents for delegation.

    Implements Claude Code's pattern:
    - Root handles simple queries directly
    - Delegates complex work to specialists
    - Uses ADK's native sub_agents for automatic routing
    """

    canvas_agent = create_canvas_agent(model=model)

    root_agent = Agent(
        name="waiboard_agent",
        model=model,
        description="Main Waiboard AI assistant for canvas interactions",
        instruction=ROOT_AGENT_INSTRUCTION,
        tools=[canvas_read, canvas_find],  # Light tools for simple queries
        sub_agents=[canvas_agent] + SPECIALIST_AGENTS,  # ADK handles delegation
        output_key="response"
    )

    return root_agent
```

---

## Part 5: Observability Callbacks (Hooks Pattern)

```python
# packages/waiboard-agents/src/callbacks/observability.py

import time
import logging
from typing import Optional, Tuple, Callable
from google.genai import types

logger = logging.getLogger("waiboard.agents")


class MetricsCollector:
    """Collect agent execution metrics."""

    def __init__(self):
        self.tool_calls = []
        self.agent_invocations = []
        self.errors = []

    def record_tool_call(self, tool: str, duration: float, success: bool):
        self.tool_calls.append({
            "tool": tool,
            "duration": duration,
            "success": success,
            "timestamp": time.time()
        })

    def record_agent_invocation(self, agent: str, duration: float):
        self.agent_invocations.append({
            "agent": agent,
            "duration": duration,
            "timestamp": time.time()
        })


# Global metrics collector
metrics = MetricsCollector()


def create_observability_callbacks() -> Tuple[Callable, Callable]:
    """
    Create before/after agent callbacks for observability.

    Implements Claude Code's hook pattern:
    - Log all agent invocations
    - Track timing metrics
    - Emit events for UI updates
    """

    async def before_agent_callback(callback_context) -> Optional[types.Content]:
        """Log before agent execution."""
        agent_name = callback_context.agent.name
        invocation_id = id(callback_context)

        logger.info(f"[{agent_name}] Starting invocation {invocation_id}")

        # Store start time in context for duration calculation
        callback_context.state["_start_time"] = time.time()
        callback_context.state["_invocation_id"] = invocation_id

        # Could emit SSE event here for UI
        # await emit_event("agent:start", {"agent": agent_name})

        return None  # Continue normal execution

    async def after_agent_callback(callback_context) -> Optional[types.Content]:
        """Log after agent execution."""
        agent_name = callback_context.agent.name
        start_time = callback_context.state.get("_start_time", time.time())
        duration = time.time() - start_time

        logger.info(f"[{agent_name}] Completed in {duration:.2f}s")

        # Record metrics
        metrics.record_agent_invocation(agent_name, duration)

        # Could emit SSE event here for UI
        # await emit_event("agent:complete", {
        #     "agent": agent_name,
        #     "duration": duration
        # })

        return None  # Don't modify output

    return before_agent_callback, after_agent_callback


def create_safety_callback():
    """
    Create a before_model_callback for input safety.

    Validates inputs before they reach the LLM.
    """

    async def safety_callback(callback_context) -> Optional[types.Content]:
        """Check for dangerous operations."""

        # Get the pending request
        # Note: Exact API depends on ADK version

        # Example: Block clear operations without confirmation
        # if "clear" in str(callback_context.request).lower():
        #     return types.Content(
        #         parts=[types.Part(text="Clear operation requires confirmation. "
        #                               "Please confirm you want to clear the canvas.")]
        #     )

        return None  # Allow request

    return safety_callback
```

---

## Part 6: Streaming Server with FastAPI

```python
# packages/waiboard-agents/src/server/main.py

from fastapi import FastAPI, Header, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import json

from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService

from ..agents.root_agent import create_root_agent

# Global instances
session_service = InMemorySessionService()
root_agent = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize agent on startup."""
    global root_agent
    root_agent = create_root_agent()
    yield
    # Cleanup if needed


app = FastAPI(title="Waiboard Agents", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/chat")
async def chat(
    message: str,
    canvas_id: str = Header(alias="X-Canvas-Id"),
    thread_id: str = Header(default="default", alias="X-Thread-Id")
):
    """
    Main chat endpoint with streaming response.

    Implements Claude Code's streaming pattern using SSE.
    """

    # Get or create session
    session = await session_service.get_session(
        app_name="waiboard",
        user_id="default",
        session_id=thread_id
    )

    if not session:
        session = await session_service.create_session(
            app_name="waiboard",
            user_id="default",
            session_id=thread_id,
            state={"canvas_id": canvas_id}
        )
    else:
        # Update canvas_id in case it changed
        session.state["canvas_id"] = canvas_id

    runner = Runner(
        agent=root_agent,
        app_name="waiboard",
        session_service=session_service
    )

    async def generate():
        """Stream events as SSE."""
        async for event in runner.run_async(
            user_id="default",
            session_id=thread_id,
            new_message=message
        ):
            # Format event for SSE
            event_data = {
                "type": event.type if hasattr(event, 'type') else "message",
                "author": event.author if hasattr(event, 'author') else "agent",
            }

            # Extract text content
            if hasattr(event, 'content') and event.content:
                for part in event.content.parts:
                    if hasattr(part, 'text'):
                        event_data["text"] = part.text
                        break

            yield f"data: {json.dumps(event_data)}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream"
    )


@app.websocket("/ws/{canvas_id}")
async def websocket_endpoint(websocket: WebSocket, canvas_id: str):
    """
    WebSocket endpoint for real-time bidirectional communication.

    Better for interactive canvas manipulation.
    """
    await websocket.accept()

    thread_id = f"ws_{canvas_id}_{id(websocket)}"

    # Create session for this WebSocket
    session = await session_service.create_session(
        app_name="waiboard",
        user_id="default",
        session_id=thread_id,
        state={"canvas_id": canvas_id}
    )

    runner = Runner(
        agent=root_agent,
        app_name="waiboard",
        session_service=session_service
    )

    try:
        while True:
            # Receive message from client
            data = await websocket.receive_json()
            message = data.get("message", "")

            # Stream response back
            async for event in runner.run_async(
                user_id="default",
                session_id=thread_id,
                new_message=message
            ):
                event_data = {"type": "event"}

                if hasattr(event, 'content') and event.content:
                    for part in event.content.parts:
                        if hasattr(part, 'text'):
                            event_data["text"] = part.text
                            break

                await websocket.send_json(event_data)

            # Signal completion
            await websocket.send_json({"type": "complete"})

    except WebSocketDisconnect:
        # Cleanup session
        pass


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "framework": "google-adk",
        "agent": root_agent.name if root_agent else None
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=4111)
```

---

## Part 7: Complete Project Structure

```
packages/waiboard-agents/
├── src/
│   ├── __init__.py
│   ├── agents/
│   │   ├── __init__.py
│   │   ├── root_agent.py          # Main entry point (delegator)
│   │   ├── canvas_agent.py        # Primary canvas manipulation
│   │   └── specialists.py         # Layout, Style, Connector agents
│   ├── tools/
│   │   ├── __init__.py
│   │   └── canvas_tools.py        # 5 canvas tools (read/write/edit/find/capture)
│   ├── skills/
│   │   ├── __init__.py
│   │   └── definitions.py         # Skill definitions and injection logic
│   ├── callbacks/
│   │   ├── __init__.py
│   │   ├── skill_injection.py     # Dynamic instruction enhancement
│   │   └── observability.py       # Logging, metrics, events
│   ├── context/
│   │   ├── __init__.py
│   │   └── manager.py             # Context compression (for scale)
│   └── server/
│       ├── __init__.py
│       └── main.py                # FastAPI server
├── tests/
│   ├── test_tools.py
│   ├── test_agents.py
│   └── test_skills.py
├── pyproject.toml
├── .env
└── Dockerfile
```

---

## Summary: Pattern Mapping Complete

| Claude Code | ADK Implementation | File |
|-------------|-------------------|------|
| 7 minimal tools | 5 Python functions with docstrings | `tools/canvas_tools.py` |
| Skills auto-inject | `before_agent_callback` + dynamic instruction | `callbacks/skill_injection.py` |
| XML reasoning | Same pattern in `instruction` string | `agents/canvas_agent.py` |
| Task sub-agents | `sub_agents` parameter | `agents/root_agent.py` |
| Pre/post hooks | `before_agent_callback` / `after_agent_callback` | `callbacks/observability.py` |
| Streaming | `Runner.run_async()` + SSE/WebSocket | `server/main.py` |
| Session state | `tool_context.state` | Tools access via `ToolContext` |

### Key ADK-Specific Adaptations

1. **Tools are Python functions**, not TypeScript. Use type hints and docstrings for LLM understanding.

2. **Skills inject via callback**, not middleware. Use `before_agent_callback` to modify instructions dynamically.

3. **Sub-agents use ADK's native routing** via `sub_agents` parameter. The LLM decides delegation based on `description` fields.

4. **State is in `tool_context.state`**, a dictionary that persists across tool calls within a session.

5. **Streaming uses `Runner.run_async()`** which yields events. Wrap in SSE or WebSocket for frontend.

### Sources

- [Google ADK Python Documentation](https://google.github.io/adk-docs/get-started/python/)
- [ADK Custom Tools Guide](https://google.github.io/adk-docs/tools-custom/)
- [ADK Agent Team Tutorial](https://google.github.io/adk-docs/tutorials/agent-team/)
- [ADK GitHub Repository](https://github.com/google/adk-python)
