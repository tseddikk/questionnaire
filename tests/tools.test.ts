/**
 * MCP Tool Handler Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { sessionStore } from '../src/state/session-store.js';
import { collaborativeStore, setRegistryPath } from '../src/state/collaborative-store.js';
import { initializeAudit } from '../src/tools/initialize-audit.js';
import { submitObservations } from '../src/tools/submit-observations.js';
import { submitQuestion } from '../src/tools/submit-question.js';
import { submitSubQuestions } from '../src/tools/submit-sub-questions.js';
import { PhaseViolationError } from '../src/state/errors.js';
import type { InitializeAuditInput, SubmitObservationsInput } from '../src/types/schemas.js';
import type { SubmitQuestionInput } from '../src/types/schemas.js';

describe('MCP Tools', () => {
  // Simulates the user's project repo — a real writable directory
  let repoPath: string;

  beforeEach(() => {
    repoPath = mkdtempSync(join(tmpdir(), 'questionnaire-test-repo-'));
    setRegistryPath(join(repoPath, 'test-registry.json'));
    // Clear singleton stores between tests
    const sessions = sessionStore.getAllSessions();
    for (const session of sessions) {
      sessionStore.deleteSession(session.session_id);
    }
    collaborativeStore.clearMemoryOnly();
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
      const session = collaborativeStore.getSession(result.session_id);

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
        agent_id: 'test-agent',
        observations,
      });

      expect(result.status).toBe('accepted');
      expect(result.current_phase).toBe(2);
    });

  it('should reject observations without file citations', async () => {
    const initResult = await initializeAudit({
      repo_path: repoPath,
      agent_id: 'test-agent',
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
    agent_id: 'test-agent',
    observations,
  });
      }).toThrow('Missing file citation');
    });

    it('should allow multiple agents to submit observations (no phase gates)', async () => {
      const initResult = await initializeAudit({
        repo_path: repoPath,
        agent_id: 'test-agent',
        domain: 'security',
        depth: 'standard',
      });

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
        agent_id: 'test-agent',
        observations,
      });

      const result = submitObservations({
        session_id: initResult.session_id,
        agent_id: 'test-agent-2',
        observations,
      });

      expect(result.status).toBe('accepted');
      expect(result.observations_count).toBe(2);
    });
  });

  describe('submit_question', () => {
  it('should accept valid main questions', async () => {
    // Initialize and submit observations
    const initResult = await initializeAudit({
      repo_path: repoPath,
      agent_id: 'test-agent',
      domain: 'security',
      depth: 'standard',
    });

    submitObservations({
      session_id: initResult.session_id,
      agent_id: 'test-agent',
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
      agent_id: 'test-agent',
      question: {
          text: 'Where is user input validated in the session store, and what happens if validation is bypassed?',
          target_files: ['/src/session.ts'],
          suspicion_rationale: 'The session store accepts user input without clear validation boundaries of at least 20 chars.',
          edge_case_targeted: 'Malformed input that bypasses frontend validation and other edge cases of sufficient length.',
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
      agent_id: 'test-agent',
      domain: 'security',
      depth: 'standard',
    });

    submitObservations({
      session_id: initResult.session_id,
      agent_id: 'test-agent',
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
      agent_id: 'test-agent',
      question: {
        text: 'Is authentication implemented?',
          target_files: ['/src/auth.ts'],
          suspicion_rationale: 'Short description here for testing which must be longer than 20 chars.',
          edge_case_targeted: 'Test edge case description which must also be long enough for the validator.',
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

  describe('submit_sub_questions', () => {
  async function setupPhase3(domain: any = 'security', depth: any = 'standard') {
    const initResult = await initializeAudit({
      repo_path: repoPath,
      agent_id: 'test-agent',
      domain,
      depth,
    });

    submitObservations({
      session_id: initResult.session_id,
      agent_id: 'test-agent',
      observations: {
        purpose: 'Test',
        tech_stack: [{ name: 'React', version: '18.0.0', file_path: '/package.json' }],
        entry_points: [], data_flows: [], auth_mechanisms: [], error_patterns: [], test_coverage: [], config_secrets: [], deployment: [],
      },
    });

    const questionIds: string[] = [];
    for (let i = 1; i <= 5; i++) {
      const qResult = submitQuestion({
        session_id: initResult.session_id,
        agent_id: 'test-agent',
        question: {
            text: `Question ${i}: Where is user input validated, and what happens if validation is bypassed?`,
            target_files: [`/src/file${i}.ts`],
            suspicion_rationale: `The validation boundaries for component ${i} appear to be inconsistent based on the data flows observed in Phase 1.`,
            edge_case_targeted: `Malformed or oversized input payloads that might bypass the primary validation layer in ${i}.`,
            domain_pattern: 'VALIDATION_BYPASS',
          },
        }) as any;
        if (qResult.status === 'error') {
           throw new Error(qResult.message);
        }
        questionIds.push(qResult.question_id);
      }

      return { sessionId: initResult.session_id, questionIds };
    }

    it('should return sub_question_ids when accepted', async () => {
      const { sessionId, questionIds } = await setupPhase3();
      const qId = questionIds[0];

      // Call submit_sub_questions
  const subResult = submitSubQuestions({
    session_id: sessionId,
    agent_id: 'test-agent',
    main_question_id: qId,
        sub_questions: [
          {
            text: 'Sub-question 1: Does the session store implementation enforce strict validation on all incoming set requests?',
            target_files: ['/src/session.ts'],
            pass_criteria: 'The implementation correctly validates all input fields against the defined domain schema before storage.',
            fail_criteria: 'The implementation allows arbitrary fields or unvalidated data to be persisted in the session store.',
            evidence_pattern: 'Look for Zod parse or manual validation checks in the setObservations method.',
            escalation_question: 'Can we craft a payload that injects malicious keys into the session store via unvalidated input?',
          },
          {
            text: 'Sub-question 2: Are there any implicit mutations of global state during the session retrieval process?',
            target_files: ['/src/session.ts'],
            pass_criteria: 'Retrieving a session is a side-effect free operation that only reads data and does not modify global state.',
            fail_criteria: 'The retrieval process implicitly updates counters, registries, or other global state without explicit intent.',
            evidence_pattern: 'Search for any write operations or Map.set calls within the getSession and loadSessions methods.',
            escalation_question: 'Could multiple concurrent read requests lead to a race condition in the global session registry?',
          },
          {
            text: 'Sub-question 3: Does the session expiration logic correctly handle edge cases around the 24-hour TTL boundary?',
            target_files: ['/src/session.ts'],
            pass_criteria: 'Sessions older than 24 hours are reliably identified as expired and cleared from both memory and disk.',
            fail_criteria: 'Sessions can persist beyond the TTL due to timezone mismatches or incorrect comparison logic in isExpired.',
            evidence_pattern: 'Examine the timestamp comparison in the isSessionExpired method for potential off-by-one errors.',
            escalation_question: 'Is it possible to prolong a session indefinitely by making frequent small updates that reset the TTL?',
          }
        ],
      });

      expect(subResult.status).toBe('accepted');
      expect(subResult.main_question_id).toBe(qId);
      expect(subResult.sub_question_ids).toBeDefined();
      expect(subResult.sub_question_ids?.length).toBe(3);
    });

    it('should return QUESTION_NOT_FOUND for invalid question IDs', async () => {
      const { sessionId } = await setupPhase3();

  const subResult = submitSubQuestions({
    session_id: sessionId,
    agent_id: 'test-agent',
    main_question_id: '4244529c-b907-48b6-a541-0411baa27aad', // Some random ID
        sub_questions: [
          {
            text: 'Sub-question 1: Does the session store implementation enforce strict validation on all incoming set requests?',
            target_files: ['/src/session.ts'],
            pass_criteria: 'The implementation correctly validates all input fields against the defined domain schema before storage.',
            fail_criteria: 'The implementation allows arbitrary fields or unvalidated data to be persisted in the session store.',
            evidence_pattern: 'Look for Zod parse or manual validation checks in the setObservations method.',
            escalation_question: 'Can we craft a payload that injects malicious keys into the session store via unvalidated input?',
          }
        ],
      });

      expect(subResult.status).toBe('rejected');
      expect(subResult.reason).toBe('QUESTION_NOT_FOUND');
    });
  });
});
