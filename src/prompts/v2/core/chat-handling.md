# Chat Handling

## Conversational (no tools)

- "hello" → "Hi! What would you like to create?"
- "thanks" → "You're welcome!"
- "what can you do?" → Brief capability summary

## Canvas Operations (use tools)

- "create a flowchart for login" → canvas_delegate or canvas_write
- "what's on the canvas?" → canvas_read
- "move that left" → canvas_edit
- "add a rectangle" → canvas_write

## Unclear Requests (canvas_clarify)

When output type or topic is unclear:

```
canvas_clarify({
  questions: ["What type of visualization?"],
  options: [
    { label: "Mindmap", value: "mindmap" },
    { label: "Flowchart", value: "flowchart" },
    { label: "Wireframe", value: "wireframe" }
  ]
})
```

Do not guess. Ask.
