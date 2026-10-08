"use client";
import { useId } from "react";
import { CheckboxField, SelectField, TextAreaField, TextField } from "@apex/ui/components/Field";
import { RichText } from "@apex/ui/richtext";
import { lt, optionValues, ratingMax, type Item } from "@apex/forms/fieldTypes";
import { fmt, msgs } from "@apex/forms/messages";
import type { Locale } from "@apex/db/schema";

type Value = string | string[] | boolean | Record<string, string> | undefined;
const AUTOCOMPLETE: Record<string, string> = { name: "name", email: "email", phone: "tel", company: "organization" };

export function FieldInput({ item, locale, value, error, onChange, onFile }: {
  item: Item; locale: Locale; value: Value; error?: string; onChange: (v: Value) => void; onFile: (f: File | null) => void;
}) {
  const label = lt(item.data.label, locale);
  if (item.type === "calculated") {
    if (item.data.show !== "yes") return null; // a result only staff see
    return <div data-field-id={item.id} className="field"><strong>{label}</strong> <output aria-live="polite">{typeof value === "string" ? value : ""}</output></div>;
  }
  const hint = lt(item.data.help, locale) || undefined;
  const required = item.data.required === "yes";
  const common = { label, hint, error, required };
  const ac = AUTOCOMPLETE[String(item.data.map ?? "")];
  const str = typeof value === "string" ? value : "";

  let control: React.ReactNode = null;
  switch (item.type) {
    case "text": control = <TextField {...common} value={str} autoComplete={ac} onChange={(e) => onChange(e.target.value)} />; break;
    case "textarea": control = <TextAreaField {...common} value={str} onChange={(e) => onChange(e.target.value)} />; break;
    case "email": control = <TextField {...common} type="email" inputMode="email" value={str} autoComplete={ac ?? "email"} onChange={(e) => onChange(e.target.value)} />; break;
    case "phone": control = <TextField {...common} type="tel" inputMode="tel" value={str} autoComplete={ac ?? "tel"} onChange={(e) => onChange(e.target.value)} />; break;
    case "number": control = <TextField {...common} inputMode="decimal" value={str} onChange={(e) => onChange(e.target.value)} />; break;
    case "date": control = <TextField {...common} type="date" value={str} onChange={(e) => onChange(e.target.value)} />; break;
    case "dropdown": {
      const opts = ((item.data.options as { label: Record<string, string> }[]) ?? []).map((o, i) => ({ value: optionValues(item)[i], label: lt(o.label, locale) }));
      control = <SelectField {...common} placeholder={msgs(locale).choose} options={opts} value={str} onChange={(e) => onChange(e.target.value)} />;
      break;
    }
    case "choice": control = <ChoiceGroup item={item} locale={locale} value={value} error={error} onChange={onChange} />; break;
    case "checkbox": control = <CheckboxField label={label} hint={hint} error={error} required={required} checked={value === true} onChange={(e) => onChange(e.target.checked)} />; break;
    case "rating": control = <RatingField item={item} locale={locale} value={value} error={error} onChange={onChange} />; break;
    case "yesno": control = <YesNoField item={item} locale={locale} value={value} error={error} onChange={onChange} />; break;
    case "url": control = <TextField {...common} type="text" inputMode="url" autoComplete="url" value={str} onChange={(e) => onChange(e.target.value)} />; break;
    case "address": control = <AddressField item={item} locale={locale} value={value} error={error} onChange={onChange} />; break;
    case "heading": control = <h3 className="form-heading">{lt(item.data.title, locale)}</h3>; break;
    case "paragraph": control = <RichText body={lt(item.data.body, locale)} />; break;
    case "file": control = <FileField label={label} hint={hint} error={error} required={required} onFile={onFile} locale={locale} />; break;
  }
  return <div data-field-id={item.id}>{control}</div>;
}

function ChoiceGroup({ item, locale, value, error, onChange }: { item: Item; locale: Locale; value: Value; error?: string; onChange: (v: Value) => void }) {
  const id = useId();
  const many = item.data.multiple === "many";
  const values = optionValues(item);
  const opts = (item.data.options as { label: Record<string, string> }[]) ?? [];
  const picked = Array.isArray(value) ? value : typeof value === "string" && value ? [value] : [];
  const hint = lt(item.data.help, locale);
  const describedBy = [hint && `${id}-hint`, error && `${id}-err`].filter(Boolean).join(" ") || undefined;
  return (
    <fieldset className="field" aria-describedby={describedBy}>
      <legend>{lt(item.data.label, locale)}{item.data.required === "yes" && <span className="req" aria-hidden="true"> *</span>}</legend>
      {opts.map((o, i) => (
        <div className="choice" key={values[i]}>
          <input
            id={`${id}-${i}`} type={many ? "checkbox" : "radio"} name={id} value={values[i]} checked={picked.includes(values[i])}
            onChange={(e) => onChange(many ? (e.target.checked ? [...picked, values[i]] : picked.filter((p) => p !== values[i])) : values[i])}
          />
          <label htmlFor={`${id}-${i}`}>{lt(o.label, locale)}</label>
        </div>
      ))}
      {hint && <span className="hint" id={`${id}-hint`}>{hint}</span>}
      {error && <span className="error" id={`${id}-err`} role="alert">{error}</span>}
    </fieldset>
  );
}

/** A group of radio buttons with the field's label as its legend, hint and error wired with aria-describedby. */
function RadioGroup({ item, locale, error, children }: { item: Item; locale: Locale; error?: string; children: (name: string) => React.ReactNode }) {
  const id = useId();
  const hint = lt(item.data.help, locale);
  const describedBy = [hint && `${id}-hint`, error && `${id}-err`].filter(Boolean).join(" ") || undefined;
  return (
    <fieldset className="field" aria-describedby={describedBy}>
      <legend>{lt(item.data.label, locale)}{item.data.required === "yes" && <span className="req" aria-hidden="true"> *</span>}</legend>
      {children(id)}
      {hint && <span className="hint" id={`${id}-hint`}>{hint}</span>}
      {error && <span className="error" id={`${id}-err`} role="alert">{error}</span>}
    </fieldset>
  );
}
const ROW: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: "0 var(--sp-5, 20px)" };

function RatingField({ item, locale, value, error, onChange }: { item: Item; locale: Locale; value: Value; error?: string; onChange: (v: Value) => void }) {
  const max = ratingMax(item), t = msgs(locale);
  const low = lt(item.data.lowLabel, locale), high = lt(item.data.highLabel, locale);
  const marks = [low && fmt(t.scaleFrom, { a: 1, label: low }), high && fmt(t.scaleFrom, { a: max, label: high })].filter(Boolean).join(" · ");
  return (
    <RadioGroup item={item} locale={locale} error={error}>
      {(id) => (
        <>
          <div style={ROW}>
            {Array.from({ length: max }, (_, i) => String(i + 1)).map((n) => (
              <div className="choice" key={n}>
                <input id={`${id}-${n}`} type="radio" name={id} value={n} checked={value === n} onChange={() => onChange(n)} />
                <label htmlFor={`${id}-${n}`}>{n}</label>
              </div>
            ))}
          </div>
          {marks && <span className="hint">{marks}</span>}
        </>
      )}
    </RadioGroup>
  );
}

function YesNoField({ item, locale, value, error, onChange }: { item: Item; locale: Locale; value: Value; error?: string; onChange: (v: Value) => void }) {
  const t = msgs(locale);
  return (
    <RadioGroup item={item} locale={locale} error={error}>
      {(id) => (
        <div style={ROW}>
          {([["yes", t.yes], ["no", t.no]] as const).map(([v, text]) => (
            <div className="choice" key={v}>
              <input id={`${id}-${v}`} type="radio" name={id} value={v} checked={value === v} onChange={() => onChange(v)} />
              <label htmlFor={`${id}-${v}`}>{text}</label>
            </div>
          ))}
        </div>
      )}
    </RadioGroup>
  );
}

function AddressField({ item, locale, value, error, onChange }: { item: Item; locale: Locale; value: Value; error?: string; onChange: (v: Value) => void }) {
  const id = useId(), t = msgs(locale);
  const v = (value && typeof value === "object" && !Array.isArray(value) ? value : {}) as Record<string, string>;
  const set = (k: string, x: string) => onChange({ street: "", postalCode: "", city: "", ...v, [k]: x });
  const hint = lt(item.data.help, locale);
  const required = item.data.required === "yes";
  const describedBy = [hint && `${id}-hint`, error && `${id}-err`].filter(Boolean).join(" ") || undefined;
  return (
    <fieldset className="field" aria-describedby={describedBy}>
      <legend>{lt(item.data.label, locale)}{required && <span className="req" aria-hidden="true"> *</span>}</legend>
      <TextField label={t.street} required={required} autoComplete="street-address" value={v.street ?? ""} onChange={(e) => set("street", e.target.value)} />
      <div style={{ display: "grid", gridTemplateColumns: "minmax(110px, 1fr) minmax(0, 2fr)", gap: "var(--sp-3, 12px)" }}>
        <TextField label={t.postalCode} required={required} autoComplete="postal-code" value={v.postalCode ?? ""} onChange={(e) => set("postalCode", e.target.value)} />
        <TextField label={t.city} required={required} autoComplete="address-level2" value={v.city ?? ""} onChange={(e) => set("city", e.target.value)} />
      </div>
      {hint && <span className="hint" id={`${id}-hint`}>{hint}</span>}
      {error && <span className="error" id={`${id}-err`} role="alert">{error}</span>}
    </fieldset>
  );
}

function FileField({ label, hint, error, required, onFile, locale }: { label: string; hint?: string; error?: string; required: boolean; onFile: (f: File | null) => void; locale: Locale }) {
  const id = useId();
  const help = [hint, { ca: "PDF, imatge, Word o Excel · màx. 10 MB", es: "PDF, imagen, Word o Excel · máx. 10 MB", en: "PDF, image, Word or Excel · max 10 MB" }[locale]].filter(Boolean).join(" — ");
  return (
    <div className="field">
      <label htmlFor={id}>{label}{required && <span className="req" aria-hidden="true"> *</span>}</label>
      <input id={id} type="file" accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.docx,.xlsx" aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-hint${error ? ` ${id}-err` : ""}`} onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
      <span className="hint" id={`${id}-hint`}>{help}</span>
      {error && <span className="error" id={`${id}-err`} role="alert">{error}</span>}
    </div>
  );
}
