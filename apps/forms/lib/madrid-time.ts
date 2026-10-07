// Staff type dates in the office's time (Catalonia), whatever the server's clock is set to. The database keeps the exact instant.
const TZ = "Europe/Madrid";
const fmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });

const parts = (ms: number) => Object.fromEntries(fmt.formatToParts(new Date(ms)).map((p) => [p.type, p.value])) as Record<string, string>;
/** Minutes Madrid is ahead of UTC at that instant (60 in winter, 120 in summer). */
function offsetMinutes(utcMs: number): number {
  const p = parts(utcMs);
  return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - utcMs) / 60000);
}

/** "2026-12-31T18:00" typed in Madrid time -> the instant; null when it is not a real date. A time that does not exist (the hour skipped in spring) lands just after the gap. */
export function madridLocalToDate(local: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local.trim());
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const real = new Date(guess);
  if (real.getUTCFullYear() !== y || real.getUTCMonth() !== mo - 1 || real.getUTCDate() !== d || h > 23 || mi > 59) return null;
  let t = guess - offsetMinutes(guess) * 60000;
  t = guess - offsetMinutes(t) * 60000; // a second pass settles it around the clock change
  return new Date(t);
}

/** An instant -> "2026-12-31T18:00" in Madrid time (what a datetime-local input shows). */
export function dateToMadridLocal(d: Date): string {
  const p = parts(d.getTime());
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
