# GitHub Synchronization for Obsidian

Sync an Obsidian vault with a single GitHub repository. The plugin runs Git in JavaScript and uses Obsidian’s filesystem and HTTP APIs. It needs no native Git installation, Node.js, or CORS proxy at runtime.

## Beta releases

This build is 1.0.0-beta.5. Install it through BRAT using `kierzniak/obsidian-github-synchronization`.

The releases previously numbered `1.1.0` through `1.1.4` are now `1.0.0-beta.1` through `1.0.0-beta.5`, in that order. Each tag includes the source, tests, and build configuration for that release.

If you have a `1.1.x` build installed, select and reinstall 1.0.0-beta.5 in BRAT, then reload the plugin. BRAT treats the new version number as older, so its automatic update check will not make this change. After reinstalling, choose the latest-version setting to receive future betas.

When loading older settings, the plugin ignores the `pushOnClose` field and unused debug fields.

## Setup

1. Install `main.js`, `manifest.json`, and `styles.css` in your vault’s `.obsidian/plugins/obsidian-github-synchronization/` directory and enable the plugin in Community plugins.
2. In the plugin settings, enter the repository (`owner/repository`), branch, commit author name and email, and a GitHub personal access token. A fine-grained token needs access to the repository with **Contents: read and write** permission. The repository’s rules may add other requirements.
3. Select **Test connection**.
4. In **Repository setup**, choose:
   - **Import repository** downloads an existing repository into an empty vault. You can keep the vault’s Obsidian settings, but it must contain no notes or Git repository.
   - **Initialize repository** connects existing local notes to a new repository. Then select **Sync now** to upload them.
   - If the vault already uses Git, its `origin` and checked-out branch must match the plugin settings. The plugin will not switch either for you.

To connect a different repository, use a separate vault or reconfigure the existing one with a Git client. Changes to the token, author, exclusions, conflict preferences, and sync schedule apply to the next operation. You do not need to reload the plugin.

## Sync behavior

**Sync** commits your local changes, fetches and merges the remote branch, then pushes the result. **Pull** saves local changes in a commit before applying remote files, so you can recover those edits. **Push** commits and uploads your changes; if GitHub rejects the push, it stops without overwriting remote history. **Commit** saves changes locally.

Open the **GitHub synchronization** ribbon menu to see **Last sync** or select **Sync now**. On mobile, the ribbon is in the left sidebar. You can also run **Sync with GitHub** from the command palette, assign a hotkey, or add a mobile toolbar shortcut. Manual and automatic sync use the same merge and push checks.

In settings, **Last sync** sits below the sync controls and updates after a successful sync, pull, or push. Use **Sync notifications** to choose when success toasts appear: **Always, including automatic sync** (the default), **Manual sync only**, or **Off**. Errors and status or history you request still appear.

Desktop and mobile use the commit message `vault backup: 3 changed file(s)`. The message starts lowercase, and Git records the date in the commit metadata. Update and reload both devices to use the same format. Existing history stays intact.

Only one command can run at a time. Status lists pending file changes; history shows the ten most recent commits. A failed transfer leaves the last-sync time unchanged.

Periodic sync runs while Obsidian is open. Sync after edits waits until you have stopped editing for three seconds, and startup pull waits for the vault to load. Returning to the app also triggers sync if periodic sync or sync after edits is enabled. The plugin removes its listeners and timers when it unloads.

The plugin has no push-on-close setting because network requests may not finish when the app closes or is suspended.

## Exclusions and attachments

- Default exclusions cover `.obsidian/**`, `.trash/**`, `.DS_Store`, and `node_modules/**`.
- Exclusions control which changes the plugin commits. Tracked files stay visible to Git and are not marked for deletion just because you exclude them.
- Excluded files already staged by another Git client stop the operation. Unstage them before syncing.
- If remote changes affect an excluded tracked file, the merge stops before checkout. Resolve the changes with a Git client or adjust the exclusion. The file’s history is preserved.
- The plugin always excludes its credential settings file, including when you use a custom Obsidian configuration directory. If Git already tracks that file, you must remove it from tracking before syncing.
- The plugin reads and writes attachments and Git objects as bytes. It compares file contents to detect rapid edits, including edits that leave the file size unchanged and that filesystem timestamps alone could miss.
- If a file exceeds the configured size limit, the plugin reports an error and stops the backup. Large repositories and attachments use memory during transfers.

## Conflicts and recovery

The plugin merges independent text edits automatically. For overlapping edits, choose **Ask me**, **Prefer local edits**, or **Prefer remote edits**. A preference applies only to the conflicting sections; independent edits from both devices are kept.

With **Ask me** selected, a manual sync opens an editor showing both versions and a proposed merge. Save to apply your choice, or cancel to keep the local files and both committed versions intact. If a background sync finds a conflict that needs your input, it stops and asks you to run a manual sync.

Binary conflicts, modify/delete conflicts, unsupported merges, and unrelated histories require a Git client to resolve. The plugin stops when it encounters them. It cannot merge conflicting binary files, and it never force-pushes or automatically erases history.

Before checkout, the plugin checks whether you edited files during the transfer or while the conflict dialog was open. It records the previous and target commits in `.git/obsidian-sync-checkout.json`. If checkout is interrupted, the next operation tries to finish it. Recovery stops if you have made further edits, leaving those files for review. If recovery cannot finish, use a Git client to resolve the recorded commits and working-tree changes before deleting the recovery record.

If the initial clone fails, the downloaded `.git` data and vault contents are left in place for inspection.

## iOS and Android

The build supplies a browser Buffer implementation to dependencies that need it. This binding stays inside the bundle, so Obsidian’s globals are unchanged. The only external runtime dependency is `obsidian`. Both Git transfers and GitHub REST requests use Obsidian’s `requestUrl`.

Automated tests run the production bundle’s import, initialization, and sync operations without Node globals. They exercise clone, fetch, merge, and push through the mobile HTTP adapter, including binary attachments. Source tests also check filesystem contracts and real Git histories. A release still needs testing on a physical iPhone or iPad before it can be considered validated for iOS. Sync may stop while Obsidian is suspended.

For a device smoke test, use a disposable repository. Try cloning it, editing Markdown, uploading and downloading an attachment, and receiving an edit from another device. Also check a text conflict, going offline and reconnecting, and suspending the app during a transfer. Verify the Git history and attachment checksums.

## Privacy

The plugin sends notes, attachments, commit metadata, and authentication requests only to the configured GitHub repository and service. Your token is stored as unencrypted plaintext in Obsidian’s local plugin settings. The plugin excludes that file from sync, though other backup or sync tools may copy it. The plugin has no telemetry and uses no third-party proxy.

## Development

Use Node.js 20 or newer and npm:

```sh
npm ci
npm run check
```

`check` runs the strict TypeScript build, lint, tests, and mobile bundle-load check. Transport integration tests use native Git and temporary local repositories. They need no GitHub account or network connection. Set `GIT_BINARY` if Git is unavailable on `PATH`.

```sh
npm run dev       # Rebuild while editing
npm run format    # Format source, tests, and configuration
```

Obsidian loads the generated `main.js`, which Git ignores. Reload the plugin after a production build.

### Code organization

- `src/main.ts`: Obsidian lifecycle, commands, notices, and event registration.
- `src/buffer-shim.ts`: build-time Buffer binding for browser dependencies.
- `src/config.ts`, `src/settings.ts`: settings loading and settings UI.
- `src/ui/repository-setup.ts`: first-time import and initialization flow.
- `src/ui/sync-menu.ts`: quick sync menu and shared last-sync label.
- `src/services/commit-message.ts`: consistent commit summaries across devices.
- `src/services/sync-service.ts`: operation lock, orchestration, configuration snapshots.
- `src/services/git-repository.ts`: Git operations and merge checks.
- `src/services/git-changes.ts`: content comparisons, exclusions, and staged-file checks.
- `src/services/checkout.ts`: interrupted-checkout recovery.
- `src/services/obsidian-fs-adapter.ts`: binary-safe filesystem access.
- `src/services/http.ts`, `github-api.ts`: Git transport and connection checking.
- `src/services/conflict-resolver.ts`, `src/ui/conflict-modal.ts`: merge policy and interactive resolution.
- `src/services/auto-sync.ts`: interval and debounce scheduling.

Tests run the implementation against temporary vaults and real Git objects. They simulate Obsidian’s host API and the external network boundary.

Licensed under the [MIT License](LICENSE).
