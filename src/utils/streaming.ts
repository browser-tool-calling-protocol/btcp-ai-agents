/**
 * Streaming utilities for chat responses
 */

import type { Response as ExpressResponse } from "express";

/**
 * Stream a Web API Response to an Express response
 *
 * @param webResponse - Web API Response from AI SDK
 * @param expressRes - Express response object
 */
export async function streamToExpress(
  webResponse: Response,
  expressRes: ExpressResponse
): Promise<void> {
  if (!webResponse.body) {
    throw new Error("Response has no body to stream");
  }

  // Copy headers from Web API Response to Express response
  webResponse.headers.forEach((value, key) => {
    expressRes.setHeader(key, value);
  });

  // Create reader and decoder
  const reader = webResponse.body.getReader();
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        expressRes.end();
        break;
      }

      // Decode and write chunk to Express response
      const chunk = decoder.decode(value, { stream: true });
      expressRes.write(chunk);
    }
  } catch (error) {
    console.error("[Streaming] Error streaming response:", error);

    // Only send error response if headers haven't been sent yet
    if (!expressRes.headersSent) {
      expressRes.status(500).json({
        error: "Streaming error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    } else {
      // If headers already sent, just end the response
      expressRes.end();
    }

    throw error;
  }
}
