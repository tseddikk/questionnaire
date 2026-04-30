/**
 * Submit Question Tool - Error Response Contract Implementation
 *
 * Tool: submit_question
 * Phase: 2
 *
 * Accepts main questions one at a time for validation.
 * Returns structured error responses per the error response contract.
 */

import { collaborativeStore } from '../state/collaborative-store.js';
import {
  PhaseViolationError,
  QuestionLimitReachedError,
} from '../state/errors.js';
import { validateMainQuestion } from '../validation/question-validator.js';
import { DEPTH_CONFIG } from '../types/domain.js';
import type { SubmitQuestionInput } from '../types/schemas.js';
import type { QuestionResponse, MainQuestion, ErrorResponse } from '../types/domain.js';

// ============================================================================
// Tool Implementation
// ============================================================================

/**
 * Submit a main question for validation and storage
 */
export function submitQuestion(input: SubmitQuestionInput): QuestionResponse | ErrorResponse {
  const toolName = 'submit_question';

  // Get session
  const session = collaborativeStore.getSession(input.session_id);

  // Validate phase
  if (session.phase !== 2) {
    throw new PhaseViolationError(
      toolName,
      session.phase,
      2,
      session
    );
  }

  // Check if we've reached max questions
  const config = DEPTH_CONFIG[session.depth];
  const currentCount = collaborativeStore.getMainQuestionCount(session.session_id);

  if (currentCount >= config.max_main_questions) {
    throw new QuestionLimitReachedError(toolName, currentCount);
  }

  // Validate the question - collects ALL failures
  const validationResult = validateMainQuestion(
    input.question as MainQuestion,
    session.domain
  );

  // If invalid, return multi-failure error response
  if (!validationResult.valid && validationResult.failures) {
    return {
      status: 'error',
      code: 'MULTIPLE_VALIDATION_FAILURES',
      phase: 2,
      tool: toolName,
      message: `Question validation failed with ${validationResult.failures.length} issue(s).`,
      failures: validationResult.failures,
      action: 'Fix all failures listed above and resubmit. Do not resubmit until all are resolved.',
    };
  }

  // Store the question
  const agentId = input.agent_id;
  const question = collaborativeStore.addMainQuestion(
    session.session_id,
    agentId,
    input.question as Omit<MainQuestion, 'id' | 'sub_question_ids'>
  );

  // Get latest state
  const updatedSession = collaborativeStore.getSession(session.session_id, true);
  const newCount = updatedSession.merged_questions.length;

  // Advance to Phase 3 if minimum questions reached
  if (newCount >= config.min_main_questions && updatedSession.phase === 2) {
    collaborativeStore.advancePhase(updatedSession.session_id, 3);
  }

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
  try {
    const session = collaborativeStore.getSession(sessionId);
    const config = DEPTH_CONFIG[session.depth];
    const count = collaborativeStore.getMainQuestionCount(sessionId);
    return count >= config.min_main_questions;
  } catch {
    return false;
  }
}

/**
 * Advance to Phase 3 if minimum questions reached
 */
export function maybeAdvanceToPhase3(sessionId: string): boolean {
  if (isPhase2Complete(sessionId)) {
    collaborativeStore.advancePhase(sessionId, 3);
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
      agent_id: {
        type: 'string',
        description: 'Agent ID submitting the question',
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
