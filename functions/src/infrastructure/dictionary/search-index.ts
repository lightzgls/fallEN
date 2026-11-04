import { z } from "zod";
import {
  bucket,
  fail,
  hash,
  identifier,
  type Data,
} from "../../shared/core.js";

export interface SearchEntry {
  key: string;
  wordId: string;
  wordVersion: number;
}

export const indexCache = new Map<
  string,
  { entries: SearchEntry[]; hash: string }
>();

export async function searchIndex(release: Data): Promise<SearchEntry[]> {
  if (!release.searchIndexPath || !release.searchIndexHash)
    fail("DICTIONARY_NOT_READY");
  const cached = indexCache.get(release.id);
  if (cached && cached.hash === release.searchIndexHash) return cached.entries;
  const file = bucket.file(release.searchIndexPath);
  const [metadata] = await file.getMetadata();
  if (Number(metadata.size) > 64 * 1024 * 1024) fail("INDEX_INVALID");
  const [bytes] = await file.download();
  if (hash(bytes.toString()) !== release.searchIndexHash) fail("INDEX_INVALID");
  let decoded: unknown;
  try {
    decoded = JSON.parse(bytes.toString());
  } catch {
    return fail("INDEX_INVALID");
  }
  const validated = z
    .object({
      releaseId: identifier,
      entries: z.array(
        z
          .object({
            key: z.string().max(200),
            wordId: identifier,
            wordVersion: z.number().int().positive(),
          })
          .strict(),
      ),
    })
    .strict()
    .safeParse(decoded);
  if (!validated.success || validated.data.releaseId !== release.id)
    fail("INDEX_INVALID");
  if (indexCache.size >= 3) indexCache.delete(indexCache.keys().next().value!);
  indexCache.set(release.id, {
    entries: validated.data.entries,
    hash: release.searchIndexHash,
  });
  return validated.data.entries;
}
