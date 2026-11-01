import "server-only";

import {
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import { storageEnv } from "@/lib/env";

let client: S3Client | undefined;

function s3() {
  if (!client) {
    const env = storageEnv();
    client = new S3Client({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      },
    });
  }
  return client;
}

export async function putObject(
  key: string,
  body: Uint8Array,
  contentType: string,
) {
  await s3().send(
    new PutObjectCommand({
      Bucket: storageEnv().S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

// The object's bytes as a web stream, or null if it doesn't exist.
export async function getObject(key: string) {
  try {
    const result = await s3().send(
      new GetObjectCommand({ Bucket: storageEnv().S3_BUCKET, Key: key }),
    );
    return result.Body?.transformToWebStream() ?? null;
  } catch (error) {
    if (error instanceof NoSuchKey) return null;
    throw error;
  }
}
