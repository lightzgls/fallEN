import { z } from "zod";
import { objectId, stableId, version } from "../../domain/values.js";
import { rowSchema } from "../../domain/content.js";
import { readImportFileRows } from "../../infrastructure/content/files.js";
import {
  deckRef,
  importRef,
  revisionRef,
} from "../../infrastructure/content/refs.js";
import {
  assertActive,
  assertAdmin,
  checkVersion,
  command,
  db,
  fail,
  hash,
  parse,
  requireDoc,
  type Actor,
  type Data,
} from "../../shared/core.js";
import { readWordVersion, resolveRelease } from "../dictionary.js";
import { resolveImportRows } from "./match-row.js";
import { assertDraft, checkEncodedSize, validateAsset } from "./validation.js";

export async function previewImport(actor: Actor, raw: unknown) {
  assertAdmin(actor);
  const req = parse(
    z
      .object({
        wordSetId: objectId,
        revisionId: objectId,
        sourceFileId: objectId.optional(),
        pastedRows: z.array(rowSchema).max(1000).optional(),
        assetIds: z.array(objectId).max(1000),
        expectedDraftVersion: version,
        commandId: objectId,
      })
      .strict()
      .refine(
        (r) => !!r.sourceFileId !== !!r.pastedRows?.length,
        "Use either a file or pasted rows",
      ),
    raw,
  );
  checkEncodedSize(req, 500 * 1024);
  await assertActive(actor);
  let inputRows: Data[] = req.pastedRows ?? [];
  if (req.sourceFileId) {
    const file = requireDoc(
      await db.doc(`imageAssets/${req.sourceFileId}`).get(),
    );
    if (
      file.kind !== "IMPORT" ||
      file.state !== "VALIDATED" ||
      file.createdBy !== actor.uid
    )
      fail("PERMISSION_DENIED");
    inputRows = await readImportFileRows(file);
  }
  const importId = stableId(actor.uid, "import", req.commandId);
  return command(actor, "previewImport", req, async (tx, now) => {
    const ref = revisionRef(req.wordSetId, req.revisionId);
    const deck = requireDoc(await tx.get(deckRef(req.wordSetId)));
    const revision = requireDoc(await tx.get(ref));
    assertDraft(revision);
    checkVersion(revision.version, req.expectedDraftVersion);
    if (deck.draftRevisionId !== req.revisionId) fail("CONFLICT");
    const release = await resolveRelease(undefined, tx);
    const entries = await tx.get(ref.collection("words"));
    const existing = new Set(entries.docs.map((s) => s.id));
    const declaredAssets = new Set(req.assetIds);
    for (const assetId of req.assetIds) await validateAsset(assetId, tx);
    const rows = await resolveImportRows(
      inputRows,
      existing,
      declaredAssets,
      release.id,
      tx,
    );
    const fingerprint = hash({
      releaseId: release.id,
      draftVersion: revision.version,
      inputRows,
      assetIds: req.assetIds,
    });
    const counts = rowCounts(rows);
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
    tx.create(importRef(importId), batch);
    for (const row of rows)
      tx.create(importRef(importId).collection("rows").doc(row.id), row);
    return {
      importId,
      releaseId: release.id,
      draftVersion: revision.version,
      fingerprint,
      rows,
      counts,
    };
  });
}

export function rowCounts(rows: Data[]) {
  const counts: Data = { total: rows.length };
  for (const row of rows) counts[row.status] = (counts[row.status] ?? 0) + 1;
  return counts;
}

export async function resolveImportRow(actor: Actor, raw: unknown) {
  assertAdmin(actor);
  const req = parse(
    z
      .object({
        importId: objectId,
        rowId: objectId,
        wordId: objectId,
        focusMeaningId: objectId.optional(),
        expectedDraftVersion: version,
        commandId: objectId,
      })
      .strict(),
    raw,
  );
  return command(actor, "resolveImportRow", req, async (tx) => {
    const batch = requireDoc(await tx.get(importRef(req.importId)));
    const revision = requireDoc(
      await tx.get(revisionRef(batch.wordSetId, batch.revisionId)),
    );
    assertDraft(revision);
    checkVersion(revision.version, req.expectedDraftVersion);
    if (batch.status !== "PREVIEW") fail("CONFLICT");
    const rowRef = importRef(req.importId).collection("rows").doc(req.rowId);
    const row = requireDoc(await tx.get(rowRef));
    const key = requireDoc(
      await tx.get(
        db.doc(
          `dictionaryReleases/${batch.releaseId}/keys/${hash(row.normalizedKey)}`,
        ),
      ),
    );
    if (key.wordId !== req.wordId || key.normalizedKey !== row.normalizedKey)
      fail(
        "VALIDATION_FAILED",
        "Selected word does not exactly match this row",
      );
    const word = await readWordVersion(req.wordId, key.wordVersion, tx);
    const meaning = word.meanings.find(
      (m: Data) => m.id === req.focusMeaningId,
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
    tx.set(rowRef, updated);
    return updated;
  });
}
