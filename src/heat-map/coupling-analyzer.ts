/**
 * Coupling Analyzer
 *
 * Analyzes import/require statements to compute coupling density.
 * Inbound = files that import this file (blast radius)
 * Outbound = files this file imports (dependencies)
 */

import { readFileSync } from 'fs';
import { globSync } from 'glob';
import type { CouplingScore } from '../types/domain.js';

// ============================================================================
// Import Pattern Detection
// ============================================================================

const IMPORT_PATTERNS = {
  typescript: [
    /import\s+.*?\s+from\s+['"]([^'"]+)['"];?/g,
    /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ],
  javascript: [
    /import\s+.*?\s+from\s+['"]([^'"]+)['"];?/g,
    /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ],
  python: [
    /from\s+([\w.]+)\s+import/g,
    /import\s+([\w.]+)/g,
  ],
};

// ============================================================================
// File Resolution
// ============================================================================

/**
 * Resolve an import path to an actual file path
 */
export function resolveImportPath(
  importPath: string,
  sourceFile: string,
  repoPath: string
): string | null {
  // Skip node_modules, external packages, etc.
  if (
    importPath.startsWith('node_modules') ||
    importPath.startsWith('.pnpm') ||
    importPath.startsWith('npm:') ||
    !importPath.startsWith('.')
  ) {
    return null;
  }

  const sourceDir = sourceFile.substring(0, sourceFile.lastIndexOf('/')) || '';
  const resolved = `${sourceDir}/${importPath}`.replace(/\/+/g, '/');

  // Try common extensions
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.py', ''];
  for (const ext of extensions) {
    try {
      const fullPath = `${repoPath}/${resolved}${ext}`;
      readFileSync(fullPath);
      return `${resolved}${ext}`.replace(/^\//, '');
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * Extract imports from a file
 */
export function extractImports(
  filePath: string,
  repoPath: string,
  content: string
): string[] {
  const imports: string[] = [];
  const ext = filePath.split('.').pop()?.toLowerCase() || '';

  let patterns: RegExp[] = [];
  if (['ts', 'tsx', 'mts', 'cts'].includes(ext)) {
    patterns = IMPORT_PATTERNS.typescript;
  } else if (['js', 'jsx', 'mjs', 'cjs'].includes(ext)) {
    patterns = IMPORT_PATTERNS.javascript;
  } else if (ext === 'py') {
    patterns = IMPORT_PATTERNS.python;
  }

  for (const pattern of patterns) {
    const matches = content.matchAll(pattern);
    for (const match of matches) {
      const importPath = match[1];
      if (importPath) {
        const resolved = resolveImportPath(importPath, filePath, repoPath);
        if (resolved) {
          imports.push(resolved);
        }
      }
    }
  }

  return [...new Set(imports)]; // Dedupe
}

// ============================================================================
// Coupling Analysis
// ============================================================================

interface DependencyGraph {
  inbound: Map<string, Set<string>>;
  outbound: Map<string, Set<string>>;
}

/**
 * Build dependency graph for all files
 */
export function buildDependencyGraph(
  repoPath: string,
  maxFiles: number = 2000
): DependencyGraph {
  const files = globSync('**/*.{ts,tsx,js,jsx,mjs,cjs,py}', {
    cwd: repoPath,
    absolute: false,
  }).slice(0, maxFiles);

  const inbound = new Map<string, Set<string>>();
  const outbound = new Map<string, Set<string>>();

  // Initialize maps
  for (const file of files) {
    inbound.set(file, new Set());
    outbound.set(file, new Set());
  }

  // Build outbound dependencies
  for (const file of files) {
    try {
      const content = readFileSync(`${repoPath}/${file}`, 'utf-8');
      const imports = extractImports(file, repoPath, content);

      for (const importPath of imports) {
        if (inbound.has(importPath)) {
          outbound.get(file)?.add(importPath);
          inbound.get(importPath)?.add(file);
        }
      }
    } catch {
      // Skip unreadable files
    }
  }

  return { inbound, outbound };
}

/**
 * Compute coupling scores from dependency graph
 */
export function computeCouplingScores(
  graph: DependencyGraph
): CouplingScore[] {
  const scores: CouplingScore[] = [];

  for (const [file, inboundFiles] of graph.inbound) {
    const outboundFiles = graph.outbound.get(file) || new Set();

    const inboundCount = inboundFiles.size;
    const outboundCount = outboundFiles.size;

    // Weighted formula: inbound * 1.5 + outbound
    const couplingScore = inboundCount * 1.5 + outboundCount;

    scores.push({
      file,
      coupling_score: parseFloat(couplingScore.toFixed(1)),
      inbound_count: inboundCount,
      inbound_files: Array.from(inboundFiles).slice(0, 10), // Limit for brevity
      outbound_count: outboundCount,
      outbound_files: Array.from(outboundFiles).slice(0, 10),
    });
  }

  return scores;
}

/**
 * Analyze coupling for entire repository
 */
export function analyzeCoupling(
  repoPath: string,
  maxFiles: number = 2000
): CouplingScore[] {
  const graph = buildDependencyGraph(repoPath, maxFiles);
  return computeCouplingScores(graph);
}
