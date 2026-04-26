/**
 * Submit Question Tool
 * 
 * Tool: submit_question
 * Phase: 2
 * 
 * Accepts main questions one at a time for validation.
 */

import { sessionStore } from '../state/session-store.js';
import { PhaseViolationError } from '../state/errors.js';
import { validateMainQuestion } from '../validation/question-validator.js';
import { DEPTH_CONFIG } from '../types/domain.js';
import type { SubmitQuestionInput } from '../types/schemas.js';
import type { QuestionResponse, MainQuestion } from '../types/domain.js';

// ============================================================================
// Tool Implementation
// ============================================================================

/**
 * Submit a main question for validation and storage
 */
export function submitQuestion(input: SubmitQuestionInput): QuestionResponse {
  // Get session
  const session = sessionStore.getSession(input.session_id);
  
  // Validate phase
  if (session.phase !== 2) {
    throw new PhaseViolationError(
      session.phase,
      2,
      'submit_question'
    );
  }
  
  // Check if we've reached max questions
  const config = DEPTH_CONFIG[session.depth];
  const currentCount = sessionStore.getMainQuestionCount(session.session_id);
  
  if (currentCount >= config.max_main_questions) {
    return {
      status: 'rejected',
      reason: 'SUB_QUESTION_COUNT_VIOLATION',
      guidance: `Maximum ${config.max_main_questions} main questions allowed for ${session.depth} depth. ` +
        `Question intake is now closed.`,
    };
  }
  
  // Validate the question
  const validationResult = validateMainQuestion(
    input.question as MainQuestion,
    session.domain
  );
  
  // If invalid, return rejection
  if (!validationResult.valid) {
    return {
      status: 'rejected',
      reason: validationResult.reason!,
      guidance: validationResult.guidance!,
    };
  }
  
  // Store the question
  const question = sessionStore.addMainQuestion(
    session.session_id,
    input.question as Omit<MainQuestion, 'id' | 'sub_question_ids'>
  );
  
  const newCount = currentCount + 1;

  return {
    status: 'accepted',
    question_id: question.id,
    questions_accepted_so_far: newCount,
  };
}

/**
 * Check if Phase 2 is complete (min questions reached)
 */
export function isPhase2Complete(sessionId: string): boolean {
  const session = sessionStore.getSession(sessionId);
  const config = DEPTH_CONFIG[session.depth];
  const count = sessionStore.getMainQuestionCount(sessionId);
  return count >= config.min_main_questions;
}

/**
 * Advance to Phase 3 if minimum questions reached
 */
export function maybeAdvanceToPhase3(sessionId: string): boolean {
  if (isPhase2Complete(sessionId)) {
    sessionStore.advancePhase(sessionId, 3);
    return true;
  }
  return false;
}

// ============================================================================
// MCP Tool Definition
// ============================================================================

export const submitQuestionTool = {
  name: 'submit_question',
  description: 'Submit a main question for Phase 2. Submit 5-7 questions to unlock Phase 3.',
  inputSchema: {
    type: 'object',
    properties: {
      session_id: {
        type: 'string',
        format: 'uuid',
        description: 'Session ID',
      },
      question: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: 'The main question text',
          },
          target_files: {
            type: 'array',
            items: { type: 'string' },
            description: 'One or more specific file paths to investigate',
          },
          suspicion_rationale: {
            type: 'string',
            description: 'Why this component is suspected to have defects',
          },
          edge_case_targeted: {
            type: 'string',
            description: 'Specific failure path or edge case being probed',
          },
          domain_pattern: {
            type: 'string',
            enum: [
              'ASYNC_FAILURE',
              'ACCIDENTAL_COUPLING',
              'VALIDATION_BYPASS',
              'IMPLICIT_MUTATION',
              'DEPENDENCY_COMPROMISE',
              'DATA_LEAKAGE',
              'INVARIANT_MISSING',
            ],
            description: 'Question pattern used',
          },
        },
        required: [
          'text',
          'target_files',
          'suspicion_rationale',
          'edge_case_targeted',
          'domain_pattern',
        ],
      },
    },
    required: ['session_id', 'question'],
  },
};
