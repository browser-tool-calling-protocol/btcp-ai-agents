/**
 * AI Agents Server - Pure Express
 *
 * Standalone Express server for canvas agent chat.
 * Replaces Mastra framework with minimal dependencies.
 *
 * Features:
 * - AI SDK-compatible chat streaming
 * - Canvas context injection via X-Canvas-Id header
 * - CORS configuration for frontend integration
 *
 * Environment Variables:
 * - PORT: Server port (default: 4111)
 * - NODE_ENV: Environment (development/staging/production)
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
 * Canvas ID extraction middleware
 *
 * Extracts canvasId from:
 * 1. X-Canvas-Id header (for MCP workflow calls)
 * 2. Request body canvasId field (for AI SDK useChat)
 *
 * Sets req.canvasId for downstream handlers.
 */
function canvasIdMiddleware(
  req: express.Request,
  _res: express.Response,
  next: express.NextFunction
): void {
  // Try X-Canvas-Id header first
  let canvasId = req.headers["x-canvas-id"] as string | undefined;

  // Fall back to request body
  if (!canvasId && req.body?.canvasId) {
    canvasId = req.body.canvasId;
  }

  if (canvasId) {
    // Attach to request for handlers
    (req as express.Request & { canvasId?: string }).canvasId = canvasId;
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
      allowedHeaders: ["Content-Type", "Authorization", "X-Canvas-Id"],
      maxAge: 86400,
    })
  );

  // Body parsing
  app.use(express.json({ limit: "10mb" }));

  // Canvas ID extraction
  app.use(canvasIdMiddleware);

  // Mount chat routes
  const chatRouter = await createChatRouter();
  app.use("/", chatRouter);

  // Start server
  app.listen(PORT, () => {
    console.log("========================================");
    console.log("  AI Agents Server");
    console.log("========================================");
    console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
    console.log(`Server running on http://localhost:${PORT}`);
    console.log("");
    console.log("Endpoints:");
    console.log(`  GET  /health  - Health check`);
    console.log(`  POST /chat    - Streaming chat (SSE)`);
    console.log(`  POST /command - Canvas commands`);
    console.log("");
    console.log("Engine: claude-code-patterns v2.0.0");
    console.log("========================================");
  });
}

main().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
