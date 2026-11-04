import type { RatingContext } from "../../contracts/learning/store.js";
import type { RatingInput } from "../../contracts/learning/inputs.js";
import type { Memory, Place } from "../../contracts/learning/records.js";
import {
  requireRecord,
  requireVersion,
} from "../../domain/study-consistency.js";
import { reviewDays, reviewLevel } from "../../domain/learning-rules.js";
import { dayKey, addDays } from "../../shared/clock.js";
import { fail } from "../../shared/errors.js";
export async function readRatingState(
  ctx: RatingContext,
  req: RatingInput,
  now: Date,
) {
  const study = requireRecord(await ctx.study(req.sessionId)),
    item = requireRecord(await ctx.item(req.sessionId, req.wordId)),
    memory = await ctx.memory(req.wordId),
    membership = await ctx.membership(req.wordId),
    previousPlan = await ctx.plan(req.wordId),
    event = await ctx.rating(req.eventId);
  if (study.status !== "ACTIVE")
    fail("CONFLICT", "Study session is not active");
  if (event || item.ratedEventId)
    fail("CONFLICT", "This card has already been rated");
  const currentMemory: Memory = memory ?? {
    wordId: req.wordId,
    version: 0,
    everRemembered: false,
  };
  requireVersion(currentMemory.version, req.expectedMemoryVersion);
  let plan = previousPlan,
    place: Place | undefined,
    nextWordId: string | undefined;
  const allItems = await ctx.items(req.sessionId);
  if (study.mode === "FLASHCARD") {
    const currentPlace = requireRecord(await ctx.place(study.source));
    if (req.expectedPlaceVersion === undefined)
      fail("VALIDATION_FAILED", "Flashcard rating needs place version");
    requireVersion(currentPlace.version, req.expectedPlaceVersion);
    if (currentPlace.nextWordId !== req.wordId)
      fail("CONFLICT", "This card is not the current study position");
    nextWordId = allItems.find((i) => i.position > item.position)?.wordId;
    place = {
      ...currentPlace,
      nextWordId: nextWordId ?? null,
      completed: !nextWordId,
      updatedAt: now,
      version: currentPlace.version + 1,
    };
  } else if (study.mode === "SRS") {
    if (!membership?.active || !plan)
      fail("CONFLICT", "This word is no longer scheduled");
    if (
      req.expectedPlanVersion === undefined ||
      !req.cycleId ||
      req.membershipVersion === undefined
    )
      fail(
        "VALIDATION_FAILED",
        "SRS rating needs schedule, cycle and membership versions",
      );
    requireVersion(plan.version, req.expectedPlanVersion);
    requireVersion(membership.membershipVersion, req.membershipVersion);
    if (
      plan.cycleId !== req.cycleId ||
      plan.cycleId !== item.cycleId ||
      plan.dueDate > dayKey(now)
    )
      fail("CONFLICT", "Review schedule has changed or is not due");
    const entry = await ctx.entry(req.wordId, await ctx.releaseId());
    if (!entry?.active)
      fail("WORD_UNAVAILABLE", "This word is no longer available");
    const level = reviewLevel(plan.level, req.choice === "REMEMBERED");
    plan = {
      ...plan,
      level,
      dueDate: addDays(dayKey(now), reviewDays[level - 1]),
      version: plan.version + 1,
    };
  } else fail("VALIDATION_FAILED", "Unknown study mode");
  if (
    study.mode === "FLASHCARD" &&
    req.choice === "NOT_REMEMBERED" &&
    !membership?.active
  ) {
    const entry = await ctx.entry(req.wordId, await ctx.releaseId());
    if (!entry?.active) fail("WORD_UNAVAILABLE");
  }
  const today = await ctx.day(dayKey(now)),
    summary = await ctx.summary();
  return {
    study,
    currentMemory,
    membership,
    plan,
    previousPlan,
    place,
    nextWordId,
    allItems,
    today,
    summary,
  };
}
