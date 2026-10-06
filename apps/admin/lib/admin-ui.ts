// Small display helpers for the admin screens (names, greetings, "fa 2 h").
type Person = { name: string; email: string };

export const displayName = (u: Person) => u.name.trim() || u.email.split("@")[0];

export function initials(u: Person) {
  const words = displayName(u).split(/[\s._-]+/).filter(Boolean);
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase() || "?";
}

const TZ = "Europe/Madrid";

export function greeting(now = new Date()) {
  const h = Number(new Intl.DateTimeFormat("ca", { hour: "numeric", hourCycle: "h23", timeZone: TZ }).format(now));
  return h < 14 ? "Bon dia" : h < 21 ? "Bona tarda" : "Bona nit";
}

export const today = (now = new Date()) =>
  new Intl.DateTimeFormat("ca", { weekday: "long", day: "numeric", month: "long", timeZone: TZ }).format(now);

/** "ara mateix", "fa 5 min", "fa 3 h", "ahir", "fa 4 dies", then a date. */
export function ago(d: Date, now = new Date()) {
  const min = Math.round((now.getTime() - d.getTime()) / 60_000);
  if (min < 1) return "ara mateix";
  if (min < 60) return `fa ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `fa ${h} h`;
  const days = Math.round(h / 24);
  if (days === 1) return "ahir";
  if (days < 7) return `fa ${days} dies`;
  return new Intl.DateTimeFormat("ca", { day: "numeric", month: "short", year: "numeric", timeZone: TZ }).format(d);
}
