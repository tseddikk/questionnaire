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
// Heat Map Types (Extension)
// ============================================================================

export interface ChurnScore {
  file: string;
  churn_score: number;
  commit_count_90d: number;
  last_modified: string;
  last_author: string;
}

export interface CouplingScore {
  file: string;
  coupling_score: number;
  inbound_count: number;
  inbound_files: string[];
  outbound_count: number;
  outbound_files: string[];
}

export interface CoverageGapScore {
  file: string;
  coverage_gap_score: number;
  coverage_source: 'lcov' | 'test_file' | 'directory_scan' | 'none';
  line_coverage_pct: number | null;
  has_test_file: boolean;
}

export type HeatBucket = 'critical' | 'high' | 'medium' | 'low';

export interface HeatMapEntry {
  file: string;
  heat_score: number;
  bucket: HeatBucket;
  churn_score: number;
  coupling_score: number;
  coverage_gap_score: number;
  primary_risk: 'churn' | 'coupling' | 'coverage';
}

export interface HeatMapWeights {
  churn: number;
  coupling: number;
  coverage: number;
}

export interface HeatMap {
  generated_at: string;
  repo_stats: {
    total_files_analyzed: number;
    files_with_coverage_data: number;
    git_window_days: number;
    languages_detected: string[];
  };
  entries: HeatMapEntry[];
  domain_weights_used: HeatMapWeights;
}

export interface HeatMapAlignment {
  critical_files_with_findings: string;
  critical_files_uninvestigated: string[];
  low_bucket_files_investigated: number;
  heat_map_predictive_accuracy: string;
}

// ============================================================================
// Collaborative Multi-Agent Types (Extension)
// ============================================================================

export type AgentId = string;
export type SessionState = 'initialized' | 'investigating' | 'pending_synthesis' | 'adjudicating' | 'finalized' | 'archived' | 'archived_incomplete';

export interface Agent {
  agent_id: AgentId;
  joined_at: Date;
  role: 'investigator' | 'synthesizer';
}

export interface ObservationSet {
  agent_id: AgentId;
  observations: ObservationLog;
  submitted_at: Date;
}

export interface AgentQuestion {
  question: MainQuestion;
  agent_id: AgentId;
}

export interface QuestionReaction {
  id: string;
  question_id: string;
  agent_id: AgentId;
  reaction_type: 'challenge_quality' | 'flag_conflict' | 'endorse';
  content: string;
  submitted_at: Date;
}

export interface AgentFinding extends Finding {
  agent_id: AgentId;
  finding_id: string;
}

export interface FindingReaction {
  id: string;
  finding_id: string;
  agent_id: AgentId;
  reaction_type: 'confirm' | 'challenge' | 'extend';
  content: string;
  evidence: Evidence | null;
  submitted_at: Date;
}

export interface AgentCheckpoint {
  agent_id: AgentId;
  main_question_id: string;
  completed_at: Date;
}

export type InvestigationStatus = 'unexamined' | 'single_agent' | 'confirmed' | 'contested' | 'resolved';

export interface InvestigationCoverage {
  sub_question_id: string;
  status: InvestigationStatus;
  agents_investigated: AgentId[];
  finding_ids: string[];
  reactions: string[];
}

export interface AdjudicationRecord {
  id: string;
  finding_id: string;
  ruling: 'uphold' | 'merge' | 'unresolved';
  upheld_agent: AgentId | null;
  reasoning: string;
  merged_finding: MergedFinding | null;
  unresolved_detail: string | null;
  adjudicated_at: Date;
}

export interface MergedFinding {
  text: string;
  evidence: Evidence[];
  verdict: Verdict;
  severity: Severity;
}

export interface UnresolvedFinding {
  finding_id: string;
  description: string;
  positions: { agent_id: AgentId; position: string; evidence: Evidence }[];
  what_would_resolve: string;
  where_information_likely_exists: string;
  severity_under_each_scenario: Record<AgentId, Severity>;
}

export interface InvestigatorStats {
  agent_id: AgentId;
  findings_submitted: number;
  confirmations_given: number;
  challenges_given: number;
  confirmation_rate: number;
}

export interface CollaborativeSession {
  session_id: string;
  repo_path: string;
  domain: AuditDomain;
  depth: AuditDepth;
  session_state: SessionState;
  phase: AuditPhase;
  created_at: Date;
  updated_at: Date;

  // Agent management
  agents: Agent[];
  synthesizer: AgentId | null;

  // Data accumulation
  observation_sets: ObservationSet[];
  heat_map: HeatMap | null;

  // Phase 2: Question generation
  question_pool: AgentQuestion[];
  question_reactions: QuestionReaction[];
  merged_questions: MainQuestion[];

  // Phase 3: Sub-questions
  sub_question_pool: SubQuestion[];
  outlier_sub_questions: SubQuestion[]; // Sub-questions only one agent generated

  // Phase 4: Investigation
  findings: AgentFinding[];
  finding_reactions: FindingReaction[];
  investigation_coverage: Map<string, InvestigationCoverage>;
  agent_checkpoints: AgentCheckpoint[];

  // Phase 5: Synthesis
  contested_findings: string[];
  adjudications: AdjudicationRecord[];
  unresolved_findings: UnresolvedFinding[];

  // Report
  report: Report | null;
}

export interface CollaborativeFinalizeResponse {
  status: 'report_authorized';
  findings_summary: FindingSummary;
  cross_cutting_concerns: CrossCuttingConcern[];
  escalations: EscalationFinding[];
  adjudications: AdjudicationRecord[];
  unresolved_findings: UnresolvedFinding[];
  heat_map_alignment: HeatMapAlignment;
  report_schema: ReportSchema;
  investigator_stats: InvestigatorStats[];
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
  heat_map: HeatMap | null; // Extension: Heat Map
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

// Default heat map weights by domain (Extension)
export const HEAT_MAP_WEIGHTS: Record<AuditDomain, HeatMapWeights> = {
  security: { churn: 0.35, coupling: 0.40, coverage: 0.25 },
  performance: { churn: 0.40, coupling: 0.35, coverage: 0.25 },
  architecture: { churn: 0.25, coupling: 0.55, coverage: 0.20 },
  data_integrity: { churn: 0.35, coupling: 0.35, coverage: 0.30 },
  observability: { churn: 0.30, coupling: 0.35, coverage: 0.35 },
  compliance: { churn: 0.25, coupling: 0.40, coverage: 0.35 },
};
