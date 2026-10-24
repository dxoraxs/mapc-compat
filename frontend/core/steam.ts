import type { SteamInfo } from './types';

export function steamUrl(appId: number): string {
  return `https://store.steampowered.com/api/appdetails?appids=${appId}&cc=us&l=en`;
}

export function parseSteamAppDetails(json: string, appId: number): SteamInfo | null {
  let root: any;
  try {
    root = JSON.parse(json);
  } catch {
    return null;
  }
  const entry = root?.[String(appId)];
  if (!entry || entry.success !== true || !entry.data) return null;
  const data = entry.data;
  const req = data.pc_requirements;
  let requirements: SteamInfo['requirements'] = null;
  if (req && !Array.isArray(req) && typeof req === 'object') {
    const r: { minimum?: string; recommended?: string } = {};
    if (typeof req.minimum === 'string') r.minimum = req.minimum;
    if (typeof req.recommended === 'string') r.recommended = req.recommended;
    if (r.minimum !== undefined || r.recommended !== undefined) requirements = r;
  }
  return { mac: data.platforms?.mac === true, requirements };
}
