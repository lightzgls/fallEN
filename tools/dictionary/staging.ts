import { Timestamp, type DocumentReference } from "firebase-admin/firestore";
import {
  db,
  bucket,
} from "../../functions/src/infrastructure/firebase/runtime.js";
import { type Data } from "../../functions/src/shared/types.js";
import { fail } from "../../functions/src/shared/errors.js";
import { hash } from "../../functions/src/shared/values.js";
import { requireDoc } from "../../functions/src/shared/validation.js";
import { normalizeKey } from "../../functions/src/domain/dictionary/search-key.js";
import { type DictionaryManifest } from "./manifest.js";
import { type ValidatedManifest } from "./manifest-validation.js";
export async function stageRelease(
  manifest: DictionaryManifest,
  validated: ValidatedManifest,
  contentHash: string,
  releaseRef: DocumentReference,
  previous: Data | undefined,
): Promise<void> {
  const { words, keys, connections } = validated;
  if (!previous)
    await releaseRef.create({
      id: manifest.releaseId,
      state: "STAGING",
      contentHash,
      sources: manifest.sources,
      createdAt: Timestamp.now(),
    });
  if (!previous || previous.state === "STAGING") {
    for (const word of manifest.words) {
      await db.runTransaction(async (tx) => {
        const release = requireDoc(await tx.get(releaseRef));
        if (release.state !== "STAGING") fail("CONFLICT");
        const ref = db.doc(`words/${word.wordId}/versions/${word.version}`),
          old = await tx.get(ref),
          operational = db.doc(`words/${word.wordId}`),
          current = await tx.get(operational);
        const { active: _active, listenAllowed: _listen, ...lexical } = word;
        const newContent = {
          ...lexical,
          searchKey: normalizeKey(word.spelling),
        };
        if (old.exists && hash(old.data()) !== hash(newContent))
          fail("IMMUTABLE_WORD_VERSION");
        const aliasRefs = [
          ...new Set([word.spelling, ...word.otherSpellings].map(normalizeKey)),
        ].map((key) => ({ key, ref: db.doc(`wordKeys/${hash(key)}`) }));
        const aliases = await tx.getAll(...aliasRefs.map((item) => item.ref));
        for (const alias of aliases)
          if (alias.exists && alias.data()!.wordId !== word.wordId)
            fail("CANONICAL_ID_CONFLICT");
        if (!old.exists) tx.create(ref, newContent);
        if (!current.exists)
          tx.create(operational, {
            speech: {
              provider: "ANDROID_TTS",
              text: word.spelling,
              listenAllowed: word.listenAllowed,
              version: 1,
            },
          });
        tx.set(releaseRef.collection("entries").doc(word.wordId), {
          wordId: word.wordId,
          wordVersion: word.version,
          active: word.active,
          spelling: word.spelling,
          searchKey: normalizeKey(word.spelling),
        });
        for (const [index, alias] of aliasRefs.entries()) {
          if (!aliases[index].exists)
            tx.create(alias.ref, {
              normalizedKey: alias.key,
              wordId: word.wordId,
            });
          tx.set(releaseRef.collection("keys").doc(hash(alias.key)), {
            normalizedKey: alias.key,
            wordId: word.wordId,
            wordVersion: word.version,
          });
        }
      });
    }
    for (const [key, connection] of connections)
      await db.runTransaction(async (tx) => {
        const release = requireDoc(await tx.get(releaseRef));
        if (release.state !== "STAGING") fail("CONFLICT");
        tx.set(releaseRef.collection("connections").doc(key), {
          ...connection,
          id: key,
          releaseId: manifest.releaseId,
          active: true,
        });
      });
    const indexBytes = JSON.stringify({
      releaseId: manifest.releaseId,
      entries: [...keys].map(([key, value]) => ({ key, ...value })),
    });
    const searchIndexPath = `dictionary/${manifest.releaseId}/search-index.json`,
      searchIndexHash = hash(indexBytes);
    await bucket
      .file(searchIndexPath)
      .save(indexBytes, { contentType: "application/json", resumable: false });
    const [downloaded] = await bucket.file(searchIndexPath).download();
    if (hash(downloaded.toString()) !== searchIndexHash) fail("INDEX_INVALID");
    await db.runTransaction(async (tx) => {
      const release = requireDoc(await tx.get(releaseRef));
      const [entries, keyDocs, connectionDocs] = await Promise.all([
        tx.get(releaseRef.collection("entries")),
        tx.get(releaseRef.collection("keys")),
        tx.get(releaseRef.collection("connections")),
      ]);
      if (
        release.state !== "STAGING" ||
        release.contentHash !== contentHash ||
        entries.size !== words.size ||
        keyDocs.size !== keys.size ||
        connectionDocs.size !== connections.size
      )
        fail("MANIFEST_MISMATCH");
      tx.update(releaseRef, {
        state: "READY",
        entryCount: entries.size,
        connectionCount: connectionDocs.size,
        searchIndexPath,
        searchIndexHash,
      });
    });
  }
}
