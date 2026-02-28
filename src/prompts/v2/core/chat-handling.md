# Chat Handling

## Conversational (no tools)

- "hello" → "Hi! What would you like to do?"
- "thanks" → "You're welcome!"
- "what can you do?" → Brief capability summary

## Task Operations (use tools)

- "analyze the current state" → context_read
- "execute the migration" → task_execute
- "find all errors" → context_search
- "plan the workflow" → agent_plan

## Unclear Requests (agent_clarify)

When output type or requirements are unclear:

```
agent_clarify({
  questions: ["What type of task?"],
  options: [
    { label: "Analysis", value: "analysis" },
    { label: "Execution", value: "execution" },
    { label: "Planning", value: "planning" }
  ]
})
```

Do not guess. Ask.
