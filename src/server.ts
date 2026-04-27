/**
 * MCP Server Implementation
 * 
 * Sets up the Model Context Protocol server with all 7 tools.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';

import { initializeAuditTool, initializeAudit } from './tools/initialize-audit.js';
import { submitObservationsTool, submitObservations } from './tools/submit-observations.js';
import { submitQuestionTool, submitQuestion } from './tools/submit-question.js';
import { submitSubQuestionsTool, submitSubQuestions } from './tools/submit-sub-questions.js';
import { submitFindingTool, submitFinding } from './tools/submit-finding.js';
import { checkpointTool, checkpoint } from './tools/checkpoint.js';
import { finalizeReportTool, finalizeReport } from './tools/finalize-report.js';
import { getHeatMapTool, getHeatMap } from './tools/get-heat-map.js';

import { AuditError } from './state/errors.js';
import { ZodError } from 'zod';
import type { InitializeAuditInput, SubmitObservationsInput } from './types/schemas.js';
import type { SubmitQuestionInput, SubmitSubQuestionsInput } from './types/schemas.js';
import type { SubmitFindingInput, CheckpointInput, FinalizeReportInput } from './types/schemas.js';

// ============================================================================
// Tool Registry
// ============================================================================

// Tool definitions with type assertions to satisfy MCP SDK
const TOOLS = [
  initializeAuditTool,
  getHeatMapTool,
  submitObservationsTool,
  submitQuestionTool,
  submitSubQuestionsTool,
  submitFindingTool,
  checkpointTool,
  finalizeReportTool,
] as unknown as Tool[];

// ============================================================================
// Request Handlers
// ============================================================================

/**
 * Handle tool calls
 */
async function handleToolCall(name: string, args: unknown): Promise<unknown> {
  try {
    switch (name) {
      case 'initialize_audit':
        return await initializeAudit(args as InitializeAuditInput);
      case 'get_heat_map':
        return getHeatMap(args as { session_id: string; filter_bucket?: 'critical' | 'high' | 'medium' | 'low' | 'all' });
        
      case 'submit_observations':
        return submitObservations(args as SubmitObservationsInput);
        
      case 'submit_question':
        return submitQuestion(args as SubmitQuestionInput);
        
      case 'submit_sub_questions':
        return submitSubQuestions(args as SubmitSubQuestionsInput);
        
      case 'submit_finding':
        return submitFinding(args as SubmitFindingInput);
        
      case 'checkpoint':
        return checkpoint(args as CheckpointInput);
        
      case 'finalize_report':
        return finalizeReport(args as FinalizeReportInput);
        
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    // Handle known error types
    if (error instanceof AuditError) {
      return {
        status: 'error',
        code: error.code,
        message: error.message,
        details: error.details,
      };
    }
    
    // Handle Zod validation errors
    if (error instanceof ZodError) {
      const issues = error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
      return {
        status: 'error',
        code: 'VALIDATION_ERROR',
        message: `Invalid input: ${issues}`,
      };
    }
    
    // Handle unknown errors
    if (error instanceof Error) {
      return {
        status: 'error',
        code: 'INTERNAL_ERROR',
        message: error.message,
      };
    }
    
    throw error;
  }
}

// ============================================================================
// Server Setup
// ============================================================================

export async function startServer(): Promise<void> {
  const server = new Server(
    {
      name: 'critical-questionnaire-mcp',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register tool list handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOLS };
  });

  // Register tool call handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const result = await handleToolCall(name, args ?? {});
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  });

  // Set up stdio transport
  const transport = new StdioServerTransport();
  
  // Connect server to transport
  await server.connect(transport);
  
  // Log startup (to stderr so it doesn't interfere with MCP protocol)
  console.error('Critical Questionnaire MCP Server running on stdio');
}
