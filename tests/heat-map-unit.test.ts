/**
 * Heat Map Unit Tests
 *
 * Simple unit tests for heat map calculation functions.
 */

import { describe, it, expect } from 'vitest';
import { computeHeatScore, getHeatBucket, getPrimaryRisk } from '../src/heat-map/heat-map-generator.js';

describe('Heat Map Scoring', () => {
  describe('computeHeatScore', () => {
    it('should calculate weighted score', () => {
      const score = computeHeatScore(50, 50, 50, {
        churn: 0.4,
        coupling: 0.3,
        coverage: 0.3,
      });
      expect(score).toBe(50);
    });

    it('should handle all zeros', () => {
      const score = computeHeatScore(0, 0, 0, {
        churn: 0.4,
        coupling: 0.3,
        coverage: 0.3,
      });
      expect(score).toBe(0);
    });

    it('should handle all maximums', () => {
      const score = computeHeatScore(100, 100, 100, {
        churn: 0.4,
        coupling: 0.3,
        coverage: 0.3,
      });
      expect(score).toBe(100);
    });
  });

  describe('getHeatBucket', () => {
    it('should classify low scores (0-24)', () => {
      expect(getHeatBucket(0)).toBe('low');
      expect(getHeatBucket(24)).toBe('low');
    });

    it('should classify medium scores (25-49)', () => {
      expect(getHeatBucket(25)).toBe('medium');
      expect(getHeatBucket(49)).toBe('medium');
    });

    it('should classify high scores (50-74)', () => {
      expect(getHeatBucket(50)).toBe('high');
      expect(getHeatBucket(74)).toBe('high');
    });

    it('should classify critical scores (75-100)', () => {
      expect(getHeatBucket(75)).toBe('critical');
      expect(getHeatBucket(100)).toBe('critical');
    });
  });

  describe('getPrimaryRisk', () => {
    it('should identify churn as primary risk', () => {
      const risk = getPrimaryRisk(80, 40, 30);
      expect(risk).toContain('churn');
    });

    it('should identify coupling as primary risk', () => {
      const risk = getPrimaryRisk(40, 80, 30);
      expect(risk).toContain('coupling');
    });

    it('should identify coverage gap as primary risk', () => {
      const risk = getPrimaryRisk(40, 30, 80);
      expect(risk).toContain('coverage');
    });

    it('should handle equal scores', () => {
      const risk = getPrimaryRisk(50, 50, 50);
      expect(risk).toBeDefined();
    });
  });
});
