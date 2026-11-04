import { z } from "zod";
import {
  objectId,
  sourceKey,
  sourceSchema,
  stableId,
} from "../../domain/backend.js";
import {
  dataWithId,
  userRef,
} from "../../infrastructure/learning/references.js";
import {
  command,
  db,
  fail,
  parse,
  requireDoc,
  type Actor,
  type Data,
} from "../../shared/core.js";
import { dueWords } from "./review-list.js";
import { sourceWords } from "./sources.js";

export const startStudySchema = z
  .object({
    source: sourceSchema,
    startMode: z.enum(["START_OVER", "CONTINUE", "FROM_WORD"]),
    startWordId: objectId.optional(),
    commandId: objectId,
  })
  .strict();

export async function startStudy(actor: Actor, input: unknown) {
  const req = parse(startStudySchema, input);
  const sessionId = stableId(actor.uid, "study", req.commandId);
  return command(actor, "startStudy", req, async (tx, now) => {
    const source = await sourceWords(actor, req.source, tx);
    if (!source.words.length)
      fail("EMPTY_SOURCE", "This source contains no available words");
    const placeRef = userRef(
      actor,
      "flashcardPositions",
      sourceKey(req.source),
    );
    const currentPlace = (await tx.get(placeRef)).data();
    let startIndex = 0;
    if (req.startMode === "FROM_WORD") {
      startIndex = source.words.findIndex(
        (w: Data) => w.wordId === req.startWordId,
      );
      if (startIndex < 0)
        fail("CONFLICT", "Requested word is no longer in this source");
    } else if (
      req.startMode === "CONTINUE" &&
      currentPlace?.nextWordId &&
      !currentPlace.completed
    ) {
      startIndex = source.words.findIndex(
        (w: Data) => w.wordId === currentPlace.nextWordId,
      );
      if (startIndex < 0)
        fail("CONFLICT", "Saved position is no longer available");
    }
    const planned = source.words
      .slice(startIndex)
      .map((w: Data, position: number) => ({
        wordId: w.wordId,
        wordVersion: w.wordVersion,
        position,
      }));
    const place = {
      source: source.source,
      nextWordId: planned[0].wordId,
      completed: false,
      updatedAt: now,
      version: (currentPlace?.version ?? 0) + 1,
    };
    const study = {
      id: sessionId,
      mode: "FLASHCARD",
      source: source.source,
      startWordId: planned[0].wordId,
      plannedCardCount: planned.length,
      plannedWords: planned.map(({ wordId, wordVersion }: Data) => ({
        wordId,
        wordVersion,
      })),
      status: "ACTIVE",
      startedAt: now,
      placeVersion: place.version,
    };
    tx.set(userRef(actor, "studySessions", sessionId), study);
    for (const item of planned)
      tx.set(
        db.doc(
          `users/${actor.uid}/studySessions/${sessionId}/items/${item.wordId}`,
        ),
        item,
      );
    tx.set(placeRef, place);
    return study;
  });
}

export async function startReview(actor: Actor, input: unknown) {
  const req = parse(z.object({ commandId: objectId }).strict(), input);
  const sessionId = stableId(actor.uid, "review", req.commandId);
  return command(actor, "startReview", req, async (tx, now) => {
    const due = await dueWords(actor, tx);
    if (!due.length) fail("EMPTY_SOURCE", "No words are due for review");
    const planned = due.map((item, position) => ({
      wordId: item.wordId,
      wordVersion: item.word.version,
      position,
      cycleId: item.plan.cycleId,
      planVersion: item.plan.version,
      membershipVersion: item.membershipVersion,
    }));
    const study = {
      id: sessionId,
      mode: "SRS",
      source: { sourceType: "PERSONAL_VOCABULARY" },
      startWordId: planned[0].wordId,
      plannedCardCount: planned.length,
      plannedWords: planned.map(({ wordId, wordVersion }) => ({
        wordId,
        wordVersion,
      })),
      status: "ACTIVE",
      startedAt: now,
    };
    tx.set(userRef(actor, "studySessions", sessionId), study);
    for (const item of planned)
      tx.set(
        db.doc(
          `users/${actor.uid}/studySessions/${sessionId}/items/${item.wordId}`,
        ),
        item,
      );
    return study;
  });
}

export async function endStudy(actor: Actor, input: unknown) {
  const req = parse(
    z.object({ sessionId: objectId, commandId: objectId }).strict(),
    input,
  );
  return command(actor, "endStudy", req, async (tx, now) => {
    const ref = userRef(actor, "studySessions", req.sessionId);
    const study = requireDoc(await tx.get(ref));
    const ratings = await tx.get(
      db
        .collection(`users/${actor.uid}/assessmentEvents`)
        .where("sessionId", "==", req.sessionId),
    );
    const remembered = ratings.docs.filter(
      (s) => s.data().choice === "REMEMBERED",
    ).length;
    const result = {
      sessionId: req.sessionId,
      plannedCardCount: study.plannedCardCount,
      ratedCount: ratings.size,
      rememberedCount: remembered,
      notRememberedCount: ratings.size - remembered,
      unratedCount: study.plannedCardCount - ratings.size,
      ratings: ratings.docs.map(dataWithId),
    };
    if (study.status === "ACTIVE")
      tx.update(ref, { status: "FINISHED", endedAt: now });
    return result;
  });
}
