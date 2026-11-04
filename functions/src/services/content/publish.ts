import type { Actor } from "../../contracts/callable.js";
import type { PublicationStore } from "../../contracts/content/ports.js";
import type { PublishSetInput } from "../../contracts/content/publication-inputs.js";
import type { RecordData, SetWord } from "../../contracts/content/records.js";
import {
  businessErrorCode,
  isPermanentJobFailure,
} from "../../domain/job-errors.js";
import {
  assertDraft,
  contentVersion,
  draftMetadata,
} from "../../domain/content-rules.js";
import { fail } from "../../shared/errors.js";
import { hash } from "../../shared/values.js";
import { required } from "./required.js";
import { validateEntries } from "./validation.js";
function publishedEntry(entry: SetWord): SetWord {
  const content: SetWord = {
    wordId: entry.wordId,
    wordVersion: entry.wordVersion,
    position: entry.position,
  };
  for (const field of [
    "focusMeaningId",
    "example",
    "exampleTranslation",
    "imageAssetId",
    "imageAlt",
  ] as const)
    if (entry[field] !== undefined) content[field] = entry[field];
  return content;
}
export function createPublicationOperations(store: PublicationStore) {
  async function resumePublish(
    actor: Actor,
    wordSetId: string,
    revisionId: string,
    commandId: string,
  ): Promise<RecordData> {
    try {
      await store.active(actor);
      const command = required(
        await store.processedCommand(actor.uid, commandId),
      );
      if (command.status === "SUCCEEDED") return required(command.receipt);
      const revision = required(await store.revision(wordSetId, revisionId));
      if (
        revision.state !== "VALIDATING" ||
        revision.publishCommandId !== commandId
      )
        fail("CONFLICT");
      const entries = (await store.entries(wordSetId, revisionId)).map(
        publishedEntry,
      );
      if (!entries.length)
        fail("VALIDATION_FAILED", "A published deck needs at least one word");
      const metadata = draftMetadata(revision);
      await validateEntries(store, entries, metadata);
      const contentHash = hash({ metadata, entries });
      return await store.transaction(actor, async (tx, now) => {
        const command = required(
          await tx.processedCommand(actor.uid, commandId),
        );
        if (command.status === "SUCCEEDED") return required(command.receipt);
        const deck = required(await tx.deck(wordSetId)),
          locked = required(await tx.revision(wordSetId, revisionId));
        if (deck.publishedRevisionId)
          await tx.revision(wordSetId, deck.publishedRevisionId);
        const request = required(command.request);
        contentVersion(deck.version, request.expectedWordSetVersion);
        contentVersion(locked.version, request.expectedDraftVersion);
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
        tx.stageRevision(
          wordSetId,
          revisionId,
          { state: "PUBLISHED", contentHash, publishedAt: now },
          "patch",
        );
        if (deck.publishedRevisionId && deck.publishedRevisionId !== revisionId)
          tx.stageRevision(
            wordSetId,
            deck.publishedRevisionId,
            { state: "RETIRED" },
            "patch",
          );
        tx.stageDeck(
          wordSetId,
          {
            ...metadata,
            publishedRevisionId: revisionId,
            version: receipt.version,
          },
          "patch",
          ["draftRevisionId"],
        );
        tx.stageCommand(
          actor.uid,
          commandId,
          { status: "SUCCEEDED", receipt },
          "patch",
          ["progress", "request"],
        );
        return receipt;
      });
    } catch (error) {
      const code = businessErrorCode(error);
      if (isPermanentJobFailure(code))
        await store.transaction(
          actor,
          async (tx) => {
            const [revision, command] = await Promise.all([
              tx.revision(wordSetId, revisionId),
              tx.processedCommand(actor.uid, commandId),
            ]);
            if (
              revision?.state === "VALIDATING" &&
              revision.publishCommandId === commandId &&
              command?.status !== "SUCCEEDED"
            ) {
              tx.stageRevision(
                wordSetId,
                revisionId,
                { state: "DRAFT" },
                "patch",
                ["publishCommandId", "publishActorUid"],
              );
              tx.stageCommand(
                actor.uid,
                commandId,
                { status: "FAILED", error: { code } },
                "patch",
                ["request"],
              );
            }
            return {};
          },
          false,
        );
      throw error;
    }
  }
  return {
    resumePublish,
    publishSet: async (actor: Actor, req: PublishSetInput) => {
      const requestHash = hash({ kind: "publishSet", input: req });
      const previous = await store.transaction(actor, async (tx, now) => {
        const command = await tx.processedCommand(actor.uid, req.commandId);
        if (command) {
          if (
            command.kind !== "publishSet" ||
            command.requestHash !== requestHash
          )
            fail("COMMAND_REUSED");
          return command;
        }
        const deck = required(await tx.deck(req.wordSetId)),
          revision = required(await tx.revision(req.wordSetId, req.revisionId)),
          applying = await tx.applyingImports(req.wordSetId, req.revisionId);
        contentVersion(deck.version, req.expectedWordSetVersion);
        contentVersion(revision.version, req.expectedDraftVersion);
        assertDraft(revision);
        if (deck.draftRevisionId !== req.revisionId || applying.length)
          fail("CONFLICT");
        tx.stageRevision(
          req.wordSetId,
          req.revisionId,
          {
            state: "VALIDATING",
            publishCommandId: req.commandId,
            publishActorUid: actor.uid,
          },
          "patch",
        );
        tx.stageCommand(
          actor.uid,
          req.commandId,
          {
            kind: "publishSet",
            requestHash,
            status: "IN_PROGRESS",
            progress: {
              phase: "VALIDATING",
              wordSetId: req.wordSetId,
              revisionId: req.revisionId,
            },
            request: req,
            createdAt: now,
          },
          "create",
        );
        return { kind: "publishSet", requestHash, status: "IN_PROGRESS" };
      });
      if (previous.status === "SUCCEEDED") return previous.receipt;
      if (previous.status === "FAILED")
        fail(previous.error?.code ?? "PUBLISH_FAILED");
      return resumePublish(actor, req.wordSetId, req.revisionId, req.commandId);
    },
  };
}
