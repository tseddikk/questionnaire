/**
 * Submit Finding Tool
 * 
 * Tool: submit_finding
 * Phase: 4
 * 
 * Accepts investigation results for individual sub-questions.
 */

import { sessionStore } from '../state/session-store.js';
import { PhaseViolationError } from '../state/errors.js';
import { validateFindingForSubmission } from '../validation/finding-validator.js';
import type { SubmitFindingInput } from '../types/schemas.js';
import type { FindingResponse, Finding } from '../types/domain.js';

// ============================================================================
// Tool Implementation
// ============================================================================

/**
 * Submit a finding for a sub-question
 */
export function submitFinding(input: SubmitFindingInput): FindingResponse {
  // Get session
  const session = sessionStore.getSession(input.session_id);
  
  // Validate phase
  if (session.phase !== 4) {
    throw new PhaseViolationError(
      'submit_finding',
      session.phase,
      4,
      session
    );
  }
  
  // Verify sub-question exists
  const subQuestion = sessionStore.getSubQuestion(
    session.session_id,
    input.sub_question_id
  );
  
  if (!subQuestion) {
    return {
      status: 'rejected',
      reason: 'MISSING_TARGET_FILES',
      guidance: `Sub-question ${input.sub_question_id} not found in this session.`,
    };
  }
  
  // Check if finding already exists for this sub-question
  if (sessionStore.hasFindingForSubQuestion(session.session_id, input.sub_question_id)) {
    return {
      status: 'rejected',
      reason: 'MISSING_SUSPICION_RATIONALE',
      guidance: `A finding already exists for sub-question ${input.sub_question_id}. ` +
        'Each sub-question can only have one finding.',
    };
  }
  
  // Build the finding object
  const findingInput: Finding = {
    id: '', // Will be assigned by store
    sub_question_id: input.sub_question_id,
    answer: input.finding.answer,
    evidence: input.finding.evidence,
    verdict: input.finding.verdict,
    severity: input.finding.severity,
    confidence: input.finding.confidence,
    evidence_found: input.finding.evidence_found,
    escalation_finding: input.finding.escalation_finding,
  };

  // Validate the finding
  try {
    validateFindingForSubmission(findingInput);
  } catch (error) {
    if (error instanceof Error) {
      return {
        status: 'rejected',
        reason: 'ESCALATION_REQUIRED',
        guidance: error.message,
      };
    }
    throw error;
  }

  // Store the finding
  const finding = sessionStore.addFinding(
    session.session_id,
    findingInput
  );
  
  return {
    status: 'accepted',
    finding_id: finding.id,
  };
}

/**
 * Check if all sub-questions for a main question have findings
 */
export function areAllSubQuestionsAnswered(
  sessionId: string,
  mainQuestionId: string
): boolean {
  const session = sessionStore.getSession(sessionId);
  const subQuestions = session.sub_questions.filter(
    sq => sq.main_question_id === mainQuestionId
  );
  
  return subQuestions.every(sq => 
    session.findings.some(f => f.sub_question_id === sq.id)
  );
}

/**
 * Get sub-questions without findings for a main question
 */
export function getUnansweredSubQuestions(
  sessionId: string,
  mainQuestionId: string
): { id: string; text: string }[] {
  const session = sessionStore.getSession(sessionId);
  const subQuestions = session.sub_questions.filter(
    sq => sq.main_question_id === mainQuestionId
  );

  return subQuestions
    .filter(sq => !session.findings.some(f => f.sub_question_id === sq.id))
    .map(sq => ({ id: sq.id, text: sq.text }));
}

// ============================================================================
// MCP Tool Definition
// ============================================================================

export const submitFindingTool = {
  name: 'submit_finding',
  description: 'Submit a finding for a sub-question (Phase 4). Submit individually to prevent loss.',
  inputSchema: {
    type: 'object',
    properties: {
      session_id: {
        type: 'string',
        format: 'uuid',
        description: 'Session ID',
      },
      sub_question_id: {
        type: 'string',
        format: 'uuid',
        description: 'ID of the sub-question being answered',
      },
      finding: {
        type: 'object',
        properties: {
          answer: {
            type: 'string',
            description: 'The finding answer',
          },
          evidence: {
            type: 'object',
            nullable: true,
            properties: {
              file_path: { type: 'string' },
              line_start: { type: 'number' },
              line_end: { type: 'number' },
              snippet: { type: 'string' },
            },
            required: ['file_path', 'line_start', 'line_end', 'snippet'],
          },
          verdict: {
            type: 'string',
            enum: ['PASS', 'FAIL', 'SUSPICIOUS', 'UNCERTAIN'],
            description: 'Finding verdict',
          },
          severity: {
            type: 'string',
            enum: ['info', 'warning', 'critical', 'catastrophic'],
            description: 'Finding severity',
          },
          confidence: {
            type: 'string',
            enum: ['high', 'medium', 'low'],
            description: 'Finding confidence',
          },
          evidence_found: {
            type: 'boolean',
            description: 'Whether evidence was found',
          },
          escalation_finding: {
            type: 'string',
            nullable: true,
            description: 'Escalation finding if FAIL or SUSPICIOUS',
          },
        },
        required: [
          'answer',
          'evidence',
          'verdict',
          'severity',
          'confidence',
          'evidence_found',
          'escalation_finding',
        ],
      },
    },
    required: ['session_id', 'sub_question_id', 'finding'],
  },
};
