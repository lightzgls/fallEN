import { reviewDays, reviewLevel, sourceKey } from "../../domain/values.js";
import { readActivity } from "../../infrastructure/learning/activity.js";
import { userRef } from "../../infrastructure/learning/refs.js";
import {
  addDays,
  checkVersion,
  dayKey,
  db,
  fail,
  requireDoc,
  type Actor,
  type Data,
} from "../../shared/core.js";
import { resolveRelease } from "../dictionary.js";
import { type RatingCommand } from "./rating-input.js";

/** All reads and version/eligibility checks complete before any result is staged. */
export async function readRatingState(
  actor: Actor,
  req: RatingCommand,
  tx: FirebaseFirestore.Transaction,
  now: FirebaseFirestore.Timestamp,
) {
  const studyRef = userRef(actor, "studySessions", req.sessionId);
  const itemRef = db.doc(
    `users/${actor.uid}/studySessions/${req.sessionId}/items/${req.wordId}`,
  );
  const memoryRef = userRef(actor, "wordProgress", req.wordId);
  const membershipRef = userRef(actor, "personalWords", req.wordId);
  const planRef = userRef(actor, "srsSchedules", req.wordId);
  const eventRef = userRef(actor, "assessmentEvents", req.eventId);
  const [
    studySnapshot,
    itemSnapshot,
    memorySnapshot,
    membershipSnapshot,
    planSnapshot,
    eventSnapshot,
  ] = await tx.getAll(
    studyRef,
    itemRef,
    memoryRef,
    membershipRef,
    planRef,
    eventRef,
  );
  const study = requireDoc(studySnapshot);
  const item = requireDoc(itemSnapshot);
  if (study.status !== "ACTIVE")
    fail("CONFLICT", "Study session is not active");
  if (eventSnapshot.exists || item.ratedEventId)
    fail("CONFLICT", "This card has already been rated");
  const currentMemory = memorySnapshot.data() ?? {
    wordId: req.wordId,
    version: 0,
    everRemembered: false,
  };
  checkVersion(currentMemory.version, req.expectedMemoryVersion);
  const membership = membershipSnapshot.data();
  let plan = planSnapshot.data();
  let place: Data | undefined;
  let placeRef: FirebaseFirestore.DocumentReference | undefined;
  let nextWordId: string | undefined;
  const allItems = await tx.get(
    studyRef.collection("items").orderBy("position"),
  );
  if (study.mode === "FLASHCARD") {
    placeRef = userRef(actor, "flashcardPositions", sourceKey(study.source));
    place = requireDoc(await tx.get(placeRef));
    if (req.expectedPlaceVersion === undefined)
      fail("VALIDATION_FAILED", "Flashcard rating needs place version");
    checkVersion(place.version, req.expectedPlaceVersion!);
    if (place.nextWordId !== req.wordId)
      fail("CONFLICT", "This card is not the current study position");
    nextWordId = allItems.docs.find(
      (s) => s.data().position > item.position,
    )?.id;
    place = {
      ...place,
      ...(nextWordId ? { nextWordId } : { nextWordId: null }),
      completed: !nextWordId,
      updatedAt: now,
      version: place.version + 1,
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
    checkVersion(plan.version, req.expectedPlanVersion!);
    checkVersion(membership.membershipVersion, req.membershipVersion!);
    if (
      plan.cycleId !== req.cycleId ||
      plan.cycleId !== item.cycleId ||
      plan.dueDate > dayKey(now.toDate())
    )
      fail("CONFLICT", "Review schedule has changed or is not due");
    const release = await resolveRelease(undefined, tx);
    const activeEntry = (
      await tx.get(
        db.doc(`dictionaryReleases/${release.id}/entries/${req.wordId}`),
      )
    ).data();
    if (!activeEntry?.active)
      fail("WORD_UNAVAILABLE", "This word is no longer available");
    const level = reviewLevel(plan.level, req.choice === "REMEMBERED");
    plan = {
      ...plan,
      level,
      dueDate: addDays(dayKey(now.toDate()), reviewDays[level - 1]),
      version: plan.version + 1,
    };
  } else fail("VALIDATION_FAILED", "Unknown study mode");
  if (
    study.mode === "FLASHCARD" &&
    req.choice === "NOT_REMEMBERED" &&
    !membership?.active
  ) {
    const release = await resolveRelease(undefined, tx);
    const activeEntry = (
      await tx.get(
        db.doc(`dictionaryReleases/${release.id}/entries/${req.wordId}`),
      )
    ).data();
    if (!activeEntry?.active) fail("WORD_UNAVAILABLE");
  }
  const activity = await readActivity(tx, actor.uid, now);

  return {
    studyRef,
    itemRef,
    memoryRef,
    membershipRef,
    planRef,
    eventRef,
    study,
    item,
    currentMemory,
    membership,
    plan,
    planSnapshot,
    place,
    placeRef,
    nextWordId,
    allItems,
    activity,
  };
}
