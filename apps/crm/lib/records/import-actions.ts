"use server";
import { requireUser } from "@apex/core/auth";
import { importCsv, MAX_BYTES, type ImportResult } from "./csv-import";
import { screenEntity } from "./registry";

const empty = (fatal: string): ImportResult => ({ dryRun: true, total: 0, valid: 0, created: 0, errors: [], columns: [], ignored: [], fatal });

/** useActionState action: validate (dry run, the default) or import the uploaded CSV. */
export async function importCsvAction(_prev: ImportResult | null, fd: FormData): Promise<ImportResult> {
  const e = screenEntity(String(fd.get("entity") ?? ""));
  if (!e) return empty("Llista desconeguda");
  const user = await requireUser(e.perm);
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return empty("Tria un fitxer CSV");
  if (file.size > MAX_BYTES) return empty("El fitxer és massa gran (màx. 5 MB)");
  return importCsv(e, await file.text(), { dryRun: fd.get("validate") === "on", skipInvalid: fd.get("skipInvalid") === "on" }, user);
}
