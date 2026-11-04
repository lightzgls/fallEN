import type { Actor } from "../../contracts/callable.js";
import type {
  ImportApplicationStore,
  ImportApplicationTransaction,
} from "../../contracts/content/ports.js";
import type {
  SetWord,
  ImportRowRecord,
  SetWordRecord,
  BatchRecord,
} from "../../contracts/content/records.js";
import { assertDraft } from "../../domain/content-rules.js";
import { fail } from "../../shared/errors.js";
import { required } from "./required.js";
import { validateEntries } from "./validation.js";
function appliedEntry(
  row: ImportRowRecord,
  existing: SetWordRecord | undefined,
  entries: SetWordRecord[],
): SetWord {
  const entry: SetWord = {
    wordId: required(row.resolvedWordId, "IMPORT_STALE"),
    wordVersion: required(row.wordVersion, "IMPORT_STALE"),
    position:
      existing?.position ??
      row.input.position ??
      Math.max(-1, ...entries.map((entry) => entry.position)) + 1,
    focusMeaningId: row.focusMeaningId,
  };
  for (const field of [
    "example",
    "exampleTranslation",
    "imageAssetId",
    "imageAlt",
  ] as const) {
    const value = row.input[field] ?? existing?.[field];
    if (value !== undefined) entry[field] = value;
  }
  if (
    !Number.isInteger(entry.position) ||
    entry.position < 0 ||
    !!entry.example !== !!entry.exampleTranslation ||
    (entry.imageAssetId && !entry.imageAlt)
  )
    fail("VALIDATION_FAILED", "Import entry is invalid");
  return entry;
}
export async function applyImportRow(
  store: ImportApplicationStore,
  actor: Actor,
  importId: string,
  rowId: string,
  commandId: string,
): Promise<void> {
  await store.transaction(actor, async (tx, now) => {
    const [batch, row, command] = await Promise.all([
      tx.batch(importId),
      tx.row(importId, rowId),
      tx.processedCommand(actor.uid, commandId),
    ]);
    const current = required(batch),
      currentRow = required(row);
    if (
      command?.status === "SUCCEEDED" ||
      ["APPLIED", "SKIPPED"].includes(currentRow.status)
    )
      return {};
    if (current.status !== "APPLYING" || current.applyCommandId !== commandId)
      fail("CONFLICT");
    const revision = required(
      await tx.revision(current.wordSetId, current.revisionId),
    );
    assertDraft(revision);
    if (revision.version !== current.progressDraftVersion) fail("IMPORT_STALE");
    const release = await tx.release();
    if (release.id !== current.releaseId) fail("IMPORT_STALE");
    if (
      current.skippedRowIds.includes(currentRow.id) ||
      current.duplicateChoices?.[currentRow.id] === "SKIP"
    ) {
      tx.stageRow(importId, rowId, { status: "SKIPPED" }, "patch");
      return {};
    }
    await writeImportedEntry(tx, current, currentRow, now);
    return {};
  });
}
async function writeImportedEntry(
  tx: ImportApplicationTransaction,
  batch: BatchRecord,
  row: ImportRowRecord,
  now: Date,
) {
  const entries = await tx.entries(batch.wordSetId, batch.revisionId),
    existing = entries.find((entry) => entry.wordId === row.resolvedWordId);
  const entry = appliedEntry(row, existing, entries),
    revision = required(await tx.revision(batch.wordSetId, batch.revisionId));
  await validateEntries(tx, [entry], {
    name: revision.name,
    topic: revision.topic,
  });
  if (
    entries.some(
      (other) =>
        other.wordId !== entry.wordId && other.position === entry.position,
    )
  )
    fail("VALIDATION_FAILED", "Import position conflicts with another word");
  if (existing && batch.duplicateChoices?.[row.id] !== "UPDATE")
    fail("IMPORT_STALE", "Word became a duplicate after preview");
  tx.stageEntry(
    batch.wordSetId,
    batch.revisionId,
    entry.wordId,
    { ...entry, revisionId: batch.revisionId, wordSetId: batch.wordSetId },
    "replace",
  );
  tx.stageRevision(
    batch.wordSetId,
    batch.revisionId,
    { version: revision.version + 1 },
    "patch",
  );
  tx.stageRow(
    batch.importId,
    row.id,
    {
      status: "APPLIED",
      operation: existing ? "UPDATE" : "ADD",
      appliedAt: now,
    },
    "patch",
  );
  tx.stageBatch(
    batch.importId,
    {
      progressDraftVersion: revision.version + 1,
      draftVersion: revision.version + 1,
    },
    "patch",
  );
}
