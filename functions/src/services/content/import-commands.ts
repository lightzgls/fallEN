import type { Actor } from "../../contracts/callable.js";
import type { ImportApplicationStore } from "../../contracts/content/ports.js";
import type { ApplyImportInput } from "../../contracts/content/imports-inputs.js";
import { assertDraft, contentVersion } from "../../domain/content-rules.js";
import { fail } from "../../shared/errors.js";
import { hash } from "../../shared/values.js";
import { required } from "./required.js";
import { createImportWorker } from "./import-worker.js";
export function createImportApplication(store: ImportApplicationStore) {
  const worker = createImportWorker(store);
  return {
    ...worker,
    applyImport: async (actor: Actor, req: ApplyImportInput) => {
      const requestHash = hash({ kind: "applyImport", input: req });
      const previous = await store.transaction(actor, async (tx, now) => {
        const command = await tx.processedCommand(actor.uid, req.commandId);
        if (command) {
          if (
            command.kind !== "applyImport" ||
            command.requestHash !== requestHash
          )
            fail("COMMAND_REUSED");
          return command;
        }
        const batch = required(await tx.batch(req.importId)),
          revision = required(
            await tx.revision(batch.wordSetId, batch.revisionId),
          );
        const release = await tx.release(),
          rows = await tx.rows(req.importId);
        assertDraft(revision);
        contentVersion(revision.version, req.expectedDraftVersion);
        if (
          batch.status !== "PREVIEW" ||
          batch.fingerprint !== req.fingerprint ||
          batch.expectedDraftVersion !== req.expectedDraftVersion ||
          release.id !== batch.releaseId
        )
          fail("IMPORT_STALE");
        const selected = new Set(req.selectedRowIds),
          skipped = new Set(req.skippedRowIds);
        if (
          selected.size !== req.selectedRowIds.length ||
          skipped.size !== req.skippedRowIds.length ||
          [...selected].some((id) => skipped.has(id)) ||
          selected.size + skipped.size !== rows.length ||
          rows.some((row) => !selected.has(row.id) && !skipped.has(row.id))
        )
          fail(
            "VALIDATION_FAILED",
            "Every row must be selected or explicitly skipped",
          );
        for (const row of rows)
          if (selected.has(row.id)) {
            if (
              !["READY", "MATCHED", "DUPLICATE"].includes(row.status) ||
              !row.resolvedWordId ||
              !row.focusMeaningId
            )
              fail(
                "VALIDATION_FAILED",
                `Resolve row ${row.rowNumber} before applying`,
              );
            if (row.status === "DUPLICATE" && !req.duplicateChoices[row.id])
              fail(
                "VALIDATION_FAILED",
                "Duplicate rows require an explicit choice",
              );
            if (
              row.status === "DUPLICATE" &&
              req.duplicateChoices[row.id] === "ADD"
            )
              fail("VALIDATION_FAILED", "A duplicate can only update or skip");
          }
        tx.stageBatch(
          req.importId,
          {
            status: "APPLYING",
            selectedRowIds: req.selectedRowIds,
            skippedRowIds: req.skippedRowIds,
            duplicateChoices: req.duplicateChoices,
            applyCommandId: req.commandId,
            applyActorUid: actor.uid,
            progressDraftVersion: revision.version,
          },
          "patch",
        );
        tx.stageCommand(
          actor.uid,
          req.commandId,
          {
            kind: "applyImport",
            requestHash,
            status: "IN_PROGRESS",
            progress: { phase: "APPLYING", importId: req.importId },
            createdAt: now,
          },
          "create",
        );
        return { kind: "applyImport", requestHash, status: "IN_PROGRESS" };
      });
      if (previous.status === "SUCCEEDED") return previous.receipt;
      if (previous.status === "FAILED")
        fail(previous.error?.code ?? "IMPORT_FAILED");
      return worker.resumeImport(actor, req.importId, req.commandId);
    },
  };
}
