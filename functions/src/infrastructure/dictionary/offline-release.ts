import { z } from "zod";
import { fail } from "../../shared/errors.js";
import type { Data } from "../../shared/types.js";
import { identifier, parse } from "../../shared/validation.js";
import { hash } from "../../shared/values.js";
import { lexicalVersion } from "../../domain/dictionary/policy.js";
import { bucket, db } from "../firebase/runtime.js";
import { resolveRelease } from "./word-reader.js";

const requestSchema = z
  .object({
    base: identifier.optional(),
    releaseId: identifier.optional(),
    cursor: identifier.optional(),
  })
  .strict()
  .refine(({ cursor, releaseId }) => !cursor || !!releaseId);

const indexSchema = z.array(
  z
    .object({ wordId: identifier, version: z.number().int().positive() })
    .strict(),
);
type Change = { wordId: string; version?: number };
const pageSize = 300;
const maxPageBytes = 2 * 1024 * 1024;
const diffCache = new Map<string, Promise<Change[]>>();

async function inventory(release: Data): Promise<Map<string, number>> {
  if (release.offlineIndexPath && release.offlineIndexHash) {
    const [bytes] = await bucket.file(release.offlineIndexPath).download();
    const json = bytes.toString();
    if (hash(json) !== release.offlineIndexHash) fail("INDEX_INVALID");
    return new Map(
      indexSchema
        .parse(JSON.parse(json))
        .map((row) => [row.wordId, row.version]),
    );
  }
  // Older published releases predate the offline index.
  const rows = await db
    .collection(`dictionaryReleases/${release.id}/entries`)
    .select("active", "wordVersion")
    .get();
  return new Map(
    rows.docs.flatMap((doc) => {
      const row = doc.data();
      return row.active ? [[doc.id, row.wordVersion]] : [];
    }),
  );
}

async function difference(
  base: Data | undefined,
  target: Data,
): Promise<Change[]> {
  const [before, after] = await Promise.all([
    base ? inventory(base) : new Map<string, number>(),
    inventory(target),
  ]);
  return [...new Set([...before.keys(), ...after.keys()])]
    .sort()
    .flatMap((wordId) => {
      const old = before.get(wordId);
      const version = after.get(wordId);
      return old === version ? [] : [{ wordId, version }];
    });
}

function changesBetween(
  base: Data | undefined,
  target: Data,
): Promise<Change[]> {
  if (!target.offlineIndexHash || (base && !base.offlineIndexHash))
    return difference(base, target);
  const key = `${base?.offlineIndexHash ?? ""}:${target.offlineIndexHash}`;
  const cached = diffCache.get(key);
  if (cached) return cached;
  if (diffCache.size >= 4) diffCache.delete(diffCache.keys().next().value!);
  const job = difference(base, target).catch((error) => {
    if (diffCache.get(key) === job) diffCache.delete(key);
    throw error;
  });
  diffCache.set(key, job);
  return job;
}

export async function offlineRelease(raw: unknown) {
  const { base, releaseId, cursor } = parse(requestSchema, raw);
  const target = await resolveRelease(releaseId);
  const id = target.id as string;
  if (base === id) return { releaseId: id, changes: [] };
  const inventoryChanges = await changesBetween(
    base ? await resolveRelease(base) : undefined,
    target,
  );
  const position = cursor
    ? inventoryChanges.findIndex((item) => item.wordId === cursor)
    : -1;
  if (cursor && position < 0) fail("VALIDATION_FAILED");
  const start = position + 1;
  const page = inventoryChanges.slice(start, start + pageSize);
  const refs = page.flatMap(({ wordId, version }) =>
    version === undefined
      ? []
      : [db.doc(`words/${wordId}/versions/${version}`)],
  );
  const words = new Map(
    refs.length
      ? (await db.getAll(...refs)).map((doc) => [doc.ref.path, doc.data()])
      : [],
  );
  const changes = [];
  let bytes = 0;
  for (const { wordId, version } of page) {
    const change =
      version === undefined
        ? { wordId, removed: true }
        : {
            wordId,
            word: lexicalVersion(
              wordId,
              version,
              words.get(`words/${wordId}/versions/${version}`),
            ),
          };
    bytes += Buffer.byteLength(JSON.stringify(change));
    if (changes.length && bytes > maxPageBytes) break;
    changes.push(change);
  }
  return {
    releaseId: id,
    changes,
    ...(start + changes.length < inventoryChanges.length
      ? { cursor: changes.at(-1)?.wordId }
      : {}),
  };
}
