import { DEFAULT_PROFILE, type MacProfile } from '../core/hardware';

const KEY = 'mapc-compat:profile';

export function loadProfile(): MacProfile {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (p && typeof p.chip === 'string' && Number.isFinite(p.gpuCores) && Number.isFinite(p.ramGb)) {
      return { chip: p.chip, gpuCores: Number(p.gpuCores), ramGb: Number(p.ramGb) };
    }
  } catch {
    // fall through to default
  }
  return { ...DEFAULT_PROFILE };
}

export function saveProfile(p: MacProfile): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // storage unavailable
  }
}

/** Drops cached verdict data but keeps the hardware profile. */
export function clearCache(): number {
  let n = 0;
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('mapc-compat:') && k !== KEY) keys.push(k);
    }
    for (const k of keys) {
      localStorage.removeItem(k);
      n++;
    }
  } catch {
    // ignore
  }
  return n;
}
