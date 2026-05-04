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
  QuestionLimitReachedError,
} from '../state/errors.js';
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
  const toolName = 'submit_question';

  // Get session
  const session = collaborativeStore.getSession(input.session_id);

  const isMember = session.agents.some(a => a.agent_id === input.agent_id);
  if (!isMember) {
    return {
      status: 'rejected',
      reason: 'AGENT_NOT_IN_SESSION' as any,
      guidance: `Agent ${input.agent_id} is not a member of this session. Use join_session first.`,
    };
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
      status: 'rejected',
      reason: validationResult.failures[0].code as any,
      guidance: validationResult.failures.length > 1
        ? `Fix all ${validationResult.failures.length} failures listed in the response.`
        : validationResult.failures[0].action,
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
  if (newCount >= config.min_main_questions && updatedSession.phase < 3) {
    collaborativeStore.advancePhase(updatedSession.session_id, 3);
  }

  return {
    status: 'accepted',
    question_id: question.id,
    questions_accepted_so_far: newCount,
  };
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
    required: ['session_id', 'agent_id', 'question'],
  },
};
