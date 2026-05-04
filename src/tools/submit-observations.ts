/**
 * Submit Observations Tool
 * 
 * Tool: submit_observations
 * Phase: 1 -> 2
 * 
 * Accepts the agent's raw observation log from Phase 1.
 */

import { collaborativeStore } from '../state/collaborative-store.js';
import {
  validateObservations,
  assertObservationsValid
} from '../validation/observation-validator.js';
import type { SubmitObservationsInput } from '../types/schemas.js';
import type { ObservationsResponse } from '../types/domain.js';

// ============================================================================
// Tool Implementation
// ============================================================================

/**
 * Submit observations and advance to Phase 2
 */
export function submitObservations(
  input: SubmitObservationsInput
): ObservationsResponse {
  // Get session from collaborative store
  const session = collaborativeStore.getSession(input.session_id);

  const isMember = session.agents.some(a => a.agent_id === input.agent_id);
  if (!isMember) {
    return {
      status: 'rejected',
      reason: 'AGENT_NOT_IN_SESSION',
      guidance: `Agent ${input.agent_id} is not a member of this session. Use join_session first.`,
    };
  }

  // Validate observations have file citations
  const validationResult = validateObservations(input.observations);
  assertObservationsValid(validationResult);

  // Store observations
  const agentId = input.agent_id;
  collaborativeStore.setObservations(session.session_id, agentId, input.observations);

  // Get latest state
  const updatedSession = collaborativeStore.getSession(session.session_id, true);

  return {
    status: 'accepted',
    current_phase: updatedSession.phase,
    observations_count: updatedSession.observation_sets.length,
  };
}

// ============================================================================
// MCP Tool Definition
// ============================================================================

export const submitObservationsTool = {
  name: 'submit_observations',
  description: 'Submit Phase 1 observation log. Advances to Phase 2.',
  inputSchema: {
    type: 'object',
    properties: {
      session_id: {
        type: 'string',
        format: 'uuid',
        description: 'Session ID from initialize_audit',
      },
      agent_id: {
        type: 'string',
        description: 'Agent ID submitting observations',
      },
      observations: {
        type: 'object',
        properties: {
          purpose: { type: 'string' },
          tech_stack: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                version: { type: 'string' },
                file_path: { type: 'string' },
              },
              required: ['name', 'version', 'file_path'],
            },
          },
          entry_points: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string' },
                location: { type: 'string' },
                file_path: { type: 'string' },
              },
              required: ['type', 'location', 'file_path'],
            },
          },
          data_flows: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                source: { type: 'string' },
                destination: { type: 'string' },
                transformation: { type: 'string' },
                file_paths: { type: 'array', items: { type: 'string' } },
              },
              required: ['source', 'destination', 'transformation', 'file_paths'],
            },
          },
          auth_mechanisms: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                mechanism: { type: 'string' },
                location: { type: 'string' },
                file_path: { type: 'string' },
              },
              required: ['mechanism', 'location', 'file_path'],
            },
          },
          error_patterns: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                pattern: { type: 'string' },
                handling: { type: 'string' },
                file_path: { type: 'string' },
              },
              required: ['pattern', 'handling', 'file_path'],
            },
          },
          test_coverage: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                component: { type: 'string' },
                coverage: { type: 'string' },
                file_path: { type: 'string' },
              },
              required: ['component', 'coverage', 'file_path'],
            },
          },
          config_secrets: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                key: { type: 'string' },
                location: { type: 'string' },
                file_path: { type: 'string' },
              },
              required: ['key', 'location', 'file_path'],
            },
          },
          deployment: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                aspect: { type: 'string' },
                detail: { type: 'string' },
                file_path: { type: 'string' },
              },
              required: ['aspect', 'detail', 'file_path'],
            },
          },
        },
        required: [
          'purpose',
          'tech_stack',
          'entry_points',
          'data_flows',
          'auth_mechanisms',
          'error_patterns',
          'test_coverage',
          'config_secrets',
          'deployment',
        ],
      },
    },
    required: ['session_id', 'agent_id', 'observations'],
  },
};
