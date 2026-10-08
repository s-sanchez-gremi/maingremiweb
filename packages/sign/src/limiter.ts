// A small in-memory sliding-window rate limiter for the public signer endpoints (one server process, like the login throttle).
// Keys are hashed addresses or token hashes, never raw values. Memory is bounded: expired keys are dropped, and past maxKeys the oldest go.
export function createLimiter(opts: { max: number; windowMs: number; maxKeys?: number }) {
  const hits = new Map<string, number[]>();
  const maxKeys = opts.maxKeys ?? 10_000;
  return {
    /** Counts a hit for the key and says whether the key is now over its limit (a refused attempt still counts). */
    hit(key: string, now = Date.now()): boolean {
      const from = now - opts.windowMs;
      const list = (hits.get(key) ?? []).filter((t) => t > from);
      list.push(now);
      hits.delete(key); // re-insert so the map stays in order of last use
      hits.set(key, list);
      if (hits.size > maxKeys) {
        for (const [k, v] of hits) if (v[v.length - 1] <= from) hits.delete(k);
        for (const k of hits.keys()) { if (hits.size <= maxKeys) break; hits.delete(k); }
      }
      return list.length > opts.max;
    },
    reset() { hits.clear(); },
    get size() { return hits.size; },
  };
}
