/**
 * Persistent Session Store
 *
 * File-based storage for audit sessions in the user's project directory.
 * Sessions persist across server restarts.
 * Sessions are stored in <repo_path>/.questionnaire/audit-sessions/
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { v4 as uuidv4 } from 'uuid';
import type {
  AuditSession,
  AuditDomain,
  AuditDepth,
  MainQuestion,
  SubQuestion,
  Finding,
  CheckpointRecord,
  Report,
  ObservationLog,
} from '../types/domain.js';
import type { AuditPhase } from '../types/domain.js';
import { SessionNotFoundError, SessionExpiredError } from './errors.js';

// ============================================================================
// Configuration
// ============================================================================

// Session TTL: 24 hours (in milliseconds)
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

// Subdirectory within repo for storing sessions
const QUESTIONNAIRE_DIR = '.questionnaire';
const SESSIONS_SUBDIR = 'audit-sessions';

// Global registry: maps sessionId -> repoPath so sessions survive server restarts
function getGlobalRegistryPath(): string {
  return join(homedir(), '.questionnaire', 'session-registry.json');
}

function loadGlobalRegistry(): Record<string, string> {
  const registryPath = getGlobalRegistryPath();
  if (!existsSync(registryPath)) {return {};}
  try {
    return JSON.parse(readFileSync(registryPath, 'utf-8')) as Record<string, string>;
  } catch {
    return {};
  }
}

function saveToGlobalRegistry(sessionId: string, repoPath: string): void {
  const registryPath = getGlobalRegistryPath();
  const registryDir = join(homedir(), '.questionnaire');
  if (!existsSync(registryDir)) {
    mkdirSync(registryDir, { recursive: true });
  }
  const registry = loadGlobalRegistry();
  registry[sessionId] = repoPath;
  try {
    writeFileSync(registryPath, JSON.stringify(registry, null, 2), 'utf-8');
  } catch (e) {
    console.error(`Failed to update global session registry:`, e);
  }
}

function removeFromGlobalRegistry(sessionId: string): void {
  const registryPath = getGlobalRegistryPath();
  if (!existsSync(registryPath)) {return;}
  const registry = loadGlobalRegistry();
  delete registry[sessionId];
  try {
    writeFileSync(registryPath, JSON.stringify(registry, null, 2), 'utf-8');
  } catch (e) {
    console.error(`Failed to update global session registry:`, e);
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get the sessions directory for a repo
 */
function getRepoSessionsDir(repoPath: string): string {
  return join(repoPath, QUESTIONNAIRE_DIR, SESSIONS_SUBDIR);
}

// ============================================================================
// Persistent Session Store Implementation
// ============================================================================

export class PersistentSessionStore {
  private repoPaths: Map<string, string> = new Map(); // sessionId -> repoPath mapping
  private cache: Map<string, AuditSession> = new Map();

  /**
   * Get session file path within a repo
   */
  private getSessionPath(sessionId: string, repoPath: string): string {
    const sessionsDir = getRepoSessionsDir(repoPath);
    return join(sessionsDir, `${sessionId}.json`);
  }

  /**
   * Ensure the sessions directory exists for a repo
   */
  private ensureSessionsDir(repoPath: string): void {
    const sessionsDir = getRepoSessionsDir(repoPath);
    if (!existsSync(sessionsDir)) {
      mkdirSync(sessionsDir, { recursive: true });
    }
  }

  /**
   * Load sessions from a specific repo
   */
  private loadSessionsFromRepo(repoPath: string): void {
    const sessionsDir = getRepoSessionsDir(repoPath);
    if (!existsSync(sessionsDir)) {
      return; // No sessions yet for this repo
    }

    try {
      const files = readdirSync(sessionsDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const sessionId = file.replace('.json', '');
          const sessionPath = join(sessionsDir, file);
          try {
            const data = readFileSync(sessionPath, 'utf-8');
            const session = JSON.parse(data) as AuditSession;
            // Revive Date objects from JSON
            session.created_at = new Date(session.created_at);
            session.updated_at = new Date(session.updated_at);
            // Track the repo path for this session
            this.repoPaths.set(sessionId, repoPath);
            this.cache.set(sessionId, session);
          } catch (e) {
            // Invalid session file, skip
            console.error(`Failed to load session ${sessionId} from ${repoPath}:`, e);
          }
        }
      }
    } catch (e) {
      console.error(`Failed to load sessions from ${repoPath}:`, e);
    }
  }

  /**
   * Save session to disk
   */
  private saveSession(session: AuditSession): void {
    const repoPath = this.repoPaths.get(session.session_id);
    if (!repoPath) {
      console.error(`No repo path known for session ${session.session_id}`);
      return;
    }

    const sessionPath = this.getSessionPath(session.session_id, repoPath);
    try {
      writeFileSync(sessionPath, JSON.stringify(session, null, 2), 'utf-8');
    } catch (e) {
      console.error(`Failed to save session ${session.session_id}:`, e);
    }
  }

  /**
   * Check if session has expired
   */
  private isSessionExpired(session: AuditSession): boolean {
    const now = Date.now();
    const lastActivity = session.updated_at.getTime();
    return (now - lastActivity) > SESSION_TTL_MS;
  }

  /**
   * Clean up expired sessions for a repo
   */
  private cleanupExpiredSessionsForRepo(repoPath: string): void {
    const sessionsDir = getRepoSessionsDir(repoPath);
    if (!existsSync(sessionsDir)) {return;}

    const expired: string[] = [];

    for (const [sessionId, session] of this.cache.entries()) {
      const sessionRepoPath = this.repoPaths.get(sessionId);
      if (sessionRepoPath === repoPath && this.isSessionExpired(session)) {
        expired.push(sessionId);
      }
    }

    for (const sessionId of expired) {
      this.cache.delete(sessionId);
      this.repoPaths.delete(sessionId);
      try {
        const sessionPath = join(sessionsDir, `${sessionId}.json`);
        if (existsSync(sessionPath)) {
          unlinkSync(sessionPath);
        }
      } catch (e) {
        console.error(`Failed to delete expired session ${sessionId}:`, e);
      }
    }

    if (expired.length > 0) {
      console.log(`Cleaned up ${expired.length} expired sessions from ${repoPath}`);
    }
  }

  /**
   * Create a new audit session
   */
  createSession(
    repoPath: string,
    domain: AuditDomain,
    depth: AuditDepth
  ): AuditSession {
    // Ensure sessions directory exists
    this.ensureSessionsDir(repoPath);

    // Load any existing sessions for this repo (to avoid ID collisions)
    this.loadSessionsFromRepo(repoPath);
    this.cleanupExpiredSessionsForRepo(repoPath);

    const sessionId = uuidv4();
    const now = new Date();

    const session: AuditSession = {
      session_id: sessionId,
      repo_path: repoPath,
      domain,
      depth,
      phase: 0,
      observations: null,
      main_questions: [],
      sub_questions: [],
      findings: [],
      escalations: [],
      checkpoints: [],
      report: null,
      heat_map: null,
      created_at: now,
      updated_at: now,
    };

    // Track repo path for this session
    this.repoPaths.set(sessionId, repoPath);
    this.cache.set(sessionId, session);
    saveToGlobalRegistry(sessionId, repoPath);
    this.saveSession(session);
    return session;
  }

  /**
   * Get a session by ID
   * Note: We don't know the repo path upfront, so we need to search
   */
  getSession(sessionId: string): AuditSession {
    // Check cache first
    let session = this.cache.get(sessionId);
    let repoPath = this.repoPaths.get(sessionId);

    // If not in memory, consult the global registry to find the repo path
    if (!session && !repoPath) {
      const registry = loadGlobalRegistry();
      repoPath = registry[sessionId];
      if (repoPath) {
        this.repoPaths.set(sessionId, repoPath);
      }
    }

    // If not in cache, try to load from known repo path
    if (!session && repoPath) {
      this.loadSessionsFromRepo(repoPath);
      session = this.cache.get(sessionId);
    }

    if (!session) {
      throw new SessionNotFoundError(sessionId, 'session_store');
    }

    // Check if session has expired
    if (this.isSessionExpired(session)) {
      this.cache.delete(sessionId);
      this.repoPaths.delete(sessionId);
      try {
        if (repoPath) {
          const sessionPath = this.getSessionPath(sessionId, repoPath);
          if (existsSync(sessionPath)) {
            unlinkSync(sessionPath);
          }
        }
      } catch (e) {
        // Ignore delete errors
      }
      throw new SessionExpiredError(sessionId, 'session_store');
    }

    return session;
  }

  /**
   * Check if a session exists and is not expired
   */
  hasSession(sessionId: string): boolean {
    try {
      this.getSession(sessionId);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete a session
   */
  deleteSession(sessionId: string): boolean {
    const repoPath = this.repoPaths.get(sessionId);
    const existed = this.cache.delete(sessionId);
    this.repoPaths.delete(sessionId);
    removeFromGlobalRegistry(sessionId);

    if (existed && repoPath) {
      try {
        const sessionPath = this.getSessionPath(sessionId, repoPath);
        if (existsSync(sessionPath)) {
          unlinkSync(sessionPath);
        }
      } catch (e) {
        console.error(`Failed to delete session file ${sessionId}:`, e);
      }
    }
    return existed;
  }

  /**
   * Get all sessions
   * Note: This only returns cached sessions. To get all sessions across all repos,
   * you'd need to discover them first.
   */
  getAllSessions(): AuditSession[] {
    // Filter out expired sessions
    const valid: AuditSession[] = [];
    const expired: string[] = [];

    for (const [sessionId, session] of this.cache.entries()) {
      if (this.isSessionExpired(session)) {
        expired.push(sessionId);
      } else {
        valid.push(session);
      }
    }

    // Clean up expired
    for (const sessionId of expired) {
      this.cache.delete(sessionId);
      const repoPath = this.repoPaths.get(sessionId);
      this.repoPaths.delete(sessionId);
      if (repoPath) {
        try {
          const sessionPath = this.getSessionPath(sessionId, repoPath);
          if (existsSync(sessionPath)) {
            unlinkSync(sessionPath);
          }
        } catch (e) {
          // Ignore
        }
      }
    }

    return valid;
  }

  /**
   * Discover sessions for a repo
   */
  discoverSessions(repoPath: string): AuditSession[] {
    this.loadSessionsFromRepo(repoPath);
    this.cleanupExpiredSessionsForRepo(repoPath);

    const sessions: AuditSession[] = [];
    for (const [sessionId, session] of this.cache.entries()) {
      const sessionRepoPath = this.repoPaths.get(sessionId);
      if (sessionRepoPath === repoPath && !this.isSessionExpired(session)) {
        sessions.push(session);
      }
    }
    return sessions;
  }

  /**
   * Advance session to next phase
   */
  advancePhase(sessionId: string, newPhase: AuditPhase): void {
    const session = this.getSession(sessionId);

    if (session.phase >= newPhase) {
      throw new Error(`Cannot advance to phase ${newPhase} from phase ${session.phase}`);
    }

    session.phase = newPhase;
    session.updated_at = new Date();
    this.saveSession(session);
  }

  /**
   * Set observations for a session
   */
  setObservations(sessionId: string, observations: ObservationLog): void {
    const session = this.getSession(sessionId);

    if (session.phase !== 1) {
      throw new Error(`Cannot set observations in phase ${session.phase}`);
    }

    session.observations = observations;
    session.phase = 2;
    session.updated_at = new Date();
    this.saveSession(session);
  }

  /**
   * Add a main question
   */
  addMainQuestion(
    sessionId: string,
    question: Omit<MainQuestion, 'id' | 'sub_question_ids'>
  ): MainQuestion {
    const session = this.getSession(sessionId);

    if (session.phase !== 2) {
      throw new Error(`Cannot add main questions in phase ${session.phase}`);
    }

    const fullQuestion: MainQuestion = {
      ...question,
      id: uuidv4(),
      sub_question_ids: [],
    };

    session.main_questions.push(fullQuestion);
    session.updated_at = new Date();
    this.saveSession(session);
    return fullQuestion;
  }

  /**
   * Get main question count
   */
  getMainQuestionCount(sessionId: string): number {
    return this.getSession(sessionId).main_questions.length;
  }

  /**
   * Get a main question by ID
   */
  getMainQuestion(sessionId: string, questionId: string): MainQuestion | undefined {
    const session = this.getSession(sessionId);
    return session.main_questions.find(q => q.id === questionId);
  }

  /**
   * Get remaining main questions (without sub-questions)
   */
  getRemainingMainQuestions(sessionId: string): MainQuestion[] {
    const session = this.getSession(sessionId);
    return session.main_questions.filter(q => q.sub_question_ids.length === 0);
  }

  /**
   * Add sub-questions for a main question
   */
  addSubQuestions(
    sessionId: string,
    mainQuestionId: string,
    subQuestions: Omit<SubQuestion, 'id' | 'main_question_id'>[]
  ): SubQuestion[] {
    const session = this.getSession(sessionId);

    if (session.phase !== 3) {
      throw new Error(`Cannot add sub-questions in phase ${session.phase}`);
    }

    const mainQuestion = session.main_questions.find(q => q.id === mainQuestionId);
    if (!mainQuestion) {
      throw new Error(`Main question ${mainQuestionId} not found`);
    }

    const createdSubQuestions: SubQuestion[] = subQuestions.map(sq => ({
      ...sq,
      id: uuidv4(),
      main_question_id: mainQuestionId,
    }));

    session.sub_questions.push(...createdSubQuestions);
    mainQuestion.sub_question_ids = createdSubQuestions.map(sq => sq.id);
    session.updated_at = new Date();
    this.saveSession(session);
    return createdSubQuestions;
  }

  /**
   * Get a sub-question by ID
   */
  getSubQuestion(sessionId: string, subQuestionId: string): SubQuestion | undefined {
    const session = this.getSession(sessionId);
    return session.sub_questions.find(sq => sq.id === subQuestionId);
  }

  /**
   * Add a finding
   */
  addFinding(sessionId: string, finding: Finding): Finding {
    const session = this.getSession(sessionId);

    if (session.phase !== 4 && session.phase !== 5) {
      throw new Error(`Cannot add findings in phase ${session.phase}`);
    }

    // Check for duplicate
    const existingIndex = session.findings.findIndex(
      f => f.sub_question_id === finding.sub_question_id
    );

    if (existingIndex >= 0) {
      // Replace existing finding
      session.findings[existingIndex] = finding;
    } else {
      session.findings.push(finding);
    }

    session.updated_at = new Date();
    this.saveSession(session);
    return finding;
  }

  /**
   * Check if finding exists for sub-question
   */
  hasFindingForSubQuestion(sessionId: string, subQuestionId: string): boolean {
    const session = this.getSession(sessionId);
    return session.findings.some(f => f.sub_question_id === subQuestionId);
  }

  /**
   * Get findings for a main question
   */
  getFindingsForMainQuestion(sessionId: string, mainQuestionId: string): Finding[] {
    const session = this.getSession(sessionId);
    const mainQuestion = session.main_questions.find(q => q.id === mainQuestionId);

    if (!mainQuestion) {
      return [];
    }

    return session.findings.filter(f =>
      mainQuestion.sub_question_ids.includes(f.sub_question_id)
    );
  }

  /**
   * Get all findings for a session
   */
  getAllFindings(sessionId: string): Finding[] {
    return this.getSession(sessionId).findings;
  }

  /**
   * Add a checkpoint
   */
  addCheckpoint(
    sessionId: string,
    mainQuestionId: string,
    crossCuttingSignals: CheckpointRecord['cross_cutting_signals']
  ): void {
    const session = this.getSession(sessionId);

    if (session.phase !== 4) {
      throw new Error(`Cannot add checkpoints in phase ${session.phase}`);
    }

    const checkpoint: CheckpointRecord = {
      main_question_id: mainQuestionId,
      completed_at: new Date(),
      cross_cutting_signals: crossCuttingSignals,
    };

    session.checkpoints.push(checkpoint);
    session.updated_at = new Date();
    this.saveSession(session);
  }

  /**
   * Check if main question is checkpointed
   */
  isCheckpointed(sessionId: string, mainQuestionId: string): boolean {
    const session = this.getSession(sessionId);
    return session.checkpoints.some(cp => cp.main_question_id === mainQuestionId);
  }

  /**
   * Set final report
   */
  setReport(sessionId: string, report: Report): void {
    const session = this.getSession(sessionId);

    if (session.phase !== 5) {
      throw new Error(`Cannot finalize report in phase ${session.phase}`);
    }

    session.report = report;
    session.updated_at = new Date();
    this.saveSession(session);
  }

  /**
   * Get session statistics
   */
  getSessionStats(sessionId: string): {
    mainQuestions: number;
    subQuestions: number;
    findings: number;
    checkpoints: number;
    escalations: number;
  } {
    const session = this.getSession(sessionId);

    return {
      mainQuestions: session.main_questions.length,
      subQuestions: session.sub_questions.length,
      findings: session.findings.length,
      checkpoints: session.checkpoints.length,
      escalations: session.escalations.length,
    };
  }
}

// ============================================================================
// Backward Compatibility
// ============================================================================

// Export as SessionStore for tests and backward compatibility
export { PersistentSessionStore as SessionStore };

// ============================================================================
// Singleton Instance
// ============================================================================

export const sessionStore = new PersistentSessionStore();
