/**
 * Type declarations for glob module
 */

declare module 'glob' {
  export function globSync(pattern: string, options?: { cwd?: string; absolute?: boolean }): string[];
}
