/**
 * Diagnostic test to check Gemini with canvas tools
 */

import { generateWithGemini } from "../../core/google-direct.js";

async function testGeminiWithTools() {
  console.log("Testing Gemini API with tools...\n");

  try {
    const result = await generateWithGemini({
      model: "gemini-2.0-flash-exp",
      systemPrompt: "You are a canvas assistant. You have access to canvas tools to read, edit, and create elements on a whiteboard canvas.",
      userMessage: "What's on the canvas?",
      tools: ["canvas_read"], // Use actual canvas tool
      maxTokens: 2000,
      temperature: 0.7,
    });

    console.log("✅ Success!");
    console.log("Response:", result.text);
    console.log("Tool calls:", result.toolCalls);
  } catch (error) {
    console.error("❌ Error:", error);
    if (error instanceof Error) {
      console.error("Message:", error.message);
      console.error("Stack:", error.stack);
    }
  }
}

testGeminiWithTools();
