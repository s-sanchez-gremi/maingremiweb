// Tiny declarative field language. The admin form AND the Zod validation are generated from these.
import { z } from "zod";
import { blockDefs } from "./blocks";

export type Field =
  | { name: string; label: string; kind: "text" | "textarea" | "image" | "link" | "form" | "entry" | "ltext" | "ltextarea" | "fieldref"; required?: boolean }
  | { name: string; label: string; kind: "select"; options: { value: string; label: string }[]; required?: boolean }
  | { name: string; label: string; kind: "embed"; required?: boolean }
  | { name: string; label: string; kind: "list"; fields: Field[]; max?: number }
  | { name: string; label: string; kind: "blocks"; max?: number }; // typed blocks from sections/blocks.ts

// Embeds: pasted link only, YouTube and Adobe hosts only.
const EMBED_HOSTS = ["youtube.com", "youtu.be", "express.adobe.com", "acrobat.adobe.com", "creativecloud.adobe.com", "adobe.com"];
export function isAllowedEmbed(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && EMBED_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith("." + h));
  } catch {
    return false;
  }
}

const isLink = (v: string) => v === "" || v.startsWith("/") || /^https?:\/\//.test(v) || /^mailto:/.test(v);

export function schemaFor(field: Field): z.ZodType {
  switch (field.kind) {
    case "text":
    case "textarea":
      return field.required ? z.string().trim().min(1) : z.string().default("");
    case "ltext": {  // one text per language; Catalan is the required fallback
      const one = z.string().trim().max(500).default("");
      return z.object({ ca: field.required ? one.pipe(z.string().min(1)) : one, es: one, en: one }).default({ ca: "", es: "", en: "" });
    }
    case "ltextarea": {
      const one = z.string().trim().max(2000).default("");
      return z.object({ ca: field.required ? one.pipe(z.string().min(1)) : one, es: one, en: one }).default({ ca: "", es: "", en: "" });
    }
    case "fieldref": // id of an earlier form field ("" = none)
      return z.string().default("");
    case "image":   // media id
    case "form":    // form id
    case "entry": { // entry id
      const id = z.string().uuid();
      return field.required ? id : id.or(z.literal("")).default("");
    }
    case "link": {
      const l = z.string().refine(isLink, "invalid link");
      return field.required ? l.refine((v) => v !== "", "required") : l.default("");
    }
    case "select":
      return z.enum(field.options.map((o) => o.value) as [string, ...string[]]).default(field.options[0].value);
    case "embed": {
      const e = z.string().refine((v) => isAllowedEmbed(v), "Only YouTube and Adobe links are allowed");
      return field.required ? e : e.or(z.literal("")).default("");
    }
    case "list":
      return z.array(z.object(shape(field.fields))).max(field.max ?? 24).default([]);
    case "blocks":
      return z.array(blockSchemaFor()).max(field.max ?? 20).default([]);
  }
}

let blockUnion: z.ZodType | undefined;
/** One block (any type from sections/blocks.ts). Exported for the editor preview, which checks blocks one by one. */
export function blockSchemaFor(): z.ZodType {
  if (!blockUnion) {
    const v = blockDefs.map((d) => z.object({ id: z.string().min(1).max(64), type: z.literal(d.name), data: z.object(shape(d.fields as unknown as Field[])) }));
    blockUnion = z.discriminatedUnion("type", v as unknown as [(typeof v)[0], ...typeof v]);
  }
  return blockUnion;
}

export function shape(fields: Field[]): Record<string, z.ZodType> {
  return Object.fromEntries(fields.map((f) => [f.name, schemaFor(f)]));
}
