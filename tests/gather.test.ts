import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gatherVerdict, isNonSteamApp } from '../frontend/core/gather';
import { TtlCache } from '../frontend/core/cache';
import { steamUrl } from '../frontend/core/steam';
import { agwParseUrl, agwSearchUrl } from '../frontend/core/agw';
import { AWACY_URL } from '../frontend/core/awacy';
import { protonUrl } from '../frontend/core/protondb';
import { DEFAULT_PROFILE } from '../frontend/core/hardware';
import type { FetchResult } from '../frontend/core/rpc';

const fx = (name: string) => readFileSync(join(import.meta.dir, 'fixtures', name), 'utf8');
const MIN = 60_000;

function deps(opts: { fail?: string; status?: number; failStatusHost?: string } = {}) {
  const bodies = new Map<string, string>();
  bodies.set(steamUrl(292030), fx('steam-292030.json'));
  bodies.set(agwSearchUrl(292030), fx('agw-search-292030.json'));
  bodies.set(agwParseUrl(281), fx('agw-page-292030.json'));
  bodies.set(agwSearchUrl(777), '{"query":{"search":[]}}');
  bodies.set(AWACY_URL, fx('awacy-subset.json'));
  bodies.set(protonUrl(292030), fx('proton-292030.json'));
  const hits: string[] = [];
  const store = new Map<string, string>();
  let t = 1_000_000;
  const d = {
    fetch: async (url: string): Promise<FetchResult> => {
      hits.push(url);
      const host = new URL(url).host;
      if (opts.fail && host === opts.fail) return { ok: false, error: 'timeout' };
      if (opts.failStatusHost && host === opts.failStatusHost) return { ok: true, status: opts.status ?? 500, body: '' };
      const body = bodies.get(url);
      return body === undefined ? { ok: true, status: 404, body: '' } : { ok: true, status: 200, body };
    },
    cache: new TtlCache(
      { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v) },
      () => t,
    ),
    profile: DEFAULT_PROFILE,
    calls: () => hits.length,
    hitsTo: (host: string) => hits.filter((u) => new URL(u).host === host).length,
    advance: (ms: number) => void (t += ms),
    store,
  };
  return d;
}

describe('gather', () => {
  test('witcher end to end', async () => expect((await gatherVerdict(292030, deps())).verdict).toBe('ok'));

  test('second call served from cache', async () => {
    const d = deps();
    await gatherVerdict(292030, d);
    const n = d.calls();
    await gatherVerdict(292030, d);
    expect(d.calls()).toBe(n);
  });

  test('keys use prefix', async () => {
    const d = deps();
    await gatherVerdict(292030, d);
    expect(d.store.size).toBeGreaterThan(0);
    for (const k of d.store.keys()) expect(k.startsWith('mapc-compat:')).toBe(true);
  });

  test('one source down still decides', async () => {
    const r = await gatherVerdict(292030, deps({ fail: 'store.steampowered.com' }));
    expect(r.verdict).toBe('ok');
    expect(r.reasons.some((x) => x.source === 'Сеть')).toBe(true);
  });

  test('HTTP 429 and 500 count as errors', async () => {
    for (const status of [429, 500]) {
      const r = await gatherVerdict(292030, deps({ failStatusHost: 'www.protondb.com', status }));
      expect(r.reasons.some((x) => x.source === 'Сеть' && x.text.includes('ProtonDB'))).toBe(true);
    }
  });

  test('protondb 404 is no data, not an error', async () => {
    const d = deps();
    const r = await gatherVerdict(1, d);
    expect(r.reasons.some((x) => x.text.includes('ProtonDB') && x.source === 'Сеть')).toBe(false);
  });

  test('error cached 10 minutes only', async () => {
    const d = deps({ fail: 'store.steampowered.com' });
    await gatherVerdict(292030, d);
    expect(d.hitsTo('store.steampowered.com')).toBe(1);
    d.advance(5 * MIN);
    await gatherVerdict(292030, d);
    expect(d.hitsTo('store.steampowered.com')).toBe(1);
    d.advance(6 * MIN);
    await gatherVerdict(292030, d);
    expect(d.hitsTo('store.steampowered.com')).toBe(2);
  });

  test('missing AGW page is cached', async () => {
    const d = deps();
    await gatherVerdict(777, d);
    expect(d.hitsTo('www.applegamingwiki.com')).toBe(1);
    d.advance(2 * 24 * 60 * MIN);
    await gatherVerdict(777, d);
    expect(d.hitsTo('www.applegamingwiki.com')).toBe(1);
  });

  test('success expires after ttl', async () => {
    const d = deps();
    await gatherVerdict(292030, d);
    const n = d.hitsTo('store.steampowered.com');
    d.advance(8 * 24 * 60 * MIN);
    await gatherVerdict(292030, d);
    expect(d.hitsTo('store.steampowered.com')).toBe(n + 1);
  });

  test('non-steam shortcut', () => {
    expect(isNonSteamApp(0x80000001)).toBe(true);
    expect(isNonSteamApp(292030)).toBe(false);
  });
});
