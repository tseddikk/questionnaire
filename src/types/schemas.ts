/**
 * Zod Validation Schemas
 * 
 * Runtime validation for all domain types using Zod.
 * These schemas ensure data integrity across tool calls.
 */

import { z } from 'zod';
import type { 
  AuditDomain, 
  AuditDepth, 
  AuditPhase,
  Verdict, 
  Severity, 
  Confidence,
  QuestionPattern 
} from './domain.js';

// ============================================================================
// Enums
// ============================================================================

export const AuditDomainSchema = z.enum([
  'security',
  'performance',
  'architecture',
  'data_integrity',
  'observability',
  'compliance',
]) as z.ZodType<AuditDomain>;

export const AuditDepthSchema = z.enum([
  'standard',
  'deep',
  'forensic',
]) as z.ZodType<AuditDepth>;

export const AuditPhaseSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]) as z.ZodType<AuditPhase>;

export const VerdictSchema = z.enum([
  'PASS',
  'FAIL',
  'SUSPICIOUS',
  'UNCERTAIN',
]) as z.ZodType<Verdict>;

export const SeveritySchema = z.enum([
  'info',
  'warning',
  'critical',
  'catastrophic',
]) as z.ZodType<Severity>;

export const ConfidenceSchema = z.enum([
  'high',
  'medium',
  'low',
]) as z.ZodType<Confidence>;

export const QuestionPatternSchema = z.enum([
  'ASYNC_FAILURE',
  'ACCIDENTAL_COUPLING',
  'VALIDATION_BYPASS',
  'IMPLICIT_MUTATION',
  'DEPENDENCY_COMPROMISE',
  'DATA_LEAKAGE',
  'INVARIANT_MISSING',
]) as z.ZodType<QuestionPattern>;

// ============================================================================
// Tool Input Schemas
// ============================================================================

export const InitializeAuditInputSchema = z.object({
  repo_path: z.string().min(1, 'Repository path is required'),
  domain: AuditDomainSchema,
  depth: AuditDepthSchema,
});

export const TechStackEntrySchema = z.object({
  name: z.string(),
  version: z.string(),
  file_path: z.string().min(1, 'File path is required'),
});

export const EntryPointSchema = z.object({
  type: z.string(),
  location: z.string(),
  file_path: z.string().min(1, 'File path is required'),
});

export const DataFlowSchema = z.object({
  source: z.string(),
  destination: z.string(),
  transformation: z.string(),
  file_paths: z.array(z.string().min(1)).min(1, 'At least one file path required'),
});

export const AuthEntrySchema = z.object({
  mechanism: z.string(),
  location: z.string(),
  file_path: z.string().min(1, 'File path is required'),
});

export const ErrorPatternSchema = z.object({
  pattern: z.string(),
  handling: z.string(),
  file_path: z.string().min(1, 'File path is required'),
});

export const CoverageNoteSchema = z.object({
  component: z.string(),
  coverage: z.string(),
  file_path: z.string().min(1, 'File path is required'),
});

export const ConfigNoteSchema = z.object({
  key: z.string(),
  location: z.string(),
  file_path: z.string().min(1, 'File path is required'),
});

export const DeploymentNoteSchema = z.object({
  aspect: z.string(),
  detail: z.string(),
  file_path: z.string().min(1, 'File path is required'),
});

export const ObservationLogSchema = z.object({
  purpose: z.string(),
  tech_stack: z.array(TechStackEntrySchema),
  entry_points: z.array(EntryPointSchema),
  data_flows: z.array(DataFlowSchema),
  auth_mechanisms: z.array(AuthEntrySchema),
  error_patterns: z.array(ErrorPatternSchema),
  test_coverage: z.array(CoverageNoteSchema),
  config_secrets: z.array(ConfigNoteSchema),
  deployment: z.array(DeploymentNoteSchema),
});

export const SubmitObservationsInputSchema = z.object({
  session_id: z.string().uuid(),
  agent_id: z.string().min(1, 'Agent ID is required'),
  observations: ObservationLogSchema,
});

export const MainQuestionInputSchema = z.object({
  text: z.string().min(10, 'Question must be at least 10 characters'),
  target_files: z.array(z.string().min(1)).min(1, 'At least one target file required'),
  suspicion_rationale: z.string().min(20, 'Suspicion rationale must be at least 20 characters'),
  edge_case_targeted: z.string().min(10, 'Edge case must be at least 10 characters'),
  domain_pattern: QuestionPatternSchema,
});

export const SubmitQuestionInputSchema = z.object({
  session_id: z.string().uuid(),
  agent_id: z.string().min(1, 'Agent ID is required'),
  question: MainQuestionInputSchema,
});

export const SubQuestionInputSchema = z.object({
  text: z.string().min(10, 'Sub-question must be at least 10 characters'),
  target_files: z.array(z.string().min(1)).max(3, 'Maximum 3 target files allowed'),
  pass_criteria: z.string().min(10, 'Pass criteria required'),
  fail_criteria: z.string().min(10, 'Fail criteria required'),
  evidence_pattern: z.string().min(10, 'Evidence pattern required'),
  escalation_question: z.string().min(10, 'Escalation question required'),
});

export const SubmitSubQuestionsInputSchema = z.object({
  session_id: z.string().uuid(),
  main_question_id: z.string().uuid(),
  sub_questions: z.array(SubQuestionInputSchema).min(1, 'At least one sub-question required'),
});

export const EvidenceSchema = z.object({
  file_path: z.string().min(1, 'File path required'),
  line_start: z.number().int().positive(),
  line_end: z.number().int().positive(),
  snippet: z.string(),
}).refine((data) => data.line_end >= data.line_start, {
  message: 'line_end must be >= line_start',
});

export const FindingInputSchema = z.object({
  answer: z.string().min(1, 'Answer is required'),
  evidence: EvidenceSchema.nullable(),
  verdict: VerdictSchema,
  severity: SeveritySchema,
  confidence: ConfidenceSchema,
  evidence_found: z.boolean(),
  escalation_finding: z.string().nullable(),
});

export const SubmitFindingInputSchema = z.object({
  session_id: z.string().uuid(),
  sub_question_id: z.string().uuid(),
  agent_id: z.string().min(1, 'Agent ID is required'),
  finding: FindingInputSchema,
});

export const CheckpointInputSchema = z.object({
  session_id: z.string().uuid(),
  main_question_id: z.string().uuid(),
  agent_id: z.string().min(1, 'Agent ID is required'),
});

export const FinalizeReportInputSchema = z.object({
  session_id: z.string().uuid(),
  agent_id: z.string().min(1, 'Agent ID is required to verify synthesizer authorization'),
});

// ============================================================================
// Type Exports
// ============================================================================

export type InitializeAuditInput = z.infer<typeof InitializeAuditInputSchema>;
export type SubmitObservationsInput = z.infer<typeof SubmitObservationsInputSchema>;
export type SubmitQuestionInput = z.infer<typeof SubmitQuestionInputSchema>;
export type SubmitSubQuestionsInput = z.infer<typeof SubmitSubQuestionsInputSchema>;
export type SubQuestionInput = z.infer<typeof SubQuestionInputSchema>;
export type SubmitFindingInput = z.infer<typeof SubmitFindingInputSchema>;
export type CheckpointInput = z.infer<typeof CheckpointInputSchema>;
export type FinalizeReportInput = z.infer<typeof FinalizeReportInputSchema>;
