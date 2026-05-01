/**
 * Submit Sub-Questions Tool
 *
 * Tool: submit_sub_questions
 * Phase: 3
 *
 * Accepts decomposition of a main question into sub-questions.
 */

import { collaborativeStore } from '../state/collaborative-store.js';
import { validateSubQuestions } from '../validation/question-validator.js';
import type { SubmitSubQuestionsInput } from '../types/schemas.js';
import type { SubQuestionsResponse } from '../types/domain.js';

// ============================================================================
// Tool Implementation
// ============================================================================

/**
 * Submit sub-questions for a main question
 */
export function submitSubQuestions(
  input: SubmitSubQuestionsInput
): SubQuestionsResponse {
  // Get session
  const session = collaborativeStore.getSession(input.session_id);

  // Verify main question exists
  const mainQuestion = collaborativeStore.getMainQuestion(
    session.session_id,
    input.main_question_id
  );

  if (!mainQuestion) {
    return {
      status: 'rejected',
      reason: 'QUESTION_NOT_FOUND',
      guidance: `Main question ${input.main_question_id} not found in this session.`,
    };
  }

  // Validate sub-questions - collects ALL failures
  const validationResult = validateSubQuestions(
    input.main_question_id,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    input.sub_questions as any[],
    session.depth
  );

  // If invalid, return multi-failure error response
  if (!validationResult.valid && validationResult.failures) {
    const failures = validationResult.failures;
    return {
      status: 'rejected',
      reason: failures[0].code as import('../types/domain.js').RejectionReason,
      guidance: failures.length > 1
        ? `Fix all ${failures.length} failures listed.`
        : failures[0].action,
    };
  }

  // Store sub-questions
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const createdSubQuestions = collaborativeStore.addSubQuestions(
    session.session_id,
    input.agent_id,
    input.main_question_id,
    input.sub_questions as any[]
  );

  // Get latest state
  const updatedSession = collaborativeStore.getSession(session.session_id, true);

  // Check if all main questions have sub-questions
  const allHaveSubQuestions = updatedSession.merged_questions.every(mq =>
    mq.sub_question_ids.length > 0
  );

  // If all have sub-questions, advance to Phase 4
  if (allHaveSubQuestions) {
    collaborativeStore.advancePhase(updatedSession.session_id, 4);
  }

  return {
    status: 'accepted',
    main_question_id: input.main_question_id,
    sub_question_ids: createdSubQuestions.map(sq => sq.id),
  };
}

/**
 * Get remaining main questions that need sub-questions
 */
export function getRemainingMainQuestions(sessionId: string): string[] {
  const session = collaborativeStore.getSession(sessionId);
  if (!session) {return [];}
  return session.merged_questions
    .filter(mq => mq.sub_question_ids.length === 0)
    .map(mq => mq.id);
}

// ============================================================================
// MCP Tool Definition
// ============================================================================

export const submitSubQuestionsTool = {
  name: 'submit_sub_questions',
  description: 'Submit sub-questions for a main question (Phase 3). Call once per main question.',
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
        description: 'Agent ID submitting the sub-questions',
      },
      main_question_id: {
        type: 'string',
        format: 'uuid',
        description: 'ID of the main question being decomposed',
      },
      sub_questions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description: 'The sub-question text',
            },
            target_files: {
              type: 'array',
              items: { type: 'string' },
              maxItems: 3,
              description: '1-3 specific files to read for this question',
            },
            pass_criteria: {
              type: 'string',
              description: 'Clear criteria for PASS verdict',
            },
            fail_criteria: {
              type: 'string',
              description: 'Clear criteria for FAIL verdict',
            },
            evidence_pattern: {
              type: 'string',
              description: 'What evidence to look for',
            },
            escalation_question: {
              type: 'string',
              description: 'Follow-up question if FAIL or SUSPICIOUS',
            },
          },
          required: [
            'text',
            'target_files',
            'pass_criteria',
            'fail_criteria',
            'evidence_pattern',
            'escalation_question',
          ],
        },
        description: 'Sub-questions decomposing the main question',
      },
    },
    required: ['session_id', 'agent_id', 'main_question_id', 'sub_questions'],
  },
};
