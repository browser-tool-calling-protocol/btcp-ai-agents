# WebSocket Debug Logging

Comprehensive debug logging to trace the WebSocket message flow between the MCP server and browser.

## Changes Made

### Browser-Side (RPC Handler)

Added logging to track:
- Received messages - Raw WebSocket data coming from server
- Parsed messages - Parsed JSON message structure
- Message processing - Type of message being handled
- Command handling - Method and params being executed
- Command normalization - Cleaned command name
- Operation logs - Specific operation details (create/update/delete/query)
- Success confirmations - Operation results with element IDs
- Outgoing responses - Messages sent back to server

### Server-Side (WebSocket Command Router)

Added logging to track:
- Command execution - Method and params received from AI agent
- Request ID generation - Unique ID for tracking request/response
- Outgoing messages - Messages sent to browser
- Received responses - Messages received from browser
- Pending request match - Confirming response matches outgoing request
- Timeout tracking - 30-second timeout for requests

## Debugging Message Flow Issues

### If You See NO Logs in Browser Console

**Possible causes:**
1. **Browser not connecting** - Check if you see the initial connection logs
2. **WebSocket URL mismatch** - Verify WebSocket URL in environment config
3. **Client plugin disabled** - Check plugin configuration

### If You See Connection But NO Messages

**This means:** Server is not sending commands to browser

**Check:**
1. Is the MCP server running?
2. Does server show "Browser client connected"?
3. Run a test command and watch server logs

### If You See Messages Received But NO Elements Rendered

**This means:** Commands are reaching browser but not executing properly

**Check browser console for:**
- Creating element logs - Confirms driver.create() was called
- Created element logs - Confirms element ID was generated
- Any error messages between "Creating" and "Created"

## Next Steps

1. **Refresh the browser** at your application URL
2. **Open browser DevTools** (F12) -> Console tab
3. **Run test**: Execute a test task
4. **Compare logs** between browser console and server terminal
5. **Report findings**

The detailed logs will help identify exactly where the communication is breaking down.
