import { findClassModule } from '@steambrew/client';
import { VERDICT_LABEL, type Reason, type Verdict } from '../core/verdict';

export const BADGE_ID = 'mapc-compat-badge';

export type BadgeState = { kind: 'loading' } | { kind: 'done'; verdict: Verdict; reasons: Reason[] };

const COLORS: Record<Verdict, string> = {
  mac: '#3b82f6',
  ok: '#2f9e44',
  caveats: '#c98a0b',
  no: '#c0392b',
  unknown: '#6b7280',
};
const LOADING_COLOR = '#4b5563';

/** Steam's own GameStat class (hashed, so looked up at runtime). */
export function gameStatClass(): string | undefined {
  try {
    const m: any = findClassModule((mod: any) => mod?.GameStat && mod?.PlayBarLabel);
    return m?.GameStat;
  } catch {
    return undefined;
  }
}

function describe(state: BadgeState): { text: string; title: string; color: string } {
  if (state.kind === 'loading') return { text: 'Проверяю…', title: '', color: LOADING_COLOR };
  return {
    text: VERDICT_LABEL[state.verdict],
    title: state.reasons.map((r) => `${r.source}: ${r.text}`).join('\n'),
    color: COLORS[state.verdict],
  };
}

/** Creates or updates the single badge inside `row`. Touches the DOM only when something changed. */
export function ensureBadge(row: HTMLElement, state: BadgeState): HTMLElement {
  const doc = row.ownerDocument;
  const all = Array.from(row.querySelectorAll(`#${BADGE_ID}`)) as HTMLElement[];
  let el = all[0];
  for (const extra of all.slice(1)) extra.remove();
  const { text, title, color } = describe(state);
  if (!el) {
    el = doc.createElement('div');
    el.id = BADGE_ID;
    const cls = gameStatClass();
    if (cls) el.className = cls;
    el.style.cssText =
      'display:inline-block;margin-left:12px;padding:2px 10px;border-radius:3px;color:#fff;font-size:12px;font-weight:600;line-height:18px;cursor:default;white-space:nowrap;';
    row.appendChild(el);
  } else if (row.lastElementChild !== el) {
    row.appendChild(el);
  }
  if (el.textContent !== text) el.textContent = text;
  if (el.title !== title) el.title = title;
  if (el.dataset.color !== color) {
    el.style.backgroundColor = color;
    el.dataset.color = color;
  }
  return el;
}

export function removeBadges(root: ParentNode): void {
  root.querySelectorAll(`#${BADGE_ID}`).forEach((e) => e.remove());
}
