import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import {
  db,
  command,
  assertAdmin,
  assertActive,
  parse,
  fail,
  hash,
  requireDoc,
  checkVersion,
  type Actor,
  type Data,
} from "../shared/core.js";
import { resolveRelease, readWordVersion, normalizeKey } from "./dictionary.js";
import { empty, objectId, version, stableId } from "../domain/backend.js";
import {
  metadataSchema,
  entrySchema,
  rowSchema,
} from "../domain/content-schemas.js";
import {
  inspectContentUpload,
  readImportFileRows,
} from "../infrastructure/content-assets.js";
import {
  businessErrorCode,
  isPermanentJobFailure,
} from "../domain/backend-errors.js";

const publishSchema = z
  .object({
    wordSetId: objectId,
    revisionId: objectId,
    expectedWordSetVersion: version,
    expectedDraftVersion: version,
    commandId: objectId,
  })
  .strict();
const applySchema = z
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
const deckRef = (wordSetId: string) => db.doc(`systemDecks/${wordSetId}`);
const revisionRef = (wordSetId: string, revisionId: string) =>
  deckRef(wordSetId).collection("revisions").doc(revisionId);
const importRef = (importId: string) => db.doc(`contentImports/${importId}`);
function checkEncodedSize(value: unknown, maxBytes: number) {
  if (Buffer.byteLength(JSON.stringify(value), "utf8") > maxBytes)
    fail(
      "PAYLOAD_LIMIT",
      "Split this content into a smaller import or draft update",
    );
}
async function admin(actor: Actor) {
  assertAdmin(actor);
  await assertActive(actor);
}
function assertDraft(revision: Data) {
  if (revision.state !== "DRAFT")
    fail("CONFLICT", "This revision is locked or already published");
}
function publicItem(s: FirebaseFirestore.DocumentSnapshot): Data {
  return { ...s.data(), id: s.id };
}

async function validateAsset(
  assetId: string,
  tx?: FirebaseFirestore.Transaction,
) {
  const ref = db.doc(`imageAssets/${assetId}`);
  const asset = requireDoc(
    await (tx ? tx.get(ref) : ref.get()),
    "ASSET_NOT_FOUND",
  );
  if (asset.state !== "VALIDATED" || asset.kind !== "IMAGE")
    fail("VALIDATION_FAILED", "Image is not validated");
  return asset;
}
async function validateEntries(
  entries: z.infer<typeof entrySchema>[],
  metadata: z.infer<typeof metadataSchema>,
  tx?: FirebaseFirestore.Transaction,
) {
  if (
    new Set(entries.map((e) => e.wordId)).size !== entries.length ||
    new Set(entries.map((e) => e.position)).size !== entries.length
  )
    fail("VALIDATION_FAILED", "Word IDs and positions must be unique");
  if (metadata.coverImageAssetId)
    await validateAsset(metadata.coverImageAssetId, tx);
  for (const entry of entries) {
    const word = await readWordVersion(entry.wordId, entry.wordVersion, tx);
    if (
      entry.focusMeaningId &&
      !word.meanings.some((m: Data) => m.id === entry.focusMeaningId)
    )
      fail(
        "VALIDATION_FAILED",
        "Focus meaning is outside the pinned word version",
      );
    if (
      (entry.example || entry.imageAssetId) &&
      word.meanings.length > 1 &&
      !entry.focusMeaningId
    )
      fail(
        "VALIDATION_FAILED",
        "Select a focus meaning for this learning material",
      );
    if (entry.imageAssetId) await validateAsset(entry.imageAssetId, tx);
  }
}
async function getDraftData(wordSetId: string): Promise<Data> {
  const wordSet = requireDoc(await deckRef(wordSetId).get(), "DECK_NOT_FOUND");
  if (!wordSet.draftRevisionId) fail("DRAFT_NOT_FOUND");
  const ref = revisionRef(wordSetId, wordSet.draftRevisionId);
  const revision = requireDoc(await ref.get(), "DRAFT_NOT_FOUND");
  const words = await ref.collection("words").orderBy("position").get();
  return {
    wordSet: { ...wordSet, id: wordSetId },
    revision: { ...revision, id: ref.id },
    entries: words.docs.map((s) => ({ ...s.data(), wordId: s.id })),
  };
}

async function createDeck(actor: Actor, raw: unknown) {
  assertAdmin(actor);
  const req = parse(
    z.object({ metadata: metadataSchema, commandId: objectId }).strict(),
    raw,
  );
  const wordSetId = stableId(actor.uid, "deck", req.commandId);
  const revisionId = stableId(actor.uid, "draft", req.commandId);
  return command(actor, "createDeck", req, async (tx, now) => {
    if (req.metadata.coverImageAssetId)
      await validateAsset(req.metadata.coverImageAssetId, tx);
    const wordSet = {
      id: wordSetId,
      active: true,
      version: 1,
      draftRevisionId: revisionId,
      createdAt: now,
    };
    const revision = {
      id: revisionId,
      wordSetId,
      ...req.metadata,
      state: "DRAFT",
      version: 1,
      createdBy: actor.uid,
      createdAt: now,
    };
    tx.create(deckRef(wordSetId), wordSet);
    tx.create(revisionRef(wordSetId, revisionId), revision);
    return { wordSet, revision, entries: [] };
  });
}
async function openDraft(actor: Actor, raw: unknown) {
  assertAdmin(actor);
  const req = parse(
    z
      .object({
        wordSetId: objectId,
        expectedWordSetVersion: version,
        commandId: objectId,
      })
      .strict(),
    raw,
  );
  return command(actor, "openDraft", req, async (tx, now) => {
    const ref = deckRef(req.wordSetId);
    const wordSet = requireDoc(await tx.get(ref));
    checkVersion(wordSet.version, req.expectedWordSetVersion);
    if (wordSet.draftRevisionId) {
      const existing = revisionRef(req.wordSetId, wordSet.draftRevisionId);
      const revision = requireDoc(await tx.get(existing));
      const entries = await tx.get(
        existing.collection("words").orderBy("position"),
      );
      return {
        wordSet: { ...wordSet, id: ref.id },
        revision,
        entries: entries.docs.map((s) => s.data()),
      };
    }
    if (!wordSet.publishedRevisionId) fail("DRAFT_NOT_FOUND");
    const oldRef = revisionRef(req.wordSetId, wordSet.publishedRevisionId);
    const published = requireDoc(await tx.get(oldRef));
    const entries = await tx.get(
      oldRef.collection("words").orderBy("position"),
    );
    const revisionId = stableId(actor.uid, "draft", req.commandId);
    const newRef = revisionRef(req.wordSetId, revisionId);
    const revision: Data = {
      id: revisionId,
      wordSetId: req.wordSetId,
      name: published.name,
      topic: published.topic,
      ...(published.description !== undefined
        ? { description: published.description }
        : {}),
      ...(published.coverImageAssetId
        ? { coverImageAssetId: published.coverImageAssetId }
        : {}),
      state: "DRAFT",
      version: 1,
      createdBy: actor.uid,
      createdAt: now,
    };
    tx.create(newRef, revision);
    for (const entry of entries.docs)
      tx.create(newRef.collection("words").doc(entry.id), {
        ...entry.data(),
        revisionId,
      });
    const updatedSet = {
      ...wordSet,
      draftRevisionId: revisionId,
      version: wordSet.version + 1,
    };
    tx.set(ref, updatedSet);
    return {
      wordSet: updatedSet,
      revision,
      entries: entries.docs.map((s) => ({ ...s.data(), revisionId })),
    };
  });
}
async function saveDraft(actor: Actor, raw: unknown) {
  assertAdmin(actor);
  const req = parse(
    z
      .object({
        wordSetId: objectId,
        revisionId: objectId,
        metadata: metadataSchema,
        entries: z.array(entrySchema).max(1000),
        expectedVersion: version,
        commandId: objectId,
      })
      .strict(),
    raw,
  );
  checkEncodedSize(req, 500 * 1024);
  return command(actor, "saveDraft", req, async (tx, now) => {
    const ref = revisionRef(req.wordSetId, req.revisionId);
    const [deckSnapshot, revisionSnapshot, oldEntries, applying] =
      await Promise.all([
        tx.get(deckRef(req.wordSetId)),
        tx.get(ref),
        tx.get(ref.collection("words")),
        tx.get(
          db
            .collection("contentImports")
            .where("wordSetId", "==", req.wordSetId)
            .where("revisionId", "==", req.revisionId)
            .where("status", "==", "APPLYING"),
        ),
      ]);
    const deck = requireDoc(deckSnapshot);
    const revision = requireDoc(revisionSnapshot);
    if (deck.draftRevisionId !== req.revisionId || !applying.empty)
      fail("CONFLICT", "Import or another draft is currently active");
    assertDraft(revision);
    checkVersion(revision.version, req.expectedVersion);
    await validateEntries(req.entries, req.metadata, tx);
    const updated = {
      id: req.revisionId,
      wordSetId: req.wordSetId,
      ...req.metadata,
      state: "DRAFT",
      version: revision.version + 1,
      createdBy: revision.createdBy,
      createdAt: revision.createdAt,
      updatedAt: now,
    };
    const ids = new Set(req.entries.map((e) => e.wordId));
    for (const entry of oldEntries.docs)
      if (!ids.has(entry.id)) tx.delete(entry.ref);
    for (const entry of req.entries)
      tx.set(ref.collection("words").doc(entry.wordId), {
        ...entry,
        revisionId: req.revisionId,
        wordSetId: req.wordSetId,
      });
    tx.set(ref, updated);
    return updated;
  });
}
async function publishSet(actor: Actor, raw: unknown) {
  assertAdmin(actor);
  const req = parse(publishSchema, raw);
  const requestHash = hash({ kind: "publishSet", input: req });
  const cmdRef = db.doc(`users/${actor.uid}/commands/${req.commandId}`);
  const previous = await db.runTransaction(async (tx) => {
    await assertActive(actor, tx);
    const cmd = (await tx.get(cmdRef)).data();
    if (cmd) {
      if (cmd.kind !== "publishSet" || cmd.requestHash !== requestHash)
        fail("COMMAND_REUSED");
      return cmd;
    }
    const deck = requireDoc(await tx.get(deckRef(req.wordSetId)));
    const ref = revisionRef(req.wordSetId, req.revisionId);
    const revision = requireDoc(await tx.get(ref));
    const applying = await tx.get(
      db
        .collection("contentImports")
        .where("wordSetId", "==", req.wordSetId)
        .where("revisionId", "==", req.revisionId)
        .where("status", "==", "APPLYING"),
    );
    checkVersion(deck.version, req.expectedWordSetVersion);
    checkVersion(revision.version, req.expectedDraftVersion);
    assertDraft(revision);
    if (deck.draftRevisionId !== req.revisionId || !applying.empty)
      fail("CONFLICT");
    tx.update(ref, {
      state: "VALIDATING",
      publishCommandId: req.commandId,
      publishActorUid: actor.uid,
    });
    tx.create(cmdRef, {
      kind: "publishSet",
      requestHash,
      status: "IN_PROGRESS",
      progress: {
        phase: "VALIDATING",
        wordSetId: req.wordSetId,
        revisionId: req.revisionId,
      },
      request: req,
      createdAt: Timestamp.now(),
    });
    return { status: "IN_PROGRESS" };
  });
  if (previous.status === "SUCCEEDED") return previous.receipt;
  if (previous.status === "FAILED")
    fail(previous.error?.code ?? "PUBLISH_FAILED");
  return resumePublish(actor, req.wordSetId, req.revisionId, req.commandId);
}
export async function resumePublish(
  actor: Actor,
  wordSetId: string,
  revisionId: string,
  commandId: string,
): Promise<Data> {
  assertAdmin(actor);
  const ref = revisionRef(wordSetId, revisionId);
  const cmdRef = db.doc(`users/${actor.uid}/commands/${commandId}`);
  try {
    await assertActive(actor);
    const commandData = requireDoc(await cmdRef.get());
    if (commandData.status === "SUCCEEDED") return commandData.receipt;
    const revision = requireDoc(await ref.get());
    if (
      revision.state !== "VALIDATING" ||
      revision.publishCommandId !== commandId
    )
      fail("CONFLICT");
    const entries = (
      await ref.collection("words").orderBy("position").get()
    ).docs.map((s) =>
      parse(
        entrySchema,
        Object.fromEntries(
          Object.entries(s.data()).filter(
            ([k]) => !["wordSetId", "revisionId"].includes(k),
          ),
        ),
      ),
    );
    if (!entries.length)
      fail("VALIDATION_FAILED", "A published deck needs at least one word");
    const metadata = parse(metadataSchema, {
      name: revision.name,
      topic: revision.topic,
      description: revision.description,
      coverImageAssetId: revision.coverImageAssetId,
    });
    await validateEntries(entries, metadata);
    const contentHash = hash({ metadata, entries });
    return await db.runTransaction(async (tx) => {
      await assertActive(actor, tx);
      const cmd = requireDoc(await tx.get(cmdRef));
      if (cmd.status === "SUCCEEDED") return cmd.receipt;
      const deck = requireDoc(await tx.get(deckRef(wordSetId)));
      const locked = requireDoc(await tx.get(ref));
      const oldRef = deck.publishedRevisionId
        ? revisionRef(wordSetId, deck.publishedRevisionId)
        : undefined;
      if (oldRef) await tx.get(oldRef);
      checkVersion(deck.version, cmd.request.expectedWordSetVersion);
      checkVersion(locked.version, cmd.request.expectedDraftVersion);
      if (
        locked.state !== "VALIDATING" ||
        locked.publishCommandId !== commandId ||
        deck.draftRevisionId !== revisionId
      )
        fail("CONFLICT");
      const receipt = {
        wordSetId,
        publishedRevisionId: revisionId,
        version: deck.version + 1,
      };
      tx.update(ref, {
        state: "PUBLISHED",
        contentHash,
        publishedAt: Timestamp.now(),
      });
      if (oldRef && oldRef.id !== revisionId)
        tx.update(oldRef, { state: "RETIRED" });
      tx.update(deckRef(wordSetId), {
        ...metadata,
        publishedRevisionId: revisionId,
        draftRevisionId: FieldValue.delete(),
        version: receipt.version,
      });
      tx.update(cmdRef, {
        status: "SUCCEEDED",
        receipt,
        progress: FieldValue.delete(),
        request: FieldValue.delete(),
      });
      return receipt;
    });
  } catch (error) {
    const code = businessErrorCode(error);
    if (isPermanentJobFailure(code)) {
      await db.runTransaction(async (tx) => {
        const [revisionSnapshot, commandSnapshot] = await tx.getAll(
          ref,
          cmdRef,
        );
        if (
          revisionSnapshot.data()?.state === "VALIDATING" &&
          revisionSnapshot.data()?.publishCommandId === commandId &&
          commandSnapshot.data()?.status !== "SUCCEEDED"
        ) {
          tx.update(ref, {
            state: "DRAFT",
            publishCommandId: FieldValue.delete(),
            publishActorUid: FieldValue.delete(),
          });
          tx.update(cmdRef, {
            status: "FAILED",
            error: { code },
            request: FieldValue.delete(),
          });
        }
      });
    }
    throw error;
  }
}

async function beginContentUpload(actor: Actor, raw: unknown) {
  assertAdmin(actor);
  const req = parse(
    z
      .object({
        fileName: z.string().min(1).max(200),
        contentType: z.string().min(1).max(100),
        byteSize: z
          .number()
          .int()
          .positive()
          .max(5 * 1024 * 1024),
        kind: z.enum(["IMAGE", "IMPORT"]),
        commandId: objectId,
      })
      .strict(),
    raw,
  );
  if (/[\\/\x00]/.test(req.fileName))
    fail("VALIDATION_FAILED", "File name cannot contain a path");
  const allowed =
    req.kind === "IMAGE"
      ? ["image/jpeg", "image/png", "image/webp"]
      : [
          "text/csv",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ];
  if (!allowed.includes(req.contentType))
    fail("VALIDATION_FAILED", "Unsupported file type");
  const assetId = stableId(actor.uid, "asset", req.commandId);
  return command(actor, "beginContentUpload", req, async (tx, now) => {
    const asset = {
      id: assetId,
      assetId,
      storagePath: `content/${actor.uid}/${assetId}`,
      contentType: req.contentType,
      byteSize: req.byteSize,
      originalFileName: req.fileName,
      kind: req.kind,
      state: "UPLOADED",
      createdBy: actor.uid,
      createdAt: now,
    };
    tx.create(db.doc(`imageAssets/${assetId}`), asset);
    return { assetId, storagePath: asset.storagePath };
  });
}
async function finalizeContentUpload(actor: Actor, raw: unknown) {
  const req = parse(z.object({ assetId: objectId }).strict(), raw);
  await admin(actor);
  const ref = db.doc(`imageAssets/${req.assetId}`);
  const asset = requireDoc(await ref.get());
  if (asset.createdBy !== actor.uid) fail("PERMISSION_DENIED");
  if (asset.state === "VALIDATED") return asset;
  if (asset.state !== "UPLOADED") fail("VALIDATION_FAILED");
  const verified = await inspectContentUpload(asset);
  return db.runTransaction(async (tx) => {
    await assertActive(actor, tx);
    const current = requireDoc(await tx.get(ref));
    if (current.state === "VALIDATED") return current;
    if (current.state !== "UPLOADED" || current.createdBy !== actor.uid)
      fail("CONFLICT");
    const updated = { ...current, ...verified, state: "VALIDATED" };
    tx.set(ref, updated);
    return updated;
  });
}
async function previewImport(actor: Actor, raw: unknown) {
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
          db.doc(
            `dictionaryReleases/${release.id}/keys/${hash(normalizedKey)}`,
          ),
        )
      ).data();
      if (key && key.normalizedKey === normalizedKey) {
        const releaseEntry = requireDoc(
          await tx.get(
            db.doc(`dictionaryReleases/${release.id}/entries/${key.wordId}`),
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
function rowCounts(rows: Data[]) {
  const counts: Data = { total: rows.length };
  for (const row of rows) counts[row.status] = (counts[row.status] ?? 0) + 1;
  return counts;
}
async function resolveImportRow(actor: Actor, raw: unknown) {
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
async function applyImport(actor: Actor, raw: unknown) {
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
export async function resumeImport(
  actor: Actor,
  importId: string,
  commandId: string,
): Promise<Data> {
  try {
    return await applyImportRows(actor, importId, commandId);
  } catch (error) {
    const code = businessErrorCode(error);
    if (isPermanentJobFailure(code)) {
      await db.runTransaction(async (tx) => {
        const batchRef = importRef(importId);
        const cmdRef = db.doc(`users/${actor.uid}/commands/${commandId}`);
        const [batchSnapshot, commandSnapshot] = await tx.getAll(
          batchRef,
          cmdRef,
        );
        if (
          batchSnapshot.data()?.status === "APPLYING" &&
          batchSnapshot.data()?.applyCommandId === commandId &&
          commandSnapshot.data()?.status === "IN_PROGRESS"
        ) {
          tx.update(batchRef, { status: "FAILED", error: { code } });
          tx.update(cmdRef, {
            status: "FAILED",
            error: { code },
            progress: FieldValue.delete(),
          });
        }
      });
    }
    throw error;
  }
}
async function applyImportRows(
  actor: Actor,
  importId: string,
  commandId: string,
): Promise<Data> {
  assertAdmin(actor);
  const batchRef = importRef(importId);
  const cmdRef = db.doc(`users/${actor.uid}/commands/${commandId}`);
  const rows = await batchRef.collection("rows").orderBy("rowNumber").get();
  for (const rowSnapshot of rows.docs) {
    await db.runTransaction(async (tx) => {
      await assertActive(actor, tx);
      const [batchSnapshot, rowSnap, cmdSnapshot] = await tx.getAll(
        batchRef,
        rowSnapshot.ref,
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
      if (revision.version !== current.progressDraftVersion)
        fail("IMPORT_STALE");
      const release = await resolveRelease(undefined, tx);
      if (release.id !== current.releaseId) fail("IMPORT_STALE");
      if (
        current.skippedRowIds.includes(row.id) ||
        current.duplicateChoices[row.id] === "SKIP"
      ) {
        tx.update(rowSnapshot.ref, { status: "SKIPPED" });
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
          Math.max(-1, ...existingEntries.docs.map((s) => s.data().position)) +
            1,
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
        fail(
          "VALIDATION_FAILED",
          "Import position conflicts with another word",
        );
      if (existing && current.duplicateChoices[row.id] !== "UPDATE")
        fail("IMPORT_STALE", "Word became a duplicate after preview");
      tx.set(ref.collection("words").doc(entry.wordId), {
        ...entry,
        revisionId: current.revisionId,
        wordSetId: current.wordSetId,
      });
      tx.update(ref, { version: revision.version + 1 });
      tx.update(rowSnapshot.ref, {
        status: "APPLIED",
        operation: existing ? "UPDATE" : "ADD",
        appliedAt: Timestamp.now(),
      });
      tx.update(batchRef, {
        progressDraftVersion: revision.version + 1,
        draftVersion: revision.version + 1,
      });
    });
  }
  return db.runTransaction(async (tx) => {
    await assertActive(actor, tx);
    const [batchSnapshot, cmdSnapshot] = await tx.getAll(batchRef, cmdRef);
    if (cmdSnapshot.data()?.status === "SUCCEEDED")
      return cmdSnapshot.data()!.receipt;
    const current = requireDoc(batchSnapshot);
    const rowSnapshots = await tx.get(batchRef.collection("rows"));
    if (
      current.applyCommandId !== commandId ||
      rowSnapshots.docs.some(
        (s) => !["APPLIED", "SKIPPED"].includes(s.data().status),
      )
    )
      fail("CONFLICT");
    const receipt = {
      importId,
      appliedRowIds: rowSnapshots.docs
        .filter((s) => s.data().status === "APPLIED")
        .map((s) => s.id),
      skippedRowIds: rowSnapshots.docs
        .filter((s) => s.data().status === "SKIPPED")
        .map((s) => s.id),
      errors: [],
      draftVersion: current.progressDraftVersion,
    };
    tx.update(batchRef, { status: "APPLIED" });
    tx.update(cmdRef, {
      status: "SUCCEEDED",
      receipt,
      progress: FieldValue.delete(),
    });
    return receipt;
  });
}
export const contentHandlers: Record<
  string,
  (actor: Actor, input: unknown) => Promise<unknown>
> = {
  createDeck,
  openDraft,
  saveDraft,
  publishSet,
  previewImport,
  resolveImportRow,
  applyImport,
  beginContentUpload,
  finalizeContentUpload,
  async listDecks(actor, raw) {
    parse(empty, raw);
    await admin(actor);
    const decks = await db.collection("systemDecks").orderBy("__name__").get();
    const items = await Promise.all(
      decks.docs.map(async (document) => {
        const deck = publicItem(document);
        if (deck.draftRevisionId)
          deck.draft = requireDoc(
            await revisionRef(document.id, deck.draftRevisionId).get(),
          );
        const selectedRevisionId =
          deck.publishedRevisionId ?? deck.draftRevisionId;
        deck.wordCount = selectedRevisionId
          ? (
              await revisionRef(document.id, selectedRevisionId)
                .collection("words")
                .count()
                .get()
            ).data().count
          : 0;
        return deck;
      }),
    );
    return { items };
  },
  async getDraft(actor, raw) {
    const req = parse(z.object({ wordSetId: objectId }).strict(), raw);
    await admin(actor);
    return getDraftData(req.wordSetId);
  },
  async setDeckActive(actor, raw) {
    assertAdmin(actor);
    const req = parse(
      z
        .object({
          wordSetId: objectId,
          active: z.boolean(),
          expectedVersion: version,
          commandId: objectId,
        })
        .strict(),
      raw,
    );
    return command(actor, "setDeckActive", req, async (tx) => {
      const ref = deckRef(req.wordSetId);
      const deck = requireDoc(await tx.get(ref));
      checkVersion(deck.version, req.expectedVersion);
      const updated = {
        ...deck,
        active: req.active,
        version: deck.version + 1,
      };
      tx.set(ref, updated);
      return updated;
    });
  },
  async getImport(actor, raw) {
    const req = parse(z.object({ importId: objectId }).strict(), raw);
    await admin(actor);
    const batch = requireDoc(await importRef(req.importId).get());
    const rows = (
      await importRef(req.importId)
        .collection("rows")
        .orderBy("rowNumber")
        .get()
    ).docs.map((s) => s.data());
    return { ...batch, rows, counts: rowCounts(rows) };
  },
  async listImports(actor, raw) {
    const req = parse(z.object({ wordSetId: objectId }).strict(), raw);
    await admin(actor);
    return {
      items: (
        await db
          .collection("contentImports")
          .where("wordSetId", "==", req.wordSetId)
          .orderBy("createdAt", "desc")
          .get()
      ).docs.map(publicItem),
    };
  },
  async getImageAsset(actor, raw) {
    const req = parse(z.object({ assetId: objectId }).strict(), raw);
    await admin(actor);
    return requireDoc(await db.doc(`imageAssets/${req.assetId}`).get());
  },
  async getSpeech(actor, raw) {
    const req = parse(z.object({ wordId: objectId }).strict(), raw);
    await admin(actor);
    const word = requireDoc(await db.doc(`words/${req.wordId}`).get());
    return (
      word.speech ?? {
        provider: "ANDROID_TTS",
        text: "",
        listenAllowed: false,
        version: 0,
      }
    );
  },
  async saveSpeech(actor, raw) {
    assertAdmin(actor);
    const req = parse(
      z
        .object({
          wordId: objectId,
          listenAllowed: z.boolean(),
          expectedVersion: version,
          commandId: objectId,
        })
        .strict(),
      raw,
    );
    return command(actor, "saveSpeech", req, async (tx) => {
      const release = await resolveRelease(undefined, tx);
      const entry = requireDoc(
        await tx.get(
          db.doc(`dictionaryReleases/${release.id}/entries/${req.wordId}`),
        ),
      );
      const lexical = await readWordVersion(req.wordId, entry.wordVersion, tx);
      const ref = db.doc(`words/${req.wordId}`);
      const word = requireDoc(await tx.get(ref));
      checkVersion(word.speech?.version ?? 0, req.expectedVersion);
      if (req.listenAllowed && (!entry.active || !lexical.meanings.length))
        fail("VALIDATION_FAILED");
      const speech = {
        provider: "ANDROID_TTS",
        text: lexical.spelling,
        listenAllowed: req.listenAllowed,
        version: req.expectedVersion + 1,
      };
      tx.update(ref, { speech });
      return speech;
    });
  },
  async listTopics(actor, raw) {
    parse(empty, raw);
    await admin(actor);
    return {
      items: (
        await db.collection("aiScenarios").orderBy("__name__").get()
      ).docs.map(publicItem),
    };
  },
  async getTopic(actor, raw) {
    const req = parse(z.object({ topicId: objectId }).strict(), raw);
    await admin(actor);
    return requireDoc(await db.doc(`aiScenarios/${req.topicId}`).get());
  },
  async saveTopic(actor, raw) {
    assertAdmin(actor);
    const req = parse(
      z
        .object({
          topicId: objectId.optional(),
          name: z.string().trim().min(1).max(150),
          context: z.string().trim().min(1).max(2000),
          learnerRole: z.string().trim().min(1).max(300),
          aiRole: z.string().trim().min(1).max(300),
          goal: z.string().trim().min(1).max(1000),
          openingLine: z.string().trim().min(1).max(1000),
          guide: z.string().trim().min(1).max(2000),
          active: z.boolean(),
          expectedVersion: version,
          commandId: objectId,
        })
        .strict(),
      raw,
    );
    return command(actor, "saveTopic", req, async (tx, now) => {
      const topicId =
        req.topicId ?? stableId(actor.uid, "topic", req.commandId);
      const ref = db.doc(`aiScenarios/${topicId}`);
      const old = (await tx.get(ref)).data();
      checkVersion(old?.version ?? 0, req.expectedVersion);
      const { expectedVersion, commandId: _commandId, ...data } = req;
      const topic = {
        ...data,
        id: topicId,
        version: expectedVersion + 1,
        updatedAt: now,
      };
      tx.set(ref, topic);
      return topic;
    });
  },
  async getLimit(actor, raw) {
    parse(empty, raw);
    await admin(actor);
    return (
      (await db.doc("config/ai").get()).data() ?? {
        maxSessionsPerDay: 0,
        version: 0,
      }
    );
  },
  async saveLimit(actor, raw) {
    assertAdmin(actor);
    const req = parse(
      z
        .object({
          maxSessionsPerDay: z
            .number()
            .int()
            .nonnegative()
            .max(Number.MAX_SAFE_INTEGER),
          expectedVersion: version,
          commandId: objectId,
        })
        .strict(),
      raw,
    );
    return command(actor, "saveLimit", req, async (tx) => {
      const ref = db.doc("config/ai");
      const old = (await tx.get(ref)).data();
      checkVersion(old?.version ?? 0, req.expectedVersion);
      const limit = {
        maxSessionsPerDay: req.maxSessionsPerDay,
        version: req.expectedVersion + 1,
      };
      tx.set(ref, limit);
      return limit;
    });
  },
};
