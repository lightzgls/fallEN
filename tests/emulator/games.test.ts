import { beforeEach, describe, expect, it } from "vitest";
import { db, dayKey, type Data } from "../../functions/src/shared/core.js";
import { gameHandlers } from "../../functions/src/services/game.js";
import {
  businessCode,
  learner,
  read,
  resetData,
  seedData,
  source,
} from "./fixtures.js";

const call = async (name: string, input: Data): Promise<Data> =>
  (await gameHandlers[name](learner, input)) as Data;
const userPath = (suffix: string) => `users/${learner.uid}/${suffix}`;
const ttsConfig = {
  locale: "en-GB",
  engineId: "test.android.tts",
  voiceName: "test-en-gb",
  rate: 1,
};
async function persistedQuestions(
  sessionId: string,
  roundId: string,
): Promise<Data[]> {
  return (
    await db
      .collection(
        userPath(`gameSessions/${sessionId}/rounds/${roundId}/questions`),
      )
      .get()
  ).docs.map((snapshot) => ({ ...snapshot.data(), id: snapshot.id }));
}
beforeEach(async () => {
  await resetData();
  await seedData();
});

describe("immutable game source and server grading", () => {
  it("creates one ACTIVE game and exactly five match questions on concurrent duplicate start", async () => {
    const input = { mode: "MATCH_MEANINGS", source, commandId: "start-match" };
    const [first, retry] = await Promise.all([
      call("startGame", input),
      call("startGame", input),
    ]);
    expect(retry.game.id).toBe(first.game.id);
    const questions = await persistedQuestions(
      first.game.id,
      first.firstRound.id,
    );
    expect(questions).toHaveLength(5);
    expect(new Set(questions.map((question) => question.wordId)).size).toBe(5);
    expect(
      (await read(userPath(`gameSessions/${first.game.id}`)))?.status,
    ).toBe("ACTIVE");
    expect(await read(userPath(`learningDays/${dayKey()}`))).toBeUndefined();
    expect(
      await businessCode(
        call("startGame", { ...input, mode: "LISTEN_AND_TYPE", ttsConfig }),
      ),
    ).toBe("COMMAND_REUSED");
  });

  it("preserves first wrong match after correction, counts only committed attempts and returns receipt on retry", async () => {
    const start = await call("startGame", {
      mode: "MATCH_MEANINGS",
      source,
      commandId: "start-match",
    });
    const questions = await persistedQuestions(
      start.game.id,
      start.firstRound.id,
    );
    const input = {
      sessionId: start.game.id,
      roundId: start.firstRound.id,
      expectedGameVersion: start.game.version,
      commandId: "commit-match",
      finishReason: "COMPLETED",
      firstAnswers: questions.map((question, index) => ({
        answer: {
          questionId: question.id,
          selectedMeaningId:
            questions[index === 0 ? 1 : index].wordCopy.meaningId,
        },
        firstOrder: index + 1,
        hintLevel: 0,
      })),
      completionAnswers: questions.map((question) => ({
        questionId: question.id,
        selectedMeaningId: question.wordCopy.meaningId,
      })),
    };
    const first = await call("saveRound", input);
    expect(first.currentStreak).toBe(4);
    expect(first.bestStreak).toBe(4);
    expect(await call("saveRound", input)).toEqual(first);
    const stored = await persistedQuestions(start.game.id, start.firstRound.id);
    expect(
      stored.find((question) => question.id === questions[0].id)?.firstResult,
    ).toBe("INCORRECT");
    expect((await read(userPath(`learningDays/${dayKey()}`)))?.matchCount).toBe(
      5,
    );
    expect((await db.collection(userPath("wordProgress")).get()).empty).toBe(
      true,
    );
    expect((await db.collection(userPath("srsSchedules")).get()).empty).toBe(
      true,
    );
    const result = await call("endGame", {
      sessionId: start.game.id,
      expectedGameVersion: first.gameVersion,
      commandId: "end-match",
    });
    expect(result).toMatchObject({
      correctCount: 4,
      incorrectCount: 1,
      practicedWordCount: 5,
      accuracy: 80,
    });
  });

  it("never puts two identical selectedMeaningId targets into the same matching round", async () => {
    // Meaning IDs are scoped to a WordVersion in dictionary references. A
    // matching round must nevertheless offer five distinguishable targets.
    await db
      .doc("words/journey/versions/1")
      .update({
        meanings: [
          {
            id: "meaning-book",
            partOfSpeech: "noun",
            text: "Nghĩa hành trình",
          },
        ],
      });
    await db
      .doc("systemDecks/test-deck/revisions/revision-one/words/journey")
      .update({ focusMeaningId: "meaning-book" });
    const start = await call("startGame", {
      mode: "MATCH_MEANINGS",
      source,
      commandId: "start-unambiguous-match",
    });
    const questions = await persistedQuestions(
      start.game.id,
      start.firstRound.id,
    );
    expect(questions).toHaveLength(5);
    expect(
      new Set(questions.map((question) => question.wordCopy.meaningId)).size,
    ).toBe(5);
  });

  it("rejects forged score or discontinuous first-answer order before creating official activity", async () => {
    const start = await call("startGame", {
      mode: "MATCH_MEANINGS",
      source,
      commandId: "start-match",
    });
    const questions = await persistedQuestions(
      start.game.id,
      start.firstRound.id,
    );
    const input = {
      sessionId: start.game.id,
      roundId: start.firstRound.id,
      expectedGameVersion: 1,
      commandId: "invalid-round",
      finishReason: "STOP_AND_SAVE",
      firstAnswers: [
        {
          answer: {
            questionId: questions[0].id,
            selectedMeaningId: questions[0].wordCopy.meaningId,
          },
          firstOrder: 2,
          hintLevel: 0,
        },
      ],
      completionAnswers: [],
    };
    expect(await businessCode(call("saveRound", input))).toBe(
      "VALIDATION_FAILED",
    );
    expect(
      await businessCode(
        call("saveRound", { ...input, firstAnswers: [], score: 100 }),
      ),
    ).toBe("VALIDATION_FAILED");
    expect(await read(userPath(`learningDays/${dayKey()}`))).toBeUndefined();
  });

  it("pins source WordVersions so a later dictionary edit does not alter an existing question", async () => {
    const start = await call("startGame", {
      mode: "LISTEN_AND_TYPE",
      source,
      ttsConfig,
      commandId: "start-listen",
    });
    const [question] = await persistedQuestions(
      start.game.id,
      start.firstRound.id,
    );
    const oldCopy = question.wordCopy;
    await db
      .doc(`words/${question.wordId}/versions/2`)
      .set({
        wordId: question.wordId,
        version: 2,
        spelling: "changed-spelling",
        meanings: [{ id: "changed", text: "Nghĩa mới", partOfSpeech: "noun" }],
        otherSpellings: [],
      });
    await db
      .doc("dictionaryReleases/new-current-release")
      .set({ state: "PUBLISHED" });
    await db
      .doc(`dictionaryReleases/new-current-release/entries/${question.wordId}`)
      .set({
        wordId: question.wordId,
        wordVersion: 2,
        active: true,
        spelling: "changed-spelling",
        searchKey: "changed-spelling",
      });
    await db
      .doc("config/dictionary")
      .update({ activeReleaseId: "new-current-release", version: 2 });
    expect(
      (await persistedQuestions(start.game.id, start.firstRound.id))[0]
        .wordCopy,
    ).toEqual(oldCopy);
    const committed = await call("saveRound", {
      sessionId: start.game.id,
      roundId: start.firstRound.id,
      expectedGameVersion: 1,
      commandId: "commit-pinned",
      finishReason: "COMPLETED",
      firstAnswers: [
        {
          answer: {
            questionId: question.id,
            typedAnswer: `  ${oldCopy.spelling.toUpperCase()}  `,
          },
          firstOrder: 1,
          hintLevel: 0,
        },
      ],
      completionAnswers: [
        { questionId: question.id, typedAnswer: oldCopy.spelling },
      ],
    });
    expect(committed.currentStreak).toBe(1);
  });
});

describe("listening skip and cancellation boundaries", () => {
  it("requires actual client TTS configuration before starting", async () => {
    expect(
      await businessCode(
        call("startGame", {
          mode: "LISTEN_AND_TYPE",
          source,
          commandId: "without-voice",
        }),
      ),
    ).toBe("TTS_UNAVAILABLE");
    expect((await db.collection(userPath("gameSessions")).get()).empty).toBe(
      true,
    );
  });

  it("skip before first check breaks game streak without creating a StudyDay", async () => {
    const start = await call("startGame", {
      mode: "LISTEN_AND_TYPE",
      source,
      ttsConfig,
      commandId: "start-listen",
    });
    const skipped = await call("saveRound", {
      sessionId: start.game.id,
      roundId: start.firstRound.id,
      expectedGameVersion: 1,
      commandId: "skip",
      finishReason: "SKIPPED",
      firstAnswers: [],
      completionAnswers: [],
    });
    expect(skipped.currentStreak).toBe(0);
    expect(
      (await persistedQuestions(start.game.id, start.firstRound.id))[0]
        .firstResult,
    ).toBe("UNANSWERED");
    expect(await read(userPath(`learningDays/${dayKey()}`))).toBeUndefined();
    expect((await db.collection(userPath("wordProgress")).get()).empty).toBe(
      true,
    );
  });

  it("canceling the active listening round retains prior committed results only", async () => {
    const start = await call("startGame", {
      mode: "LISTEN_AND_TYPE",
      source,
      ttsConfig,
      commandId: "start-listen",
    });
    const [question] = await persistedQuestions(
      start.game.id,
      start.firstRound.id,
    );
    const first = await call("saveRound", {
      sessionId: start.game.id,
      roundId: start.firstRound.id,
      expectedGameVersion: 1,
      commandId: "complete-one",
      finishReason: "COMPLETED",
      firstAnswers: [
        {
          answer: {
            questionId: question.id,
            typedAnswer: question.wordCopy.spelling,
          },
          firstOrder: 1,
          hintLevel: 0,
        },
      ],
      completionAnswers: [
        { questionId: question.id, typedAnswer: question.wordCopy.spelling },
      ],
    });
    const next = await call("createRound", {
      sessionId: start.game.id,
      expectedGameVersion: first.gameVersion,
      commandId: "next-round",
      ttsConfig,
    });
    const ended = await call("endGame", {
      sessionId: start.game.id,
      expectedGameVersion: next.gameVersion,
      commandId: "cancel-listen",
      cancelledRoundId: next.round.id,
    });
    expect(ended).toMatchObject({
      correctCount: 1,
      incorrectCount: 0,
      practicedWordCount: 1,
      bestStreak: 1,
    });
    expect(
      (
        await read(
          userPath(`gameSessions/${start.game.id}/rounds/${next.round.id}`),
        )
      )?.status,
    ).toBe("CANCELLED");
    expect(
      (await read(userPath(`learningDays/${dayKey()}`)))?.listenCount,
    ).toBe(1);
  });
});
