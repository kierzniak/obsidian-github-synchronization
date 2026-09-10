import type { Change } from './git-changes';

/** Keep the same detailed message on every device, independent of its locale. */
export function commitMessage(changes: Change[], time = new Date()): string {
  const counts = { added: 0, modified: 0, deleted: 0 };
  for (const change of changes) counts[change.type]++;
  const summary = (['added', 'modified', 'deleted'] as const)
    .filter((type) => counts[type])
    .map((type) => `${type[0].toUpperCase()}${type.slice(1)} ${counts[type]} file(s)`)
    .join(', ');
  return `vault backup: ${summary} - ${time.toISOString()}`;
}
