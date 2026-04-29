/**
 * Heat Map Generator
 *
 * Combines churn, coupling, and coverage analysis into a composite heat score.
 * Generates the heat map that directs investigation priorities.
 */

import { analyzeChurn } from './churn-analyzer.js';
import { analyzeCoupling } from './coupling-analyzer.js';
import { analyzeCoverage } from './coverage-analyzer.js';
import type {
  AuditDomain,
  HeatMap,
  HeatMapEntry,
  HeatMapWeights,
  HeatBucket,
} from '../types/domain.js';
import { HEAT_MAP_WEIGHTS } from '../types/domain.js';

// ============================================================================
// Heat Score Computation
// ============================================================================

/**
 * Compute composite heat score for a file
 */
export function computeHeatScore(
  churnScore: number,
  couplingScore: number,
  coverageGapScore: number,
  weights: HeatMapWeights
): number {
  const score =
    churnScore * weights.churn +
    couplingScore * weights.coupling +
    coverageGapScore * weights.coverage;

  // Normalize to 0-100 range
  // Max possible: 100 * churn_weight + 100 * coupling_weight + 100 * coverage_weight = ~100
  return Math.min(100, Math.max(0, parseFloat(score.toFixed(1))));
}

/**
 * Determine bucket from heat score
 */
export function getHeatBucket(score: number): HeatBucket {
  if (score >= 75) {
    return 'critical';
  }
  if (score >= 50) {
    return 'high';
  }
  if (score >= 25) {
    return 'medium';
  }
  return 'low';
}

/**
 * Determine primary risk factor
 */
export function getPrimaryRisk(
  churnScore: number,
  couplingScore: number,
  coverageGapScore: number
): 'churn' | 'coupling' | 'coverage' {
  const scores = [
    { type: 'churn' as const, score: churnScore },
    { type: 'coupling' as const, score: couplingScore },
    { type: 'coverage' as const, score: coverageGapScore },
  ];

  scores.sort((a, b) => b.score - a.score);
  return scores[0].type;
}

// ============================================================================
// Heat Map Generation
// ============================================================================

export interface HeatMapOptions {
  repoPath: string;
  domain: AuditDomain;
  windowDays?: number;
  weights?: HeatMapWeights;
  maxFiles?: number;
}

/**
 * Generate complete heat map for a repository
 */
export async function generateHeatMap(
  options: HeatMapOptions
): Promise<HeatMap> {
  const {
    repoPath,
    domain,
    windowDays = 90,
    weights = HEAT_MAP_WEIGHTS[domain],
    maxFiles = 2000,
  } = options;

  // Run all three analyzers
  const [churnScores, couplingScores, coverageScores] = await Promise.all([
    Promise.resolve(analyzeChurn(repoPath, windowDays, maxFiles)),
    Promise.resolve(analyzeCoupling(repoPath, maxFiles)),
    Promise.resolve(analyzeCoverage(repoPath, maxFiles)),
  ]);

  // Create lookup maps
  const churnMap = new Map(churnScores.map(c => [c.file, c]));
  const couplingMap = new Map(couplingScores.map(c => [c.file, c]));
  const coverageMap = new Map(coverageScores.map(c => [c.file, c]));

  // Get union of all files
  const allFiles = new Set([
    ...churnMap.keys(),
    ...couplingMap.keys(),
    ...coverageMap.keys(),
  ]);

  // Generate entries
  const entries: HeatMapEntry[] = [];
  for (const file of allFiles) {
    const churn = churnMap.get(file);
    const coupling = couplingMap.get(file);
    const coverage = coverageMap.get(file);

    // Default scores if analysis didn't cover this file
    const churnScore = churn?.churn_score ?? 0;
    const couplingScore = coupling?.coupling_score ?? 0;
    const coverageGapScore = coverage?.coverage_gap_score ?? 50; // Medium gap if unknown

    const heatScore = computeHeatScore(
      churnScore,
      couplingScore,
      coverageGapScore,
      weights
    );

    entries.push({
      file,
      heat_score: heatScore,
      bucket: getHeatBucket(heatScore),
      churn_score: churnScore,
      coupling_score: couplingScore,
      coverage_gap_score: coverageGapScore,
      primary_risk: getPrimaryRisk(churnScore, couplingScore, coverageGapScore),
    });
  }

  // Sort by heat score descending
  entries.sort((a, b) => b.heat_score - a.heat_score);

  // Count files with coverage data
  const filesWithCoverage = entries.filter(
    e => e.coverage_gap_score < 100
  ).length;

  // Detect languages
  const languages = new Set<string>();
  for (const entry of entries) {
    const ext = entry.file.split('.').pop()?.toLowerCase();
    if (ext === 'ts' || ext === 'tsx') {
      languages.add('typescript');
    }
    if (ext === 'js' || ext === 'jsx') {
      languages.add('javascript');
    }
    if (ext === 'py') {
      languages.add('python');
    }
    if (ext === 'go') {
      languages.add('go');
    }
  }

  return {
    generated_at: new Date().toISOString(),
    repo_stats: {
      total_files_analyzed: entries.length,
      files_with_coverage_data: filesWithCoverage,
      git_window_days: windowDays,
      languages_detected: Array.from(languages),
    },
    entries,
    domain_weights_used: weights,
  };
}

/**
 * Format heat map for injection into instructions
 */
export function formatHeatMapForInstructions(heatMap: HeatMap): string {
  const critical = heatMap.entries.filter(e => e.bucket === 'critical');
  const high = heatMap.entries.filter(e => e.bucket === 'high');
  // Note: medium entries exist but not displayed in summary for brevity

  let output = `
HEAT MAP — READ BEFORE PHASE 1

The following files have been identified as high-risk based on git churn,
coupling density, and test coverage analysis. This is measurement, not
judgment. You are not required to find problems in these files. You are
required to look harder at them than you would otherwise.

`;

  if (critical.length > 0) {
    output += 'CRITICAL (investigate first, escalate everything):\n';
    for (const entry of critical.slice(0, 10)) {
      const riskDesc = `${entry.primary_risk}: extreme`;
      const coverageDesc = `coverage: ${entry.coverage_gap_score >= 75 ? 'none' : entry.coverage_gap_score + '%'}`;
      output += `${entry.file} score: ${entry.heat_score} [${riskDesc}, ${coverageDesc}]\n`;
    }
    output += '\n';
  }

  if (high.length > 0) {
    output += 'HIGH (prioritize in Phase 4):\n';
    for (const entry of high.slice(0, 10)) {
      const riskDesc = `${entry.primary_risk}: high`;
      output += `${entry.file} score: ${entry.heat_score} [${riskDesc}]\n`;
    }
    output += '\n';
  }

  output += `When generating main questions in Phase 2, you must include at least
2 questions that directly target Critical-bucket files. Sub-questions
in Phase 3 must include at least one sub-question per Critical file.

Files in the Low bucket may be read in Phase 1 but should not consume
Phase 4 investigation time unless a higher-priority finding leads there.
`;

  return output;
}
