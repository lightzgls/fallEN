import sharp from "sharp";
import { bucket } from "../firebase/runtime.js";
import { id, hash } from "../../shared/values.js";
import { fail } from "../../shared/errors.js";
interface AvatarUploadSource {
  stagingPath: string;
  mimeType: string;
  sizeBytes: number;
}
export async function prepareAvatarImage(
  ownerUid: string,
  assetId: string,
  asset: AvatarUploadSource,
) {
  const file = bucket.file(asset.stagingPath);
  const [metadata] = await file.getMetadata();
  if (
    Number(metadata.size) !== asset.sizeBytes ||
    metadata.contentType !== asset.mimeType
  )
    fail("VALIDATION_FAILED");
  const [bytes] = await file.download();
  let normalized: Buffer;
  try {
    const decoder = sharp(bytes, {
      limitInputPixels: 16_000_000,
      failOn: "warning",
    });
    const info = await decoder.metadata();
    const expectedFormat = {
      "image/jpeg": "jpeg",
      "image/png": "png",
      "image/webp": "webp",
    }[asset.mimeType as "image/jpeg" | "image/png" | "image/webp"];
    if (
      info.format !== expectedFormat ||
      !info.width ||
      !info.height ||
      info.width * info.height > 16_000_000 ||
      (info.pages ?? 1) > 1
    )
      fail("VALIDATION_FAILED");
    normalized = await decoder
      .rotate()
      .resize(512, 512, { fit: "cover" })
      .webp({ quality: 85 })
      .toBuffer();
  } catch {
    return fail("VALIDATION_FAILED", "Ảnh không hợp lệ.");
  }
  const storagePath = `avatars/${ownerUid}/normalized/${assetId}`;
  await bucket
    .file(storagePath)
    .save(normalized, {
      contentType: "image/webp",
      resumable: false,
      metadata:
        process.env.FIREBASE_STORAGE_EMULATOR_HOST ||
        process.env.STORAGE_EMULATOR_HOST
          ? { metadata: { firebaseStorageDownloadTokens: id() } }
          : undefined,
      preconditionOpts: { ifGenerationMatch: 0 },
    })
    .catch(async (error) => {
      if ((error as { code?: number }).code !== 412) throw error;
    });

  return {
    storagePath,
    contentHash: hash(normalized.toString("base64")),
    normalizedBytes: normalized.length,
  };
}
