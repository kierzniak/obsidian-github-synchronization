# GitHub Synchronization for Obsidian

Synchronize an Obsidian vault with one GitHub repository. The plugin uses JavaScript Git and Obsidian’s filesystem and HTTP APIs; it does not require native Git, Node.js, or a CORS proxy at runtime.

## Beta releases

This build is **1.0.0-beta.5**. Install beta releases through BRAT using `kierzniak/obsidian-github-synchronization`.

Releases formerly numbered `1.1.0` through `1.1.4` are now `1.0.0-beta.1` through `1.0.0-beta.5`, in the same order. Source code, tests, and build configuration are included at each matching tag.

If you already installed a `1.1.x` build, use BRAT’s reinstall/version selection once to install **1.0.0-beta.5**, then reload the plugin. Automatic update checks treat the new numbering as an older version. Choose the latest-version setting afterward to follow future betas.

## Setup

1. Install `main.js`, `manifest.json`, and `styles.css` in your vault’s `.obsidian/plugins/obsidian-github-synchronization/` directory and enable the plugin in Community plugins.
2. Enter the repository (`owner/repository`), branch, author name/email, and a GitHub personal access token in the plugin settings. A fine-grained token needs access to that repository and **Contents: read and write**. Repository rules may impose additional requirements.
3. Select **Test connection**.
4. In **Repository setup**, choose:
   - **Import repository** downloads an existing repository into an empty vault. Existing Obsidian configuration may remain; existing notes and Git repositories prevent cloning.
   - **Initialize repository** connects existing local notes to a new repository. Then select **Sync now** to upload them.
   - For an existing Git vault, its `origin` and checked-out branch must match the settings. The plugin refuses to silently switch repositories or branches.

A configured repository change requires a separate vault or a deliberate reconfiguration with a Git client. Token, author, exclusion, conflict, and scheduler changes apply to the next operation without reloading the plugin.

## Sync behavior

**Sync** commits local changes, fetches and merges the remote branch, then pushes. **Pull** also commits local changes first so they are recoverable before remote files are applied. **Push** commits and uploads, but will not overwrite remote history if GitHub rejects the push. **Commit** only saves locally.

Use the **GitHub synchronization** ribbon icon to open a menu with **Last sync** and **Sync now**, without entering settings. On mobile, the ribbon is available from the left sidebar. The **Sync with GitHub** command remains available in the command palette and can be assigned a hotkey or mobile toolbar shortcut. Manual sync follows the same safe merge and push behavior as automatic sync.

**Last sync** appears directly below the settings sync controls and refreshes after a successful sync, pull, or push. **Sync notifications** controls successful-transfer toasts: **Always, including automatic sync** (default), **Manual sync only**, or **Off**. Errors and explicitly requested status/history remain visible.

Backup commits use the same concise format on desktop and mobile: `vault backup: 3 changed file(s)`. The message starts lowercase; dates remain in Git commit metadata. Update and reload the plugin on both devices for consistent messages; existing history is preserved.

All commands share one operation lock. Status lists pending file changes, and history displays the ten most recent commits. Failures do not advance the last-successful-transfer timestamp.

Periodic sync runs while the app is open. Sync after edits waits for three seconds of inactivity. Startup pull waits until Obsidian has loaded the vault. Returning to the app triggers sync when periodic sync or sync after edits is enabled. Listeners and timers are removed when the plugin unloads.

There is no push-on-close setting: network operations cannot reliably finish during app closure or mobile suspension. Old `pushOnClose` and unused debug settings are ignored when loading settings.

## Exclusions and attachments

- Default exclusions cover `.obsidian/**`, `.trash/**`, `.DS_Store`, and `node_modules/**`.
- Exclusions filter changes considered for commits. They never hide tracked files from Git or turn them into deletions.
- Excluded files already staged by another Git client stop the operation. Unstage them before syncing.
- Remote changes to excluded tracked files stop the merge before checkout. Resolve those changes with a Git client or deliberately adjust the exclusion. Excluding a tracked file does not erase its history.
- The plugin’s credential settings file is always excluded, even with a custom Obsidian configuration directory. If that file is already tracked, sync stops until it is removed from tracking.
- Attachments and Git objects are read and written as bytes. Same-size, rapid note edits are detected by comparing contents, rather than relying only on filesystem timestamps.
- Files above the configured size limit cause a visible failure rather than a misleading successful backup. Large repositories and attachments still consume memory during Git transfers.

## Conflicts and recovery

Independent text edits are merged automatically. For overlapping text edits, choose **Ask me**, **Prefer local edits**, or **Prefer remote edits**. Automatic preferences affect conflicting sections while retaining independent edits from both devices.

During an interactive sync, **Ask me** opens an editor with both versions and a proposed merge. Saving applies the chosen content; cancelling leaves local files and both committed versions intact. Background sync stops on a manual conflict and asks you to run an interactive sync.

Binary conflicts, modify/delete conflicts, unsupported Git merge cases, and unrelated histories stop safely for resolution with a Git client. The plugin does not force-push, invent a binary merge, or automatically erase history.

Before checkout, the plugin checks for edits made during the network operation or conflict dialog. It records the previous and target commits in `.git/obsidian-sync-checkout.json`. If a checkout is interrupted, the next operation attempts to finish it. New edits made after the interruption cause recovery to stop and preserve the files for review. Do not delete the recovery record blindly; resolve the recorded commits and working-tree changes with a Git client if recovery cannot complete.

A failed initial clone leaves its downloaded `.git` data for inspection rather than automatically deleting vault contents.

## iOS and Android

The build injects a local browser Buffer binding into dependencies that expect it, without changing Obsidian’s globals. The bundle includes that implementation and has no external runtime dependency except `obsidian`. Git and GitHub REST requests both use Obsidian’s `requestUrl`.

Automated validation runs the actual production bundle’s import, initialization, and sync operations in a sandbox without Node globals, including clone/fetch/merge/push exchanges and binary attachments through the mobile HTTP adapter. Source-level tests also cover filesystem contracts and real Git histories. This is **not a substitute for testing on a physical iPhone or iPad**. Device testing remains necessary before declaring an iOS release validated. Background sync while Obsidian is suspended is not guaranteed.

For a device smoke test, use a disposable repository to check clone, a Markdown edit, an attachment upload/download, another device’s edit, a text conflict, offline/reconnect, and app suspension during a transfer. Verify both Git history and attachment checksums.

## Privacy

Notes, attachments, commit metadata, and authentication requests are sent only to the configured GitHub repository/service. The token is stored in plaintext in Obsidian’s local plugin settings; there is no claim of encrypted credential storage. The plugin excludes that file from its own sync, but other backup or synchronization tools may copy it. There is no telemetry or third-party proxy.

## Development

Use Node.js 20 or newer and npm:

```sh
npm ci
npm run check
```

`check` runs a strict TypeScript build, lint, tests, and the mobile bundle-load check. The transport integration tests use a local native Git executable and temporary repositories; no GitHub account or network connection is needed. Set `GIT_BINARY` if Git is not available on `PATH`.

```sh
npm run dev       # Rebuild while editing
npm run format    # Format source, tests, and configuration
```

The generated `main.js` stays ignored by Git and is the file Obsidian loads. Reload the plugin after a production build.

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

Tests exercise the actual implementation with temporary vaults and real Git objects. Only Obsidian’s host API and the external network boundary are simulated.

Licensed under the [MIT License](LICENSE).
