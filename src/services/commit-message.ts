import type { Change } from './git-changes';

export function commitMessage(changes: Change[]): string {
  return `vault backup: ${changes.length} changed file(s)`;
}
