import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseSteamAppDetails } from '../frontend/core/steam';
import { agwCandidates, agwParseUrl, agwSearchUrl, normalizeRating, parseAgwPage } from '../frontend/core/agw';
import { findAnticheat } from '../frontend/core/awacy';
import { parseProton, protonUrl } from '../frontend/core/protondb';

const fx = (name: string) => readFileSync(join(import.meta.dir, 'fixtures', name), 'utf8');

describe('steam', () => {
  test('platforms and requirements', () => {
    expect(parseSteamAppDetails(fx('steam-292030.json'), 292030)?.mac).toBe(false);
    expect(parseSteamAppDetails(fx('steam-570.json'), 570)?.mac).toBe(true);
    expect(parseSteamAppDetails(fx('steam-1091500.json'), 1091500)?.mac).toBe(true);
    expect(parseSteamAppDetails(fx('steam-292030.json'), 292030)?.requirements?.recommended).toContain('RTX 2060');
    expect(parseSteamAppDetails('{"1":{"success":false}}', 1)).toBeNull();
    expect(parseSteamAppDetails('{"1":{"success":true,"data":{"platforms":{"mac":false},"pc_requirements":[]}}}', 1)).toEqual({ mac: false, requirements: null });
  });
});

describe('agw', () => {
  test('urls', () => {
    expect(agwSearchUrl(5)).toBe('https://www.applegamingwiki.com/w/api.php?action=query&list=search&srsearch=5&srwhat=text&format=json&srlimit=5');
    expect(agwParseUrl(281)).toBe('https://www.applegamingwiki.com/w/api.php?action=parse&pageid=281&prop=wikitext&format=json');
  });
  test('candidates', () => {
    expect(agwCandidates(fx('agw-search-292030.json'))[0]).toBe(281);
    expect(agwCandidates('{}')).toEqual([]);
  });
  test('page parsing', () => {
    const w = parseAgwPage(fx('agw-page-292030.json'), 292030)!;
    expect(w.main).toBe(true);
    expect(w.info).toEqual({ pageId: 281, native: null, rosetta: null, crossover: 'good', wine: 'good' });
    expect(parseAgwPage(fx('agw-page-292030.json'), 355880)?.main).toBe(false);
    expect(parseAgwPage(fx('agw-page-292030.json'), 999)).toBeNull();
    expect(parseAgwPage(fx('agw-page-570.json'), 570)!.info.rosetta).toBe('good');
    expect(parseAgwPage(fx('agw-page-1172470.json'), 1172470)!.info.crossover).toBe('broken');
    expect(parseAgwPage(fx('agw-page-1091500.json'), 1091500)!.info.native).toBe('good');
    expect(parseAgwPage(fx('agw-page-1245620.json'), 1245620)!.info).toEqual({ pageId: 1795, native: null, rosetta: null, crossover: 'good', wine: 'good' });
  });
  test('empty side field does not swallow next param', () => {
    expect(parseAgwPage(fx('agw-page-1245620.json'), 1245620)!.main).toBe(true);
    expect(parseAgwPage(fx('agw-page-1245620.json'), 1495134320)).toBeNull();
  });
  test('normalizeRating', () => {
    expect(normalizeRating(' Playable ')).toBe('good');
    expect(normalizeRating('perfect')).toBe('good');
    expect(normalizeRating('runs')).toBe('runs');
    expect(normalizeRating('Unplayable')).toBe('broken');
    expect(normalizeRating('unknown')).toBeNull();
    expect(normalizeRating('na')).toBeNull();
    expect(normalizeRating(undefined)).toBeNull();
    expect(normalizeRating('Gold')).toBeNull();
  });
});

describe('awacy', () => {
  test('lookup', () => {
    expect(findAnticheat(fx('awacy-subset.json'), 1172470)).toEqual({ status: 'Denied', anticheats: ['Easy Anti-Cheat', 'Hyperion'] });
    expect(findAnticheat(fx('awacy-subset.json'), 1245620)?.status).toBe('Supported');
    expect(findAnticheat(fx('awacy-subset.json'), 578080)?.status).toBe('Broken');
    expect(findAnticheat(fx('awacy-subset.json'), 292030)).toBeNull();
  });
});

describe('protondb', () => {
  test('summary', () => {
    expect(protonUrl(7)).toBe('https://www.protondb.com/api/v1/reports/summaries/7.json');
    expect(parseProton(fx('proton-292030.json'))?.tier).toBe('platinum');
    expect(parseProton(fx('proton-292030.json'))?.total).toBe(1876);
    expect(parseProton('{"error":"not found"}')).toBeNull();
  });
});
