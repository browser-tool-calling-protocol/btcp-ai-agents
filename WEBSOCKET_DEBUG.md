# WebSocket Debug Logging Added

I've added comprehensive debug logging to trace the complete WebSocket message flow between Canvas MCP server and browser.

## Changes Made

### Browser-Side (`packages/canvas-client/src/client/CanvasRPCHandler.ts`)

Added logging to track:
- 📨 **Received messages** - Raw WebSocket data coming from server
- 📋 **Parsed messages** - Parsed JSON message structure
- 🔍 **Message processing** - Type of message being handled
- 🎯 **Command handling** - Method and params being executed
- 🔧 **Command normalization** - Cleaned command name (removes `canvas.` prefix)
- ✏️/🔄/🗑️/🔍 **Operation logs** - Specific operation details (create/update/delete/query)
- ✅ **Success confirmations** - Operation results with element IDs
- 📤 **Outgoing responses** - Messages sent back to server

### Server-Side (`packages/canvas-mcp/src/core/WebSocketCommandRouter.ts`)

Added logging to track:
- 🚀 **Command execution** - Method and params received from AI agent
- 📝 **Request ID generation** - Unique ID for tracking request/response
- 📤 **Outgoing messages** - Messages sent to browser
- 📨 **Received responses** - Messages received from browser
- ✅ **Pending request match** - Confirming response matches outgoing request
- ⏰ **Timeout tracking** - 30-second timeout for requests

## What You Should See

### After Refreshing Browser (http://localhost:3009)

You should immediately see connection logs in the browser console:
```
[CanvasRPCHandler] Connecting to ws://localhost:3012
[CanvasRPCHandler] WebSocket connected
[CanvasRPCHandler] 📤 Sending message: {type: "subscribe", events: ["created", "updated", "deleted"]}
```

### When Running `npx tsx draw-circle.ts`

**In Canvas MCP Server Terminal:**
```
[Router] 🚀 Executing command: create with params: {type: "ellipse", x: 300, y: 300, ...}
[Router] 📝 Generated request ID: abc123xyz
[Router] 📤 Sending message to browser: {id: "abc123xyz", method: "canvas.create", params: {...}}
[Router] 📨 Received message from browser: {id: "abc123xyz", result: {id: "element-id-456"}}
[Router] ✅ Found pending request for ID: abc123xyz
```

**In Browser Console:**
```
[CanvasRPCHandler] 📨 Received WebSocket message: {"id":"abc123xyz","method":"canvas.create","params":{...}}
[CanvasRPCHandler] 📋 Parsed message: {id: "abc123xyz", method: "canvas.create", params: {...}}
[CanvasRPCHandler] 🔍 Processing message type: command {id: "abc123xyz", method: "canvas.create", ...}
[CanvasRPCHandler] 🎯 Handling command: canvas.create with params: {type: "ellipse", x: 300, y: 300, ...}
[CanvasRPCHandler] 🔧 Normalized command: create
[CanvasRPCHandler] ✏️ Creating element with params: {type: "ellipse", x: 300, y: 300, ...}
[CanvasRPCHandler] ✅ Created element with ID: element-id-456
[CanvasRPCHandler] 📤 Sending message: {id: "abc123xyz", result: {id: "element-id-456"}}
```

## Debugging Message Flow Issues

### If You See NO Logs in Browser Console

**Possible causes:**
1. **Browser not connecting** - Check if you see the initial connection logs
2. **WebSocket URL mismatch** - Verify `VITE_MCP_WS_URL=ws://localhost:3012` in `apps/waiboard/.env`
3. **CanvasClientPlugin disabled** - Check `apps/waiboard/plugins.config.ts`

### If You See Connection But NO Messages

**This means:** Server is not sending commands to browser

**Check:**
1. Is Canvas MCP server running on port 5173? `lsof -i :5173`
2. Does server show `[Router] Browser client connected`?
3. Run `npx tsx draw-circle.ts` and watch server logs

### If You See Messages Received But NO Elements Rendered

**This means:** Commands are reaching browser but not executing properly

**Check browser console for:**
- ✏️ **Creating element** logs - Confirms `driver.create()` was called
- ✅ **Created element** logs - Confirms element ID was generated
- Any error messages between "Creating" and "Created"

## Next Steps

1. **Refresh the browser** at http://localhost:3009
2. **Open browser DevTools** (F12) → Console tab
3. **Run test**: `cd packages/ai-agents && npx tsx draw-circle.ts`
4. **Compare logs** between browser console and Canvas MCP server terminal
5. **Report findings**:
   - Do you see 📨 received messages in browser?
   - Do you see ✏️ creating element logs?
   - Do you see ✅ created element confirmations?
   - Are there any errors between these logs?

The detailed logs will help identify exactly where the communication is breaking down.
