/**
 * Churn Analyzer
 *
 * Analyzes git commit history to compute churn scores per file.
 * Churn = frequency of changes weighted by recency.
 */

import { execSync } from 'child_process';
import type { ChurnScore } from '../types/domain.js';

// ============================================================================
// Churn Analysis
// ============================================================================

/**
 * Get commit history for a file within a time window
 */
export function getFileCommitHistory(
  filePath: string,
  repoPath: string,
  days: number = 90
): { hash: string; date: Date; author: string }[] {
  try {
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString().split('T')[0];

    const output = execSync(
      `git log --follow --since="${sinceStr}" --format="%H|%ai|%ae" -- "${filePath}"`,
      { cwd: repoPath, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
    );

    return output
      .trim()
      .split('\n')
      .filter(line => line.length > 0)
      .map(line => {
        const [hash, dateStr, author] = line.split('|');
        return { hash: hash!, date: new Date(dateStr!), author: author! };
      });
  } catch {
    return [];
  }
}

/**
 * Calculate recency weight based on weeks since commit
 */
export function getRecencyWeight(commitDate: Date): number {
  const now = new Date();
  const diffMs = now.getTime() - commitDate.getTime();
  const diffWeeks = diffMs / (7 * 24 * 60 * 60 * 1000);

  if (diffWeeks <= 1) return 1.0;
  if (diffWeeks <= 4) return 0.7;
  if (diffWeeks <= 8) return 0.4;
  if (diffWeeks <= 12) return 0.2;
  return 0.1;
}

/**
 * Compute churn score for a single file
 */
export function computeChurnScore(
  filePath: string,
  repoPath: string,
  days: number = 90
): ChurnScore {
  const commits = getFileCommitHistory(filePath, repoPath, days);

  let score = 0;
  let lastModified = '';
  let lastAuthor = '';

  if (commits.length > 0) {
    score = commits.reduce((sum, commit) => {
      return sum + getRecencyWeight(commit.date);
    }, 0);

    const lastCommit = commits[0];
    lastModified = lastCommit.date.toISOString().split('T')[0];
    lastAuthor = lastCommit.author;
  }

  return {
    file: filePath,
    churn_score: parseFloat(score.toFixed(1)),
    commit_count_90d: commits.length,
    last_modified: lastModified,
    last_author: lastAuthor,
  };
}

/**
 * Get list of tracked files in repository
 */
export function getTrackedFiles(repoPath: string): string[] {
  try {
    const output = execSync('git ls-files', {
      cwd: repoPath,
      encoding: 'utf-8',
      maxBuffer: 50 * 1024 * 1024,
    });

    return output.trim().split('\n').filter(f => f.length > 0);
  } catch {
    return [];
  }
}

/**
 * Analyze all files for churn
 */
export function analyzeChurn(
  repoPath: string,
  days: number = 90,
  maxFiles: number = 2000
): ChurnScore[] {
  const files = getTrackedFiles(repoPath).slice(0, maxFiles);
  return files.map(file => computeChurnScore(file, repoPath, days));
}
