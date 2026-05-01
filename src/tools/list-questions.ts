/**
 * List Questions Tool
 *
 * Tool: list_questions
 * Phase: Any
 *
 * Returns all questions in a session with IDs, status, and metadata.
 */

import { collaborativeStore } from '../state/collaborative-store.js';

export interface ListQuestionsInput {
  session_id: string;
}

export type QuestionStatus = 'needs_decomposition' | 'decomposed' | 'investigating' | 'complete';

export interface QuestionInfo {
  main_question_id: string;
  text: string;
  author_agent_id: string;
  status: QuestionStatus;
  sub_questions_count: number;
  findings_count: number;
}

export interface ListQuestionsResponse {
  session_id: string;
  phase: number;
  questions: QuestionInfo[];
}

export function listQuestions(input: ListQuestionsInput): ListQuestionsResponse {
  const session = collaborativeStore.getSession(input.session_id);

  const questions: QuestionInfo[] = session.merged_questions.map(q => {
    // Get agent_id from question_pool
    const author_agent_id = q.author_agent_id || 'unknown';

    const subQuestions = session.sub_question_pool.filter(
      sq => sq.main_question_id === q.id
    );

    const findings = session.findings.filter(
      f => subQuestions.some(sq => sq.id === f.sub_question_id)
    );

    let status: QuestionStatus;
    if (subQuestions.length === 0) {
      status = 'needs_decomposition';
    } else if (findings.length === 0) {
      status = 'decomposed';
    } else if (findings.length < subQuestions.length) {
      status = 'investigating';
    } else {
      status = 'complete';
    }

    return {
      main_question_id: q.id,
      text: q.text,
      author_agent_id,
      status,
      sub_questions_count: subQuestions.length,
      findings_count: findings.length,
    };
  });

  return {
    session_id: session.session_id,
    phase: session.phase,
    questions,
  };
}

export const listQuestionsTool = {
  name: 'list_questions',
  description: 'List all questions in the session with IDs, status, and author. Use this to find question IDs for submit_sub_questions or to understand what work remains.',
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