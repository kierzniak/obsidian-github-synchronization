export interface SyncSettings {
  repositoryUrl: string;
  personalAccessToken: string;
  branch: string;
  authorName: string;
  authorEmail: string;
  autoSyncEnabled: boolean;
  autoSyncInterval: number;
  pullOnStartup: boolean;
  syncOnFileChange: boolean;
  excludePatterns: string[];
  maxFileSize: number;
  conflictResolutionMode: 'manual' | 'local' | 'remote';
  syncNotifications: 'always' | 'manual' | 'off';
  lastSyncTime: number;
}
export const DEFAULT_SETTINGS: SyncSettings = {
  repositoryUrl: '',
  personalAccessToken: '',
  branch: 'main',
  authorName: '',
  authorEmail: '',
  autoSyncEnabled: false,
  autoSyncInterval: 5,
  pullOnStartup: false,
  syncOnFileChange: false,
  excludePatterns: ['.obsidian/**', '.trash/**', '.DS_Store', 'node_modules/**'],
  maxFileSize: 100 * 1024 * 1024,
  conflictResolutionMode: 'manual',
  syncNotifications: 'always',
  lastSyncTime: 0,
};
export function loadSettings(data: Partial<SyncSettings> | null): SyncSettings {
  const settings: SyncSettings = {
    ...DEFAULT_SETTINGS,
    excludePatterns: [...DEFAULT_SETTINGS.excludePatterns],
  };
  if (!data || typeof data !== 'object') return settings;
  for (const key of [
    'repositoryUrl',
    'personalAccessToken',
    'branch',
    'authorName',
    'authorEmail',
  ] as const) {
    if (typeof data[key] === 'string') settings[key] = data[key]!;
  }
  for (const key of ['autoSyncEnabled', 'pullOnStartup', 'syncOnFileChange'] as const) {
    if (typeof data[key] === 'boolean') settings[key] = data[key]!;
  }
  if (Array.isArray(data.excludePatterns))
    settings.excludePatterns = data.excludePatterns.filter(
      (p): p is string => typeof p === 'string',
    );
  if (
    typeof data.autoSyncInterval === 'number' &&
    Number.isFinite(data.autoSyncInterval) &&
    data.autoSyncInterval >= 1 &&
    data.autoSyncInterval <= 1440
  )
    settings.autoSyncInterval = data.autoSyncInterval;
  if (
    typeof data.maxFileSize === 'number' &&
    Number.isFinite(data.maxFileSize) &&
    data.maxFileSize > 0
  )
    settings.maxFileSize = data.maxFileSize;
  if (['always', 'manual', 'off'].includes(data.syncNotifications || ''))
    settings.syncNotifications = data.syncNotifications!;
  if (typeof data.lastSyncTime === 'number' && Number.isFinite(data.lastSyncTime))
    settings.lastSyncTime = data.lastSyncTime;
  if (data.conflictResolutionMode === 'local' || data.conflictResolutionMode === 'remote')
    settings.conflictResolutionMode = data.conflictResolutionMode;
  return settings;
}
