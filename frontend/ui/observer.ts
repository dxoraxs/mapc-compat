import { Millennium } from '@steambrew/client';
import { TtlCache } from '../core/cache';
import { fetchUrl } from '../core/rpc';
import { gatherVerdict, isNonSteamApp } from '../core/gather';
import type { Reason, Verdict } from '../core/verdict';
import { BADGE_ID, ensureBadge, steamClasses } from './badge';
import { loadProfile } from './profile';

const LOG = '[mapc-compat]';

/**
 * Each started request gets a number. The returned predicate is true only if no newer
 * request began since AND the page still shows the same appid.
 */
export function createRequestGuard() {
  let counter = 0;
  return {
    begin(appId: number): (pageAppId: number | null) => boolean {
      const mine = ++counter;
      return (pageAppId) => mine === counter && pageAppId === appId;
    },
  };
}

export function appIdFromPath(pathname: string | undefined | null): number | null {
  const m = /\/app\/(\d+)/.exec(pathname ?? '');
  return m ? Number(m[1]) : null;
}

export type Result = { verdict: Verdict; reasons: Reason[] };

export type WatchDeps = {
  doc: Document;
  getAppId: () => number | null;
  findClasses: () => { stat: string; label?: string } | undefined;
  gather: (appId: number) => Promise<Result>;
};

/** Same-origin iframe documents inside `doc`, recursively (document order). */
function frameDocs(doc: Document, out: Document[] = []): Document[] {
  doc.querySelectorAll('iframe').forEach((f) => {
    try {
      const inner = (f as HTMLIFrameElement).contentDocument;
      if (inner && !out.includes(inner)) {
        out.push(inner);
        frameDocs(inner, out);
      }
    } catch {
      // cross-origin frame
    }
  });
  return out;
}

const allDocs = (doc: Document): Document[] => [doc, ...frameDocs(doc)];

function removeBadgesExcept(docs: Document[], keep: HTMLElement | null, keepAll: HTMLElement[] = []) {
  const kept = keep ? [keep, ...keepAll] : keepAll;
  for (const d of docs) {
    d.querySelectorAll(`#${BADGE_ID}`).forEach((e) => {
      if (!kept.some((k) => k === e.parentElement)) e.remove();
    });
  }
}

/** Watches one window's documents (top + iframes). Exactly one badge per page. */
export function createWatcher(deps: WatchDeps) {
  const { doc } = deps;
  const guard = createRequestGuard();
  let stopped = false;
  let startedFor: number | null = null;
  let result: { appId: number; value: Result } | null = null;
  let timer: any = null;
  let interval: any = null;
  let classes: { stat: string; label?: string } | undefined;
  let warned = false;
  const observers = new Map<Document, MutationObserver>();
  const hookedFrames = new WeakSet<object>();

  const schedule = () => {
    if (!stopped && timer === null) timer = setTimeout(scan, 50);
  };

  const observe = (d: Document) => {
    if (observers.has(d)) return;
    const Mo = (d.defaultView as any)?.MutationObserver ?? MutationObserver;
    const mo = new Mo(schedule);
    mo.observe(d.documentElement ?? d, { childList: true, subtree: true });
    observers.set(d, mo);
    d.querySelectorAll('iframe').forEach((f) => {
      if (hookedFrames.has(f)) return;
      hookedFrames.add(f);
      f.addEventListener('load', schedule);
    });
  };

  const fail = (appId: number, isCurrent: (a: number | null) => boolean, e: unknown) => {
    if (stopped || !isCurrent(deps.getAppId())) return;
    console.error(`${LOG} verdict failed appid=${appId}: ${String(e)}`);
    result = { appId, value: { verdict: 'unknown', reasons: [{ source: 'Сеть', text: 'Не удалось получить данные' }] } };
    schedule();
  };

  function scan() {
    timer = null;
    if (stopped) return;
    const appId = deps.getAppId();
    if (appId === null) return;
    const docs = allDocs(doc);
    docs.forEach(observe);
    if (isNonSteamApp(appId)) {
      removeBadgesExcept(docs, null);
      startedFor = appId;
      return;
    }
    if (!classes) classes = deps.findClasses();
    if (!classes) {
      if (!warned) {
        warned = true;
        console.log(`${LOG} GameStat class not found`);
      }
      return;
    }
    const { stat, label } = classes;
    const rows: HTMLElement[] = [];
    for (const d of docs) {
      d.querySelectorAll(`.${stat}`).forEach((e) => {
        const r = e.parentElement;
        if (r && !rows.includes(r)) rows.push(r);
      });
    }
    if (!rows.length) return;
    // Real Steam markup: .GameStatsSection > .tool-tip-source > .GameStat. The page has the
    // section twice (normal and the sticky bar shown on scroll), so each section gets a badge.
    const sections: HTMLElement[] = [];
    for (const r of rows) {
      const sec = r.closest('.GameStatsSection') as HTMLElement | null;
      if (sec && !sections.includes(sec)) sections.push(sec);
    }
    const targets = sections.length
      ? sections
      : [(label && rows.find((r) => r.querySelector(`.${label}`))) || rows[0]];
    removeBadgesExcept(docs, null, targets);

    if (startedFor !== appId) {
      startedFor = appId;
      result = null;
      const isCurrent = guard.begin(appId);
      console.log(`${LOG} verdict start appid=${appId}`);
      let p: Promise<Result>;
      try {
        p = deps.gather(appId);
      } catch (e) {
        p = Promise.reject(e);
      }
      p.then(
        (value) => {
          if (stopped || !isCurrent(deps.getAppId())) return;
          console.log(`${LOG} verdict done appid=${appId} verdict=${value.verdict}`);
          result = { appId, value };
          schedule();
        },
        (e) => fail(appId, isCurrent, e),
      );
    }
    for (const row of targets) {
      if (result && result.appId === appId) ensureBadge(row, { kind: 'done', ...result.value }, stat);
      else ensureBadge(row, { kind: 'loading' }, stat);
    }
  }

  function start() {
    observe(doc);
    interval = setInterval(schedule, 2000);
    schedule();
  }

  function stop() {
    if (stopped) return;
    stopped = true;
    if (timer !== null) clearTimeout(timer);
    if (interval !== null) clearInterval(interval);
    timer = interval = null;
    observers.forEach((o) => o.disconnect());
    observers.clear();
    try {
      removeBadgesExcept(allDocs(doc), null);
    } catch {
      // window already gone
    }
  }

  return { scan, start, stop };
}

export function startObserver(): () => void {
  const watchers = new Set<{ stop: () => void }>();
  const attached = new WeakSet<Document>();
  let stopped = false;

  // Steam keeps MainWindowBrowserManager in the shared JS context, not in the popup window.
  const appIdOf = (win: any) =>
    appIdFromPath(
      (win?.MainWindowBrowserManager ?? (globalThis as any).MainWindowBrowserManager)?.m_lastLocation?.pathname,
    );

  const attach = (name: string, win: any, via: string) => {
    if (stopped || !name.startsWith('SP ')) return;
    const doc: Document | undefined = win?.document;
    if (!doc || attached.has(doc)) return;
    attached.add(doc);
    console.log(`${LOG} watching ${name}`);
    const cache = new TtlCache(localStorage, Date.now);
    const w = createWatcher({
      doc,
      getAppId: () => appIdOf(win),
      findClasses: steamClasses,
      gather: (appId) => gatherVerdict(appId, { fetch: fetchUrl, cache, profile: loadProfile() }),
    });
    watchers.add(w);
    try {
      win.addEventListener?.('unload', () => {
        w.stop();
        watchers.delete(w);
      });
    } catch {
      // no unload hook available
    }
    w.start();
  };

  const hook = (Millennium as any)?.AddWindowCreateHook;
  console.log(`${LOG} AddWindowCreateHook ${typeof hook === 'function' ? 'available' : 'missing'}`);
  try {
    hook?.((context: any) => {
      try {
        attach(context?.m_strName ?? '', context?.m_popup ?? context?.m_window, 'hook');
      } catch (e) {
        console.error(`${LOG} window hook failed: ${String(e)}`);
      }
    });
  } catch (e) {
    console.error(`${LOG} startObserver failed: ${String(e)}`);
  }

  // Windows that already existed before the plugin loaded never reach the create hook.
  const scanExisting = () => {
    try {
      const pm = (globalThis as any).g_PopupManager;
      const popups: any[] = [];
      const map = pm?.m_mapPopups;
      if (map?.values) popups.push(...map.values());
      else if (typeof pm?.GetPopups === 'function') popups.push(...pm.GetPopups());
      for (const p of popups) attach(p?.m_strName ?? p?.m_strTitle ?? '', p?.m_popup ?? p?.window, 'popup manager');
    } catch (e) {
      console.error(`${LOG} popup scan failed: ${String(e)}`);
    }
  };
  scanExisting();
  let ticks = 0;
  const poll = setInterval(() => {
    if (stopped || ++ticks > 30) return clearInterval(poll);
    scanExisting();
  }, 2000);

  return () => {
    stopped = true;
    clearInterval(poll);
    watchers.forEach((w) => w.stop());
    watchers.clear();
  };
}
