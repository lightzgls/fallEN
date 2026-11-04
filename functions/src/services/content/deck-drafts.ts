import { z } from "zod";
import { objectId, stableId, version } from "../../domain/backend.js";
import { entrySchema, metadataSchema } from "../../domain/content-schemas.js";
import {
  deckRef,
  revisionRef,
} from "../../infrastructure/content/references.js";
import {
  assertAdmin,
  checkVersion,
  command,
  db,
  fail,
  parse,
  requireDoc,
  type Actor,
  type Data,
} from "../../shared/core.js";
import {
  assertDraft,
  checkEncodedSize,
  validateAsset,
  validateEntries,
} from "./validation.js";

export async function createDeck(actor: Actor, raw: unknown) {
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

export async function openDraft(actor: Actor, raw: unknown) {
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

export async function saveDraft(actor: Actor, raw: unknown) {
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

export async function setDeckActive(actor: Actor, raw: unknown) {
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
}
