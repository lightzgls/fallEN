import type { ImageReferenceReader } from "../../contracts/content/ports.js";
import type { GetImageAssetInput } from "../../contracts/content/uploads-inputs.js";
import type { Data } from "../../shared/types.js";
import { fail } from "../../shared/errors.js";
import { required } from "./required.js";
export async function verifyImageReference(
  reader: ImageReferenceReader,
  context: GetImageAssetInput,
): Promise<void> {
  if (context.wordSetId) {
    if (!context.revisionId || context.wordVersion || context.releaseId)
      fail("PERMISSION_DENIED");
    required(await reader.deck(context.wordSetId));
    const revision = required(
      await reader.imageRevision(context.wordSetId, context.revisionId),
    );
    if (!["PUBLISHED", "RETIRED"].includes(revision.state))
      fail("PERMISSION_DENIED");
    if (!context.wordId) {
      if (revision.coverImageAssetId !== context.assetId)
        fail("PERMISSION_DENIED");
      return;
    }
    const entry = required(
      (await reader.entries(context.wordSetId, context.revisionId)).find(
        (entry) => entry.wordId === context.wordId,
      ),
    );
    if (entry.imageAssetId) {
      if (entry.imageAssetId !== context.assetId) fail("PERMISSION_DENIED");
      return;
    }
    const word = await reader.wordVersion(context.wordId, entry.wordVersion);
    if (word.wordId !== context.wordId || word.version !== entry.wordVersion)
      fail("PERMISSION_DENIED");
    const meanings: Data[] = entry.focusMeaningId
      ? word.meanings.filter(
          (meaning: Data) => meaning.id === entry.focusMeaningId,
        )
      : word.meanings;
    if (!meanings.some((meaning) => meaning.imageAssetId === context.assetId))
      fail("PERMISSION_DENIED");
    return;
  }
  if (context.revisionId || !context.wordId || !context.wordVersion)
    fail("PERMISSION_DENIED");
  const releaseId = context.releaseId ?? (await reader.activeReleaseId());
  if (!releaseId) fail("DICTIONARY_NOT_READY");
  const release = required(await reader.imageRelease(releaseId));
  if (!["PUBLISHED", "RETIRED"].includes(release.state))
    fail("PERMISSION_DENIED");
  const entry = required(await reader.releaseEntry(release.id, context.wordId));
  if (entry.wordVersion !== context.wordVersion) fail("PERMISSION_DENIED");
  const word = await reader.wordVersion(context.wordId, context.wordVersion);
  if (
    word.wordId !== context.wordId ||
    word.version !== context.wordVersion ||
    !word.meanings.some(
      (meaning: Data) => meaning.imageAssetId === context.assetId,
    )
  )
    fail("PERMISSION_DENIED");
}
