/**
 * Checkpoint Tool
 * 
 * Tool: checkpoint
 * Phase: 4
 * 
 * Called after all sub-questions for a main question have findings.
 */

import { collaborativeStore } from '../state/collaborative-store.js';
import { CheckpointIncompleteError } from '../state/errors.js';
import { getUnansweredSubQuestions, areAllSubQuestionsAnswered } from './submit-finding.js';
import type { CheckpointInput } from '../types/schemas.js';
import type { CheckpointResponse, CrossCuttingSignal, Finding, AgentFinding } from '../types/domain.js';

// ============================================================================
// Cross-Cutting Analysis
// ============================================================================

/**
 * Analyze findings for cross-cutting patterns
 */
function analyzeCrossCuttingSignals(
  findings: (Finding | AgentFinding)[]
): CrossCuttingSignal[] {
  const signals: CrossCuttingSignal[] = [];
  
  // Pattern: Missing cleanup
  const missingCleanupCount = findings.filter(f => 
    f.answer.toLowerCase().includes('cleanup') && 
    (f.verdict === 'FAIL' || f.verdict === 'SUSPICIOUS')
  ).length;
  
  if (missingCleanupCount >= 2) {
    signals.push({
      pattern: 'MISSING_CLEANUP',
      affected_count: missingCleanupCount,
      description: 'Missing cleanup found in multiple findings',
    });
  }
  
  // Pattern: Error handling gaps
  const errorGapCount = findings.filter(f => 
    f.answer.toLowerCase().includes('error') && 
    f.answer.toLowerCase().includes('not') &&
    (f.verdict === 'FAIL' || f.verdict === 'SUSPICIOUS')
  ).length;
  
  if (errorGapCount >= 2) {
    signals.push({
      pattern: 'ERROR_HANDLING_GAP',
      affected_count: errorGapCount,
      description: 'Error handling gaps detected across multiple areas',
    });
  }
  
  // Pattern: Unvalidated input
  const unvalidatedCount = findings.filter(f => 
    f.answer.toLowerCase().includes('validat') && 
    (f.verdict === 'FAIL' || f.verdict === 'SUSPICIOUS')
  ).length;
  
  if (unvalidatedCount >= 2) {
    signals.push({
      pattern: 'UNVALIDATED_INPUT',
      affected_count: unvalidatedCount,
      description: 'Input validation issues found in multiple locations',
    });
  }
  
  // Pattern: Resource leaks
  const resourceLeakCount = findings.filter(f =>
    (f.answer.toLowerCase().includes('leak') ||
     /not\s+(release|close)/i.test(f.answer)) &&
    (f.verdict === 'FAIL' || f.verdict === 'SUSPICIOUS')
  ).length;
  
  if (resourceLeakCount >= 2) {
    signals.push({
      pattern: 'RESOURCE_LEAK',
      affected_count: resourceLeakCount,
      description: 'Resource leaks detected in multiple components',
    });
  }
  
  // Pattern: Silent failures
  const silentFailureCount = findings.filter(f => 
    f.answer.toLowerCase().includes('silent') && 
    f.answer.toLowerCase().includes('fail') &&
    (f.verdict === 'FAIL' || f.verdict === 'SUSPICIOUS')
  ).length;
  
  if (silentFailureCount >= 2) {
    signals.push({
      pattern: 'SILENT_FAILURE',
      affected_count: silentFailureCount,
      description: 'Silent failure patterns found across the codebase',
    });
  }
  
  return signals;
}

// ============================================================================
// Tool Implementation
// ============================================================================

/**
 * Checkpoint a main question
 */
export function checkpoint(input: CheckpointInput): CheckpointResponse {
  // Get session from collaborative store
  const session = collaborativeStore.getSession(input.session_id);

  // Verify main question exists
  const mainQuestion = collaborativeStore.getMainQuestion(
    session.session_id,
    input.main_question_id
  );

  if (!mainQuestion) {
    return {
      status: 'incomplete',
      missing_sub_questions: [],
      reason: `Main question ${input.main_question_id} not found.`,
    };
  }

  // Check if already checkpointed by this agent
  const existingCheckpoint = session.agent_checkpoints.find(
    cp => cp.main_question_id === input.main_question_id && cp.agent_id === input.agent_id
  );
  if (existingCheckpoint) {
    const updatedSession = collaborativeStore.getSession(session.session_id, true);
    return {
      status: 'checkpoint_accepted',
      main_question_index: updatedSession.merged_questions.findIndex(q => q.id === input.main_question_id),
      questions_remaining: collaborativeStore.getUncheckpointedMainQuestions(session.session_id, input.agent_id).length,
      cross_cutting_signals: [],
    };
  }

  // Check if all sub-questions have findings OR agent has reacted to all
  // Pass agent_id to allow reaction-based checkpointing
  if (!areAllSubQuestionsAnswered(session.session_id, input.main_question_id, input.agent_id)) {
    const missing = getUnansweredSubQuestions(session.session_id, input.main_question_id, input.agent_id);
    throw new CheckpointIncompleteError('checkpoint', input.main_question_id, missing);
  }

  // Get findings for this main question
  const findings = collaborativeStore.getFindingsForMainQuestion(
    session.session_id,
    input.main_question_id
  );

  // Analyze cross-cutting signals
  const crossCuttingSignals = analyzeCrossCuttingSignals(findings);

  // Record checkpoint with the calling agent's ID
  collaborativeStore.addCheckpoint(
    session.session_id,
    input.agent_id,
    input.main_question_id,
    crossCuttingSignals
  );

  const updatedSession = collaborativeStore.getSession(session.session_id, true);
  const mainQuestionIndex = updatedSession.merged_questions.findIndex(
    q => q.id === input.main_question_id
  );
  const remaining = collaborativeStore.getUncheckpointedMainQuestions(session.session_id, input.agent_id);

  return {
    status: 'checkpoint_accepted',
    main_question_index: mainQuestionIndex,
    questions_remaining: remaining.length,
    cross_cutting_signals: crossCuttingSignals,
  };
}

// ============================================================================
// MCP Tool Definition
// ============================================================================

export const checkpointTool = {
  name: 'checkpoint',
  description: 'Checkpoint a main question after investigating (Phase 4). An agent can checkpoint if they have submitted findings OR reacted to all existing findings for that main question.',
  inputSchema: {
    type: 'object',
    properties: {
      session_id: {
        type: 'string',
        format: 'uuid',
        description: 'Session ID',
      },
      main_question_id: {
        type: 'string',
        format: 'uuid',
        description: 'ID of the main question to checkpoint',
      },
      agent_id: {
        type: 'string',
        description: 'Agent ID calling checkpoint (for multi-agent tracking)',
      },
    },
    required: ['session_id', 'main_question_id', 'agent_id'],
  },
};
