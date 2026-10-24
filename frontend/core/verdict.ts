import type { AgwInfo, AnticheatInfo, ProtonInfo, Rating, SteamInfo } from './types';
import type { HwVerdict } from './hardware';

export type Verdict = 'mac' | 'ok' | 'caveats' | 'no' | 'unknown';

export const VERDICT_LABEL: Record<Verdict, string> = {
  mac: 'Есть для Mac',
  ok: 'Пойдёт',
  caveats: 'С оговорками',
  no: 'Не пойдёт',
  unknown: 'Неизвестно',
};

export type Reason = {
  source: 'Steam' | 'AppleGamingWiki' | 'AreWeAntiCheatYet' | 'ProtonDB' | 'Железо' | 'Сеть';
  text: string;
};

export type Inputs = {
  steam: SteamInfo | null;
  agw: AgwInfo | null;
  anticheat: AnticheatInfo | null;
  proton: ProtonInfo | null;
  hw: HwVerdict;
  errors: Reason[];
};

const RANK: Record<Exclude<Rating, null>, number> = { good: 3, runs: 2, broken: 1 };
const RATING_RU: Record<Exclude<Rating, null>, string> = { good: 'работает хорошо', runs: 'играбельно', broken: 'не запускается' };

function best(a: Rating, b: Rating): Rating {
  if (a === null) return b;
  if (b === null) return a;
  return RANK[a] >= RANK[b] ? a : b;
}

const isPlayable = (r: Rating) => r === 'good' || r === 'runs';

export function decide(i: Inputs): { verdict: Verdict; reasons: Reason[] } {
  const reasons: Reason[] = [];
  const done = (verdict: Verdict) => {
    reasons.push({ source: 'Железо', text: i.hw.text });
    reasons.push(...i.errors);
    return { verdict, reasons };
  };

  const { steam, agw, anticheat, proton, hw } = i;

  // 1. Родная версия
  const agwNative = !!agw && (isPlayable(agw.native) || isPlayable(agw.rosetta));
  const steamMacBlocked = !!agw && agw.native === 'broken' && agw.rosetta === 'broken';
  if (agwNative) {
    const how = isPlayable(agw!.native) ? 'нативная версия' : 'версия через Rosetta';
    reasons.push({ source: 'AppleGamingWiki', text: `Mac: ${how}` });
    return done('mac');
  }
  if (steam?.mac) {
    if (!steamMacBlocked) {
      reasons.push({ source: 'Steam', text: 'В Steam указана версия для Mac' });
      return done('mac');
    }
    reasons.push({ source: 'Steam', text: 'В Steam есть версия для Mac, но AppleGamingWiki отмечает её как не запускающуюся' });
  }

  // 2. AGW: лучшая из CrossOver и Wine
  let base: Verdict | null = null;
  const compat = agw ? best(agw.crossover, agw.wine) : null;
  if (agw && compat) {
    if (agw.crossover) reasons.push({ source: 'AppleGamingWiki', text: `CrossOver: ${RATING_RU[agw.crossover]}` });
    if (agw.wine) reasons.push({ source: 'AppleGamingWiki', text: `Wine: ${RATING_RU[agw.wine]}` });
    base = compat === 'good' ? 'ok' : compat === 'runs' ? 'caveats' : 'no';
  }

  // 3. ProtonDB, только если оценки AGW нет
  if (base === null) {
    if (proton && proton.total >= 5) {
      const t = proton.tier.toLowerCase();
      if (t === 'platinum' || t === 'gold') base = 'ok';
      else if (t === 'silver' || t === 'bronze') base = 'caveats';
      else if (t === 'borked') base = 'no';
      if (base) reasons.push({ source: 'ProtonDB', text: `ProtonDB: ${proton.tier} (по данным Linux)` });
    } else if (proton) {
      reasons.push({ source: 'ProtonDB', text: `ProtonDB: мало отзывов (${proton.total})` });
    }
  }

  // 4. Античит
  if (anticheat) {
    const names = anticheat.anticheats.length ? anticheat.anticheats.join(', ') : 'античит';
    const label = `Античит ${names}`;
    if (compat) {
      reasons.push({ source: 'AreWeAntiCheatYet', text: `${label}: статус ${anticheat.status} (оценка AppleGamingWiki главнее)` });
    } else if (anticheat.status === 'Broken' || anticheat.status === 'Denied') {
      reasons.push({ source: 'AreWeAntiCheatYet', text: `${label}: ${anticheat.status}, не работает` });
      base = 'no';
    } else {
      reasons.push({ source: 'AreWeAntiCheatYet', text: `${label}: на Linux работает, на Mac под Wine не проверено` });
      if (base === 'ok') base = 'caveats';
    }
  }

  // 5. Нет данных
  if (base === null) base = 'unknown';

  // 6. Железо
  if (base === 'ok' && (hw.level === 'weak' || hw.level === 'borderline')) base = 'caveats';

  return done(base);
}
