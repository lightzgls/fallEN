import { describe, it, expect, vi } from "vitest";
import type {
  GameResultContext,
  GameResultStore,
} from "../../functions/src/contracts/game/store.js";
import type {
  Game,
  Round,
  Question,
} from "../../functions/src/contracts/game/records.js";
import { endGame } from "../../functions/src/services/game/results.js";
const actor = { uid: "learner", contentAdmin: false, authTime: 0 },
  now = new Date("2026-11-04T12:00:00Z");
const game: Game = {
  id: "game",
  mode: "LISTEN_AND_TYPE",
  source: { sourceType: "PERSONAL_VOCABULARY" },
  status: "ACTIVE",
  currentStreak: 2,
  bestStreak: 2,
  version: 3,
  nextRoundOrder: 3,
  sourceCount: 2,
  sourceHash: "hash",
  commandId: "start",
  createdAt: now,
  currentRoundId: "round-two",
};
const previous: Round = {
  id: "round-one",
  sessionId: "game",
  order: 1,
  status: "COMMITTED",
  wordIds: ["book"],
  createdAt: now,
};
const active: Round = {
  id: "round-two",
  sessionId: "game",
  order: 2,
  status: "ACTIVE",
  wordIds: ["journey"],
  createdAt: now,
};
const question: Question = {
  id: "q1",
  wordId: "book",
  wordVersion: 1,
  hintLevel: 0,
  firstResult: "CORRECT",
  wordCopy: {
    wordId: "book",
    version: 1,
    spelling: "book",
    otherSpellings: [],
    meaningId: "book-meaning",
    meaning: "Sách",
    partOfSpeech: "noun",
  },
};
function fixture(current: Game = game) {
  const ctx: GameResultContext = {
    game: vi.fn<GameResultContext["game"]>().mockResolvedValue(current),
    rounds: vi
      .fn<GameResultContext["rounds"]>()
      .mockResolvedValue([previous, active]),
    questions: vi
      .fn<GameResultContext["questions"]>()
      .mockResolvedValue([question]),
    saveRound: vi.fn<GameResultContext["saveRound"]>(),
    saveGame: vi.fn<GameResultContext["saveGame"]>(),
  };
  const store: GameResultStore = {
    command: (_actor, _kind, _input, execute) => execute(ctx, now),
  };
  return { ctx, store };
}
describe("game completion decisions through injected ports", () => {
  it("cancels only the named active listening round and summarizes committed questions", async () => {
    const { ctx, store } = fixture();
    const result = await endGame(store, actor, {
      sessionId: "game",
      expectedGameVersion: 3,
      commandId: "end",
      cancelledRoundId: "round-two",
    });
    expect(result).toMatchObject({
      correctCount: 1,
      incorrectCount: 0,
      practicedWordCount: 1,
      bestStreak: 2,
      gameVersion: 4,
    });
    expect(ctx.questions).toHaveBeenCalledExactlyOnceWith("game", "round-one");
    expect(ctx.saveRound).toHaveBeenCalledWith({
      ...active,
      status: "CANCELLED",
      savedAt: now,
    });
  });
  it("requires a match round to be committed before ending the game", async () => {
    const { ctx, store } = fixture({ ...game, mode: "MATCH_MEANINGS" });
    await expect(
      endGame(store, actor, {
        sessionId: "game",
        expectedGameVersion: 3,
        commandId: "end",
      }),
    ).rejects.toMatchObject({ details: { code: "CONFLICT" } });
    expect(ctx.saveRound).not.toHaveBeenCalled();
    expect(ctx.saveGame).not.toHaveBeenCalled();
  });
  it("rejects a stale game version before loading or saving any rounds", async () => {
    const { ctx, store } = fixture();
    await expect(
      endGame(store, actor, {
        sessionId: "game",
        expectedGameVersion: 2,
        commandId: "end",
      }),
    ).rejects.toMatchObject({ details: { code: "CONFLICT" } });
    expect(ctx.rounds).not.toHaveBeenCalled();
    expect(ctx.saveGame).not.toHaveBeenCalled();
  });
});
