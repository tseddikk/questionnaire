/**
 * Question Validator Tests
 */

import { describe, it, expect } from 'vitest';
import { validateMainQuestion, validateSubQuestions } from '../src/validation/question-validator.js';
import type { MainQuestion } from '../src/types/domain.js';

describe('Question Validator', () => {
  describe('validateMainQuestion', () => {
    const baseQuestion: MainQuestion = {
      id: 'test-id',
      text: 'Where is user input validated, and what happens if validation is bypassed at a lower layer?',
      target_files: ['/src/session.ts'],
      suspicion_rationale: 'The session store has async operations without explicit rollback mechanisms.',
      edge_case_targeted: 'Partial writes during network interruption',
      domain_pattern: 'VALIDATION_BYPASS',
      sub_question_ids: [],
    };

    it('should accept a valid main question', () => {
      const result = validateMainQuestion(baseQuestion, 'security');
      expect(result.valid).toBe(true);
    });

    it('should reject a binary question', () => {
      const question = {
        ...baseQuestion,
        text: 'Is authentication implemented?',
      };
      const result = validateMainQuestion(question, 'security');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('BINARY_QUESTION');
    });

    it('should reject a question without target files', () => {
      const question = {
        ...baseQuestion,
        target_files: [],
      };
      const result = validateMainQuestion(question, 'security');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('MISSING_TARGET_FILES');
    });

    it('should reject a question with short suspicion rationale', () => {
      const question = {
        ...baseQuestion,
        suspicion_rationale: 'Short',
      };
      const result = validateMainQuestion(question, 'security');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('MISSING_SUSPICION_RATIONALE');
    });

  it('should reject a subjective question', () => {
    const question = {
      ...baseQuestion,
      text: 'How would you rate the code cleanliness?',
      edge_case_targeted: 'Edge case',
    };
    const result = validateMainQuestion(question, 'security');
    expect(result.valid).toBe(false);
    // Can be rejected as FORBIDDEN_PATTERN or BINARY_QUESTION
    expect(['FORBIDDEN_PATTERN', 'BINARY_QUESTION']).toContain(result.reason);
  });

  it('should reject a coverage check question', () => {
    const question = {
      ...baseQuestion,
      text: 'What percentage of test coverage exists for the authentication module?',
      edge_case_targeted: 'Edge case',
    };
    const result = validateMainQuestion(question, 'security');
    expect(result.valid).toBe(false);
    // Can be rejected as FORBIDDEN_PATTERN or BINARY_QUESTION
    expect(['FORBIDDEN_PATTERN', 'BINARY_QUESTION']).toContain(result.reason);
  });

    it('should reject happy-path-only question', () => {
      const question = {
        ...baseQuestion,
        text: 'How does the login flow work?',
        edge_case_targeted: 'The successful authentication process',
      };
      const result = validateMainQuestion(question, 'security');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('HAPPY_PATH_ONLY');
    });

    it('should validate domain pattern match', () => {
      const question = {
        ...baseQuestion,
        text: 'This is some generic text',
        domain_pattern: 'ASYNC_FAILURE' as const,
      };
      // Should fail because text doesn't match ASYNC_FAILURE pattern
      const result = validateMainQuestion(question, 'security');
      // The validation checks for specific keywords
      expect(result.valid).toBe(false);
    });
  });

  describe('validateSubQuestions', () => {
    const validSubQuestions = [
      {
        text: 'Does the session.ts file handle write errors?',
        target_files: ['/src/session.ts'],
        pass_criteria: 'Error handling is present',
        fail_criteria: 'No error handling found',
        evidence_pattern: 'try/catch or .catch() blocks',
        escalation_question: 'What happens to partial writes?',
      },
      {
        text: 'Are there transaction boundaries?',
        target_files: ['/src/session.ts'],
        pass_criteria: 'Transactions are atomic',
        fail_criteria: 'No transaction support',
        evidence_pattern: 'beginTransaction/commit/rollback',
        escalation_question: 'What data is left in inconsistent state?',
      },
      {
        text: 'Is there retry logic?',
        target_files: ['/src/session.ts'],
        pass_criteria: 'Retry mechanism exists',
        fail_criteria: 'No retry logic',
        evidence_pattern: 'retry, setTimeout, exponential backoff',
        escalation_question: 'How many retries before giving up?',
      },
    ];

    it('should accept valid sub-questions for standard depth', () => {
      const result = validateSubQuestions('mq-1', validSubQuestions.slice(0, 3), 'standard');
      expect(result.valid).toBe(true);
    });

    it('should reject too few sub-questions for standard depth', () => {
      const result = validateSubQuestions('mq-1', validSubQuestions.slice(0, 2), 'standard');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('SUB_QUESTION_COUNT_VIOLATION');
    });

    it('should reject too many sub-questions for standard depth', () => {
      const manyQuestions = [...validSubQuestions, ...validSubQuestions];
      const result = validateSubQuestions('mq-1', manyQuestions, 'standard');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('SUB_QUESTION_COUNT_VIOLATION');
    });

    it('should reject sub-questions with too many target files', () => {
      // Need 3 questions minimum for standard, with one having too many files
      const badQuestions = [
        { ...validSubQuestions[0] },
        { ...validSubQuestions[1] },
        {
          ...validSubQuestions[2],
          target_files: ['/src/a.ts', '/src/b.ts', '/src/c.ts', '/src/d.ts'], // 4 files
        },
      ];
      const result = validateSubQuestions('mq-1', badQuestions, 'standard');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('MISSING_TARGET_FILES');
    });

    it('should require all escalations for forensic depth', () => {
      const missingEscalation = [{
        ...validSubQuestions[0],
        escalation_question: '',
      }];
      const result = validateSubQuestions('mq-1', missingEscalation, 'forensic');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('SUB_QUESTION_COUNT_VIOLATION');
    });
  });
});
