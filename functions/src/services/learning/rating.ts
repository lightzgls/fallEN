import { stableId } from "../../domain/values.js";
import { newPlan } from "../../domain/review-plan.js";
import { stageActivity } from "../../infrastructure/learning/activity.js";
import { userRef } from "../../infrastructure/learning/refs.js";
import { command, dayKey, parse, type Actor } from "../../shared/core.js";
import { ratingSchema, type RatingCommand } from "./rating-input.js";
import { readRatingState } from "./rating-state.js";

export async function saveRating(actor: Actor, input: unknown) {
  const req = parse(ratingSchema, input);
  return command(actor, "saveRating", req, async (tx, now) => {
    const state = await readRatingState(actor, req, tx, now);
    return stageRatingOutcome(actor, req, state, tx, now);
  });
}

function stageRatingOutcome(
  actor: Actor,
  req: RatingCommand,
  state: Awaited<ReturnType<typeof readRatingState>>,
  tx: FirebaseFirestore.Transaction,
  now: FirebaseFirestore.Timestamp,
) {
  const {
    studyRef,
    itemRef,
    memoryRef,
    membershipRef,
    planRef,
    eventRef,
    study,
    currentMemory,
    membership,
    planSnapshot,
    place,
    placeRef,
    nextWordId,
    allItems,
    activity,
  } = state;
  let { plan } = state;
  const newlyRemembered =
    req.choice === "REMEMBERED" && !currentMemory.everRemembered;
  const memory = {
    ...currentMemory,
    lastChoice: req.choice,
    lastRatedAt: now,
    version: currentMemory.version + 1,
    ...(newlyRemembered
      ? { everRemembered: true, firstRememberedAt: now }
      : {}),
  };
  const rating = {
    id: req.eventId,
    sessionId: req.sessionId,
    wordId: req.wordId,
    mode: study.mode,
    choice: req.choice,
    savedAt: now,
    dayKey: dayKey(now.toDate()),
    ...(study.mode === "SRS"
      ? { previousLevel: planSnapshot.data()!.level, level: plan!.level }
      : {}),
  };
  if (
    study.mode === "FLASHCARD" &&
    req.choice === "NOT_REMEMBERED" &&
    !membership?.active
  ) {
    const autoSaved = {
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
      now.toDate(),
    );
    tx.set(membershipRef, autoSaved);
    tx.set(planRef, plan);
  } else if (study.mode === "SRS") tx.set(planRef, plan!);
  tx.create(eventRef, rating);
  tx.set(memoryRef, memory);
  tx.update(itemRef, { ratedEventId: req.eventId });
  if (place && placeRef) {
    tx.set(placeRef, place);
    tx.update(studyRef, { placeVersion: place.version });
  }
  stageActivity(tx, activity, study.mode, 1, newlyRemembered ? 1 : 0);
  if (study.source.sourceType === "SYSTEM_DECK")
    tx.set(userRef(actor, "deckActivity", study.source.wordSetId), {
      wordSetId: study.source.wordSetId,
      lastActivityAt: now,
    });
  const completed = allItems.docs.every(
    (s) => s.id === req.wordId || !!s.data().ratedEventId,
  );
  return {
    rating,
    memory,
    ...(plan ? { plan } : {}),
    ...(place ? { place } : {}),
    ...(nextWordId ? { nextWordId } : {}),
    completed,
  };
}
