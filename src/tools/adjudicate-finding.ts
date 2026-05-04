/**
 * Adjudicate Finding Tool
 *
 * Tool: adjudicate_finding
 * Phase: 5 (Adjudicating)
 *
 * Synthesizer rules on contested findings.
 */

import { collaborativeStore } from '../state/collaborative-store.js';
import { SynthesizerOnlyError, FindingNotContestedError } from '../state/errors.js';
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

export interface AdjudicateFindingAcceptedResponse {
  status: 'adjudication_recorded';
  adjudication_id: string;
  remaining_contested: number;
}

export interface AdjudicateFindingRejectedResponse {
  status: 'rejected';
  reason: string;
  guidance: string;
}

export type AdjudicateFindingResponse =
  | AdjudicateFindingAcceptedResponse
  | AdjudicateFindingRejectedResponse;

export function adjudicateFinding(input: AdjudicateFindingInput): AdjudicateFindingResponse {
  const session = collaborativeStore.getSession(input.session_id);

  if (session.synthesizer !== input.agent_id) {
    throw new SynthesizerOnlyError('adjudicate_finding', session.synthesizer, input.agent_id);
  }

  const finding = session.findings?.find(f => f.finding_id === input.finding_id);
  const currentStatus = finding ? 'submitted' : 'unknown';
  if (!session.contested_findings.includes(input.finding_id)) {
    throw new FindingNotContestedError('adjudicate_finding', input.finding_id, currentStatus);
  }

  if (input.ruling === 'unresolved' && !input.unresolved_detail) {
    return {
      status: 'rejected',
      reason: 'MISSING_UNRESOLVED_DETAIL',
      guidance: 'When ruling is "unresolved", you must provide unresolved_detail explaining what remains unresolved.',
    };
  }

  if (input.ruling === 'merge' && !input.merged_finding) {
    return {
      status: 'rejected',
      reason: 'MISSING_MERGED_FINDING',
      guidance: 'When ruling is "merge", you must provide a merged_finding object combining both agents\' findings.',
    };
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

  const updatedSession = collaborativeStore.getSession(input.session_id);

  return {
    status: 'adjudication_recorded',
    adjudication_id: adjudication.id,
    remaining_contested: updatedSession.contested_findings.length,
  };
}

export const adjudicateFindingTool = {
  name: 'adjudicate_finding',
  description: 'Synthesizer rules on contested findings (uphold, merge, or unresolved)',
  inputSchema: {
    type: 'object' as const,
    properties: {
      session_id: { type: 'string' as const, format: 'uuid' },
      agent_id: { type: 'string' as const, description: 'Agent ID calling adjudicate (must be the Synthesizer)' },
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
    required: ['session_id', 'agent_id', 'finding_id', 'ruling', 'reasoning'],
  },
};
