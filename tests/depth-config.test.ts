/**
 * Depth Configuration Tests
 *
 * Tests for audit depth configuration.
 */

import { describe, it, expect } from 'vitest';
import { DEPTH_CONFIG } from '../src/types/domain.js';

describe('DEPTH_CONFIG', () => {
  it('should have standard depth config', () => {
    expect(DEPTH_CONFIG.standard).toBeDefined();
    expect(DEPTH_CONFIG.standard.min_main_questions).toBeGreaterThan(0);
    expect(DEPTH_CONFIG.standard.max_main_questions).toBeGreaterThan(
      DEPTH_CONFIG.standard.min_main_questions
    );
    expect(DEPTH_CONFIG.standard.min_sub_questions).toBeGreaterThan(0);
    expect(DEPTH_CONFIG.standard.max_sub_questions).toBeGreaterThan(
      DEPTH_CONFIG.standard.min_sub_questions
    );
  });

  it('should have deep depth config', () => {
    expect(DEPTH_CONFIG.deep).toBeDefined();
    expect(DEPTH_CONFIG.deep.min_main_questions).toBeGreaterThanOrEqual(5);
    expect(DEPTH_CONFIG.deep.max_main_questions).toBeGreaterThan(
      DEPTH_CONFIG.deep.min_main_questions
    );
  });

  it('should have forensic depth config', () => {
    expect(DEPTH_CONFIG.forensic).toBeDefined();
    expect(DEPTH_CONFIG.forensic.min_main_questions).toBeGreaterThanOrEqual(5);
    expect(DEPTH_CONFIG.forensic.max_main_questions).toBeGreaterThan(
      DEPTH_CONFIG.forensic.min_main_questions
    );
  });

  it('should have ascending sub-question requirements', () => {
    expect(DEPTH_CONFIG.standard.min_sub_questions).toBeLessThan(
      DEPTH_CONFIG.deep.min_sub_questions
    );
    expect(DEPTH_CONFIG.deep.min_sub_questions).toBeLessThan(
      DEPTH_CONFIG.forensic.min_sub_questions
    );
  });

  it('should have valid sub-question ranges', () => {
    Object.values(DEPTH_CONFIG).forEach(config => {
      expect(config.min_sub_questions).toBeGreaterThan(0);
      expect(config.max_sub_questions).toBeGreaterThanOrEqual(config.min_sub_questions);
    });
  });

  it('should have escalation requirements', () => {
    expect(DEPTH_CONFIG.standard.min_escalation_paths).toBeGreaterThanOrEqual(0);
    expect(DEPTH_CONFIG.deep.min_escalation_paths).toBeGreaterThanOrEqual(
      DEPTH_CONFIG.standard.min_escalation_paths
    );
    expect(DEPTH_CONFIG.forensic.require_all_escalations).toBe(true);
  });
});
