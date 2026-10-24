import { describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { ensureBadge, BADGE_ID } from '../frontend/ui/badge';
import { createRequestGuard } from '../frontend/ui/observer';

const newRow = () => new Window().document.createElement('div') as unknown as HTMLElement;

describe('ensureBadge', () => {
  test('keeps exactly one badge across updates and Steam re-renders', () => {
    const row = newRow();
    ensureBadge(row, { kind: 'loading' });
    expect(row.querySelectorAll('#mapc-compat-badge').length).toBe(1);
    expect(row.textContent).toContain('Проверяю…');
    ensureBadge(row, { kind: 'done', verdict: 'ok', reasons: [{ source: 'AppleGamingWiki', text: 'Wine: играбельно' }] });
    expect(row.querySelectorAll('#mapc-compat-badge').length).toBe(1);
    expect(row.textContent).toContain('Пойдёт');
    row.innerHTML = ''; // Steam re-rendered the row
    ensureBadge(row, { kind: 'done', verdict: 'no', reasons: [] });
    expect(row.querySelectorAll('#mapc-compat-badge').length).toBe(1);
    expect(row.textContent).toContain('Не пойдёт');
  });

  test('tooltip lists one reason per line', () => {
    const row = newRow();
    const el = ensureBadge(row, {
      kind: 'done',
      verdict: 'caveats',
      reasons: [
        { source: 'ProtonDB', text: 'a' },
        { source: 'Железо', text: 'b' },
      ],
    });
    expect(el.id).toBe(BADGE_ID);
    expect(el.title).toBe('ProtonDB: a\nЖелезо: b');
  });

  test('identical state does not touch the DOM again', () => {
    const row = newRow();
    const state = { kind: 'done', verdict: 'mac', reasons: [] } as const;
    const a = ensureBadge(row, state);
    const b = ensureBadge(row, state);
    expect(a).toBe(b);
  });
});

describe('createRequestGuard', () => {
  test('a late response for the previous game is dropped', async () => {
    const guard = createRequestGuard();
    const applied: string[] = [];
    let resolveA!: () => void;
    let resolveB!: () => void;
    const pa = new Promise<void>((r) => (resolveA = r));
    const pb = new Promise<void>((r) => (resolveB = r));
    const isCurrentA = guard.begin(1);
    const isCurrentB = guard.begin(2);
    const runA = pa.then(() => isCurrentA(2) && applied.push('A'));
    const runB = pb.then(() => isCurrentB(2) && applied.push('B'));
    resolveB();
    resolveA();
    await Promise.all([runA, runB]);
    expect(applied).toEqual(['B']);
  });

  test('response is dropped when the page appid changed meanwhile', () => {
    const guard = createRequestGuard();
    const isCurrent = guard.begin(5);
    expect(isCurrent(5)).toBe(true);
    expect(isCurrent(6)).toBe(false);
    expect(isCurrent(null)).toBe(false);
  });

  test('same appid restarted: only the newest request wins', () => {
    const guard = createRequestGuard();
    const first = guard.begin(5);
    const second = guard.begin(5);
    expect(first(5)).toBe(false);
    expect(second(5)).toBe(true);
  });
});
