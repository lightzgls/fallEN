import { type Transaction } from "firebase-admin/firestore";
import { db, hash, requireDoc, type Data } from "../../shared/core.js";
import { normalizeKey, readWordVersion } from "../dictionary.js";

export async function resolveImportRows(
  inputRows: Data[],
  existing: Set<string>,
  declaredAssets: Set<string>,
  releaseId: string,
  tx: Transaction,
) {
  const seen = new Set<string>();
  const rows: Data[] = [];
  for (let i = 0; i < inputRows.length; i++) {
    const rawRow = inputRows[i];
    const normalizedKey = normalizeKey(rawRow.word);
    const row: Data = {
      id: `row_${i + 1}`,
      rowNumber: i + 1,
      rawWord: rawRow.word,
      normalizedKey,
      input: rawRow,
      status: "NOT_FOUND",
      errors: [],
      operation: "ADD",
    };
    const key = (
      await tx.get(
        db.doc(`dictionaryReleases/${releaseId}/keys/${hash(normalizedKey)}`),
      )
    ).data();
    if (key && key.normalizedKey === normalizedKey) {
      const releaseEntry = requireDoc(
        await tx.get(
          db.doc(`dictionaryReleases/${releaseId}/entries/${key.wordId}`),
        ),
      );
      if (releaseEntry.active) {
        const word = await readWordVersion(key.wordId, key.wordVersion, tx);
        const candidates = rawRow.partOfSpeech
          ? word.meanings.filter(
              (m: Data) =>
                normalizeKey(m.partOfSpeech) ===
                normalizeKey(rawRow.partOfSpeech),
            )
          : word.meanings;
        const focus = rawRow.focusMeaningId
          ? candidates.find((m: Data) => m.id === rawRow.focusMeaningId)
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
    if (!!rawRow.example !== !!rawRow.exampleTranslation)
      row.errors.push("EXAMPLE_PAIR_REQUIRED");
    if (
      rawRow.imageAssetId &&
      (!declaredAssets.has(rawRow.imageAssetId) || !rawRow.imageAlt)
    )
      row.errors.push("IMAGE_ASSET_OR_ALT_REQUIRED");
    if (row.errors.length) row.status = "INVALID";
    rows.push(row);
  }

  return rows;
}
