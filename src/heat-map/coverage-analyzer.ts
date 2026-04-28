/**
 * Coverage Analyzer
 *
 * Detects test coverage gaps using multiple strategies:
 * 1. Coverage report files (lcov, xml)
 * 2. Test file existence heuristics
 * 3. Directory structure scanning
 */

import { existsSync, readFileSync } from 'fs';
import { dirname, basename } from 'path';
import { getTrackedFiles } from './churn-analyzer.js';
import type { CoverageGapScore } from '../types/domain.js';

// ============================================================================
// Coverage Report Parsing
// ============================================================================

/**
 * Parse LCOV coverage report
 */
export function parseLcov(repoPath: string): Map<string, number> {
  const coverage = new Map<string, number>();
  const lcovPath = `${repoPath}/coverage/lcov.info`;

  if (!existsSync(lcovPath)) {
    return coverage;
  }

  try {
    const content = readFileSync(lcovPath, 'utf-8');
    const lines = content.split('\n');

    let currentFile = '';
    let hitLines = 0;
    let foundLines = 0;

    for (const line of lines) {
      if (line.startsWith('SF:')) {
        // New file section
        if (currentFile && foundLines > 0) {
          coverage.set(
            currentFile,
            Math.round((hitLines / foundLines) * 100)
          );
        }
        currentFile = line.slice(3).trim();
        hitLines = 0;
        foundLines = 0;
      } else if (line.startsWith('DA:')) {
        // DA:line,hits
        const [, hitsStr] = line.slice(3).split(',');
        const hits = parseInt(hitsStr || '0', 10);
        foundLines++;
        if (hits > 0) hitLines++;
      }
    }

    // Final file
    if (currentFile && foundLines > 0) {
      coverage.set(currentFile, Math.round((hitLines / foundLines) * 100));
    }
  } catch {
    // Ignore parse errors
  }

  return coverage;
}

/**
 * Parse Cobertura XML coverage report
 */
export function parseCobertura(repoPath: string): Map<string, number> {
  const coverage = new Map<string, number>();
  const xmlPaths = [
    `${repoPath}/coverage.xml`,
    `${repoPath}/coverage/coverage.xml`,
    `${repoPath}/cobertura.xml`,
  ];

  for (const xmlPath of xmlPaths) {
    if (!existsSync(xmlPath)) continue;

    try {
      const content = readFileSync(xmlPath, 'utf-8');
      // Simple regex extraction for line-rate
      const classMatches = content.matchAll(
        /<class[^>]+filename="([^"]+)"[^>]*>.*?<\/class>/gs
      );

      for (const match of classMatches) {
        const fileName = match[1];
        const lineRateMatch = match[0].match(/line-rate="([0-9.]+)"/);
        if (lineRateMatch && fileName) {
          const pct = Math.round(parseFloat(lineRateMatch[1]) * 100);
          coverage.set(fileName, pct);
        }
      }
    } catch {
      // Ignore parse errors
    }
  }

  return coverage;
}

// ============================================================================
// Test File Detection
// ============================================================================


/**
 * Get all test files in repository
 */
export function getTestFiles(repoPath: string): Set<string> {
  const TEST_SUFFIXES = [
    '.test.ts', '.test.tsx', '.test.js', '.test.jsx',
    '.spec.ts', '.spec.tsx', '.spec.js', '.spec.jsx',
  ];
  const testFiles = new Set<string>();

  for (const file of getTrackedFiles(repoPath)) {
    const isTest =
      TEST_SUFFIXES.some(s => file.endsWith(s)) ||
      file.includes('/__tests__/') ||
      file.includes('/tests/') ||
      file.includes('/test/') ||
      /\/test_[^/]+\.py$/.test(file) ||
      /_test\.py$/.test(file);

    if (isTest) testFiles.add(file);
  }

  return testFiles;
}

/**
 * Check if a source file has a corresponding test file
 */
export function hasCorrespondingTestFile(
  sourceFile: string,
  testFiles: Set<string>
): boolean {
  const base = basename(sourceFile).replace(/\.(ts|tsx|js|jsx|mjs|cjs|py)$/, '');
  const dir = dirname(sourceFile);

  const possibleTestPaths = [
    `${dir}/${base}.test.ts`,
    `${dir}/${base}.test.tsx`,
    `${dir}/${base}.test.js`,
    `${dir}/${base}.test.jsx`,
    `${dir}/${base}.spec.ts`,
    `${dir}/${base}.spec.tsx`,
    `${dir}/${base}.spec.js`,
    `${dir}/${base}.spec.jsx`,
    `${dir}/__tests__/${base}.ts`,
    `${dir}/__tests__/${base}.tsx`,
    `${dir}/__tests__/${base}.js`,
    `${dir}/__tests__/${base}.jsx`,
    `${dir}/test_${base}.py`,
    `${dir}/${base}_test.py`,
  ];

  return possibleTestPaths.some(path => testFiles.has(path));
}

/**
 * Detect languages in repository
 */
export function detectLanguages(repoPath: string): string[] {
  const languages: string[] = [];
  const tracked = getTrackedFiles(repoPath);

  if (existsSync(`${repoPath}/package.json`)) {
    languages.push('javascript');
    if (tracked.some(f => f.endsWith('.ts') || f.endsWith('.tsx'))) {
      languages.push('typescript');
    }
  }

  if (tracked.some(f => f.endsWith('.py'))) languages.push('python');
  if (tracked.some(f => f.endsWith('.go'))) languages.push('go');

  return languages;
}

// ============================================================================
// Coverage Gap Analysis
// ============================================================================

/**
 * Compute coverage gap score based on spec:
 * - 0 if line coverage >= 80%
 * - 25 if line coverage 50-79%
 * - 50 if line coverage 1-49%
 * - 75 if coverage report exists but file not covered
 * - 100 if no coverage data and no test file found
 */
export function computeCoverageGapScore(
  filePath: string,
  coverageData: Map<string, number>,
  testFiles: Set<string>
): CoverageGapScore {
  const lineCoverage = coverageData.get(filePath);
  const hasTest = hasCorrespondingTestFile(filePath, testFiles);
  const hasCoverageData = coverageData.size > 0;

  let score: number;
  let source: CoverageGapScore['coverage_source'];
  let lineCoveragePct: number | null;

  if (lineCoverage !== undefined) {
    // We have actual coverage data
    lineCoveragePct = lineCoverage;
    source = 'lcov';

    if (lineCoverage >= 80) {
      score = 0;
    } else if (lineCoverage >= 50) {
      score = 25;
    } else if (lineCoverage >= 1) {
      score = 50;
    } else {
      score = 75;
    }
  } else if (hasCoverageData) {
    // Coverage report exists but this file not in it
    lineCoveragePct = 0;
    source = 'lcov';
    score = 75;
  } else if (hasTest) {
    // No coverage report, but test file exists
    lineCoveragePct = null;
    source = 'test_file';
    score = 25;
  } else {
    // No coverage data, no test file
    lineCoveragePct = null;
    source = 'none';
    score = 100;
  }

  return {
    file: filePath,
    coverage_gap_score: score,
    coverage_source: source,
    line_coverage_pct: lineCoveragePct,
    has_test_file: hasTest,
  };
}

/**
 * Analyze coverage gaps for all source files
 */
export function analyzeCoverage(
  repoPath: string,
  maxFiles: number = 2000
): CoverageGapScore[] {
  const coverageData = new Map<string, number>();

  // Merge all coverage sources
  for (const [file, pct] of parseLcov(repoPath)) {
    coverageData.set(file, pct);
  }
  for (const [file, pct] of parseCobertura(repoPath)) {
    if (!coverageData.has(file)) {
      coverageData.set(file, pct);
    }
  }

  const testFiles = getTestFiles(repoPath);
  const languages = detectLanguages(repoPath);

  // Get all source files from git (respects .gitignore)
  const SOURCE_EXTS = new Set(
    languages.includes('typescript') || languages.includes('javascript')
      ? ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs']
      : languages.includes('python')
        ? ['py']
        : ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'py', 'go']
  );

  const sourceFiles = getTrackedFiles(repoPath)
    .filter(f => SOURCE_EXTS.has(f.split('.').pop()?.toLowerCase() ?? ''))
    .slice(0, maxFiles);

  return sourceFiles.map(file =>
    computeCoverageGapScore(file, coverageData, testFiles)
  );
}
