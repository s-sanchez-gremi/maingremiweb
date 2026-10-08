// The PDF to be signed, for the person whose link this is. The file never leaves our servers by a storage address: it is read from the
// private bucket here and sent through, after the link has been checked, so the link is the only way to it.
import { getPrivateBytes } from "@apex/core/storage";
import { hashToken, looksLikeToken } from "@apex/sign/token";
import { contextOf, guessLimited, viewLimited } from "@/lib/guard";
import { resolveToken } from "@/lib/signing";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = contextOf(req.headers);
  const plain = (status: number) => new Response(status === 429 ? "Too many requests" : "Not found", { status, headers: { "cache-control": "no-store" } });
  if (!looksLikeToken(token)) return plain(guessLimited(ctx) ? 429 : 404);
  if (viewLimited(ctx, hashToken(token))) return plain(429);
  const r = await resolveToken(token);
  if (!r) return plain(guessLimited(ctx) ? 429 : 404);
  const bytes = await getPrivateBytes(r.document.fileKey);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": "application/pdf", "content-length": String(bytes.length),
      "content-disposition": 'inline; filename="document.pdf"', "cache-control": "private, no-store", "x-content-type-options": "nosniff",
    },
  });
}
