import type { AnticheatInfo } from './types';

export const AWACY_URL = 'https://raw.githubusercontent.com/AreWeAntiCheatYet/AreWeAntiCheatYet/HEAD/games.json';

const STATUSES = ['Supported', 'Running', 'Planned', 'Broken', 'Denied'];

export function findAnticheat(gamesJson: string, appId: number): AnticheatInfo | null {
  let games: any;
  try {
    games = JSON.parse(gamesJson);
  } catch {
    return null;
  }
  if (!Array.isArray(games)) return null;
  const want = String(appId);
  const g = games.find((x) => x?.storeIds?.steam !== undefined && String(x.storeIds.steam) === want);
  if (!g || !STATUSES.includes(g.status)) return null;
  return { status: g.status, anticheats: Array.isArray(g.anticheats) ? g.anticheats.map(String) : [] };
}
