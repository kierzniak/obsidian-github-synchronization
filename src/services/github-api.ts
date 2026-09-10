import { requestUrl } from 'obsidian';
import { SyncSettings } from '../config';
import { repositoryUrl } from '../paths';

export async function testConnection(settings: SyncSettings): Promise<void> {
  if (!settings.personalAccessToken.trim()) throw new Error('Enter a personal access token.');
  const repo = repositoryUrl(settings.repositoryUrl)
    .replace('https://github.com/', '')
    .replace(/\.git$/, '');
  const response = await requestUrl({
    url: `https://api.github.com/repos/${repo}`,
    throw: false,
    headers: {
      Authorization: `Bearer ${settings.personalAccessToken.trim()}`,
      Accept: 'application/vnd.github+json',
    },
  });
  if (response.status === 401) throw new Error('GitHub rejected the token.');
  if (response.status === 403 || response.status === 404)
    throw new Error('Repository unavailable. Check its name and token permissions.');
  if (response.status !== 200) throw new Error(`GitHub returned HTTP ${response.status}.`);
  if (response.json.permissions?.push === false)
    throw new Error('The token cannot push to this repository.');
}
