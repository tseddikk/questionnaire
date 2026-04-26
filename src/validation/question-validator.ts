/**
 * Question Validator
 * 
 * Validates main questions against forbidden and required patterns.
 * Uses structural validation (not LLM-based semantic judgment).
 */

import type { 
  MainQuestion, 
  RejectionReason, 
  QuestionPattern,
  AuditDomain 
} from '../types/domain.js';
import { QuestionRejectedError } from '../state/errors.js';

// ============================================================================
// Forbidden Pattern Detection
// ============================================================================

/**
 * Check if a question is binary (yes/no answerable)
 */
function isBinaryQuestion(text: string): boolean {
  const normalizedText = text.toLowerCase().trim();
  
  // Binary question starters
  const binaryStarters = [
    /^\s*is\s+/i,
    /^\s*are\s+/i,
    /^\s*does\s+/i,
    /^\s*do\s+/i,
    /^\s*can\s+/i,
    /^\s*has\s+/i,
    /^\s*have\s+/i,
  ];
  
  // Check for direct yes/no starters
  for (const pattern of binaryStarters) {
    if (pattern.test(normalizedText)) {
      // But allow if it contains probing words
      const probingWords = ['how', 'why', 'what happens', 'failure', 'edge', 'case', 'fail'];
      const hasProbing = probingWords.some(word => normalizedText.includes(word));
      
      if (!hasProbing) {
        return true;
      }
    }
  }
  
  // Check for presence-only questions
  const presencePatterns = [
    /is\s+.*\s+implemented/i,
    /are\s+there\s+.*\s+tests/i,
    /does\s+.*\s+exist/i,
  ];
  
  for (const pattern of presencePatterns) {
    if (pattern.test(normalizedText)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Check if a question is a coverage check
 */
function isCoverageCheck(text: string): boolean {
  const coveragePatterns = [
    /are\s+there\s+tests/i,
    /is\s+.*\s+tested/i,
    /test\s+coverage/i,
    /how\s+many\s+tests/i,
  ];
  
  return coveragePatterns.some(pattern => pattern.test(text.toLowerCase()));
}

/**
 * Check if a question is subjective
 */
function isSubjective(text: string): boolean {
  const subjectivePatterns = [
    /is\s+.*\s+clean/i,
    /is\s+.*\s+good/i,
    /is\s+.*\s+bad/i,
    /is\s+.*\s+proper/i,
    /code\s+quality/i,
    /maintainable/i,
    /readable/i,
  ];
  
  return subjectivePatterns.some(pattern => pattern.test(text.toLowerCase()));
}

/**
 * Check if a question only covers the happy path
 */
function isHappyPathOnly(text: string, edgeCaseTargeted: string): boolean {
  const happyPathPatterns = [
    /how\s+does\s+.*\s+work/i,
    /what\s+is\s+the\s+flow/i,
    /describe\s+the\s+process/i,
    /explain\s+how/i,
  ];
  
  const textLower = text.toLowerCase();
  const edgeCaseLower = edgeCaseTargeted.toLowerCase();
  
  // Check if main question is happy-path oriented
  const isHappyPath = happyPathPatterns.some(pattern => pattern.test(textLower));
  
  // Check if edge case is actually about failures
  const failureIndicators = [
    'fail', 'error', 'exception', 'timeout', 'crash',
    'corrupt', 'invalid', 'malformed', 'missing',
    'edge', 'boundary', 'race', 'deadlock',
    'leak', 'overflow', 'underflow'
  ];
  
  const hasFailureIndicator = failureIndicators.some(indicator => 
    edgeCaseLower.includes(indicator)
  );
  
  // If happy path question but no failure indicator in edge case
  return isHappyPath && !hasFailureIndicator;
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
 * Validate that question uses a required pattern
 */
function validateRequiredPattern(
  text: string,
  domainPattern: QuestionPattern,
  domain: AuditDomain
): { valid: boolean; guidance: string } {
  const validPatterns = DOMAIN_PATTERNS[domain];
  
  if (!validPatterns.includes(domainPattern)) {
    return {
      valid: false,
      guidance: `Pattern '${domainPattern}' is not recommended for ${domain} audits. ` +
        `Recommended patterns: ${validPatterns.join(', ')}`,
    };
  }
  
  // Validate pattern-specific content
  const patternValidations: Record<QuestionPattern, (text: string) => boolean> = {
    ASYNC_FAILURE: (t) => /when.*fail|what.*happen|async|concurrent|timeout|abort/i.test(t),
    ACCIDENTAL_COUPLING: (t) => /why.*know|coupling|depend|layer|violation/i.test(t),
    VALIDATION_BYPASS: (t) => /validat|bypass|defense|sanitiz|escap/i.test(t),
    IMPLICIT_MUTATION: (t) => /mutat|state|depend|side.*effect/i.test(t),
    DEPENDENCY_COMPROMISE: (t) => /compromise|supply.*chain|blast.*radius|third.*party/i.test(t),
    DATA_LEAKAGE: (t) => /leak|log|cache|serial|error.*message|expos|sensitiv/i.test(t),
    INVARIANT_MISSING: (t) => /invariant|assum|enforc|guard|contract/i.test(t),
  };
  
  const validator = patternValidations[domainPattern];
  if (!validator(text)) {
    return {
      valid: false,
      guidance: `Question does not match the '${domainPattern}' pattern. ` +
        `Please ensure the question addresses the specific concerns of this pattern.`,
    };
  }
  
  return { valid: true, guidance: '' };
}

// ============================================================================
// Public Validation Functions
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  reason?: RejectionReason;
  guidance?: string;
  field?: string;
}

/**
 * Validate a main question
 */
export function validateMainQuestion(
  question: MainQuestion,
  domain: AuditDomain
): ValidationResult {
  // Check for empty required fields
  if (!question.target_files || question.target_files.length === 0) {
    return {
      valid: false,
      reason: 'MISSING_TARGET_FILES',
      guidance: 'Question must specify at least one target file to investigate.',
      field: 'target_files',
    };
  }
  
  // Check suspicion rationale
  if (!question.suspicion_rationale || question.suspicion_rationale.length < 20) {
    return {
      valid: false,
      reason: 'MISSING_SUSPICION_RATIONALE',
      guidance: 'Question must include a suspicion_rationale of at least 20 characters ' +
        'explaining WHY this component is suspected to have defects.',
      field: 'suspicion_rationale',
    };
  }
  
  // Check for binary questions
  if (isBinaryQuestion(question.text)) {
    return {
      valid: false,
      reason: 'BINARY_QUESTION',
      guidance: 'Question appears to be binary (yes/no). ' +
        'Rephrase to probe failure modes, edge cases, or quality characteristics. ' +
        'Example: Instead of "Is authentication implemented?" ask "What happens to ' +
        'unauthenticated requests that bypass the middleware check?"',
      field: 'text',
    };
  }
  
  // Check for coverage checks
  if (isCoverageCheck(question.text)) {
    return {
      valid: false,
      reason: 'FORBIDDEN_PATTERN',
      guidance: 'Coverage checks are forbidden. Probe test quality and failure detection, ' +
        'not just presence of tests.',
      field: 'text',
    };
  }
  
  // Check for subjective questions
  if (isSubjective(question.text)) {
    return {
      valid: false,
      reason: 'FORBIDDEN_PATTERN',
      guidance: 'Subjective questions cannot be audited. Frame questions around ' +
        'observable behaviors, failure modes, or structural properties.',
      field: 'text',
    };
  }
  
  // Check for happy-path-only questions
  if (isHappyPathOnly(question.text, question.edge_case_targeted)) {
    return {
      valid: false,
      reason: 'HAPPY_PATH_ONLY',
      guidance: 'Question describes success path but does not probe failure modes. ' +
        'Ensure edge_case_targeted addresses specific failure scenarios ' +
        '(timeouts, exceptions, invalid data, resource exhaustion).',
      field: 'edge_case_targeted',
    };
  }
  
  // Validate domain pattern
  const patternResult = validateRequiredPattern(
    question.text,
    question.domain_pattern,
    domain
  );
  
  if (!patternResult.valid) {
    return {
      valid: false,
      reason: 'FORBIDDEN_PATTERN',
      guidance: patternResult.guidance,
      field: 'domain_pattern',
    };
  }
  
  return { valid: true };
}

/**
 * Validate sub-questions for a main question
 */
export function validateSubQuestions(
  _mainQuestionId: string,
  subQuestions: { target_files: string[]; escalation_question: string }[],
  depth: 'standard' | 'deep' | 'forensic'
): ValidationResult {
  const config = {
    standard: { min: 3, max: 4, minEscalations: 1, requireAll: false },
    deep: { min: 4, max: 5, minEscalations: 2, requireAll: false },
    forensic: { min: 5, max: 6, minEscalations: 1, requireAll: true },
  }[depth];
  
  // Check count
  if (subQuestions.length < config.min || subQuestions.length > config.max) {
    return {
      valid: false,
      reason: 'SUB_QUESTION_COUNT_VIOLATION',
      guidance: `${depth} depth requires ${config.min}-${config.max} sub-questions. ` +
        `Received: ${subQuestions.length}`,
      field: 'sub_questions',
    };
  }
  
  // Check each sub-question
  for (let i = 0; i < subQuestions.length; i++) {
    const sq = subQuestions[i];
    
    // Validate target files count
    if (sq.target_files.length === 0) {
      return {
        valid: false,
        reason: 'MISSING_TARGET_FILES',
        guidance: `Sub-question ${i + 1} must have at least 1 target file.`,
        field: `sub_questions[${i}].target_files`,
      };
    }
    if (sq.target_files.length > 3) {
      return {
        valid: false,
        reason: 'SUB_QUESTION_COUNT_VIOLATION',
        guidance: `Sub-question ${i + 1} has ${sq.target_files.length} target files, but maximum is 3.`,
        field: `sub_questions[${i}].target_files`,
      };
    }
    
    // Validate escalation question
    if (!sq.escalation_question || sq.escalation_question.length < 10) {
      return {
        valid: false,
        reason: 'FORBIDDEN_PATTERN',
        guidance: `Sub-question ${i + 1} must have an escalation_question ` +
          'for deeper investigation when FAIL/SUSPICIOUS.',
        field: `sub_questions[${i}].escalation_question`,
      };
    }
  }
  
  // Check escalation paths
  const escalationCount = subQuestions.filter(
    sq => sq.escalation_question && sq.escalation_question.length >= 10
  ).length;
  
  if (config.requireAll && escalationCount < subQuestions.length) {
    return {
      valid: false,
      reason: 'SUB_QUESTION_COUNT_VIOLATION',
      guidance: `Forensic depth requires ALL sub-questions to have escalation paths. ` +
        `Found: ${escalationCount}/${subQuestions.length}`,
      field: 'sub_questions',
    };
  }
  
  if (escalationCount < config.minEscalations) {
    return {
      valid: false,
      reason: 'SUB_QUESTION_COUNT_VIOLATION',
      guidance: `${depth} depth requires at least ${config.minEscalations} sub-questions ` +
        `with escalation paths. Found: ${escalationCount}`,
      field: 'sub_questions',
    };
  }
  
  return { valid: true };
}

/**
 * Throw validation error for invalid questions
 */
export function assertQuestionValid(
  result: ValidationResult
): asserts result is { valid: true } {
  if (!result.valid) {
    throw new QuestionRejectedError(
      result.reason!,
      result.guidance!,
      result.field
    );
  }
}
