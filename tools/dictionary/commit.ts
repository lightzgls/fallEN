import { Timestamp, type DocumentReference } from "firebase-admin/firestore";
import { db } from "../../functions/src/infrastructure/firebase/runtime.js";
import { fail } from "../../functions/src/shared/errors.js";
import {
  checkVersion,
  requireDoc,
} from "../../functions/src/shared/validation.js";
import { type DictionaryManifest } from "./manifest.js";
export async function commitRelease(
  manifest: DictionaryManifest,
  contentHash: string,
  expectedConfigVersion: number,
  publishCommandId: string,
  releaseRef: DocumentReference,
): Promise<{ releaseId: string; version: number }> {
  return db.runTransaction(async (tx) => {
    const configRef = db.doc("config/dictionary"),
      [releaseDoc, configDoc] = await tx.getAll(releaseRef, configRef),
      release = requireDoc(releaseDoc),
      config = configDoc.data();
    if (
      ["PUBLISHED", "RETIRED"].includes(release.state) &&
      release.publishCommandId === publishCommandId
    )
      return {
        releaseId: manifest.releaseId,
        version: release.publishedConfigVersion,
      };
    checkVersion(config?.version ?? 0, expectedConfigVersion);
    if (
      release.state !== "READY" ||
      release.contentHash !== contentHash ||
      !release.searchIndexHash
    )
      fail("MANIFEST_MISMATCH");
    const previousRef = config?.activeReleaseId
      ? db.doc(`dictionaryReleases/${config.activeReleaseId}`)
      : undefined;
    if (previousRef) await tx.get(previousRef);
    const next = expectedConfigVersion + 1;
    tx.set(configRef, { activeReleaseId: manifest.releaseId, version: next });
    tx.update(releaseRef, {
      state: "PUBLISHED",
      publishedAt: Timestamp.now(),
      publishCommandId,
      publishedConfigVersion: next,
    });
    if (previousRef && previousRef.id !== manifest.releaseId)
      tx.update(previousRef, { state: "RETIRED" });
    return { releaseId: manifest.releaseId, version: next };
  });
}
