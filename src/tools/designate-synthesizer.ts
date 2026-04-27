/**
 * Designate Synthesizer Tool
 *
 * Tool: designate_synthesizer
 * Phase: Before finalization
 *
 * User designates which agent becomes the Synthesizer.
 */

import { collaborativeStore } from '../state/collaborative-store.js';

export interface DesignateSynthesizerInput {
  session_id: string;
  synthesizer_agent_id: string;
}

export interface DesignateSynthesizerResponse {
  status: 'synthesizer_designated';
  synthesizer: string;
  message: string;
}

export function designateSynthesizer(input: DesignateSynthesizerInput): DesignateSynthesizerResponse {
  collaborativeStore.designateSynthesizer(
    input.session_id,
    input.synthesizer_agent_id
  );

  return {
    status: 'synthesizer_designated',
    synthesizer: input.synthesizer_agent_id,
    message: `${input.synthesizer_agent_id} is now the Synthesizer. It is the only agent authorized to call finalize_report.`,
  };
}

export const designateSynthesizerTool = {
  name: 'designate_synthesizer',
  description: 'Designate an agent as the Synthesizer for final report compilation',
  inputSchema: {
    type: 'object' as const,
    properties: {
      session_id: { type: 'string' as const, format: 'uuid' },
      synthesizer_agent_id: { type: 'string' as const },
    },
    required: ['session_id', 'synthesizer_agent_id'],
  },
};
