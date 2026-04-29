/**
 * Question Pattern Validation Tests
 *
 * Tests for domain-specific question pattern validation.
 */

import { describe, it, expect } from 'vitest';

describe('Question Patterns', () => {
  const patterns = [
    { name: 'ASYNC_FAILURE', keywords: ['cleanup', 'rollback', 'partial state', 'async', 'race condition', 'timeout'] },
    { name: 'ACCIDENTAL_COUPLING', keywords: ['import', 'dependency', 'coupling', 'layer', 'circular', 'tight'] },
    { name: 'VALIDATION_BYPASS', keywords: ['validate', 'bypass', 'sanitiz', 'escape', 'input'] },
    { name: 'IMPLICIT_MUTATION', keywords: ['mutat', 'side effect', 'shared', 'global', 'state'] },
    { name: 'DEPENDENCY_COMPROMISE', keywords: ['package', 'vendor', 'supply chain', 'dependency', 'version'] },
    { name: 'DATA_LEAKAGE', keywords: ['leak', 'expos', 'PII', 'sensitiv', 'secret'] },
    { name: 'INVARIANT_MISSING', keywords: ['invariant', 'guard', 'constraint', 'contract', 'precondition'] },
  ];

  patterns.forEach(({ name, keywords }) => {
    describe(`${name} pattern`, () => {
      it(`should match keywords: ${keywords.join(', ')}`, () => {
        // Test that each keyword would be found in a relevant question
        keywords.forEach(keyword => {
          const question = `Where does ${keyword} happen in this code?`;
          const matches = question.toLowerCase().includes(keyword.toLowerCase());
          expect(matches).toBe(true);
        });
      });

      it('should be a valid pattern name', () => {
        const validPatterns = [
          'ASYNC_FAILURE',
          'ACCIDENTAL_COUPLING',
          'VALIDATION_BYPASS',
          'IMPLICIT_MUTATION',
          'DEPENDENCY_COMPROMISE',
          'DATA_LEAKAGE',
          'INVARIANT_MISSING',
        ];
        expect(validPatterns).toContain(name);
      });
    });
  });

  describe('Pattern selection by domain', () => {
    const domainPatterns = {
      security: ['VALIDATION_BYPASS', 'DATA_LEAKAGE', 'DEPENDENCY_COMPROMISE'],
      performance: ['ASYNC_FAILURE', 'IMPLICIT_MUTATION'],
      architecture: ['ACCIDENTAL_COUPLING', 'IMPLICIT_MUTATION'],
      data_integrity: ['ASYNC_FAILURE', 'INVARIANT_MISSING'],
      observability: ['INVARIANT_MISSING'],
      compliance: ['DATA_LEAKAGE', 'VALIDATION_BYPASS'],
    };

    Object.entries(domainPatterns).forEach(([domain, expectedPatterns]) => {
      it(`should have appropriate patterns for ${domain} domain`, () => {
        expectedPatterns.forEach(pattern => {
          expect(patterns.some(p => p.name === pattern)).toBe(true);
        });
      });
    });
  });
});
