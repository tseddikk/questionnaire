/**
 * Error Formatter
 *
 * Formats errors into the consistent response envelope.
 * Handles both single failures (detail) and multi-failures (failures array).
 */

import type { AuditPhase, SessionState } from '../types/domain.js';

export interface ValidationFailure {
  code: string;
  field: string;
  submitted_value: unknown;
  expected: string;
  action: string;
}

export interface SingleErrorDetail {
  field: string;
  submitted_value: unknown;
  expected: string;
}

export interface SessionStateContext {
  main_questions_accepted?: number;
  sub_question_sets_submitted?: number;
  sub_question_sets_remaining?: number;
  next_required_tool?: string;
  next_required_action?: string;
  current_phase_name?: string;
}

export interface ErrorResponse {
  status: 'error';
  code: string;
  phase?: number;
  tool: string;
  message: string;
  detail?: SingleErrorDetail;
  failures?: ValidationFailure[];
  session_state?: SessionStateContext;
  action: string;
}

/**
 * Format a single validation error
 */
export function formatSingleError(
  code: string,
  tool: string,
  message: string,
  detail: SingleErrorDetail,
  action: string,
  phase?: number
): ErrorResponse {
  return {
    status: 'error',
    code,
    phase,
    tool,
    message,
    detail,
    action,
  };
}

/**
 * Format multiple validation failures
 */
export function formatMultiError(
  code: string,
  tool: string,
  message: string,
  failures: ValidationFailure[],
  action: string,
  phase?: number
): ErrorResponse {
  return {
    status: 'error',
    code,
    phase,
    tool,
    message,
    failures,
    action,
  };
}

/**
 * Format a phase violation error with session state
 */
export function formatPhaseViolationError(
  tool: string,
  currentPhase: AuditPhase,
  currentPhaseName: string,
  toolAllowedInPhase: AuditPhase,
  sessionState: SessionStateContext
): ErrorResponse {
  const nextAction = sessionState.next_required_action || 
    `Complete Phase ${currentPhase} (${currentPhaseName}) before calling ${tool}.`;

  return {
    status: 'error',
    code: 'PHASE_VIOLATION',
    phase: currentPhase,
    tool,
    message: `${tool} cannot be called during Phase ${currentPhase} (${currentPhaseName}).`,
    session_state: sessionState,
    action: nextAction,
  };
}

/**
 * Format session already active error
 */
export function formatSessionAlreadyActiveError(
  tool: string,
  activeSession: {
    session_id: string;
    repo: string;
    phase: number;
    started_by: string;
    investigators: string[];
  }
): ErrorResponse {
  return {
    status: 'error',
    code: 'SESSION_ALREADY_ACTIVE',
    tool,
    message: `Cannot initialize new session while session ${activeSession.session_id} is active.`,
    detail: {
      field: 'repo_path',
      submitted_value: activeSession.repo,
      expected: 'No active sessions',
    },
    action: `Finalize or archive session ${activeSession.session_id} (${activeSession.repo}, phase ${activeSession.phase}) before starting a new one. Current investigators: ${activeSession.investigators.join(', ')}.`,
  };
}

/**
 * Format session not found error
 */
export function formatSessionNotFoundError(
  tool: string,
  sessionId: string,
  repoPath?: string
): ErrorResponse {
  return {
    status: 'error',
    code: 'SESSION_NOT_FOUND',
    tool,
    message: `Session ${sessionId} was not found.`,
    detail: {
      field: 'session_id',
      submitted_value: sessionId,
      expected: 'Valid session ID',
    },
    action: repoPath 
      ? `Call discover_sessions with repo_path "${repoPath}" to find the active session.` 
      : 'Call discover_sessions with your repo_path to find the active session.',
  };
}

/**
 * Format synthesizer-only error
 */
export function formatSynthesizerOnlyError(
  tool: string,
  currentSynthesizer: string | null,
  agentId: string
): ErrorResponse {
  return {
    status: 'error',
    code: 'SYNTHESIZER_ONLY',
    tool,
    message: `Only the Synthesizer can call ${tool}.`,
    detail: {
      field: 'agent_id',
      submitted_value: agentId,
      expected: 'Synthesizer role',
    },
    action: currentSynthesizer 
      ? `You are an Investigator. ${currentSynthesizer} is the Synthesizer. Complete your investigation work instead.`
      : 'No Synthesizer designated yet. Complete investigation work and wait for user designation.',
  };
}

/**
 * Format question validation errors
 */
export function formatBinaryQuestionError(
  tool: string,
  submittedText: string,
  suggestedPattern: string,
  rewrittenExample: string
): ErrorResponse {
  return {
    status: 'error',
    code: 'BINARY_QUESTION',
    tool,
    message: `Question "${submittedText.substring(0, 50)}..." is answerable yes/no.`,
    detail: {
      field: 'text',
      submitted_value: submittedText,
      expected: 'Question probing failure modes, quality, or edge cases',
    },
    action: `Use pattern ${suggestedPattern}. Example: "${rewrittenExample}"`,
  };
}

/**
 * Format missing target files error
 */
export function formatMissingTargetFilesError(
  tool: string,
  phase: number
): ErrorResponse {
  return {
    status: 'error',
    code: 'MISSING_TARGET_FILES',
    phase,
    tool,
    message: 'target_files is empty or missing.',
    detail: {
      field: 'target_files',
      submitted_value: [],
      expected: 'At least one specific file path observed during Phase 1',
    },
    action: 'Re-read your Phase 1 observations and identify which files are relevant to this question before resubmitting.',
  };
}

/**
 * Format escalation required error
 */
export function formatEscalationRequiredError(
  tool: string,
  verdict: string,
  escalationQuestion: string
): ErrorResponse {
  return {
    status: 'error',
    code: 'ESCALATION_REQUIRED',
    tool,
    message: `Verdict ${verdict} requires an escalation_finding.`,
    detail: {
      field: 'escalation_finding',
      submitted_value: null,
      expected: 'Escalation finding from the escalation question',
    },
    action: `Investigate: "${escalationQuestion}" and populate escalation_finding with what you found before resubmitting. Do not skip this.`,
  };
}

/**
 * Format confirmation requires independent evidence error
 */
export function formatConfirmationRequiresEvidenceError(
  tool: string,
  agentId: string
): ErrorResponse {
  return {
    status: 'error',
    code: 'CONFIRMATION_REQUIRES_INDEPENDENT_EVIDENCE',
    tool,
    message: 'Confirm reactions must include independent evidence.',
    detail: {
      field: 'evidence',
      submitted_value: 'Missing or same as original',
      expected: 'Your own file path, line range, and reasoning',
    },
    action: 'Provide your own file path, your own line range, and your own reasoning — not a reference to the original finding\'s evidence. If you agree but have no independent evidence, do not confirm.',
  };
}

/**
 * Format checkpoint incomplete error
 */
export function formatCheckpointIncompleteError(
  tool: string,
  missingSubQuestions: { id: string; text: string }[]
): ErrorResponse {
  const missingList = missingSubQuestions.map(sq => `- ${sq.id}: ${sq.text.substring(0, 60)}...`).join('\n');

  return {
    status: 'error',
    code: 'CHECKPOINT_INCOMPLETE',
    tool,
    message: `Checkpoint incomplete: ${missingSubQuestions.length} sub-question(s) missing findings.`,
    failures: missingSubQuestions.map(sq => ({
      code: 'MISSING_SUB_QUESTION_FINDING',
      field: 'sub_question_id',
      submitted_value: null,
      expected: `Finding for ${sq.id}`,
      action: `Submit finding for sub-question: "${sq.text.substring(0, 80)}..."`,
    })),
    action: `Submit findings for all ${missingSubQuestions.length} sub-questions listed above before calling checkpoint again.`,
  };
}

/**
 * Format preconditions not met error
 */
export function formatPreconditionsNotMetError(
  tool: string,
  failures: { condition: string; detail: string; action: string }[]
): ErrorResponse {
  return {
    status: 'error',
    code: 'PRECONDITIONS_NOT_MET',
    tool,
    message: `${failures.length} precondition(s) not met before finalizing.`,
    failures: failures.map(f => ({
      code: f.condition,
      field: 'session',
      submitted_value: 'Incomplete',
      expected: f.condition,
      action: f.action,
    })),
    action: 'Fix all failures listed above and resubmit. Do not resubmit until all are resolved.',
  };
}
