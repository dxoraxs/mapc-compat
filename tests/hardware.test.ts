import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseSteamAppDetails } from '../frontend/core/steam';
import { DEFAULT_PROFILE, compareHardware, gpuTier, macTier, parseRequirements } from '../frontend/core/hardware';

const fx = (name: string) => readFileSync(join(import.meta.dir, 'fixtures', name), 'utf8');

describe('hardware', () => {
  const w3 = parseSteamAppDetails(fx('steam-292030.json'), 292030)!.requirements!;
  test('parseRequirements', () => {
    expect(parseRequirements(w3.minimum!)).toEqual({ gpu: 'GeForce GTX 1660 / Radeon RX 5500 XT 8GB / Arc A580', ramGb: 12 });
    expect(parseRequirements('<ul><li><strong>Video Card:</strong> GTX 970<br></li><li><strong>Memory:</strong> 8192 MB RAM<br></li></ul>')).toEqual({ gpu: 'GTX 970', ramGb: 8 });
    expect(parseRequirements('')).toEqual({});
  });
  test('tiers', () => {
    expect(gpuTier('GeForce GTX 1660 / Radeon RX 5500 XT 8GB / Arc A580')).toBe(3);
    expect(gpuTier('RTX 2060 Super / AMD Radeon RX 6600 XT / Intel Arc B580')).toBe(4);
    expect(gpuTier('NVIDIA GeForce RTX 3060 Ti')).toBe(6);
    expect(gpuTier('DirectX 11 compatible card')).toBeNull();
    expect(macTier(DEFAULT_PROFILE)).toBe(5);
    expect(macTier({ chip: 'Mystery', gpuCores: 1, ramGb: 1 })).toBe(2);
  });
  test('compare', () => {
    expect(compareHardware(DEFAULT_PROFILE, parseRequirements(w3.minimum!), parseRequirements(w3.recommended!)).level).toBe('ok');
    expect(compareHardware({ chip: 'M1', gpuCores: 8, ramGb: 8 }, parseRequirements(w3.minimum!), parseRequirements(w3.recommended!)).level).toBe('weak');
    expect(compareHardware(DEFAULT_PROFILE, {}, {}).level).toBe('unknown');
  });
});
