import type { MaterialReader } from "../../contracts/content/ports.js";
import type { Metadata, SetWord } from "../../contracts/content/records.js";
import type { Data } from "../../shared/types.js";
import {
  assertImageAsset,
  validateEntryIdentity,
} from "../../domain/content-rules.js";
import { fail } from "../../shared/errors.js";
import { required } from "./required.js";
export async function validateAsset(reader: MaterialReader, assetId: string) {
  const asset = required(await reader.asset(assetId), "ASSET_NOT_FOUND");
  assertImageAsset(asset);
  return asset;
}
export async function validateEntries(
  reader: MaterialReader,
  entries: SetWord[],
  metadata: Metadata,
) {
  validateEntryIdentity(entries);
  if (metadata.coverImageAssetId)
    await validateAsset(reader, metadata.coverImageAssetId);
  for (const entry of entries) {
    const word = await reader.wordVersion(entry.wordId, entry.wordVersion);
    if (
      entry.focusMeaningId &&
      !word.meanings.some(
        (meaning: Data) => meaning.id === entry.focusMeaningId,
      )
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
    if (entry.imageAssetId) await validateAsset(reader, entry.imageAssetId);
  }
}
