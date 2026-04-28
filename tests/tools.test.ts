/**
 * MCP Tool Handler Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { sessionStore } from '../src/state/session-store.js';
import { initializeAudit } from '../src/tools/initialize-audit.js';
import { submitObservations } from '../src/tools/submit-observations.js';
import { submitQuestion } from '../src/tools/submit-question.js';
import { PhaseViolationError } from '../src/state/errors.js';
import type { InitializeAuditInput, SubmitObservationsInput } from '../src/types/schemas.js';
import type { SubmitQuestionInput } from '../src/types/schemas.js';

describe('MCP Tools', () => {
  // Simulates the user's project repo — a real writable directory
  let repoPath: string;

  beforeEach(() => {
    repoPath = mkdtempSync(join(tmpdir(), 'questionnaire-test-repo-'));
    // Clear singleton store between tests
    const sessions = sessionStore.getAllSessions();
    for (const session of sessions) {
      sessionStore.deleteSession(session.session_id);
    }
  });

  afterEach(() => {
    rmSync(repoPath, { recursive: true, force: true });
  });

  describe('initialize_audit', () => {
    it('should create a new session and return instructions', async () => {
      const input: InitializeAuditInput = {
        repo_path: repoPath,
        domain: 'security',
        depth: 'standard',
      };

      const result = await initializeAudit(input);

      expect(result.session_id).toBeDefined();
      expect(result.status).toBe('ready');
      expect(result.instructions).toContain('SECURITY AUDIT INSTRUCTIONS');
      expect(result.instructions).toContain('STANDARD DEPTH');
    });

    it('should advance session to phase 1', async () => {
      const input: InitializeAuditInput = {
        repo_path: repoPath,
        domain: 'performance',
        depth: 'deep',
      };

      const result = await initializeAudit(input);
      const session = sessionStore.getSession(result.session_id);

      expect(session.phase).toBe(1);
      expect(session.domain).toBe('performance');
      expect(session.depth).toBe('deep');
    });
  });

  describe('submit_observations', () => {
    it('should accept valid observations and advance to phase 2', async () => {
      // Initialize first
      const initResult = await initializeAudit({
        repo_path: repoPath,
        domain: 'security',
        depth: 'standard',
      });

      const observations: SubmitObservationsInput['observations'] = {
        purpose: 'Test application',
        tech_stack: [{ name: 'React', version: '18.0.0', file_path: '/package.json' }],
        entry_points: [{ type: 'Component', location: 'App.tsx', file_path: '/src/App.tsx' }],
        data_flows: [{
          source: 'API',
          destination: 'Store',
          transformation: 'JSON',
          file_paths: ['/src/api.ts']
        }],
        auth_mechanisms: [{ mechanism: 'JWT', location: 'AuthProvider', file_path: '/src/auth.tsx' }],
        error_patterns: [{ pattern: 'Console.error', handling: 'Logged', file_path: '/src/utils.ts' }],
        test_coverage: [{ component: 'Button', coverage: '80%', file_path: '/src/Button.test.tsx' }],
        config_secrets: [{ key: 'API_KEY', location: '.env', file_path: '/.env.example' }],
        deployment: [{ aspect: 'Docker', detail: 'Containerized', file_path: '/Dockerfile' }],
      };

      const result = submitObservations({
        session_id: initResult.session_id,
        observations,
      });

      expect(result.status).toBe('accepted');
      expect(result.phase_unlocked).toBe(2);
    });

    it('should reject observations without file citations', async () => {
      const initResult = await initializeAudit({
        repo_path: repoPath,
        domain: 'security',
        depth: 'standard',
      });

      const observations: SubmitObservationsInput['observations'] = {
        purpose: 'Test application',
        tech_stack: [{ name: 'React', version: '18.0.0', file_path: '' }], // Missing file path
        entry_points: [],
        data_flows: [],
        auth_mechanisms: [],
        error_patterns: [],
        test_coverage: [],
        config_secrets: [],
        deployment: [],
      };

      expect(() => {
        submitObservations({
          session_id: initResult.session_id,
          observations,
        });
      }).toThrow('Missing file citation');
    });

    it('should throw PhaseViolationError when called in wrong phase', async () => {
      const initResult = await initializeAudit({
        repo_path: repoPath,
        domain: 'security',
        depth: 'standard',
      });

      // First call to advance to phase 2
      const observations: SubmitObservationsInput['observations'] = {
        purpose: 'Test',
        tech_stack: [{ name: 'React', version: '18.0.0', file_path: '/package.json' }],
        entry_points: [],
        data_flows: [],
        auth_mechanisms: [],
        error_patterns: [],
        test_coverage: [],
        config_secrets: [],
        deployment: [],
      };

      submitObservations({
        session_id: initResult.session_id,
        observations,
      });

      // Now try again - should throw because phase is 2, not 1
      expect(() => {
        submitObservations({
          session_id: initResult.session_id,
          observations,
        });
      }).toThrow(PhaseViolationError);
    });
  });

  describe('submit_question', () => {
    it('should accept valid main questions', async () => {
      // Initialize and submit observations
      const initResult = await initializeAudit({
        repo_path: repoPath,
        domain: 'security',
        depth: 'standard',
      });

      submitObservations({
        session_id: initResult.session_id,
        observations: {
          purpose: 'Test',
          tech_stack: [{ name: 'React', version: '18.0.0', file_path: '/package.json' }],
          entry_points: [],
          data_flows: [],
          auth_mechanisms: [],
          error_patterns: [],
          test_coverage: [],
          config_secrets: [],
          deployment: [],
        },
      });

      const input: SubmitQuestionInput = {
        session_id: initResult.session_id,
        question: {
          text: 'Where is user input validated in the session store, and what happens if validation is bypassed?',
          target_files: ['/src/session.ts'],
          suspicion_rationale: 'The session store accepts user input without clear validation boundaries.',
          edge_case_targeted: 'Malformed input that bypasses frontend validation',
          domain_pattern: 'VALIDATION_BYPASS',
        },
      };

      const result = submitQuestion(input);

      expect(result.status).toBe('accepted');
      expect(result.question_id).toBeDefined();
      expect(result.questions_accepted_so_far).toBe(1);
    });

    it('should reject binary questions', async () => {
      // Initialize and submit observations
      const initResult = await initializeAudit({
        repo_path: repoPath,
        domain: 'security',
        depth: 'standard',
      });

      submitObservations({
        session_id: initResult.session_id,
        observations: {
          purpose: 'Test',
          tech_stack: [{ name: 'React', version: '18.0.0', file_path: '/package.json' }],
          entry_points: [],
          data_flows: [],
          auth_mechanisms: [],
          error_patterns: [],
          test_coverage: [],
          config_secrets: [],
          deployment: [],
        },
      });

      const input: SubmitQuestionInput = {
        session_id: initResult.session_id,
        question: {
          text: 'Is authentication implemented?',
          target_files: ['/src/auth.ts'],
          suspicion_rationale: 'Short description here for testing.',
          edge_case_targeted: 'Test edge case description',
          domain_pattern: 'VALIDATION_BYPASS',
        },
      };

      const result = submitQuestion(input);

      // New error response format returns status: 'error' with failures array
      expect(result.status).toBe('error');
      expect(result.code).toBe('MULTIPLE_VALIDATION_FAILURES');
      expect(result.failures?.some(f => f.code === 'BINARY_QUESTION')).toBe(true);
    });
  });
});
