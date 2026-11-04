import { FieldPath, Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { empty, objectId, stableId, version } from "../../domain/backend.js";
import { newPlan } from "../../domain/review-plan.js";
import {
  decodeCursor,
  encodeCursor,
} from "../../infrastructure/learning/pagination.js";
import { userRef } from "../../infrastructure/learning/references.js";
import {
  assertActive,
  checkVersion,
  command,
  db,
  fail,
  parse,
  requireDoc,
  type Actor,
  type Data,
} from "../../shared/core.js";
import { readWord, resolveRelease } from "../dictionary.js";

export const wordCommand = z.object({ wordId: objectId, commandId: objectId });

export const saveWordSchema = wordCommand
  .extend({
    source: z.enum(["DICTIONARY", "FLASHCARD", "EXTERNAL_LOOKUP", "SHARE"]),
    expectedMembershipVersion: version.optional(),
    studyId: objectId.optional(),
    releaseId: objectId.optional(),
  })
  .strict();

export async function saveWord(actor: Actor, input: unknown) {
  const req = parse(saveWordSchema, input);
  return command(actor, "saveWord", req, async (tx, now) => {
    const ref = userRef(actor, "personalWords", req.wordId);
    const planRef = userRef(actor, "srsSchedules", req.wordId);
    const [membershipSnapshot, scheduleSnapshot] = await tx.getAll(
      ref,
      planRef,
    );
    const existing = membershipSnapshot.data();
    if (existing?.active)
      return {
        savedWord: existing,
        ...(scheduleSnapshot.exists ? { plan: scheduleSnapshot.data() } : {}),
      };
    if (req.expectedMembershipVersion !== undefined)
      checkVersion(
        existing?.membershipVersion ?? 0,
        req.expectedMembershipVersion,
      );
    const currentRelease = await resolveRelease(undefined, tx);
    const currentEntry = (
      await tx.get(
        db.doc(`dictionaryReleases/${currentRelease.id}/entries/${req.wordId}`),
      )
    ).data();
    if (!currentEntry?.active) fail("WORD_UNAVAILABLE");
    let provenance: Data = {};
    if (req.source === "FLASHCARD") {
      if (!req.studyId)
        fail("VALIDATION_FAILED", "FLASHCARD saving requires a study session");
      const study = requireDoc(
        await tx.get(userRef(actor, "studySessions", req.studyId!)),
      );
      const item = await tx.get(
        db.doc(
          `users/${actor.uid}/studySessions/${req.studyId}/items/${req.wordId}`,
        ),
      );
      if (study.mode !== "FLASHCARD" || !item.exists)
        fail(
          "VALIDATION_FAILED",
          "Word does not belong to this flashcard session",
        );
      if (study.source.sourceType === "SYSTEM_DECK")
        provenance = {
          sourceWordSetId: study.source.wordSetId,
          sourceRevisionId: study.source.revisionId,
        };
    } else if (req.studyId)
      fail("VALIDATION_FAILED", "Only a flashcard source accepts studyId");
    await readWord(req.wordId, req.releaseId, tx);
    const savedWord = {
      wordId: req.wordId,
      active: true,
      addedAt: now,
      membershipVersion: (existing?.membershipVersion ?? 0) + 1,
      source: req.source,
      ...provenance,
    };
    const plan = newPlan(
      req.wordId,
      stableId(actor.uid, "cycle", req.commandId),
      now.toDate(),
    );
    tx.set(ref, savedWord);
    tx.set(planRef, plan);
    return { savedWord, plan };
  });
}

export async function removeWord(actor: Actor, input: unknown) {
  const req = parse(
    wordCommand.extend({ expectedMembershipVersion: version }).strict(),
    input,
  );
  return command(actor, "removeWord", req, async (tx, now) => {
    const ref = userRef(actor, "personalWords", req.wordId);
    const existing = requireDoc(await tx.get(ref));
    checkVersion(existing.membershipVersion, req.expectedMembershipVersion);
    const savedWord = {
      ...existing,
      active: false,
      removedAt: now,
      membershipVersion: existing.membershipVersion + 1,
    };
    tx.set(ref, savedWord);
    tx.delete(userRef(actor, "srsSchedules", req.wordId));
    return { savedWord };
  });
}

export async function getSavedWords(actor: Actor, input: unknown) {
  const req = parse(
    z
      .object({
        cursor: z.string().max(1024).optional(),
        pageSize: z.number().int().min(1).max(100).default(30),
      })
      .strict(),
    input,
  );
  await assertActive(actor);
  let query = db
    .collection(`users/${actor.uid}/personalWords`)
    .where("active", "==", true)
    .orderBy("addedAt")
    .orderBy(FieldPath.documentId());
  if (req.cursor) {
    const cursor = decodeCursor(req.cursor, actor.uid, "saved");
    query = query.startAfter(Timestamp.fromMillis(cursor.time), cursor.id);
  }
  const page = await query.limit(req.pageSize + 1).get();
  const release = await resolveRelease();
  const items: Data[] = [];
  for (const snapshot of page.docs.slice(0, req.pageSize)) {
    const entry = (
      await db
        .doc(`dictionaryReleases/${release.id}/entries/${snapshot.id}`)
        .get()
    ).data();
    items.push({
      ...snapshot.data(),
      available: !!entry?.active,
      ...(entry?.active
        ? { word: await readWord(snapshot.id, release.id) }
        : {}),
    });
  }
  const last = page.docs[req.pageSize - 1];
  return {
    items,
    ...(page.size > req.pageSize
      ? {
          cursor: encodeCursor({
            uid: actor.uid,
            kind: "saved",
            time: last.data().addedAt.toMillis(),
            id: last.id,
          }),
        }
      : {}),
  };
}

export async function getSavedWordCount(actor: Actor, input: unknown) {
  parse(empty, input);
  await assertActive(actor);
  return {
    count: (
      await db
        .collection(`users/${actor.uid}/personalWords`)
        .where("active", "==", true)
        .count()
        .get()
    ).data().count,
  };
}
