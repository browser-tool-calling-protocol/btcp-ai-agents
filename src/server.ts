/**
 * AI Agents Server - Pure Express
 *
 * Standalone Express server for browser agent chat.
 * Replaces Mastra framework with minimal dependencies.
 *
 * Features:
 * - AI SDK-compatible chat streaming
 * - Session context injection via X-Session-Id header
 * - BTCP integration for browser tool execution (local or remote mode)
 * - CORS configuration for frontend integration
 *
 * Environment Variables:
 * - PORT: Server port (default: 4111)
 * - NODE_ENV: Environment (development/staging/production)
 *
 * BTCP Mode:
 * - Local: Agent and browser tools run in same context (no server needed)
 * - Remote: Tools executed via BTCP server (set BTCP_SERVER_URL)
 */

import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import express from "express";
import cors from "cors";
import { createChatRouter } from "./http/handler.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageRoot = join(__dirname, "..");

// Load .env from package root
dotenv.config({ path: join(packageRoot, ".env") });

const PORT = parseInt(process.env.PORT || "4111", 10);

/**
 * Session ID extraction middleware
 *
 * Extracts sessionId from:
 * 1. X-Session-Id header (for BTCP workflow calls)
 * 2. Request body sessionId field (for AI SDK useChat)
 *
 * Sets req.sessionId for downstream handlers.
 */
function sessionIdMiddleware(
  req: express.Request,
  _res: express.Response,
  next: express.NextFunction
): void {
  // Try X-Session-Id header first
  let sessionId = req.headers["x-session-id"] as string | undefined;

  // Fall back to request body
  if (!sessionId && req.body?.sessionId) {
    sessionId = req.body.sessionId;
  }

  // Legacy support: also check for X-Canvas-Id / canvasId
  if (!sessionId) {
    sessionId = req.headers["x-canvas-id"] as string | undefined;
    if (!sessionId && req.body?.canvasId) {
      sessionId = req.body.canvasId;
    }
  }

  if (sessionId) {
    // Attach to request for handlers
    (req as express.Request & { sessionId?: string }).sessionId = sessionId;
  }

  next();
}

async function main(): Promise<void> {
  const app = express();

  // CORS configuration
  app.use(
    cors({
      origin: "*",
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Session-Id", "X-Canvas-Id"],
      maxAge: 86400,
    })
  );

  // Body parsing
  app.use(express.json({ limit: "10mb" }));

  // Session ID extraction
  app.use(sessionIdMiddleware);

  // Mount chat routes
  const chatRouter = await createChatRouter();
  app.use("/", chatRouter);

  // Start server
  app.listen(PORT, () => {
    const btcpMode = process.env.BTCP_SERVER_URL ? "remote" : "local";
    console.log("========================================");
    console.log("  BTCP AI Agents Server");
    console.log("========================================");
    console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`BTCP Mode: ${btcpMode}`);
    if (btcpMode === "remote") {
      console.log(`BTCP Server: ${process.env.BTCP_SERVER_URL}`);
    }
    console.log("");
    console.log("Endpoints:");
    console.log(`  GET  /health  - Health check`);
    console.log(`  POST /chat    - Streaming chat (SSE)`);
    console.log(`  POST /command - Browser commands`);
    console.log("");
    console.log("Protocol: BTCP (Browser Tool Calling Protocol)");
    console.log("========================================");
  });
}

main().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
