// Create the photo bucket if it doesn't exist yet, for local development
// and CI, where the bucket lives in a throwaway S3 emulator:
//
//   node scripts/storage-init.mts
//
// Real buckets are created once by hand (see docs/deploy.md), so this
// isn't part of the image.
import {
  CreateBucketCommand,
  HeadBucketCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const {
  S3_ENDPOINT,
  S3_REGION = "auto",
  S3_BUCKET,
  S3_ACCESS_KEY_ID,
  S3_SECRET_ACCESS_KEY,
  S3_FORCE_PATH_STYLE,
} = process.env;
if (!S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) {
  console.error(
    "S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY must be set",
  );
  process.exit(1);
}

const s3 = new S3Client({
  endpoint: S3_ENDPOINT,
  region: S3_REGION,
  forcePathStyle: S3_FORCE_PATH_STYLE === "true",
  credentials: {
    accessKeyId: S3_ACCESS_KEY_ID,
    secretAccessKey: S3_SECRET_ACCESS_KEY,
  },
});

try {
  await s3.send(new HeadBucketCommand({ Bucket: S3_BUCKET }));
  console.log(`Bucket ${S3_BUCKET} already exists`);
} catch {
  await s3.send(new CreateBucketCommand({ Bucket: S3_BUCKET }));
  console.log(`Created bucket ${S3_BUCKET}`);
}
