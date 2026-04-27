/**
 * React to Finding Tool
 *
 * Tool: react_to_finding
 * Phase: 4
 *
 * Agents confirm, challenge, or extend findings with independent evidence.
 */

import { collaborativeStore } from '../state/collaborative-store.js';
import type { FindingReaction } from '../types/domain.js';
import { v4 as uuidv4 } from 'uuid';

export interface ReactToFindingInput {
  session_id: string;
  agent_id: string;
  finding_id: string;
  reaction_type: 'confirm' | 'challenge' | 'extend';
  content: string;
  evidence?: {
    file_path: string;
    line_start: number;
    line_end: number;
    snippet: string;
  } | null;
}

export interface ReactToFindingResponse {
  status: 'accepted' | 'rejected';
  reaction_id?: string;
  finding_status?: 'confirmed' | 'contested' | 'extended';
  reason?: string;
  guidance?: string;
}

export function reactToFinding(input: ReactToFindingInput): ReactToFindingResponse {
  const session = collaborativeStore.getSession(input.session_id);

  // Verify agent is in session
  if (!session.agents.some(a => a.agent_id === input.agent_id)) {
    return {
      status: 'rejected',
      reason: 'Agent not in session',
    };
  }

  // Verify finding exists
  const finding = session.findings.find(f => f.finding_id === input.finding_id);
  if (!finding) {
    return {
      status: 'rejected',
      reason: 'Finding not found',
    };
  }

  // Cannot react to own finding
  if (finding.agent_id === input.agent_id) {
    return {
      status: 'rejected',
      reason: 'Cannot react to own finding',
    };
  }

  // Confirm requires independent evidence
  if (input.reaction_type === 'confirm' && !input.evidence) {
    return {
      status: 'rejected',
      reason: 'CONFIRMATION_REQUIRES_INDEPENDENT_EVIDENCE',
      guidance: 'Confirm reactions must include evidence from your own investigation, not a reference to the original finding\'s evidence.',
    };
  }

  // Challenge requires evidence
  if (input.reaction_type === 'challenge' && !input.evidence) {
    return {
      status: 'rejected',
      reason: 'CHALLENGE_REQUIRES_EVIDENCE',
      guidance: 'Challenge reactions must include contradicting evidence.',
    };
  }

  const reaction: FindingReaction = {
    id: uuidv4(),
    finding_id: input.finding_id,
    agent_id: input.agent_id,
    reaction_type: input.reaction_type,
    content: input.content,
    evidence: input.evidence || null,
    submitted_at: new Date(),
  };

  collaborativeStore.addFindingReaction(input.session_id, reaction);

  // Determine finding status
  let finding_status: 'confirmed' | 'contested' | 'extended';
  if (input.reaction_type === 'confirm') {
    finding_status = 'confirmed';
  } else if (input.reaction_type === 'challenge') {
    finding_status = 'contested';
  } else {
    finding_status = 'extended';
  }

  return {
    status: 'accepted',
    reaction_id: reaction.id,
    finding_status,
  };
}

export const reactToFindingTool = {
  name: 'react_to_finding',
  description: 'Confirm, challenge, or extend another agent\'s finding with independent evidence',
  inputSchema: {
    type: 'object' as const,
    properties: {
      session_id: { type: 'string' as const, format: 'uuid' },
      agent_id: { type: 'string' as const },
      finding_id: { type: 'string' as const, format: 'uuid' },
      reaction_type: { type: 'string' as const, enum: ['confirm', 'challenge', 'extend'] },
      content: { type: 'string' as const },
      evidence: {
        type: 'object' as const,
        nullable: true,
        properties: {
          file_path: { type: 'string' as const },
          line_start: { type: 'number' as const },
          line_end: { type: 'number' as const },
          snippet: { type: 'string' as const },
        },
      },
    },
    required: ['session_id', 'agent_id', 'finding_id', 'reaction_type', 'content'],
  },
};
