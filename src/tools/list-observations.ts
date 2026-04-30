/**
 * List Observations Tool
 *
 * Tool: list_observations
 * Phase: Any
 *
 * Returns all observation sets submitted in the session.
 */

import { collaborativeStore } from '../state/collaborative-store.js';

export interface ListObservationsInput {
  session_id: string;
}

export interface ObservationSetInfo {
  agent_id: string;
  submitted_at: string;
  purpose: string;
  tech_stack_count: number;
  entry_points_count: number;
  data_flows_count: number;
}

export interface ListObservationsResponse {
  session_id: string;
  phase: number;
  observation_sets: ObservationSetInfo[];
}

export function listObservations(input: ListObservationsInput): ListObservationsResponse {
  const session = collaborativeStore.getSession(input.session_id);

  const observationSets: ObservationSetInfo[] = session.observation_sets.map(os => ({
    agent_id: os.agent_id,
    submitted_at: os.submitted_at.toISOString(),
    purpose: os.observations.purpose || 'Not provided',
    tech_stack_count: os.observations.tech_stack?.length || 0,
    entry_points_count: os.observations.entry_points?.length || 0,
    data_flows_count: os.observations.data_flows?.length || 0,
  }));

  return {
    session_id: session.session_id,
    phase: session.phase,
    observation_sets: observationSets,
  };
}

export const listObservationsTool = {
  name: 'list_observations',
  description: 'List all observation sets submitted by agents. Use this to understand what discovery work has already been done in Phase 1.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      session_id: {
        type: 'string' as const,
        format: 'uuid',
        description: 'Session ID',
      },
    },
    required: ['session_id'],
  },
};