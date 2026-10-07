// Prefill from the address (Forms v2, item 8): a link like /ca/form/inscripcio?nom=Anna&empresa=Gr%C3%A0fiques fills in fields.
// Whitelisted: only a field that staff gave a link name (`prefill`) is ever filled, nothing else in the address is read, and the value
// goes through the same checks as a typed answer (an option that does not exist, a mark outside the scale or a malformed email is
// simply ignored). The visitor sees the value in the field and can change it; the server validates the answer again as always.
// This runs in the browser only: the page itself stays the same cached page for everybody, and nothing is sent anywhere.
import { formTypeByName, type Item } from "./fieldTypes";
import { PREFILL_TYPES, prefillKeyOf } from "./prefill-rules";
import { validateAnswers, type Answers } from "./validate";

const MAX_LEN = 500;

/** One value from the address, in the form the field's input keeps it (a text, a mark, "yes"/"no", a list of options…), or undefined when it does not suit the field. */
function toAnswer(item: Item, raw: string): unknown {
  const text = raw.trim().slice(0, MAX_LEN);
  if (!text) return undefined;
  switch (item.type) {
    case "checkbox": return /^(1|true|yes|si|sí|on)$/i.test(text) ? true : undefined; // a box can only be pre-ticked
    case "yesno": { const v = text.toLowerCase(); return ["yes", "si", "sí", "true", "1"].includes(v) ? "yes" : ["no", "false", "0"].includes(v) ? "no" : undefined; }
    case "rating": return /^\d{1,2}$/.test(text) ? Number(text) : undefined;
    case "choice": return item.data.multiple === "many" ? text.split("|").map((x) => x.trim()).filter(Boolean) : text;
    default: return text;
  }
}

/** The answers the address fills in for these fields. `params` is the page's query string. */
export function prefillAnswers(items: Item[], params: URLSearchParams): Answers {
  const out: Answers = {};
  for (const item of items) {
    const key = prefillKeyOf(item);
    if (!key || !PREFILL_TYPES.includes(item.type) || !formTypeByName[item.type]?.input) continue;
    const raw = params.get(key);
    if (raw === null) continue;
    const answer = toAnswer(item, raw);
    if (answer === undefined) continue;
    // the very same checks as a typed answer (a one-field form: conditions on other fields cannot hide it)
    const { errors } = validateAnswers([{ ...item, data: { ...item.data, required: "no", showField: "", showExtra: [] } }], { [item.id]: answer }, "ca");
    if (!errors[item.id]) out[item.id] = answer;
  }
  return out;
}
