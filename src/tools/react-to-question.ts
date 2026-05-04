/**
 * React to Question Tool
 *
 * Tool: react_to_question
 * Phase: 2
 *
 * Agents challenge, endorse, or flag conflicts with questions.
 */

import { collaborativeStore } from '../state/collaborative-store.js';
import { UnknownMainQuestionError } from '../state/errors.js';
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
  status: 'accepted' | 'rejected';
  reaction_id?: string;
  reason?: string;
  guidance?: string;
}

export function reactToQuestion(input: ReactToQuestionInput): ReactToQuestionResponse {
  const session = collaborativeStore.getSession(input.session_id);

  const isMember = session.agents.some(a => a.agent_id === input.agent_id);
  if (!isMember) {
    return {
      status: 'rejected',
      reason: 'AGENT_NOT_IN_SESSION',
      guidance: `Agent ${input.agent_id} is not a member of this session. Use join_session first.`,
    };
  }

  const questionExists = session.merged_questions.some(
    q => q.id === input.question_id
  );
  if (!questionExists) {
    throw new UnknownMainQuestionError('react_to_question', input.question_id, session.merged_questions.map(q => q.id));
  }

  const ownQuestion = session.merged_questions.find(
    q => q.id === input.question_id && q.author_agent_id === input.agent_id
  );
  if (ownQuestion && input.reaction_type === 'endorse') {
    return {
      status: 'rejected',
      reason: 'CANNOT_ENDORSE_OWN_QUESTION',
      guidance: 'You cannot endorse your own question. Endorsement requires independent review.',
    };
  }

  const reaction: QuestionReaction = {
    id: uuidv4(),
    question_id: input.question_id,
    agent_id: input.agent_id,
    reaction_type: input.reaction_type,
    content: input.content,
    submitted_at: new Date(),
  };

  collaborativeStore.addQuestionReaction(input.session_id, reaction);

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
