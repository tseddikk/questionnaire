/**
 * Checkpoint Tool
 * 
 * Tool: checkpoint
 * Phase: 4
 * 
 * Called after all sub-questions for a main question have findings.
 */

import { collaborativeStore } from '../state/collaborative-store.js';
import { PhaseViolationError, CheckpointIncompleteError } from '../state/errors.js';
import { getUnansweredSubQuestions, areAllSubQuestionsAnswered } from './submit-finding.js';
import type { CheckpointInput } from '../types/schemas.js';
import type { CheckpointResponse, CrossCuttingSignal, Finding } from '../types/domain.js';

// ============================================================================
// Cross-Cutting Analysis
// ============================================================================

/**
 * Analyze findings for cross-cutting patterns
 */
function analyzeCrossCuttingSignals(
  findings: Finding[]
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
     f.answer.toLowerCase().includes('not.*release') ||
     f.answer.toLowerCase().includes('not.*close')) &&
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
  
  // Validate phase
  if (session.phase !== 4) {
    throw new PhaseViolationError(
      'checkpoint',
      session.phase,
      4,
      session as any
    );
  }
  
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
  
  // Check if already checkpointed
  if (collaborativeStore.isCheckpointed(session.session_id, input.main_question_id)) {
    return {
      status: 'checkpoint_accepted',
      main_question_index: session.merged_questions.findIndex(q => q.id === input.main_question_id),
      questions_remaining: collaborativeStore.getRemainingMainQuestions(session.session_id).length,
      cross_cutting_signals: [],
    };
  }
  
  // Check if all sub-questions have findings
  if (!areAllSubQuestionsAnswered(session.session_id, input.main_question_id)) {
    const missing = getUnansweredSubQuestions(session.session_id, input.main_question_id);
    throw new CheckpointIncompleteError('checkpoint', input.main_question_id, missing);
  }
  
  // Get findings for this main question
  const findings = collaborativeStore.getFindingsForMainQuestion(
    session.session_id,
    input.main_question_id
  );
  
  // Analyze cross-cutting signals
  const crossCuttingSignals = analyzeCrossCuttingSignals(findings as any[]);
  
  // Record checkpoint
  const agentId = 'agent-0';
  collaborativeStore.addCheckpoint(
    session.session_id,
    agentId,
    input.main_question_id,
    crossCuttingSignals
  );
  
  const mainQuestionIndex = session.merged_questions.findIndex(
    q => q.id === input.main_question_id
  );
  const remaining = collaborativeStore.getRemainingMainQuestions(session.session_id);
  
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
  description: 'Checkpoint a main question after all sub-questions have findings (Phase 4).',
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
    },
    required: ['session_id', 'main_question_id'],
  },
};
