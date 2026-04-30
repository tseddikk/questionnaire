/**
 * Get Workflow Guide Tool
 *
 * Tool: get_workflow_guide
 * Phase: Any
 *
 * Returns a comprehensive guide on how to interact with the questionnaire MCP.
 * This helps agents understand the audit protocol and prevents hallucinations.
 */

import type { GetWorkflowGuideResponse } from '../types/domain.js';

interface WorkflowStep {
  phase: number;
  name: string;
  description: string;
  tools: string[];
  preconditions: string[];
  expected_outcomes: string[];
}

interface RoleGuide {
  role: string;
  description: string;
  can_do: string[];
  cannot_do: string[];
  workflow_tips: string[];
}

interface CommonMistakes {
  mistake: string;
  consequence: string;
  correction: string;
}

function generateWorkflowGuide(): GetWorkflowGuideResponse {
  const phases: WorkflowStep[] = [
    {
      phase: 0,
      name: 'Session Initialization',
      description: 'Create a new audit session or join an existing one.',
      tools: ['initialize_audit', 'discover_sessions', 'join_session'],
      preconditions: ['User provides repo_path, domain, and depth'],
      expected_outcomes: [
        'New session created with unique session_id',
        'Heat map auto-generated for the repository',
        'Session ready for Phase 1 observations',
      ],
    },
    {
      phase: 1,
      name: 'Deep Discovery (Observations)',
      description: 'Submit observations about the codebase: tech stack, entry points, data flows, auth mechanisms, error patterns, test coverage, config secrets, and deployment details.',
      tools: ['submit_observations'],
      preconditions: ['Session in Phase 1', 'All observations have valid file citations'],
      expected_outcomes: [
        'Observations stored in session',
        'Phase advances to 2 when observations submitted',
      ],
    },
    {
      phase: 2,
      name: 'Generate Main Questions',
      description: 'Submit 5-7 main questions based on the domain pattern. Each question targets a specific failure pattern (e.g., VALIDATION_BYPASS, ASYNC_FAILURE).',
      tools: ['submit_question'],
      preconditions: ['Session in Phase 2', '5-7 questions required', 'Each question targets specific files with suspicion rationale'],
      expected_outcomes: [
        'Questions stored in merged_questions',
        'Phase advances to 3 after minimum questions reached',
      ],
    },
    {
      phase: 3,
      name: 'Generate Sub-Questions',
      description: 'Decompose each main question into 3-6 sub-questions with pass/fail criteria, evidence patterns, and escalation questions.',
      tools: ['submit_sub_questions'],
      preconditions: ['Session in Phase 3', 'Main question ID required', 'Each sub-question needs pass_criteria, fail_criteria, evidence_pattern, escalation_question'],
      expected_outcomes: [
        'Sub-questions stored in sub_question_pool',
        'Phase advances to 4 when ALL main questions have sub-questions',
      ],
    },
    {
      phase: 4,
      name: 'Investigation',
      description: 'Submit findings for each sub-question. Agents can also react to other agents findings (confirm/challenge/extend). Checkpoint each main question after investigation.',
      tools: ['submit_finding', 'react_to_finding', 'checkpoint', 'get_session_summary'],
      preconditions: [
        'Session in Phase 4',
        'All findings need evidence with file citations',
        'FAIL/SUSPICIOUS verdicts require escalation_finding',
        'Agents can checkpoint if they SUBMITTED findings OR REACTED to all findings',
      ],
      expected_outcomes: [
        'Findings accumulated in session',
        'Contested findings tracked for adjudication',
        'Agents checkpoint when investigation complete',
      ],
    },
    {
      phase: 5,
      name: 'Synthesis (Finalization)',
      description: 'ONLY the designated synthesizer can call finalize_report. All investigators must have checkpointed all questions.',
      tools: ['finalize_report', 'designate_synthesizer'],
      preconditions: [
        'Session in Phase 4 or 5',
        'Synthesizer designated',
        'All agents checkpointed',
        'All contested findings adjudicated',
        'At least one FAIL or SUSPICIOUS finding exists',
      ],
      expected_outcomes: [
        'Final report authorized',
        'Session archived',
      ],
    },
  ];

  const roles: RoleGuide[] = [
    {
      role: 'Investigator',
      description: 'The primary working agent. Submits observations, questions, findings, and checkpoints.',
      can_do: [
        'submit_observations',
        'submit_question',
        'submit_sub_questions',
        'submit_finding',
        'react_to_finding',
        'react_to_question',
        'checkpoint',
        'get_session_summary',
        'get_heat_map',
      ],
      cannot_do: [
        'finalize_report',
        'designate_synthesizer',
        'adjudicate_finding',
      ],
      workflow_tips: [
        'Always use file citations in observations and evidence',
        'Check get_session_summary to track your progress',
        'You can checkpoint by either submitting findings OR reacting to all existing findings',
        'Challenge findings you disagree with - provide counter-evidence',
        'Confirm findings you verify with independent evidence',
      ],
    },
    {
      role: 'Synthesizer',
      description: 'Designated report generator. The ONLY agent allowed to call finalize_report.',
      can_do: [
        'All Investigator actions',
        'finalize_report',
        'adjudicate_finding',
        'designate_synthesizer (initially)',
      ],
      cannot_do: [],
      workflow_tips: [
        'Wait for ALL investigators to checkpoint before finalizing',
        'Review contested findings and adjudicate before finalizing',
        'Generate ONE unified report - do not regenerate multiple times',
        'Check get_session_summary to verify all agents are complete',
      ],
    },
  ];

  const commonMistakes: CommonMistakes[] = [
    {
      mistake: 'Calling finalize_report without synthesizer designation',
      consequence: 'SynthesizerOnlyError thrown',
      correction: 'First call designate_synthesizer to assign the synthesizer role',
    },
    {
      mistake: 'Trying to submit findings for sub-questions that already have findings',
      consequence: 'FindingRejectedError: A finding already exists for this sub-question',
      correction: 'Use react_to_finding to confirm or challenge existing findings instead',
    },
    {
      mistake: 'Calling checkpoint before investigating a main question',
      consequence: 'CheckpointIncompleteError thrown',
      correction: 'Either submit findings for all sub-questions OR react to all existing findings first',
    },
    {
      mistake: 'Confirming findings without independent evidence',
      consequence: 'ConfirmationRequiresEvidenceError thrown',
      correction: 'Always provide independent evidence when confirming a finding',
    },
    {
      mistake: 'Bypassing Phase 1 observations',
      consequence: 'Session lacks context for meaningful investigation',
      correction: 'Submit comprehensive observations before generating questions',
    },
    {
      mistake: 'Using binary or happy-path only questions',
      consequence: 'QuestionRejectedError: Question is binary or lacks edge case targeting',
      correction: 'Write questions that probe failure modes, not just positive paths',
    },
    {
      mistake: 'Finalizing before all agents checkpoint',
      consequence: 'PreconditionsNotMet: UNINVESTIGATED_CHECKPOINTS',
      correction: 'Wait for all agents to checkpoint via get_session_summary',
    },
    {
      mistake: 'Calling submit_finding in wrong phase',
      consequence: 'PhaseViolationError: Cannot add findings in phase X',
      correction: 'Ensure session is in Phase 4 before submitting findings',
    },
  ];

  const toolUsageExamples = [
    {
      tool: 'initialize_audit',
      example: {
        input: { repo_path: '/path/to/repo', domain: 'security', depth: 'standard' },
        output: { session_id: 'uuid', status: 'ready', instructions: '...' },
      },
    },
    {
      tool: 'checkpoint',
      example: {
        input: { session_id: 'uuid', main_question_id: 'uuid', agent_id: 'investigator-1' },
        output: { status: 'checkpoint_accepted', questions_remaining: 4 },
      },
    },
    {
      tool: 'finalize_report',
      example: {
        input: { session_id: 'uuid', agent_id: 'synthesizer-agent' },
        output: { status: 'report_authorized', findings_summary: { total: 0, by_verdict: {}, by_severity: {} } },
      },
    },
  ];

  const domainPatternsExplanation = {
    summary: 'Each main question must target one of these 7 patterns based on the audit domain:',
    patterns: [
      { name: 'ASYNC_FAILURE', domain: 'performance, data_integrity', description: 'Cleanup, rollback, partial state, race conditions' },
      { name: 'ACCIDENTAL_COUPLING', domain: 'architecture', description: 'Layering violations, hidden dependencies, circular imports' },
      { name: 'VALIDATION_BYPASS', domain: 'security, compliance', description: 'Trust boundaries, defense in depth, input sanitization' },
      { name: 'IMPLICIT_MUTATION', domain: 'performance, architecture', description: 'Shared mutable state, side effects, global state' },
      { name: 'DEPENDENCY_COMPROMISE', domain: 'security', description: 'Supply chain risk, untrusted dependencies, version vulnerabilities' },
      { name: 'DATA_LEAKAGE', domain: 'security, compliance', description: 'PII exposure, secret sprawl, sensitive data in logs' },
      { name: 'INVARIANT_MISSING', domain: 'data_integrity, observability', description: 'Implicit contracts, missing guards, unvalidated assumptions' },
    ],
  };

  return {
    status: 'ok',
    version: '1.0.0',
    phases,
    roles,
    common_mistakes: commonMistakes,
    tool_usage_examples: toolUsageExamples,
    domain_patterns: domainPatternsExplanation,
  };
}

export function getWorkflowGuide(): GetWorkflowGuideResponse {
  return generateWorkflowGuide();
}

export const getWorkflowGuideTool = {
  name: 'get_workflow_guide',
  description: 'Get a comprehensive guide on how to interact with the questionnaire MCP. Returns workflow phases, role descriptions, common mistakes, and tool usage examples. Call this FIRST before starting any audit.',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
};