import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { manifestSchema } from "./manifest.js";
import { normalizeKey } from "../../functions/src/domain/dictionary/search-key.js";

// A local conversion can be reviewed before source redistribution is verified.
// The existing publish pipeline still requires literal true and is unchanged.
const reviewSchema = manifestSchema.extend({
  sources: z
    .array(
      manifestSchema.shape.sources.element.extend({
        redistributionAllowed: z.boolean(),
      }),
    )
    .min(1),
});

export function checkLocalManifest(raw: unknown) {
  const manifest = reviewSchema.parse(raw);
  const sources = new Set(manifest.sources.map((source) => source.sourceId));
  if (sources.size !== manifest.sources.length)
    throw new Error("Duplicate sourceId");
  const ids = new Set<string>();
  const keys = new Map<string, string>();
  for (const word of manifest.words) {
    if (ids.has(word.wordId))
      throw new Error(`Duplicate wordId: ${word.wordId}`);
    ids.add(word.wordId);
    const meanings = new Set(word.meanings.map((meaning) => meaning.id));
    if (meanings.size !== word.meanings.length)
      throw new Error(`Duplicate meaningId: ${word.wordId}`);
    for (const spelling of [word.spelling, ...word.otherSpellings]) {
      const key = normalizeKey(spelling);
      if (!key) throw new Error("Empty normalized spelling");
      if (keys.has(key) && keys.get(key) !== word.wordId)
        throw new Error(`Alias collision: ${spelling}`);
      keys.set(key, word.wordId);
    }
    for (const ref of word.dictionaryRefs) {
      if (!sources.has(ref.sourceId))
        throw new Error(`Unknown sourceId: ${ref.sourceId}`);
    }
  }
  if (manifest.connections.length)
    throw new Error(
      "This local converter checker expects no inferred connections",
    );
  return {
    words: manifest.words.length,
    meanings: manifest.words.reduce(
      (count, word) => count + word.meanings.length,
      0,
    ),
    searchKeys: keys.size,
    publicationSchemaValid: manifestSchema.safeParse(raw).success,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const input = process.argv[2];
  if (!input)
    throw new Error(
      "Usage: tsx tools/dictionary/check-local.ts manifest.review.json",
    );
  console.log(
    JSON.stringify(
      checkLocalManifest(JSON.parse(readFileSync(input, "utf8"))),
      null,
      2,
    ),
  );
}
