// Expiry dates are picked as a calendar day and mean "until the end of that day in Catalonia" (Europe/Madrid), whatever time zone
// the server runs in and across the clock changes. The stored value is the exact instant.
const ZONE = "Europe/Madrid";

const fmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: ZONE, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
});

function partsOf(d: Date) {
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]));
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), h: Number(p.hour), mi: Number(p.minute), s: Number(p.second) };
}

/** The offset of Madrid from UTC at an instant, in milliseconds (+1 h in winter, +2 h in summer). */
function offsetAt(d: Date): number {
  const p = partsOf(d);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(d.getTime() / 1000) * 1000;
}

/** "2026-10-21" becomes 2026-10-21 23:59:59 in Madrid, as an exact instant. Null when the text is not a real calendar day. */
export function endOfDayMadrid(day: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) return null;
  const wall = Date.UTC(y, mo - 1, d, 23, 59, 59);
  let guess = wall - offsetAt(new Date(wall));
  guess = wall - offsetAt(new Date(guess)); // once more: the offset at the real instant can differ from the one at the first guess
  return new Date(guess);
}

/** The calendar day (YYYY-MM-DD) of an instant, in Madrid. */
export function dayInMadrid(d: Date): string {
  const p = partsOf(d);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}
