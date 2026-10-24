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

/** Steam's own hashed classes, looked up at runtime. Undefined until the module is found. */
export function steamClasses(): { stat: string; label?: string } | undefined {
  try {
    const m: any = findClassModule((mod: any) => mod?.GameStat && mod?.PlayBarLabel);
    return m?.GameStat ? { stat: m.GameStat, label: m.PlayBarLabel } : undefined;
  } catch {
    return undefined;
  }
}

const DOT = (x: number) => `<circle cx="${x}" cy="8" r="1.3" fill="#fff" stroke="none"/>`;

/** White glyph on a coloured circle: check, exclamation, cross, question mark, dots. */
const ICONS: Record<Verdict | 'loading', string> = {
  mac: '<path d="M3.8 8.4l2.8 2.8 5.6-6.2"/>',
  ok: '<path d="M3.8 8.4l2.8 2.8 5.6-6.2"/>',
  caveats: '<path d="M8 3.6v5.2"/><circle cx="8" cy="11.9" r="1.2" fill="#fff" stroke="none"/>',
  no: '<path d="M4.8 4.8l6.4 6.4M11.2 4.8l-6.4 6.4"/>',
  unknown:
    '<path d="M6 6.2a2 2 0 1 1 3 1.7c-.7.4-1 .9-1 1.6"/><circle cx="8" cy="12.2" r="1.2" fill="#fff" stroke="none"/>',
  loading: DOT(4.5) + DOT(8) + DOT(11.5),
};

function describe(state: BadgeState): { key: string; label: string; title: string; color: string } {
  if (state.kind === 'loading') return { key: 'loading', label: 'Проверяю…', title: 'Проверяю…', color: LOADING_COLOR };
  const label = VERDICT_LABEL[state.verdict];
  return {
    key: state.verdict,
    label,
    title: [label, ...state.reasons.map((r) => `${r.source}: ${r.text}`)].join('\n'),
    color: COLORS[state.verdict],
  };
}

/** Creates or updates the single badge inside `row`. Touches the DOM only when something changed. */
export function ensureBadge(row: HTMLElement, state: BadgeState, statClass?: string): HTMLElement {
  const doc = row.ownerDocument;
  const all = Array.from(row.querySelectorAll(`#${BADGE_ID}`)) as HTMLElement[];
  let el = all[0];
  for (const extra of all.slice(1)) extra.remove();
  const { key, label, title, color } = describe(state);
  if (!el) {
    el = doc.createElement('div');
    el.id = BADGE_ID;
    if (statClass) el.className = statClass;
    el.setAttribute('role', 'img');
    el.style.cssText =
      'display:inline-flex;align-items:center;justify-content:center;align-self:center;flex:0 0 auto;' +
      'width:22px;height:22px;min-height:0;margin:0 0 0 12px;padding:0;border-radius:50%;cursor:default;';
    row.appendChild(el);
  } else if (row.lastElementChild !== el) {
    row.appendChild(el);
  }
  if (el.dataset.state !== key) {
    el.dataset.state = key;
    el.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#fff" stroke-width="2.2" ' +
      `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[key as Verdict | 'loading']}</svg>`;
    el.style.backgroundColor = color;
  }
  if (el.getAttribute('aria-label') !== label) el.setAttribute('aria-label', label);
  if (el.title !== title) el.title = title;
  return el;
}

export function removeBadges(root: ParentNode): void {
  root.querySelectorAll(`#${BADGE_ID}`).forEach((e) => e.remove());
}
