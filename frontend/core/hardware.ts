export type MacProfile = { chip: string; gpuCores: number; ramGb: number };
export const DEFAULT_PROFILE: MacProfile = { chip: 'M5 Pro', gpuCores: 20, ramGb: 48 };

export type Requirements = { gpu?: string; ramGb?: number };
export type HwVerdict = { level: 'ok' | 'borderline' | 'weak' | 'unknown'; text: string };

const GPU_TIERS: Record<number, string[]> = {
  1: ['GTX 750', 'GTX 950', 'GTX 1050', 'RX 460', 'RX 560', 'Intel HD', 'UHD'],
  2: ['GTX 970', 'GTX 1050 Ti', 'GTX 1060', 'GTX 1650', 'RX 470', 'RX 570', 'RX 580'],
  3: ['GTX 1070', 'GTX 1660', 'RX 590', 'RX 5500', 'Arc A380', 'Arc A580'],
  4: ['GTX 1080', 'RTX 2060', 'RX 5600', 'RX 5700', 'RX 6600'],
  5: ['RTX 2070', 'RTX 3060', 'RX 6600 XT', 'RX 6700', 'Arc B580'],
  6: ['RTX 2080', 'RTX 3060 Ti', 'RTX 3070', 'RX 6800'],
  7: ['RTX 3080', 'RTX 4070', 'RX 6900', 'RX 7800'],
  8: ['RTX 3090', 'RTX 4080', 'RTX 4090', 'RTX 50', 'RX 7900'],
};

const CHIP_TIERS: Record<number, string[]> = {
  1: ['M1', 'M2'],
  2: ['M3', 'M4', 'M1 Pro'],
  3: ['M5', 'M2 Pro', 'M3 Pro'],
  4: ['M1 Max', 'M4 Pro'],
  5: ['M5 Pro', 'M2 Max'],
  6: ['M3 Max', 'M4 Max'],
  7: ['M5 Max', 'M1 Ultra', 'M2 Ultra'],
  8: ['M3 Ultra'],
};

function flatten(t: Record<number, string[]>): [string, number][] {
  const out: [string, number][] = [];
  for (const [lvl, names] of Object.entries(t)) for (const n of names) out.push([n.toLowerCase(), Number(lvl)]);
  return out.sort((a, b) => b[0].length - a[0].length);
}
const GPU_LIST = flatten(GPU_TIERS);
const CHIP_LIST = flatten(CHIP_TIERS);

function stripTags(s: string): string {
  return s
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseRequirements(html: string): Requirements {
  const res: Requirements = {};
  for (const m of (html || '').matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)) {
    const t = stripTags(m[1]);
    const g = t.match(/^(?:Graphics|Video Card)\s*:\s*(.+)$/i);
    if (g && !res.gpu) res.gpu = g[1].trim();
    const r = t.match(/^Memory\s*:\s*([\d.,]+)\s*(GB|MB)/i);
    if (r && res.ramGb === undefined) {
      const n = parseFloat(r[1].replace(',', '.'));
      res.ramGb = r[2].toUpperCase() === 'MB' ? n / 1024 : n;
    }
  }
  return res;
}

export function gpuTier(gpuLine: string): number | null {
  let best: number | null = null;
  for (const part of gpuLine.split(/[\/,]/)) {
    const p = part.toLowerCase();
    const hit = GPU_LIST.find(([name]) => p.includes(name));
    if (hit && (best === null || hit[1] < best)) best = hit[1];
  }
  return best;
}

export function macTier(p: MacProfile): number {
  const chip = p.chip.toLowerCase().replace(/^apple\s+/, '').trim();
  const hit = CHIP_LIST.find(([name]) => chip === name) ?? CHIP_LIST.find(([name]) => ` ${chip} `.includes(` ${name} `));
  return hit ? hit[1] : 2;
}

export function compareHardware(p: MacProfile, min?: Requirements, rec?: Requirements): HwVerdict {
  const minTier = min?.gpu ? gpuTier(min.gpu) : null;
  const recTier = rec?.gpu ? gpuTier(rec.gpu) : null;
  if (minTier === null && recTier === null) return { level: 'unknown', text: 'нет данных о требуемой видеокарте' };
  const mac = macTier(p);
  const label = `примерно как ${p.chip}`;
  const ramOk = (r?: Requirements) => r?.ramGb === undefined || p.ramGb * 0.75 >= r.ramGb;
  if (recTier !== null && mac >= recTier && ramOk(rec)) {
    return { level: 'ok', text: `${label} против требуемой ${rec!.gpu}` };
  }
  if (minTier !== null && (mac < minTier || !ramOk(min))) {
    return { level: 'weak', text: `${label} против требуемой ${min!.gpu}` };
  }
  return { level: 'borderline', text: `${label} против требуемой ${(rec?.gpu && recTier !== null ? rec.gpu : min!.gpu)}` };
}
