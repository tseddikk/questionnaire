/**
 * Finalize Report Tool
 * 
 * Tool: finalize_report
 * Phase: 5
 * 
 * Called after all main questions are checkpointed. Returns accumulated data.
 */

import { sessionStore } from '../state/session-store.js';
import { PhaseViolationError } from '../state/errors.js';
import type { FinalizeReportInput } from '../types/schemas.js';
import type { 
  FinalizeResponse, 
  FindingSummary, 
  CrossCuttingConcern,
  Finding,
  CheckpointRecord 
} from '../types/domain.js';

// ============================================================================
// Report Generation Helpers
// ============================================================================

/**
 * Generate findings summary
 */
function generateFindingSummary(findings: Finding[]): FindingSummary {
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
  checkpoints: CheckpointRecord[]
): CrossCuttingConcern[] {
  const concerns: CrossCuttingConcern[] = [];
  const patternCounts = new Map<string, { count: number; affected: string[] }>();
  
  // Aggregate signals across all checkpoints
  for (const checkpoint of checkpoints) {
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
// Tool Implementation
// ============================================================================

/**
 * Finalize the audit and generate report data
 */
export function finalizeReport(input: FinalizeReportInput): FinalizeResponse {
  // Get session
  const session = sessionStore.getSession(input.session_id);
  
  // Validate phase - must be phase 4 (investigation complete) or 5 (already finalizing)
  if (session.phase !== 4 && session.phase !== 5) {
    throw new PhaseViolationError(
      session.phase,
      4,
      'finalize_report'
    );
  }
  
  // Check if all main questions are checkpointed
  const remaining = sessionStore.getRemainingMainQuestions(session.session_id);
  if (remaining.length > 0) {
    return {
      status: 'report_authorized',
      findings_summary: generateFindingSummary(session.findings),
      cross_cutting_concerns: [],
      escalations: session.escalations,
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
    session.phase = 5;
  }
  
  // Generate report data
  const findingsSummary = generateFindingSummary(session.findings);
  const crossCuttingConcerns = generateCrossCuttingConcerns(session.checkpoints);
  
  return {
    status: 'report_authorized',
    findings_summary: findingsSummary,
    cross_cutting_concerns: crossCuttingConcerns,
    escalations: session.escalations,
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
