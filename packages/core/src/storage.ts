// S3-compatible object storage (MinIO-style locally, an EU S3 provider in production).
import { DeleteObjectsCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const bucket = () => process.env.S3_BUCKET ?? "apex-media";

const g = globalThis as unknown as { __s3?: S3Client };
const client = () =>
  (g.__s3 ??= new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? "eu-west-1",
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "0", // set to 0 if the provider requires bucket-name hosts
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY ?? "", secretAccessKey: process.env.S3_SECRET_KEY ?? "" },
  }));

/** `filename` (plain ASCII) is what a browser names the file when it is saved. */
export async function putObject(key: string, body: Buffer, contentType: string, filename?: string) {
  await client().send(new PutObjectCommand({
    Bucket: bucket(), Key: key, Body: body, ContentType: contentType, CacheControl: "public, max-age=31536000, immutable",
    ContentDisposition: filename ? `inline; filename="${filename.replace(/[^\w.\-]+/g, "_")}"` : undefined,
  }));
}

export async function deletePrefix(prefix: string) {
  const list = await client().send(new ListObjectsV2Command({ Bucket: bucket(), Prefix: prefix }));
  const keys = (list.Contents ?? []).map((o) => ({ Key: o.Key! }));
  if (keys.length) await client().send(new DeleteObjectsCommand({ Bucket: bucket(), Delete: { Objects: keys } }));
}

// ---- PRIVATE bucket: files sent by visitors (never publicly readable; staff get short-lived signed links) ----
const privateBucket = () => process.env.S3_PRIVATE_BUCKET ?? "apex-private";

export async function putPrivate(key: string, body: Buffer, contentType: string) {
  await client().send(new PutObjectCommand({ Bucket: privateBucket(), Key: key, Body: body, ContentType: contentType }));
}

export async function deletePrivatePrefix(prefix: string) {
  const list = await client().send(new ListObjectsV2Command({ Bucket: privateBucket(), Prefix: prefix }));
  const keys = (list.Contents ?? []).map((o) => ({ Key: o.Key! }));
  if (keys.length) await client().send(new DeleteObjectsCommand({ Bucket: privateBucket(), Delete: { Objects: keys } }));
}

export async function getPrivateBytes(key: string): Promise<Buffer> {
  const r = await client().send(new GetObjectCommand({ Bucket: privateBucket(), Key: key }));
  return Buffer.from(await r.Body!.transformToByteArray());
}

/** A link valid for 60 seconds that forces a download (never rendered in the browser). */
export const privateDownloadUrl = (key: string, filename: string) =>
  getSignedUrl(client(), new GetObjectCommand({
    Bucket: privateBucket(), Key: key,
    ResponseContentDisposition: `attachment; filename="${filename.replace(/[^\w.\- ]+/g, "_")}"`,
  }), { expiresIn: 60 });
