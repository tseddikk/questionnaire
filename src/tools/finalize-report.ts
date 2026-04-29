/**
 * Finalize Report Tool
 * 
 * Tool: finalize_report
 * Phase: 5
 * 
 * Called after all main questions are checkpointed. Returns accumulated data.
 */

import { collaborativeStore } from '../state/collaborative-store.js';
import { PhaseViolationError } from '../state/errors.js';
import type { FinalizeReportInput } from '../types/schemas.js';
import type { 
  FinalizeResponse, 
  FindingSummary, 
  CrossCuttingConcern,
  Finding,
  AgentFinding,
  CheckpointRecord,
  AgentCheckpoint
} from '../types/domain.js';

// ============================================================================
// Report Generation Helpers
// ============================================================================

/**
 * Generate findings summary
 */
function generateFindingSummary(findings: (Finding | AgentFinding)[]): FindingSummary {
  const total = findings.length;
  
  const byVerdict = {
    PASS: findings.filter(f => f.verdict === 'PASS').length,
    FAIL: findings.filter(f => f.verdict === 'FAIL').length,
    SUSPICIOUS: findings.filter(f => f.verdict === 'SUSPICIOUS').length,
    UNCERTAIN: findings.filter(f => f.verdict === 'UNCERTAIN').length,
  };
  
  const bySeverity = {
    info: findings.filter(f => f.severity === 'info').length,
    warning: findings.filter(f => f.severity === 'warning').length,
    critical: findings.filter(f => f.severity === 'critical').length,
    catastrophic: findings.filter(f => f.severity === 'catastrophic').length,
  };
  
  const byConfidence = {
    high: findings.filter(f => f.confidence === 'high').length,
    medium: findings.filter(f => f.confidence === 'medium').length,
    low: findings.filter(f => f.confidence === 'low').length,
  };
  
  return {
    total,
    by_verdict: byVerdict,
    by_severity: bySeverity,
    by_confidence: byConfidence,
  };
}

/**
 * Generate cross-cutting concerns from signals
 */
function generateCrossCuttingConcerns(
  checkpoints: (CheckpointRecord | AgentCheckpoint)[]
): CrossCuttingConcern[] {
  const concerns: CrossCuttingConcern[] = [];
  const patternCounts = new Map<string, { count: number; affected: string[] }>();
  
  // Aggregate signals across all checkpoints
  for (const checkpoint of checkpoints) {
    // Only CheckpointRecord has cross_cutting_signals
    if ('cross_cutting_signals' in checkpoint) {
      for (const signal of checkpoint.cross_cutting_signals) {
        const existing = patternCounts.get(signal.pattern);
        if (existing) {
          existing.count += signal.affected_count;
          if (!existing.affected.includes(checkpoint.main_question_id)) {
            existing.affected.push(checkpoint.main_question_id);
          }
        } else {
          patternCounts.set(signal.pattern, {
            count: signal.affected_count,
            affected: [checkpoint.main_question_id],
          });
        }
      }
    }
  }
  
  // Generate concerns from aggregated patterns
  for (const [pattern, data] of patternCounts) {
    if (data.affected.length >= 2 || data.count >= 3) {
      let description = '';
      let severity: 'warning' | 'critical' | 'catastrophic' = 'warning';
      
      switch (pattern) {
        case 'MISSING_CLEANUP':
          description = `Missing resource cleanup detected across ${data.affected.length} main questions. This pattern suggests systemic resource management issues.`;
          severity = data.affected.length >= 3 ? 'critical' : 'warning';
          break;
        case 'ERROR_HANDLING_GAP':
          description = `Error handling gaps found in ${data.affected.length} areas. This indicates incomplete error propagation or recovery mechanisms.`;
          severity = 'critical';
          break;
        case 'UNVALIDATED_INPUT':
          description = `Input validation issues span ${data.affected.length} components. This represents a systemic security or integrity risk.`;
          severity = data.affected.length >= 3 ? 'catastrophic' : 'critical';
          break;
        case 'RESOURCE_LEAK':
          description = `Resource leaks detected across ${data.affected.length} components. This will cause stability issues under load.`;
          severity = data.affected.length >= 3 ? 'critical' : 'warning';
          break;
        case 'SILENT_FAILURE':
          description = `Silent failure patterns found in ${data.affected.length} areas. These make debugging and monitoring impossible.`;
          severity = 'critical';
          break;
        default:
          description = `Pattern '${pattern}' detected across ${data.affected.length} main questions.`;
      }
      
      concerns.push({
        id: `cc-${pattern.toLowerCase()}`,
        description,
        affected_main_questions: data.affected,
        severity,
      });
    }
  }
  
  return concerns;
}

// ============================================================================
// Collaborative Preconditions (Extension)
// ============================================================================

interface PreconditionFailure {
  condition: string;
  detail: string;
  action: string;
}

/**
 * Check collaborative preconditions before finalization
 * Returns array of failed preconditions or empty array if all pass
 */
function checkCollaborativePreconditions(sessionId: string): PreconditionFailure[] {
  const session = collaborativeStore.getSession(sessionId);
  const failures: PreconditionFailure[] = [];

  // Precondition 1: Synthesizer must be designated
  if (!session.synthesizer) {
    failures.push({
      condition: 'NO_SYNTHESIZER_DESIGNATED',
      detail: 'No agent has been designated as Synthesizer.',
      action: 'Call designate_synthesizer to assign a Synthesizer.',
    });
  }

  // Precondition 2: All investigators must have checkpointed all questions
  const investigatorAgents = session.agents.filter(a => a.role === 'investigator');
  for (const agent of investigatorAgents) {
    const agentCheckpoints = session.agent_checkpoints.filter(
      cp => cp.agent_id === agent.agent_id
    );
    const checkpointedCount = new Set(agentCheckpoints.map(cp => cp.main_question_id)).size;
    const totalQuestions = session.merged_questions.length;

    if (checkpointedCount < totalQuestions) {
      failures.push({
        condition: 'UNINVESTIGATED_CHECKPOINTS',
        detail: `${agent.agent_id} has not checkpointed ${totalQuestions - checkpointedCount} main question(s).`,
        action: `${agent.agent_id} must submit findings for remaining sub-questions and call checkpoint.`,
      });
    }
  }

  // Precondition 3: All contested findings must be adjudicated
  if (session.contested_findings.length > 0) {
    for (const findingId of session.contested_findings) {
      const finding = session.findings.find(f => f.finding_id === findingId);
      failures.push({
        condition: 'UNRESOLVED_CONTESTED_FINDINGS',
        detail: `Finding ${findingId} (${finding?.answer?.substring(0, 50) || 'Unknown'}...) is contested and has not been adjudicated.`,
        action: `Call adjudicate_finding for ${findingId} before finalizing.`,
      });
    }
  }

  // Precondition 4: At least one FAIL or SUSPICIOUS finding exists
  const hasCriticalFindings = session.findings.some(
    f => f.verdict === 'FAIL' || f.verdict === 'SUSPICIOUS'
  );
  if (!hasCriticalFindings) {
    failures.push({
      condition: 'NO_CRITICAL_FINDINGS',
      detail: 'No FAIL or SUSPICIOUS findings exist in the session.',
      action: 'Continue investigation until critical findings are identified.',
    });
  }

  return failures;
}

// ============================================================================
// Tool Implementation
// ============================================================================

/**
 * Finalize the audit and generate report data
 * Extended with collaborative preconditions
 */
export function finalizeReport(input: FinalizeReportInput): FinalizeResponse {
  // Get session from collaborative store
  const session = collaborativeStore.getSession(input.session_id);

  // Validate phase - must be phase 4 (investigation complete) or 5 (already finalizing)
  if (session.phase !== 4 && session.phase !== 5) {
    throw new PhaseViolationError(
      'finalize_report',
      session.phase,
      4,
      session
    );
  }

  // Check collaborative preconditions
  const preconditionFailures = checkCollaborativePreconditions(input.session_id);
  if (preconditionFailures.length > 0) {
    return {
      status: 'rejected',
      reason: 'PRECONDITIONS_NOT_MET',
      failed_preconditions: preconditionFailures,
      guidance: 'All preconditions must be satisfied before finalizing.',
    } as unknown as FinalizeResponse;
  }

  // Check if all main questions are checkpointed
  const remaining = collaborativeStore.getUncheckpointedMainQuestions(session.session_id);
  if (remaining.length > 0) {
    return {
      status: 'report_authorized',
      findings_summary: generateFindingSummary(session.findings),
      cross_cutting_concerns: [],
      escalations: [],
      report_schema: {
        version: '1.0',
        required_sections: [
          'executive_summary',
          'findings_by_main_question',
          'cross_cutting_concerns',
          'remediation_roadmap',
          'appendix_methodology',
        ],
      },
    };
  }

  // Ensure phase is 5
  if (session.phase === 4) {
    collaborativeStore.advancePhase(session.session_id, 5);
  }

  // Generate report data
  const findingsSummary = generateFindingSummary(session.findings);
  const crossCuttingConcerns = generateCrossCuttingConcerns(session.agent_checkpoints);

  // Calculate heat map alignment if heat map exists
  let heatMapAlignment = null;
  if (session.heat_map) {
    const criticalFiles = session.heat_map.entries.filter(e => e.bucket === 'critical');
    const criticalWithFindings = criticalFiles.filter(cf =>
      session.findings.some(f => f.evidence?.file_path?.includes(cf.file))
    );

    heatMapAlignment = {
      critical_files_with_findings: `${criticalWithFindings.length}/${criticalFiles.length}`,
      critical_files_uninvestigated: criticalFiles
        .filter(cf => !session.findings.some(f => f.evidence?.file_path?.includes(cf.file)))
        .map(e => e.file),
      low_bucket_files_investigated: 0, // Would need to track
      heat_map_predictive_accuracy: 'high', // Placeholder
    };
  }

  return {
    status: 'report_authorized',
    findings_summary: findingsSummary,
    cross_cutting_concerns: crossCuttingConcerns,
    escalations: [],
    heat_map_alignment: heatMapAlignment,
    adjudications: session.adjudications,
    unresolved_findings: session.unresolved_findings,
    report_schema: {
      version: '1.0',
      required_sections: [
        'executive_summary',
        'findings_by_main_question',
        'cross_cutting_concerns',
        'remediation_roadmap',
        'appendix_methodology',
        'collaborative_metadata',
        'investigator_performance',
        'unresolved_findings',
      ],
    },
  };
}

// ============================================================================
// MCP Tool Definition
// ============================================================================

export const finalizeReportTool = {
  name: 'finalize_report',
  description: 'Finalize the audit and get report data (Phase 5). Call after all checkpoints.',
  inputSchema: {
    type: 'object',
    properties: {
      session_id: {
        type: 'string',
        format: 'uuid',
        description: 'Session ID',
      },
    },
    required: ['session_id'],
  },
};
