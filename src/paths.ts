import { minimatch } from 'minimatch';

export function vaultPath(input: string): string {
  const parts: string[] = [];
  for (const part of input.replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..' || part.includes('\0')) throw new Error('Invalid vault path');
    parts.push(part);
  }
  return parts.join('/');
}
export function repositoryUrl(input: string): string {
  const match = input
    .trim()
    .match(/^(?:https:\/\/github\.com\/|git@github\.com:)?([\w-]+)\/([\w.-]+?)(?:\.git)?\/?$/);
  if (!match || match[2] === '.' || match[2] === '..')
    throw new Error('Use a GitHub repository in owner/repository format.');
  return `https://github.com/${match[1]}/${match[2]}.git`;
}
export function excluded(path: string, patterns: string[], configDir = '.obsidian'): boolean {
  // Always exclude Git metadata and vault credentials, including with custom patterns.
  if (
    path === '.git' ||
    path.startsWith('.git/') ||
    path === `${configDir}/plugins/obsidian-github-synchronization/data.json`
  )
    return true;
  return patterns.some((pattern) =>
    minimatch(path, pattern.trim(), { dot: true, matchBase: true }),
  );
}
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
