import type { FetchResult } from './rpc';
import type { TtlCache } from './cache';
import type { AgwInfo, AnticheatInfo, ProtonInfo, SteamInfo } from './types';
import { decide, type Reason, type Verdict } from './verdict';
import { compareHardware, parseRequirements, type MacProfile } from './hardware';
import { parseSteamAppDetails, steamUrl } from './steam';
import { agwCandidates, agwParseUrl, agwSearchUrl, parseAgwPage } from './agw';
import { AWACY_URL, findAnticheat } from './awacy';
import { parseProton, protonUrl } from './protondb';

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const TTL = { steam: 7 * DAY, agw: 3 * DAY, awacy: DAY, proton: 3 * DAY, error: 10 * MIN };

export type GatherDeps = {
  fetch: (url: string) => Promise<FetchResult>;
  cache: TtlCache;
  profile: MacProfile;
};

export function isNonSteamApp(appId: number): boolean {
  return appId >= 0x80000000;
}

/** Cached outcome of one source: a value, "nothing there", or a (short-lived) error. */
type Entry<T> = { s: 'ok'; v: T } | { s: 'none' } | { s: 'err'; e: string };

async function cached<T>(deps: GatherDeps, key: string, ttl: number, load: () => Promise<Entry<T>>): Promise<Entry<T>> {
  const hit = deps.cache.get(key);
  if (hit !== null) {
    try {
      return JSON.parse(hit) as Entry<T>;
    } catch {
      // corrupt entry: refetch
    }
  }
  const e = await load();
  deps.cache.set(key, JSON.stringify(e), e.s === 'err' ? TTL.error : ttl);
  return e;
}

type Body = { s: 'ok'; body: string } | { s: 'err'; e: string } | { s: 'missing' };

async function get(deps: GatherDeps, url: string): Promise<Body> {
  const r = await deps.fetch(url);
  if (r.ok === false) return { s: 'err', e: r.error };
  if (r.status === 404) return { s: 'missing' };
  if (r.status < 200 || r.status >= 300) return { s: 'err', e: `HTTP ${r.status}` };
  return { s: 'ok', body: r.body };
}

const fromBody = <T>(b: Body, parse: (body: string) => T | null, missingIsError: boolean): Entry<T> => {
  if (b.s === 'err') return b;
  if (b.s === 'missing') return missingIsError ? { s: 'err', e: 'HTTP 404' } : { s: 'none' };
  const v = parse(b.body);
  return v === null ? { s: 'none' } : { s: 'ok', v };
};

const steamSource = (appId: number, deps: GatherDeps) =>
  cached<SteamInfo>(deps, `steam:${appId}`, TTL.steam, async () =>
    fromBody(await get(deps, steamUrl(appId)), (b) => parseSteamAppDetails(b, appId), true),
  );

const agwSource = (appId: number, deps: GatherDeps) =>
  cached<AgwInfo>(deps, `agw:${appId}`, TTL.agw, async (): Promise<Entry<AgwInfo>> => {
    const search = await get(deps, agwSearchUrl(appId));
    if (search.s === 'err') return search;
    if (search.s === 'missing') return { s: 'err', e: 'HTTP 404' };
    let first: AgwInfo | null = null;
    let failure: string | null = null;
    for (const id of agwCandidates(search.body)) {
      const page = await get(deps, agwParseUrl(id));
      if (page.s === 'err') {
        failure ??= page.e;
        continue;
      }
      if (page.s === 'missing') continue;
      const parsed = parseAgwPage(page.body, appId);
      if (!parsed) continue;
      if (parsed.main) return { s: 'ok', v: parsed.info };
      first ??= parsed.info;
    }
    if (first) return { s: 'ok', v: first };
    return failure !== null ? { s: 'err', e: failure } : { s: 'none' };
  });

/** The whole AWACY file is one cache entry (raw body); it is parsed per game. */
const awacySource = (appId: number, deps: GatherDeps) =>
  cached<string>(deps, 'awacy', TTL.awacy, async () => fromBody(await get(deps, AWACY_URL), (b) => b, true)).then(
    (e): Entry<AnticheatInfo> => {
      if (e.s !== 'ok') return e;
      const v = findAnticheat(e.v, appId);
      return v ? { s: 'ok', v } : { s: 'none' };
    },
  );

const protonSource = (appId: number, deps: GatherDeps) =>
  cached<ProtonInfo>(deps, `proton:${appId}`, TTL.proton, async () =>
    fromBody(await get(deps, protonUrl(appId)), parseProton, false),
  );

export async function gatherVerdict(
  appId: number,
  deps: GatherDeps,
): Promise<{ verdict: Verdict; reasons: Reason[] }> {
  const [steam, agw, awacy, proton] = await Promise.all([
    steamSource(appId, deps),
    agwSource(appId, deps),
    awacySource(appId, deps),
    protonSource(appId, deps),
  ]);
  const errors: Reason[] = [];
  const val = <T>(e: Entry<T>, name: string): T | null => {
    if (e.s === 'err') errors.push({ source: 'Сеть', text: `${name}: ${e.e}` });
    return e.s === 'ok' ? e.v : null;
  };
  const steamInfo = val(steam, 'Steam');
  const agwInfo = val(agw, 'AppleGamingWiki');
  const anticheat = val(awacy, 'AreWeAntiCheatYet');
  const protonInfo = val(proton, 'ProtonDB');
  const req = steamInfo?.requirements;
  const hw = compareHardware(
    deps.profile,
    req?.minimum ? parseRequirements(req.minimum) : undefined,
    req?.recommended ? parseRequirements(req.recommended) : undefined,
  );
  return decide({ steam: steamInfo, agw: agwInfo, anticheat, proton: protonInfo, hw, errors });
}
