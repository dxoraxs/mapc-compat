import type { AgwInfo, Rating } from './types';

const BASE = 'https://www.applegamingwiki.com/w/api.php';

export function agwSearchUrl(appId: number): string {
  return `${BASE}?action=query&list=search&srsearch=${appId}&srwhat=text&format=json&srlimit=5`;
}

export function agwParseUrl(pageId: number): string {
  return `${BASE}?action=parse&pageid=${pageId}&prop=wikitext&format=json`;
}

export function agwCandidates(searchJson: string): number[] {
  try {
    const list = JSON.parse(searchJson)?.query?.search;
    if (!Array.isArray(list)) return [];
    return list.map((x: any) => x?.pageid).filter((n: unknown): n is number => typeof n === 'number');
  } catch {
    return [];
  }
}

export function normalizeRating(v: string | undefined): Rating {
  switch ((v ?? '').trim().toLowerCase()) {
    case 'perfect':
    case 'playable':
      return 'good';
    case 'runs':
      return 'runs';
    case 'unplayable':
      return 'broken';
    default:
      return null;
  }
}

/** Returns the body of the first `{{<name> ...}}` template (without braces), counting `{{ }}` and `[[ ]]` nesting. */
function extractTemplate(text: string, name: string): string | null {
  const start = text.indexOf('{{' + name);
  if (start < 0) return null;
  let depth = 0;
  let i = start;
  while (i < text.length) {
    const two = text.substr(i, 2);
    if (two === '{{' || two === '[[') {
      depth++;
      i += 2;
    } else if (two === '}}' || two === ']]') {
      depth--;
      i += 2;
      if (depth === 0) return text.slice(start + 2, i - 2);
    } else i++;
  }
  return null;
}

/** Splits template body into params on `|` at nesting depth 0; the first chunk (template name) is dropped. */
function templateParams(body: string): Record<string, string> {
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  for (let i = 0; i < body.length; ) {
    const two = body.substr(i, 2);
    if (two === '{{' || two === '[[') {
      depth++;
      cur += two;
      i += 2;
    } else if (two === '}}' || two === ']]') {
      depth--;
      cur += two;
      i += 2;
    } else if (body[i] === '|' && depth === 0) {
      parts.push(cur);
      cur = '';
      i++;
    } else {
      cur += body[i++];
    }
  }
  parts.push(cur);
  const out: Record<string, string> = {};
  for (const p of parts.slice(1)) {
    const eq = p.indexOf('=');
    if (eq < 0) continue;
    out[p.slice(0, eq).trim().toLowerCase()] = p.slice(eq + 1).trim();
  }
  return out;
}

function idList(v: string | undefined): string[] {
  return (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseAgwPage(json: string, appId: number): { info: AgwInfo; main: boolean } | null {
  let page: any;
  let wikitext: unknown;
  try {
    page = JSON.parse(json)?.parse;
    wikitext = page?.wikitext?.['*'];
  } catch {
    return null;
  }
  if (typeof wikitext !== 'string' || typeof page.pageid !== 'number') return null;
  const infobox = extractTemplate(wikitext, 'Infobox game');
  if (infobox === null) return null;
  const ib = templateParams(infobox);
  const want = String(appId);
  const main = idList(ib['steam appid']).includes(want);
  const side = idList(ib['steam appid side']).includes(want);
  if (!main && !side) return null;
  const compat = extractTemplate(wikitext, 'Compatibility/macOS');
  const c = compat === null ? {} : templateParams(compat);
  return {
    info: {
      pageId: page.pageid,
      native: normalizeRating(c['native']),
      rosetta: normalizeRating(c['rosetta 2']),
      crossover: normalizeRating(c['crossover']),
      wine: normalizeRating(c['wine']),
    },
    main,
  };
}
