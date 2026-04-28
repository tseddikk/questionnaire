/**
 * Phase-Specific Prompts Generator
 * 
 * Generates dynamic prompts based on session state.
 */

import type { AuditSession, CollaborativeSession } from '../types/domain.js';
import { DEPTH_CONFIG } from '../types/domain.js';

// ============================================================================
// Helpers
// ============================================================================

function getObservations(session: any) {
  if (session.observations !== undefined) return session.observations;
  return session.observation_sets?.[0]?.observations || null;
}

function getMainQuestions(session: any) {
  return session.main_questions || session.merged_questions || [];
}

function getSubQuestions(session: any) {
  return session.sub_questions || session.sub_question_pool || [];
}

function getCheckpoints(session: any) {
  return session.checkpoints || session.agent_checkpoints || [];
}

// ============================================================================
// Phase 2 Prompt
// ============================================================================

/**
 * Generate Phase 2 prompt based on observations
 */
export function generatePhase2Prompt(session: AuditSession | CollaborativeSession): string {
  const config = DEPTH_CONFIG[session.depth];
  const mainQuestions = getMainQuestions(session);
  const currentCount = mainQuestions.length;
  const observations = getObservations(session);
  
  let prompt = `
================================================================================
PHASE 2: GENERATE MAIN QUESTIONS
================================================================================

Domain: ${session.domain}
Depth: ${session.depth}
Target: ${config.min_main_questions}-${config.max_main_questions} main questions

Current Progress: ${currentCount}/${config.max_main_questions} questions
`;

  if (currentCount < config.min_main_questions) {
    const remaining = config.min_main_questions - currentCount;
    prompt += `
Submit ${remaining} more question(s) to unlock Phase 3.
`;
  } else if (currentCount >= config.max_main_questions) {
    prompt += `
QUESTION INTAKE CLOSED.
Maximum ${config.max_main_questions} questions reached.
Phase 2 is complete. Proceed to Phase 3.
`;
  } else {
    const remaining = config.max_main_questions - currentCount;
    prompt += `
Phase 3 is UNLOCKED. You may:
- Submit up to ${remaining} more question(s), OR
- Proceed to Phase 3 to decompose existing questions
`;
  }

  prompt += `
--------------------------------------------------------------------------------
YOUR OBSERVATIONS SUMMARY
--------------------------------------------------------------------------------

Purpose: ${observations?.purpose || 'Not recorded'}

Tech Stack (${observations?.tech_stack?.length || 0} items):
${observations?.tech_stack?.map((s: any) => `  - ${s.name} ${s.version}`).join('\n') || '  None recorded'}

Entry Points (${observations?.entry_points?.length || 0}):
${observations?.entry_points?.map((e: any) => `  - ${e.type}: ${e.location}`).join('\n') || '  None recorded'}

Data Flows (${observations?.data_flows?.length || 0}):
${observations?.data_flows?.map((d: any) => `  - ${d.source} -> ${d.destination}`).join('\n') || '  None recorded'}

Auth Mechanisms (${observations?.auth_mechanisms?.length || 0}):
${observations?.auth_mechanisms?.map((a: any) => `  - ${a.mechanism}: ${a.location}`).join('\n') || '  None recorded'}

Error Patterns (${observations?.error_patterns?.length || 0}):
${observations?.error_patterns?.map((e: any) => `  - ${e.pattern}`).join('\n') || '  None recorded'}

Test Coverage Notes (${observations?.test_coverage?.length || 0}):
${observations?.test_coverage?.map((t: any) => `  - ${t.component}: ${t.coverage}`).join('\n') || '  None recorded'}

--------------------------------------------------------------------------------
QUESTION GENERATION GUIDANCE
--------------------------------------------------------------------------------

Generate questions that probe:
1. Hidden failure modes (not obvious from code scan)
2. Edge cases and race conditions
3. Security/integrity boundaries
4. Performance bottlenecks under load
5. Maintainability and technical debt

Each question MUST use one of these patterns:
- ASYNC_FAILURE: "What happens to [resource] when [async operation] fails?"
- ACCIDENTAL_COUPLING: "Why does [module] know about [unrelated concern]?"
- VALIDATION_BYPASS: "Where is [input] validated, and what if bypassed?"
- IMPLICIT_MUTATION: "What state does [function] mutate?"
- DEPENDENCY_COMPROMISE: "If [dependency] is compromised, what does it access?"
- DATA_LEAKAGE: "Where is [sensitive data] logged or leaked?"
- INVARIANT_MISSING: "What invariant should hold, and where is it enforced?"

Use submit_question tool for each question.
`;

  return prompt;
}

// ============================================================================
// Phase 3 Prompt
// ============================================================================

/**
 * Generate Phase 3 prompt for sub-question generation
 */
export function generatePhase3Prompt(session: AuditSession | CollaborativeSession): string {
  const config = DEPTH_CONFIG[session.depth];
  const mainQuestions = getMainQuestions(session);
  const pendingQuestions = mainQuestions.filter(
    (mq: any) => mq.sub_question_ids.length === 0
  );
  
  let prompt = `
================================================================================
PHASE 3: GENERATE SUB-QUESTIONS
================================================================================

Domain: ${session.domain}
Depth: ${session.depth}
Target: ${config.min_sub_questions}-${config.max_sub_questions} sub-questions per main question
`;

  if (pendingQuestions.length === 0) {
    prompt += `
All main questions have sub-questions.
Phase 3 is complete. Proceed to Phase 4 (Investigation).
`;
  } else {
    prompt += `
Pending Main Questions: ${pendingQuestions.length}
`;
  }

  for (const mq of pendingQuestions) {
    prompt += `
--------------------------------------------------------------------------------
MAIN QUESTION: ${mq.text}
ID: ${mq.id}
--------------------------------------------------------------------------------

Target Files: ${mq.target_files.join(', ')}
Suspicion Rationale: ${mq.suspicion_rationale}
Edge Case: ${mq.edge_case_targeted}
Pattern: ${mq.domain_pattern}

Required: ${config.min_sub_questions}-${config.max_sub_questions} sub-questions

Decompose this into answerable units:
- Each sub-question targets 1-3 specific files
- Each has clear pass/fail criteria
- Each has an escalation question for deep-dive

Use submit_sub_questions tool with main_question_id: ${mq.id}
`;
  }

  return prompt;
}

// ============================================================================
// Phase 4 Prompt
// ============================================================================

/**
 * Generate Phase 4 prompt for investigation
 */
export function generatePhase4Prompt(session: AuditSession | CollaborativeSession): string {
  let prompt = `
================================================================================
PHASE 4: INVESTIGATION
================================================================================

Domain: ${session.domain}
Depth: ${session.depth}

INVESTIGATE EACH SUB-QUESTION:
- Read the target files carefully
- Look for the evidence pattern specified
- Form a verdict with confidence
- Cite exact file paths and line numbers

WORK ETHIC:
- Do not rush. Read complex files twice.
- Cross-reference callers and callees.
- Check git history for recent changes.
- Evidence discipline: every claim needs a citation.

`;

  // Add pending sub-questions
  const mainQuestions = getMainQuestions(session);
  const allSubQuestions = getSubQuestions(session);
  const checkpoints = getCheckpoints(session);
  
  for (const mq of mainQuestions) {
    const subQuestions = allSubQuestions.filter(
      (sq: any) => sq.main_question_id === mq.id
    );
    const answeredCount = subQuestions.filter(
      (sq: any) => session.findings.some((f: any) => f.sub_question_id === sq.id)
    ).length;
    
    const isCheckpointed = checkpoints.some(
      (cp: any) => cp.main_question_id === mq.id
    );
    
    prompt += `
--------------------------------------------------------------------------------
MAIN QUESTION: ${mq.text}
--------------------------------------------------------------------------------
`;

    if (isCheckpointed) {
      prompt += `Status: CHECKPOINTED ✓\n`;
    } else {
      prompt += `Status: ${answeredCount}/${subQuestions.length} sub-questions answered\n`;
      
      for (const sq of subQuestions) {
        const hasFinding = session.findings.some(
          (f: any) => f.sub_question_id === sq.id
        );
        
        prompt += `
  Sub-Question: ${sq.text}
  ID: ${sq.id}
  Target Files: ${sq.target_files.join(', ')}
  Pass Criteria: ${sq.pass_criteria}
  Fail Criteria: ${sq.fail_criteria}
  Status: ${hasFinding ? '✓ Answered' : '○ Pending'}
`;
      }
      
      if (answeredCount === subQuestions.length) {
        prompt += `
  [READY FOR CHECKPOINT] Call checkpoint tool with main_question_id: ${mq.id}
`;
      }
    }
  }

  return prompt;
}

// ============================================================================
// Phase 5 Prompt
// ============================================================================

/**
 * Generate Phase 5 prompt for report synthesis
 */
export function generatePhase5Prompt(session: AuditSession | CollaborativeSession): string {
  const mainQuestions = getMainQuestions(session);
  const subQuestions = getSubQuestions(session);
  const summary = {
    mainQuestions: mainQuestions.length,
    subQuestions: subQuestions.length,
    findings: session.findings.length,
    verdicts: {
      PASS: session.findings.filter((f: any) => f.verdict === 'PASS').length,
      FAIL: session.findings.filter((f: any) => f.verdict === 'FAIL').length,
      SUSPICIOUS: session.findings.filter((f: any) => f.verdict === 'SUSPICIOUS').length,
      UNCERTAIN: session.findings.filter((f: any) => f.verdict === 'UNCERTAIN').length,
    },
    severities: {
      info: session.findings.filter((f: any) => f.severity === 'info').length,
      warning: session.findings.filter((f: any) => f.severity === 'warning').length,
      critical: session.findings.filter((f: any) => f.severity === 'critical').length,
    catastrophic: session.findings.filter((f: any) => f.severity === 'catastrophic').length,
  }};


  const prompt = `
================================================================================
PHASE 5: SYNTHESIZE REPORT
================================================================================

All checkpoints complete. Generate the final report.

SUMMARY:
- Main Questions: ${summary.mainQuestions}
- Sub Questions: ${summary.subQuestions}
- Total Findings: ${summary.findings}

VERDICTS:
- PASS: ${summary.verdicts.PASS}
- FAIL: ${summary.verdicts.FAIL}
- SUSPICIOUS: ${summary.verdicts.SUSPICIOUS}
- UNCERTAIN: ${summary.verdicts.UNCERTAIN}

SEVERITIES:
- Info: ${summary.severities.info}
- Warning: ${summary.severities.warning}
- Critical: ${summary.severities.critical}
- Catastrophic: ${summary.severities.catastrophic}

--------------------------------------------------------------------------------
REPORT STRUCTURE (MANDATORY)
--------------------------------------------------------------------------------

1. EXECUTIVE SUMMARY
   - Total findings by severity
   - One-sentence health assessment (blunt, no flattery)
   - Top 3 prioritized actions with file paths

2. FINDINGS BY MAIN QUESTION
   - For each main question:
     * Question text and verdict
     * Sub-question table with verdicts
     * 2-3 sentence architectural analysis
     * Specific remediation steps with line numbers

3. CROSS-CUTTING CONCERNS
   - Issues spanning multiple main questions
   - Architectural debt and systemic risks

4. REMEDIATION ROADMAP
   - Prioritized table of FAIL/SUSPICIOUS findings
   - Severity, effort estimate, impact

5. APPENDIX: METHODOLOGY
   - Domain and depth setting
   - Files examined (count and primary files)
   - Confidence level overall
   - Known gaps

TONE RULES:
- Brief on what is fine
- Exhaustive on problems
- Every recommendation cites exact file:line
- Zero vague recommendations
- No flattery

Call finalize_report to get structured data, then write the report.
`;

  return prompt;
}
