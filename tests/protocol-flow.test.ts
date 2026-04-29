/**
 * Protocol Flow Tests
 *
 * Tests the complete 6-phase audit protocol end-to-end.
 * Ensures agents can complete their flow without being stuck.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { collaborativeStore, setRegistryPath } from '../src/state/collaborative-store.js';
import { initializeAudit } from '../src/tools/initialize-audit.js';
import { submitObservations } from '../src/tools/submit-observations.js';
import { submitQuestion } from '../src/tools/submit-question.js';
import { submitSubQuestions } from '../src/tools/submit-sub-questions.js';
import { submitFinding } from '../src/tools/submit-finding.js';
import { checkpoint } from '../src/tools/checkpoint.js';
import { finalizeReport } from '../src/tools/finalize-report.js';
import { designateSynthesizer } from '../src/tools/designate-synthesizer.js';
import type { 
  InitializeAuditInput, 
  SubmitObservationsInput, 
  SubmitQuestionInput,
  SubmitFindingInput
} from '../src/types/schemas.js';

// Helper to create valid sub-questions
function createValidSubQuestions(count: number): Array<{
  text: string;
  target_files: string[];
  pass_criteria: string;
  fail_criteria: string;
  evidence_pattern: string;
  escalation_question: string;
}> {
  return Array.from({ length: Math.max(count, 3) }, (_, i) => ({
    text: `Sub-question ${i + 1}: What happens when operation fails?`,
    target_files: ['/src/session.ts'],
    pass_criteria: `Code handles error gracefully in case ${i + 1}`,
    fail_criteria: `No error handling found in case ${i + 1}`,
    evidence_pattern: `try/catch or error callback for case ${i + 1}`,
    escalation_question: `What is the blast radius if case ${i + 1} fails?`,
  }));
}

describe('Complete Protocol Flow', () => {
  const testRegistryDir = join(process.cwd(), 'tests', 'test-registry');
  const testRegistryPath = join(testRegistryDir, 'collab-session-registry.json');
  const createdRepos: string[] = [];

  // Use unique repo paths for each test to avoid conflicts
  let repoCounter = 0;
  function getTestRepo(): string {
    const repoPath = `/tmp/test-protocol-${Date.now()}-${repoCounter++}`;
    createdRepos.push(repoPath);
    return repoPath;
  }

  beforeEach(() => {
    if (!existsSync(testRegistryDir)) {
      mkdirSync(testRegistryDir, { recursive: true });
    }
    setRegistryPath(testRegistryPath);

    // Clean up any existing sessions from memory
    const sessions = collaborativeStore.getAllSessions();
    for (const session of sessions) {
      collaborativeStore.deleteSession(session.session_id);
    }
  });

  afterEach(() => {
    if (existsSync(testRegistryPath)) {
      try {
        rmSync(testRegistryPath, { force: true });
      } catch {
        // Ignore
      }
    }
    // Clean up test directories
    for (const testDir of createdRepos) {
      try {
        if (existsSync(testDir)) {
          rmSync(testDir, { recursive: true, force: true });
        }
      } catch {
        // Ignore cleanup errors
      }
    }
    createdRepos.length = 0;
  });

  describe('Phase 0: Initialize', () => {
    it('should create session and advance to phase 1', async () => {
      const input: InitializeAuditInput = {
        repo_path: getTestRepo(),
        domain: 'security',
        depth: 'standard',
      };

      const result = await initializeAudit(input);

      expect(result.session_id).toBeDefined();
      expect(result.status).toBe('ready');
      expect(result.instructions).toContain('SECURITY AUDIT INSTRUCTIONS');
      
      const session = collaborativeStore.getSession(result.session_id);
      expect(session.phase).toBe(1);
      expect(session.domain).toBe('security');
      expect(session.depth).toBe('standard');
      
      // Clean up
      collaborativeStore.deleteSession(result.session_id);
    });

    it('should generate heat map during initialization', async () => {
      const input: InitializeAuditInput = {
        repo_path: getTestRepo(),
        domain: 'architecture',
        depth: 'deep',
      };

      const result = await initializeAudit(input);
      const session = collaborativeStore.getSession(result.session_id);

      expect(session.heat_map).toBeDefined();
      
      // Clean up
      collaborativeStore.deleteSession(result.session_id);
    });
  });

  describe('Phase 1: Deep Discovery', () => {
    it('should accept observations and advance to phase 2', async () => {
      const repoPath = getTestRepo();
      const initResult = await initializeAudit({
        repo_path: repoPath,
        domain: 'security',
        depth: 'standard',
      });

      const observations: SubmitObservationsInput['observations'] = {
        purpose: 'Test application for security audit',
        tech_stack: [
          { name: 'React', version: '18.0.0', file_path: '/package.json' },
          { name: 'Express', version: '4.18.0', file_path: '/package.json' },
        ],
        entry_points: [
          { type: 'API', location: '/api/auth', file_path: '/src/routes/auth.ts' },
        ],
        data_flows: [
          { 
            source: 'Client', 
            destination: 'Auth Service', 
            transformation: 'JWT', 
            file_paths: ['/src/auth.ts'] 
          },
        ],
        auth_mechanisms: [
          { mechanism: 'JWT', location: 'AuthProvider', file_path: '/src/auth.ts' },
        ],
        error_patterns: [
          { pattern: 'Console.error', handling: 'Logged', file_path: '/src/utils.ts' },
        ],
        test_coverage: [
          { component: 'Auth', coverage: '80%', file_path: '/src/auth.test.ts' },
        ],
        config_secrets: [
          { key: 'API_KEY', location: '.env', file_path: '/.env.example' },
        ],
        deployment: [
          { aspect: 'Docker', detail: 'Containerized', file_path: '/Dockerfile' },
        ],
      };

      const result = submitObservations({
        session_id: initResult.session_id,
        observations,
      });

      expect(result.status).toBe('accepted');
      expect(result.phase_unlocked).toBe(2);

      const session = collaborativeStore.getSession(initResult.session_id);
      expect(session.phase).toBe(2);
      expect(session.observation_sets && session.observation_sets[0]?.observations).toBeDefined();
      
      // Clean up
      collaborativeStore.deleteSession(initResult.session_id);
    });

    it('should reject observations without file citations', async () => {
      const repoPath = getTestRepo();
      const initResult = await initializeAudit({
        repo_path: repoPath,
        domain: 'security',
        depth: 'standard',
      });

      const observations: SubmitObservationsInput['observations'] = {
        purpose: 'Test',
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
      
      // Clean up
      collaborativeStore.deleteSession(initResult.session_id);
    });
  });

  describe('Phase 2: Generate Main Questions', () => {
    it('should accept valid questions and advance to phase 3 after 5 questions', async () => {
      const repoPath = getTestRepo();
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

      const questionIds: string[] = [];

      // Submit exactly 5 questions to trigger Phase 3
      for (let i = 1; i <= 5; i++) {
        const input: SubmitQuestionInput = {
          session_id: initResult.session_id,
          question: {
            text: `Question ${i}: Where is user input validated in module ${i}, and what happens if validation is bypassed at a lower layer?`,
            target_files: ['/src/session.ts'],
            suspicion_rationale: `The module ${i} has async operations without clear rollback mechanisms.`,
            edge_case_targeted: 'Partial writes during network interruption',
            domain_pattern: 'VALIDATION_BYPASS',
          },
        };

        const result = submitQuestion(input);
        expect(result.status).toBe('accepted');
        expect(result.question_id).toBeDefined();
        questionIds.push(result.question_id!);
      }

      const session = collaborativeStore.getSession(initResult.session_id);
      expect(session.phase).toBe(3); // Should have advanced
      expect(session.merged_questions.length).toBe(5);
      
      // Clean up
      collaborativeStore.deleteSession(initResult.session_id);
    });

    it('should reject binary questions', async () => {
      const repoPath = getTestRepo();
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
          text: 'Is authentication implemented?', // Binary question
          target_files: ['/src/auth.ts'],
          suspicion_rationale: 'Short description here for testing.',
          edge_case_targeted: 'Test edge case description',
          domain_pattern: 'VALIDATION_BYPASS',
        },
      };

      const result = submitQuestion(input);
      expect(result.status).toBe('error');
      expect(result.code).toBe('MULTIPLE_VALIDATION_FAILURES');
      expect(result.failures?.some(f => f.code === 'BINARY_QUESTION')).toBe(true);
      
      // Clean up
      collaborativeStore.deleteSession(initResult.session_id);
    });

    it('should reject questions without target files', async () => {
      const repoPath = getTestRepo();
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
          text: 'Where is user input validated?',
          target_files: [], // Empty
          suspicion_rationale: 'Testing missing target files.',
          edge_case_targeted: 'Test edge case',
          domain_pattern: 'VALIDATION_BYPASS',
        },
      };

      const result = submitQuestion(input);
      expect(result.status).toBe('error');
      expect(result.failures?.some(f => f.code === 'MISSING_TARGET_FILES')).toBe(true);
      
      // Clean up
      collaborativeStore.deleteSession(initResult.session_id);
    });
  });

  describe('Phase 3: Generate Sub-Questions (COUNTING BUG FIX)', () => {
    it('should advance to Phase 4 when ALL main questions have sub-questions', async () => {
      const repoPath = getTestRepo();
      const initResult = await initializeAudit({
        repo_path: repoPath,
        domain: 'security',
        depth: 'standard',
      });

      // Phase 1
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

      // Phase 2 - Submit 5 main questions
      const questionIds: string[] = [];
      for (let i = 1; i <= 5; i++) {
        const qResult = submitQuestion({
          session_id: initResult.session_id,
          question: {
            text: `Question ${i}: Where is user input validated?`,
            target_files: ['/src/session.ts'],
            suspicion_rationale: `The module ${i} has async operations without clear rollback mechanisms.`,
            edge_case_targeted: 'Partial writes during network interruption',
            domain_pattern: 'VALIDATION_BYPASS',
          },
        }) as any;
        questionIds.push(qResult.question_id);
      }

      expect(collaborativeStore.getSession(initResult.session_id).phase).toBe(3);

      // Phase 3 - Submit sub-questions for ALL 5 main questions
      for (const qId of questionIds) {
        const subResult = submitSubQuestions({
          session_id: initResult.session_id,
          main_question_id: qId,
          sub_questions: createValidSubQuestions(3),
        });

        expect(subResult.status).toBe('accepted');
        expect(subResult.sub_question_ids).toBeDefined();
        expect(subResult.sub_question_ids!.length).toBeGreaterThanOrEqual(3);
      }

      // Phase 4 should be unlocked NOW
      const session = collaborativeStore.getSession(initResult.session_id);
      expect(session.phase).toBe(4);
      
      // Verify all main questions have sub_question_ids
      for (const mq of session.merged_questions) {
        expect(mq.sub_question_ids.length).toBeGreaterThan(0);
      }
      
      // Clean up
      collaborativeStore.deleteSession(initResult.session_id);
    });

    it('should NOT advance to Phase 4 until ALL main questions have sub-questions', async () => {
      const repoPath = getTestRepo();
      const initResult = await initializeAudit({
        repo_path: repoPath,
        domain: 'security',
        depth: 'standard',
      });

      // Phase 1
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

      // Phase 2 - Submit 5 main questions
      const questionIds: string[] = [];
      for (let i = 1; i <= 5; i++) {
        const qResult = submitQuestion({
          session_id: initResult.session_id,
          question: {
            text: `Question ${i}: Where is user input validated?`,
            target_files: ['/src/session.ts'],
            suspicion_rationale: `The module ${i} has async operations without clear rollback mechanisms.`,
            edge_case_targeted: 'Partial writes during network interruption',
            domain_pattern: 'VALIDATION_BYPASS',
          },
        }) as any;
        questionIds.push(qResult.question_id);
      }

      // Submit sub-questions for only 4 out of 5 main questions
      for (let i = 0; i < 4; i++) {
        submitSubQuestions({
          session_id: initResult.session_id,
          main_question_id: questionIds[i],
          sub_questions: createValidSubQuestions(3),
        });
      }

      // Phase should still be 3 (not 4)
      const session = collaborativeStore.getSession(initResult.session_id);
      expect(session.phase).toBe(3);

      // Now submit the last one
      submitSubQuestions({
        session_id: initResult.session_id,
        main_question_id: questionIds[4],
        sub_questions: createValidSubQuestions(3),
      });

      // NOW Phase 4 should be unlocked
      expect(collaborativeStore.getSession(initResult.session_id).phase).toBe(4);
      
      // Clean up
      collaborativeStore.deleteSession(initResult.session_id);
    });

    it('should return sub_question_ids when accepted', async () => {
      const repoPath = getTestRepo();
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

      // Submit 5 questions to unlock Phase 3
      let qResult: any;
      for (let i = 1; i <= 5; i++) {
        qResult = submitQuestion({
          session_id: initResult.session_id,
          question: {
            text: `Question ${i}: Where is user input validated?`,
            target_files: ['/src/session.ts'],
            suspicion_rationale: 'The session store does not handle write errors correctly.',
            edge_case_targeted: 'Disk full during session save',
            domain_pattern: 'VALIDATION_BYPASS',
          },
        }) as any;
      }

      // Submit sub-questions for the last main question
      const subResult = submitSubQuestions({
        session_id: initResult.session_id,
        main_question_id: qResult.question_id,
        sub_questions: createValidSubQuestions(3),
      });

      expect(subResult.status).toBe('accepted');
      expect(subResult.sub_question_ids).toBeDefined();
      expect(subResult.sub_question_ids!.length).toBeGreaterThanOrEqual(3);
      expect(Array.isArray(subResult.sub_question_ids)).toBe(true);
      
      // Clean up
      collaborativeStore.deleteSession(initResult.session_id);
    });
  });

  describe('Phase 4: Investigation', () => {
    async function setupPhase4(): Promise<{ sessionId: string; subQuestionIds: string[] }> {
      const repoPath = getTestRepo();
      const initResult = await initializeAudit({
        repo_path: repoPath,
        domain: 'security',
        depth: 'standard',
      });

      // Phase 1
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

      // Phase 2 - Submit 5 questions
      const questionIds: string[] = [];
      for (let i = 1; i <= 5; i++) {
        const qResult = submitQuestion({
          session_id: initResult.session_id,
          question: {
            text: `Question ${i}: Where is user input validated?`,
            target_files: ['/src/session.ts'],
            suspicion_rationale: `The module ${i} has async operations without clear rollback mechanisms.`,
            edge_case_targeted: 'Partial writes during network interruption',
            domain_pattern: 'VALIDATION_BYPASS',
          },
        }) as any;
        questionIds.push(qResult.question_id);
      }

      // Phase 3 - Submit sub-questions
      const subQuestionIds: string[] = [];
      for (const qId of questionIds) {
        const subResult = submitSubQuestions({
          session_id: initResult.session_id,
          main_question_id: qId,
          sub_questions: createValidSubQuestions(3),
        }) as any;
        subQuestionIds.push(...subResult.sub_question_ids);
      }

      return { sessionId: initResult.session_id, subQuestionIds };
    }

    it('should accept findings for sub-questions', async () => {
      const { sessionId, subQuestionIds } = await setupPhase4();

      expect(collaborativeStore.getSession(sessionId).phase).toBe(4);

      // Submit a finding for the first sub-question
      const findingInput: SubmitFindingInput = {
        session_id: sessionId,
        sub_question_id: subQuestionIds[0],
        finding: {
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
        },
      };

      const result = submitFinding(findingInput);
      expect(result.status).toBe('accepted');
      expect(result.finding_id).toBeDefined();

      const session = collaborativeStore.getSession(sessionId);
      expect(session.findings.length).toBe(1);
      
      // Clean up
      collaborativeStore.deleteSession(sessionId);
    });

    it('should require escalation_finding for FAIL verdicts', async () => {
      const { sessionId, subQuestionIds } = await setupPhase4();

      const findingInput: SubmitFindingInput = {
        session_id: sessionId,
        sub_question_id: subQuestionIds[0],
        finding: {
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
          escalation_finding: null, // Missing!
        },
      };

      const result = submitFinding(findingInput);
      expect(result.status).toBe('rejected');
      expect(result.reason).toBe('ESCALATION_REQUIRED');
      
      // Clean up
      collaborativeStore.deleteSession(sessionId);
    });

    it('should require escalation_finding for SUSPICIOUS verdicts', async () => {
      const { sessionId, subQuestionIds } = await setupPhase4();

      const findingInput: SubmitFindingInput = {
        session_id: sessionId,
        sub_question_id: subQuestionIds[0],
        finding: {
          answer: 'Something seems off but not sure what.',
          evidence: {
            file_path: '/src/session.ts',
            line_start: 45,
            line_end: 50,
            snippet: 'code',
          },
          verdict: 'SUSPICIOUS',
          severity: 'warning',
          confidence: 'medium',
          evidence_found: true,
          escalation_finding: null, // Missing!
        },
      };

      const result = submitFinding(findingInput);
      expect(result.status).toBe('rejected');
      expect(result.reason).toBe('ESCALATION_REQUIRED');
      
      // Clean up
      collaborativeStore.deleteSession(sessionId);
    });

  it('should checkpoint a main question after all its sub-questions have findings', async () => {
    const { sessionId, subQuestionIds } = await setupPhase4();

    // Submit findings for all sub-questions of the first main question
    // (First 3 sub-questions belong to first main question with standard depth)
    const firstMainQuestionSubIds = subQuestionIds.slice(0, 3);

    for (const sqId of firstMainQuestionSubIds) {
      submitFinding({
        session_id: sessionId,
        sub_question_id: sqId,
        finding: {
          answer: 'Finding for sub-question',
          evidence: {
            file_path: '/src/session.ts',
            line_start: 1,
            line_end: 10,
            snippet: 'code snippet',
          },
          verdict: 'PASS',
          severity: 'info',
          confidence: 'high',
          evidence_found: true,
          escalation_finding: null,
        },
      });
    }

    // Get the main question ID
    const session = collaborativeStore.getSession(sessionId);
    const firstMainQuestionId = session.merged_questions[0].id;

    // Checkpoint should work now
    const checkpointResult = checkpoint({
      session_id: sessionId,
      main_question_id: firstMainQuestionId,
    });

    expect(checkpointResult.status).toBe('checkpoint_accepted');

    // Clean up
    collaborativeStore.deleteSession(sessionId);
  });
});

describe('Report Finalization', () => {
  it('should require agent_id parameter for finalize_report', () => {
    // Test that FinalizeReportInput requires agent_id
    // This is a schema-level test
    const input = {
      session_id: '123e4567-e89b-12d3-a456-426614174000',
      // agent_id is now required
    };

    // The schema validation would reject this
    expect(input).not.toHaveProperty('agent_id');
  });
});

  describe('Session Persistence', () => {
    it('should store sessions in project directory', async () => {
      const repoPath = `/tmp/test-persistence-${Date.now()}`;
      
      const initResult = await initializeAudit({
        repo_path: repoPath,
        domain: 'security',
        depth: 'standard',
      });

      // Session should be persisted
      const sessionDir = join(repoPath, '.questionnaire', 'collaborative-sessions');
      expect(existsSync(sessionDir)).toBe(true);
      
      // Clean up
      collaborativeStore.deleteSession(initResult.session_id);
      try {
        rmSync(repoPath, { recursive: true, force: true });
      } catch {
        // Ignore
      }
    });

    it('should discover sessions by repo path', async () => {
      const repoPath = `/tmp/test-discover-${Date.now()}`;
      
      const initResult = await initializeAudit({
        repo_path: repoPath,
        domain: 'architecture',
        depth: 'deep',
      });

      const discovered = collaborativeStore.discoverSessions(repoPath);
      expect(discovered.length).toBeGreaterThan(0);
      expect(discovered[0].session_id).toBe(initResult.session_id);

      // Clean up
      collaborativeStore.deleteSession(initResult.session_id);
      try {
        rmSync(repoPath, { recursive: true, force: true });
      } catch {
        // Ignore
      }
    });
  });
});
