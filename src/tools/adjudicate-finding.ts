/**
 * Adjudicate Finding Tool
 *
 * Tool: adjudicate_finding
 * Phase: 5 (Adjudicating)
 *
 * Synthesizer rules on contested findings.
 */

import { collaborativeStore } from '../state/collaborative-store.js';
import { v4 as uuidv4 } from 'uuid';
import type { AdjudicationRecord, MergedFinding } from '../types/domain.js';

export interface AdjudicateFindingInput {
  session_id: string;
  agent_id: string;
  finding_id: string;
  ruling: 'uphold' | 'merge' | 'unresolved';
  upheld_agent?: string;
  reasoning: string;
  merged_finding?: MergedFinding | null;
  unresolved_detail?: string | null;
}

export interface AdjudicateFindingResponse {
  status: 'adjudication_recorded';
  adjudication_id: string;
  remaining_contested: number;
}

export function adjudicateFinding(input: AdjudicateFindingInput): AdjudicateFindingResponse {
  const session = collaborativeStore.getSession(input.session_id);

  // Verify caller is synthesizer
  if (session.synthesizer !== input.agent_id) {
    throw new Error('Only the Synthesizer can adjudicate findings');
  }

  const adjudication: AdjudicationRecord = {
    id: uuidv4(),
    finding_id: input.finding_id,
    ruling: input.ruling,
    upheld_agent: input.upheld_agent || null,
    reasoning: input.reasoning,
    merged_finding: input.merged_finding || null,
    unresolved_detail: input.unresolved_detail || null,
    adjudicated_at: new Date(),
  };

  collaborativeStore.addAdjudication(input.session_id, adjudication);

  return {
    status: 'adjudication_recorded',
    adjudication_id: adjudication.id,
    remaining_contested: session.contested_findings.length - 1,
  };
}

export const adjudicateFindingTool = {
  name: 'adjudicate_finding',
  description: 'Synthesizer rules on contested findings (uphold, merge, or unresolved)',
  inputSchema: {
    type: 'object' as const,
    properties: {
      session_id: { type: 'string' as const, format: 'uuid' },
      finding_id: { type: 'string' as const, format: 'uuid' },
      ruling: { type: 'string' as const, enum: ['uphold', 'merge', 'unresolved'] },
      upheld_agent: { type: 'string' as const },
      reasoning: { type: 'string' as const },
      merged_finding: {
        type: 'object' as const,
        properties: {
          text: { type: 'string' as const },
          verdict: { type: 'string' as const, enum: ['PASS', 'FAIL', 'SUSPICIOUS', 'UNCERTAIN'] },
          severity: { type: 'string' as const, enum: ['info', 'warning', 'critical', 'catastrophic'] },
        },
      },
      unresolved_detail: { type: 'string' as const },
    },
    required: ['session_id', 'finding_id', 'ruling', 'reasoning'],
  },
};
