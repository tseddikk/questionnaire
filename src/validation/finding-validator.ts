/**
 * Finding Validator
 * 
 * Validates findings against protocol rules.
 * Enforces escalation requirements for FAIL/SUSPICIOUS verdicts.
 */

import type { Finding, Verdict } from '../types/domain.js';
import { FindingRejectedError } from '../state/errors.js';

// ============================================================================
// Escalation Validation
// ============================================================================

/**
 * Verdicts that require escalation
 */
const ESCALATION_REQUIRED_VERDICTS: Verdict[] = ['FAIL', 'SUSPICIOUS'];

/**
 * Check if a verdict requires escalation
 */
export function requiresEscalation(verdict: Verdict): boolean {
  return ESCALATION_REQUIRED_VERDICTS.includes(verdict);
}

// ============================================================================
// Evidence Validation
// ============================================================================

/**
 * Validate evidence structure
 */
export function validateEvidence(
  evidence: Finding['evidence'],
  evidenceFound: boolean
): { valid: boolean; guidance?: string } {
  // If evidence_found is false, evidence should be null
  if (!evidenceFound) {
    if (evidence !== null) {
      return {
        valid: false,
        guidance: 'When evidence_found is false, evidence must be null. ' +
          'Use evidence_found=false to indicate evidence was expected but not found.',
      };
    }
    return { valid: true };
  }
  
  // If evidence_found is true, evidence must be present
  if (evidenceFound && !evidence) {
    return {
      valid: false,
      guidance: 'When evidence_found is true, evidence must be provided with ' +
        'file_path, line_start, line_end, and snippet.',
    };
  }
  
  // Validate evidence fields
  if (evidence) {
    if (!evidence.file_path || evidence.file_path.length === 0) {
      return {
        valid: false,
        guidance: 'Evidence must include a non-empty file_path.',
      };
    }
    
    if (evidence.line_start < 1) {
      return {
        valid: false,
        guidance: 'Evidence line_start must be a positive integer.',
      };
    }
    
    if (evidence.line_end < evidence.line_start) {
      return {
        valid: false,
        guidance: 'Evidence line_end must be >= line_start.',
      };
    }
    
    if (!evidence.snippet || evidence.snippet.length === 0) {
      return {
        valid: false,
        guidance: 'Evidence must include a code snippet.',
      };
    }
  }
  
  return { valid: true };
}

// ============================================================================
// Finding Validation
// ============================================================================

export interface FindingValidationResult {
  valid: boolean;
  reason?: string;
  guidance?: string;
}

/**
 * Validate a finding
 */
export function validateFinding(finding: Finding): FindingValidationResult {
  // Validate evidence
  const evidenceResult = validateEvidence(finding.evidence, finding.evidence_found);
  if (!evidenceResult.valid) {
    return {
      valid: false,
      reason: 'MISSING_FILE_CITATION',
      guidance: evidenceResult.guidance!,
    };
  }
  
  // Validate answer
  if (!finding.answer || finding.answer.length === 0) {
    return {
      valid: false,
      reason: 'VALIDATION_ERROR',
      guidance: 'Finding must include an answer describing what was discovered.',
    };
  }
  
  // Check escalation requirement for FAIL/SUSPICIOUS
  if (requiresEscalation(finding.verdict)) {
    if (!finding.escalation_finding || finding.escalation_finding.length === 0) {
      return {
        valid: false,
        reason: 'ESCALATION_REQUIRED',
        guidance: `Verdict '${finding.verdict}' requires an escalation_finding. ` +
          'You must follow the escalation question from the sub-question definition ' +
          'and record your findings before submitting.',
      };
    }
  }
  
  // Validate severity matches verdict
  if (finding.verdict === 'PASS' && finding.severity !== 'info') {
    return {
      valid: false,
      reason: 'VALIDATION_ERROR',
      guidance: 'PASS verdict should have severity "info". ' +
        'Use FAIL or SUSPICIOUS for higher severities.',
    };
  }
  
  if (finding.verdict === 'FAIL' && finding.severity === 'info') {
    return {
      valid: false,
      reason: 'VALIDATION_ERROR',
      guidance: 'FAIL verdict cannot have severity "info". ' +
        'Use warning, critical, or catastrophic.',
    };
  }
  
  return { valid: true };
}

/**
 * Assert finding is valid, throw if not
 */
export function assertFindingValid(
  result: FindingValidationResult
): asserts result is { valid: true } {
  if (!result.valid) {
    throw new FindingRejectedError(
      result.reason as import('../types/domain.js').RejectionReason,
      result.guidance!
    );
  }
}

/**
 * Validate finding for storage
 * This is the full validation that runs before accepting a finding
 */
export function validateFindingForSubmission(
  finding: Finding
): void {
  const result = validateFinding(finding);
  assertFindingValid(result);
}
