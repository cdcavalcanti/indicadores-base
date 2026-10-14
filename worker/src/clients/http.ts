/** fetch JSON com retry exponencial (429/5xx/rede). */
export async function fetchJson<T = any>(
  url: string,
  init: RequestInit = {},
  opts: { retries?: number; label?: string } = {},
): Promise<T> {
  const retries = opts.retries ?? 3;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, init);
      if (res.ok) return (await res.json()) as T;
      const body = await res.text();
      // 4xx (exceto 429) não adianta repetir
      if (res.status !== 429 && res.status < 500) {
        throw new Error(`${opts.label ?? 'http'} ${res.status}: ${body.slice(0, 500)}`);
      }
      lastErr = new Error(`${opts.label ?? 'http'} ${res.status}: ${body.slice(0, 300)}`);
    } catch (e) {
      if (e instanceof Error && /^\S+ 4\d\d:/.test(e.message)) throw e;
      lastErr = e;
    }
    if (attempt < retries) {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
  throw lastErr;
}
