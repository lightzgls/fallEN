import { z } from "zod";
import { entrySchema, metadataSchema } from "../../domain/content-schemas.js";
import { db, fail, requireDoc, type Data } from "../../shared/core.js";
import { readWordVersion } from "../dictionary.js";

export function checkEncodedSize(value: unknown, maxBytes: number) {
  if (Buffer.byteLength(JSON.stringify(value), "utf8") > maxBytes)
    fail(
      "PAYLOAD_LIMIT",
      "Split this content into a smaller import or draft update",
    );
}

export function assertDraft(revision: Data) {
  if (revision.state !== "DRAFT")
    fail("CONFLICT", "This revision is locked or already published");
}

export async function validateAsset(
  assetId: string,
  tx?: FirebaseFirestore.Transaction,
) {
  const ref = db.doc(`imageAssets/${assetId}`);
  const asset = requireDoc(
    await (tx ? tx.get(ref) : ref.get()),
    "ASSET_NOT_FOUND",
  );
  if (asset.state !== "VALIDATED" || asset.kind !== "IMAGE")
    fail("VALIDATION_FAILED", "Image is not validated");
  return asset;
}

export async function validateEntries(
  entries: z.infer<typeof entrySchema>[],
  metadata: z.infer<typeof metadataSchema>,
  tx?: FirebaseFirestore.Transaction,
) {
  if (
    new Set(entries.map((e) => e.wordId)).size !== entries.length ||
    new Set(entries.map((e) => e.position)).size !== entries.length
  )
    fail("VALIDATION_FAILED", "Word IDs and positions must be unique");
  if (metadata.coverImageAssetId)
    await validateAsset(metadata.coverImageAssetId, tx);
  for (const entry of entries) {
    const word = await readWordVersion(entry.wordId, entry.wordVersion, tx);
    if (
      entry.focusMeaningId &&
      !word.meanings.some((m: Data) => m.id === entry.focusMeaningId)
    )
      fail(
        "VALIDATION_FAILED",
        "Focus meaning is outside the pinned word version",
      );
    if (
      (entry.example || entry.imageAssetId) &&
      word.meanings.length > 1 &&
      !entry.focusMeaningId
    )
      fail(
        "VALIDATION_FAILED",
        "Select a focus meaning for this learning material",
      );
    if (entry.imageAssetId) await validateAsset(entry.imageAssetId, tx);
  }
}
