/**
 * Join Session Tool
 *
 * Tool: join_session
 * Phase: Any
 *
 * Called by an agent to join an existing session as an Investigator.
 */

import { collaborativeStore } from '../state/collaborative-store.js';
import type { CollaborativeSession } from '../types/domain.js';

export interface JoinSessionInput {
  session_id: string;
  agent_id: string;
  repo_path: string;
}

export interface JoinSessionResponse {
  status: 'joined';
  your_role: 'investigator';
  current_phase: number;
  session_state: CollaborativeSession['session_state'];
  investigators: string[];
  synthesizer: string | null;
  instructions: string;
}

export function joinSession(input: JoinSessionInput): JoinSessionResponse {
  const session = collaborativeStore.joinSession(input.session_id, input.agent_id, input.repo_path);

  return {
    status: 'joined',
    your_role: 'investigator',
    current_phase: session.phase,
    session_state: session.session_state,
    investigators: session.agents
      .filter(a => a.role === 'investigator')
      .map(a => a.agent_id),
    synthesizer: session.synthesizer,
    instructions: `You have joined a collaborative audit session (Phase ${session.phase}). ` +
      `Current investigators: ${session.agents.filter(a => a.role === 'investigator').map(a => a.agent_id).join(', ') || 'none yet'}. ` +
      `Questions accepted: ${session.merged_questions.length}. ` +
      `Findings submitted: ${session.findings.length}. ` +
      (session.phase <= 2
        ? 'Submit observations via submit_observations, then questions via submit_question.'
        : session.phase === 3
          ? 'Submit sub-questions via submit_sub_questions for each main question.'
          : session.phase === 4
            ? 'Investigate sub-questions via submit_finding. You can checkpoint when done.'
            : 'Investigation is complete. Waiting for synthesizer to finalize.'),
  };
}

export const joinSessionTool = {
  name: 'join_session',
  description: 'Join an existing session as an Investigator',
  inputSchema: {
    type: 'object' as const,
    properties: {
      session_id: {
        type: 'string' as const,
        format: 'uuid',
        description: 'Session ID to join',
      },
      agent_id: {
        type: 'string' as const,
        description: 'Your agent identifier',
      },
      repo_path: {
        type: 'string' as const,
        description: 'Absolute path to repository',
      },
    },
    required: ['session_id', 'agent_id', 'repo_path'],
  },
};
