import git from 'isomorphic-git';
import { ObsidianFSAdapter } from './obsidian-fs-adapter';

const JOURNAL = '.git/obsidian-sync-checkout.json';
interface PendingCheckout {
  previous: string;
  target: string;
  branch: string;
}

/** Keep the target commit for recovery after a failed write or app suspension. Do not force checkout. */
export class Checkout {
  private options;
  constructor(
    private fs: ObsidianFSAdapter,
    private branch: string,
  ) {
    this.options = { fs, dir: '.' };
  }
  async apply(previous: string, target: string): Promise<void> {
    await git.checkout({ ...this.options, ref: target, noUpdateHead: true, dryRun: true });
    const pending: PendingCheckout = { previous, target, branch: this.branch };
    await this.fs.promises.writeFile(JOURNAL, JSON.stringify(pending));
    await this.complete(pending);
  }
  async resume(): Promise<void> {
    let text: string | Uint8Array;
    try {
      text = await this.fs.promises.readFile(JOURNAL, 'utf8');
    } catch (error) {
      if ((error as { code?: string }).code === 'ENOENT') return;
      throw error;
    }
    const pending = JSON.parse(String(text)) as PendingCheckout;
    if (
      !/^[a-f0-9]{40}$/.test(pending.previous) ||
      !/^[a-f0-9]{40}$/.test(pending.target) ||
      pending.branch !== this.branch
    ) {
      throw new Error('An interrupted checkout needs inspection with a Git client.');
    }
    const head = await git.resolveRef({ ...this.options, ref: 'HEAD' });
    if (head !== pending.previous && head !== pending.target)
      throw new Error(
        'Git history changed after an interrupted sync. Resolve it with a Git client.',
      );
    await this.checkEdits(pending);
    await this.complete(pending);
  }
  private async checkEdits(pending: PendingCheckout): Promise<void> {
    await git.walk({
      ...this.options,
      trees: [git.TREE({ ref: pending.previous }), git.TREE({ ref: pending.target })],
      map: async (path, [old, next]) => {
        if (path === '.' || (await old?.type()) === 'tree' || (await next?.type()) === 'tree')
          return;
        const before = await old?.oid();
        const after = await next?.oid();
        if (before === after) return;
        let current: string | undefined;
        try {
          current = (await git.hashBlob({ object: await this.fs.promises.readFile(path) })).oid;
        } catch (error) {
          if ((error as { code?: string }).code !== 'ENOENT') throw error;
        }
        if (current !== before && current !== after)
          throw new Error(
            `New edits to ${path} need review after an interrupted sync. Your files have been preserved.`,
          );
      },
    });
  }
  private async complete(pending: PendingCheckout): Promise<void> {
    await git.checkout({ ...this.options, ref: pending.target, noUpdateHead: true });
    await git.writeRef({
      ...this.options,
      ref: `refs/heads/${pending.branch}`,
      value: pending.target,
      force: true,
    });
    await this.fs.promises.unlink(JOURNAL);
  }
}
