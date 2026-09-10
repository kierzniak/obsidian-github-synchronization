import diff3 from 'diff3';
import type { MergeDriverCallback } from 'isomorphic-git';
import { SyncSettings } from '../config';

export type ResolveConflict = (
  path: string,
  local: string,
  remote: string,
  merged: string,
) => Promise<string | null>;
export class SyncConflict extends Error {
  constructor(
    message: string,
    readonly files: string[],
  ) {
    super(message);
  }
}
/** Resolve conflicting hunks and keep independent edits from both devices. */
export function mergeDriver(
  mode: SyncSettings['conflictResolutionMode'],
  resolve?: ResolveConflict,
): MergeDriverCallback {
  return async ({ path, contents: [base, local, remote] }) => {
    const lines = (text: string) => text.match(/[^\n]*\n|[^\n]+$/g) || [];
    const chunks = diff3(lines(local), lines(base), lines(remote));
    let conflicted = false;
    const merged = chunks
      .map((chunk) => {
        if (chunk.ok) return chunk.ok.join('');
        const conflict = chunk.conflict;
        if (!conflict) return '';
        if (mode === 'local') return conflict.a.join('');
        if (mode === 'remote') return conflict.b.join('');
        conflicted = true;
        return `<<<<<<< Local\n${conflict.a.join('')}\n=======\n${conflict.b.join('')}\n>>>>>>> Remote\n`;
      })
      .join('');
    if (!conflicted) return { cleanMerge: true, mergedText: merged };
    const answer = resolve ? await resolve(path, local, remote, merged) : null;
    if (answer === null)
      throw new SyncConflict(`Resolve conflicting changes in ${path}, then sync again.`, [path]);
    return { cleanMerge: true, mergedText: answer };
  };
}
