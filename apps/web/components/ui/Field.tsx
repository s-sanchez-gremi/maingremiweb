// Accessible form-field primitives (public site). Every control has a visible <label>, hint and error are wired with
// aria-describedby, invalid state is exposed with aria-invalid and never relies on colour alone.
import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

type Common = { label: string; hint?: string; error?: string };

function Wrap({ id, label, hint, error, required, children }: Common & { id: string; required?: boolean; children: ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}{required && <span className="req" aria-hidden="true"> *</span>}</label>
      {children}
      {hint && <span className="hint" id={`${id}-hint`}>{hint}</span>}
      {error && <span className="error" id={`${id}-err`} role="alert">{error}</span>}
    </div>
  );
}
const describe = (id: string, c: Common) => [c.hint ? `${id}-hint` : "", c.error ? `${id}-err` : ""].filter(Boolean).join(" ") || undefined;

export function TextField({ label, hint, error, ...rest }: Common & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <Wrap id={id} label={label} hint={hint} error={error} required={rest.required}>
      <input id={id} type="text" aria-invalid={error ? true : undefined} aria-describedby={describe(id, { label, hint, error })} {...rest} />
    </Wrap>
  );
}

export function TextAreaField({ label, hint, error, ...rest }: Common & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <Wrap id={id} label={label} hint={hint} error={error} required={rest.required}>
      <textarea id={id} aria-invalid={error ? true : undefined} aria-describedby={describe(id, { label, hint, error })} {...rest} />
    </Wrap>
  );
}

export function SelectField({ label, hint, error, options, placeholder, ...rest }: Common & SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[]; placeholder?: string }) {
  const id = useId();
  return (
    <Wrap id={id} label={label} hint={hint} error={error} required={rest.required}>
      <select id={id} aria-invalid={error ? true : undefined} aria-describedby={describe(id, { label, hint, error })} {...rest}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Wrap>
  );
}

/** A single checkbox with its own label (consent, newsletter opt-in). */
export function CheckboxField({ label, hint, error, ...rest }: Common & Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const id = useId();
  return (
    <div className="field">
      <div className="choice">
        <input id={id} type="checkbox" aria-invalid={error ? true : undefined} aria-describedby={describe(id, { label, hint, error })} {...rest} />
        <label htmlFor={id}>{label}{rest.required && <span className="req" aria-hidden="true"> *</span>}</label>
      </div>
      {hint && <span className="hint" id={`${id}-hint`}>{hint}</span>}
      {error && <span className="error" id={`${id}-err`} role="alert">{error}</span>}
    </div>
  );
}

/** Radio group: the fieldset legend is the group label. */
export function RadioGroup({ legend, name, options, hint, error, required }: { legend: string; name: string; options: { value: string; label: string }[]; hint?: string; error?: string; required?: boolean }) {
  const id = useId();
  return (
    <fieldset className="field" aria-describedby={describe(id, { label: legend, hint, error })}>
      <legend>{legend}{required && <span className="req" aria-hidden="true"> *</span>}</legend>
      {options.map((o, i) => (
        <div className="choice" key={o.value}>
          <input id={`${id}-${i}`} type="radio" name={name} value={o.value} required={required} />
          <label htmlFor={`${id}-${i}`}>{o.label}</label>
        </div>
      ))}
      {hint && <span className="hint" id={`${id}-hint`}>{hint}</span>}
      {error && <span className="error" id={`${id}-err`} role="alert">{error}</span>}
    </fieldset>
  );
}
