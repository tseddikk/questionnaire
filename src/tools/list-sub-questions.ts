/**
 * List Sub-Questions Tool
 *
 * Tool: list_sub_questions
 * Phase: Any
 *
 * Returns all sub-questions for a main question, with status.
 */

import { collaborativeStore } from '../state/collaborative-store.js';

export interface ListSubQuestionsInput {
  session_id: string;
  main_question_id: string;
}

export interface SubQuestionInfo {
  sub_question_id: string;
  text: string;
  author_agent_id: string;
  pass_criteria: string;
  fail_criteria: string;
  evidence_pattern: string;
  escalation_question: string;
  has_finding: boolean;
  finding_verdict: string | null;
}

export interface ListSubQuestionsResponse {
  session_id: string;
  main_question_id: string;
  sub_questions: SubQuestionInfo[];
}

export function listSubQuestions(input: ListSubQuestionsInput): ListSubQuestionsResponse {
  const session = collaborativeStore.getSession(input.session_id);

  const subQuestions = session.sub_question_pool
    .filter(sq => sq.main_question_id === input.main_question_id)
    .map(sq => {
      const finding = session.findings.find(f => f.sub_question_id === sq.sub_question_id);

      return {
        sub_question_id: sq.sub_question_id,
        text: sq.text,
        author_agent_id: sq.agent_id,
        pass_criteria: sq.pass_criteria,
        fail_criteria: sq.fail_criteria,
        evidence_pattern: sq.evidence_pattern,
        escalation_question: sq.escalation_question,
        has_finding: !!finding,
        finding_verdict: finding?.verdict || null,
      };
    });

  return {
    session_id: session.session_id,
    main_question_id: input.main_question_id,
    sub_questions: subQuestions,
  };
}

export const listSubQuestionsTool = {
  name: 'list_sub_questions',
  description: 'List all sub-questions for a main question. Use this to find sub_question_ids for submit_finding, or to see what investigation work remains.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      session_id: {
        type: 'string' as const,
        format: 'uuid',
        description: 'Session ID',
      },
      main_question_id: {
        type: 'string' as const,
        format: 'uuid',
        description: 'Main question ID to list sub-questions for',
      },
    },
    required: ['session_id', 'main_question_id'],
  },
};