import { Timestamp } from "firebase-admin/firestore";
import { entrySchema } from "../../domain/content.js";
import { revisionRef } from "../../infrastructure/content/refs.js";
import {
  assertActive,
  fail,
  parse,
  requireDoc,
  type Actor,
  type Data,
} from "../../shared/core.js";
import { resolveRelease } from "../dictionary.js";
import { assertDraft, validateEntries } from "./validation.js";
export async function applyImportRow(
  actor: Actor,
  commandId: string,
  batchRef: FirebaseFirestore.DocumentReference,
  rowRef: FirebaseFirestore.DocumentReference,
  cmdRef: FirebaseFirestore.DocumentReference,
  tx: FirebaseFirestore.Transaction,
) {
  await assertActive(actor, tx);
  const [batchSnapshot, rowSnap, cmdSnapshot] = await tx.getAll(
    batchRef,
    rowRef,
    cmdRef,
  );
  const current = requireDoc(batchSnapshot);
  const row = requireDoc(rowSnap);
  if (
    cmdSnapshot.data()?.status === "SUCCEEDED" ||
    ["APPLIED", "SKIPPED"].includes(row.status)
  )
    return;
  if (current.status !== "APPLYING" || current.applyCommandId !== commandId)
    fail("CONFLICT");
  const ref = revisionRef(current.wordSetId, current.revisionId);
  const revision = requireDoc(await tx.get(ref));
  assertDraft(revision);
  if (revision.version !== current.progressDraftVersion) fail("IMPORT_STALE");
  const release = await resolveRelease(undefined, tx);
  if (release.id !== current.releaseId) fail("IMPORT_STALE");
  if (
    current.skippedRowIds.includes(row.id) ||
    current.duplicateChoices[row.id] === "SKIP"
  ) {
    tx.update(rowRef, { status: "SKIPPED" });
    return;
  }
  const existingEntries = await tx.get(
    ref.collection("words").orderBy("position"),
  );
  const existing = existingEntries.docs.find(
    (s) => s.id === row.resolvedWordId,
  );
  const data: Data = {
    wordId: row.resolvedWordId,
    wordVersion: row.wordVersion,
    position:
      existing?.data().position ??
      row.input.position ??
      Math.max(-1, ...existingEntries.docs.map((s) => s.data().position)) + 1,
    focusMeaningId: row.focusMeaningId,
  };
  for (const field of [
    "example",
    "exampleTranslation",
    "imageAssetId",
    "imageAlt",
  ]) {
    const value = row.input[field] ?? existing?.data()[field];
    if (value !== undefined) data[field] = value;
  }
  const entry = parse(entrySchema, data);
  await validateEntries(
    [entry],
    { name: revision.name, topic: revision.topic },
    tx,
  );
  if (
    existingEntries.docs.some(
      (s) => s.id !== entry.wordId && s.data().position === entry.position,
    )
  )
    fail("VALIDATION_FAILED", "Import position conflicts with another word");
  if (existing && current.duplicateChoices[row.id] !== "UPDATE")
    fail("IMPORT_STALE", "Word became a duplicate after preview");
  tx.set(ref.collection("words").doc(entry.wordId), {
    ...entry,
    revisionId: current.revisionId,
    wordSetId: current.wordSetId,
  });
  tx.update(ref, { version: revision.version + 1 });
  tx.update(rowRef, {
    status: "APPLIED",
    operation: existing ? "UPDATE" : "ADD",
    appliedAt: Timestamp.now(),
  });
  tx.update(batchRef, {
    progressDraftVersion: revision.version + 1,
    draftVersion: revision.version + 1,
  });
}
