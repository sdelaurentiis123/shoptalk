import {
  S3Client,
  CreateMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  UploadPartCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

let _client: S3Client | null = null;

export function r2() {
  if (_client) return _client;
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const endpoint = process.env.R2_ENDPOINT || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "");
  if (!accountId || !accessKeyId || !secretAccessKey || !endpoint) {
    throw new Error("R2 env vars missing (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)");
  }
  _client = new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: false,
  });
  return _client;
}

export const R2_BUCKET = () => process.env.R2_BUCKET || "shoptalk-sops";

export async function startMultipart(key: string, contentType: string): Promise<string> {
  const out = await r2().send(
    new CreateMultipartUploadCommand({ Bucket: R2_BUCKET(), Key: key, ContentType: contentType }),
  );
  if (!out.UploadId) throw new Error("R2: no UploadId returned");
  return out.UploadId;
}

export async function presignPart(key: string, uploadId: string, partNumber: number, ttlSec = 900) {
  const cmd = new UploadPartCommand({
    Bucket: R2_BUCKET(),
    Key: key,
    UploadId: uploadId,
    PartNumber: partNumber,
  });
  return getSignedUrl(r2(), cmd, { expiresIn: ttlSec });
}

export async function completeMultipart(
  key: string,
  uploadId: string,
  parts: { PartNumber: number; ETag: string }[],
) {
  await r2().send(
    new CompleteMultipartUploadCommand({
      Bucket: R2_BUCKET(),
      Key: key,
      UploadId: uploadId,
      MultipartUpload: { Parts: parts.sort((a, b) => a.PartNumber - b.PartNumber) },
    }),
  );
}

export async function abortMultipart(key: string, uploadId: string) {
  await r2().send(new AbortMultipartUploadCommand({ Bucket: R2_BUCKET(), Key: key, UploadId: uploadId }));
}

export async function presignGet(key: string, ttlSec = 3600) {
  return getSignedUrl(r2(), new GetObjectCommand({ Bucket: R2_BUCKET(), Key: key }), { expiresIn: ttlSec });
}

export async function getObjectBuffer(key: string): Promise<Buffer> {
  const out = await r2().send(new GetObjectCommand({ Bucket: R2_BUCKET(), Key: key }));
  if (!out.Body) throw new Error("R2: empty body");
  const chunks: Uint8Array[] = [];
  const stream = out.Body as unknown as AsyncIterable<Uint8Array>;
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export async function putObject(key: string, body: Buffer, contentType: string) {
  await r2().send(new PutObjectCommand({ Bucket: R2_BUCKET(), Key: key, Body: body, ContentType: contentType }));
}

export async function deleteObject(key: string) {
  await r2().send(new DeleteObjectCommand({ Bucket: R2_BUCKET(), Key: key }));
}
