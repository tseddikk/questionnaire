/**
 * Session Store
 * 
 * In-memory storage for audit sessions.
 * Sessions are lost if the server restarts (by design per v1 spec).
 */

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
import { SessionNotFoundError } from './errors.js';

// ============================================================================
// Session Store Implementation
// ============================================================================

export class SessionStore {
  private sessions: Map<string, AuditSession> = new Map();

  /**
   * Create a new audit session
   */
  createSession(
    repoPath: string,
    domain: AuditDomain,
    depth: AuditDepth
  ): AuditSession {
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

    this.sessions.set(sessionId, session);
    return session;
  }

  /**
   * Get a session by ID
   */
  getSession(sessionId: string): AuditSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }
    return session;
  }

  /**
   * Check if a session exists
   */
  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  /**
   * Delete a session
   */
  deleteSession(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  /**
   * Get all sessions (useful for debugging)
   */
  getAllSessions(): AuditSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get session count
   */
  getSessionCount(): number {
    return this.sessions.size;
  }

  // ============================================================================
  // Phase Management
  // ============================================================================

  /**
   * Advance to the next phase
   */
  advancePhase(sessionId: string, newPhase: AuditPhase): AuditSession {
    const session = this.getSession(sessionId);
    
    if (newPhase <= session.phase) {
      throw new Error(`Cannot advance to phase ${newPhase} from phase ${session.phase}`);
    }

    session.phase = newPhase;
    session.updated_at = new Date();
    
    return session;
  }

  /**
   * Set observations (Phase 1 -> 2 transition)
   */
  setObservations(
    sessionId: string,
    observations: ObservationLog
  ): AuditSession {
    const session = this.getSession(sessionId);
    
    if (session.phase !== 1) {
      throw new Error(`Cannot set observations in phase ${session.phase}`);
    }

    session.observations = observations;
    session.phase = 2;
    session.updated_at = new Date();
    
    return session;
  }

  // ============================================================================
  // Question Management
  // ============================================================================

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

    const mainQuestion: MainQuestion = {
      ...question,
      id: uuidv4(),
      sub_question_ids: [],
    };

    session.main_questions.push(mainQuestion);
    session.updated_at = new Date();
    
    return mainQuestion;
  }

  /**
   * Get main question count
   */
  getMainQuestionCount(sessionId: string): number {
    const session = this.getSession(sessionId);
    return session.main_questions.length;
  }

  /**
   * Get a specific main question
   */
  getMainQuestion(
    sessionId: string,
    mainQuestionId: string
  ): MainQuestion | undefined {
    const session = this.getSession(sessionId);
    return session.main_questions.find(q => q.id === mainQuestionId);
  }

  // ============================================================================
  // Sub-Question Management
  // ============================================================================

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
    
    return createdSubQuestions;
  }

  /**
   * Get sub-questions for a main question
   */
  getSubQuestionsForMainQuestion(
    sessionId: string,
    mainQuestionId: string
  ): SubQuestion[] {
    const session = this.getSession(sessionId);
    return session.sub_questions.filter(sq => sq.main_question_id === mainQuestionId);
  }

  /**
   * Get sub-question by ID
   */
  getSubQuestion(
    sessionId: string,
    subQuestionId: string
  ): SubQuestion | undefined {
    const session = this.getSession(sessionId);
    return session.sub_questions.find(sq => sq.id === subQuestionId);
  }

  // ============================================================================
  // Finding Management
  // ============================================================================

  /**
   * Add a finding
   */
  addFinding(
    sessionId: string,
    subQuestionId: string,
    finding: Omit<Finding, 'id' | 'sub_question_id'>
  ): Finding {
    const session = this.getSession(sessionId);
    
    if (session.phase !== 4) {
      throw new Error(`Cannot add findings in phase ${session.phase}`);
    }

    const newFinding: Finding = {
      ...finding,
      id: uuidv4(),
      sub_question_id: subQuestionId,
    };

    session.findings.push(newFinding);
    session.updated_at = new Date();
    
    return newFinding;
  }

  /**
   * Get findings for a main question
   */
  getFindingsForMainQuestion(
    sessionId: string,
    mainQuestionId: string
  ): Finding[] {
    const session = this.getSession(sessionId);
    const subQuestionIds = session.sub_questions
      .filter(sq => sq.main_question_id === mainQuestionId)
      .map(sq => sq.id);
    
    return session.findings.filter(f => subQuestionIds.includes(f.sub_question_id));
  }

  /**
   * Check if a sub-question has a finding
   */
  hasFindingForSubQuestion(
    sessionId: string,
    subQuestionId: string
  ): boolean {
    const session = this.getSession(sessionId);
    return session.findings.some(f => f.sub_question_id === subQuestionId);
  }

  // ============================================================================
  // Checkpoint Management
  // ============================================================================

  /**
   * Add a checkpoint
   */
  addCheckpoint(
    sessionId: string,
    mainQuestionId: string,
    crossCuttingSignals: CheckpointRecord['cross_cutting_signals']
  ): CheckpointRecord {
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
    
    // If all main questions are checkpointed, advance to phase 5
    if (session.checkpoints.length === session.main_questions.length) {
      session.phase = 5;
    }
    
    session.updated_at = new Date();
    
    return checkpoint;
  }

  /**
   * Check if a main question has been checkpointed
   */
  isCheckpointed(sessionId: string, mainQuestionId: string): boolean {
    const session = this.getSession(sessionId);
    return session.checkpoints.some(cp => cp.main_question_id === mainQuestionId);
  }

  /**
   * Get remaining questions to checkpoint
   */
  getRemainingMainQuestions(sessionId: string): string[] {
    const session = this.getSession(sessionId);
    const checkpointedIds = new Set(session.checkpoints.map(cp => cp.main_question_id));
    
    return session.main_questions
      .filter(q => !checkpointedIds.has(q.id))
      .map(q => q.id);
  }

  // ============================================================================
  // Report Management
  // ============================================================================

  /**
   * Set the final report
   */
  setReport(sessionId: string, report: Report): AuditSession {
    const session = this.getSession(sessionId);
    
    if (session.phase !== 5) {
      throw new Error(`Cannot finalize report in phase ${session.phase}`);
    }

    session.report = report;
    session.updated_at = new Date();
    
    return session;
  }

  /**
   * Get session summary for reporting
   */
  getSessionSummary(sessionId: string): {
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
// Singleton Instance
// ============================================================================

export const sessionStore = new SessionStore();
