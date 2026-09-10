import git from 'isomorphic-git';
import { SyncSettings } from '../config';
import { excluded } from '../paths';
import { ObsidianFSAdapter } from './obsidian-fs-adapter';

export interface Change {
  path: string;
  type: 'added' | 'modified' | 'deleted';
}

/** Compare file contents to catch edits that mobile timestamps can miss. */
export async function getChanges(
  fs: ObsidianFSAdapter,
  settings: SyncSettings,
  configDir: string,
  head: string | null,
): Promise<Change[]> {
  const options = { fs, dir: '.' };

  const matrix = await git.statusMatrix(options);
  const heads = new Map<string, string>();
  const staged = new Map<string, string>();
  await git.walk({
    ...options,
    trees: head ? [git.TREE({ ref: head }), git.STAGE()] : [git.STAGE()],
    map: async (path, entries) => {
      const [previous, stage] = head ? entries : [null, entries[0]];
      if ((await previous?.type()) === 'blob') heads.set(path, await previous!.oid());
      if ((await stage?.type()) === 'blob') staged.set(path, await stage!.oid());
    },
  });
  const changes: Change[] = [];
  for (const [path, , work] of matrix) {
    const previous = heads.get(path);
    const stage = staged.get(path);
    if (
      path === `${configDir}/plugins/obsidian-github-synchronization/data.json` &&
      (previous || stage)
    )
      throw new Error(
        'Plugin credentials are tracked by Git. Remove this settings file from tracking before syncing.',
      );
    if (excluded(path, settings.excludePatterns, configDir)) {
      if (stage !== previous)
        throw new Error(`Excluded file is already staged: ${path}. Unstage it before syncing.`);
      continue;
    }
    let working: string | undefined;
    if (work !== 0) {
      const stat = await fs.promises.stat(path);
      if (stat.size > settings.maxFileSize)
        throw new Error(`File exceeds the sync size limit: ${path}`);
      // Git's stat cache can miss edits when mobile timestamps have low precision.
      const bytes = await fs.promises.readFile(path);
      working = (await git.hashBlob({ object: bytes })).oid;
    }
    if (previous === working && stage === previous) continue;
    if (stage !== previous && stage !== working)
      throw new Error(`Finish or unstage external Git changes to ${path} before syncing.`);
    changes.push({
      path,
      type: working === undefined ? 'deleted' : previous === undefined ? 'added' : 'modified',
    });
  }
  return changes;
}

export async function changedFiles(
  fs: ObsidianFSAdapter,
  from: string,
  to: string,
): Promise<string[]> {
  const options = { fs, dir: '.' };

  const changed: string[] = [];
  await git.walk({
    ...options,
    trees: [git.TREE({ ref: from }), git.TREE({ ref: to })],
    map: async (path, [a, b]) => {
      if (path === '.') return;
      if ((await a?.type()) === 'tree' || (await b?.type()) === 'tree') return;
      if ((await a?.oid()) !== (await b?.oid())) changed.push(path);
    },
  });
  return changed;
}
