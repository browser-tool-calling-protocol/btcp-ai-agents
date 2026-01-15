/**
 * HTTP Route Handlers
 *
 * Express-compatible request handlers for canvas AI.
 */

// Chat routes (Claude Code patterns)
export {
  handleChat,
  handleChatSync,
  handleCommand,
  handleCommandSync,
  handleHealth,
  createChatRouter,
  type ChatRequest,
} from "./handler.js";
