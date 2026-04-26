#!/usr/bin/env node

/**
 * Critical Questionnaire MCP Server
 * 
 * Entry point for the Model Context Protocol server.
 * 
 * Usage:
 *   node dist/index.js
 * 
 * Environment:
 *   LOG_LEVEL - Set logging level (debug, info, warn, error)
 */

import { startServer } from './server.js';

async function main(): Promise<void> {
  try {
    await startServer();
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
  process.exit(1);
});

// Start the server
main();
