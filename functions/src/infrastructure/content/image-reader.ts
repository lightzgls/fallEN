import { z } from "zod";
import {
  db,
  bucket,
  assertActive,
  fail,
  parse,
  requireDoc,
  type Actor,
  type Data,
} from "../../shared/core.js";

export interface AssetContext {
  assetId: string;
  wordSetId?: string;
  revisionId?: string;
  wordId?: string;
  wordVersion?: number;
  releaseId?: string;
}

const imageMetadataSchema = z.object({
  state: z.literal("VALIDATED"),
  kind: z.literal("IMAGE").optional(),
  storagePath: z.string().min(1),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  byteSize: z.number().int().positive(),
  checksum: z.string().min(1),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

/** A lexical asset ID never grants access by itself: resolve its retained publication first. */
async function verifyPublishedReference(context: AssetContext): Promise<void> {
  if (context.wordSetId) {
    if (!context.revisionId || context.wordVersion || context.releaseId) {
      fail("PERMISSION_DENIED");
    }
    requireDoc(await db.doc(`systemDecks/${context.wordSetId}`).get());
    const revisionPath = `systemDecks/${context.wordSetId}/revisions/${context.revisionId}`;
    const revision = requireDoc(await db.doc(revisionPath).get());
    if (!["PUBLISHED", "RETIRED"].includes(revision.state)) {
      fail("PERMISSION_DENIED");
    }
    if (!context.wordId) {
      if (revision.coverImageAssetId !== context.assetId)
        fail("PERMISSION_DENIED");
      return;
    }
    const entry = requireDoc(
      await db.doc(`${revisionPath}/words/${context.wordId}`).get(),
    );
    if (entry.imageAssetId) {
      if (entry.imageAssetId !== context.assetId) fail("PERMISSION_DENIED");
      return;
    }
    // A retained deck keeps its pinned default media even after the active dictionary changes.
    const word = requireDoc(
      await db
        .doc(`words/${context.wordId}/versions/${entry.wordVersion}`)
        .get(),
    );
    if (word.wordId !== context.wordId || word.version !== entry.wordVersion) {
      fail("PERMISSION_DENIED");
    }
    const meanings: Data[] = entry.focusMeaningId
      ? word.meanings.filter(
          (meaning: Data) => meaning.id === entry.focusMeaningId,
        )
      : word.meanings;
    if (!meanings.some((meaning) => meaning.imageAssetId === context.assetId)) {
      fail("PERMISSION_DENIED");
    }
    return;
  }

  if (context.revisionId || !context.wordId || !context.wordVersion) {
    fail("PERMISSION_DENIED");
  }
  const releaseId =
    context.releaseId ??
    requireDoc(await db.doc("config/dictionary").get()).activeReleaseId;
  if (typeof releaseId !== "string" || !releaseId) fail("DICTIONARY_NOT_READY");
  const release = requireDoc(
    await db.doc(`dictionaryReleases/${releaseId}`).get(),
  );
  if (!["PUBLISHED", "RETIRED"].includes(release.state))
    fail("PERMISSION_DENIED");
  const entry = requireDoc(
    await db
      .doc(`dictionaryReleases/${releaseId}/entries/${context.wordId}`)
      .get(),
  );
  if (entry.wordVersion !== context.wordVersion) fail("PERMISSION_DENIED");
  const word = requireDoc(
    await db
      .doc(`words/${context.wordId}/versions/${context.wordVersion}`)
      .get(),
  );
  if (word.wordId !== context.wordId || word.version !== context.wordVersion)
    fail("PERMISSION_DENIED");
  if (
    !word.meanings.some(
      (meaning: Data) => meaning.imageAssetId === context.assetId,
    )
  ) {
    fail("PERMISSION_DENIED");
  }
}

async function imageReadUrl(
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

export async function resolveImageAsset(
  actor: Actor,
  context: AssetContext,
): Promise<Data> {
  await assertActive(actor);
  if (!actor.contentAdmin) await verifyPublishedReference(context);
  const asset = requireDoc(
    await db.doc(`imageAssets/${context.assetId}`).get(),
  );
  // Preserve the admin metadata API used for staging and import inspection.
  if (
    actor.contentAdmin &&
    (asset.state !== "VALIDATED" || asset.kind === "IMPORT")
  )
    return asset;
  const image = parse(imageMetadataSchema, asset);
  const grant = await imageReadUrl(image.storagePath);
  await assertActive(actor);
  if (actor.contentAdmin) return { ...asset, ...grant };
  return {
    id: context.assetId,
    assetId: context.assetId,
    state: image.state,
    contentType: image.contentType,
    byteSize: image.byteSize,
    checksum: image.checksum,
    ...(image.width ? { width: image.width } : {}),
    ...(image.height ? { height: image.height } : {}),
    ...grant,
  };
}
