// Staff download the signed document: a session check, then a link that works for 60 seconds and forces a download (the same rule as
// the other private files of the system). Every download is written to the record.
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@apex/core/auth";
import { privateDownloadUrl } from "@apex/core/storage";
import { logDownload, signedFileName } from "@/lib/downloads";
import { getRequest } from "@/lib/requests";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("sign:write");
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const r = await getRequest(id.data);
  if (!r || !r.request.sealedKey) notFound();
  await logDownload(r.request.id, { staffId: user.id });
  redirect(await privateDownloadUrl(r.request.sealedKey, signedFileName(r.document.title)));
}
