import {
  FieldPath,
  Timestamp,
  type Transaction,
} from "firebase-admin/firestore";
import { z } from "zod";
import {
  db,
  command,
  assertActive,
  parse,
  fail,
  requireDoc,
  checkVersion,
  dayKey,
  addDays,
  type Actor,
  type Data,
} from "../shared/core.js";
import {
  readWord,
  readDeckSource,
  readPersonalSource,
  resolveRelease,
} from "./dictionary.js";
import {
  empty,
  objectId,
  version,
  sourceSchema,
  sourceKey,
  stableId,
  reviewDays,
  reviewLevel,
  currentStreak,
  type Source,
} from "../domain/backend.js";
import {
  readActivity,
  stageActivity,
} from "../infrastructure/learning-activity.js";

const wordCommand = z.object({ wordId: objectId, commandId: objectId });
const userRef = (actor: Actor, collection: string, document: string) =>
  db.doc(`users/${actor.uid}/${collection}/${document}`);
const dataWithId = (snapshot: FirebaseFirestore.DocumentSnapshot) => ({
  ...snapshot.data(),
  id: snapshot.id,
});
const fromTimestamp = (value: unknown): Date => {
  if (value instanceof Timestamp) return value.toDate();
  if (typeof value === "string" && !Number.isNaN(Date.parse(value)))
    return new Date(value);
  return fail("INVALID_DATA", "Expected a saved timestamp");
};

async function sourceWords(actor: Actor, source: Source, tx?: Transaction) {
  return source.sourceType === "SYSTEM_DECK"
    ? readDeckSource(source, tx)
    : readPersonalSource(actor, tx);
}
async function dueWords(actor: Actor, tx?: Transaction) {
  const release = await resolveRelease(undefined, tx);
  const query = db
    .collection(`users/${actor.uid}/srsSchedules`)
    .where("dueDate", "<=", dayKey())
    .orderBy("dueDate")
    .orderBy(FieldPath.documentId());
  const schedules = tx ? await tx.get(query) : await query.get();
  const words: Data[] = [];
  for (const snapshot of schedules.docs) {
    const membershipRef = userRef(actor, "personalWords", snapshot.id);
    const membership = tx
      ? await tx.get(membershipRef)
      : await membershipRef.get();
    if (!membership.data()?.active) continue;
    const entryRef = db.doc(
      `dictionaryReleases/${release.id}/entries/${snapshot.id}`,
    );
    const entry = (await (tx ? tx.get(entryRef) : entryRef.get())).data();
    if (!entry?.active) continue;
    const word = await readWord(snapshot.id, release.id, tx);
    words.push({
      wordId: snapshot.id,
      word,
      plan: snapshot.data(),
      membershipVersion: membership.data()!.membershipVersion,
    });
  }
  return words;
}
function newPlan(wordId: string, cycleId: string, now: Timestamp) {
  return {
    wordId,
    cycleId,
    level: 1,
    dueDate: addDays(dayKey(now.toDate()), 1),
    version: 1,
  };
}
const saveWordSchema = wordCommand
  .extend({
    source: z.enum(["DICTIONARY", "FLASHCARD", "EXTERNAL_LOOKUP", "SHARE"]),
    expectedMembershipVersion: version.optional(),
    studyId: objectId.optional(),
    releaseId: objectId.optional(),
  })
  .strict();
async function saveWord(actor: Actor, input: unknown) {
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
      now,
    );
    tx.set(ref, savedWord);
    tx.set(planRef, plan);
    return { savedWord, plan };
  });
}
async function removeWord(actor: Actor, input: unknown) {
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

const startStudySchema = z
  .object({
    source: sourceSchema,
    startMode: z.enum(["START_OVER", "CONTINUE", "FROM_WORD"]),
    startWordId: objectId.optional(),
    commandId: objectId,
  })
  .strict();
async function startStudy(actor: Actor, input: unknown) {
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
async function startReview(actor: Actor, input: unknown) {
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

const ratingSchema = z
  .object({
    sessionId: objectId,
    wordId: objectId,
    choice: z.enum(["REMEMBERED", "NOT_REMEMBERED"]),
    eventId: objectId,
    expectedMemoryVersion: version,
    expectedPlaceVersion: version.optional(),
    expectedPlanVersion: version.optional(),
    cycleId: objectId.optional(),
    membershipVersion: version.optional(),
  })
  .strict();
async function saveRating(actor: Actor, input: unknown) {
  const req = parse(ratingSchema, input);
  return command(actor, "saveRating", req, async (tx, now) => {
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
        now,
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
  });
}
async function endStudy(actor: Actor, input: unknown) {
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

export const learningHandlers: Record<
  string,
  (actor: Actor, input: unknown) => Promise<unknown>
> = {
  saveWord,
  removeWord,
  startStudy,
  startReview,
  saveRating,
  endStudy,
  async getSavedWords(actor, input) {
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
  },
  async getSavedWordCount(actor, input) {
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
  },
  async getDueWords(actor, input) {
    parse(empty, input);
    await assertActive(actor);
    const items = await dueWords(actor);
    return {
      items,
      count: items.length,
      asOfDay: dayKey(),
      fetchedAt: Timestamp.now(),
    };
  },
  async getStudySource(actor, input) {
    const req = parse(z.object({ source: sourceSchema }).strict(), input);
    await assertActive(actor);
    const result = await sourceWords(actor, req.source);
    const bookmark = (
      await userRef(actor, "flashcardPositions", sourceKey(req.source)).get()
    ).data();
    return {
      ...result,
      wordRefs: result.words.map((w: Data) => ({
        wordId: w.wordId,
        wordVersion: w.wordVersion,
      })),
      ...(bookmark ? { bookmark } : {}),
    };
  },
  async getStudyPlace(actor, input) {
    const req = parse(z.object({ source: sourceSchema }).strict(), input);
    await assertActive(actor);
    return (
      (
        await userRef(actor, "flashcardPositions", sourceKey(req.source)).get()
      ).data() ?? null
    );
  },
  async getRatingContext(actor, input) {
    const req = parse(
      z.object({ sessionId: objectId, wordId: objectId }).strict(),
      input,
    );
    await assertActive(actor);
    const study = requireDoc(
      await userRef(actor, "studySessions", req.sessionId).get(),
    );
    requireDoc(
      await db
        .doc(
          `users/${actor.uid}/studySessions/${req.sessionId}/items/${req.wordId}`,
        )
        .get(),
    );
    const memory = (
      await userRef(actor, "wordProgress", req.wordId).get()
    ).data();
    if (study.mode === "FLASHCARD") {
      const place = requireDoc(
        await userRef(
          actor,
          "flashcardPositions",
          sourceKey(study.source),
        ).get(),
      );
      return {
        memoryVersion: memory?.version ?? 0,
        placeVersion: place.version,
      };
    }
    const plan = requireDoc(
      await userRef(actor, "srsSchedules", req.wordId).get(),
    );
    const membership = requireDoc(
      await userRef(actor, "personalWords", req.wordId).get(),
    );
    return {
      memoryVersion: memory?.version ?? 0,
      planVersion: plan.version,
      cycleId: plan.cycleId,
      membershipVersion: membership.membershipVersion,
    };
  },
  async getStats(actor, input) {
    parse(empty, input);
    await assertActive(actor);
    return statsRead(actor);
  },
  async getDashboard(actor, input) {
    parse(empty, input);
    await assertActive(actor);
    const [stats, due, today, recent] = await Promise.all([
      statsRead(actor),
      dueWords(actor),
      userRef(actor, "learningDays", dayKey()).get(),
      db
        .collection(`users/${actor.uid}/deckActivity`)
        .orderBy("lastActivityAt", "desc")
        .limit(10)
        .get(),
    ]);
    return {
      ...stats,
      dueCount: due.length,
      today: today.data() ?? null,
      recentSets: recent.docs.map(dataWithId),
    };
  },
  async getLearningDays(actor, input) {
    const req = parse(dateRangeSchema, input);
    await assertActive(actor);
    return { items: await learningDays(actor, req.from, req.to) };
  },
  async getHeatmap(actor, input) {
    const req = parse(dateRangeSchema, input);
    await assertActive(actor);
    const days = new Map(
      (await learningDays(actor, req.from, req.to)).map((d) => [d.dayKey, d]),
    );
    const items = [];
    for (let d = req.from; d <= req.to; d = addDays(d, 1))
      items.push({
        dayKey: d,
        totalCount: days.get(d)?.totalCount ?? 0,
        intensity: Math.min(4, Math.ceil((days.get(d)?.totalCount ?? 0) / 5)),
      });
    return { items };
  },
  async getDayActivity(actor, input) {
    const req = parse(z.object({ dayKey: isoDay }).strict(), input);
    await assertActive(actor);
    return (
      (await userRef(actor, "learningDays", req.dayKey).get()).data() ?? null
    );
  },
  async getChart(actor, input) {
    const req = parse(dateRangeSchema, input);
    await assertActive(actor);
    const words = await db
      .collection(`users/${actor.uid}/wordProgress`)
      .where("everRemembered", "==", true)
      .get();
    const counts = new Map<string, number>();
    let cumulative = 0;
    for (const word of words.docs) {
      const d = dayKey(fromTimestamp(word.data().firstRememberedAt));
      if (d < req.from) cumulative++;
      else counts.set(d, (counts.get(d) ?? 0) + 1);
    }
    const items = [];
    for (let d = req.from; d <= req.to; d = addDays(d, 1)) {
      cumulative += counts.get(d) ?? 0;
      items.push({ dayKey: d, learnedCount: cumulative });
    }
    return { items };
  },
  async getRecentSets(actor, input) {
    const req = parse(
      z.object({ cursor: z.string().max(1024).optional() }).strict(),
      input,
    );
    await assertActive(actor);
    let query = db
      .collection(`users/${actor.uid}/deckActivity`)
      .orderBy("lastActivityAt", "desc")
      .orderBy(FieldPath.documentId(), "desc");
    if (req.cursor) {
      const cursor = decodeCursor(req.cursor, actor.uid, "recent");
      query = query.startAfter(Timestamp.fromMillis(cursor.time), cursor.id);
    }
    const snapshots = await query.limit(21).get();
    const items = snapshots.docs.slice(0, 20).map(dataWithId);
    const last = snapshots.docs[19];
    return {
      items,
      ...(snapshots.size > 20
        ? {
            cursor: encodeCursor({
              uid: actor.uid,
              kind: "recent",
              time: last.data().lastActivityAt.toMillis(),
              id: last.id,
            }),
          }
        : {}),
    };
  },
};
const isoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (value) =>
      !Number.isNaN(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value,
    "Invalid date",
  );
const dateRangeSchema = z
  .object({ from: isoDay, to: isoDay })
  .strict()
  .refine(
    (v) =>
      v.from <= v.to &&
      (Date.parse(v.to) - Date.parse(v.from)) / 86400000 <= 365,
    "Date range must be at most 366 days",
  );
async function learningDays(
  actor: Actor,
  from: string,
  to: string,
): Promise<Data[]> {
  return (
    await db
      .collection(`users/${actor.uid}/learningDays`)
      .where("dayKey", ">=", from)
      .where("dayKey", "<=", to)
      .orderBy("dayKey")
      .get()
  ).docs.map((s) => s.data());
}
async function statsRead(actor: Actor) {
  const summary = (
    await userRef(actor, "dashboard", "summary").get()
  ).data() ?? {
    learnedCount: 0,
    matchBest: 0,
    listenBest: 0,
    streakAtLastStudyDay: 0,
  };
  return {
    ...summary,
    studyStreak: currentStreak(summary, dayKey()),
    asOfDay: dayKey(),
    fetchedAt: Timestamp.now(),
  };
}
function encodeCursor(value: Data) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}
function decodeCursor(
  value: string,
  uid: string,
  kind: string,
): { time: number; id: string } {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString());
    if (
      parsed.uid !== uid ||
      parsed.kind !== kind ||
      !Number.isFinite(parsed.time) ||
      !objectId.safeParse(parsed.id).success
    )
      throw Error();
    return parsed;
  } catch {
    return fail("VALIDATION_FAILED", "Cursor does not match this request");
  }
}
