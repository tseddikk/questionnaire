/**
 * Collaborative Session Store
 *
 * Manages multi-agent sessions with agent identity tracking.
 * Enforces one active session rule.
 * Extension to base session store - now with persistence in user's project directory.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { v4 as uuidv4 } from 'uuid';
import type {
  CollaborativeSession,
  AgentId,
  AgentFinding,
  FindingReaction,
  AdjudicationRecord,
  AuditDomain,
  AuditDepth,
} from '../types/domain.js';
import { SessionNotFoundError, SessionExpiredError } from './errors.js';

// ============================================================================
// Configuration
// ============================================================================

// Session TTL: 24 hours (in milliseconds)
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

// Subdirectory within repo for storing collaborative sessions
const QUESTIONNAIRE_DIR = '.questionnaire';
const COLLAB_SESSIONS_SUBDIR = 'collaborative-sessions';

// Global registry: maps sessionId -> repoPath so sessions survive server restarts
let REGISTRY_PATH = join(homedir(), '.questionnaire', 'collab-session-registry.json');

/**
 * Set a custom registry path (used for tests)
 */
export function setRegistryPath(path: string): void {
  REGISTRY_PATH = path;
}

function getGlobalRegistryPath(): string {
  return REGISTRY_PATH;
}

function loadGlobalRegistry(): Record<string, string> {
  const registryPath = getGlobalRegistryPath();
  if (!existsSync(registryPath)) return {};
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
    console.error(`Failed to update global collab session registry:`, e);
  }
}

function removeFromGlobalRegistry(sessionId: string): void {
  const registryPath = getGlobalRegistryPath();
  if (!existsSync(registryPath)) return;
  const registry = loadGlobalRegistry();
  delete registry[sessionId];
  try {
    writeFileSync(registryPath, JSON.stringify(registry, null, 2), 'utf-8');
  } catch (e) {
    console.error(`Failed to update global collab session registry:`, e);
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get the collaborative sessions directory for a repo
 */
function getRepoCollabSessionsDir(repoPath: string): string {
  return join(repoPath, QUESTIONNAIRE_DIR, COLLAB_SESSIONS_SUBDIR);
}

// ============================================================================
// Store Implementation
// ============================================================================

export class CollaborativeSessionStore {
  private repoPaths: Map<string, string> = new Map(); // sessionId -> repoPath mapping
  private sessions: Map<string, CollaborativeSession> = new Map();
  private activeSessionId: string | null = null;

  /**
   * Get session file path within a repo
   */
  private getSessionPath(sessionId: string, repoPath: string): string {
    const sessionsDir = getRepoCollabSessionsDir(repoPath);
    return join(sessionsDir, `${sessionId}.json`);
  }

  /**
   * Ensure the sessions directory exists for a repo
   */
  private ensureSessionsDir(repoPath: string): void {
    const sessionsDir = getRepoCollabSessionsDir(repoPath);
    if (!existsSync(sessionsDir)) {
      mkdirSync(sessionsDir, { recursive: true });
    }
  }

  /**
   * Load collaborative sessions from a specific repo
   * @param repoPath Path to the repository
   * @param force Whether to overwrite in-memory cache with disk data
   */
  private loadSessionsFromRepo(repoPath: string, force: boolean = false): void {
    const sessionsDir = getRepoCollabSessionsDir(repoPath);
    if (!existsSync(sessionsDir)) {
      return; // No sessions yet for this repo
    }

    try {
      const files = readdirSync(sessionsDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const sessionId = file.replace('.json', '');
          const sessionPath = join(sessionsDir, file);
          
          // Skip if already in memory and not forcing reload
          if (!force && this.sessions.has(sessionId)) {
            continue;
          }

          try {
            const data = readFileSync(sessionPath, 'utf-8');
            const session = JSON.parse(data) as CollaborativeSession;
            
            // Revive Date objects from JSON
            session.created_at = new Date(session.created_at);
            session.updated_at = new Date(session.updated_at);
            
            // Fix: Map serialization issues. JSON.parse makes it a regular object.
            // If it's an object but should be a Map, we need to convert it.
            if (session.investigation_coverage && !(session.investigation_coverage instanceof Map)) {
               session.investigation_coverage = new Map(Object.entries(session.investigation_coverage));
            } else if (!session.investigation_coverage) {
               session.investigation_coverage = new Map();
            }

            // Track the repo path for this session
            this.repoPaths.set(sessionId, repoPath);
            this.sessions.set(sessionId, session);
          } catch (e) {
            // Invalid session file, skip
            console.error(`Failed to load collaborative session ${sessionId} from ${repoPath}:`, e);
          }
        }
      }
    } catch (e) {
      console.error(`Failed to load collaborative sessions from ${repoPath}:`, e);
    }
  }

  /**
   * Save session to disk and update cache
   */
  private saveSession(session: CollaborativeSession): void {
    const repoPath = this.repoPaths.get(session.session_id);
    if (!repoPath) {
      console.error(`No repo path known for collaborative session ${session.session_id}`);
      return;
    }

    // Update memory cache
    this.sessions.set(session.session_id, session);

    const sessionPath = this.getSessionPath(session.session_id, repoPath);
    try {
      writeFileSync(sessionPath, JSON.stringify(session, null, 2), 'utf-8');
    } catch (e) {
      console.error(`Failed to save collaborative session ${session.session_id}:`, e);
    }
  }

  /**
   * Check if session has expired
   */
  private isSessionExpired(session: CollaborativeSession): boolean {
    const now = Date.now();
    const lastActivity = session.updated_at.getTime();
    return (now - lastActivity) > SESSION_TTL_MS;
  }

  /**
   * Clean up expired sessions for a repo
   */
  private cleanupExpiredSessionsForRepo(repoPath: string): void {
    const sessionsDir = getRepoCollabSessionsDir(repoPath);
    if (!existsSync(sessionsDir)) return;

    const expired: string[] = [];

    for (const [sessionId, session] of this.sessions.entries()) {
      const sessionRepoPath = this.repoPaths.get(sessionId);
      if (sessionRepoPath === repoPath && this.isSessionExpired(session)) {
        expired.push(sessionId);
      }
    }

    for (const sessionId of expired) {
      this.sessions.delete(sessionId);
      this.repoPaths.delete(sessionId);
      removeFromGlobalRegistry(sessionId);
      if (this.activeSessionId === sessionId) {
        this.activeSessionId = null;
      }
      try {
        const sessionPath = join(sessionsDir, `${sessionId}.json`);
        if (existsSync(sessionPath)) {
          unlinkSync(sessionPath);
        }
      } catch (e) {
        console.error(`Failed to delete expired collaborative session ${sessionId}:`, e);
      }
    }

    if (expired.length > 0) {
      console.log(`Cleaned up ${expired.length} expired collaborative sessions from ${repoPath}`);
    }
  }

  /**
   * Create a new collaborative session
   * Enforces one active session rule
   */
  createSession(
    repoPath: string,
    domain: AuditDomain,
    depth: AuditDepth,
    creatorAgentId: AgentId,
    synthesizer: AgentId | null = null
  ): CollaborativeSession {
    // Ensure sessions directory exists
    this.ensureSessionsDir(repoPath);

    // Load any existing sessions for this repo (to avoid ID collisions)
    this.loadSessionsFromRepo(repoPath);
    this.cleanupExpiredSessionsForRepo(repoPath);

    // Check one active session rule
    if (this.activeSessionId) {
      const active = this.sessions.get(this.activeSessionId);
      if (active && active.session_state !== 'archived' && active.session_state !== 'archived_incomplete') {
        // Check if it's expired
        if (!this.isSessionExpired(active)) {
          throw new Error(`SESSION_ALREADY_ACTIVE: Session ${this.activeSessionId} is active`);
        }
      }
    }

    const sessionId = uuidv4();
    const now = new Date();

    const session: CollaborativeSession = {
      session_id: sessionId,
      repo_path: repoPath,
      domain,
      depth,
      session_state: 'initialized',
      phase: 0,
      created_at: now,
      updated_at: now,
      agents: [{
        agent_id: creatorAgentId,
        role: synthesizer === creatorAgentId ? 'synthesizer' : 'investigator',
        joined_at: now,
      }],
      synthesizer,
      // Data accumulation
      observation_sets: [],
      heat_map: null,
      // Phase 2: Question generation
      question_pool: [],
      question_reactions: [],
      merged_questions: [],
      // Phase 3: Sub-questions
      sub_question_pool: [],
      outlier_sub_questions: [],
      // Phase 4: Investigation
      findings: [],
      finding_reactions: [],
      investigation_coverage: new Map(),
      agent_checkpoints: [],
      // Phase 5: Synthesis
      contested_findings: [],
      adjudications: [],
      unresolved_findings: [],
      // Report
      report: null,
    };

    // Track repo path for this session
    this.repoPaths.set(sessionId, repoPath);
    this.sessions.set(sessionId, session);
    this.activeSessionId = sessionId;
    saveToGlobalRegistry(sessionId, repoPath);
    this.saveSession(session);
    return session;
  }

  /**
   * Clear in-memory state only (used for tests)
   */
  clearMemoryOnly(): void {
    this.sessions.clear();
    this.repoPaths.clear();
    this.activeSessionId = null;
  }

  /**
   * Get a session by ID
   * @param sessionId Session ID
   * @param forceReload Whether to force a reload from disk
   */
  getSession(sessionId: string, forceReload: boolean = false): CollaborativeSession {
    // Consult the global registry to find the repo path if not in memory
    let repoPath = this.repoPaths.get(sessionId);
    if (!repoPath) {
      const registry = loadGlobalRegistry();
      repoPath = registry[sessionId];
      if (repoPath) {
        this.repoPaths.set(sessionId, repoPath);
      }
    }

    // If forceReload or not in cache, try to load from known repo path
    if (forceReload || !this.sessions.has(sessionId)) {
      if (repoPath) {
        this.loadSessionsFromRepo(repoPath, forceReload);
      }
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new SessionNotFoundError(sessionId, 'collaborative_store');
    }

    // Check if session has expired
    if (this.isSessionExpired(session)) {
      this.sessions.delete(sessionId);
      this.repoPaths.delete(sessionId);
      if (this.activeSessionId === sessionId) {
        this.activeSessionId = null;
      }
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
      throw new SessionExpiredError(sessionId, 'collaborative_store');
    }

    return session;
  }

  /**
   * Check if a session exists
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
   * Get active session ID
   */
  getActiveSessionId(): string | null {
    // Active session tracking is in-memory only for current repo

    // Check if active session is expired
    if (this.activeSessionId) {
      try {
        const active = this.getSession(this.activeSessionId);
        if (this.isSessionExpired(active)) {
          this.activeSessionId = null;
        }
      } catch {
        this.activeSessionId = null;
      }
    }
    return this.activeSessionId;
  }

  /**
   * Discover active sessions for a repo
   */
  discoverSessions(repoPath: string): CollaborativeSession[] {
    this.loadSessionsFromRepo(repoPath);
    this.cleanupExpiredSessionsForRepo(repoPath);

    const valid: CollaborativeSession[] = [];
    for (const [sessionId, session] of this.sessions.entries()) {
      const sessionRepoPath = this.repoPaths.get(sessionId);
      if (sessionRepoPath === repoPath && !this.isSessionExpired(session)) {
        valid.push(session);
      }
    }
    return valid;
  }

  /**
   * Join an existing session
   */
  joinSession(
    sessionId: string,
    agentId: AgentId,
    repoPath: string
  ): CollaborativeSession {
    const session = this.getSession(sessionId);

    // Verify repo matches
    if (session.repo_path !== repoPath) {
      throw new Error(`REPO_MISMATCH: Session ${sessionId} is for ${session.repo_path}, not ${repoPath}`);
    }

    // Check session state allows joining
    if (session.session_state === 'finalized' || 
        session.session_state === 'archived' ||
        session.session_state === 'archived_incomplete') {
      throw new Error(`Cannot join session in state: ${session.session_state}`);
    }

    // Check if agent is already in session
    const existingAgent = session.agents.find(a => a.agent_id === agentId);
    if (!existingAgent) {
      session.agents.push({
        agent_id: agentId,
        role: session.synthesizer === agentId ? 'synthesizer' : 'investigator',
        joined_at: new Date(),
      });
      session.updated_at = new Date();
      this.saveSession(session);
    }

    return session;
  }

  /**
   * Designate synthesizer for a session
   */
  designateSynthesizer(sessionId: string, agentId: AgentId): void {
    const session = this.getSession(sessionId);
    session.synthesizer = agentId;
    
    // Update role of the designated agent
    const agent = session.agents.find(a => a.agent_id === agentId);
    if (agent) {
      agent.role = 'synthesizer';
    }
    
    session.updated_at = new Date();
    this.saveSession(session);
  }

  /**
   * Merge findings from an agent into the collaborative session
   */
  mergeFinding(
    sessionId: string,
    agentFinding: AgentFinding
  ): void {
    const session = this.getSession(sessionId);
    session.findings.push(agentFinding);
    session.updated_at = new Date();
    this.saveSession(session);
  }

  /**
   * Add a reaction to a finding
   */
  addReaction(
    sessionId: string,
    reaction: FindingReaction
  ): void {
    const session = this.getSession(sessionId);
    session.finding_reactions.push(reaction);
    session.updated_at = new Date();
    this.saveSession(session);
  }

  /**
   * Alias for addReaction (used by react-to-finding tool)
   */
  addFindingReaction(
    sessionId: string,
    reaction: FindingReaction
  ): void {
    return this.addReaction(sessionId, reaction);
  }

  /**
   * Add adjudication for contested findings
   */
  addAdjudication(
    sessionId: string,
    adjudication: AdjudicationRecord
  ): void {
    const session = this.getSession(sessionId);
    session.adjudications.push(adjudication);
    session.updated_at = new Date();
    this.saveSession(session);
  }

  /**
   * Get session summary
   */
  getSessionSummary(sessionId: string): {
    session_id: string;
    repo_path: string;
    domain: string;
    depth: string;
    phase: number;
    session_state: string;
    agent_count: number;
    investigators: string[];
    synthesizer: string | null;
    questions_merged: number;
    findings_submitted: number;
    reactions_count: number;
    adjudications_count: number;
  } {
    const session = this.getSession(sessionId);

    return {
      session_id: session.session_id,
      repo_path: session.repo_path,
      domain: session.domain,
      depth: session.depth,
      phase: session.phase,
      session_state: session.session_state,
      agent_count: session.agents.length,
      investigators: session.agents
        .filter(a => a.role === 'investigator')
        .map(a => a.agent_id),
      synthesizer: session.synthesizer,
      questions_merged: session.merged_questions.length,
      findings_submitted: session.findings.length,
      reactions_count: session.finding_reactions.length,
      adjudications_count: session.adjudications.length,
    };
  }

  /**
   * Get investigator statistics
   */
  getInvestigatorStats(sessionId: string): Array<{
    agent_id: string;
    findings_submitted: number;
    confirmations_given: number;
    challenges_given: number;
    confirmation_rate: number;
  }> {
    const session = this.getSession(sessionId);
    const stats = new Map<string, { findings: number; confirmations: number; challenges: number }>();

    // Initialize stats for all investigators
    for (const agent of session.agents.filter(a => a.role === 'investigator')) {
      stats.set(agent.agent_id, { findings: 0, confirmations: 0, challenges: 0 });
    }

    // Count findings
    for (const finding of session.findings) {
      const s = stats.get(finding.agent_id);
      if (s) s.findings++;
    }

    // Count reactions
    for (const reaction of session.finding_reactions) {
      const s = stats.get(reaction.agent_id);
      if (s) {
        if (reaction.reaction_type === 'confirm') s.confirmations++;
        if (reaction.reaction_type === 'challenge') s.challenges++;
      }
    }

    return Array.from(stats.entries()).map(([agent_id, s]) => ({
      agent_id,
      findings_submitted: s.findings,
      confirmations_given: s.confirmations,
      challenges_given: s.challenges,
      confirmation_rate: s.findings > 0 ? s.confirmations / s.findings : 0,
    }));
  }

  /**
   * Get all sessions
   */
  getAllSessions(): CollaborativeSession[] {
    // Filter out expired sessions
    const valid: CollaborativeSession[] = [];
    const expired: string[] = [];

    for (const [sessionId, session] of this.sessions.entries()) {
      if (this.isSessionExpired(session)) {
        expired.push(sessionId);
      } else {
        valid.push(session);
      }
    }

    // Clean up expired
    for (const sessionId of expired) {
      this.sessions.delete(sessionId);
      const repoPath = this.repoPaths.get(sessionId);
      this.repoPaths.delete(sessionId);
      removeFromGlobalRegistry(sessionId);
      if (this.activeSessionId === sessionId) {
        this.activeSessionId = null;
      }
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
   * Delete a session
   */
  deleteSession(sessionId: string): boolean {
    const repoPath = this.repoPaths.get(sessionId);
    const existed = this.sessions.delete(sessionId);
    this.repoPaths.delete(sessionId);
    removeFromGlobalRegistry(sessionId);

    if (this.activeSessionId === sessionId) {
      this.activeSessionId = null;
    }

    if (existed && repoPath) {
      try {
        const sessionPath = this.getSessionPath(sessionId, repoPath);
        if (existsSync(sessionPath)) {
          unlinkSync(sessionPath);
        }
      } catch (e) {
        console.error(`Failed to delete collaborative session file ${sessionId}:`, e);
      }
    }
    return existed;
  }

  /**
   * Archive a session
   */
  archiveSession(sessionId: string, _reason: string): CollaborativeSession {
    const session = this.getSession(sessionId);
    session.session_state = 'archived_incomplete';
    session.updated_at = new Date();
    
    // Clear active session if this was it
    if (this.activeSessionId === sessionId) {
      this.activeSessionId = null;
    }
    
    this.saveSession(session);
    return session;
  }

  /**
   * Advance session to next phase
   */
  advancePhase(sessionId: string, newPhase: number): void {
    const session = this.getSession(sessionId);

    if (session.phase >= newPhase) {
      throw new Error(`Cannot advance to phase ${newPhase} from phase ${session.phase}`);
    }

    session.phase = newPhase as any;
    session.updated_at = new Date();
    this.saveSession(session);
  }

  /**
   * Set observations for a session (Standard/Single-agent mode)
   */
  setObservations(sessionId: string, agentId: string, observations: any): void {
    const session = this.getSession(sessionId, true);

    if (session.phase !== 1) {
      throw new Error(`Cannot set observations in phase ${session.phase}`);
    }

    session.observation_sets.push({
      agent_id: agentId,
      observations,
      submitted_at: new Date(),
    });

    session.phase = 2;
    session.updated_at = new Date();
    this.saveSession(session);
  }

  /**
   * Add a main question (Standard/Single-agent mode)
   */
  addMainQuestion(
    sessionId: string,
    agentId: string,
    question: any
  ): any {
    const session = this.getSession(sessionId, true);

    if (session.phase !== 2) {
      throw new Error(`Cannot add main questions in phase ${session.phase}`);
    }

    const fullQuestion = {
      ...question,
      id: uuidv4(),
      sub_question_ids: [],
    };

    session.merged_questions.push(fullQuestion);
    session.question_pool.push({
      question: fullQuestion,
      agent_id: agentId,
    });

    session.updated_at = new Date();
    this.saveSession(session);
    return fullQuestion;
  }

  /**
   * Get main question count
   */
  getMainQuestionCount(sessionId: string): number {
    return this.getSession(sessionId, true).merged_questions.length;
  }

  /**
   * Get a main question by ID
   */
  getMainQuestion(sessionId: string, questionId: string): any | undefined {
    const session = this.getSession(sessionId, true);
    return session.merged_questions.find(q => q.id === questionId);
  }

  /**
   * Get remaining main questions (without sub-questions)
   */
  getRemainingMainQuestions(sessionId: string): any[] {
    const session = this.getSession(sessionId, true);
    return session.merged_questions.filter(q => q.sub_question_ids.length === 0);
  }

  /**
   * Add sub-questions for a main question
   */
  addSubQuestions(
    sessionId: string,
    mainQuestionId: string,
    subQuestions: any[]
  ): any[] {
    const session = this.getSession(sessionId, true);

    if (session.phase !== 3) {
      throw new Error(`Cannot add sub-questions in phase ${session.phase}`);
    }

    const mainQuestion = session.merged_questions.find(q => q.id === mainQuestionId);
    if (!mainQuestion) {
      throw new Error(`Main question ${mainQuestionId} not found`);
    }

    const createdSubQuestions = subQuestions.map(sq => ({
      ...sq,
      id: uuidv4(),
      main_question_id: mainQuestionId,
    }));

    session.sub_question_pool.push(...createdSubQuestions);
    mainQuestion.sub_question_ids = createdSubQuestions.map(sq => sq.id);
    session.updated_at = new Date();
    this.saveSession(session);
    return createdSubQuestions;
  }

  /**
   * Get a sub-question by ID
   */
  getSubQuestion(sessionId: string, subQuestionId: string): any | undefined {
    const session = this.getSession(sessionId, true);
    return session.sub_question_pool.find(sq => sq.id === subQuestionId);
  }

  /**
   * Add a finding (Standard/Single-agent mode)
   */
  addFinding(sessionId: string, agentId: string, finding: any): any {
    const session = this.getSession(sessionId, true);

    if (session.phase !== 4 && session.phase !== 5) {
      throw new Error(`Cannot add findings in phase ${session.phase}`);
    }

    const agentFinding = {
      ...finding,
      agent_id: agentId,
      finding_id: uuidv4(),
    };

    session.findings.push(agentFinding);
    session.updated_at = new Date();
    this.saveSession(session);
    return agentFinding;
  }

  /**
   * Check if finding exists for sub-question
   */
  hasFindingForSubQuestion(sessionId: string, subQuestionId: string): boolean {
    const session = this.getSession(sessionId, true);
    return session.findings.some(f => f.sub_question_id === subQuestionId);
  }

  /**
   * Get findings for a main question
   */
  getFindingsForMainQuestion(sessionId: string, mainQuestionId: string): any[] {
    const session = this.getSession(sessionId, true);
    const mainQuestion = session.merged_questions.find(q => q.id === mainQuestionId);

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
  getAllFindings(sessionId: string): any[] {
    return this.getSession(sessionId).findings;
  }

  /**
   * Add a checkpoint
   */
  addCheckpoint(
    sessionId: string,
    agentId: string,
    mainQuestionId: string,
    _crossCuttingSignals: any[] = []
  ): void {
    const session = this.getSession(sessionId);

    if (session.phase !== 4) {
      throw new Error(`Cannot add checkpoints in phase ${session.phase}`);
    }

    session.agent_checkpoints.push({
      agent_id: agentId,
      main_question_id: mainQuestionId,
      completed_at: new Date(),
    });

    // In a real collaborative scenario, we might want to store signals per agent/question
    // For now, we'll just track that the agent checkpointed it.
    // If we want to support the same signals as the standard store:
    // we might need to add a field to AgentCheckpoint or the session.

    session.updated_at = new Date();
    this.saveSession(session);
  }

  /**
   * Check if main question is checkpointed
   */
  isCheckpointed(sessionId: string, mainQuestionId: string): boolean {
    const session = this.getSession(sessionId);
    return session.agent_checkpoints.some(cp => cp.main_question_id === mainQuestionId);
  }

  /**
   * Set final report
   */
  setReport(sessionId: string, report: any): void {
    const session = this.getSession(sessionId, true);
    session.report = report;
    session.session_state = 'finalized';
    session.updated_at = new Date();
    this.saveSession(session);
  }

  /**
   * Get session statistics
   */
  getSessionStats(sessionId: string): any {
    const session = this.getSession(sessionId);

    return {
      mainQuestions: session.merged_questions.length,
      subQuestions: session.sub_question_pool.length,
      findings: session.findings.length,
      checkpoints: session.agent_checkpoints.length,
      agents: session.agents.length,
    };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const collaborativeStore = new CollaborativeSessionStore();
