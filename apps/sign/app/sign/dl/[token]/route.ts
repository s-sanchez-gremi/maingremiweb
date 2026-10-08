// A signer's copy of the signed document, from the personal link in the email that told them everyone had signed. The file is read through
// this app (never a storage address), checked against the hash taken when it was sealed, and every download is written to the record.
import { hashToken, looksLikeToken } from "@apex/sign/token";
import { logDownload, readSealed, resolveDownload, signedFileName } from "@/lib/downloads";
import { contextOf, guessLimited, viewLimited } from "@/lib/guard";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = contextOf(req.headers);
  const plain = (status: number) => new Response(status === 429 ? "Too many requests" : "Not found", { status, headers: { "cache-control": "no-store" } });
  if (!looksLikeToken(token)) return plain(guessLimited(ctx) ? 429 : 404);
  if (viewLimited(ctx, hashToken(token))) return plain(429);
  const d = await resolveDownload(token);
  if (!d) return plain(guessLimited(ctx) ? 429 : 404);
  const bytes = await readSealed(d.request);
  await logDownload(d.request.id, { signerId: d.signer.id }, ctx);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": "application/pdf", "content-length": String(bytes.length), "x-content-type-options": "nosniff", "cache-control": "private, no-store",
      "content-disposition": `attachment; filename="${signedFileName(d.document.title)}"`,
    },
  });
}
