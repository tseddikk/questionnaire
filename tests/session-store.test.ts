/**
 * Session Store Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { SessionStore } from '../src/state/session-store.js';
import { SessionNotFoundError } from '../src/state/errors.js';

describe('SessionStore', () => {
  let store: SessionStore;
  let repoPath: string;

  beforeEach(() => {
    // Simulate the user's project repo as a real temp directory
    repoPath = mkdtempSync(join(tmpdir(), 'questionnaire-test-repo-'));
    store = new SessionStore();
  });

  afterEach(() => {
    rmSync(repoPath, { recursive: true, force: true });
  });

  describe('createSession', () => {
    it('should create a new session with the correct properties', () => {
      const session = store.createSession(repoPath, 'security', 'standard');

      expect(session.session_id).toBeDefined();
      expect(session.repo_path).toBe(repoPath);
      expect(session.domain).toBe('security');
      expect(session.depth).toBe('standard');
      expect(session.phase).toBe(0);
      expect(session.observations).toBeNull();
      expect(session.main_questions).toHaveLength(0);
      expect(session.sub_questions).toHaveLength(0);
      expect(session.findings).toHaveLength(0);
      expect(session.checkpoints).toHaveLength(0);
    });

    it('should generate unique session IDs', () => {
      const session1 = store.createSession(repoPath, 'security', 'standard');
      const session2 = store.createSession(repoPath, 'performance', 'deep');

      expect(session1.session_id).not.toBe(session2.session_id);
    });
  });

  describe('getSession', () => {
    it('should return a session by ID', () => {
      const session = store.createSession(repoPath, 'security', 'standard');
      const retrieved = store.getSession(session.session_id);

      expect(retrieved.session_id).toBe(session.session_id);
    });

    it('should throw SessionNotFoundError for non-existent session', () => {
      expect(() => store.getSession('non-existent')).toThrow(SessionNotFoundError);
    });
  });

  describe('phase management', () => {
    it('should advance phase correctly', () => {
      const session = store.createSession(repoPath, 'security', 'standard');
      store.advancePhase(session.session_id, 1);

      const updated = store.getSession(session.session_id);
      expect(updated.phase).toBe(1);
    });

    it('should not allow advancing to same or lower phase', () => {
      const session = store.createSession(repoPath, 'security', 'standard');
      store.advancePhase(session.session_id, 2);

      expect(() => store.advancePhase(session.session_id, 1)).toThrow();
      expect(() => store.advancePhase(session.session_id, 2)).toThrow();
    });
  });

  describe('main questions', () => {
    it('should add main questions', () => {
      const session = store.createSession(repoPath, 'security', 'standard');
      store.advancePhase(session.session_id, 2);

      const question = store.addMainQuestion(session.session_id, {
        text: 'Test question?',
        target_files: ['/src/test.ts'],
        suspicion_rationale: 'This looks suspicious',
        edge_case_targeted: 'Edge case here',
        domain_pattern: 'ASYNC_FAILURE',
      });

      expect(question.id).toBeDefined();
      expect(question.sub_question_ids).toHaveLength(0);

      const updated = store.getSession(session.session_id);
      expect(updated.main_questions).toHaveLength(1);
    });
  });
});
