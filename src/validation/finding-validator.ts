/**
 * Finding Validator - Error Response Contract Implementation
 *
 * Validates findings against protocol rules.
 * Enforces escalation requirements for FAIL/SUSPICIOUS verdicts.
 * Rule 2: Collect all failures before returning.
 */

import type { Finding, Verdict, Severity } from '../types/domain.js';
import {
  FindingRejectedError,
  type ValidationFailure,
} from '../state/errors.js';

// ============================================================================
// Validation Result Types
// ============================================================================

export interface FindingValidationResult {
  valid: boolean;
  failures?: ValidationFailure[];
}

// ============================================================================
// Verdict and Severity Constants
// ============================================================================

/**
 * Verdicts that require escalation
 */
const ESCALATION_REQUIRED_VERDICTS: Verdict[] = ['FAIL', 'SUSPICIOUS'];

/**
 * Valid verdicts
 */
const VALID_VERDICTS: Verdict[] = ['PASS', 'FAIL', 'SUSPICIOUS', 'UNCERTAIN'];

/**
 * Valid severities
 */
const VALID_SEVERITIES: Severity[] = ['info', 'warning', 'critical', 'catastrophic'];

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
 * Validate evidence structure - collects ALL failures
 */
export function validateEvidence(
  evidence: Finding['evidence'],
  evidenceFound: boolean
): { valid: boolean; failures?: ValidationFailure[] } {
  const failures: ValidationFailure[] = [];

  // If evidence_found is false, evidence should be null
  if (!evidenceFound) {
    if (evidence !== null && evidence !== undefined) {
      failures.push({
        code: 'INVALID_EVIDENCE_STATE',
        field: 'evidence',
        submitted_value: evidence,
        expected: 'null when evidence_found is false',
        action: 'Set evidence to null when evidence_found is false. The absence of expected evidence is itself the finding — explain what was expected and why it is notable.',
      });
    }
    return failures.length > 0 ? { valid: false, failures } : { valid: true };
  }

  // If evidence_found is true, evidence must be present
  if (evidenceFound && !evidence) {
    failures.push({
      code: 'MISSING_EVIDENCE',
      field: 'evidence',
      submitted_value: null,
      expected: 'Evidence with file_path, line_start, line_end, and snippet',
      action: 'Provide evidence with file_path (exact file location), line_start, line_end, and snippet (code excerpt).',
    });
    return { valid: false, failures };
  }

  // Validate evidence fields
  if (evidence) {
    if (!evidence.file_path || evidence.file_path.length === 0) {
      failures.push({
        code: 'MISSING_FILE_CITATION',
        field: 'evidence.file_path',
        submitted_value: evidence.file_path,
        expected: 'Non-empty file path',
        action: 'Provide the exact file_path where the evidence is located.',
      });
    }

    if (evidence.line_start < 1) {
      failures.push({
        code: 'INVALID_LINE_START',
        field: 'evidence.line_start',
        submitted_value: evidence.line_start,
        expected: 'Positive integer (1-indexed)',
        action: 'line_start must be a positive integer (line numbers start at 1).',
      });
    }

    if (evidence.line_end < evidence.line_start) {
      failures.push({
        code: 'INVALID_LINE_RANGE',
        field: 'evidence.line_end',
        submitted_value: { line_start: evidence.line_start, line_end: evidence.line_end },
        expected: 'line_end >= line_start',
        action: 'line_end must be greater than or equal to line_start.',
      });
    }

    if (!evidence.snippet || evidence.snippet.length === 0) {
      failures.push({
        code: 'MISSING_SNIPPET',
        field: 'evidence.snippet',
        submitted_value: evidence.snippet,
        expected: 'Non-empty code excerpt',
        action: 'Include a code snippet that shows the relevant code. This helps others understand the finding.',
      });
    }
  }

  if (failures.length > 0) {
    return { valid: false, failures };
  }

  return { valid: true };
}

// ============================================================================
// Finding Validation
// ============================================================================

/**
 * Validate a finding - collects ALL failures before returning
 * Rule 2: Collect all failures before returning.
 */
export function validateFinding(
  finding: Finding,
  escalationQuestion?: string
): FindingValidationResult {
  const failures: ValidationFailure[] = [];

  // Validate verdict is valid
  if (!VALID_VERDICTS.includes(finding.verdict)) {
    failures.push({
      code: 'INVALID_VERDICT',
      field: 'verdict',
      submitted_value: finding.verdict,
      expected: 'One of: PASS, FAIL, SUSPICIOUS, UNCERTAIN',
      action: 'Use a valid verdict: PASS (code meets criteria), FAIL (defect confirmed), SUSPICIOUS (likely problem, needs more info), or UNCERTAIN (cannot determine).',
    });
  }

  // Validate severity is valid
  if (!VALID_SEVERITIES.includes(finding.severity)) {
    failures.push({
      code: 'INVALID_SEVERITY',
      field: 'severity',
      submitted_value: finding.severity,
      expected: 'One of: info, warning, critical, catastrophic',
      action: 'Use a valid severity: info (no issue), warning (minor concern), critical (significant defect), or catastrophic (severe risk).',
    });
  }

  // Validate answer
  if (!finding.answer || finding.answer.length === 0) {
    failures.push({
      code: 'MISSING_ANSWER',
      field: 'answer',
      submitted_value: finding.answer,
      expected: 'Non-empty answer describing what was discovered',
      action: 'Provide an answer describing what was discovered during investigation.',
    });
  } else if (!finding.evidence_found && finding.answer.length < 20) {
    // When evidence is not found, answer must explain what was expected
    failures.push({
      code: 'MISSING_EVIDENCE_EXPLANATION',
      field: 'answer',
      submitted_value: finding.answer,
      expected: 'Explanation of what was expected and why it is absent',
      action: 'When evidence_found is false, the answer must explain: what code or pattern was expected, where it was expected to be, and why its absence is notable. This explanation is itself the finding.',
    });
  }

  // Validate evidence
  const evidenceResult = validateEvidence(finding.evidence, finding.evidence_found);
  if (!evidenceResult.valid && evidenceResult.failures) {
    failures.push(...evidenceResult.failures);
  }

  // Check escalation requirement for FAIL/SUSPICIOUS
  if (requiresEscalation(finding.verdict)) {
    if (!finding.escalation_finding || finding.escalation_finding.length === 0) {
      failures.push({
        code: 'ESCALATION_REQUIRED',
        field: 'escalation_finding',
        submitted_value: finding.escalation_finding,
        expected: 'Finding from investigating the escalation question',
        action: escalationQuestion
          ? `Investigate: "${escalationQuestion}" and populate escalation_finding with what you found before resubmitting. Do not skip this.`
          : 'Populate escalation_finding with what you found from the escalation question. Do not skip this.',
      });
    }
  }

  // Validate severity matches verdict
  if (finding.verdict === 'PASS' && finding.severity !== 'info') {
    failures.push({
      code: 'SEVERITY_MISMATCH',
      field: 'severity',
      submitted_value: finding.severity,
      expected: 'info for PASS verdict',
      action: 'PASS verdict should have severity "info". Use FAIL or SUSPICIOUS for higher severities.',
    });
  }

  if (finding.verdict === 'FAIL' && finding.severity === 'info') {
    failures.push({
      code: 'SEVERITY_MISMATCH',
      field: 'severity',
      submitted_value: finding.severity,
      expected: 'warning, critical, or catastrophic for FAIL verdict',
      action: 'FAIL verdict cannot have severity "info". Use warning, critical, or catastrophic.',
    });
  }

  if (failures.length > 0) {
    return { valid: false, failures };
  }

  return { valid: true };
}

// ============================================================================
// Assertion Functions
// ============================================================================

/**
 * Assert finding is valid, throw if not
 */
export function assertFindingValid(
  result: FindingValidationResult,
  tool: string = 'submit_finding'
): asserts result is { valid: true } {
  if (!result.valid && result.failures) {
    const primaryFailure = result.failures[0];
    throw new FindingRejectedError(
      primaryFailure.code as import('../types/domain.js').RejectionReason,
      tool,
      result.failures.length > 1
        ? `Fix all ${result.failures.length} failures listed in the response.`
        : primaryFailure.action,
      primaryFailure.code === 'ESCALATION_REQUIRED' ? undefined : {
        field: primaryFailure.field,
        submitted_value: primaryFailure.submitted_value,
        expected: primaryFailure.expected,
      }
    );
  }
}

/**
 * Validate finding for submission
 * This is the full validation that runs before accepting a finding
 */
export function validateFindingForSubmission(
  finding: Finding,
  escalationQuestion?: string
): void {
  const result = validateFinding(finding, escalationQuestion);
  assertFindingValid(result, 'submit_finding');
}
