import type { Actor } from "../../contracts/callable.js";
import type { RatingInput } from "../../contracts/learning/inputs.js";
import type {
  Memory,
  Membership,
  Rating,
} from "../../contracts/learning/records.js";
import type {
  RatingContext,
  RatingStore,
} from "../../contracts/learning/store.js";
import { stableId } from "../../domain/values.js";
import { newPlan } from "../../domain/review-plan.js";
import { advanceActivity } from "../../domain/learning-activity.js";
import { dayKey } from "../../shared/clock.js";
import { readRatingState } from "./rating-state.js";
export function saveRating(store: RatingStore, actor: Actor, req: RatingInput) {
  return store.command(actor, "saveRating", req, async (ctx, now) => {
    const state = await readRatingState(ctx, req, now);
    return stageRatingOutcome(actor, req, state, ctx, now);
  });
}
function stageRatingOutcome(
  actor: Actor,
  req: RatingInput,
  state: Awaited<ReturnType<typeof readRatingState>>,
  ctx: RatingContext,
  now: Date,
) {
  const {
    study,
    currentMemory,
    membership,
    previousPlan,
    place,
    nextWordId,
    allItems,
    today,
    summary,
  } = state;
  let { plan } = state;
  const newlyRemembered =
    req.choice === "REMEMBERED" && !currentMemory.everRemembered;
  const memory: Memory = {
    ...currentMemory,
    lastChoice: req.choice,
    lastRatedAt: now,
    version: currentMemory.version + 1,
    ...(newlyRemembered
      ? { everRemembered: true, firstRememberedAt: now }
      : {}),
  };
  const rating: Rating = {
    id: req.eventId,
    sessionId: req.sessionId,
    wordId: req.wordId,
    mode: study.mode,
    choice: req.choice,
    savedAt: now,
    dayKey: dayKey(now),
    ...(study.mode === "SRS"
      ? { previousLevel: previousPlan!.level, level: plan!.level }
      : {}),
  };
  if (
    study.mode === "FLASHCARD" &&
    req.choice === "NOT_REMEMBERED" &&
    !membership?.active
  ) {
    const saved: Membership = {
      wordId: req.wordId,
      active: true,
      addedAt: now,
      membershipVersion: (membership?.membershipVersion ?? 0) + 1,
      source: "FLASHCARD",
      ...(study.source.sourceType === "SYSTEM_DECK"
        ? {
            sourceWordSetId: study.source.wordSetId,
            sourceRevisionId: study.source.revisionId,
          }
        : {}),
    };
    plan = newPlan(
      req.wordId,
      stableId(actor.uid, "autoCycle", req.eventId),
      now,
    );
    ctx.saveMembership(saved);
    ctx.savePlan(plan);
  } else if (study.mode === "SRS") ctx.savePlan(plan!);
  ctx.createRating(rating);
  ctx.saveMemory(memory);
  ctx.markRated(req.sessionId, req.wordId, req.eventId);
  if (place) {
    ctx.savePlace(place);
    ctx.updateStudy(req.sessionId, { placeVersion: place.version });
  }
  const activity = advanceActivity(
    now,
    today,
    summary,
    study.mode,
    1,
    newlyRemembered ? 1 : 0,
  );
  if (activity.day) ctx.saveDay(activity.day);
  ctx.saveSummary(activity.summary);
  if (study.source.sourceType === "SYSTEM_DECK")
    ctx.saveRecentSet({
      wordSetId: study.source.wordSetId!,
      lastActivityAt: now,
    });
  return {
    rating,
    memory,
    ...(plan ? { plan } : {}),
    ...(place ? { place } : {}),
    ...(nextWordId ? { nextWordId } : {}),
    completed: allItems.every(
      (i) => i.wordId === req.wordId || !!i.ratedEventId,
    ),
  };
}
