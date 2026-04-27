/**
 * Question Validator - Error Response Contract Implementation
 *
 * Validates main questions against forbidden and required patterns.
 * Rule 2: Collect all failures before returning.
 * Uses structural validation (not LLM-based semantic judgment).
 */

import type {
  MainQuestion,
  RejectionReason,
  QuestionPattern,
  AuditDomain,
  SubQuestion,
  AuditDepth,
} from '../types/domain.js';
import {
  QuestionRejectedError,
  type ValidationFailure,
} from '../state/errors.js';

// ============================================================================
// Validation Result Types
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  failures?: ValidationFailure[];
}

// ============================================================================
// Forbidden Pattern Detection
// ============================================================================

/**
 * Check if a question is binary (yes/no answerable)
 */
function isBinaryQuestion(text: string): { isBinary: boolean; matchedPhrase?: string } {
  const normalizedText = text.toLowerCase().trim();

  // Binary question starters
  const binaryStarters = [
    { pattern: /^\s*is\s+/i, phrase: 'Is' },
    { pattern: /^\s*are\s+/i, phrase: 'Are' },
    { pattern: /^\s*does\s+/i, phrase: 'Does' },
    { pattern: /^\s*do\s+/i, phrase: 'Do' },
    { pattern: /^\s*can\s+/i, phrase: 'Can' },
    { pattern: /^\s*has\s+/i, phrase: 'Has' },
    { pattern: /^\s*have\s+/i, phrase: 'Have' },
  ];

  // Check for direct yes/no starters
  for (const { pattern, phrase } of binaryStarters) {
    if (pattern.test(normalizedText)) {
      // But allow if it contains probing words
      const probingWords = ['how', 'why', 'what happens', 'failure', 'edge', 'case', 'fail'];
      const hasProbing = probingWords.some(word => normalizedText.includes(word));

      if (!hasProbing) {
        return { isBinary: true, matchedPhrase: phrase };
      }
    }
  }

  // Check for presence-only questions
  const presencePatterns = [
    { pattern: /is\s+.*\s+implemented/i, phrase: 'is...implemented' },
    { pattern: /are\s+there\s+.*\s+tests/i, phrase: 'are there...tests' },
    { pattern: /does\s+.*\s+exist/i, phrase: 'does...exist' },
  ];

  for (const { pattern, phrase } of presencePatterns) {
    if (pattern.test(normalizedText)) {
      return { isBinary: true, matchedPhrase: phrase };
    }
  }

  return { isBinary: false };
}

/**
 * Check if a question is a coverage check
 */
function isCoverageCheck(text: string): { isCoverage: boolean; matchedPhrase?: string } {
  const coveragePatterns = [
    { pattern: /are\s+there\s+tests/i, phrase: 'are there tests' },
    { pattern: /is\s+.*\s+tested/i, phrase: 'is...tested' },
    { pattern: /test\s+coverage/i, phrase: 'test coverage' },
    { pattern: /how\s+many\s+tests/i, phrase: 'how many tests' },
  ];

  const textLower = text.toLowerCase();
  for (const { pattern, phrase } of coveragePatterns) {
    if (pattern.test(textLower)) {
      return { isCoverage: true, matchedPhrase: phrase };
    }
  }

  return { isCoverage: false };
}

/**
 * Check if a question is subjective
 */
function isSubjective(text: string): { isSubjective: boolean; matchedPhrase?: string } {
  const subjectivePatterns = [
    { pattern: /is\s+.*\s+clean/i, phrase: 'is...clean' },
    { pattern: /is\s+.*\s+good/i, phrase: 'is...good' },
    { pattern: /is\s+.*\s+bad/i, phrase: 'is...bad' },
    { pattern: /is\s+.*\s+proper/i, phrase: 'is...proper' },
    { pattern: /code\s+quality/i, phrase: 'code quality' },
    { pattern: /maintainable/i, phrase: 'maintainable' },
    { pattern: /readable/i, phrase: 'readable' },
  ];

  const textLower = text.toLowerCase();
  for (const { pattern, phrase } of subjectivePatterns) {
    if (pattern.test(textLower)) {
      return { isSubjective: true, matchedPhrase: phrase };
    }
  }

  return { isSubjective: false };
}

/**
 * Check if a question only covers the happy path
 */
function isHappyPathOnly(text: string, edgeCaseTargeted: string): { isHappyPath: boolean; matchedPhrase?: string } {
  const happyPathPatterns = [
    { pattern: /how\s+does\s+.*\s+work/i, phrase: 'how does...work' },
    { pattern: /what\s+is\s+the\s+flow/i, phrase: 'what is the flow' },
    { pattern: /describe\s+the\s+process/i, phrase: 'describe the process' },
    { pattern: /explain\s+how/i, phrase: 'explain how' },
  ];

  const textLower = text.toLowerCase();
  const edgeCaseLower = edgeCaseTargeted.toLowerCase();

  // Check if main question is happy-path oriented
  let matchedPhrase: string | undefined;
  for (const { pattern, phrase } of happyPathPatterns) {
    if (pattern.test(textLower)) {
      matchedPhrase = phrase;
      break;
    }
  }

  if (!matchedPhrase) {
    return { isHappyPath: false };
  }

  // Check if edge case is actually about failures
  const failureIndicators = [
    'fail', 'error', 'exception', 'timeout', 'crash',
    'corrupt', 'invalid', 'malformed', 'missing',
    'edge', 'boundary', 'race', 'deadlock',
    'leak', 'overflow', 'underflow', 'bypass', 'bypassed'
  ];

  const hasFailureIndicator = failureIndicators.some(indicator =>
    edgeCaseLower.includes(indicator)
  );

  // If happy path question but no failure indicator in edge case
  return { isHappyPath: !hasFailureIndicator, matchedPhrase };
}

// ============================================================================
// Required Pattern Validation
// ============================================================================

/**
 * Domain-specific question pattern guidance
 */
const DOMAIN_PATTERNS: Record<AuditDomain, QuestionPattern[]> = {
  security: ['VALIDATION_BYPASS', 'DATA_LEAKAGE', 'DEPENDENCY_COMPROMISE', 'INVARIANT_MISSING'],
  performance: ['ASYNC_FAILURE', 'IMPLICIT_MUTATION', 'INVARIANT_MISSING'],
  architecture: ['ACCIDENTAL_COUPLING', 'IMPLICIT_MUTATION', 'INVARIANT_MISSING'],
  data_integrity: ['ASYNC_FAILURE', 'INVARIANT_MISSING', 'VALIDATION_BYPASS'],
  observability: ['INVARIANT_MISSING', 'ASYNC_FAILURE'],
  compliance: ['DATA_LEAKAGE', 'VALIDATION_BYPASS', 'INVARIANT_MISSING'],
};

/**
 * Pattern-specific validation and suggested rewrites
 */
const PATTERN_VALIDATIONS: Record<QuestionPattern, {
  validate: (text: string) => boolean;
  suggestedRewrite: string;
  description: string;
}> = {
  ASYNC_FAILURE: {
    validate: (t) => /when.*fail|what.*happen|async|concurrent|timeout|abort|cleanup|rollback/i.test(t),
    suggestedRewrite: 'When [operation] times out or fails, what cleanup/rollback ensures partial state is not left behind?',
    description: 'probes failure modes and cleanup in async operations',
  },
  ACCIDENTAL_COUPLING: {
    validate: (t) => /why.*know|coupling|depend|layer|violation|why.*import/i.test(t),
    suggestedRewrite: 'Why does [layer A] need to know about [implementation detail of layer B]?',
    description: 'probes layering violations and hidden dependencies',
  },
  VALIDATION_BYPASS: {
    validate: (t) => /validat|bypass|defense|sanitiz|escap|where.*validated/i.test(t),
    suggestedRewrite: 'Where is [user input] validated, and what happens if validation is bypassed at a lower layer?',
    description: 'probes trust boundaries and defense in depth',
  },
  IMPLICIT_MUTATION: {
    validate: (t) => /mutat|state|depend|side.*effect|shared|concurrent.*access/i.test(t),
    suggestedRewrite: 'What shared state can be mutated implicitly, and what prevents race conditions?',
    description: 'probes shared mutable state and race conditions',
  },
  DEPENDENCY_COMPROMISE: {
    validate: (t) => /compromise|supply.*chain|blast.*radius|third.*party|dependency/i.test(t),
    suggestedRewrite: 'If [dependency] is compromised, what is the blast radius and containment strategy?',
    description: 'probes supply chain risk and blast radius',
  },
  DATA_LEAKAGE: {
    validate: (t) => /leak|log|cache|serial|error.*message|expos|sensitiv|pii/i.test(t),
    suggestedRewrite: 'Where might sensitive data leak into logs, caches, or error messages?',
    description: 'probes PII exposure and secret sprawl',
  },
  INVARIANT_MISSING: {
    validate: (t) => /invariant|assum|enforc|guard|contract|what.*guarantee/i.test(t),
    suggestedRewrite: 'What invariant is assumed but not enforced, and what breaks it?',
    description: 'probes implicit contracts and missing guards',
  },
};

/**
 * Validate that question uses a required pattern
 */
function validateRequiredPattern(
  text: string,
  domainPattern: QuestionPattern,
  domain: AuditDomain
): { valid: boolean; failure?: ValidationFailure } {
  const validPatterns = DOMAIN_PATTERNS[domain];

  if (!validPatterns.includes(domainPattern)) {
    return {
      valid: false,
      failure: {
        code: 'FORBIDDEN_PATTERN',
        field: 'domain_pattern',
        submitted_value: domainPattern,
        expected: `Recommended patterns for ${domain}: ${validPatterns.join(', ')}`,
        action: `Use one of the recommended patterns: ${validPatterns.join(', ')}. ${validPatterns[0]} is most commonly used for ${domain} audits.`,
      },
    };
  }

  // Validate pattern-specific content
  const validation = PATTERN_VALIDATIONS[domainPattern];
  if (!validation.validate(text)) {
    return {
      valid: false,
      failure: {
        code: 'FORBIDDEN_PATTERN',
        field: 'text',
        submitted_value: text.substring(0, 100),
        expected: `Question that ${validation.description}`,
        action: `Rewrite using ${domainPattern} pattern: "${validation.suggestedRewrite}"`,
      },
    };
  }

  return { valid: true };
}

// ============================================================================
// Main Question Validation
// ============================================================================

/**
 * Validate a main question - collects ALL failures before returning
 * Rule 2: Collect all failures before returning.
 */
export function validateMainQuestion(
  question: MainQuestion,
  domain: AuditDomain
): ValidationResult {
  const failures: ValidationFailure[] = [];

  // Check for missing target files
  if (!question.target_files || question.target_files.length === 0) {
    failures.push({
      code: 'MISSING_TARGET_FILES',
      field: 'target_files',
      submitted_value: question.target_files || [],
      expected: 'At least one specific file path observed during Phase 1',
      action: 'Re-read your Phase 1 observations and identify which files are relevant to this question before resubmitting.',
    });
  }

  // Check suspicion rationale
  if (!question.suspicion_rationale || question.suspicion_rationale.length < 20) {
    failures.push({
      code: 'MISSING_SUSPICION_RATIONALE',
      field: 'suspicion_rationale',
      submitted_value: question.suspicion_rationale || '',
      expected: 'Explanation of at least 20 characters describing why this area is suspected to have defects',
      action: 'Explain why the targeted area is suspected to have a defect — not what it does. What did you observe in Phase 1 that made you suspicious of this area?',
    });
  }

  // Check edge case targeted
  if (!question.edge_case_targeted || question.edge_case_targeted.length < 10) {
    failures.push({
      code: 'MISSING_EDGE_CASE',
      field: 'edge_case_targeted',
      submitted_value: question.edge_case_targeted || '',
      expected: 'Specific failure mode being probed',
      action: 'Name the specific failure mode being probed — timeout, partial write, null input, concurrent access, etc. It cannot be left empty.',
    });
  }

  // Check for binary questions
  const binaryCheck = isBinaryQuestion(question.text);
  if (binaryCheck.isBinary) {
    // Suggest the best pattern based on the question text
    let suggestedPattern: QuestionPattern = 'VALIDATION_BYPASS';
    const textLower = question.text.toLowerCase();
    if (/auth|login|credential|password|token/i.test(textLower)) {
      suggestedPattern = 'VALIDATION_BYPASS';
    } else if (/async|await|promise|callback|timeout/i.test(textLower)) {
      suggestedPattern = 'ASYNC_FAILURE';
    } else if (/import|depend|module|package/i.test(textLower)) {
      suggestedPattern = 'DEPENDENCY_COMPROMISE';
    }

    const validation = PATTERN_VALIDATIONS[suggestedPattern];
    failures.push({
      code: 'BINARY_QUESTION',
      field: 'text',
      submitted_value: question.text,
      expected: 'A question probing failure modes, quality, or edge cases — not one answerable yes/no',
      action: `The phrase "${binaryCheck.matchedPhrase}" makes this binary. Rewrite using ${suggestedPattern}: "${validation.suggestedRewrite}"`,
    });
  }

  // Check for coverage checks
  const coverageCheck = isCoverageCheck(question.text);
  if (coverageCheck.isCoverage) {
    failures.push({
      code: 'FORBIDDEN_PATTERN',
      field: 'text',
      submitted_value: question.text,
      expected: 'Question probing test quality and failure detection, not presence of tests',
      action: `The phrase "${coverageCheck.matchedPhrase}" checks coverage. Instead, ask: "Which failure modes in [component] are NOT covered by tests, and what would trigger them?"`,
    });
  }

  // Check for subjective questions
  const subjectiveCheck = isSubjective(question.text);
  if (subjectiveCheck.isSubjective) {
    failures.push({
      code: 'FORBIDDEN_PATTERN',
      field: 'text',
      submitted_value: question.text,
      expected: 'Question about observable behaviors, failure modes, or structural properties',
      action: `The phrase "${subjectiveCheck.matchedPhrase}" is subjective. Reframe around concrete failure scenarios: what input would cause this to fail, and what would the failure look like?`,
    });
  }

  // Check for happy-path-only questions
  const happyPathCheck = isHappyPathOnly(question.text, question.edge_case_targeted || '');
  if (happyPathCheck.isHappyPath) {
    failures.push({
      code: 'HAPPY_PATH_ONLY',
      field: 'text',
      submitted_value: question.text,
      expected: 'Question probing failure modes, not just success path',
      action: `The phrase "${happyPathCheck.matchedPhrase}" describes the success path. Reframe around what happens when the operation fails, is bypassed, or receives unexpected input.`,
    });
  }

  // Validate domain pattern
  const patternResult = validateRequiredPattern(
    question.text,
    question.domain_pattern,
    domain
  );
  if (!patternResult.valid && patternResult.failure) {
    failures.push(patternResult.failure);
  }

  if (failures.length > 0) {
    return { valid: false, failures };
  }

  return { valid: true };
}

// ============================================================================
// Sub-Question Validation
// ============================================================================

interface SubQuestionConfig {
  min: number;
  max: number;
  requireEscalation: boolean;
}

const DEPTH_CONFIG: Record<AuditDepth, SubQuestionConfig> = {
  standard: { min: 3, max: 4, requireEscalation: false },
  deep: { min: 4, max: 5, requireEscalation: true },
  forensic: { min: 5, max: 6, requireEscalation: true },
};

/**
 * Validate sub-questions - collects ALL failures before returning
 * Rule 2: Collect all failures before returning.
 */
export function validateSubQuestions(
  _mainQuestionId: string,
  subQuestions: SubQuestion[],
  depth: AuditDepth
): ValidationResult {
  const failures: ValidationFailure[] = [];
  const config = DEPTH_CONFIG[depth];

  // Check count
  if (subQuestions.length < config.min || subQuestions.length > config.max) {
    const action = subQuestions.length < config.min
      ? `Add ${config.min - subQuestions.length} more sub-question(s) to meet the minimum of ${config.min}.`
      : `Remove ${subQuestions.length - config.max} sub-question(s) to meet the maximum of ${config.max}.`;

    failures.push({
      code: 'SUB_QUESTION_COUNT_VIOLATION',
      field: 'sub_questions',
      submitted_value: subQuestions.length,
      expected: `${config.min}-${config.max} sub-questions for ${depth} depth`,
      action,
    });
  }

  // Check each sub-question
  for (let i = 0; i < subQuestions.length; i++) {
    const sq = subQuestions[i];

    // Validate target files count
    if (sq.target_files.length === 0) {
      failures.push({
        code: 'MISSING_TARGET_FILES',
        field: `sub_questions[${i}].target_files`,
        submitted_value: [],
        expected: 'At least 1 target file',
        action: `Add target files to sub-question ${i + 1}. Sub-questions must be answerable by reading code.`,
      });
    } else if (sq.target_files.length > 3) {
      failures.push({
        code: 'TOO_MANY_TARGET_FILES',
        field: `sub_questions[${i}].target_files`,
        submitted_value: sq.target_files,
        expected: 'Maximum 3 target files per sub-question',
        action: `Sub-questions must be answerable by reading at most 3 files. Narrow the scope of sub-question ${i + 1} or split it into two sub-questions.`,
      });
    }

    // Validate pass criteria
    if (!sq.pass_criteria || sq.pass_criteria.length < 10) {
      failures.push({
        code: 'MISSING_PASS_CRITERIA',
        field: `sub_questions[${i}].pass_criteria`,
        submitted_value: sq.pass_criteria || '',
        expected: 'Clear criteria for PASS verdict',
        action: `Describe what evidence in the code would constitute a passing answer for sub-question ${i + 1} — not just "it works." What would you need to see to be confident this is not a problem?`,
      });
    }

    // Validate fail criteria
    if (!sq.fail_criteria || sq.fail_criteria.length < 10) {
      failures.push({
        code: 'MISSING_FAIL_CRITERIA',
        field: `sub_questions[${i}].fail_criteria`,
        submitted_value: sq.fail_criteria || '',
        expected: 'Clear criteria for FAIL verdict',
        action: `Describe what evidence would constitute a failing answer for sub-question ${i + 1}. What would you need to see to confirm a defect exists?`,
      });
    }

    // Validate evidence pattern
    if (!sq.evidence_pattern || sq.evidence_pattern.length < 10) {
      failures.push({
        code: 'MISSING_EVIDENCE_PATTERN',
        field: `sub_questions[${i}].evidence_pattern`,
        submitted_value: sq.evidence_pattern || '',
        expected: 'Concrete evidence pattern to look for',
        action: `Describe what to look for concretely in sub-question ${i + 1} — function names, config keys, code patterns, method calls. It cannot be a vague description.`,
      });
    }

    // Validate escalation question (required for deep and forensic)
    if (config.requireEscalation && (!sq.escalation_question || sq.escalation_question.length < 10)) {
      failures.push({
        code: 'MISSING_ESCALATION_QUESTION',
        field: `sub_questions[${i}].escalation_question`,
        submitted_value: sq.escalation_question || '',
        expected: 'Follow-up question for FAIL/SUSPICIOUS scenarios',
        action: `${depth} depth requires an escalation question for every sub-question. Add a follow-up question for sub-question ${i + 1} that would be asked if the verdict is FAIL or SUSPICIOUS.`,
      });
    }
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
 * Throw validation error for invalid questions
 */
export function assertQuestionValid(
  result: ValidationResult,
  tool: string = 'submit_question'
): asserts result is { valid: true } {
  if (!result.valid && result.failures) {
    // Use the first failure's code as the primary reason
    const primaryFailure = result.failures[0];
    throw new QuestionRejectedError(
      primaryFailure.code as RejectionReason,
      tool,
      result.failures.length > 1
        ? `Fix all ${result.failures.length} failures listed in the response.`
        : primaryFailure.action,
      undefined,
      result.failures
    );
  }
}

/**
 * Throw validation error for invalid sub-questions
 */
export function assertSubQuestionsValid(
  result: ValidationResult,
  tool: string = 'submit_sub_questions'
): asserts result is { valid: true } {
  if (!result.valid && result.failures) {
    const primaryFailure = result.failures[0];
    throw new QuestionRejectedError(
      primaryFailure.code as RejectionReason,
      tool,
      result.failures.length > 1
        ? `Fix all ${result.failures.length} failures listed in the response.`
        : primaryFailure.action,
      undefined,
      result.failures
    );
  }
}
