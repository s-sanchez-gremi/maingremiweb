// S3-compatible object storage (MinIO-style locally, an EU S3 provider in production).
import { DeleteObjectsCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const bucket = () => process.env.S3_BUCKET ?? "apex-media";

const g = globalThis as unknown as { __s3?: S3Client };
const client = () =>
  (g.__s3 ??= new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? "eu-west-1",
    forcePathStyle: true,
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY ?? "", secretAccessKey: process.env.S3_SECRET_KEY ?? "" },
  }));

export async function putObject(key: string, body: Buffer, contentType: string) {
  await client().send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType, CacheControl: "public, max-age=31536000, immutable" }));
}

export async function deletePrefix(prefix: string) {
  const list = await client().send(new ListObjectsV2Command({ Bucket: bucket(), Prefix: prefix }));
  const keys = (list.Contents ?? []).map((o) => ({ Key: o.Key! }));
  if (keys.length) await client().send(new DeleteObjectsCommand({ Bucket: bucket(), Delete: { Objects: keys } }));
}
