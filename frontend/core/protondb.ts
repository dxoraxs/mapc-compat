import type { ProtonInfo } from './types';

export function protonUrl(appId: number): string {
  return `https://www.protondb.com/api/v1/reports/summaries/${appId}.json`;
}

export function parseProton(json: string): ProtonInfo | null {
  try {
    const o = JSON.parse(json);
    if (!o || typeof o.tier !== 'string') return null;
    return { tier: o.tier, total: typeof o.total === 'number' ? o.total : 0 };
  } catch {
    return null;
  }
}
