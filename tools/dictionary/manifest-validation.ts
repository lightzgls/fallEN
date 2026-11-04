import { db } from "../../functions/src/infrastructure/firebase/runtime.js";
import { fail } from "../../functions/src/shared/errors.js";
import { hash } from "../../functions/src/shared/values.js";
import { requireDoc } from "../../functions/src/shared/validation.js";
import { normalizeKey } from "../../functions/src/domain/dictionary/search-key.js";
import { type DictionaryManifest } from "./manifest.js";
export interface ValidatedManifest {
  words: Map<string, DictionaryManifest["words"][number]>;
  keys: Map<string, { wordId: string; wordVersion: number }>;
  connections: Map<string, DictionaryManifest["connections"][number]>;
}
export async function validateManifest(
  manifest: DictionaryManifest,
): Promise<ValidatedManifest> {
  const words = new Map(manifest.words.map((word) => [word.wordId, word]));
  if (words.size !== manifest.words.length)
    fail("VALIDATION_FAILED", "Duplicate canonical wordId");
  const sources = new Set(manifest.sources.map((source) => source.sourceId));
  const keys = new Map<string, { wordId: string; wordVersion: number }>();
  for (const word of manifest.words) {
    if (
      new Set(word.meanings.map((item) => item.id)).size !==
      word.meanings.length
    )
      fail("VALIDATION_FAILED", "Duplicate meaningId");
    for (const ref of word.dictionaryRefs)
      if (!sources.has(ref.sourceId))
        fail("VALIDATION_FAILED", "Unregistered lexical source");
    for (const spelling of [word.spelling, ...word.otherSpellings]) {
      const key = normalizeKey(spelling),
        old = keys.get(key);
      if (old && old.wordId !== word.wordId)
        fail("VALIDATION_FAILED", "Alias collision");
      keys.set(key, { wordId: word.wordId, wordVersion: word.version });
    }
    for (const item of word.meanings)
      if (item.imageAssetId) {
        const asset = requireDoc(
          await db.doc(`imageAssets/${item.imageAssetId}`).get(),
        );
        if (asset.state !== "VALIDATED" || !asset.dictionaryRefs?.length)
          fail(
            "VALIDATION_FAILED",
            "Dictionary media needs validated rights metadata",
          );
      }
  }
  const connections = new Map<
    string,
    DictionaryManifest["connections"][number]
  >();
  for (const connection of manifest.connections) {
    const source = words.get(connection.sourceWordId),
      target = words.get(connection.targetWordId);
    if (
      !source ||
      !target ||
      source.wordId === target.wordId ||
      source.version !== connection.sourceWordVersion ||
      target.version !== connection.targetWordVersion ||
      !source.meanings.some((item) => item.id === connection.sourceMeaningId) ||
      !target.meanings.some((item) => item.id === connection.targetMeaningId) ||
      connection.dictionaryRefs.some((ref) => !sources.has(ref.sourceId))
    )
      fail("VALIDATION_FAILED", "Connection endpoints or source invalid");
    const { dictionaryRefs: _refs, ...identity } = connection;
    const key = hash(identity);
    if (connections.has(key)) fail("VALIDATION_FAILED", "Duplicate connection");
    connections.set(key, connection);
  }
  return { words, keys, connections };
}
