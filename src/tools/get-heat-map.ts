/**
 * Get Heat Map Tool
 *
 * Tool: get_heat_map
 * Phase: Any
 *
 * Returns the pre-generated heat map for the session.
 * The heat map is generated once during Phase 0.5 and stored in session state.
 * This tool is read-only and never triggers regeneration.
 */

import { collaborativeStore } from '../state/collaborative-store.js';
import type { HeatMap } from '../types/domain.js';

// ============================================================================
// Tool Implementation
// ============================================================================

export interface GetHeatMapInput {
  session_id: string;
  filter_bucket?: 'critical' | 'high' | 'medium' | 'low' | 'all';
}

export interface GetHeatMapResponse {
  session_id: string;
  generated_at: string;
  repo_stats: {
    total_files_analyzed: number;
    files_with_coverage_data: number;
    git_window_days: number;
    languages_detected: string[];
  };
  heat_map: HeatMap['entries'];
  domain_weights_used: {
    churn: number;
    coupling: number;
    coverage: number;
  };
}

/**
 * Get the heat map for a session
 */
export function getHeatMap(input: GetHeatMapInput): GetHeatMapResponse {
  const session = collaborativeStore.getSession(input.session_id);

  // Heat map must exist (generated in Phase 0.5)
  if (!session.heat_map) {
    throw new Error('Heat map not available for this session');
  }

  const heatMap = session.heat_map;

  // Filter entries if requested
  let entries = heatMap.entries;
  if (input.filter_bucket && input.filter_bucket !== 'all') {
    entries = entries.filter(e => e.bucket === input.filter_bucket);
  }

  return {
    session_id: session.session_id,
    generated_at: heatMap.generated_at,
    repo_stats: heatMap.repo_stats,
    heat_map: entries,
    domain_weights_used: heatMap.domain_weights_used,
  };
}

// ============================================================================
// MCP Tool Definition
// ============================================================================

export const getHeatMapTool = {
  name: 'get_heat_map',
  description: 'Get the heat map for the session. Read-only - never triggers regeneration.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      session_id: {
        type: 'string' as const,
        format: 'uuid',
        description: 'Session ID',
      },
      filter_bucket: {
        type: 'string' as const,
        enum: ['critical', 'high', 'medium', 'low', 'all'],
        description: 'Filter entries by bucket',
      },
    },
    required: ['session_id'],
  },
};
