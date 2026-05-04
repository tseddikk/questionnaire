/**
 * Initialize Audit Tool
 * 
 * Tool: initialize_audit
 * Phase: 0 -> 1
 * 
 * Creates a new audit session and returns instructions for the agent.
 */

import { collaborativeStore } from '../state/collaborative-store.js';
import { generateInstructions } from '../protocol/instructions.js';
import { generateHeatMap, formatHeatMapForInstructions } from '../heat-map/heat-map-generator.js';
import type { InitializeAuditInput } from '../types/schemas.js';
import type { InitializeResponse } from '../types/domain.js';

// ============================================================================
// Tool Implementation
// ============================================================================

/**
 * Initialize a new audit session
 * Includes Phase 0.5: Heat Map Generation
 */
export async function initializeAudit(input: InitializeAuditInput): Promise<InitializeResponse> {
  // Create the session in the collaborative store
  const agentId = input.agent_id;
  const session = collaborativeStore.createSession(
    input.repo_path,
    input.domain,
    input.depth,
    agentId
  );

  // Phase 0.5: Generate Heat Map
  // This runs automatically before Phase 1 unlocks
  const heatMap = await generateHeatMap({
    repoPath: input.repo_path,
    domain: input.domain,
    windowDays: 90,
  });

  // Store heat map in session
  collaborativeStore.setHeatMap(session.session_id, heatMap);

  // Advance to phase 1
  collaborativeStore.advancePhase(session.session_id, 1);

  // Generate base instructions
  const baseInstructions = generateInstructions(input.domain, input.depth);

  // Inject heat map into instructions
  const heatMapSection = formatHeatMapForInstructions(heatMap);
  const instructions = `${baseInstructions}\n\n${heatMapSection}`;

  return {
    session_id: session.session_id,
    status: 'ready',
    instructions,
  };
}

// ============================================================================
// MCP Tool Definition
// ============================================================================

export const initializeAuditTool = {
  name: 'initialize_audit',
  description: 'Initialize a new audit session with heat map generation. Must be called first.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      repo_path: {
        type: 'string' as const,
        description: 'Absolute path to the repository to audit',
      },
      agent_id: {
        type: 'string' as const,
        description: 'Agent ID creating the session',
      },
      domain: {
        type: 'string' as const,
        enum: ['security', 'performance', 'architecture', 'data_integrity', 'observability', 'compliance'] as const,
        description: 'Audit domain focus',
      },
      depth: {
        type: 'string' as const,
        enum: ['standard', 'deep', 'forensic'] as const,
        description: 'Audit depth level',
      },
      heat_map_window_days: {
        type: 'number' as const,
        description: 'Git history window for churn analysis (default: 90)',
      },
      heat_map_weights: {
        type: 'object' as const,
        properties: {
          churn: { type: 'number' as const },
          coupling: { type: 'number' as const },
          coverage: { type: 'number' as const },
        },
        description: 'Override domain default weights',
      },
    },
    required: ['repo_path', 'agent_id', 'domain', 'depth'],
  },
};
