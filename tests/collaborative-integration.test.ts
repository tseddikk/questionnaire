/**
 * Multi-Agent Collaborative Integration Tests
 *
 * Exercises the full collaborative protocol: two agents joining the same
 * session, submitting observations/questions/findings, reacting to each
 * other's findings, adjudicating disputes, and finalizing a report.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { collaborativeStore, setRegistryPath } from '../src/state/collaborative-store.js';
import { initializeAudit } from '../src/tools/initialize-audit.js';
import { joinSession } from '../src/tools/join-session.js';
import { submitObservations } from '../src/tools/submit-observations.js';
import { submitQuestion } from '../src/tools/submit-question.js';
import { submitSubQuestions } from '../src/tools/submit-sub-questions.js';
import { submitFinding } from '../src/tools/submit-finding.js';
import { reactToFinding } from '../src/tools/react-to-finding.js';
import { reactToQuestion } from '../src/tools/react-to-question.js';
import { checkpoint } from '../src/tools/checkpoint.js';
import { designateSynthesizer } from '../src/tools/designate-synthesizer.js';
import { adjudicateFinding } from '../src/tools/adjudicate-finding.js';
import { finalizeReport } from '../src/tools/finalize-report.js';
import { archiveSession } from '../src/tools/archive-session.js';
import { discoverSessions } from '../src/tools/discover-sessions.js';
import { listObservations } from '../src/tools/list-observations.js';
import { getSessionSummary } from '../src/tools/get-session-summary.js';
import type { SubmitFindingInput } from '../src/types/schemas.js';

const AGENT_A = 'agent-alice';
const AGENT_B = 'agent-bob';

const testRegistryDir = join(process.cwd(), 'tests', 'test-registry');
const testRegistryPath = join(testRegistryDir, 'collab-integration-registry.json');
const createdRepos: string[] = [];

let repoCounter = 0;
function getTestRepo(): string {
  const repoPath = `/tmp/test-collab-${Date.now()}-${repoCounter++}`;
  createdRepos.push(repoPath);
  return repoPath;
}

function createValidSubQuestions(count: number) {
  return Array.from({ length: Math.max(count, 3) }, (_, i) => ({
    text: `Sub-question ${i + 1}: What happens when operation ${i + 1} fails?`,
    target_files: ['/src/session.ts'],
    pass_criteria: `Code handles error gracefully in case ${i + 1}`,
    fail_criteria: `No error handling found in case ${i + 1}`,
    evidence_pattern: `try/catch or error callback for case ${i + 1}`,
    escalation_question: `What is the blast radius if case ${i + 1} fails?`,
  }));
}

function makeObservations(purpose: string) {
  return {
    purpose,
    tech_stack: [{ name: 'React', version: '18.0.0', file_path: '/package.json' }],
    entry_points: [{ type: 'API', location: '/api/auth', file_path: '/src/routes/auth.ts' }],
    data_flows: [],
    auth_mechanisms: [],
    error_patterns: [],
    test_coverage: [],
    config_secrets: [],
    deployment: [],
  };
}

function makeFinding(answer: string, verdict: 'PASS' | 'FAIL' | 'SUSPICIOUS' | 'UNCERTAIN' = 'FAIL') {
  return {
    answer,
    evidence: {
      file_path: '/src/session.ts',
      line_start: 1,
      line_end: 10,
      snippet: 'const x = potentiallyBroken();',
    },
    verdict,
    severity: 'critical' as const,
    confidence: 'high' as const,
    evidence_found: true,
    escalation_finding: verdict === 'FAIL' || verdict === 'SUSPICIOUS' ? 'Could cascade to downstream systems' : null,
  };
}

async function setupFullSession(): Promise<{
  sessionId: string;
  repoPath: string;
  questionIds: string[];
  subQuestionIds: string[];
}> {
  const repoPath = getTestRepo();
  const initResult = await initializeAudit({
    repo_path: repoPath,
    agent_id: AGENT_A,
    domain: 'security',
    depth: 'standard',
  });

  submitObservations({
    session_id: initResult.session_id,
    agent_id: AGENT_A,
    observations: makeObservations('Security audit by agent A'),
  });

  const questionIds: string[] = [];
  for (let i = 1; i <= 5; i++) {
    const qResult = submitQuestion({
      session_id: initResult.session_id,
      agent_id: AGENT_A,
      question: {
        text: `Question ${i}: Where is user input validated in module ${i}, and what happens if validation is bypassed at a lower layer?`,
        target_files: [`/src/module${i}.ts`],
        suspicion_rationale: `Module ${i} has async operations without clear rollback mechanisms.`,
        edge_case_targeted: 'Partial writes during network interruption',
        domain_pattern: 'VALIDATION_BYPASS',
      },
    }) as any;
    questionIds.push(qResult.question_id);
  }

  const subQuestionIds: string[] = [];
  for (const qId of questionIds) {
    const subResult = submitSubQuestions({
      session_id: initResult.session_id,
      agent_id: AGENT_A,
      main_question_id: qId,
      sub_questions: createValidSubQuestions(3),
    }) as any;
    subQuestionIds.push(...subResult.sub_question_ids);
  }

  return { sessionId: initResult.session_id, repoPath, questionIds, subQuestionIds };
}

describe('Multi-Agent Collaborative Protocol', () => {
  beforeEach(() => {
    if (!existsSync(testRegistryDir)) {
      mkdirSync(testRegistryDir, { recursive: true });
    }
    setRegistryPath(testRegistryPath);

    const sessions = collaborativeStore.getAllSessions();
    for (const session of sessions) {
      collaborativeStore.deleteSession(session.session_id);
    }
  });

  afterEach(() => {
    if (existsSync(testRegistryPath)) {
      try { rmSync(testRegistryPath, { force: true }); } catch { /* ignore */ }
    }
    for (const testDir of createdRepos) {
      try {
        if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
      } catch { /* ignore */ }
    }
    createdRepos.length = 0;
  });

  describe('join_session', () => {
    it('should allow a second agent to join an existing session', async () => {
      const repoPath = getTestRepo();
      const initResult = await initializeAudit({
        repo_path: repoPath,
        agent_id: AGENT_A,
        domain: 'security',
        depth: 'standard',
      });

      const joinResult = joinSession({
        session_id: initResult.session_id,
        agent_id: AGENT_B,
        repo_path: repoPath,
      });

      expect(joinResult.status).toBe('joined');
      expect(joinResult.your_role).toBe('investigator');
      expect(joinResult.investigators).toContain(AGENT_B);

      const session = collaborativeStore.getSession(initResult.session_id);
      expect(session.agents.some(a => a.agent_id === AGENT_B)).toBe(true);
    });

    it('should reject join with wrong repo_path', async () => {
      const repoPath = getTestRepo();
      const initResult = await initializeAudit({
        repo_path: repoPath,
        agent_id: AGENT_A,
        domain: 'security',
        depth: 'standard',
      });

      expect(() => {
        joinSession({
          session_id: initResult.session_id,
          agent_id: AGENT_B,
          repo_path: '/wrong/repo/path',
        });
      }).toThrow('Repository mismatch');
    });

    it('should be idempotent for already-joined agents', async () => {
      const repoPath = getTestRepo();
      const initResult = await initializeAudit({
        repo_path: repoPath,
        agent_id: AGENT_A,
        domain: 'security',
        depth: 'standard',
      });

      joinSession({
        session_id: initResult.session_id,
        agent_id: AGENT_B,
        repo_path: repoPath,
      });

      const joinResult2 = joinSession({
        session_id: initResult.session_id,
        agent_id: AGENT_B,
        repo_path: repoPath,
      });

      expect(joinResult2.status).toBe('joined');

      const session = collaborativeStore.getSession(initResult.session_id);
      const bobCount = session.agents.filter(a => a.agent_id === AGENT_B).length;
      expect(bobCount).toBe(1);
    });
  });

  describe('discover_sessions', () => {
    it('should find active sessions for a repo path', async () => {
      const repoPath = getTestRepo();
      await initializeAudit({
        repo_path: repoPath,
        agent_id: AGENT_A,
        domain: 'security',
        depth: 'standard',
      });

      const result = discoverSessions({ repo_path: repoPath });

      expect(result.active_sessions.length).toBeGreaterThan(0);
      expect(result.active_sessions[0].started_by).toBe(AGENT_A);
      expect(result.active_sessions[0].questions_accepted).toBe(0);
    });

    it('should return empty array for repo with no sessions', () => {
      const result = discoverSessions({ repo_path: '/nonexistent/repo' });
      expect(result.active_sessions).toEqual([]);
    });
  });

  describe('Two agents submitting observations and questions', () => {
    it('should allow both agents to submit observations independently', async () => {
      const repoPath = getTestRepo();
      const initResult = await initializeAudit({
        repo_path: repoPath,
        agent_id: AGENT_A,
        domain: 'security',
        depth: 'standard',
      });

      joinSession({
        session_id: initResult.session_id,
        agent_id: AGENT_B,
        repo_path: repoPath,
      });

      const resultA = submitObservations({
        session_id: initResult.session_id,
        agent_id: AGENT_A,
        observations: makeObservations('Audit by Alice'),
      });

      const resultB = submitObservations({
        session_id: initResult.session_id,
        agent_id: AGENT_B,
        observations: makeObservations('Audit by Bob'),
      });

      expect(resultA.status).toBe('accepted');
      expect(resultB.status).toBe('accepted');

      const session = collaborativeStore.getSession(initResult.session_id);
      expect(session.observation_sets.length).toBe(2);
    });

    it('should allow both agents to submit questions', async () => {
      const repoPath = getTestRepo();
      const initResult = await initializeAudit({
        repo_path: repoPath,
        agent_id: AGENT_A,
        domain: 'security',
        depth: 'standard',
      });

      submitObservations({
        session_id: initResult.session_id,
        agent_id: AGENT_A,
        observations: makeObservations('Audit by Alice'),
      });

      joinSession({
        session_id: initResult.session_id,
        agent_id: AGENT_B,
        repo_path: repoPath,
      });

      for (let i = 1; i <= 3; i++) {
        const result = submitQuestion({
          session_id: initResult.session_id,
          agent_id: AGENT_A,
          question: {
            text: `Question ${i} from Alice: Where is input validated, and what happens if validation is bypassed?`,
            target_files: [`/src/alice${i}.ts`],
            suspicion_rationale: `Alice found async issues in module ${i}.`,
            edge_case_targeted: 'Partial writes during network interruption',
            domain_pattern: 'VALIDATION_BYPASS',
          },
        }) as any;
        expect(result.status).toBe('accepted');
      }

      for (let i = 4; i <= 5; i++) {
        const result = submitQuestion({
          session_id: initResult.session_id,
          agent_id: AGENT_B,
          question: {
            text: `Question ${i} from Bob: Where is error handling validated, and what happens if validation is bypassed?`,
            target_files: [`/src/bob${i}.ts`],
            suspicion_rationale: `Bob found missing error handling in module ${i}.`,
            edge_case_targeted: 'Unhandled promise rejection',
            domain_pattern: 'VALIDATION_BYPASS',
          },
        }) as any;
        expect(result.status).toBe('accepted');
      }

      const session = collaborativeStore.getSession(initResult.session_id);
      expect(session.merged_questions.length).toBe(5);
    });
  });

  describe('react_to_finding', () => {
    it('should allow one agent to confirm another agent\'s finding', async () => {
      const { sessionId, subQuestionIds } = await setupFullSession();

      const findingResult = submitFinding({
        session_id: sessionId,
        agent_id: AGENT_A,
        sub_question_id: subQuestionIds[0],
        finding: makeFinding('Missing error handling in session store'),
      }) as any;

      joinSession({
        session_id: sessionId,
        agent_id: AGENT_B,
        repo_path: collaborativeStore.getSession(sessionId).repo_path,
      });

      const confirmResult = reactToFinding({
        session_id: sessionId,
        agent_id: AGENT_B,
        finding_id: findingResult.finding_id,
        reaction_type: 'confirm',
        content: 'I independently verified this - the same error handling gap exists.',
        evidence: {
          file_path: '/src/session.ts',
          line_start: 15,
          line_end: 25,
          snippet: 'await store.write(data); // no try/catch',
        },
      });

      expect(confirmResult.status).toBe('accepted');
      expect(confirmResult.finding_status).toBe('confirmed');
      expect(confirmResult.reaction_id).toBeDefined();
    });

    it('should allow one agent to challenge another agent\'s finding', async () => {
      const { sessionId, subQuestionIds } = await setupFullSession();

      const findingResult = submitFinding({
        session_id: sessionId,
        agent_id: AGENT_A,
        sub_question_id: subQuestionIds[0],
        finding: makeFinding('Race condition in concurrent access'),
      }) as any;

      joinSession({
        session_id: sessionId,
        agent_id: AGENT_B,
        repo_path: collaborativeStore.getSession(sessionId).repo_path,
      });

      const challengeResult = reactToFinding({
        session_id: sessionId,
        agent_id: AGENT_B,
        finding_id: findingResult.finding_id,
        reaction_type: 'challenge',
        content: 'This is not a race condition - the access is serialized by the event loop.',
        evidence: {
          file_path: '/src/session.ts',
          line_start: 30,
          line_end: 40,
          snippet: 'queueMicrotask(() => process(data));',
        },
      });

      expect(challengeResult.status).toBe('accepted');
      expect(challengeResult.finding_status).toBe('contested');

      const session = collaborativeStore.getSession(sessionId);
      expect(session.contested_findings).toContain(findingResult.finding_id);
    });

    it('should allow one agent to extend another agent\'s finding', async () => {
      const { sessionId, subQuestionIds } = await setupFullSession();

      const findingResult = submitFinding({
        session_id: sessionId,
        agent_id: AGENT_A,
        sub_question_id: subQuestionIds[0],
        finding: makeFinding('Missing cleanup in error path'),
      }) as any;

      joinSession({
        session_id: sessionId,
        agent_id: AGENT_B,
        repo_path: collaborativeStore.getSession(sessionId).repo_path,
      });

      const extendResult = reactToFinding({
        session_id: sessionId,
        agent_id: AGENT_B,
        finding_id: findingResult.finding_id,
        reaction_type: 'extend',
        content: 'The same missing cleanup also affects the database connection pool.',
      });

      expect(extendResult.status).toBe('accepted');
      expect(extendResult.finding_status).toBe('extended');
    });

    it('should reject self-reaction', async () => {
      const { sessionId, subQuestionIds } = await setupFullSession();

      const findingResult = submitFinding({
        session_id: sessionId,
        agent_id: AGENT_A,
        sub_question_id: subQuestionIds[0],
        finding: makeFinding('Self-referential finding'),
      }) as any;

      const result = reactToFinding({
        session_id: sessionId,
        agent_id: AGENT_A,
        finding_id: findingResult.finding_id,
        reaction_type: 'extend',
        content: 'I want to add to my own finding.',
      });

      expect(result.status).toBe('rejected');
      expect(result.reason).toBe('SELF_REACTION');
    });

    it('should require evidence for confirm reactions', async () => {
      const { sessionId, subQuestionIds } = await setupFullSession();

      const findingResult = submitFinding({
        session_id: sessionId,
        agent_id: AGENT_A,
        sub_question_id: subQuestionIds[0],
        finding: makeFinding('Finding without evidence test'),
      }) as any;

      joinSession({
        session_id: sessionId,
        agent_id: AGENT_B,
        repo_path: collaborativeStore.getSession(sessionId).repo_path,
      });

      const result = reactToFinding({
        session_id: sessionId,
        agent_id: AGENT_B,
        finding_id: findingResult.finding_id,
        reaction_type: 'confirm',
        content: 'I agree but have no evidence.',
      });

      expect(result.status).toBe('rejected');
      expect(result.reason).toBe('CONFIRMATION_REQUIRES_INDEPENDENT_EVIDENCE');
    });

    it('should require evidence for challenge reactions', async () => {
      const { sessionId, subQuestionIds } = await setupFullSession();

      const findingResult = submitFinding({
        session_id: sessionId,
        agent_id: AGENT_A,
        sub_question_id: subQuestionIds[0],
        finding: makeFinding('Challenge without evidence test'),
      }) as any;

      joinSession({
        session_id: sessionId,
        agent_id: AGENT_B,
        repo_path: collaborativeStore.getSession(sessionId).repo_path,
      });

      const result = reactToFinding({
        session_id: sessionId,
        agent_id: AGENT_B,
        finding_id: findingResult.finding_id,
        reaction_type: 'challenge',
        content: 'I disagree but have no evidence.',
      });

      expect(result.status).toBe('rejected');
      expect(result.reason).toBe('CHALLENGE_REQUIRES_EVIDENCE');
    });

    it('should reject reaction from agent not in session', async () => {
      const { sessionId, subQuestionIds } = await setupFullSession();

      const findingResult = submitFinding({
        session_id: sessionId,
        agent_id: AGENT_A,
        sub_question_id: subQuestionIds[0],
        finding: makeFinding('Agent membership test'),
      }) as any;

      const result = reactToFinding({
        session_id: sessionId,
        agent_id: 'agent-not-in-session',
        finding_id: findingResult.finding_id,
        reaction_type: 'extend',
        content: 'I am not a member.',
      });

      expect(result.status).toBe('rejected');
      expect(result.reason).toBe('Agent not in session');
    });
  });

  describe('react_to_question', () => {
    it('should accept endorse reactions', async () => {
      const { sessionId, questionIds } = await setupFullSession();

      joinSession({
        session_id: sessionId,
        agent_id: AGENT_B,
        repo_path: collaborativeStore.getSession(sessionId).repo_path,
      });

      const result = reactToQuestion({
        session_id: sessionId,
        agent_id: AGENT_B,
        question_id: questionIds[0],
        reaction_type: 'endorse',
        content: 'This question targets a critical area.',
      });

      expect(result.status).toBe('accepted');
      expect(result.reaction_id).toBeDefined();
    });

    it('should accept challenge_quality reactions', async () => {
      const { sessionId, questionIds } = await setupFullSession();

      joinSession({
        session_id: sessionId,
        agent_id: AGENT_B,
        repo_path: collaborativeStore.getSession(sessionId).repo_path,
      });

      const result = reactToQuestion({
        session_id: sessionId,
        agent_id: AGENT_B,
        question_id: questionIds[0],
        reaction_type: 'challenge_quality',
        content: 'This question is too broad and doesn\'t target a specific failure mode.',
      });

      expect(result.status).toBe('accepted');
    });

    it('should throw for invalid question_id', async () => {
      const { sessionId } = await setupFullSession();

      expect(() => {
        reactToQuestion({
          session_id: sessionId,
          agent_id: AGENT_A,
          question_id: '00000000-0000-0000-0000-000000000000',
          reaction_type: 'endorse',
          content: 'Invalid question test.',
        });
      }).toThrow('Main question');
    });
  });

  describe('designate_synthesizer', () => {
  it('should designate an agent as the synthesizer', async () => {
    const repoPath = getTestRepo();
    const initResult = await initializeAudit({
      repo_path: repoPath,
      agent_id: AGENT_A,
      domain: 'security',
      depth: 'standard',
    });

    joinSession({
      session_id: initResult.session_id,
      agent_id: AGENT_B,
      repo_path: repoPath,
    });

    const result = designateSynthesizer({
      session_id: initResult.session_id,
      synthesizer_agent_id: AGENT_B,
    });

    expect(result.status).toBe('synthesizer_designated');
    expect(result.synthesizer).toBe(AGENT_B);

      const session = collaborativeStore.getSession(initResult.session_id);
      expect(session.synthesizer).toBe(AGENT_B);
    });
  });

  describe('adjudicate_finding - synthesizer-only guard', () => {
    it('should reject non-synthesizer agents from adjudicating', async () => {
      const { sessionId, subQuestionIds } = await setupFullSession();

      joinSession({
        session_id: sessionId,
        agent_id: AGENT_B,
        repo_path: collaborativeStore.getSession(sessionId).repo_path,
      });

      const findingResult = submitFinding({
        session_id: sessionId,
        agent_id: AGENT_A,
        sub_question_id: subQuestionIds[0],
        finding: makeFinding('Contested finding for adjudication test'),
      }) as any;

      reactToFinding({
        session_id: sessionId,
        agent_id: AGENT_B,
        finding_id: findingResult.finding_id,
        reaction_type: 'challenge',
        content: 'This finding is incorrect.',
        evidence: {
          file_path: '/src/other.ts',
          line_start: 1,
          line_end: 5,
          snippet: '// evidence to contrary',
        },
      });

      designateSynthesizer({
        session_id: sessionId,
        synthesizer_agent_id: AGENT_A,
      });

      expect(() => {
        adjudicateFinding({
          session_id: sessionId,
          agent_id: AGENT_B,
          finding_id: findingResult.finding_id,
          ruling: 'uphold',
          reasoning: 'Bob should not be able to adjudicate.',
        });
      }).toThrow('Only the Synthesizer can call');
    });

    it('should allow the synthesizer to adjudicate a contested finding', async () => {
      const { sessionId, subQuestionIds } = await setupFullSession();

      joinSession({
        session_id: sessionId,
        agent_id: AGENT_B,
        repo_path: collaborativeStore.getSession(sessionId).repo_path,
      });

      const findingResult = submitFinding({
        session_id: sessionId,
        agent_id: AGENT_A,
        sub_question_id: subQuestionIds[0],
        finding: makeFinding('Contested finding that synthesizer will adjudicate'),
      }) as any;

      reactToFinding({
        session_id: sessionId,
        agent_id: AGENT_B,
        finding_id: findingResult.finding_id,
        reaction_type: 'challenge',
        content: 'This finding is wrong.',
        evidence: {
          file_path: '/src/proof.ts',
          line_start: 1,
          line_end: 5,
          snippet: '// counter-evidence',
        },
      });

      designateSynthesizer({
        session_id: sessionId,
        synthesizer_agent_id: AGENT_A,
      });

      const result = adjudicateFinding({
        session_id: sessionId,
        agent_id: AGENT_A,
        finding_id: findingResult.finding_id,
        ruling: 'uphold',
        upheld_agent: AGENT_A,
        reasoning: 'The original finding stands - counter-evidence is insufficient.',
      });

      expect(result.status).toBe('adjudication_recorded');
      expect(result.adjudication_id).toBeDefined();
      expect(result.remaining_contested).toBe(0);
    });
  });

  describe('list_observations', () => {
    it('should list observation sets from all agents', async () => {
      const repoPath = getTestRepo();
      const initResult = await initializeAudit({
        repo_path: repoPath,
        agent_id: AGENT_A,
        domain: 'security',
        depth: 'standard',
      });

      submitObservations({
        session_id: initResult.session_id,
        agent_id: AGENT_A,
        observations: makeObservations('Alice observations'),
      });

      joinSession({
        session_id: initResult.session_id,
        agent_id: AGENT_B,
        repo_path: repoPath,
      });

      submitObservations({
        session_id: initResult.session_id,
        agent_id: AGENT_B,
        observations: makeObservations('Bob observations'),
      });

      const result = listObservations({ session_id: initResult.session_id });

      expect(result.observation_sets.length).toBe(2);
      expect(result.observation_sets[0].agent_id).toBe(AGENT_A);
      expect(result.observation_sets[1].agent_id).toBe(AGENT_B);
      expect(result.phase).toBeGreaterThanOrEqual(2);
    });
  });

  describe('get_session_summary', () => {
    it('should return comprehensive session state', async () => {
      const { sessionId, subQuestionIds } = await setupFullSession();

      submitFinding({
        session_id: sessionId,
        agent_id: AGENT_A,
        sub_question_id: subQuestionIds[0],
        finding: makeFinding('Summary test finding'),
      });

      joinSession({
        session_id: sessionId,
        agent_id: AGENT_B,
        repo_path: collaborativeStore.getSession(sessionId).repo_path,
      });

      const summary = getSessionSummary({ session_id: sessionId });

      expect(summary.session_id).toBe(sessionId);
      expect(summary.findings_summary.total).toBe(1);
      expect(summary.findings_summary.by_verdict.FAIL).toBe(1);
      expect(summary.investigators.length).toBeGreaterThan(0);
      expect(summary.checkpoints_complete).toBeDefined();
    });
  });

  describe('archive_session', () => {
    it('should archive a session and preserve findings', async () => {
      const repoPath = getTestRepo();
      const initResult = await initializeAudit({
        repo_path: repoPath,
        agent_id: AGENT_A,
        domain: 'security',
        depth: 'standard',
      });

      submitObservations({
        session_id: initResult.session_id,
        agent_id: AGENT_A,
        observations: makeObservations('Observations before archive'),
      });

      const result = archiveSession({
        session_id: initResult.session_id,
        agent_id: AGENT_A,
        reason: 'Audit no longer needed',
      });

      expect(result.status).toBe('archived_incomplete');
      expect(result.session_id).toBe(initResult.session_id);

      const session = collaborativeStore.getSession(initResult.session_id);
      expect(session.session_state).toBe('archived_incomplete');
    });
  });

  describe('Full collaborative flow: init → join → observe → question → find → react → checkpoint → adjudicate → finalize', () => {
    it('should complete the entire multi-agent protocol end-to-end', async () => {
      const repoPath = getTestRepo();

      // Phase 0: Agent A initializes
      const initResult = await initializeAudit({
        repo_path: repoPath,
        agent_id: AGENT_A,
        domain: 'security',
        depth: 'standard',
      });

      // Agent B joins
      const joinResult = joinSession({
        session_id: initResult.session_id,
        agent_id: AGENT_B,
        repo_path: repoPath,
      });
      expect(joinResult.status).toBe('joined');

      // Phase 1: Both submit observations
      submitObservations({
        session_id: initResult.session_id,
        agent_id: AGENT_A,
        observations: makeObservations('Alice Phase 1 observations'),
      });
      submitObservations({
        session_id: initResult.session_id,
        agent_id: AGENT_B,
        observations: makeObservations('Bob Phase 1 observations'),
      });

      // Phase 2: Both submit questions
      const questionIds: string[] = [];
      for (let i = 1; i <= 3; i++) {
        const qResult = submitQuestion({
          session_id: initResult.session_id,
          agent_id: AGENT_A,
          question: {
            text: `Alice Q${i}: Where is input validated, and what if validation is bypassed?`,
            target_files: [`/src/a${i}.ts`],
            suspicion_rationale: `Alice suspects validation gaps in module ${i}.`,
            edge_case_targeted: 'Partial writes during network interruption',
            domain_pattern: 'VALIDATION_BYPASS',
          },
        }) as any;
        questionIds.push(qResult.question_id);
      }
      for (let i = 4; i <= 5; i++) {
        const qResult = submitQuestion({
          session_id: initResult.session_id,
          agent_id: AGENT_B,
          question: {
            text: `Bob Q${i}: Where is error handling validated, and what happens if validation is bypassed?`,
            target_files: [`/src/b${i}.ts`],
            suspicion_rationale: `Bob suspects error handling gaps in module ${i}.`,
            edge_case_targeted: 'Unhandled promise rejection',
            domain_pattern: 'VALIDATION_BYPASS',
          },
        }) as any;
        questionIds.push(qResult.question_id);
      }

      // Phase 3: Agent A submits sub-questions for all
      const subQuestionIds: string[] = [];
      for (const qId of questionIds) {
        const subResult = submitSubQuestions({
          session_id: initResult.session_id,
          agent_id: AGENT_A,
          main_question_id: qId,
          sub_questions: createValidSubQuestions(3),
        }) as any;
        subQuestionIds.push(...subResult.sub_question_ids);
      }

      // Phase 4: Both agents submit findings
      // Agent A submits findings for first main question's sub-questions
      const firstMainQSubIds = subQuestionIds.slice(0, 3);
      const findingIds: string[] = [];
      for (const sqId of firstMainQSubIds) {
        const fResult = submitFinding({
          session_id: initResult.session_id,
          agent_id: AGENT_A,
          sub_question_id: sqId,
          finding: makeFinding('Agent A found a critical error handling gap'),
        }) as any;
        findingIds.push(fResult.finding_id);
      }

      // Agent B reacts to Agent A's first finding (challenge it)
      const challengeResult = reactToFinding({
        session_id: initResult.session_id,
        agent_id: AGENT_B,
        finding_id: findingIds[0],
        reaction_type: 'challenge',
        content: 'The error handling is actually present in a wrapper function.',
        evidence: {
          file_path: '/src/wrapper.ts',
          line_start: 10,
          line_end: 20,
          snippet: 'try { await operation(); } catch (e) { handle(e); }',
        },
      });
      expect(challengeResult.status).toBe('accepted');
      expect(challengeResult.finding_status).toBe('contested');

      // Agent B confirms Agent A's second finding
      const confirmResult = reactToFinding({
        session_id: initResult.session_id,
        agent_id: AGENT_B,
        finding_id: findingIds[1],
        reaction_type: 'confirm',
        content: 'I independently verified this gap.',
        evidence: {
          file_path: '/src/session.ts',
          line_start: 50,
          line_end: 60,
          snippet: 'db.write(data); // no error handling',
        },
      });
      expect(confirmResult.status).toBe('accepted');
      expect(confirmResult.finding_status).toBe('confirmed');

      // Agent A checkpoints the first main question
      const cpResult = checkpoint({
        session_id: initResult.session_id,
        agent_id: AGENT_A,
        main_question_id: questionIds[0],
      });
      expect(cpResult.status).toBe('checkpoint_accepted');

      // Agent B also checkpoints the first main question (via reactions)
      const cpResult2 = checkpoint({
        session_id: initResult.session_id,
        agent_id: AGENT_B,
        main_question_id: questionIds[0],
      });
      expect(cpResult2.status).toBe('checkpoint_accepted');

      // Designate Agent A as synthesizer
      designateSynthesizer({
        session_id: initResult.session_id,
        synthesizer_agent_id: AGENT_A,
      });

      // Synthesizer adjudicates the contested finding
      const adjResult = adjudicateFinding({
        session_id: initResult.session_id,
        agent_id: AGENT_A,
        finding_id: findingIds[0],
        ruling: 'uphold',
        upheld_agent: AGENT_A,
        reasoning: 'The wrapper function does not cover all error paths.',
      });
      expect(adjResult.status).toBe('adjudication_recorded');

      // Agent B submits findings for remaining sub-questions to enable checkpointing
      for (let i = 1; i < questionIds.length; i++) {
        const qSubIds = subQuestionIds.slice(i * 3, (i + 1) * 3);
        for (const sqId of qSubIds) {
          submitFinding({
            session_id: initResult.session_id,
            agent_id: AGENT_B,
            sub_question_id: sqId,
            finding: makeFinding('Agent B found issues here too'),
          });
        }

        // Both checkpoint
        checkpoint({
          session_id: initResult.session_id,
          agent_id: AGENT_A,
          main_question_id: questionIds[i],
        });
        checkpoint({
          session_id: initResult.session_id,
          agent_id: AGENT_B,
          main_question_id: questionIds[i],
        });
      }

      // Phase 5: Synthesizer finalizes
      const report = finalizeReport({
        session_id: initResult.session_id,
        agent_id: AGENT_A,
      });

      expect(report.status).toBe('report_authorized');
      if (report.status === 'report_authorized') {
        expect(report.findings_summary.total).toBeGreaterThan(0);
        expect(report.cross_cutting_concerns).toBeDefined();
        expect(report.escalations).toBeDefined();
        expect(report.report_schema).toBeDefined();
      }
    });
  });

  describe('finalize_report - synthesizer-only guard', () => {
    it('should reject non-synthesizer agents from finalizing', async () => {
  const { sessionId, subQuestionIds, questionIds } = await setupFullSession();

  joinSession({
    session_id: sessionId,
    agent_id: AGENT_B,
    repo_path: collaborativeStore.getSession(sessionId).repo_path,
  });

  // Submit findings for all sub-questions so finalizeReport gets past the "no findings" check
  for (const sqId of subQuestionIds) {
    submitFinding({
      session_id: sessionId,
      agent_id: AGENT_A,
      sub_question_id: sqId,
      finding: makeFinding('Finding for finalize guard test'),
    });
  }

  // Both agents checkpoint all questions so precondition check passes
  for (const qId of questionIds) {
    checkpoint({
      session_id: sessionId,
      agent_id: AGENT_A,
      main_question_id: qId,
    });
    // Agent B reacts to first finding of each question to enable checkpoint via reactions
    const session = collaborativeStore.getSession(sessionId);
    const questionIdx = questionIds.indexOf(qId);
    const firstSqId = subQuestionIds[questionIdx * 3];
    const firstFinding = session.findings.find(f => f.sub_question_id === firstSqId);
    if (firstFinding) {
      reactToFinding({
        session_id: sessionId,
        agent_id: AGENT_B,
        finding_id: firstFinding.finding_id,
        reaction_type: 'extend',
        content: 'Agent B extending for checkpoint eligibility',
        evidence: {
          file_path: '/src/guard.ts',
          line_start: 1,
          line_end: 5,
          snippet: '// guard evidence',
        },
      });
    }
    checkpoint({
      session_id: sessionId,
      agent_id: AGENT_B,
      main_question_id: qId,
    });
  }

  designateSynthesizer({
    session_id: sessionId,
    synthesizer_agent_id: AGENT_A,
  });

  expect(() => {
    finalizeReport({
      session_id: sessionId,
      agent_id: AGENT_B,
    });
  }).toThrow();
    });
  });

  describe('Cross-cutting signals persistence', () => {
  it('should persist cross_cutting_signals in checkpoints', async () => {
    const { sessionId, subQuestionIds, questionIds } = await setupFullSession();

    // Submit findings for ALL sub-questions of the first main question
    const firstQSubIds = subQuestionIds.slice(0, 3);
    for (const sqId of firstQSubIds) {
      submitFinding({
        session_id: sessionId,
        agent_id: AGENT_A,
        sub_question_id: sqId,
        finding: {
          answer: 'Resource leak detected: file handle not released on error path',
          evidence: {
            file_path: '/src/resource.ts',
            line_start: 1,
            line_end: 10,
            snippet: 'const handle = open(path); // never closed on error',
          },
          verdict: 'FAIL',
          severity: 'critical',
          confidence: 'high',
          evidence_found: true,
          escalation_finding: 'Could exhaust file descriptors under load',
        },
      });
    }

      const cpResult = checkpoint({
        session_id: sessionId,
        agent_id: AGENT_A,
        main_question_id: questionIds[0],
      });

      expect(cpResult.status).toBe('checkpoint_accepted');

      // Verify signals were persisted in the session
      const session = collaborativeStore.getSession(sessionId);
      const cp = session.agent_checkpoints.find(
        c => c.main_question_id === questionIds[0] && c.agent_id === AGENT_A
      );
      expect(cp).toBeDefined();
      expect(cp!.cross_cutting_signals).toBeDefined();
      expect(Array.isArray(cp!.cross_cutting_signals)).toBe(true);
    });
  });
});
