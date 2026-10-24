import { describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { ensureBadge, BADGE_ID } from '../frontend/ui/badge';
import { createRequestGuard, createWatcher, type WatchDeps } from '../frontend/ui/observer';

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

describe('createWatcher', () => {
  const STAT = 'gs';
  const LABEL = 'pl';
  const mk = (over: Partial<WatchDeps> & { appId?: number | null } = {}) => {
    const win = new Window();
    const doc = win.document as unknown as Document;
    const calls: number[] = [];
    const deps: WatchDeps = {
      doc,
      getAppId: () => (over.appId === undefined ? 100 : over.appId),
      findClasses: () => ({ stat: STAT, label: LABEL }),
      gather: async (id) => {
        calls.push(id);
        return { verdict: 'ok', reasons: [] };
      },
      ...over,
    };
    return { win, doc, calls, deps };
  };
  const addRow = (parent: Element, withLabel = false) => {
    const d = parent.ownerDocument;
    const row = d.createElement('div');
    const stat = d.createElement('span');
    stat.className = STAT;
    row.appendChild(stat);
    if (withLabel) {
      const l = d.createElement('span');
      l.className = LABEL;
      row.appendChild(l);
    }
    parent.appendChild(row);
    return row;
  };
  const tick = () => new Promise((r) => setTimeout(r, 0));

  test('exactly one badge across two candidate rows, prefers the PlayBarLabel row', async () => {
    const { doc, deps } = mk();
    const r1 = addRow(doc.body);
    const r2 = addRow(doc.body, true);
    const w = createWatcher(deps);
    w.scan();
    await tick();
    w.scan();
    expect(doc.querySelectorAll('#mapc-compat-badge').length).toBe(1);
    expect(r2.querySelector('#mapc-compat-badge')).not.toBeNull();
    expect(r1.querySelector('#mapc-compat-badge')).toBeNull();
    expect(doc.body.textContent).toContain('Пойдёт');
    w.stop();
  });

  test('non-Steam appid: zero gather calls and existing badge removed', () => {
    let id = 100;
    const { doc, calls, deps } = mk({ getAppId: () => id });
    const row = addRow(doc.body, true);
    const w = createWatcher(deps);
    w.scan();
    expect(row.querySelectorAll('#mapc-compat-badge').length).toBe(1);
    const before = calls.length;
    id = 0x80000001;
    w.scan();
    expect(row.querySelectorAll('#mapc-compat-badge').length).toBe(0);
    expect(calls.length).toBe(before);
    w.stop();
  });

  test('badge in an iframe document is restored after its row is cleared', async () => {
    const { win, doc, deps } = mk();
    const iframe = doc.createElement('iframe');
    doc.body.appendChild(iframe);
    const inner = new Window().document as unknown as Document;
    Object.defineProperty(iframe, 'contentDocument', { value: inner });
    const row = addRow(inner.body, true);
    const w = createWatcher(deps);
    w.scan();
    await tick();
    w.scan();
    expect(row.textContent).toContain('Пойдёт');
    row.innerHTML = '';
    const stat = inner.createElement('span');
    stat.className = STAT;
    row.appendChild(stat);
    w.scan();
    expect(inner.querySelectorAll('#mapc-compat-badge').length).toBe(1);
    w.stop();
    expect(inner.querySelectorAll('#mapc-compat-badge').length).toBe(0);
    void win;
  });

  test('nothing happens after stop even if a pending gather resolves later', async () => {
    let resolve!: (r: any) => void;
    let appIdCalls = 0;
    const { doc, deps } = mk({
      gather: () => new Promise((r) => (resolve = r)),
      getAppId: () => (appIdCalls++, 100),
    });
    const row = addRow(doc.body, true);
    const w = createWatcher(deps);
    w.scan();
    expect(row.querySelectorAll('#mapc-compat-badge').length).toBe(1);
    w.stop();
    const seen = appIdCalls;
    resolve({ verdict: 'ok', reasons: [] });
    await new Promise((r) => setTimeout(r, 120));
    w.scan();
    expect(row.querySelectorAll('#mapc-compat-badge').length).toBe(0);
    expect(appIdCalls).toBe(seen);
  });

  test('gather rejection ends in the unknown label', async () => {
    const { doc, deps } = mk({ gather: () => Promise.reject(new Error('boom')) });
    const row = addRow(doc.body, true);
    const w = createWatcher(deps);
    w.scan();
    await tick();
    await tick();
    w.scan();
    expect(row.textContent).toContain('Неизвестно');
    w.stop();
  });

  test('missing GameStat class: no badge, retried on later scans', () => {
    let found = false;
    const { doc, deps } = mk({ findClasses: () => (found ? { stat: STAT } : undefined) });
    addRow(doc.body);
    const w = createWatcher(deps);
    w.scan();
    expect(doc.querySelectorAll('#mapc-compat-badge').length).toBe(0);
    found = true;
    w.scan();
    expect(doc.querySelectorAll('#mapc-compat-badge').length).toBe(1);
    w.stop();
  });
});

describe('ensureBadge DOM stability', () => {
  test('identical state causes no mutations', async () => {
    const win = new Window();
    const row = win.document.createElement('div') as unknown as HTMLElement;
    const state = { kind: 'done', verdict: 'mac', reasons: [{ source: 'Steam', text: 't' }] } as const;
    ensureBadge(row, state);
    let count = 0;
    const mo = new win.MutationObserver(() => count++);
    mo.observe(row as any, { childList: true, subtree: true, attributes: true, characterData: true });
    ensureBadge(row, state);
    await new Promise((r) => setTimeout(r, 10));
    mo.disconnect();
    expect(count).toBe(0);
  });
});
