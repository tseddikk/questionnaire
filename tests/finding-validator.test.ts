/**
 * Finding Validator Tests
 */

import { describe, it, expect } from 'vitest';
import { 
  validateFinding, 
  requiresEscalation,
  validateEvidence 
} from '../src/validation/finding-validator.js';
import type { Finding, Verdict } from '../src/types/domain.js';

describe('Finding Validator', () => {
  describe('requiresEscalation', () => {
    it('should require escalation for FAIL', () => {
      expect(requiresEscalation('FAIL')).toBe(true);
    });

    it('should require escalation for SUSPICIOUS', () => {
      expect(requiresEscalation('SUSPICIOUS')).toBe(true);
    });

    it('should not require escalation for PASS', () => {
      expect(requiresEscalation('PASS')).toBe(false);
    });

    it('should not require escalation for UNCERTAIN', () => {
      expect(requiresEscalation('UNCERTAIN')).toBe(false);
    });
  });

  describe('validateEvidence', () => {
    it('should accept valid evidence', () => {
      const evidence = {
        file_path: '/src/session.ts',
        line_start: 10,
        line_end: 15,
        snippet: 'const session = await store.createSession();',
      };
      const result = validateEvidence(evidence, true);
      expect(result.valid).toBe(true);
    });

    it('should reject empty file path', () => {
      const evidence = {
        file_path: '',
        line_start: 10,
        line_end: 15,
        snippet: 'code',
      };
      const result = validateEvidence(evidence, true);
      expect(result.valid).toBe(false);
    });

    it('should reject line_end < line_start', () => {
      const evidence = {
        file_path: '/src/session.ts',
        line_start: 15,
        line_end: 10,
        snippet: 'code',
      };
      const result = validateEvidence(evidence, true);
      expect(result.valid).toBe(false);
    });

    it('should reject empty snippet', () => {
      const evidence = {
        file_path: '/src/session.ts',
        line_start: 10,
        line_end: 15,
        snippet: '',
      };
      const result = validateEvidence(evidence, true);
      expect(result.valid).toBe(false);
    });

    it('should accept null evidence when evidence_found is false', () => {
      const result = validateEvidence(null, false);
      expect(result.valid).toBe(true);
    });

    it('should reject non-null evidence when evidence_found is false', () => {
      const evidence = {
        file_path: '/src/session.ts',
        line_start: 10,
        line_end: 15,
        snippet: 'code',
      };
      const result = validateEvidence(evidence, false);
      expect(result.valid).toBe(false);
    });
  });

  describe('validateFinding', () => {
    const baseFinding: Finding = {
      id: 'finding-1',
      sub_question_id: 'sq-1',
      answer: 'The session store does not handle write errors.',
      evidence: {
        file_path: '/src/session.ts',
        line_start: 45,
        line_end: 50,
        snippet: 'await store.write(data);',
      },
      verdict: 'FAIL',
      severity: 'critical',
      confidence: 'high',
      evidence_found: true,
      escalation_finding: 'Partial writes leave data in inconsistent state',
    };

    it('should accept a valid FAIL finding with escalation', () => {
      const result = validateFinding(baseFinding);
      expect(result.valid).toBe(true);
    });

    it('should accept a valid PASS finding', () => {
      const finding: Finding = {
        ...baseFinding,
        verdict: 'PASS',
        severity: 'info',
        escalation_finding: null,
      };
      const result = validateFinding(finding);
      expect(result.valid).toBe(true);
    });

    it('should reject FAIL without escalation', () => {
      const finding: Finding = {
        ...baseFinding,
        escalation_finding: null,
      };
      const result = validateFinding(finding);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('ESCALATION_REQUIRED');
    });

    it('should reject SUSPICIOUS without escalation', () => {
      const finding: Finding = {
        ...baseFinding,
        verdict: 'SUSPICIOUS',
        escalation_finding: null,
      };
      const result = validateFinding(finding);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('ESCALATION_REQUIRED');
    });

    it('should reject PASS with non-info severity', () => {
      const finding: Finding = {
        ...baseFinding,
        verdict: 'PASS',
        severity: 'warning',
        escalation_finding: null,
      };
      const result = validateFinding(finding);
      expect(result.valid).toBe(false);
    });

    it('should reject FAIL with info severity', () => {
      const finding: Finding = {
        ...baseFinding,
        severity: 'info',
      };
      const result = validateFinding(finding);
      expect(result.valid).toBe(false);
    });

    it('should reject finding with empty answer', () => {
      const finding: Finding = {
        ...baseFinding,
        answer: '',
      };
      const result = validateFinding(finding);
      expect(result.valid).toBe(false);
    });

    it('should accept UNCERTAIN verdict', () => {
      const finding: Finding = {
        ...baseFinding,
        verdict: 'UNCERTAIN',
        severity: 'warning',
        escalation_finding: null,
      };
      const result = validateFinding(finding);
      expect(result.valid).toBe(true);
    });
  });
});
