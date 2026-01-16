/**
 * Agentic Loop - Re-export
 *
 * This file re-exports from the new modular loop/ directory structure.
 * The loop has been refactored into TOAD (Think, Act, Observe, Decide) phases:
 *
 * - loop/types.ts    - Type definitions
 * - loop/context.ts  - Context management
 * - loop/tools.ts    - Tool definitions
 * - loop/think.ts    - THINK phase
 * - loop/act.ts      - ACT phase
 * - loop/observe.ts  - OBSERVE phase
 * - loop/decide.ts   - DECIDE phase
 * - loop/index.ts    - Main orchestrator
 *
 * @see loop/index.ts for the main implementation
 */

export * from "./loop/index.js";
export * from "./loop/types.js";
