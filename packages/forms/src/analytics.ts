// Response analytics (Forms v2, item 9): completion, time to complete, drop-off per question and a chart per choice question.
// Pure: the page loads the rows and hands them here, so the numbers are unit-tested without a browser.
import type { Answer } from "@apex/db/schema";
import { answerText } from "./answer-text";
import { formTypeByName, lt, optionValues, ratingMax, type Item } from "./fieldTypes";

export type Row = { answers: Answer[]; durationSeconds: number | null; createdAt: Date };
export type Choice = { label: string; count: number };
export type FieldStat = {
  id: string; label: string; type: string;
  reached: number | null;   // page loads that reached it (null = no statistics yet)
  answered: number;         // responses that answered it
  choices: Choice[] | null; // one bar per option (choice questions, yes/no, rating, box)
  average: number | null;   // rating only
};
export type Analytics = {
  responses: number; starts: number; completion: number | null;
  duration: { median: number; average: number; n: number } | null;
  perDay: { day: string; n: number }[]; // the last 30 days, oldest first
  fields: FieldStat[];
};

const CHOICE_TYPES = ["dropdown", "choice", "yesno", "checkbox", "rating"];
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };
const madridDay = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" }); // 2026-10-07

function answered(item: Item, a: Answer | undefined): boolean {
  if (!a) return false;
  if (item.type === "checkbox") return a.value === true;
  if (item.type === "yesno") return a.value === true || a.value === false;
  return answerText(a).trim() !== "";
}

function choicesOf(item: Item, given: Answer[]): Choice[] {
  let labels: string[];
  const counts = new Map<string, number>();
  const bump = (k: string) => counts.set(k, (counts.get(k) ?? 0) + 1);
  if (item.type === "dropdown" || item.type === "choice") {
    labels = optionValues(item);
    for (const a of given) for (const v of Array.isArray(a.value) ? a.value : [a.value]) if (typeof v === "string" && v) bump(v);
  } else if (item.type === "yesno") {
    labels = ["Sí", "No"];
    for (const a of given) if (typeof a.value === "boolean") bump(a.value ? "Sí" : "No");
  } else if (item.type === "checkbox") {
    labels = ["Marcada"];
    for (const a of given) if (a.value === true) bump("Marcada");
  } else {
    labels = Array.from({ length: ratingMax(item) }, (_, i) => String(i + 1));
    for (const a of given) if (typeof a.value === "number") bump(String(a.value));
  }
  const known = labels.map((label) => ({ label, count: counts.get(label) ?? 0 }));
  const extra = [...counts].filter(([k]) => !labels.includes(k)).map(([label, count]) => ({ label, count })); // an option removed from the form since
  return [...known, ...extra];
}

export function analyze(items: Item[], rows: Row[], reach: Map<string, number>, starts: number, now = new Date()): Analytics {
  const responses = rows.length;
  const started = Math.max(starts, responses); // never more completions than starts
  const durations = rows.map((r) => r.durationSeconds).filter((d): d is number => typeof d === "number");

  const days = new Map<string, number>();
  for (let i = 29; i >= 0; i--) days.set(madridDay(new Date(now.getTime() - i * 86_400_000)), 0);
  for (const r of rows) { const d = madridDay(r.createdAt); if (days.has(d)) days.set(d, days.get(d)! + 1); }

  const fields = items.filter((i) => formTypeByName[i.type]?.input && i.type !== "file").map((item): FieldStat => {
    const given = rows.flatMap((r) => { const a = r.answers.find((x) => x.id === item.id); return a && answered(item, a) ? [a] : []; });
    const choices = CHOICE_TYPES.includes(item.type) ? choicesOf(item, given) : null;
    const marks = item.type === "rating" ? given.map((a) => a.value).filter((v): v is number => typeof v === "number") : [];
    return {
      id: item.id, label: lt(item.data.label, "ca") || item.type, type: item.type,
      reached: reach.has(item.id) ? reach.get(item.id)! : null, answered: given.length, choices,
      average: marks.length ? Math.round((marks.reduce((a, b) => a + b, 0) / marks.length) * 10) / 10 : null,
    };
  });
  return {
    responses, starts: started, completion: started ? responses / started : null,
    duration: durations.length ? { median: median(durations), average: Math.round(durations.reduce((a, b) => a + b, 0) / durations.length), n: durations.length } : null,
    perDay: [...days].map(([day, n]) => ({ day, n })), fields,
  };
}
