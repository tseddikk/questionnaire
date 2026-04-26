/**
 * Protocol Instructions Generator
 * 
 * Generates domain-specific and depth-specific instructions
 * for the agent at session initialization.
 */

import type { AuditDomain, AuditDepth } from '../types/domain.js';

// ============================================================================
// Domain-Specific Instructions
// ============================================================================

const DOMAIN_INSTRUCTIONS: Record<AuditDomain, string> = {
  security: `
SECURITY AUDIT INSTRUCTIONS

Focus Areas:
- Authentication and authorization mechanisms
- Input validation and sanitization
- Secret management and exposure
- Trust boundaries and privilege escalation paths
- Supply chain and dependency risks

Question Patterns (use these):
1. VALIDATION_BYPASS: Where is user input validated, and what happens if validation is bypassed?
2. DATA_LEAKAGE: Where is sensitive data logged, cached, or exposed?
3. DEPENDENCY_COMPROMISE: If a dependency is compromised, what data does it access?
4. INVARIANT_MISSING: What security invariant should hold, and where is it enforced?

Investigation Priority:
- Entry points first (authentication bypass)
- Data flows second (data leakage)
- Configuration third (secret exposure)
- Dependencies last (supply chain)
`,

  performance: `
PERFORMANCE AUDIT INSTRUCTIONS

Focus Areas:
- Blocking operations and event loop starvation
- Memory leaks and unbounded growth
- N+1 queries and database inefficiency
- Resource exhaustion under load
- Caching strategies

Question Patterns (use these):
1. ASYNC_FAILURE: What synchronous operations block under concurrent load?
2. IMPLICIT_MUTATION: What state changes could cause cache invalidation issues?
3. INVARIANT_MISSING: What performance invariant is assumed but not enforced?

Investigation Priority:
- Hot paths and frequent operations
- Database queries and transactions
- Memory allocation patterns
- External service calls
`,

  architecture: `
ARCHITECTURE AUDIT INSTRUCTIONS

Focus Areas:
- Layer violations and improper abstractions
- Hidden dependencies and tight coupling
- Cohesion and single responsibility
- API contracts and boundaries
- Evolution and maintainability

Question Patterns (use these):
1. ACCIDENTAL_COUPLING: Why does this module know about unrelated concerns?
2. IMPLICIT_MUTATION: What state is shared across boundaries?
3. INVARIANT_MISSING: What architectural invariant is assumed but not documented?

Investigation Priority:
- Module boundaries and imports
- Service dependencies
- Data access patterns
- Configuration propagation
`,

  data_integrity: `
DATA INTEGRITY AUDIT INSTRUCTIONS

Focus Areas:
- Transaction boundaries and atomicity
- Partial writes and orphaned records
- Race conditions and concurrent modifications
- Validation and constraint enforcement
- Data migration safety

Question Patterns (use these):
1. ASYNC_FAILURE: What happens to database state when multi-step operations fail?
2. INVARIANT_MISSING: What data invariants should hold, and where are they enforced?
3. VALIDATION_BYPASS: Can data validation be bypassed at a lower layer?

Investigation Priority:
- Write operations and transactions
- Schema constraints and validations
- Migration and transformation code
- Concurrent access patterns
`,

  observability: `
OBSERVABILITY AUDIT INSTRUCTIONS

Focus Areas:
- Silent failures and unlogged errors
- Missing metrics and monitoring gaps
- Alert fatigue and false positives
- Distributed tracing coverage
- Log quality and usefulness

Question Patterns (use these):
1. INVARIANT_MISSING: What failure modes produce no logs, metrics, or alerts?
2. ASYNC_FAILURE: What async operations have no timeout or failure notification?
3. IMPLICIT_MUTATION: What state changes are not logged or monitored?

Investigation Priority:
- Error handling paths
- Async operations and timeouts
- External service calls
- Background jobs and workers
`,

  compliance: `
COMPLIANCE AUDIT INSTRUCTIONS

Focus Areas:
- PII exposure and data handling
- Access control and audit logging
- Data retention and deletion
- Encryption in transit and at rest
- Regulatory requirements (GDPR, SOC2, etc.)

Question Patterns (use these):
1. DATA_LEAKAGE: Where is PII stored, logged, or exposed?
2. VALIDATION_BYPASS: Can access controls be bypassed?
3. INVARIANT_MISSING: What compliance invariants should hold, and where are they enforced?

Investigation Priority:
- Data storage and access patterns
- User data handling
- Log retention and PII
- Authentication and authorization
`,
};

// ============================================================================
// Depth-Specific Instructions
// ============================================================================

const DEPTH_INSTRUCTIONS: Record<AuditDepth, string> = {
  standard: `
STANDARD DEPTH (Efficient, 3-4 sub-questions per main question)

Time Budget: ~30-45 minutes per main question

Instructions:
- Focus on obvious failure modes
- Read 1-2 files per sub-question
- Document PASS/FAIL with basic evidence
- Minimum 1 escalation path per main question

Quality Threshold:
- Identify issues a mid-level engineer would catch
- Cite specific lines where problems exist
- Recommend concrete fixes
`,

  deep: `
DEEP DEPTH (Thorough, 4-5 sub-questions per main question)

Time Budget: ~60-90 minutes per main question

Instructions:
- Probe second-order effects
- Read 2-3 files per sub-question, cross-reference
- Document with git history context
- Minimum 2 escalation paths per main question

Quality Threshold:
- Identify issues a senior engineer would catch
- Trace caller/callee relationships
- Consider edge cases and race conditions
- Recommend architectural improvements
`,

  forensic: `
FORENSIC DEPTH (Exhaustive, 5-6 sub-questions per main question)

Time Budget: ~2-3 hours per main question

Instructions:
- Assume defects exist, prove otherwise
- Read 3 files per sub-question minimum
- Check git blame for recent suspicious changes
- ALL sub-questions must have escalation paths
- Document every assumption

Quality Threshold:
- Identify issues a paranoid security researcher would catch
- Exhaustive caller analysis
- Race condition hunting
- Complete error path coverage
- Every finding includes line numbers and remediation
`,
};

// ============================================================================
// Common Protocol Instructions
// ============================================================================

const COMMON_INSTRUCTIONS = `
================================================================================
CRITICAL QUESTIONNAIRE PROTOCOL - AGENT INSTRUCTIONS
================================================================================

This is a STRUCTURED AUDIT. You MUST follow the phase protocol.

PHASE 0: Initialize (COMPLETE)
- Session initialized
- Read these instructions carefully

PHASE 1: Deep Discovery
MANDATE: Read the entire codebase WITHOUT forming opinions.
- Observe and record only
- Suspend judgment
- Every observation MUST include a file path

Required Observations:
1. Primary purpose (what does this code do?)
2. Tech stack and versions
3. All entry points
4. Data flows end-to-end
5. Auth/authz mechanisms
6. Error handling patterns
7. Test coverage and quality
8. Config and secrets management
9. Deployment and infrastructure

FORBIDDEN in Phase 1:
- Opinions
- Conclusions
- Verdicts
- Questions

PHASE 2: Generate Main Questions
MANDATE: Generate 5-7 main questions based on Phase 1 observations.

Each question MUST have:
- text: The question (not binary, not happy-path)
- target_files: Specific files to investigate
- suspicion_rationale: WHY is this suspected to be broken?
- edge_case_targeted: Specific failure path being probed
- domain_pattern: One of ASYNC_FAILURE, ACCIDENTAL_COUPLING, etc.

Questions are submitted ONE AT A TIME. The server validates each.

PHASE 3: Generate Sub-Questions
MANDATE: Decompose each main question into 3-6 sub-questions.

Each sub-question MUST have:
- text: Answerable by reading 1-3 files
- target_files: 1-3 specific files
- pass_criteria: Clear PASS conditions
- fail_criteria: Clear FAIL conditions
- evidence_pattern: What to look for
- escalation_question: Follow-up if FAIL/SUSPICIOUS

PHASE 4: Investigation
MANDATE: Re-audit to answer each sub-question with FILE-LEVEL PRECISION.

Per-finding requirement:
- answer: What you found
- evidence: File path + lines + snippet (or evidence_found=false)
- verdict: PASS, FAIL, SUSPICIOUS, or UNCERTAIN
- severity: info, warning, critical, catastrophic
- confidence: high, medium, low
- escalation_finding: Required if FAIL/SUSPICIOUS

WORK ETHIC:
- Do not rush
- Read complex files twice
- Cross-reference callers and callees
- Check git history for recent changes

PHASE 5: Synthesize Report
MANDATE: Compile findings into the mandatory report structure AND DELIVER TO USER.

REPORT DELIVERY - MANDATORY:
- Save the complete report as AUDIT_REPORT.md in the repository root
- The user MUST receive a markdown file they can read and reference
- Do NOT return the report only in conversation - it must be written to disk

Report Structure (save to AUDIT_REPORT.md):
1. Executive Summary (overall health assessment)
2. Findings by Main Question (with verdicts, evidence, remediation)
3. Cross-Cutting Concerns (systemic patterns)
4. Remediation Roadmap (prioritized table)
5. Appendix: Methodology (files examined, confidence, gaps)

TONE RULES:
- Brief on what is fine
- Exhaustive on problems
- Every recommendation cites exact file paths and line numbers
- Zero vague recommendations
- No flattery
- Report filename: AUDIT_REPORT.md

================================================================================
`;

// ============================================================================
// Instruction Generator
// ============================================================================

/**
 * Generate complete instructions for an audit session
 */
export function generateInstructions(
  domain: AuditDomain,
  depth: AuditDepth
): string {
  const parts = [
    COMMON_INSTRUCTIONS,
    DOMAIN_INSTRUCTIONS[domain],
    DEPTH_INSTRUCTIONS[depth],
  ];
  
  return parts.join('\n');
}
