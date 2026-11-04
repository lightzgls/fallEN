import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import {
  businessErrorCode,
  isPermanentJobFailure,
} from "../../domain/job-errors.js";
import { objectId, version } from "../../domain/values.js";
import { entrySchema, metadataSchema } from "../../domain/content.js";
import { deckRef, revisionRef } from "../../infrastructure/content/refs.js";
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
  type Data,
} from "../../shared/core.js";
import { assertDraft, validateEntries } from "./validation.js";

export const publishSchema = z
  .object({
    wordSetId: objectId,
    revisionId: objectId,
    expectedWordSetVersion: version,
    expectedDraftVersion: version,
    commandId: objectId,
  })
  .strict();

export async function publishSet(actor: Actor, raw: unknown) {
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
