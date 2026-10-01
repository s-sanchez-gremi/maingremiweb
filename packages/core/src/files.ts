// Visitor uploads: type is decided from the file's bytes (never the browser's claim). Allowed: PDF, images, Word, Excel.
export type Upload = { name: string; bytes: Buffer };

const OFFICE: Record<string, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export function classifyUpload(name: string, b: Buffer): { mime: string; ext: string } | null {
  const ext = (name.split(".").pop() ?? "").toLowerCase();
  if (b.subarray(0, 5).toString("latin1") === "%PDF-") return { mime: "application/pdf", ext: "pdf" };
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: "image/png", ext: "png" };
  if (b.subarray(0, 4).toString("latin1") === "GIF8") return { mime: "image/gif", ext: "gif" };
  if (b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return { mime: "image/webp", ext: "webp" };
  if (b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04 && OFFICE[ext] && b.subarray(0, 4096).includes("[Content_Types].xml")) return { mime: OFFICE[ext], ext };
  return null;
}

export const safeName = (name: string) => name.replace(/[^\w.\- ]+/g, "").trim().slice(0, 100) || "fitxer";
