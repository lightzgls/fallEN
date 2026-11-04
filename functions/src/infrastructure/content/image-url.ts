import { bucket } from "../firebase/runtime.js";
import { fail } from "../../shared/errors.js";
export async function imageReadUrl(
  storagePath: string,
): Promise<{ url: string; expiresAt: string }> {
  const expires = Date.now() + 15 * 60_000;
  const file = bucket.file(storagePath);
  if (process.env.STORAGE_EMULATOR_HOST) {
    const [metadata] = await file.getMetadata();
    const tokens = metadata.metadata?.firebaseStorageDownloadTokens;
    if (typeof tokens !== "string" || !tokens.split(",")[0]?.trim()) {
      fail(
        "ASSET_UNAVAILABLE",
        "The emulator image has no Firebase download token",
      );
    }
    const token = tokens.split(",")[0].trim();
    const host = process.env.STORAGE_EMULATOR_HOST.replace(/^https?:\/\//, "");
    return {
      url: `http://${host}/v0/b/${encodeURIComponent(bucket.name)}/o/${encodeURIComponent(storagePath)}?alt=media&token=${encodeURIComponent(token)}`,
      expiresAt: new Date(expires).toISOString(),
    };
  }
  const [url] = await file.getSignedUrl({
    version: "v4",
    action: "read",
    expires,
  });
  return { url, expiresAt: new Date(expires).toISOString() };
}
