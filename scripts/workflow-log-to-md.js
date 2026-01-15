#!/usr/bin/env node
/**
 * Workflow Execution Log to Markdown Converter
 *
 * Converts Mastra workflow execution result JSON to readable markdown format
 * for easier debugging and analysis.
 *
 * Usage:
 *   node scripts/workflow-log-to-md.js <input-json-file> [output-md-file]
 *   curl http://localhost:4111/api/workflows/streamingChatWorkflow/runs/<run-id>/execution-result | node scripts/workflow-log-to-md.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Format duration in human-readable format
 */
function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  const seconds = (ms / 1000).toFixed(2);
  return `${seconds}s`;
}

/**
 * Format timestamp
 */
function formatTimestamp(timestamp) {
  return new Date(timestamp).toISOString();
}

/**
 * Get status emoji
 */
function getStatusEmoji(status) {
  switch (status) {
    case 'success': return '✅';
    case 'failed': return '❌';
    case 'running': return '⏳';
    default: return '⚪';
  }
}

/**
 * Convert JSON to Markdown
 */
function jsonToMarkdown(data) {
  const lines = [];

  // Header
  lines.push('# Workflow Execution Report');
  lines.push('');
  lines.push(`**Generated**: ${new Date().toISOString()}`);
  lines.push('');

  // Overall Status
  const statusEmoji = getStatusEmoji(data.status);
  lines.push('## Overall Status');
  lines.push('');
  lines.push(`${statusEmoji} **${data.status.toUpperCase()}**`);
  lines.push('');

  if (data.error) {
    lines.push('### Error');
    lines.push('```');
    lines.push(data.error);
    lines.push('```');
    lines.push('');
  }

  // Input Payload
  if (data.payload) {
    lines.push('## Input Payload');
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(data.payload, null, 2));
    lines.push('```');
    lines.push('');
  }

  // Workflow Steps
  if (data.steps) {
    lines.push('## Workflow Steps');
    lines.push('');

    const steps = Object.entries(data.steps);
    const totalSteps = steps.length;
    const successfulSteps = steps.filter(([_, step]) => step.status === 'success').length;
    const failedSteps = steps.filter(([_, step]) => step.status === 'failed').length;

    lines.push(`**Total Steps**: ${totalSteps} | **Success**: ${successfulSteps} | **Failed**: ${failedSteps}`);
    lines.push('');

    // Step Summary Table
    lines.push('| Step | Status | Duration | Tokens |');
    lines.push('|------|--------|----------|--------|');

    steps.forEach(([stepName, step]) => {
      const emoji = getStatusEmoji(step.status);
      const duration = step.endedAt && step.startedAt
        ? formatDuration(step.endedAt - step.startedAt)
        : step.status === 'running' ? 'running...' : 'N/A';

      // Try to get token usage from output metadata
      let tokens = 'N/A';
      if (step.output?.metadata?.tokensUsed) {
        tokens = step.output.metadata.tokensUsed;
      } else if (step.output?.results) {
        const totalTokens = step.output.results.reduce((sum, r) =>
          sum + (r.metadata?.tokensUsed || 0), 0);
        if (totalTokens > 0) tokens = totalTokens;
      }

      lines.push(`| ${emoji} ${stepName} | ${step.status} | ${duration} | ${tokens} |`);
    });
    lines.push('');

    // Detailed Step Information
    lines.push('### Detailed Step Information');
    lines.push('');

    steps.forEach(([stepName, step], index) => {
      const emoji = getStatusEmoji(step.status);
      lines.push(`#### ${index + 1}. ${emoji} ${stepName}`);
      lines.push('');

      // Status and Timing
      lines.push('**Status**: ' + step.status);
      if (step.startedAt) {
        lines.push(`**Started**: ${formatTimestamp(step.startedAt)}`);
      }
      if (step.endedAt) {
        lines.push(`**Ended**: ${formatTimestamp(step.endedAt)}`);
        lines.push(`**Duration**: ${formatDuration(step.endedAt - step.startedAt)}`);
      }
      lines.push('');

      // Error Details
      if (step.error) {
        lines.push('**Error**:');
        lines.push('```');
        lines.push(step.error);
        lines.push('```');
        lines.push('');
      }

      // Input Payload
      if (step.payload) {
        lines.push('<details>');
        lines.push('<summary>Input Payload</summary>');
        lines.push('');
        lines.push('```json');
        lines.push(JSON.stringify(step.payload, null, 2));
        lines.push('```');
        lines.push('</details>');
        lines.push('');
      }

      // Output
      if (step.output && step.status === 'success') {
        lines.push('<details>');
        lines.push('<summary>Output</summary>');
        lines.push('');

        // If output has a response field, show it prominently
        if (step.output.response && typeof step.output.response === 'string') {
          lines.push('**Response**:');
          lines.push('```');
          lines.push(step.output.response);
          lines.push('```');
          lines.push('');
        }

        // If output has results array, show summary
        if (step.output.results && Array.isArray(step.output.results)) {
          lines.push('**Task Results**:');
          lines.push('');
          step.output.results.forEach((result, idx) => {
            const resultEmoji = result.success ? '✅' : '❌';
            lines.push(`${idx + 1}. ${resultEmoji} Task ${result.taskId || idx + 1}`);
            lines.push(`   - Success: ${result.success}`);
            if (result.metadata) {
              if (result.metadata.executionTime) {
                lines.push(`   - Execution Time: ${formatDuration(result.metadata.executionTime)}`);
              }
              if (result.metadata.tokensUsed) {
                lines.push(`   - Tokens Used: ${result.metadata.tokensUsed}`);
              }
            }
            if (result.data && typeof result.data === 'string') {
              lines.push('   - Data:');
              lines.push('     ```');
              // Truncate long responses
              const data = result.data.length > 500
                ? result.data.substring(0, 500) + '...[truncated]'
                : result.data;
              lines.push('     ' + data.split('\n').join('\n     '));
              lines.push('     ```');
            }
            if (result.error) {
              lines.push(`   - Error: ${result.error.message}`);
            }
            lines.push('');
          });
        }

        // Full output (collapsed)
        lines.push('<details>');
        lines.push('<summary>Full Output JSON</summary>');
        lines.push('');
        lines.push('```json');
        lines.push(JSON.stringify(step.output, null, 2));
        lines.push('```');
        lines.push('</details>');
        lines.push('');
        lines.push('</details>');
        lines.push('');
      }
    });
  }

  // Final Result
  if (data.result && data.status === 'success') {
    lines.push('## Final Result');
    lines.push('');

    if (data.result.response) {
      lines.push('### Response');
      lines.push('```');
      lines.push(data.result.response);
      lines.push('```');
      lines.push('');
    }

    if (data.result.agentUsed) {
      lines.push(`**Agent Used**: ${data.result.agentUsed}`);
      lines.push('');
    }

    if (data.result.plan) {
      lines.push('<details>');
      lines.push('<summary>Execution Plan</summary>');
      lines.push('');
      lines.push('```json');
      lines.push(JSON.stringify(data.result.plan, null, 2));
      lines.push('```');
      lines.push('</details>');
      lines.push('');
    }
  }

  // Workflow Graph
  if (data.serializedStepGraph) {
    lines.push('## Workflow Graph');
    lines.push('');
    lines.push('```mermaid');
    lines.push('graph LR');
    data.serializedStepGraph.forEach((node, index) => {
      if (node.type === 'step') {
        const stepId = node.step.id;
        const stepStatus = data.steps?.[stepId]?.status || 'unknown';
        const emoji = getStatusEmoji(stepStatus);
        lines.push(`    ${index}["${emoji} ${stepId}"]`);
        if (index > 0) {
          lines.push(`    ${index - 1} --> ${index}`);
        }
      }
    });
    lines.push('```');
    lines.push('');
  }

  // Performance Metrics
  if (data.steps) {
    const steps = Object.entries(data.steps);
    const completedSteps = steps.filter(([_, step]) => step.endedAt && step.startedAt);

    if (completedSteps.length > 0) {
      lines.push('## Performance Metrics');
      lines.push('');

      const totalDuration = completedSteps.reduce((sum, [_, step]) =>
        sum + (step.endedAt - step.startedAt), 0);

      const firstStart = Math.min(...steps
        .filter(([_, step]) => step.startedAt)
        .map(([_, step]) => step.startedAt));
      const lastEnd = Math.max(...steps
        .filter(([_, step]) => step.endedAt)
        .map(([_, step]) => step.endedAt));

      const totalWallTime = lastEnd - firstStart;

      lines.push(`**Total Step Execution Time**: ${formatDuration(totalDuration)}`);
      lines.push(`**Total Wall Clock Time**: ${formatDuration(totalWallTime)}`);

      // Token usage
      const allResults = steps.flatMap(([_, step]) => step.output?.results || []);
      const totalTokens = allResults.reduce((sum, r) =>
        sum + (r.metadata?.tokensUsed || 0), 0);

      if (totalTokens > 0) {
        lines.push(`**Total Tokens Used**: ${totalTokens}`);
      }

      lines.push('');
    }
  }

  // Footer
  lines.push('---');
  lines.push('');
  lines.push('*Generated by workflow-log-to-md.js*');

  return lines.join('\n');
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  let inputFile = args[0];
  let outputFile = args[1];

  let jsonData;

  // Read from stdin if no input file specified
  if (!inputFile || inputFile === '-') {
    const chunks = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    const inputData = Buffer.concat(chunks).toString('utf-8');

    try {
      jsonData = JSON.parse(inputData);
    } catch (err) {
      console.error('Error parsing JSON from stdin:', err.message);
      process.exit(1);
    }
  } else {
    // Read from file
    if (!fs.existsSync(inputFile)) {
      console.error(`Error: Input file not found: ${inputFile}`);
      process.exit(1);
    }

    try {
      const inputData = fs.readFileSync(inputFile, 'utf-8');
      jsonData = JSON.parse(inputData);
    } catch (err) {
      console.error('Error reading/parsing input file:', err.message);
      process.exit(1);
    }
  }

  // Convert to markdown
  const markdown = jsonToMarkdown(jsonData);

  // Write output
  if (outputFile) {
    fs.writeFileSync(outputFile, markdown, 'utf-8');
    console.log(`✅ Markdown report written to: ${outputFile}`);
  } else {
    // Print to stdout if no output file specified
    console.log(markdown);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

export { jsonToMarkdown };
