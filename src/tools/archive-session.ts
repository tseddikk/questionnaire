/**
 * Archive Session Tool
 *
 * Tool: archive_session
 * Phase: Any
 *
 * Abandon an active session without finalizing.
 */

import { collaborativeStore } from '../state/collaborative-store.js';

export interface ArchiveSessionInput {
  session_id: string;
  agent_id: string;
  reason: string;
}

export interface ArchiveSessionResponse {
  status: 'archived_incomplete' | 'rejected';
  session_id?: string;
  findings_preserved?: number;
  message?: string;
  reason?: string;
  guidance?: string;
}

export function archiveSession(input: ArchiveSessionInput): ArchiveSessionResponse {
  const session = collaborativeStore.getSession(input.session_id);

  if (session.session_state === 'finalized' || session.session_state === 'archived_incomplete') {
    return {
      status: 'rejected',
      reason: 'SESSION_NOT_ACTIVE',
      guidance: `Cannot archive a session in state "${session.session_state}".`,
    };
  }

  const isMember = session.agents.some(a => a.agent_id === input.agent_id);
  if (!isMember) {
    return {
      status: 'rejected',
      reason: 'AGENT_NOT_IN_SESSION',
      guidance: `Agent ${input.agent_id} is not a member of this session. Only session members can archive.`,
    };
  }

  const archived = collaborativeStore.archiveSession(input.session_id, input.reason);

  return {
    status: 'archived_incomplete',
    session_id: input.session_id,
    findings_preserved: archived.findings.length,
    message: `Session archived. Findings are preserved for reference. The MCP server is now ready for a new session.`,
  };
}

export const archiveSessionTool = {
  name: 'archive_session',
  description: 'Abandon an active session without finalizing',
  inputSchema: {
    type: 'object' as const,
    properties: {
      session_id: {
        type: 'string' as const,
        format: 'uuid',
        description: 'Session ID to archive',
      },
      agent_id: {
        type: 'string' as const,
        description: 'Agent ID requesting the archive',
      },
      reason: {
        type: 'string' as const,
        description: 'Reason for archiving',
      },
    },
    required: ['session_id', 'agent_id', 'reason'],
  },
};
