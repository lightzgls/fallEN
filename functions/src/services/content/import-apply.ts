import { Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { objectId, version } from "../../domain/backend.js";
import {
  importRef,
  revisionRef,
} from "../../infrastructure/content/references.js";
import {
  assertActive,
  assertAdmin,
  checkVersion,
  db,
  fail,
  hash,
  parse,
  requireDoc,
  type Actor,
} from "../../shared/core.js";
import { resolveRelease } from "../dictionary.js";
import { resumeImport } from "./import-application.js";
import { assertDraft } from "./validation.js";

export const applySchema = z
  .object({
    importId: objectId,
    selectedRowIds: z.array(objectId).max(1000),
    skippedRowIds: z.array(objectId).max(1000),
    duplicateChoices: z.record(objectId, z.enum(["ADD", "UPDATE", "SKIP"])),
    expectedDraftVersion: version,
    fingerprint: z.string().min(1).max(128),
    commandId: objectId,
  })
  .strict();

export async function applyImport(actor: Actor, raw: unknown) {
  assertAdmin(actor);
  const req = parse(applySchema, raw);
  const requestHash = hash({ kind: "applyImport", input: req });
  const cmdRef = db.doc(`users/${actor.uid}/commands/${req.commandId}`);
  const previous = await db.runTransaction(async (tx) => {
    await assertActive(actor, tx);
    const cmd = (await tx.get(cmdRef)).data();
    if (cmd) {
      if (cmd.kind !== "applyImport" || cmd.requestHash !== requestHash)
        fail("COMMAND_REUSED");
      return cmd;
    }
    const batch = requireDoc(await tx.get(importRef(req.importId)));
    const ref = revisionRef(batch.wordSetId, batch.revisionId);
    const revision = requireDoc(await tx.get(ref));
    const release = await resolveRelease(undefined, tx);
    const rows = await tx.get(
      importRef(req.importId).collection("rows").orderBy("rowNumber"),
    );
    assertDraft(revision);
    checkVersion(revision.version, req.expectedDraftVersion);
    if (
      batch.status !== "PREVIEW" ||
      batch.fingerprint !== req.fingerprint ||
      batch.expectedDraftVersion !== req.expectedDraftVersion ||
      release.id !== batch.releaseId
    )
      fail("IMPORT_STALE");
    const selected = new Set(req.selectedRowIds);
    const skipped = new Set(req.skippedRowIds);
    if (
      selected.size !== req.selectedRowIds.length ||
      skipped.size !== req.skippedRowIds.length ||
      [...selected].some((id) => skipped.has(id)) ||
      selected.size + skipped.size !== rows.size ||
      rows.docs.some((row) => !selected.has(row.id) && !skipped.has(row.id))
    )
      fail(
        "VALIDATION_FAILED",
        "Every row must be selected or explicitly skipped",
      );
    for (const row of rows.docs)
      if (selected.has(row.id)) {
        const data = row.data();
        if (
          !["READY", "MATCHED", "DUPLICATE"].includes(data.status) ||
          !data.resolvedWordId ||
          !data.focusMeaningId
        )
          fail(
            "VALIDATION_FAILED",
            `Resolve row ${data.rowNumber} before applying`,
          );
        if (data.status === "DUPLICATE" && !req.duplicateChoices[row.id])
          fail(
            "VALIDATION_FAILED",
            "Duplicate rows require an explicit choice",
          );
        if (
          data.status === "DUPLICATE" &&
          req.duplicateChoices[row.id] === "ADD"
        )
          fail("VALIDATION_FAILED", "A duplicate can only update or skip");
      }
    tx.update(importRef(req.importId), {
      status: "APPLYING",
      selectedRowIds: req.selectedRowIds,
      skippedRowIds: req.skippedRowIds,
      duplicateChoices: req.duplicateChoices,
      applyCommandId: req.commandId,
      applyActorUid: actor.uid,
      progressDraftVersion: revision.version,
    });
    tx.create(cmdRef, {
      kind: "applyImport",
      requestHash,
      status: "IN_PROGRESS",
      progress: { phase: "APPLYING", importId: req.importId },
      createdAt: Timestamp.now(),
    });
    return { status: "IN_PROGRESS" };
  });
  if (previous.status === "SUCCEEDED") return previous.receipt;
  if (previous.status === "FAILED")
    fail(previous.error?.code ?? "IMPORT_FAILED");
  return resumeImport(actor, req.importId, req.commandId);
}
