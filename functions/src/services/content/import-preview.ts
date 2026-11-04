import type { Actor } from "../../contracts/callable.js";
import type { ImportPreviewStore } from "../../contracts/content/ports.js";
import type {
  PreviewImportInput,
  ResolveImportRowInput,
} from "../../contracts/content/imports-inputs.js";
import type { ImportInputRow } from "../../contracts/content/records.js";
import type { Data } from "../../shared/types.js";
import { stableId } from "../../domain/values.js";
import {
  assertDraft,
  checkEncodedSize,
  contentVersion,
} from "../../domain/content-rules.js";
import { fail } from "../../shared/errors.js";
import { hash } from "../../shared/values.js";
import { required } from "./required.js";
import { validateAsset } from "./validation.js";
import { resolveImportRows, rowCounts } from "./match-row.js";
export function createPreviewOperations(store: ImportPreviewStore) {
  return {
    previewImport: async (actor: Actor, req: PreviewImportInput) => {
      checkEncodedSize(req, 500 * 1024);
      await store.active(actor);
      let inputRows: ImportInputRow[] = req.pastedRows ?? [];
      if (req.sourceFileId) {
        const file = required(await store.asset(req.sourceFileId));
        if (
          file.kind !== "IMPORT" ||
          file.state !== "VALIDATED" ||
          file.createdBy !== actor.uid
        )
          fail("PERMISSION_DENIED");
        inputRows = await store.importFile(file);
      }
      const importId = stableId(actor.uid, "import", req.commandId);
      return store.command(actor, "previewImport", req, async (tx, now) => {
        const deck = required(await tx.deck(req.wordSetId)),
          revision = required(await tx.revision(req.wordSetId, req.revisionId));
        assertDraft(revision);
        contentVersion(revision.version, req.expectedDraftVersion);
        if (deck.draftRevisionId !== req.revisionId) fail("CONFLICT");
        const release = await tx.release(),
          entries = await tx.entries(req.wordSetId, req.revisionId),
          existing = new Set(entries.map((entry) => entry.wordId));
        for (const assetId of req.assetIds) await validateAsset(tx, assetId);
        const rows = await resolveImportRows(
          tx,
          inputRows,
          existing,
          new Set(req.assetIds),
          release.id,
        );
        const fingerprint = hash({
            releaseId: release.id,
            draftVersion: revision.version,
            inputRows,
            assetIds: req.assetIds,
          }),
          counts = rowCounts(rows);
        checkEncodedSize({ rows, counts }, 750 * 1024);
        const batch = {
          id: importId,
          importId,
          wordSetId: req.wordSetId,
          revisionId: req.revisionId,
          createdBy: actor.uid,
          releaseId: release.id,
          expectedDraftVersion: revision.version,
          draftVersion: revision.version,
          progressDraftVersion: revision.version,
          inputHash: hash(inputRows),
          fingerprint,
          status: "PREVIEW",
          createdAt: now,
          selectedRowIds: [],
          skippedRowIds: [],
          counts,
        };
        tx.stageBatch(importId, batch, "create");
        for (const row of rows) tx.stageRow(importId, row.id, row, "create");
        return {
          importId,
          releaseId: release.id,
          draftVersion: revision.version,
          fingerprint,
          rows,
          counts,
        };
      });
    },
    resolveImportRow: async (actor: Actor, req: ResolveImportRowInput) =>
      store.command(actor, "resolveImportRow", req, async (tx) => {
        const batch = required(await tx.batch(req.importId)),
          revision = required(
            await tx.revision(batch.wordSetId, batch.revisionId),
          );
        assertDraft(revision);
        contentVersion(revision.version, req.expectedDraftVersion);
        if (batch.status !== "PREVIEW") fail("CONFLICT");
        const row = required(await tx.row(req.importId, req.rowId)),
          key = required(await tx.exactKey(batch.releaseId, row.normalizedKey));
        if (
          key.wordId !== req.wordId ||
          key.normalizedKey !== row.normalizedKey
        )
          fail(
            "VALIDATION_FAILED",
            "Selected word does not exactly match this row",
          );
        const word = await tx.wordVersion(req.wordId, key.wordVersion),
          meaning = word.meanings.find(
            (meaning: Data) => meaning.id === req.focusMeaningId,
          );
        if (!meaning)
          fail("VALIDATION_FAILED", "Choose a meaning from this word version");
        const updated = {
          ...row,
          resolvedWordId: req.wordId,
          wordVersion: key.wordVersion,
          focusMeaningId: meaning.id,
          status: row.status === "DUPLICATE" ? "DUPLICATE" : "READY",
          errors: [],
        };
        tx.stageRow(req.importId, req.rowId, updated, "replace");
        return updated;
      }),
  };
}
