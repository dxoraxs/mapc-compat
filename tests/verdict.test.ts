import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseSteamAppDetails } from '../frontend/core/steam';
import { agwCandidates, parseAgwPage } from '../frontend/core/agw';
import { findAnticheat } from '../frontend/core/awacy';
import { parseProton } from '../frontend/core/protondb';
import type { HwVerdict } from '../frontend/core/hardware';
import { VERDICT_LABEL, decide, type Inputs } from '../frontend/core/verdict';

const fx = (name: string) => readFileSync(join(import.meta.dir, 'fixtures', name), 'utf8');

const hwOk: HwVerdict = { level: 'ok', text: 'Железо подходит' };
const hwWeak: HwVerdict = { level: 'weak', text: 'Железо слабее минимальных требований' };
const hwUnknown: HwVerdict = { level: 'unknown', text: 'требования не указаны' };

function inputsFor(appId: number, hw: HwVerdict): Inputs {
  const steam = parseSteamAppDetails(fx(`steam-${appId}.json`), appId);
  const first = agwCandidates(fx(`agw-search-${appId}.json`))[0];
  const agw = first === undefined ? null : parseAgwPage(fx(`agw-page-${appId}.json`), appId)?.info ?? null;
  const anticheat = findAnticheat(fx('awacy-subset.json'), appId);
  const proton = parseProton(fx(`proton-${appId}.json`));
  return { steam, agw, anticheat, proton, hw, errors: [] };
}

const steamNo = { mac: false, requirements: null };

describe('verdict', () => {
  test('labels', () => {
    expect(VERDICT_LABEL).toEqual({ mac: 'Есть для Mac', ok: 'Пойдёт', caveats: 'С оговорками', no: 'Не пойдёт', unknown: 'Неизвестно' });
  });
  test('fixtures', () => {
    expect(decide(inputsFor(292030, hwOk)).verdict).toBe('ok');
    expect(decide(inputsFor(292030, hwWeak)).verdict).toBe('caveats');
    expect(decide(inputsFor(570, hwOk)).verdict).toBe('mac');
    expect(decide(inputsFor(1172470, hwOk)).verdict).toBe('no');
    const er = decide(inputsFor(1245620, hwOk));
    expect(er.verdict).toBe('ok');
    expect(er.reasons.some((r) => r.source === 'AreWeAntiCheatYet')).toBe(true);
  });
  test('synthetic', () => {
    expect(decide({ steam: steamNo, agw: null, anticheat: { status: 'Denied', anticheats: ['BattlEye'] }, proton: null, hw: hwOk, errors: [] }).verdict).toBe('no');
    expect(decide({ steam: steamNo, agw: null, anticheat: { status: 'Supported', anticheats: ['Easy Anti-Cheat'] }, proton: { tier: 'platinum', total: 100 }, hw: hwOk, errors: [] }).verdict).toBe('caveats');
    expect(decide({ steam: steamNo, agw: null, anticheat: null, proton: { tier: 'gold', total: 3 }, hw: hwOk, errors: [] }).verdict).toBe('unknown');
    expect(decide({ steam: { mac: true, requirements: null }, agw: { pageId: 1, native: 'broken', rosetta: 'broken', crossover: 'runs', wine: null }, anticheat: null, proton: null, hw: hwOk, errors: [] }).verdict).toBe('caveats');
    expect(decide({ steam: null, agw: null, anticheat: null, proton: null, hw: hwUnknown, errors: [{ source: 'Сеть', text: 'Steam: таймаут' }] }).reasons).toContainEqual({ source: 'Сеть', text: 'Steam: таймаут' });
  });
  test('mac verdict via AGW native or rosetta with steam.mac false', () => {
    const base = { steam: steamNo, anticheat: null, proton: null, hw: hwOk, errors: [] };
    expect(decide({ ...base, agw: { pageId: 1, native: 'good', rosetta: null, crossover: null, wine: null } }).verdict).toBe('mac');
    expect(decide({ ...base, agw: { pageId: 1, native: null, rosetta: 'good', crossover: 'broken', wine: null } }).verdict).toBe('mac');
  });
  test('proton and hardware rules', () => {
    const base = { steam: steamNo, agw: null, anticheat: null, hw: hwOk, errors: [] };
    const gold = decide({ ...base, proton: { tier: 'gold', total: 50 } });
    expect(gold.verdict).toBe('ok');
    expect(gold.reasons.some((r) => r.text.includes('по данным Linux'))).toBe(true);
    expect(decide({ ...base, proton: { tier: 'bronze', total: 50 } }).verdict).toBe('caveats');
    expect(decide({ ...base, proton: { tier: 'borked', total: 50 } }).verdict).toBe('no');
    expect(decide({ ...base, proton: { tier: 'gold', total: 50 }, hw: hwWeak }).verdict).toBe('caveats');
    expect(decide({ ...base, proton: { tier: 'borked', total: 50 }, hw: hwWeak }).verdict).toBe('no');
    expect(decide({ ...base, proton: null }).verdict).toBe('unknown');
    expect(decide({ ...base, proton: null, hw: hwWeak }).verdict).toBe('unknown');
    expect(decide({ ...base, proton: null, anticheat: { status: 'Supported', anticheats: ['X'] } }).verdict).toBe('unknown');
    expect(decide({ ...base, proton: null, anticheat: { status: 'Broken', anticheats: ['X'] } }).verdict).toBe('no');
  });
  test('no em dash, hardware line always present', () => {
    const r = decide(inputsFor(1245620, hwOk));
    expect(r.reasons.some((x) => x.source === 'Железо')).toBe(true);
    expect(JSON.stringify(r)).not.toContain(String.fromCharCode(0x2014));
  });
});
