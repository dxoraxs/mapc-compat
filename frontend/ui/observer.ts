import { Millennium } from '@steambrew/client';
import { TtlCache } from '../core/cache';
import { fetchUrl } from '../core/rpc';
import { gatherVerdict, isNonSteamApp } from '../core/gather';
import type { Reason, Verdict } from '../core/verdict';
import { ensureBadge, gameStatClass, removeBadges } from './badge';
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

type Result = { verdict: Verdict; reasons: Reason[] };

/** Watches one Steam window; returns a stop function. */
function watchWindow(win: any): () => void {
  const doc: Document | undefined = win?.document;
  if (!doc) return () => {};
  const guard = createRequestGuard();
  let startedFor: number | null = null;
  let result: { appId: number; value: Result } | null = null;
  let timer: any = null;

  const pageAppId = () => appIdFromPath(win.MainWindowBrowserManager?.m_lastLocation?.pathname);

  const findRows = (d: Document, out: HTMLElement[], cls: string) => {
    d.querySelectorAll(`.${cls}`).forEach((e) => {
      if (e.parentElement && !out.includes(e.parentElement)) out.push(e.parentElement);
    });
    d.querySelectorAll('iframe').forEach((f) => {
      try {
        const inner = (f as HTMLIFrameElement).contentDocument;
        if (inner) findRows(inner, out, cls);
      } catch {
        // cross-origin frame
      }
    });
  };

  const scan = () => {
    timer = null;
    const appId = pageAppId();
    const cls = gameStatClass();
    if (appId === null || !cls) return;
    if (isNonSteamApp(appId)) {
      removeBadges(doc);
      doc.querySelectorAll('iframe').forEach((f) => {
        try {
          const inner = (f as HTMLIFrameElement).contentDocument;
          if (inner) removeBadges(inner);
        } catch {}
      });
      startedFor = appId;
      return;
    }
    const rows: HTMLElement[] = [];
    findRows(doc, rows, cls);
    if (!rows.length) return;
    if (startedFor !== appId) {
      startedFor = appId;
      result = null;
      const isCurrent = guard.begin(appId);
      console.log(`${LOG} verdict start appid=${appId}`);
      const cache = new TtlCache(localStorage, Date.now);
      gatherVerdict(appId, { fetch: fetchUrl, cache, profile: loadProfile() }).then(
        (value) => {
          if (!isCurrent(pageAppId())) return;
          console.log(`${LOG} verdict done appid=${appId} verdict=${value.verdict}`);
          result = { appId, value };
          schedule();
        },
        (e) => console.error(`${LOG} verdict failed appid=${appId}: ${String(e)}`),
      );
    }
    for (const row of rows) {
      if (result && result.appId === appId) ensureBadge(row, { kind: 'done', ...result.value });
      else ensureBadge(row, { kind: 'loading' });
    }
  };

  const schedule = () => {
    if (timer === null) timer = setTimeout(scan, 50);
  };

  const mo = new MutationObserver(schedule);
  mo.observe(doc.documentElement ?? doc, { childList: true, subtree: true });
  schedule();
  return () => {
    mo.disconnect();
    if (timer !== null) clearTimeout(timer);
  };
}

export function startObserver(): () => void {
  const stops: Array<() => void> = [];
  let stopped = false;
  try {
    (Millennium as any).AddWindowCreateHook?.((context: any) => {
      try {
        const name: string = context?.m_strName ?? '';
        if (stopped || !name.startsWith('SP ')) return;
        const win = context.m_popup ?? context.m_window;
        if (win) stops.push(watchWindow(win));
      } catch (e) {
        console.error(`${LOG} window hook failed: ${String(e)}`);
      }
    });
  } catch (e) {
    console.error(`${LOG} startObserver failed: ${String(e)}`);
  }
  return () => {
    stopped = true;
    stops.splice(0).forEach((s) => s());
  };
}
