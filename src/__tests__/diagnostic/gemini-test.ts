/**
 * Diagnostic test to check why Gemini returns empty candidates
 */

import { generateWithGemini } from "../../core/google-direct.js";

async function testGemini() {
  console.log("Testing Gemini API...\n");

  try {
    const result = await generateWithGemini({
      model: "gemini-2.0-flash-exp",
      systemPrompt: "You are a helpful assistant.",
      userMessage: "Say hello",
      maxTokens: 1000,
      temperature: 0.7,
    });

    console.log("✅ Success!");
    console.log("Response:", result.text);
  } catch (error) {
    console.error("❌ Error:", error);
    if (error instanceof Error) {
      console.error("Message:", error.message);
      console.error("Stack:", error.stack);
    }
  }
}

testGemini();
