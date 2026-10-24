export type Rating = 'good' | 'runs' | 'broken' | null;

export type SteamInfo = { mac: boolean; requirements: { minimum?: string; recommended?: string } | null };

export type AgwInfo = { pageId: number; native: Rating; rosetta: Rating; crossover: Rating; wine: Rating };

export type AnticheatInfo = {
  status: 'Supported' | 'Running' | 'Planned' | 'Broken' | 'Denied';
  anticheats: string[];
};

export type ProtonInfo = { tier: string; total: number };
