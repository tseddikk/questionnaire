/**
 * Collaborative Session Store
 *
 * Manages multi-agent sessions with agent identity tracking.
 * Enforces one active session rule.
 * Extension to base session store.
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  CollaborativeSession,
  Agent,
  AgentId,
  AgentFinding,
  FindingReaction,
  QuestionReaction,
  AgentCheckpoint,
  AdjudicationRecord,
  AuditDomain,
  AuditDepth,
  HeatMap,
  InvestigationCoverage,
} from '../types/domain.js';
import { SessionNotFoundError } from './errors.js';

// ============================================================================
// Store Implementation
// ============================================================================

export class CollaborativeSessionStore {
  private sessions: Map<string, CollaborativeSession> = new Map();
  private activeSessionId: string | null = null;

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
    // Check one active session rule
    if (this.activeSessionId) {
      const active = this.sessions.get(this.activeSessionId);
      if (active && active.session_state !== 'archived' && active.session_state !== 'archived_incomplete') {
        throw new Error(`SESSION_ALREADY_ACTIVE: Session ${this.activeSessionId} is active`);
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

      // Agent management
      agents: [{
        agent_id: creatorAgentId,
        joined_at: now,
        role: synthesizer === creatorAgentId ? 'synthesizer' : 'investigator',
      }],
      synthesizer,

      // Data
      observation_sets: [],
      heat_map: null,

      // Phase 2
      question_pool: [],
      question_reactions: [],
      merged_questions: [],

      // Phase 3
      sub_question_pool: [],
      outlier_sub_questions: [],

      // Phase 4
      findings: [],
      finding_reactions: [],
      investigation_coverage: new Map(),
      agent_checkpoints: [],

      // Phase 5
      contested_findings: [],
      adjudications: [],
      unresolved_findings: [],

      // Report
      report: null,
    };

    this.sessions.set(sessionId, session);
    this.activeSessionId = sessionId;

    return session;
  }

  /**
   * Get a session by ID
   */
  getSession(sessionId: string): CollaborativeSession {
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
   * Get active session ID
   */
  getActiveSessionId(): string | null {
    return this.activeSessionId;
  }

  /**
   * Discover active sessions for a repo
   */
  discoverSessions(repoPath: string): CollaborativeSession[] {
    return Array.from(this.sessions.values()).filter(
      s => s.repo_path === repoPath && 
           s.session_state !== 'archived' && 
           s.session_state !== 'archived_incomplete'
    );
  }

  /**
   * Add agent to session
   */
  joinSession(sessionId: string, agentId: AgentId): CollaborativeSession {
    const session = this.getSession(sessionId);

    // Check if agent already joined
    if (session.agents.some(a => a.agent_id === agentId)) {
      return session;
    }

    // Check session state
    if (['pending_synthesis', 'adjudicating', 'finalized', 'archived'].includes(session.session_state)) {
      throw new Error(`Cannot join session in state: ${session.session_state}`);
    }

    // Check repo path match
    // (This would need the agent's current working directory)

    session.agents.push({
      agent_id: agentId,
      joined_at: new Date(),
      role: 'investigator',
    });

    session.updated_at = new Date();
    return session;
  }

  /**
   * Designate synthesizer
   */
  designateSynthesizer(sessionId: string, agentId: AgentId): CollaborativeSession {
    const session = this.getSession(sessionId);

    // Verify agent is in session
    const agent = session.agents.find(a => a.agent_id === agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} is not in session`);
    }

    // Update role
    agent.role = 'synthesizer';
    session.synthesizer = agentId;

    // Update other agents to investigator
    for (const a of session.agents) {
      if (a.agent_id !== agentId) {
        a.role = 'investigator';
      }
    }

    session.updated_at = new Date();
    return session;
  }

  /**
   * Add finding with agent attribution
   */
  addFinding(sessionId: string, finding: AgentFinding): CollaborativeSession {
    const session = this.getSession(sessionId);
    session.findings.push(finding);

    // Update investigation coverage
    const coverage = session.investigation_coverage.get(finding.sub_question_id) || {
      sub_question_id: finding.sub_question_id,
      status: 'single_agent',
      agents_investigated: [],
      finding_ids: [],
      reactions: [],
    };

    if (!coverage.agents_investigated.includes(finding.agent_id)) {
      coverage.agents_investigated.push(finding.agent_id);
    }
    coverage.finding_ids.push(finding.finding_id);
    coverage.status = coverage.agents_investigated.length >= 2 ? 'confirmed' : 'single_agent';

    session.investigation_coverage.set(finding.sub_question_id, coverage);
    session.updated_at = new Date();

    return session;
  }

  /**
   * Add finding reaction
   */
  addFindingReaction(sessionId: string, reaction: FindingReaction): CollaborativeSession {
    const session = this.getSession(sessionId);
    session.finding_reactions.push(reaction);

    // Update coverage status
    const finding = session.findings.find(f => f.finding_id === reaction.finding_id);
    if (finding) {
      const coverage = session.investigation_coverage.get(finding.sub_question_id);
      if (coverage) {
        coverage.reactions.push(reaction.id);

        if (reaction.reaction_type === 'challenge') {
          coverage.status = 'contested';
          if (!session.contested_findings.includes(reaction.finding_id)) {
            session.contested_findings.push(reaction.finding_id);
          }
        }
      }
    }

    session.updated_at = new Date();
    return session;
  }

  /**
   * Add adjudication
   */
  addAdjudication(sessionId: string, adjudication: AdjudicationRecord): CollaborativeSession {
    const session = this.getSession(sessionId);
    session.adjudications.push(adjudication);

    // Remove from contested if resolved
    const idx = session.contested_findings.indexOf(adjudication.finding_id);
    if (idx !== -1) {
      session.contested_findings.splice(idx, 1);
    }

    // Update coverage status
    const finding = session.findings.find(f => f.finding_id === adjudication.finding_id);
    if (finding) {
      const coverage = session.investigation_coverage.get(finding.sub_question_id);
      if (coverage) {
        coverage.status = 'resolved';
      }
    }

    session.updated_at = new Date();
    return session;
  }

  /**
   * Archive session
   */
  archiveSession(sessionId: string, reason: string): CollaborativeSession {
    const session = this.getSession(sessionId);
    session.session_state = session.report ? 'archived' : 'archived_incomplete';
    session.updated_at = new Date();

    // Clear active session if this was it
    if (this.activeSessionId === sessionId) {
      this.activeSessionId = null;
    }

    return session;
  }

  /**
   * Get investigator stats
   */
  getInvestigatorStats(sessionId: string): { agent_id: AgentId; findings_submitted: number; confirmations_given: number; challenges_given: number; confirmation_rate: number }[] {
    const session = this.getSession(sessionId);
    const stats = new Map<AgentId, { findings: number; confirmations: number; challenges: number }>();

    for (const agent of session.agents) {
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
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const collaborativeStore = new CollaborativeSessionStore();
