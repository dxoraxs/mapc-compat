import { callable } from '@steambrew/client';

export type FetchResult = { ok: true; status: number; body: string } | { ok: false; error: string };

/** Lua returns JSON text; Millennium may wrap a string result in quotes, so decode up to twice. */
export function decodeRpc<T>(raw: unknown): T {
  let value: unknown = raw;
  if (typeof value === 'string') value = JSON.parse(value);
  if (typeof value === 'string') value = JSON.parse(value);
  return value as T;
}

let fetchUrlRpc: ((args: { url: string }) => Promise<string>) | null = null;

export async function fetchUrl(url: string): Promise<FetchResult> {
  try {
    if (!fetchUrlRpc) fetchUrlRpc = callable<[{ url: string }], string>('FetchUrl');
    return decodeRpc<FetchResult>(await fetchUrlRpc({ url }));
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
