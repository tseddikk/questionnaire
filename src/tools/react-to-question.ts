/**
 * React to Question Tool
 *
 * Tool: react_to_question
 * Phase: 2
 *
 * Agents challenge, endorse, or flag conflicts with questions.
 */

import { collaborativeStore } from '../state/collaborative-store.js';
import { v4 as uuidv4 } from 'uuid';
import type { QuestionReaction } from '../types/domain.js';

export interface ReactToQuestionInput {
  session_id: string;
  agent_id: string;
  question_id: string;
  reaction_type: 'challenge_quality' | 'flag_conflict' | 'endorse';
  content: string;
}

export interface ReactToQuestionResponse {
  status: 'accepted';
  reaction_id: string;
}

export function reactToQuestion(input: ReactToQuestionInput): ReactToQuestionResponse {
  const session = collaborativeStore.getSession(input.session_id);

  // Validate question exists
  const questionExists = session.merged_questions.some(
    q => q.id === input.question_id
  );
  if (!questionExists) {
    throw new Error(`INVALID_QUESTION_ID: Question ${input.question_id} not found in session. Use list_questions to see valid IDs.`);
  }

  const reaction: QuestionReaction = {
    id: uuidv4(),
    question_id: input.question_id,
    agent_id: input.agent_id,
    reaction_type: input.reaction_type,
    content: input.content,
    submitted_at: new Date(),
  };

  session.question_reactions.push(reaction);
  session.updated_at = new Date();

  return {
    status: 'accepted',
    reaction_id: reaction.id,
  };
}

export const reactToQuestionTool = {
  name: 'react_to_question',
  description: 'Challenge question quality, flag conflicts, or endorse questions',
  inputSchema: {
    type: 'object' as const,
    properties: {
      session_id: { type: 'string' as const, format: 'uuid' },
      agent_id: { type: 'string' as const },
      question_id: { type: 'string' as const, format: 'uuid' },
      reaction_type: { type: 'string' as const, enum: ['challenge_quality', 'flag_conflict', 'endorse'] },
      content: { type: 'string' as const },
    },
    required: ['session_id', 'agent_id', 'question_id', 'reaction_type', 'content'],
  },
};
