/**
 * Get Session Summary Tool
 *
 * Tool: get_session_summary
 * Phase: Any
 *
 * Returns current investigation state with stats.
 */

import { collaborativeStore } from '../state/collaborative-store.js';

export interface GetSessionSummaryInput {
  session_id: string;
}

export interface GetSessionSummaryResponse {
  session_id: string;
  phase: number;
  session_state: string;
  investigators: string[];
  synthesizer: string | null;
  findings_summary: {
    total: number;
    by_verdict: Record<string, number>;
    by_severity: Record<string, number>;
    confirmed_multi_agent: number;
    single_agent_unverified: number;
    contested: number;
  };
  investigator_stats: {
    agent_id: string;
    findings_submitted: number;
    confirmations_given: number;
    challenges_given: number;
    confirmation_rate: number;
  }[];
  contested_findings: {
    finding_id: string;
    description: string;
    raised_by: string;
    challenged_by: string;
    challenge_summary: string;
  }[];
  checkpoints_complete: Record<string, string>;
}

export function getSessionSummary(input: GetSessionSummaryInput): GetSessionSummaryResponse {
  const session = collaborativeStore.getSession(input.session_id);
  const stats = collaborativeStore.getInvestigatorStats(input.session_id);

  // Calculate findings summary
  const byVerdict: Record<string, number> = { PASS: 0, FAIL: 0, SUSPICIOUS: 0, UNCERTAIN: 0 };
  const bySeverity: Record<string, number> = { info: 0, warning: 0, critical: 0, catastrophic: 0 };
  let confirmed = 0;
  let singleAgent = 0;

  for (const finding of session.findings) {
    byVerdict[finding.verdict] = (byVerdict[finding.verdict] || 0) + 1;
    bySeverity[finding.severity] = (bySeverity[finding.severity] || 0) + 1;

    const reactions = session.finding_reactions.filter(r => r.finding_id === finding.finding_id);
    const hasConfirm = reactions.some(r => r.reaction_type === 'confirm');
    const hasChallenge = reactions.some(r => r.reaction_type === 'challenge');
    if (hasChallenge) {
      // contested - don't count as confirmed or single_agent
    } else if (hasConfirm) {
      confirmed++;
    } else {
      singleAgent++;
    }
  }

  // Build contested findings list
  const contested = session.contested_findings.map(findingId => {
    const finding = session.findings.find(f => f.finding_id === findingId);
    const challenge = session.finding_reactions.find(
      r => r.finding_id === findingId && r.reaction_type === 'challenge'
    );

    return {
      finding_id: findingId,
      description: finding?.answer?.substring(0, 50) + '...' || 'Unknown',
      raised_by: finding?.agent_id || 'Unknown',
      challenged_by: challenge?.agent_id || 'Unknown',
      challenge_summary: challenge?.content?.substring(0, 100) || '',
    };
  });

  // Build checkpoint progress
  const checkpoints: Record<string, string> = {};
  for (const agent of session.agents) {
    const agentCheckpoints = session.agent_checkpoints.filter(
      cp => cp.agent_id === agent.agent_id
    );
    checkpoints[agent.agent_id] = `${agentCheckpoints.length}/${session.merged_questions.length}`;
  }

  return {
    session_id: session.session_id,
    phase: session.phase,
    session_state: session.session_state,
    investigators: session.agents.filter(a => a.role === 'investigator').map(a => a.agent_id),
    synthesizer: session.synthesizer,
    findings_summary: {
      total: session.findings.length,
      by_verdict: byVerdict,
      by_severity: bySeverity,
      confirmed_multi_agent: confirmed,
      single_agent_unverified: singleAgent,
      contested: session.contested_findings.length,
    },
    investigator_stats: stats.map(s => ({
      agent_id: s.agent_id,
      findings_submitted: s.findings_submitted,
      confirmations_given: s.confirmations_given,
      challenges_given: s.challenges_given,
      confirmation_rate: parseFloat(s.confirmation_rate.toFixed(2)),
    })),
    contested_findings: contested,
    checkpoints_complete: checkpoints,
  };
}

export const getSessionSummaryTool = {
  name: 'get_session_summary',
  description: 'Get current investigation state with findings summary and investigator stats',
  inputSchema: {
    type: 'object' as const,
    properties: {
      session_id: { type: 'string' as const, format: 'uuid' },
    },
    required: ['session_id'],
  },
};
