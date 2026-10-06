// Pure validation shared by the browser (instant feedback) and the server (the only one that counts).
import type { Locale } from "@apex/db/schema";
import { fmt, msgs } from "./messages";
import { formTypeByName, isRequired, lt, optionValues, ratingMax, type Item } from "./fieldTypes";

export type Answers = Record<string, unknown>;
export type FileMeta = { name: string; size: number; mime: string };
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

const EMAIL = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;
const asArray = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : v === undefined || v === null || v === "" ? [] : [String(v)]);
const asText = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const num = (s: string) => Number(s.trim().replace(",", "."));
/** A web address typed by a person: the scheme is optional (https is assumed), only http(s) is accepted, and it needs a real host name. Returns the normalised text, or null. */
export function cleanUrl(input: string): string | null {
  const s = input.trim();
  if (!s || s.length > 500 || /\s/.test(s)) return null;
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`; // "javascript:...", "mailto:..." and "data:..." get https:// put in front and then fail to parse as a host
  try {
    if (!/^https?:\/\/[a-z0-9]/i.test(candidate)) return null; // the host must start right after "://" (the URL parser would accept "https:////host")
    const u = new URL(candidate);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (u.username || u.password) return null;
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(u.hostname)) return null;
    return candidate;
  } catch { return null; }
}
const optNum = (v: unknown) => (typeof v === "string" && v.trim() !== "" && !Number.isNaN(num(v)) ? num(v) : null);

/** Is this field currently shown? A field whose controlling field is hidden is hidden too. */
export function isVisible(items: Item[], item: Item, answers: Answers, depth = 0): boolean {
  const ref = String(item.data.showField ?? "");
  if (!ref || depth > 20) return true;
  const controller = items.find((i) => i.id === ref);
  if (!controller) return true;
  if (!isVisible(items, controller, answers, depth + 1)) return false;
  const raw = answers[ref];
  const have = typeof raw === "boolean" ? [raw ? "yes" : "no"] : asArray(raw);
  const hit = have.includes(String(item.data.showValue ?? ""));
  return item.data.showOp === "not_equals" ? !hit : hit;
}

export type Cleaned = { id: string; type: string; label: string; value: unknown };

/** Returns per-field errors and the cleaned answers (only visible fields, normalised). */
export function validateAnswers(items: Item[], answers: Answers, locale: Locale): { errors: Record<string, string>; values: Cleaned[] } {
  const t = msgs(locale);
  const errors: Record<string, string> = {};
  const values: Cleaned[] = [];
  for (const item of items) {
    if (!formTypeByName[item.type]?.input) continue; // page breaks, titles and paragraphs carry no answer
    if (!isVisible(items, item, answers)) continue;
    const label = lt(item.data.label, locale);
    const req = isRequired(item);
    const raw = answers[item.id];
    let value: unknown = null;
    const fail = (msg: string) => { errors[item.id] = msg; };

    switch (item.type) {
      case "text": case "textarea": {
        const s = asText(raw); value = s;
        if (!s && req) fail(t.required); else if (s.length > (item.type === "text" ? 500 : 5000)) fail(t.tooLong);
        break;
      }
      case "email": {
        const s = asText(raw).toLowerCase(); value = s;
        if (!s) { if (req) fail(t.required); } else if (s.length > 254 || !EMAIL.test(s)) fail(t.invalidEmail);
        break;
      }
      case "phone": {
        const s = asText(raw); value = s;
        const digits = s.replace(/\D/g, "");
        if (!s) { if (req) fail(t.required); } else if (!/^[+\d\s().-]+$/.test(s) || digits.length < 6 || digits.length > 15) fail(t.invalidPhone);
        break;
      }
      case "number": {
        const s = asText(raw); value = s;
        if (!s) { if (req) fail(t.required); break; }
        const n = num(s);
        const min = optNum(item.data.min), max = optNum(item.data.max);
        if (Number.isNaN(n) || !Number.isFinite(n)) fail(t.invalidNumber);
        else if (min !== null && n < min) fail(fmt(t.minNumber, { n: min }));
        else if (max !== null && n > max) fail(fmt(t.maxNumber, { n: max }));
        else value = n;
        break;
      }
      case "dropdown": {
        const s = asText(raw); value = s;
        if (!s) { if (req) fail(t.required); } else if (!optionValues(item).includes(s)) fail(t.invalidOption);
        break;
      }
      case "choice": {
        const many = item.data.multiple === "many";
        const picked = asArray(raw).map((x) => x.trim()).filter(Boolean);
        const valid = optionValues(item);
        if (picked.length === 0) { if (req) fail(t.required); }
        else if (!many && picked.length > 1) fail(t.invalidOption);
        else if (picked.some((p) => !valid.includes(p))) fail(t.invalidOption);
        value = many ? [...new Set(picked)] : picked[0] ?? "";
        break;
      }
      case "checkbox": {
        const on = raw === true || raw === "true" || raw === "on" || raw === "yes";
        value = on;
        if (!on && req) fail(t.required);
        break;
      }
      case "date": {
        const s = asText(raw); value = s;
        if (!s) { if (req) fail(t.required); break; }
        const d = new Date(s + "T00:00:00Z");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) fail(t.invalidDate);
        break;
      }
      case "rating": {
        const s = typeof raw === "number" ? String(raw) : asText(raw); value = "";
        if (!s) { if (req) fail(t.required); break; }
        const n = Number(s), max = ratingMax(item);
        if (!/^\d{1,2}$/.test(s) || n < 1 || n > max) fail(t.invalidOption); else value = n;
        break;
      }
      case "yesno": {
        const s = raw === true ? "yes" : raw === false ? "no" : asText(raw).toLowerCase(); value = "";
        if (!s) { if (req) fail(t.required); }
        else if (s === "yes" || s === "true") value = true;
        else if (s === "no" || s === "false") value = false;
        else fail(t.invalidOption);
        break;
      }
      case "url": {
        const s = asText(raw); value = s;
        if (!s) { if (req) fail(t.required); break; }
        const u = cleanUrl(s);
        if (!u) fail(t.invalidUrl); else value = u;
        break;
      }
      case "address": {
        const o = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
        const street = asText(o.street), postalCode = asText(o.postalCode), city = asText(o.city);
        value = { street, postalCode, city };
        if (!street && !postalCode && !city) { if (req) fail(t.required); break; }
        if (!street || !city || (req && !postalCode)) fail(t.required); // a partly filled address needs at least street and city; a required one needs all three
        else if (street.length > 200 || city.length > 100) fail(t.tooLong);
        else if (postalCode && !/^[A-Za-z0-9][A-Za-z0-9 -]{1,9}$/.test(postalCode)) fail(t.invalidPostalCode);
        break;
      }
      case "file": {
        const f = raw as FileMeta | null | undefined;
        if (!f || typeof f !== "object") { if (req) fail(t.fileRequired); break; }
        if (f.size > MAX_FILE_BYTES) fail(t.fileSize);
        value = f;
        break;
      }
    }
    if (!errors[item.id]) values.push({ id: item.id, type: item.type, label, value });
  }
  return { errors, values };
}

/** Splits fields into steps at each page break (for multi-step forms). `page` is the break that opens the step. */
export function toSteps(items: Item[]): { page: Item | null; items: Item[] }[] {
  const steps: { page: Item | null; items: Item[] }[] = [{ page: null, items: [] }];
  for (const it of items) {
    if (it.type === "pagebreak") steps.push({ page: it, items: [] });
    else steps[steps.length - 1].items.push(it);
  }
  return steps.filter((s, i) => s.items.length > 0 || i === 0);
}
