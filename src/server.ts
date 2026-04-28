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

// Collaborative tools
import { discoverSessionsTool, discoverSessions } from './tools/discover-sessions.js';
import { joinSessionTool, joinSession } from './tools/join-session.js';
import { reactToFindingTool, reactToFinding } from './tools/react-to-finding.js';
import { reactToQuestionTool, reactToQuestion } from './tools/react-to-question.js';
import { getSessionSummaryTool, getSessionSummary } from './tools/get-session-summary.js';
import { designateSynthesizerTool, designateSynthesizer } from './tools/designate-synthesizer.js';
import { adjudicateFindingTool, adjudicateFinding } from './tools/adjudicate-finding.js';
import { archiveSessionTool, archiveSession } from './tools/archive-session.js';

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
  // Core tools
  initializeAuditTool,
  getHeatMapTool,
  submitObservationsTool,
  submitQuestionTool,
  submitSubQuestionsTool,
  submitFindingTool,
  checkpointTool,
  finalizeReportTool,
  // Collaborative tools
  discoverSessionsTool,
  joinSessionTool,
  reactToFindingTool,
  reactToQuestionTool,
  getSessionSummaryTool,
  designateSynthesizerTool,
  adjudicateFindingTool,
  archiveSessionTool,
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

      // Collaborative tools
      case 'discover_sessions':
        return discoverSessions(args as { repo_path: string });
case 'join_session':
      return joinSession(args as { session_id: string; agent_id: string; repo_path: string });
      case 'react_to_finding':
        return reactToFinding(args as { session_id: string; agent_id: string; finding_id: string; reaction_type: 'confirm' | 'challenge' | 'extend'; content: string; evidence?: { file_path: string; line_start: number; line_end: number; snippet: string } | null });
      case 'react_to_question':
        return reactToQuestion(args as { session_id: string; agent_id: string; question_id: string; reaction_type: 'challenge_quality' | 'flag_conflict' | 'endorse'; content: string });
      case 'get_session_summary':
        return getSessionSummary(args as { session_id: string });
      case 'designate_synthesizer':
        return designateSynthesizer(args as { session_id: string; synthesizer_agent_id: string });
      case 'adjudicate_finding':
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return adjudicateFinding(args as unknown as Parameters<typeof adjudicateFinding>[0]);
      case 'archive_session':
        return archiveSession(args as { session_id: string; reason: string });

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    // Handle known error types
      if (error instanceof AuditError) {
        return error.toJSON();
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
