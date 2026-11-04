import type { ImportMatchingReader } from "../../contracts/content/ports.js";
import type {
  ImportInputRow,
  ImportRowRecord,
} from "../../contracts/content/records.js";
import type { Data } from "../../shared/types.js";
import { normalizeKey } from "../../domain/dictionary/search-key.js";
import { required } from "./required.js";
export async function resolveImportRows(
  reader: ImportMatchingReader,
  inputRows: ImportInputRow[],
  existing: Set<string>,
  declaredAssets: Set<string>,
  releaseId: string,
) {
  const seen = new Set<string>(),
    rows: ImportRowRecord[] = [];
  for (let index = 0; index < inputRows.length; index++) {
    const input = inputRows[index],
      normalizedKey = normalizeKey(input.word);
    const row: ImportRowRecord = {
      id: `row_${index + 1}`,
      rowNumber: index + 1,
      rawWord: input.word,
      normalizedKey,
      input,
      status: "NOT_FOUND",
      errors: [],
      operation: "ADD",
    };
    const key = await reader.exactKey(releaseId, normalizedKey);
    if (key && key.normalizedKey === normalizedKey) {
      const releaseEntry = required(
        await reader.releaseEntry(releaseId, key.wordId),
      );
      if (releaseEntry.active) {
        const word = await reader.wordVersion(key.wordId, key.wordVersion);
        const candidates = input.partOfSpeech
          ? word.meanings.filter(
              (meaning: Data) =>
                normalizeKey(meaning.partOfSpeech) ===
                normalizeKey(input.partOfSpeech!),
            )
          : word.meanings;
        const focus = input.focusMeaningId
          ? candidates.find(
              (meaning: Data) => meaning.id === input.focusMeaningId,
            )
          : candidates.length === 1
            ? candidates[0]
            : undefined;
        row.resolvedWordId = key.wordId;
        row.wordVersion = key.wordVersion;
        row.meaningCandidates = candidates;
        row.status = focus ? "READY" : "NEEDS_REVIEW";
        if (focus) row.focusMeaningId = focus.id;
        if (seen.has(key.wordId) || existing.has(key.wordId)) {
          row.status = "DUPLICATE";
          row.operation = "SKIP";
        }
        seen.add(key.wordId);
      }
    }
    if (!!input.example !== !!input.exampleTranslation)
      row.errors.push("EXAMPLE_PAIR_REQUIRED");
    if (
      input.imageAssetId &&
      (!declaredAssets.has(input.imageAssetId) || !input.imageAlt)
    )
      row.errors.push("IMAGE_ASSET_OR_ALT_REQUIRED");
    if (row.errors.length) row.status = "INVALID";
    rows.push(row);
  }
  return rows;
}
export function rowCounts(rows: ImportRowRecord[]) {
  const counts: Record<string, number> = { total: rows.length };
  for (const row of rows) counts[row.status] = (counts[row.status] ?? 0) + 1;
  return counts;
}
