/**
 * Domain Models for Critical Questionnaire MCP
 * 
 * These types represent the core entities of the audit protocol.
 * Each type is validated using Zod schemas at runtime.
 */

// ============================================================================
// Enums and Constants
// ============================================================================

export type AuditDomain = 
  | 'security' 
  | 'performance' 
  | 'architecture' 
  | 'data_integrity' 
  | 'observability' 
  | 'compliance';

export type AuditDepth = 'standard' | 'deep' | 'forensic';

export type AuditPhase = 0 | 1 | 2 | 3 | 4 | 5;

export type Verdict = 'PASS' | 'FAIL' | 'SUSPICIOUS' | 'UNCERTAIN';

export type Severity = 'info' | 'warning' | 'critical' | 'catastrophic';

export type Confidence = 'high' | 'medium' | 'low';

export type RejectionReason =
  | 'FORBIDDEN_PATTERN'
  | 'MISSING_TARGET_FILES'
  | 'BINARY_QUESTION'
  | 'MISSING_SUSPICION_RATIONALE'
  | 'HAPPY_PATH_ONLY'
  | 'PHASE_VIOLATION'
  | 'MISSING_FILE_CITATION'
  | 'ESCALATION_REQUIRED'
  | 'CHECKPOINT_INCOMPLETE'
  | 'SUB_QUESTION_COUNT_VIOLATION';

export type QuestionPattern =
  | 'ASYNC_FAILURE'
  | 'ACCIDENTAL_COUPLING'
  | 'VALIDATION_BYPASS'
  | 'IMPLICIT_MUTATION'
  | 'DEPENDENCY_COMPROMISE'
  | 'DATA_LEAKAGE'
  | 'INVARIANT_MISSING';

// ============================================================================
// Core Entities
// ============================================================================

export interface Evidence {
  file_path: string;
  line_start: number;
  line_end: number;
  snippet: string;
}

export interface TechStackEntry {
  name: string;
  version: string;
  file_path: string;
}

export interface EntryPoint {
  type: string;
  location: string;
  file_path: string;
}

export interface DataFlow {
  source: string;
  destination: string;
  transformation: string;
  file_paths: string[];
}

export interface AuthEntry {
  mechanism: string;
  location: string;
  file_path: string;
}

export interface ErrorPattern {
  pattern: string;
  handling: string;
  file_path: string;
}

export interface CoverageNote {
  component: string;
  coverage: string;
  file_path: string;
}

export interface ConfigNote {
  key: string;
  location: string;
  file_path: string;
}

export interface DeploymentNote {
  aspect: string;
  detail: string;
  file_path: string;
}

// ============================================================================
// Observations
// ============================================================================

export interface ObservationLog {
  purpose: string;
  tech_stack: TechStackEntry[];
  entry_points: EntryPoint[];
  data_flows: DataFlow[];
  auth_mechanisms: AuthEntry[];
  error_patterns: ErrorPattern[];
  test_coverage: CoverageNote[];
  config_secrets: ConfigNote[];
  deployment: DeploymentNote[];
}

// ============================================================================
// Questions
// ============================================================================

export interface MainQuestion {
  id: string;
  text: string;
  target_files: string[];
  suspicion_rationale: string;
  edge_case_targeted: string;
  domain_pattern: QuestionPattern;
  sub_question_ids: string[];
}

export interface SubQuestion {
  id: string;
  main_question_id: string;
  text: string;
  target_files: string[];
  pass_criteria: string;
  fail_criteria: string;
  evidence_pattern: string;
  escalation_question: string;
}

// ============================================================================
// Findings
// ============================================================================

export interface Finding {
  id: string;
  sub_question_id: string;
  answer: string;
  evidence: Evidence | null;
  verdict: Verdict;
  severity: Severity;
  confidence: Confidence;
  evidence_found: boolean;
  escalation_finding: string | null;
}

export interface EscalationFinding {
  id: string;
  parent_finding_id: string;
  question: string;
  answer: string;
  evidence: Evidence | null;
  file_path: string;
}

export interface CrossCuttingSignal {
  pattern: string;
  affected_count: number;
  description: string;
}

export interface CrossCuttingConcern {
  id: string;
  description: string;
  affected_main_questions: string[];
  severity: Severity;
}

// ============================================================================
// Session State
// ============================================================================

export interface CheckpointRecord {
  main_question_id: string;
  completed_at: Date;
  cross_cutting_signals: CrossCuttingSignal[];
}

export interface FindingSummary {
  total: number;
  by_verdict: Record<Verdict, number>;
  by_severity: Record<Severity, number>;
  by_confidence: Record<Confidence, number>;
}

export interface ReportSchema {
  version: string;
  required_sections: string[];
}

export interface Report {
  executive_summary: string;
  findings_by_question: Record<string, unknown>;
  cross_cutting_concerns: CrossCuttingConcern[];
  remediation_roadmap: unknown[];
  methodology: unknown;
}

// ============================================================================
// Audit Session
// ============================================================================

export interface AuditSession {
  session_id: string;
  repo_path: string;
  domain: AuditDomain;
  depth: AuditDepth;
  phase: AuditPhase;
  observations: ObservationLog | null;
  main_questions: MainQuestion[];
  sub_questions: SubQuestion[];
  findings: Finding[];
  escalations: EscalationFinding[];
  checkpoints: CheckpointRecord[];
  report: Report | null;
  created_at: Date;
  updated_at: Date;
}

// ============================================================================
// Tool Responses
// ============================================================================

export interface InitializeResponse {
  session_id: string;
  status: 'ready';
  instructions: string;
}

export interface ObservationsResponse {
  status: 'accepted';
  phase_unlocked: 2;
  prompt: string;
}

export interface QuestionResponse {
  status: 'accepted' | 'rejected';
  question_id?: string;
  questions_accepted_so_far?: number;
  reason?: RejectionReason;
  guidance?: string;
}

export interface SubQuestionsResponse {
  status: 'accepted' | 'rejected';
  main_question_id?: string;
  reason?: RejectionReason;
  guidance?: string;
}

export interface FindingResponse {
  status: 'accepted' | 'rejected';
  finding_id?: string;
  reason?: RejectionReason;
  guidance?: string;
}

export interface CheckpointResponse {
  status: 'checkpoint_accepted' | 'incomplete';
  main_question_index?: number;
  questions_remaining?: number;
  cross_cutting_signals?: CrossCuttingSignal[];
  missing_sub_questions?: string[];
  reason?: string;
}

export interface FinalizeResponse {
  status: 'report_authorized';
  findings_summary: FindingSummary;
  cross_cutting_concerns: CrossCuttingConcern[];
  escalations: EscalationFinding[];
  report_schema: ReportSchema;
}

// ============================================================================
// Configuration
// ============================================================================

export interface DepthConfig {
  min_main_questions: number;
  max_main_questions: number;
  min_sub_questions: number;
  max_sub_questions: number;
  min_escalation_paths: number;
  require_all_escalations: boolean;
}

export const DEPTH_CONFIG: Record<AuditDepth, DepthConfig> = {
  standard: {
    min_main_questions: 5,
    max_main_questions: 7,
    min_sub_questions: 3,
    max_sub_questions: 4,
    min_escalation_paths: 1,
    require_all_escalations: false,
  },
  deep: {
    min_main_questions: 5,
    max_main_questions: 7,
    min_sub_questions: 4,
    max_sub_questions: 5,
    min_escalation_paths: 2,
    require_all_escalations: false,
  },
  forensic: {
    min_main_questions: 5,
    max_main_questions: 7,
    min_sub_questions: 5,
    max_sub_questions: 6,
    min_escalation_paths: 1,
    require_all_escalations: true,
  },
};
