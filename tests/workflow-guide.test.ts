/**
 * Workflow Guide Tests
 */

import { describe, it, expect } from 'vitest';
import { getWorkflowGuide } from '../src/tools/get-workflow-guide.js';

describe('getWorkflowGuide', () => {
  it('should return a valid workflow guide', () => {
    const guide = getWorkflowGuide();

    expect(guide.status).toBe('ok');
    expect(guide.version).toBe('1.0.0');
  });

  it('should include all 6 phases', () => {
    const guide = getWorkflowGuide();

    expect(guide.phases).toHaveLength(6);
    expect(guide.phases[0].phase).toBe(0);
    expect(guide.phases[5].phase).toBe(5);
  });

  it('should include Investigator and Synthesizer roles', () => {
    const guide = getWorkflowGuide();

    const roles = guide.roles.map(r => r.role);
    expect(roles).toContain('Investigator');
    expect(roles).toContain('Synthesizer');
  });

  it('should explain common mistakes', () => {
    const guide = getWorkflowGuide();

    expect(guide.common_mistakes.length).toBeGreaterThan(0);
    const mistake = guide.common_mistakes[0];
    expect(mistake.mistake).toBeDefined();
    expect(mistake.consequence).toBeDefined();
    expect(mistake.correction).toBeDefined();
  });

  it('should include tool usage examples', () => {
    const guide = getWorkflowGuide();

    expect(guide.tool_usage_examples.length).toBeGreaterThan(0);
    const example = guide.tool_usage_examples.find(e => e.tool === 'finalize_report');
    expect(example).toBeDefined();
    expect(example?.example.input).toHaveProperty('session_id');
    expect(example?.example.input).toHaveProperty('agent_id');
  });

  it('should explain domain patterns', () => {
    const guide = getWorkflowGuide();

    expect(guide.domain_patterns.patterns.length).toBe(7);
    const patternNames = guide.domain_patterns.patterns.map(p => p.name);
    expect(patternNames).toContain('VALIDATION_BYPASS');
    expect(patternNames).toContain('ASYNC_FAILURE');
  });

  it('should describe synthesizer-only finalization', () => {
    const guide = getWorkflowGuide();

    const synthesizerRole = guide.roles.find(r => r.role === 'Synthesizer');
    expect(synthesizerRole?.can_do).toContain('finalize_report');

    const investigatorRole = guide.roles.find(r => r.role === 'Investigator');
    expect(investigatorRole?.cannot_do).toContain('finalize_report');
  });

  it('should explain that reactions count toward checkpoint', () => {
    const guide = getWorkflowGuide();

    const checkpointTip = guide.roles[0].workflow_tips.find(t =>
      t.includes('checkpoint') || t.includes('react')
    );
    expect(checkpointTip).toBeDefined();
  });
});