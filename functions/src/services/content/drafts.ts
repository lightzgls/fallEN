import type { Actor } from "../../contracts/callable.js";
import type { DraftStore } from "../../contracts/content/ports.js";
import type {
  CreateDeckInput,
  OpenDraftInput,
  SaveDraftInput,
  SetDeckActiveInput,
} from "../../contracts/content/drafts-inputs.js";
import { stableId } from "../../domain/values.js";
import {
  assertDraft,
  checkEncodedSize,
  contentVersion,
  draftMetadata,
} from "../../domain/content-rules.js";
import { fail } from "../../shared/errors.js";
import { required } from "./required.js";
import { validateAsset, validateEntries } from "./validation.js";
export function createDraftOperations(store: DraftStore) {
  return {
    createDeck: async (actor: Actor, req: CreateDeckInput) => {
      const wordSetId = stableId(actor.uid, "deck", req.commandId),
        revisionId = stableId(actor.uid, "draft", req.commandId);
      return store.command(actor, "createDeck", req, async (tx, now) => {
        if (req.metadata.coverImageAssetId)
          await validateAsset(tx, req.metadata.coverImageAssetId);
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
        tx.stageDeck(wordSetId, wordSet, "create");
        tx.stageRevision(wordSetId, revisionId, revision, "create");
        return { wordSet, revision, entries: [] };
      });
    },
    openDraft: async (actor: Actor, req: OpenDraftInput) =>
      store.command(actor, "openDraft", req, async (tx, now) => {
        const wordSet = required(await tx.deck(req.wordSetId));
        contentVersion(wordSet.version, req.expectedWordSetVersion);
        if (wordSet.draftRevisionId) {
          const revision = required(
            await tx.revision(req.wordSetId, wordSet.draftRevisionId),
          );
          const entries = await tx.entries(
            req.wordSetId,
            wordSet.draftRevisionId,
          );
          return { wordSet, revision, entries };
        }
        if (!wordSet.publishedRevisionId) fail("DRAFT_NOT_FOUND");
        const published = required(
          await tx.revision(req.wordSetId, wordSet.publishedRevisionId),
        );
        const entries = await tx.entries(
            req.wordSetId,
            wordSet.publishedRevisionId,
          ),
          revisionId = stableId(actor.uid, "draft", req.commandId);
        const revision = {
          id: revisionId,
          wordSetId: req.wordSetId,
          ...draftMetadata(published),
          state: "DRAFT",
          version: 1,
          createdBy: actor.uid,
          createdAt: now,
        };
        tx.stageRevision(req.wordSetId, revisionId, revision, "create");
        for (const entry of entries)
          tx.stageEntry(
            req.wordSetId,
            revisionId,
            entry.wordId,
            { ...entry, revisionId },
            "create",
          );
        const updatedSet = {
          ...wordSet,
          draftRevisionId: revisionId,
          version: wordSet.version + 1,
        };
        tx.stageDeck(req.wordSetId, updatedSet, "replace");
        return {
          wordSet: updatedSet,
          revision,
          entries: entries.map((entry) => ({ ...entry, revisionId })),
        };
      }),
    saveDraft: async (actor: Actor, req: SaveDraftInput) => {
      checkEncodedSize(req, 500 * 1024);
      return store.command(actor, "saveDraft", req, async (tx, now) => {
        const [deck, revision, oldEntries, applying] = await Promise.all([
          tx.deck(req.wordSetId),
          tx.revision(req.wordSetId, req.revisionId),
          tx.entries(req.wordSetId, req.revisionId),
          tx.applyingImports(req.wordSetId, req.revisionId),
        ]);
        const current = required(revision);
        if (
          required(deck).draftRevisionId !== req.revisionId ||
          applying.length
        )
          fail("CONFLICT", "Import or another draft is currently active");
        assertDraft(current);
        contentVersion(current.version, req.expectedVersion);
        await validateEntries(tx, req.entries, req.metadata);
        const updated = {
          id: req.revisionId,
          wordSetId: req.wordSetId,
          ...req.metadata,
          state: "DRAFT",
          version: current.version + 1,
          createdBy: current.createdBy,
          createdAt: current.createdAt,
          updatedAt: now,
        };
        const ids = new Set(req.entries.map((entry) => entry.wordId));
        for (const entry of oldEntries)
          if (!ids.has(entry.wordId))
            tx.removeEntry(req.wordSetId, req.revisionId, entry.wordId);
        for (const entry of req.entries)
          tx.stageEntry(
            req.wordSetId,
            req.revisionId,
            entry.wordId,
            { ...entry, revisionId: req.revisionId, wordSetId: req.wordSetId },
            "replace",
          );
        tx.stageRevision(req.wordSetId, req.revisionId, updated, "replace");
        return updated;
      });
    },
    setDeckActive: async (actor: Actor, req: SetDeckActiveInput) =>
      store.command(actor, "setDeckActive", req, async (tx) => {
        const deck = required(await tx.deck(req.wordSetId));
        contentVersion(deck.version, req.expectedVersion);
        const updated = {
          ...deck,
          active: req.active,
          version: deck.version + 1,
        };
        tx.stageDeck(req.wordSetId, updated, "replace");
        return updated;
      }),
  };
}
