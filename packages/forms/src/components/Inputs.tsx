"use client";
import { useId } from "react";
import { CheckboxField, SelectField, TextAreaField, TextField } from "@apex/ui/components/Field";
import { lt, optionValues, type Item } from "@apex/forms/fieldTypes";
import { msgs } from "@apex/forms/messages";
import type { Locale } from "@apex/db/schema";

type Value = string | string[] | boolean | undefined;
const AUTOCOMPLETE: Record<string, string> = { name: "name", email: "email", phone: "tel", company: "organization" };

export function FieldInput({ item, locale, value, error, onChange, onFile }: {
  item: Item; locale: Locale; value: Value; error?: string; onChange: (v: Value) => void; onFile: (f: File | null) => void;
}) {
  const label = lt(item.data.label, locale);
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
