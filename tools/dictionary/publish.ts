import { db } from "../../functions/src/infrastructure/firebase/runtime.js";
import { fail } from "../../functions/src/shared/errors.js";
import { hash } from "../../functions/src/shared/values.js";
import { identifier } from "../../functions/src/shared/validation.js";
import { manifestSchema } from "./manifest.js";
import { validateManifest } from "./validate.js";
import { stageRelease } from "./stage.js";
import { commitRelease } from "./commit.js";
export { manifestSchema, type DictionaryManifest } from "./manifest.js";
/** Operator-only pipeline: validate, stage immutable contents, then commit the public pointer. */
export async function publishDictionaryManifest(
  raw: unknown,
  expectedConfigVersion: number,
  publishCommandId: string,
): Promise<{ releaseId: string; version: number }> {
  const manifest = manifestSchema.parse(raw);
  identifier.parse(publishCommandId);
  const validated = await validateManifest(manifest);
  const contentHash = hash(manifest),
    releaseRef = db.doc(`dictionaryReleases/${manifest.releaseId}`);
  const previous = (await releaseRef.get()).data();
  if (previous && previous.contentHash !== contentHash) fail("COMMAND_REUSED");
  if (previous?.state === "PUBLISHED" || previous?.state === "RETIRED") {
    if (previous.publishCommandId !== publishCommandId) fail("COMMAND_REUSED");
    return {
      releaseId: manifest.releaseId,
      version: previous.publishedConfigVersion,
    };
  }
  await stageRelease(manifest, validated, contentHash, releaseRef, previous);
  return commitRelease(
    manifest,
    contentHash,
    expectedConfigVersion,
    publishCommandId,
    releaseRef,
  );
}
