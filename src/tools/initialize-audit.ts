/**
 * Initialize Audit Tool
 * 
 * Tool: initialize_audit
 * Phase: 0 -> 1
 * 
 * Creates a new audit session and returns instructions for the agent.
 */

import { sessionStore } from '../state/session-store.js';
import { generateInstructions } from '../protocol/instructions.js';
import type { InitializeAuditInput } from '../types/schemas.js';
import type { InitializeResponse } from '../types/domain.js';

// ============================================================================
// Tool Implementation
// ============================================================================

/**
 * Initialize a new audit session
 */
export function initializeAudit(input: InitializeAuditInput): InitializeResponse {
  // Create the session
  const session = sessionStore.createSession(
    input.repo_path,
    input.domain,
    input.depth
  );
  
  // Advance to phase 1
  sessionStore.advancePhase(session.session_id, 1);
  
  // Generate instructions based on domain and depth
  const instructions = generateInstructions(input.domain, input.depth);
  
  return {
    session_id: session.session_id,
    status: 'ready',
    instructions,
  };
}

/**
 * Validate input (basic validation before processing)
 */
export function validateInitializeInput(
  input: unknown
): input is InitializeAuditInput {
  if (!input || typeof input !== 'object') {
    return false;
  }
  
  const requiredFields = ['repo_path', 'domain', 'depth'];
  for (const field of requiredFields) {
    if (!(field in input)) {
      return false;
    }
  }
  
  const validDomains = [
    'security', 'performance', 'architecture',
    'data_integrity', 'observability', 'compliance'
  ];
  
  const validDepths = ['standard', 'deep', 'forensic'];
  
  const typedInput = input as { domain: string; depth: string };
  
  if (!validDomains.includes(typedInput.domain)) {
    return false;
  }
  
  if (!validDepths.includes(typedInput.depth)) {
    return false;
  }
  
  return true;
}

// ============================================================================
// MCP Tool Definition
// ============================================================================

export const initializeAuditTool = {
  name: 'initialize_audit',
  description: 'Initialize a new audit session. Must be called first.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      repo_path: {
        type: 'string' as const,
        description: 'Absolute path to the repository to audit',
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
    },
    required: ['repo_path', 'domain', 'depth'],
  },
};
