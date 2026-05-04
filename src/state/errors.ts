/**
 * Custom Error Classes - Error Response Contract Implementation
 *
 * Every error must return:
 * - status: "error"
 * - code: MACHINE_READABLE_CODE
 * - tool: Which tool was called
 * - message: One sentence description
 * - detail or failures: Field-level precision
 * - action: Concrete recovery instruction
 */

import type { RejectionReason, AuditPhase, CollaborativeSession, MainQuestion } from '../types/domain.js';

// ============================================================================
// Error Response Types
// ============================================================================

export interface ErrorDetail {
  field: string;
  submitted_value: unknown;
  expected: string;
}

export interface ValidationFailure {
  code: string;
  field: string;
  submitted_value: unknown;
  expected: string;
  action: string;
}

export interface SessionStateContext {
  current_phase?: number;
  current_phase_name?: string;
  main_questions_accepted?: number;
  sub_question_sets_submitted?: number;
  sub_question_sets_remaining?: number;
  next_required_tool?: string;
  next_required_action?: string;
}

export interface ErrorResponse {
  status: 'error';
  code: string;
  phase?: number;
  tool: string;
  message: string;
  detail?: ErrorDetail;
  failures?: ValidationFailure[];
  session_state?: SessionStateContext;
  action: string;
}

// ============================================================================
// Base Error
// ============================================================================

export class AuditError extends Error {
  public readonly status: 'error' = 'error';
  public readonly code: string;
  public readonly tool: string;
  public readonly action: string;
  public readonly phase?: number;
  public readonly detail?: ErrorDetail;
  public readonly failures?: ValidationFailure[];
  public readonly session_state?: SessionStateContext;

  constructor(options: {
    message: string;
    code: string;
    tool: string;
    action: string;
    phase?: number;
    detail?: ErrorDetail;
    failures?: ValidationFailure[];
    session_state?: SessionStateContext;
    cause?: unknown;
  }) {
    super(options.message);
    this.name = 'AuditError';
    this.code = options.code;
    this.tool = options.tool;
    this.action = options.action;
    this.phase = options.phase;
    this.detail = options.detail;
    this.failures = options.failures;
    this.session_state = options.session_state;
    Object.setPrototypeOf(this, AuditError.prototype);
  }

  /**
   * Convert to JSON-serializable error response
   */
  toJSON(): ErrorResponse {
    const response: ErrorResponse = {
      status: this.status,
      code: this.code,
      tool: this.tool,
      message: this.message,
      action: this.action,
    };

    if (this.phase !== undefined) {
      response.phase = this.phase;
    }
    if (this.detail) {
      response.detail = this.detail;
    }
    if (this.failures && this.failures.length > 0) {
      response.failures = this.failures;
    }
    if (this.session_state) {
      response.session_state = this.session_state;
    }

    return response;
  }
}

// ============================================================================
// Session Errors
// ============================================================================

export class SessionNotFoundError extends AuditError {
  constructor(sessionId: string, tool: string, repoPath?: string) {
    super({
      message: `Session ${sessionId} was not found.`,
      code: 'SESSION_NOT_FOUND',
      tool,
      detail: {
        field: 'session_id',
        submitted_value: sessionId,
        expected: 'Valid session ID',
      },
      action: repoPath
        ? `Call discover_sessions with repo_path "${repoPath}" to find the active session.`
        : 'Call discover_sessions with your repo_path to find the active session.',
    });
    this.name = 'SessionNotFoundError';
    Object.setPrototypeOf(this, SessionNotFoundError.prototype);
  }
}

export class SessionNotJoinableError extends AuditError {
  constructor(
    tool: string,
    sessionId: string,
    currentState: string
  ) {
    super({
      message: `Session ${sessionId} is in ${currentState} state and cannot be joined.`,
      code: 'SESSION_NOT_JOINABLE',
      tool,
      detail: {
        field: 'session_id',
        submitted_value: sessionId,
        expected: 'Session in investigation phase',
      },
      action: `The session is past the investigation phase. Call get_session_summary to read findings but you cannot join as an investigator.`,
    });
    this.name = 'SessionNotJoinableError';
    Object.setPrototypeOf(this, SessionNotJoinableError.prototype);
  }
}

export class RepoMismatchError extends AuditError {
  constructor(
    tool: string,
    sessionRepo: string,
    agentRepo: string
  ) {
    super({
      message: `Repository mismatch: session was created for ${sessionRepo}, agent is at ${agentRepo}.`,
      code: 'REPO_MISMATCH',
      tool,
      detail: {
        field: 'repo_path',
        submitted_value: agentRepo,
        expected: sessionRepo,
      },
      action: `Navigate to ${sessionRepo} before joining the session.`,
    });
    this.name = 'RepoMismatchError';
    Object.setPrototypeOf(this, RepoMismatchError.prototype);
  }
}

export class SessionExpiredError extends AuditError {
  constructor(sessionId: string, tool: string) {
    super({
      message: `Session ${sessionId} has expired.`,
      code: 'SESSION_EXPIRED',
      tool,
      detail: {
        field: 'session_id',
        submitted_value: sessionId,
        expected: 'Active session',
      },
      action: 'Initialize a new session with initialize_audit.',
    });
    this.name = 'SessionExpiredError';
    Object.setPrototypeOf(this, SessionExpiredError.prototype);
  }
}

// ============================================================================
// Phase Errors
// ============================================================================

export class PhaseViolationError extends AuditError {
  constructor(
    tool: string,
    currentPhase: AuditPhase,
    requiredPhase: AuditPhase,
    sessionState?: CollaborativeSession
  ) {
    const currentPhaseName = getPhaseName(currentPhase);
    const nextTool = getNextRequiredTool(currentPhase);
    const nextAction = getNextRequiredAction(currentPhase, sessionState);

    super({
      message: `${tool} cannot be called during Phase ${currentPhase} (${currentPhaseName}).`,
      code: 'PHASE_VIOLATION',
      phase: currentPhase,
      tool,
      detail: {
        field: 'phase',
        submitted_value: currentPhase,
        expected: `Phase ${requiredPhase}`,
      },
      session_state: buildSessionStateContext(currentPhase, currentPhaseName, nextTool, nextAction, sessionState),
      action: nextAction,
    });
    this.name = 'PhaseViolationError';
    Object.setPrototypeOf(this, PhaseViolationError.prototype);
  }
}

function getPhaseName(phase: AuditPhase): string {
  const names: Record<number, string> = {
    0: 'Initialization',
    1: 'Deep Discovery',
    2: 'Generate Main Questions',
    3: 'Generate Sub-Questions',
    4: 'Investigation',
    5: 'Synthesize Report',
  };
  return names[phase] || 'Unknown';
}

function getNextRequiredTool(phase: AuditPhase): string {
  const tools: Record<number, string> = {
    0: 'initialize_audit',
    1: 'submit_observations',
    2: 'submit_question',
    3: 'submit_sub_questions',
    4: 'submit_finding',
    5: 'finalize_report',
  };
  return tools[phase] || 'Unknown';
}

function getNextRequiredAction(phase: AuditPhase, _sessionState?: CollaborativeSession): string {
  const actions: Record<number, string> = {
    0: 'Call initialize_audit to start a new session.',
    1: 'Call submit_observations with your Phase 1 findings.',
    2: 'Call submit_question with 5-7 main questions (Phase 2).',
    3: `Call submit_sub_questions for each main question (Phase 3).`,
    4: 'Call submit_finding for each sub-question, then checkpoint.',
    5: 'All investigations complete. Call finalize_report to generate the audit report.',
  };
  return actions[phase] || 'Unknown phase.';
}

function buildSessionStateContext(
  currentPhase: AuditPhase,
  phaseName: string,
  nextTool: string,
  nextAction: string,
  sessionState?: CollaborativeSession
): SessionStateContext {
  const context: SessionStateContext = {
    current_phase: currentPhase,
    current_phase_name: phaseName,
    next_required_tool: nextTool,
    next_required_action: nextAction,
  };

  if (sessionState) {
    const mainQuestions: MainQuestion[] = sessionState.merged_questions || [];

    context.main_questions_accepted = mainQuestions.length;

    // Count how many main questions have sub-questions submitted (not individual sub-question count)
    const mainQuestionsWithSubQuestions = mainQuestions.filter(
      (mq) => mq.sub_question_ids && mq.sub_question_ids.length > 0
    ).length;

    context.sub_question_sets_submitted = mainQuestionsWithSubQuestions;
    context.sub_question_sets_remaining = (context.main_questions_accepted ?? 0) - (context.sub_question_sets_submitted ?? 0);
  }

  return context;
}

// ============================================================================
// Synthesizer Errors
// ============================================================================

export class SynthesizerOnlyError extends AuditError {
  constructor(tool: string, currentSynthesizer: string | null, agentId: string) {
    super({
      message: `Only the Synthesizer can call ${tool}.`,
      code: 'SYNTHESIZER_ONLY',
      tool,
      detail: {
        field: 'agent_id',
        submitted_value: agentId,
        expected: 'Synthesizer role',
      },
      action: currentSynthesizer
        ? `You are an Investigator. ${currentSynthesizer} is the Synthesizer. Complete your investigation work instead.`
        : 'No Synthesizer designated yet. Complete investigation work and wait for user designation.',
    });
    this.name = 'SynthesizerOnlyError';
    Object.setPrototypeOf(this, SynthesizerOnlyError.prototype);
  }
}

// ============================================================================
// Question Errors
// ============================================================================

export class QuestionRejectedError extends AuditError {
  constructor(
    reason: RejectionReason,
    tool: string,
    guidance: string,
    detail?: ErrorDetail,
    failures?: ValidationFailure[]
  ) {
    super({
      message: failures 
        ? `Question validation failed with ${failures.length} issue(s).`
        : `Question rejected: ${reason}`,
      code: reason,
      tool,
      detail,
      failures,
      action: guidance,
    });
    this.name = 'QuestionRejectedError';
    Object.setPrototypeOf(this, QuestionRejectedError.prototype);
  }
}

export class QuestionLimitReachedError extends AuditError {
  constructor(tool: string, currentCount: number) {
    super({
      message: `Question intake closed at 7 questions. Currently have ${currentCount}.`,
      code: 'QUESTION_LIMIT_REACHED',
      phase: 2,
      tool,
      detail: {
        field: 'questions_accepted',
        submitted_value: currentCount,
        expected: 'Maximum 7 questions',
      },
      action: `Question intake is closed at 7. Proceed to Phase 3 by calling submit_sub_questions for each accepted question.`,
    });
    this.name = 'QuestionLimitReachedError';
    Object.setPrototypeOf(this, QuestionLimitReachedError.prototype);
  }
}

// ============================================================================
// Sub-Question Errors
// ============================================================================

export class UnknownMainQuestionError extends AuditError {
  constructor(tool: string, mainQuestionId: string, validIds: string[]) {
    super({
      message: `Main question ${mainQuestionId} not found in session.`,
      code: 'UNKNOWN_MAIN_QUESTION',
      phase: 3,
      tool,
      detail: {
        field: 'main_question_id',
        submitted_value: mainQuestionId,
        expected: validIds.join(', ') || 'No valid questions',
      },
      action: `Resubmit with a valid main_question_id from: ${validIds.join(', ')}`,
    });
    this.name = 'UnknownMainQuestionError';
    Object.setPrototypeOf(this, UnknownMainQuestionError.prototype);
  }
}

// ============================================================================
// Finding Errors
// ============================================================================

export class FindingRejectedError extends AuditError {
  constructor(
    reason: RejectionReason,
    tool: string,
    guidance: string,
    detail?: ErrorDetail
  ) {
    super({
      message: `Finding rejected: ${reason}`,
      code: reason,
      phase: 4,
      tool,
      detail,
      action: guidance,
    });
    this.name = 'FindingRejectedError';
    Object.setPrototypeOf(this, FindingRejectedError.prototype);
  }
}

// ============================================================================
// Checkpoint Errors
// ============================================================================

export class CheckpointIncompleteError extends AuditError {
  constructor(
    tool: string,
    _mainQuestionId: string,
    missingSubQuestions: { id: string; text: string }[]
  ) {
    super({
      message: `Checkpoint incomplete: Missing findings for ${missingSubQuestions.length} sub-questions.`,
      code: 'CHECKPOINT_INCOMPLETE',
      phase: 4,
      tool,
      failures: missingSubQuestions.map(sq => ({
        code: 'MISSING_SUB_QUESTION_FINDING',
        field: 'sub_question_id',
        submitted_value: null,
        expected: `Finding for ${sq.id}`,
        action: `Submit finding for sub-question: "${sq.text.substring(0, 80)}${sq.text.length > 80 ? '...' : ''}"`,
      })),
      action: `Submit findings for all ${missingSubQuestions.length} sub-questions listed above before calling checkpoint again.`,
    });
    this.name = 'CheckpointIncompleteError';
    Object.setPrototypeOf(this, CheckpointIncompleteError.prototype);
  }
}

// ============================================================================
// Adjudication Errors
// ============================================================================

export class FindingNotContestedError extends AuditError {
  constructor(tool: string, findingId: string, currentStatus: string) {
    super({
      message: `Finding ${findingId} is not contested (status: ${currentStatus}).`,
      code: 'FINDING_NOT_CONTESTED',
      tool,
      detail: {
        field: 'finding_id',
        submitted_value: findingId,
        expected: 'Finding in contested status',
      },
      action: 'Adjudication is only required for contested findings. Call get_session_summary to see which findings are contested.',
    });
    this.name = 'FindingNotContestedError';
    Object.setPrototypeOf(this, FindingNotContestedError.prototype);
  }
}

// ============================================================================
// Observation Errors
// ============================================================================

export class MissingFileCitationError extends AuditError {
  constructor(
    tool: string,
    observationType: string,
    index: number
  ) {
    super({
      message: `Missing file citation: ${observationType}[${index}] has no file_path.`,
      code: 'MISSING_FILE_CITATION',
      phase: 1,
      tool,
      detail: {
        field: `${observationType}[${index}].file_path`,
        submitted_value: null,
        expected: 'Valid file path from Phase 1 observations',
      },
      action: `Add a file_path to ${observationType}[${index}] citing the exact file observed during Phase 1.`,
    });
    this.name = 'MissingFileCitationError';
    Object.setPrototypeOf(this, MissingFileCitationError.prototype);
  }
}

// ============================================================================
// General Validation Error
// ============================================================================


