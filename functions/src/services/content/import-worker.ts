import type { Actor } from "../../contracts/callable.js";
import type { ImportApplicationStore } from "../../contracts/content/ports.js";
import type { RecordData } from "../../contracts/content/records.js";
import {
  businessErrorCode,
  isPermanentJobFailure,
} from "../../domain/job-errors.js";
import { fail } from "../../shared/errors.js";
import { required } from "./required.js";
import { applyImportRow } from "./apply-row.js";
export function createImportWorker(store: ImportApplicationStore) {
  async function resumeImport(
    actor: Actor,
    importId: string,
    commandId: string,
  ): Promise<RecordData> {
    try {
      const rows = await store.rows(importId);
      for (const row of rows)
        await applyImportRow(store, actor, importId, row.id, commandId);
      return await store.transaction(actor, async (tx) => {
        const [batch, command] = await Promise.all([
          tx.batch(importId),
          tx.processedCommand(actor.uid, commandId),
        ]);
        if (command?.status === "SUCCEEDED") return required(command.receipt);
        const current = required(batch),
          rows = await tx.rows(importId);
        if (
          current.applyCommandId !== commandId ||
          rows.some((row) => !["APPLIED", "SKIPPED"].includes(row.status))
        )
          fail("CONFLICT");
        const receipt = {
          importId,
          appliedRowIds: rows
            .filter((row) => row.status === "APPLIED")
            .map((row) => row.id),
          skippedRowIds: rows
            .filter((row) => row.status === "SKIPPED")
            .map((row) => row.id),
          errors: [],
          draftVersion: current.progressDraftVersion,
        };
        tx.stageBatch(importId, { status: "APPLIED" }, "patch");
        tx.stageCommand(
          actor.uid,
          commandId,
          { status: "SUCCEEDED", receipt },
          "patch",
          ["progress"],
        );
        return receipt;
      });
    } catch (error) {
      const code = businessErrorCode(error);
      if (isPermanentJobFailure(code))
        await store.transaction(
          actor,
          async (tx) => {
            const [batch, command] = await Promise.all([
              tx.batch(importId),
              tx.processedCommand(actor.uid, commandId),
            ]);
            if (
              batch?.status === "APPLYING" &&
              batch.applyCommandId === commandId &&
              command?.status === "IN_PROGRESS"
            ) {
              tx.stageBatch(
                importId,
                { status: "FAILED", error: { code } },
                "patch",
              );
              tx.stageCommand(
                actor.uid,
                commandId,
                { status: "FAILED", error: { code } },
                "patch",
                ["progress"],
              );
            }
            return {};
          },
          false,
        );
      throw error;
    }
  }
  return { resumeImport };
}
