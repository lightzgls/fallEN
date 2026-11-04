import type { Actor } from "../../contracts/callable.js";
import type {
  StartStudyInput,
  StartReviewInput,
  EndStudyInput,
} from "../../contracts/learning/inputs.js";
import type {
  Study,
  Place,
  StudyItem,
} from "../../contracts/learning/records.js";
import type { StudyStore } from "../../contracts/learning/store.js";
import { stableId } from "../../domain/values.js";
import { requireRecord } from "../../domain/study-consistency.js";
import { dayKey } from "../../shared/clock.js";
import { fail } from "../../shared/errors.js";
import { dueWords } from "./due-words.js";
export function startStudy(
  store: StudyStore,
  actor: Actor,
  req: StartStudyInput,
) {
  return store.command(actor, "startStudy", req, async (ctx, now) => {
    const source = await ctx.source(req.source);
    if (!source.words.length)
      fail("EMPTY_SOURCE", "This source contains no available words");
    const currentPlace = await ctx.place(req.source);
    let startIndex = 0;
    if (req.startMode === "FROM_WORD") {
      startIndex = source.words.findIndex((w) => w.wordId === req.startWordId);
      if (startIndex < 0)
        fail("CONFLICT", "Requested word is no longer in this source");
    } else if (
      req.startMode === "CONTINUE" &&
      currentPlace?.nextWordId &&
      !currentPlace.completed
    ) {
      startIndex = source.words.findIndex(
        (w) => w.wordId === currentPlace.nextWordId,
      );
      if (startIndex < 0)
        fail("CONFLICT", "Saved position is no longer available");
    }
    const planned: StudyItem[] = source.words
      .slice(startIndex)
      .map((w, position) => ({
        wordId: w.wordId,
        wordVersion: w.wordVersion,
        position,
      }));
    const place: Place = {
      source: source.source,
      nextWordId: planned[0].wordId,
      completed: false,
      updatedAt: now,
      version: (currentPlace?.version ?? 0) + 1,
    };
    const study: Study = {
      id: stableId(actor.uid, "study", req.commandId),
      mode: "FLASHCARD",
      source: source.source,
      startWordId: planned[0].wordId,
      plannedCardCount: planned.length,
      plannedWords: planned.map(({ wordId, wordVersion }) => ({
        wordId,
        wordVersion,
      })),
      status: "ACTIVE",
      startedAt: now,
      placeVersion: place.version,
    };
    ctx.saveStudy(study);
    ctx.saveItems(study.id, planned);
    ctx.savePlace(place);
    return study;
  });
}
export function startReview(
  store: StudyStore,
  actor: Actor,
  req: StartReviewInput,
) {
  return store.command(actor, "startReview", req, async (ctx, now) => {
    const due = await dueWords(ctx, dayKey(now));
    if (!due.length) fail("EMPTY_SOURCE", "No words are due for review");
    const planned: StudyItem[] = due.map((item, position) => ({
      wordId: item.wordId,
      wordVersion: item.word.version,
      position,
      cycleId: item.plan.cycleId,
      planVersion: item.plan.version,
      membershipVersion: item.membershipVersion,
    }));
    const study: Study = {
      id: stableId(actor.uid, "review", req.commandId),
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
    ctx.saveStudy(study);
    ctx.saveItems(study.id, planned);
    return study;
  });
}
export function endStudy(store: StudyStore, actor: Actor, req: EndStudyInput) {
  return store.command(actor, "endStudy", req, async (ctx, now) => {
    const study = requireRecord(await ctx.study(req.sessionId)),
      ratings = await ctx.ratings(req.sessionId),
      remembered = ratings.filter((r) => r.choice === "REMEMBERED").length;
    const result = {
      sessionId: req.sessionId,
      plannedCardCount: study.plannedCardCount,
      ratedCount: ratings.length,
      rememberedCount: remembered,
      notRememberedCount: ratings.length - remembered,
      unratedCount: study.plannedCardCount - ratings.length,
      ratings,
    };
    if (study.status === "ACTIVE")
      ctx.updateStudy(study.id, { status: "FINISHED", endedAt: now });
    return result;
  });
}
