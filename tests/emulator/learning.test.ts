import { beforeEach, describe, expect, it } from "vitest";
import {
  db,
  dayKey,
  addDays,
  type Data,
} from "../../functions/src/shared/core.js";
import { learningHandlers } from "../../functions/src/services/learning.js";
import {
  businessCode,
  learner,
  otherLearner,
  read,
  resetData,
  seedData,
  source,
} from "./fixtures.js";

const call = async (
  name: string,
  input: Data = {},
  actor = learner,
): Promise<Data> => (await learningHandlers[name](actor, input)) as Data;
const userPath = (suffix: string) => `users/${learner.uid}/${suffix}`;
beforeEach(async () => {
  await resetData();
  await seedData();
});

describe("one personal vocabulary and SRS lifecycle", () => {
  it("deduplicates save sources without resetting the active schedule and creates a fresh cycle only after deletion", async () => {
    const first = await call("saveWord", {
      wordId: "book",
      source: "DICTIONARY",
      commandId: "save-initial",
    });
    expect(first.plan).toMatchObject({
      level: 1,
      dueDate: addDays(dayKey(), 1),
      version: 1,
    });
    const duplicate = await call("saveWord", {
      wordId: "book",
      source: "EXTERNAL_LOOKUP",
      commandId: "save-duplicate",
    });
    expect(duplicate.plan).toEqual(first.plan);
    expect(duplicate.savedWord.source).toBe("DICTIONARY");
    await db
      .doc(userPath("wordProgress/book"))
      .set({
        wordId: "book",
        version: 3,
        everRemembered: true,
        lastChoice: "NOT_REMEMBERED",
      });
    const removed = await call("removeWord", {
      wordId: "book",
      expectedMembershipVersion: 1,
      commandId: "remove-book",
    });
    expect(removed.savedWord).toMatchObject({
      active: false,
      membershipVersion: 2,
    });
    expect(await read(userPath("srsSchedules/book"))).toBeUndefined();
    const restored = await call("saveWord", {
      wordId: "book",
      source: "SHARE",
      expectedMembershipVersion: 2,
      commandId: "restore-book",
    });
    expect(restored.plan).toMatchObject({
      level: 1,
      dueDate: addDays(dayKey(), 1),
    });
    expect(restored.plan.cycleId).not.toBe(first.plan.cycleId);
    expect(restored.savedWord.membershipVersion).toBe(3);
    expect(await read(userPath("wordProgress/book"))).toMatchObject({
      version: 3,
      everRemembered: true,
    });
    expect(await read(userPath(`learningDays/${dayKey()}`))).toBeUndefined();
  });

  it("rejects a stale membership delete and rejects spoofed UID/score fields", async () => {
    await call("saveWord", {
      wordId: "book",
      source: "DICTIONARY",
      commandId: "save-book",
    });
    expect(
      await businessCode(
        call("removeWord", {
          wordId: "book",
          expectedMembershipVersion: 0,
          commandId: "stale-delete",
        }),
      ),
    ).toBe("CONFLICT");
    expect(
      await businessCode(
        call("saveWord", {
          wordId: "journey",
          source: "DICTIONARY",
          commandId: "spoof",
          uid: otherLearner.uid,
        }),
      ),
    ).toBe("VALIDATION_FAILED");
    expect(
      await businessCode(
        call("saveWord", {
          wordId: "journey",
          source: "DICTIONARY",
          commandId: "spoof-score",
          score: 100,
        }),
      ),
    ).toBe("VALIDATION_FAILED");
  });

  it("filters due words using current membership and availability rather than raw schedule count", async () => {
    for (const wordId of ["book", "journey", "reservation"]) {
      await call("saveWord", {
        wordId,
        source: "DICTIONARY",
        commandId: `save-${wordId}`,
      });
      await db
        .doc(userPath(`srsSchedules/${wordId}`))
        .update({ dueDate: dayKey() });
    }
    await db.doc(userPath("personalWords/journey")).update({ active: false });
    await db
      .doc("dictionaryReleases/test-release/entries/reservation")
      .update({ active: false });
    const due = await call("getDueWords");
    expect(due.count).toBe(1);
    expect(due.items.map((item: Data) => item.wordId)).toEqual(["book"]);
    expect((await call("getDashboard")).dueCount).toBe(1);
  });

  it("skips a missing current dictionary entry while preserving an unavailable saved-word row", async () => {
    await call("saveWord", {
      wordId: "book",
      source: "DICTIONARY",
      commandId: "save-book",
    });
    await db.doc(userPath("srsSchedules/book")).update({ dueDate: dayKey() });
    await db.doc("dictionaryReleases/test-release/entries/book").delete();
    expect((await call("getDueWords")).count).toBe(0);
    const saved = await call("getSavedWords");
    expect(saved.items).toHaveLength(1);
    expect(saved.items[0]).toMatchObject({ wordId: "book", available: false });
  });

  it("cannot newly save a discontinued word through a retained old release", async () => {
    await db
      .doc("dictionaryReleases/retained-release")
      .set({ state: "RETIRED" });
    await db
      .doc("dictionaryReleases/retained-release/entries/book")
      .set({
        wordId: "book",
        wordVersion: 1,
        active: true,
        spelling: "book",
        searchKey: "book",
      });
    await db
      .doc("dictionaryReleases/test-release/entries/book")
      .update({ active: false });
    expect(
      await businessCode(
        call("saveWord", {
          wordId: "book",
          source: "DICTIONARY",
          releaseId: "retained-release",
          commandId: "save-old-release",
        }),
      ),
    ).toBe("WORD_UNAVAILABLE");
    expect(await read(userPath("personalWords/book"))).toBeUndefined();
  });

  it("does not let an old SRS session recreate a deleted and re-added cycle", async () => {
    const saved = await call("saveWord", {
      wordId: "book",
      source: "DICTIONARY",
      commandId: "save-book",
    });
    await db.doc(userPath("srsSchedules/book")).update({ dueDate: dayKey() });
    const study = await call("startReview", { commandId: "start-review" });
    await call("removeWord", {
      wordId: "book",
      expectedMembershipVersion: 1,
      commandId: "remove-book",
    });
    const fresh = await call("saveWord", {
      wordId: "book",
      source: "DICTIONARY",
      commandId: "resave-book",
    });
    const code = await businessCode(
      call("saveRating", {
        sessionId: study.id,
        wordId: "book",
        choice: "REMEMBERED",
        eventId: "stale-rating",
        expectedMemoryVersion: 0,
        expectedPlanVersion: 1,
        cycleId: saved.plan.cycleId,
        membershipVersion: 1,
      }),
    );
    expect(code).toBe("CONFLICT");
    expect((await read(userPath("srsSchedules/book")))?.cycleId).toBe(
      fresh.plan.cycleId,
    );
    expect(await read(userPath("wordProgress/book"))).toBeUndefined();
    expect(await read(userPath(`learningDays/${dayKey()}`))).toBeUndefined();
  });
});

describe("official ratings and derived statistics", () => {
  it("records one official rating on retry, REMEMBERED does not auto-save, and later forgetting preserves lifetime learning", async () => {
    const study = await call("startStudy", {
      source,
      startMode: "START_OVER",
      commandId: "flashcard-one",
    });
    const rating = {
      sessionId: study.id,
      wordId: "book",
      choice: "REMEMBERED",
      eventId: "remember-book",
      expectedMemoryVersion: 0,
      expectedPlaceVersion: study.placeVersion,
    };
    const first = await call("saveRating", rating);
    expect(await call("saveRating", rating)).toEqual(first);
    expect(await read(userPath("personalWords/book"))).toBeUndefined();
    expect(await read(userPath("srsSchedules/book"))).toBeUndefined();
    expect((await read(userPath(`learningDays/${dayKey()}`)))?.totalCount).toBe(
      1,
    );
    const second = await call("startStudy", {
      source,
      startMode: "FROM_WORD",
      startWordId: "book",
      commandId: "flashcard-two",
    });
    const forgot = await call("saveRating", {
      sessionId: second.id,
      wordId: "book",
      choice: "NOT_REMEMBERED",
      eventId: "forget-book",
      expectedMemoryVersion: 1,
      expectedPlaceVersion: second.placeVersion,
    });
    expect(forgot.memory).toMatchObject({
      lastChoice: "NOT_REMEMBERED",
      everRemembered: true,
      version: 2,
    });
    expect(forgot.memory.firstRememberedAt).toEqual(
      first.memory.firstRememberedAt,
    );
    expect(await read(userPath("personalWords/book"))).toMatchObject({
      active: true,
      source: "FLASHCARD",
      sourceWordSetId: source.wordSetId,
    });
    const stats = await call("getStats");
    expect(stats).toMatchObject({
      learnedCount: 1,
      studyStreak: 1,
      asOfDay: dayKey(),
    });
    expect(
      (await call("getChart", { from: dayKey(), to: dayKey() })).items[0]
        .learnedCount,
    ).toBe(1);
    expect(
      (await read(userPath(`learningDays/${dayKey()}`)))?.flashcardCount,
    ).toBe(2);
  });

  it("keeps an existing schedule when a flashcard is marked NOT_REMEMBERED", async () => {
    const saved = await call("saveWord", {
      wordId: "book",
      source: "DICTIONARY",
      commandId: "save-book",
    });
    const study = await call("startStudy", {
      source,
      startMode: "START_OVER",
      commandId: "start",
    });
    await call("saveRating", {
      sessionId: study.id,
      wordId: "book",
      choice: "NOT_REMEMBERED",
      eventId: "forget",
      expectedMemoryVersion: 0,
      expectedPlaceVersion: study.placeVersion,
    });
    expect(await read(userPath("srsSchedules/book"))).toEqual(saved.plan);
  });

  it("allows only one device to advance the current bookmark", async () => {
    const old = await call("startStudy", {
      source,
      startMode: "START_OVER",
      commandId: "device-old",
    });
    const current = await call("startStudy", {
      source,
      startMode: "START_OVER",
      commandId: "device-new",
    });
    expect(
      await businessCode(
        call("saveRating", {
          sessionId: old.id,
          wordId: "book",
          choice: "REMEMBERED",
          eventId: "old-rating",
          expectedMemoryVersion: 0,
          expectedPlaceVersion: old.placeVersion,
        }),
      ),
    ).toBe("CONFLICT");
    await call("saveRating", {
      sessionId: current.id,
      wordId: "book",
      choice: "REMEMBERED",
      eventId: "current-rating",
      expectedMemoryVersion: 0,
      expectedPlaceVersion: current.placeVersion,
    });
    expect((await read(userPath(`learningDays/${dayKey()}`)))?.totalCount).toBe(
      1,
    );
    expect(
      await businessCode(
        call(
          "getRatingContext",
          { sessionId: current.id, wordId: "book" },
          otherLearner,
        ),
      ),
    ).toBe("NOT_FOUND");
  });

  it("advances a due SRS level with current versions and counts only its committed rating", async () => {
    const saved = await call("saveWord", {
      wordId: "book",
      source: "DICTIONARY",
      commandId: "save-book",
    });
    await db.doc(userPath("srsSchedules/book")).update({ dueDate: dayKey() });
    const study = await call("startReview", { commandId: "start-review" });
    const rating = {
      sessionId: study.id,
      wordId: "book",
      choice: "REMEMBERED",
      eventId: "srs-rating",
      expectedMemoryVersion: 0,
      expectedPlanVersion: 1,
      cycleId: saved.plan.cycleId,
      membershipVersion: 1,
    };
    const first = await call("saveRating", rating);
    expect(first.plan).toMatchObject({
      level: 2,
      dueDate: addDays(dayKey(), 3),
      version: 2,
    });
    expect(await call("saveRating", rating)).toEqual(first);
    expect((await read(userPath(`learningDays/${dayKey()}`)))?.srsCount).toBe(
      1,
    );
    expect((await call("getDueWords")).count).toBe(0);
  });
});
