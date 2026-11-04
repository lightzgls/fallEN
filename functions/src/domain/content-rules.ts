import { fail } from "../shared/errors.js";
import type {
  Metadata,
  SetWord,
  RevisionRecord,
  AssetRecord,
} from "../contracts/content/records.js";
export function contentVersion(actual: unknown, expected: number) {
  if (actual !== expected)
    fail("CONFLICT", "Dữ liệu đã thay đổi. Hãy tải lại.");
}
export function assertDraft(revision: RevisionRecord) {
  if (revision.state !== "DRAFT")
    fail("CONFLICT", "This revision is locked or already published");
}
export function checkEncodedSize(value: unknown, maxBytes: number) {
  if (Buffer.byteLength(JSON.stringify(value), "utf8") > maxBytes)
    fail(
      "PAYLOAD_LIMIT",
      "Split this content into a smaller import or draft update",
    );
}
export function assertImageAsset(asset: AssetRecord) {
  if (asset.state !== "VALIDATED" || asset.kind !== "IMAGE")
    fail("VALIDATION_FAILED", "Image is not validated");
}
export function validateEntryIdentity(entries: SetWord[]) {
  if (
    new Set(entries.map((entry) => entry.wordId)).size !== entries.length ||
    new Set(entries.map((entry) => entry.position)).size !== entries.length
  )
    fail("VALIDATION_FAILED", "Word IDs and positions must be unique");
}
export function draftMetadata(revision: RevisionRecord): Metadata {
  return {
    name: revision.name,
    topic: revision.topic,
    ...(revision.description !== undefined
      ? { description: revision.description }
      : {}),
    ...(revision.coverImageAssetId
      ? { coverImageAssetId: revision.coverImageAssetId }
      : {}),
  };
}
