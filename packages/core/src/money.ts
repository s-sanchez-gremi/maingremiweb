// Money is always integer cents; VAT is a rate in basis points (2100 = 21 %). One rounding rule: half up, on the VAT of the base.
export const VAT_RATES = [0, 400, 1000, 2100] as const; // Spanish rates: exempt, super-reduced, reduced, general

/** "1.234,56", "1234,56", "1234.56", "12" -> cents. null when it is not a valid amount (comma or dot as decimal; at most 2 decimals). */
export function parseEuros(input: string): number | null {
  let s = input.trim().replace(/\s|€/g, "");
  if (!s) return null;
  const neg = s.startsWith("-");
  if (neg) s = s.slice(1);
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");  // 1.234,56
  else if (/^\d{1,3}(,\d{3})+\.\d{1,2}$/.test(s)) s = s.replace(/,/g, "");                      // 1,234.56 (a comma-thousands amount WITHOUT decimals, "12,345", is ambiguous: refused)
  else if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(",", ".");                                    // 1234,56
  else if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;                                           // 1234 / 1234.56
  const [i, d = ""] = s.split(".");
  const cents = Number(i) * 100 + Number((d + "00").slice(0, 2));
  return Number.isSafeInteger(cents) ? (neg ? -cents : cents) : null;
}

export const formatEuros = (cents: number) =>
  new Intl.NumberFormat("ca-ES", { style: "currency", currency: "EUR" }).format(cents / 100);

/** Plain "1234,56" for forms and CSV (no thousands separator, no currency sign). */
export const plainEuros = (cents: number) => (cents < 0 ? "-" : "") + Math.floor(Math.abs(cents) / 100) + "," + String(Math.abs(cents) % 100).padStart(2, "0");

/** VAT amount for a base, rounded half up (away from zero for negatives). */
export function vatOf(baseCents: number, rateBp: number): number {
  const v = (Math.abs(baseCents) * rateBp) / 10000;
  const r = Math.floor(v + 0.5 + 1e-9);
  return baseCents < 0 ? -r : r;
}

export const withVat = (baseCents: number, rateBp: number) => { const vat = vatOf(baseCents, rateBp); return { base: baseCents, vat, total: baseCents + vat }; };
