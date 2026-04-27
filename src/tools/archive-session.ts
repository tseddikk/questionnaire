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
  reason: string;
}

export interface ArchiveSessionResponse {
  status: 'archived_incomplete';
  session_id: string;
  findings_preserved: number;
  message: string;
}

export function archiveSession(input: ArchiveSessionInput): ArchiveSessionResponse {
  const session = collaborativeStore.archiveSession(input.session_id, input.reason);

  return {
    status: 'archived_incomplete',
    session_id: input.session_id,
    findings_preserved: session.findings.length,
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
      reason: {
        type: 'string' as const,
        description: 'Reason for archiving',
      },
    },
    required: ['session_id', 'reason'],
  },
};
