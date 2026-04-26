/**
 * Custom Error Classes
 * 
 * Domain-specific errors for different failure modes.
 * Each error carries enough context for meaningful error messages.
 */

import type { RejectionReason, AuditPhase } from '../types/domain.js';

// ============================================================================
// Base Error
// ============================================================================

export class AuditError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AuditError';
    Object.setPrototypeOf(this, AuditError.prototype);
  }
}

// ============================================================================
// Session Errors
// ============================================================================

export class SessionNotFoundError extends AuditError {
  constructor(sessionId: string) {
    super(
      `Session not found: ${sessionId}`,
      'SESSION_NOT_FOUND',
      { sessionId }
    );
    this.name = 'SessionNotFoundError';
    Object.setPrototypeOf(this, SessionNotFoundError.prototype);
  }
}

export class SessionExpiredError extends AuditError {
  constructor(sessionId: string) {
    super(
      `Session expired: ${sessionId}`,
      'SESSION_EXPIRED',
      { sessionId }
    );
    this.name = 'SessionExpiredError';
    Object.setPrototypeOf(this, SessionExpiredError.prototype);
  }
}

// ============================================================================
// Phase Errors
// ============================================================================

export class PhaseViolationError extends AuditError {
  constructor(
    currentPhase: AuditPhase,
    requiredPhase: AuditPhase,
    operation: string
  ) {
    super(
      `Phase violation: ${operation} requires phase ${requiredPhase}, but current phase is ${currentPhase}`,
      'PHASE_VIOLATION',
      { currentPhase, requiredPhase, operation }
    );
    this.name = 'PhaseViolationError';
    Object.setPrototypeOf(this, PhaseViolationError.prototype);
  }
}

// ============================================================================
// Validation Errors
// ============================================================================

export class ValidationError extends AuditError {
  constructor(
    message: string,
    public readonly field: string,
    public readonly value: unknown
  ) {
    super(
      message,
      'VALIDATION_ERROR',
      { field, value }
    );
    this.name = 'ValidationError';
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

// ============================================================================
// Question Errors
// ============================================================================

export class QuestionRejectedError extends AuditError {
  constructor(
    reason: RejectionReason,
    public readonly guidance: string,
    public readonly field?: string
  ) {
    super(
      `Question rejected: ${reason}`,
      reason,
      { reason, guidance, field }
    );
    this.name = 'QuestionRejectedError';
    Object.setPrototypeOf(this, QuestionRejectedError.prototype);
  }
}

// ============================================================================
// Finding Errors
// ============================================================================

export class EscalationRequiredError extends AuditError {
  constructor(subQuestionId: string) {
    super(
      `Escalation required: Sub-question ${subQuestionId} has FAIL or SUSPICIOUS verdict but no escalation_finding`,
      'ESCALATION_REQUIRED',
      { subQuestionId }
    );
    this.name = 'EscalationRequiredError';
    Object.setPrototypeOf(this, EscalationRequiredError.prototype);
  }
}

export class FindingRejectedError extends AuditError {
  constructor(
    reason: RejectionReason,
    public readonly guidance: string
  ) {
    super(
      `Finding rejected: ${reason}`,
      reason,
      { reason, guidance }
    );
    this.name = 'FindingRejectedError';
    Object.setPrototypeOf(this, FindingRejectedError.prototype);
  }
}

// ============================================================================
// Checkpoint Errors
// ============================================================================

export class CheckpointIncompleteError extends AuditError {
  constructor(
    mainQuestionId: string,
    missingSubQuestions: string[]
  ) {
    super(
      `Checkpoint incomplete: Missing findings for ${missingSubQuestions.length} sub-questions`,
      'CHECKPOINT_INCOMPLETE',
      { mainQuestionId, missingSubQuestions }
    );
    this.name = 'CheckpointIncompleteError';
    Object.setPrototypeOf(this, CheckpointIncompleteError.prototype);
  }
}

// ============================================================================
// Sub-Question Errors
// ============================================================================

export class SubQuestionCountViolationError extends AuditError {
  constructor(
    expectedMin: number,
    expectedMax: number,
    actual: number,
    depth: string
  ) {
    super(
      `Sub-question count violation: Expected ${expectedMin}-${expectedMax} for ${depth} depth, got ${actual}`,
      'SUB_QUESTION_COUNT_VIOLATION',
      { expectedMin, expectedMax, actual, depth }
    );
    this.name = 'SubQuestionCountViolationError';
    Object.setPrototypeOf(this, SubQuestionCountViolationError.prototype);
  }
}

// ============================================================================
// Observation Errors
// ============================================================================

export class MissingFileCitationError extends AuditError {
  constructor(
    observationType: string,
    index: number
  ) {
    super(
      `Missing file citation: ${observationType}[${index}] has no file_path`,
      'MISSING_FILE_CITATION',
      { observationType, index }
    );
    this.name = 'MissingFileCitationError';
    Object.setPrototypeOf(this, MissingFileCitationError.prototype);
  }
}
