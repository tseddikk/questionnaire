/**
 * Discover Sessions Tool
 *
 * Tool: discover_sessions
 * Phase: Any
 *
 * Find active sessions on a given repo for agents to join.
 */

import { collaborativeStore } from '../state/collaborative-store.js';

export interface DiscoverSessionsInput {
  repo_path: string;
}

export interface ActiveSessionInfo {
  session_id: string;
  repo: string;
  phase: number;
  started_by: string;
  started_at: string;
  investigators: string[];
  synthesizer: string | null;
  questions_accepted: number;
  findings_submitted: number;
}

export interface DiscoverSessionsResponse {
  active_sessions: ActiveSessionInfo[];
}

/**
 * Discover active sessions for a repo
 */
export function discoverSessions(input: DiscoverSessionsInput): DiscoverSessionsResponse {
  const sessions = collaborativeStore.discoverSessions(input.repo_path);

  return {
    active_sessions: sessions.map(s => ({
      session_id: s.session_id,
      repo: s.repo_path,
      phase: s.phase,
      started_by: s.agents[0]?.agent_id ?? 'unknown',
      started_at: s.created_at.toISOString(),
      investigators: s.agents.filter(a => a.role === 'investigator').map(a => a.agent_id),
      synthesizer: s.synthesizer,
      questions_accepted: s.merged_questions.length,
      findings_submitted: s.findings.length,
    })),
  };
}

export const discoverSessionsTool = {
  name: 'discover_sessions',
  description: 'Find active sessions on a given repo for agents to join',
  inputSchema: {
    type: 'object' as const,
    properties: {
      repo_path: {
        type: 'string' as const,
        description: 'Repository path to search for sessions',
      },
    },
    required: ['repo_path'],
  },
};
