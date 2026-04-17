import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import { Readable } from "stream";

let _client: S3Client | null = null;

export function r2(): S3Client {
  if (_client) return _client;
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const endpoint =
    process.env.R2_ENDPOINT ||
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "");
  if (!accountId || !accessKeyId || !secretAccessKey || !endpoint) {
    throw new Error(
      "R2 env vars missing (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)",
    );
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

export async function downloadToFile(
  key: string,
  localPath: string,
): Promise<void> {
  const out = await r2().send(
    new GetObjectCommand({ Bucket: R2_BUCKET(), Key: key }),
  );
  if (!out.Body) throw new Error("R2: empty body");
  const readable = out.Body as unknown as Readable;
  const writable = createWriteStream(localPath);
  await pipeline(readable, writable);
}

export async function getObjectBuffer(key: string): Promise<Buffer> {
  const out = await r2().send(
    new GetObjectCommand({ Bucket: R2_BUCKET(), Key: key }),
  );
  if (!out.Body) throw new Error("R2: empty body");
  const chunks: Uint8Array[] = [];
  const stream = out.Body as unknown as AsyncIterable<Uint8Array>;
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export async function putObject(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  await r2().send(
    new PutObjectCommand({
      Bucket: R2_BUCKET(),
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

export async function presignGet(
  key: string,
  ttlSec = 3600,
): Promise<string> {
  return getSignedUrl(
    r2(),
    new GetObjectCommand({ Bucket: R2_BUCKET(), Key: key }),
    { expiresIn: ttlSec },
  );
}

export async function deleteObject(key: string): Promise<void> {
  await r2().send(
    new DeleteObjectCommand({ Bucket: R2_BUCKET(), Key: key }),
  );
}
